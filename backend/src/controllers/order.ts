import { NextFunction, Request, Response } from 'express'
import { FilterQuery, Error as MongooseError, Types } from 'mongoose'
import BadRequestError from '../errors/bad-request-error'
import NotFoundError from '../errors/not-found-error'
import Order, { IOrder } from '../models/order'
import Product, { IProduct } from '../models/product'
import User from '../models/user'
import validator from 'validator';

// eslint-disable-next-line max-len
// GET /orders?page=2&limit=5&sort=totalAmount&order=desc&orderDateFrom=2024-07-01&orderDateTo=2024-08-01&status=delivering&totalAmountFrom=100&totalAmountTo=1000&search=%2B1

export const getOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      page = '1',
      limit = '10',
      sortField = 'createdAt',
      sortOrder = 'desc',
      status,
      totalAmountFrom,
      totalAmountTo,
      orderDateFrom,
      orderDateTo,
      search,
    } = req.query

    // Валидация page и limit
    const pageNum = validateNumber(page as string, 'page')
    const limitNum = validateNumber(limit as string, 'limit')
    if (isNaN(pageNum) || isNaN(limitNum)) {
      return next(new BadRequestError('Параметры page и limit должны быть положительными числами'))
    }

    const filters: FilterQuery<Partial<IOrder>> = {}

    if (status) {
      if (typeof status === 'object') {
        Object.assign(filters, status)
      } else if (typeof status === 'string') {
        filters.status = status
      }
    }

    // Валидация totalAmountFrom/To
    if (totalAmountFrom) {
      const amount = validateNumber(totalAmountFrom as string, 'totalAmountFrom')
      if (!isNaN(amount)) {
        filters.totalAmount = { ...filters.totalAmount, $gte: amount }
      }
    }
    if (totalAmountTo) {
      const amount = validateNumber(totalAmountTo as string, 'totalAmountTo')
      if (!isNaN(amount)) {
        filters.totalAmount = { ...filters.totalAmount, $lte: amount }
      }
    }

    // Валидация дат
    if (orderDateFrom) {
      const date = new Date(orderDateFrom as string)
      if (isNaN(date.getTime())) {
        return next(new BadRequestError('Параметр orderDateFrom должен быть валидной датой'))
      }
      filters.createdAt = { ...filters.createdAt, $gte: date }
    }
    if (orderDateTo) {
      const date = new Date(orderDateTo as string)
      if (isNaN(date.getTime())) {
        return next(new BadRequestError('Параметр orderDateTo должен быть валидной датой'))
      }
      filters.createdAt = { ...filters.createdAt, $lte: date }
    }

    const aggregatePipeline: any[] = [
      { $match: filters },
      // ... (остальное без изменений)
    ]

    // Безопасный поиск по search
    if (search) {
      const searchStr = (search as string).trim()
      if (searchStr.length > 0) {
        const searchRegex = createSafeRegex(searchStr)
        const searchNumber = Number(searchStr)

        const searchConditions: any[] = [{ 'products.title': searchRegex }]
        if (!isNaN(searchNumber)) {
          searchConditions.push({ orderNumber: searchNumber })
        }

        aggregatePipeline.push({ $match: { $or: searchConditions } })
        filters.$or = searchConditions
      }
    }

    // ... (сортировка, пагинация, ответ)
  } catch (error) {
    next(error)
  }
}

export const getOrdersCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = res.locals.user._id
    const { search, page = '1', limit = '5' } = req.query

    // Валидация page и limit
    const pageNum = validateNumber(page as string, 'page')
    const limitNum = validateNumber(limit as string, 'limit')
    if (isNaN(pageNum) || isNaN(limitNum)) {
      return next(new BadRequestError('Параметры page и limit должны быть положительными числами'))
    }

    const user = await User.findById(userId)
      // ... (populate без изменений)
      .orFail(() => new NotFoundError('Пользователь не найден'))

    let orders = user.orders as unknown as IOrder[]

    if (search) {
      const searchStr = (search as string).trim()
      if (searchStr.length > 0) {  // Проверка на пустую строку
        const searchRegex = createSafeRegex(searchStr)
        // ... (дальнейшая обработка)
      }
    }

    // ... (пагинация и ответ)
  } catch (error) {
    next(error)
  }
}

// Get order by ID
export const getOrderByNumber = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const orderNumberStr = req.params.orderNumber

    // Валидация orderNumber: должен быть числом > 0
    const orderNumber = Number(orderNumberStr)
    if (isNaN(orderNumber) || orderNumber <= 0) {
      return next(new BadRequestError('orderNumber должен быть положительным числом'))
    }

    // Поиск заказа по orderNumber с заполнением связанных полей
    const order = await Order.findOne({ orderNumber })
      .populate(['customer', 'products'])
      .orFail(() => new NotFoundError('Заказ по заданному номеру отсутствует в базе'))


    res.status(200).json(order)
  } catch (error) {
    // Обработка ошибок преобразования типов (например, если orderNumber не число)
    if (error instanceof CastError) {
      return next(new BadRequestError('Некорректный формат orderNumber'))
    }
    // Прочие ошибки (например, ошибки БД) передаются дальше
    return next(error)
  }
}

export const getOrderCurrentUserByNumber = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = res.locals.user._id
    const orderNumberStr = req.params.orderNumber

    // Валидация orderNumber: должен быть числом > 0
    const orderNumber = Number(orderNumberStr)
    if (isNaN(orderNumber) || orderNumber <= 0) {
      return next(new BadRequestError('orderNumber должен быть положительным числом'))
    }

    // Поиск заказа по orderNumber с заполнением связанных полей
    const order = await Order.findOne({ orderNumber })
      .populate(['customer', 'products'])
      .orFail(() => new NotFoundError('Заказ по заданному номеру отсутствует в базе'))


    // Проверка прав доступа: заказ должен принадлежать текущему пользователю
    if (!order.customer._id.equals(userId)) {
      return next(new NotFoundError('Заказ по заданному номеру отсутствует в базе'))
    }

    res.status(200).json(order)
  } catch (error) {
    // Обработка ошибок преобразования типов (например, если orderNumber не число)
    if (error instanceof CastError) {
      return next(new BadRequestError('Некорректный формат orderNumber'))
    }
    // Прочие ошибки (например, ошибки БД) передаются дальше
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
    const {
      payment,
      email,
      phone,
      address,
      total,
      items,
      comment
    } = req.body

    // 1. Валидация обязательных полей
    if (!payment || !email || !phone || !address || !total || !items) {
      return next(new BadRequestError('Обязательные поля не заполнены'))
    }

    // 2. Валидация email
    if (!validator.isEmail(email)) {
      return next(new BadRequestError('Некорректный формат email'))
    }

    // 3. Валидация phone (пример: +7XXXXXXXXXX, длина 11–15 цифр)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/
    if (!phoneRegex.test(phone)) {
      return next(new BadRequestError('Некорректный формат телефона'))
    }
    if (phone.length > 20) {
      return next(new BadRequestError('Номер телефона не может быть длиннее 20 символов'))
    }

    // 4. Валидация total (положительное число)
    const totalAmount = Number(total)
    if (isNaN(totalAmount) || totalAmount <= 0) {
      return next(new BadRequestError('Сумма заказа должна быть положительным числом'))
    }

    // 5. Валидация items (массив ObjectId)
    if (!Array.isArray(items) || items.length === 0) {
      return next(new BadRequestError('Список товаров должен быть непустым массивом'))
    }

    const validItemIds = items.filter(id => Types.ObjectId.isValid(id))
    if (validItemIds.length !== items.length) {
      return next(new BadRequestError('Один или несколько ID товаров некорректны'))
    }

    // 6. Проверка существования товаров
    const products = await Product.find({ _id: { $in: validItemIds } })
    if (products.length !== validItemIds.length) {
      return next(new NotFoundError('Один или несколько товаров не найдены в базе'))
    }

    // 7. Проверка соответствия суммы (примерная логика)
    const calculatedTotal = products.reduce((sum, p) => sum + p.price, 0)
    if (Math.abs(calculatedTotal - totalAmount) > 0.01) {  // допуск на округление
      return next(new BadRequestError('Указанная сумма не соответствует стоимости товаров'))
    }

    // 8. Санитизация комментария (защита от XSS)
    const sanitizedComment = comment ? validator.escape(comment.trim()) : ''

    // 9. Проверка существования пользователя (если требуется)
    let customer = null
    if (req.user) {  // если есть аутентифицированный пользователь
      customer = await User.findById(req.user._id)
      if (!customer) {
        return next(new NotFoundError('Пользователь не найден'))
      }
    }

    // 10. Создание заказа
    const order = new Order({
      orderNumber: Date.now(),
      payment,
      email,
      phone,
      address,
      total: totalAmount,
      products: products.map(p => p._id),
      customer: customer?._id,
      comment: sanitizedComment,
      status: 'created'
    })

    await order.save()

    res.status(201).json({
      message: 'Заказ создан',
      order: order._id
    })
  } catch (error) {
    next(error)
  }
}

// Update an order
export const updateOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderNumber } = req.params;
    const updateData = req.body;

    // 1. Валидация orderNumber
    const orderNum = Number(orderNumber);
    if (isNaN(orderNum) || orderNum <= 0) {
      return next(new BadRequestError('orderNumber должен быть положительным числом'));
    }

    // 2. Поиск заказа
    const existingOrder = await Order.findOne({ orderNumber })
      .populate('customer')
      .orFail(() => new NotFoundError('Заказ не найден'));

    // 3. Проверка прав доступа (только владелец или админ)
    const currentUserId = res.locals.user._id;
    const isAdmin = res.locals.user.role === 'admin';
    
    if (!isAdmin && !existingOrder.customer._id.equals(currentUserId)) {
      return next(new NotFoundError('У вас нет доступа к этому заказу'));
    }

    // 4. Валидация обновляемых полей
    const allowedUpdates: (keyof IOrder)[] = [
      'payment', 'email', 'phone', 'address', 'total', 'comment', 'status'
    ];

    const updatesToApply: Partial<IOrder> = {};

    for (const key in updateData) {
      if (!allowedUpdates.includes(key as keyof IOrder)) {
        return next(new BadRequestError(`Поле ${key} нельзя обновлять`));
      }

      const value = updateData[key];

      switch (key) {
        case 'email':
          if (!validator.isEmail(value)) {
            return next(new BadRequestError('Некорректный формат email'));
          }
          updatesToApply.email = value;
          break;

        case 'phone':
          const phoneRegex = /^\+?[1-9]\d{1,14}$/;
          if (!phoneRegex.test(value) || value.length > 20) {
            return next(new BadRequestError('Некорректный формат телефона'));
          }
          updatesToApply.phone = value;
          break;

        case 'total':
          const total = Number(value);
          if (isNaN(total) || total <= 0) {
            return next(new BadRequestError('Сумма должна быть положительным числом'));
          }
          updatesToApply.total = total;
          break;

        case 'status':
          if (!Object.values(StatusType).includes(value)) {
            return next(new BadRequestError(`Недопустимый статус заказа. Допустимые значения: ${Object.values(StatusType).join(', ')}`));
          }
          updatesToApply.status = value;
          break;

        case 'comment':
          updatesToApply.comment = validator.escape(value.trim());
          break;

        default:
          updatesToApply[key] = value;
      }
    }

    // 5. Проверка согласованности данных (пример для total)
    if (updatesToApply.total !== undefined) {
      const products = await Order.populate(existingOrder, { path: 'products' });
      const calculatedTotal = (products.products as any[]).reduce(
        (sum, p) => sum + p.price, 0
      );

      if (Math.abs(calculatedTotal - updatesToApply.total) > 0.01) {
        return next(new BadRequestError('Обновлённая сумма не соответствует стоимости товаров'));
      }
    }

    // 6. Обновление заказа
    Object.assign(existingOrder, updatesToApply);
    await existingOrder.save();


    res.status(200).json({
      message: 'Заказ успешно обновлен',
      order: existingOrder
    });

  } catch (error) {
    if (error instanceof CastError) {
      return next(new BadRequestError('Ошибка преобразования данных'));
    }
    return next(error);
  }
};

// Delete an order
export const deleteOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // 1. Валидация формата ObjectId
    if (!Types.ObjectId.isValid(id)) {
      return next(new BadRequestError('Некорректный формат идентификатора заказа'));
    }

    // 2. Поиск заказа по ID
    const order = await Order.findById(id)
      .populate('customer')
      .orFail(() => new NotFoundError('Заказ не найден'));

    // 3. Проверка прав доступа (только владелец или админ)
    const currentUserId = res.locals.user._id;
    const isAdmin = res.locals.user.role === 'admin';

    if (!isAdmin && !order.customer._id.equals(currentUserId)) {
      return next(new NotFoundError('У вас нет доступа к этому заказу'));
    }

    // 4. Проверка статуса заказа перед удалением
    // Запрещаем удаление завершённых/доставленных заказов
    if (['completed', 'delivered', 'cancelled'].includes(order.status)) {
      return next(new BadRequestError('Нельзя удалить заказ в текущем статусе'));
    }

    // 5. Удаление заказа
    await order.remove();

    res.status(200).json({
      message: 'Заказ успешно удалён'
    });

  } catch (error) {
    // Обработка ошибок преобразования ObjectId
    if (error instanceof CastError) {
      return next(new BadRequestError('Ошибка преобразования идентификатора'));
    }
    
    // Другие ошибки (например, проблемы с БД)
    return next(error);
  }
};
