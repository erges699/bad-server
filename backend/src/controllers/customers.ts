// src/controllers/customers.ts 

import { NextFunction, Request, Response } from 'express'
import { FilterQuery } from 'mongoose'
import NotFoundError from '../errors/not-found-error'
import Order from '../models/order'
import User, { IUser } from '../models/user'


// TODO: Добавить guard admin
// eslint-disable-next-line max-len
// Get GET /customers?page=2&limit=5&sort=totalAmount&order=desc&registrationDateFrom=2023-01-01&registrationDateTo=2023-12-31&lastOrderDateFrom=2023-01-01&lastOrderDateTo=2023-12-31&totalAmountFrom=100&totalAmountTo=1000&orderCountFrom=1&orderCountTo=10
export const getCustomers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      page,
      limit,
      sortField,
      sortOrder,
      registrationDateFrom,
      registrationDateTo,
      lastOrderDateFrom,
      lastOrderDateTo,
      totalAmountFrom,
      totalAmountTo,
      orderCountFrom,
      orderCountTo,
      search,
    } = req.query;

    // Базовые параметры пагинации
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(10, Math.max(1, Number(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Формируем фильтр для запроса
    const filters: FilterQuery<IUser> = {};


    // 1. Фильтрация по датам регистрации
    if (registrationDateFrom) {
      filters.createdAt = {
        ...filters.createdAt,
        $gte: new Date(registrationDateFrom as string),
      };
    }
    if (registrationDateTo) {
      const endOfDay = new Date(registrationDateTo as string);
      endOfDay.setHours(23, 59, 59, 999);
      filters.createdAt = {
        ...filters.createdAt,
        $lte: endOfDay,
      };
    }

    // 2. Фильтрация по дате последнего заказа
    if (lastOrderDateFrom) {
      filters.lastOrderDate = {
        ...filters.lastOrderDate,
        $gte: new Date(lastOrderDateFrom as string),
      };
    }
    if (lastOrderDateTo) {
      const endOfDay = new Date(lastOrderDateTo as string);
      endOfDay.setHours(23, 59, 59, 999);
      filters.lastOrderDate = {
        ...filters.lastOrderDate,
        $lte: endOfDay,
      };
    }

    // 3. Фильтрация по сумме заказов
    if (totalAmountFrom) {
      filters.totalAmount = {
        ...filters.totalAmount,
        $gte: Number(totalAmountFrom),
      };
    }
    if (totalAmountTo) {
      filters.totalAmount = {
        ...filters.totalAmount,
        $lte: Number(totalAmountTo),
      };
    }

    // 4. Фильтрация по количеству заказов
    if (orderCountFrom) {
      filters.orderCount = {
        ...filters.orderCount,
        $gte: Number(orderCountFrom),
      };
    }
    if (orderCountTo) {
      filters.orderCount = {
        ...filters.orderCount,
        $lte: Number(orderCountTo),
      };
    }

    // 5. Поиск по строке (имя, email, телефон)
    if (search && (search as string).trim().length > 0) {
      const searchStr = (search as string).trim();
      // Экранируем спецсимволы для RegExp
      const sanitizedSearch = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filters.$or = [
        { name: { $regex: sanitizedSearch, $options: 'i' } },
        { email: { $regex: sanitizedSearch, $options: 'i' } },
        { phone: { $regex: sanitizedSearch, $options: 'i' } },
      ];
    }

    // Сортировка
    const sortOptions: Record<string, 1 | -1> = {};
    if (sortField) {
      sortOptions[sortField as string] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions.createdAt = -1; // дефолтная сортировка
    }

    // Выполняем запрос к БД
    const customers = await User.find(filters)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .populate({
        path: 'lastOrder',
        model: Order,
        select: 'orderNumber total createdAt',
      })
      .select(
        'name email phone createdAt totalAmount orderCount lastOrder'
      )
      .exec();

    // Получаем общее количество записей для пагинации
    const totalCount = await User.countDocuments(filters);

    const hasMore = skip + customers.length < totalCount;

    const hasPrev = pageNum > 1;

    res.status(200).json({
      data: customers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        hasMore,
        hasPrev,
        pages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
};

// TODO: Добавить guard admin
// Get /customers/:id
export const getCustomerById = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = await User.findById(req.params.id).populate([
            'orders',
            'lastOrder',
        ])
        res.status(200).json(user)
    } catch (error) {
        next(error)
    }
}

// TODO: Добавить guard admin
// Patch /customers/:id
export const updateCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
            }
        )
            .orFail(
                () =>
                    new NotFoundError(
                        'Пользователь по заданному id отсутствует в базе'
                    )
            )
            .populate(['orders', 'lastOrder'])
        res.status(200).json(updatedUser)
    } catch (error) {
        next(error)
    }
}

// TODO: Добавить guard admin
// Delete /customers/:id
export const deleteCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const deletedUser = await User.findByIdAndDelete(req.params.id).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.status(200).json(deletedUser)
    } catch (error) {
        next(error)
    }
}
