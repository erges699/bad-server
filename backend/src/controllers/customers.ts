import { NextFunction, Request, Response } from 'express'
import { FilterQuery } from 'mongoose'
import NotFoundError from '../errors/not-found-error'
import Order from '../models/order'
import User, { IUser } from '../models/user'
import { isValidObjectId } from '../middlewares/validations'

// TODO: Добавить guard admin
// eslint-disable-next-line max-len
// Get GET /customers?page=2&limit=5&sort=totalAmount&order=desc&registrationDateFrom=2023-01-01&registrationDateTo=2023-12-31&lastOrderDateFrom=2023-01-01&lastOrderDateTo=2023-12-31&totalAmountFrom=100&totalAmountTo=1000&orderCountFrom=1&orderCountTo=10
export const getCustomers = [
  // Middleware для проверки админских прав
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ message: 'Доступ запрещён' });
    }
    next();
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        page = '1',
        limit = '10',
        sortField = 'createdAt',
        sortOrder = 'desc',
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

      // 1. Валидация page и limit
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);

      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({ message: 'Параметр page должен быть положительным целым числом' });
      }
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({ 
          message: 'Параметр limit должен быть целым числом от 1 до 100'
        });
      }

      const filters: FilterQuery<Partial<IUser>> = {};

      // 2. Валидация и обработка дат
      if (registrationDateFrom) {
        const date = isValidDate(registrationDateFrom as string);
        if (!date) {
          return res.status(400).json({ message: 'Некорректный формат даты registrationDateFrom' });
        }
        filters.createdAt = { ...filters.createdAt, $gte: date };
      }

      if (registrationDateTo) {
        const date = isValidDate(registrationDateTo as string);
        if (!date) {
          return res.status(400).json({ message: 'Некорректный формат даты registrationDateTo' });
        }
        date.setHours(23, 59, 59, 999);
        filters.createdAt = { ...filters.createdAt, $lte: date };
      }

      if (lastOrderDateFrom) {
        const date = isValidDate(lastOrderDateFrom as string);
        if (!date) {
          return res.status(400).json({ message: 'Некорректный формат даты lastOrderDateFrom' });
        }
        filters.lastOrderDate = { ...filters.lastOrderDate, $gte: date };
      }

      if (lastOrderDateTo) {
        const date = isValidDate(lastOrderDateTo as string);
        if (!date) {
          return res.status(400).json({ message: 'Некорректный формат даты lastOrderDateTo' });
        }
        date.setHours(23, 59, 59, 999);
        filters.lastOrderDate = { ...filters.lastOrderDate, $lte: date };
      }

      // 3. Валидация числовых параметров
      if (totalAmountFrom) {
        const amount = parseFloat(totalAmountFrom as string);
        if (isNaN(amount) || amount < 0) {
          return res.status(400).json({ message: 'Параметр totalAmountFrom должен быть неотрицательным числом' });
        }
        filters.totalAmount = { ...filters.totalAmount, $gte: amount };
      }

      if (totalAmountTo) {
        const amount = parseFloat(totalAmountTo as string);
        if (isNaN(amount) || amount < 0) {
          return res.status(400).json({ message: 'Параметр totalAmountTo должен быть неотрицательным числом' });
        }
        filters.totalAmount = { ...filters.totalAmount, $lte: amount };
      }

      if (orderCountFrom) {
        const count = parseInt(orderCountFrom as string, 10);
        if (isNaN(count) || count < 0) {
          return res.status(400).json({ message: 'Параметр orderCountFrom должен быть неотрицательным целым числом' });
        }
        filters.orderCount = { ...filters.orderCount, $gte: count };
      }

      if (orderCountTo) {
        const count = parseInt(orderCountTo as string, 10);
        if (isNaN(count) || count < 0) {
          return res.status(400).json({ message: 'Параметр orderCountTo должен быть неотрицательным целым числом' });
        }
        filters.orderCount = { ...filters.orderCount, $lte: count };
      }

      // 4. Санитизация и валидация search
      if (search) {
        const sanitizedSearch = sanitizeString(search as string);
        if (sanitizedSearch.length < 1) {
          return res.status(400).json({ message: 'Параметр search не может быть пустым после санитизации' });
        }

        const searchRegex = new RegExp(sanitizedSearch, 'i');
        const orders = await Order.find(
          { $or: [{ deliveryAddress: searchRegex }] },
          '_id'
        );

        const orderIds = orders.map((order) => order._id);
        filters.$or = [
          { name: searchRegex },
          { lastOrder: { $in: orderIds } },
        ];
      }

      // 5. Валидация sortField (только разрешённые поля)
      const allowedSortFields = ['createdAt', 'totalAmount', 'orderCount', 'lastOrderDate', 'name'];
      if (!allowedSortFields.includes(sortField as string)) {
        return res.status(400).json({
          message: `Поле сортировки должно быть одним из: ${allowedSortFields.join(', ')}`
        });
      }

      const sort: { [key: string]: any } = {};
      if (sortField && sortOrder) {
        sort[sortField as string] = sortOrder === 'desc' ? -1 : 1;
      }

      // 6. Формирование опций запроса
      const options = {
        sort,
        skip: (pageNum - 1) * limitNum,
        limit: limitNum,
      };

      // 7. Выполнение запроса к БД
      const users = await User.find(filters, null, options).populate([
        'orders',
        {
          path: 'lastOrder',
          populate: {
            path: 'products',
          },
        },
        {
          path: 'lastOrder',
          populate: {
            path: 'customer',
          },
        },
      ]);

      const totalUsers = await User.countDocuments(filters);
      const totalPages = Math.ceil(totalUsers / limitNum);

      // 8. Возврат результата
      res.status(200).json({
        customers: users,
        pagination: {
          totalUsers,
          totalPages,
          currentPage: pageNum,
          pageSize: limitNum,
        },
      });
    } catch (error) {
      // 9. Обработка ошибок (без раскрытия внутренних деталей)
      console.error('Ошибка при получении клиентов:', error);
      res.status(500).json({ message: 'Произошла ошибка при обработке запроса' });
    }
  }
];

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
export const getCustomerById = [
  // Middleware для проверки админских прав
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ message: 'Доступ запрещён' });
    }
    next();
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // 1. Валидация ObjectId
      if (!isValidObjectId(id)) {
        return res.status(400).json({
          message: 'Некорректный формат ID клиента'
        });
      }

      // 2. Поиск пользователя с популяциями
      const user = await User.findById(id)
        .populate([
          'orders',
          {
            path: 'lastOrder',
            populate: {
              path: 'products',
            },
          },
          {
            path: 'lastOrder',
            populate: {
              path: 'customer',
            },
          },
        ])
        .orFail(() => new NotFoundError('Клиент с указанным ID не найден'));

      // 3. Возврат результата
      res.status(200).json(user);
    } catch (error) {
      // 4. Обработка ошибок
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }

      console.error('Ошибка при получении клиента по ID:', error);
      res.status(500).json({
        message: 'Произошла ошибка при обработке запроса'
      });
    }
  }
];

// TODO: Добавить guard admin
// Delete /customers/:id
export const deleteCustomer = [
  // Middleware для проверки админских прав
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ message: 'Доступ запрещён' });
    }
    next();
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // 1. Валидация ObjectId
      if (!isValidObjectId(id)) {
        return res.status(400).json({
          message: 'Некорректный формат ID клиента'
        });
      }

      // 2. Поиск и удаление пользователя
      const deletedUser = await User.findByIdAndDelete(id).orFail(
        () => new NotFoundError('Клиент с указанным ID не найден')
      );

      // 3. Возврат результата
      res.status(200).json({
        message: 'Клиент успешно удалён',
        deletedCustomer: {
          _id: deletedUser._id,
          name: deletedUser.name,
          email: deletedUser.email
        }
      });

    } catch (error) {
      // 4. Обработка ошибок
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }

      console.error('Ошибка при удалении клиента:', error);
      res.status(500).json({
        message: 'Произошла ошибка при обработке запроса'
      });
    }
  }
];
