// backend/src/controllers/order.ts
import { NextFunction, Request, Response } from 'express';
import { FilterQuery, Error as MongooseError} from 'mongoose';
import BadRequestError from '../errors/bad-request-error';
import NotFoundError from '../errors/not-found-error';
import Order, { IOrder } from '../models/order';
import Product, { IProduct } from '../models/product';
import User from '../models/user';
import escapeRegExp from '../utils/escapeRegExp';
import { normalizeLimit, normalizePage } from '../utils/normalization'
import { validateOrderBody, blockMongoInjection  } from '../middlewares/validations';

// GET /orders 
export const getOrders = [
  blockMongoInjection, // Блокирует запросы с `$` в ключах (защита от MongoDB-инъекций)
  async (req: Request, res: Response, next: NextFunction) => {
    try {
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

      // Нормализация page и limit
      let pageNum: number;
      let limitNum: number;

      try {
        pageNum = normalizePage(page);
        limitNum = normalizeLimit(limit, 10);
      } catch (err) {
        return next(err);
      }

      const filters: FilterQuery<Partial<IOrder>> = {};

      // Безопасная обработка status
      if (status && typeof status === 'string') {
        const validStatuses = ['pending', 'completed', 'cancelled'];
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

      const forbiddenOperators = ['$where', '$eval', '$function'];

      // Проверка фильтров перед агрегацией
      const safeFilters = JSON.parse(JSON.stringify(filters));

      // Заменено: for...of → some()
      const hasForbiddenOperator = Object.keys(safeFilters).some(key =>
        forbiddenOperators.includes(key)
      );

      if (hasForbiddenOperator) {
        return next(new BadRequestError('Недопустимый оператор в фильтре'));
      }

      const aggregatePipeline: any[] = [
        { $match: safeFilters },
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
        const searchStr = search as string;

        // Блокируем потенциально опасные шаблоны (регулярные выражения)
        if (/[*+?^${}[(]|\\/.test(searchStr)) {
          return next(new BadRequestError('Недопустимые символы в поиске'));
        }

        if (searchStr.includes('$')) {
          return next(new BadRequestError('Недопустимый символ $ в поиске'));
        }
        
        const safeSearch = escapeRegExp(searchStr);
        const searchRegex = new RegExp(safeSearch, 'i');
        const searchNumber = parseFloat(searchStr);

        const searchConditions: any[] = [{ 'products.title': { $regex: searchRegex } }];

        if (!Number.isNaN(searchNumber)) {
          searchConditions.push({ orderNumber: searchNumber });
        }

        aggregatePipeline.push({
          $match: { $or: searchConditions },
        });
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
  },
];

export const getOrdersCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = res.locals.user._id;

    const { search, page = 1, limit = 5 } = req.query;

    let pageNum: number;
    let limitNum: number;

    try {
      pageNum = normalizePage(page);
      limitNum = normalizeLimit(limit, 10);
    } catch (err) {
      return next(err);
    }

    const options = {
      skip: (pageNum - 1) * limitNum,
      limit: limitNum,
    };

    // Получение пользователя с заполненными заказами
    const user = await User.findById(userId)
      .populate({
        path: 'orders',
        populate: [
          {
            path: 'products',
          },
          {
            path: 'customer',
          },
        ],
      })
      .orFail(
        () => new NotFoundError('Пользователь по заданному id отсутствует в базе')
      );

    let orders = user.orders as unknown as IOrder[];

    // Обработка поискового запроса
    if (search) {
      const safeSearch = escapeRegExp(search as string);
      const searchRegex = new RegExp(safeSearch, 'i');
      const searchNumber = parseFloat(search as string);

      // Поиск продуктов по названию (с экранированием спецсимволов)
      const products = await Product.find({ title: searchRegex });
      const productIds = products.map((product) => product._id);

      // Фильтрация заказов по критериям поиска
      orders = orders.filter((order) => {
        // Проверка совпадения по названию продукта
        const matchesProductTitle = order.products.some((product) =>
          productIds.some((id) => id.equals(product._id))
        );

        // Проверка совпадения по номеру заказа (если введено число)
        const matchesOrderNumber =
          !Number.isNaN(searchNumber) && order.orderNumber === searchNumber;

        return matchesOrderNumber || matchesProductTitle;
      });
    }

    // Расчёт пагинации
    const totalOrders = orders.length;
    const totalPages = Math.ceil(totalOrders / limitNum);


    // Применение пагинации к результатам
    orders = orders.slice(options.skip, options.skip + options.limit);


    // Возврат результата
    return res.status(200).json({
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
        const {orderNumber} = req.params;
        if (typeof orderNumber !== 'string' || !/^\d+$/.test(orderNumber)) {
          return next(new BadRequestError('orderNumber должен быть числом'));
        }      
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
        const {orderNumber} = req.params;
        if (typeof orderNumber !== 'string' || !/^\d+$/.test(orderNumber)) {
          return next(new BadRequestError('orderNumber должен быть числом'));
        }

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
export const createOrder = [
  validateOrderBody,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { address, payment, phone, total, email, items, comment } = req.body;

      // Проверка наличия товаров
      const products = await Product.find<IProduct>({ _id: { $in: items } });
      if (products.length !== items.length) {
        return next(new BadRequestError('Некоторые товары не найдены'));
      }

      // Расчёт суммы
      const totalBasket = products.reduce((acc, p) => acc + p.price, 0);
      if (totalBasket !== total) {
        return next(new BadRequestError('Неверная сумма заказа'));
      }

      // Создание заказа (комментарий уже санитизирован middleware)
      const newOrder = new Order({
        customer: res.locals.user._id,
        products: items,
        address,
        payment,
        phone,
        total,
        email,
        comment,
      });

      await newOrder.save();

      res.status(201).json(newOrder);
    } catch (error) {
      // Обработка ошибок Mongoose
      if (error instanceof MongooseError.ValidationError) {
        return next(new BadRequestError(error.message));
      }
      if (error instanceof MongooseError.CastError) {
        return next(new BadRequestError('Передан невалидный ID товара'));
      }
      next(error);
    }
  }
];

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
