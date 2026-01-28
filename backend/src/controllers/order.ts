import { NextFunction, Request, Response } from 'express';
import { FilterQuery, Error as MongooseError, Types } from 'mongoose';
import BadRequestError from '../errors/bad-request-error';
import NotFoundError from '../errors/not-found-error';
import Order, { IOrder } from '../models/order';
import Product, { IProduct } from '../models/product';
import User from '../models/user';
import escapeRegExp from '../utils/escapeRegExp';

export const getOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Проверка роли (только для админов)
    if (res.locals.user.role !== 'admin') {
      return next(new ForbiddenError('Доступ только для админов'));
    }

    const {
      page = 1,
      limit = 10,
      sortField = 'createdAt',
      sortOrder = 'desc',
      status,
      totalAmountFrom,
      totalAmountTo,
      orderDateFrom,
      orderDateTo,
      search,
    } = req.query;

    // Валидация и ограничение limit
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 10); // Максимум 10
    if (Number.isNaN(pageNum) || pageNum < 1 || limitNum < 1) {
      return next(new BadRequestError('Некорректные параметры page или limit'));
    }

    const filters: FilterQuery<Partial<IOrder>> = {};

    // Безопасная обработка status (только строковые значения)
    if (status && typeof status === 'string') {
      const validStatuses = ['pending', 'completed', 'cancelled']; // Список разрешённых статусов
      if (!validStatuses.includes(status)) {
        return next(new BadRequestError(`Недопустимый статус: ${status}`));
      }
      filters.status = status;
    }

    // Обработка числовых фильтров
    if (totalAmountFrom) {
      const amount = parseFloat(totalAmountFrom as string);
      if (Number.isNaN(amount) || amount < 0) {
        return next(new BadRequestError('totalAmountFrom должен быть положительным числом'));
      }
      filters.totalAmount = { ...filters.totalAmount, $gte: amount };
    }

    if (totalAmountTo) {
      const amount = parseFloat(totalAmountTo as string);
      if (Number.isNaN(amount) || amount < 0) {
        return next(new BadRequestError('totalAmountTo должен быть положительным числом'));
      }
      filters.totalAmount = { ...filters.totalAmount, $lte: amount };
    }

    // Обработка дат
    if (orderDateFrom) {
      const date = new Date(orderDateFrom as string);
      if (Number.isNaN(date.getTime())) {
        return next(new BadRequestError('orderDateFrom имеет некорректный формат даты'));
      }
      filters.createdAt = { ...filters.createdAt, $gte: date };
    }

    if (orderDateTo) {
      const date = new Date(orderDateTo as string);
      if (Number.isNaN(date.getTime())) {
        return next(new BadRequestError('orderDateTo имеет некорректный формат даты'));
      }
      filters.createdAt = { ...filters.createdAt, $lte: date };
    }

    const aggregatePipeline: any[] = [
      { $match: filters },
      {
        $lookup: {
          from: 'products',
          localField: 'products',
          foreignField: '_id',
          as: 'products',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'customer',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },
      { $unwind: '$products' },
    ];

    // Поиск по продуктам и номеру заказа
    if (search) {
      const safeSearch = escapeRegExp(search as string);
      const searchRegex = new RegExp(safeSearch, 'i');
      const searchNumber = parseFloat(search as string);

      const searchConditions: any[] = [{ 'products.title': searchRegex }];

      if (!Number.isNaN(searchNumber)) {
        searchConditions.push({ orderNumber: searchNumber });
      }

      aggregatePipeline.push({
        $match: { $or: searchConditions },
      });
      filters.$or = searchConditions;
    }

    // Сортировка
    const validSortFields = ['createdAt', 'totalAmount', 'orderNumber'];
    if (!validSortFields.includes(sortField as string)) {
      return next(new BadRequestError(`Поле сортировки ${sortField} не поддерживается`));
    }

    const sort: { [key: string]: any } = {};
    sort[sortField as string] = sortOrder === 'desc' ? -1 : 1;

    aggregatePipeline.push(
      { $sort: sort },
      { $skip: (pageNum - 1) * limitNum },
      { $limit: limitNum },
      {
        $group: {
          _id: '$_id',
          orderNumber: { $first: '$orderNumber' },
          status: { $first: '$status' },
          totalAmount: { $first: '$totalAmount' },
          products: { $push: '$products' },
          customer: { $first: '$customer' },
          createdAt: { $first: '$createdAt' },
        },
      }
    );

    const orders = await Order.aggregate(aggregatePipeline);
    const totalOrders = await Order.countDocuments(filters);
    const totalPages = Math.ceil(totalOrders / limitNum);

    res.status(200).json({
      orders,
      pagination: {
        totalOrders,
        totalPages,
        currentPage: pageNum,
        pageSize: limitNum,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get order by ID
export const getOrderByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const order = await Order.findOne({
            orderNumber: req.params.orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
        return res.status(200).json(order)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

export const getOrderCurrentUserByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    try {
        const order = await Order.findOne({
            orderNumber: req.params.orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
        if (!order.customer._id.equals(userId)) {
            // Если нет доступа не возвращаем 403, а отдаем 404
            return next(
                new NotFoundError('Заказ по заданному id отсутствует в базе')
            )
        }
        return res.status(200).json(order)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

// POST /product
export const createOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const basket: IProduct[] = []
        const products = await Product.find<IProduct>({})
        const userId = res.locals.user._id
        const { address, payment, phone, total, email, items, comment } =
            req.body

        items.forEach((id: Types.ObjectId) => {
            const product = products.find((p) => p._id.equals(id))
            if (!product) {
                throw new BadRequestError(`Товар с id ${id} не найден`)
            }
            if (product.price === null) {
                throw new BadRequestError(`Товар с id ${id} не продается`)
            }
            return basket.push(product)
        })
        const totalBasket = basket.reduce((a, c) => a + c.price, 0)
        if (totalBasket !== total) {
            return next(new BadRequestError('Неверная сумма заказа'))
        }

        const newOrder = new Order({
            totalAmount: total,
            products: items,
            payment,
            phone,
            email,
            comment,
            customer: userId,
            deliveryAddress: address,
        })
        const populateOrder = await newOrder.populate(['customer', 'products'])
        await populateOrder.save()

        return res.status(200).json(populateOrder)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        return next(error)
    }
}

// Update an order
export const updateOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { status } = req.body
        const updatedOrder = await Order.findOneAndUpdate(
            { orderNumber: req.params.orderNumber },
            { status },
            { new: true, runValidators: true }
        )
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
            .populate(['customer', 'products'])
        return res.status(200).json(updatedOrder)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

// Delete an order
export const deleteOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const deletedOrder = await Order.findByIdAndDelete(req.params.id)
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
            .populate(['customer', 'products'])
        return res.status(200).json(deletedOrder)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}
