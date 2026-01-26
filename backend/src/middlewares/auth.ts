import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Model, Types } from 'mongoose';
import { ACCESS_TOKEN } from '../config';
import ForbiddenError from '../errors/forbidden-error';
import NotFoundError from '../errors/not-found-error';
import UnauthorizedError from '../errors/unauthorized-error';
import UserModel, { Role } from '../models/user';

/**
 * Middleware для проверки JWT-токена в запросе.
 * 
 * @param {Request} req - Объект запроса Express
 * @param {Response} res - Объект ответа Express
 * @param {NextFunction} next - Функция перехода к следующему middleware
 * @throws {UnauthorizedError} При отсутствии или некорректности токена
 * @throws {ForbiddenError} При отсутствии пользователя в БД
 * @returns {void} Передаёт управление следующему middleware при успешной проверке
 */
const auth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let payload: JwtPayload | null = null;
  const authHeader = req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Невалидный токен');
  }

  try {
    const accessTokenParts = authHeader.split(' ');
    const aTkn = accessTokenParts[1];
    payload = jwt.verify(aTkn, ACCESS_TOKEN.secret) as JwtPayload;

    const user = await UserModel.findOne(
      {
        _id: new Types.ObjectId(payload.sub),
      },
      { password: 0, salt: 0 }
    );

    if (!user) {
      return next(new ForbiddenError('Нет доступа'));
    }

    res.locals.user = user;
    return next();
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Истек срок действия токена'));
    }
    return next(new UnauthorizedError('Необходима авторизация'));
  }
};

/**
 * Middleware-защитник по ролям пользователя.
 * Проверяет, имеет ли текущий пользователь хотя бы одну из указанных ролей.
 *
 * @param {...Role[]} roles - Список допустимых ролей
 * @returns {Function} Middleware-функцию для Express
 * @throws {UnauthorizedError} Если пользователь не авторизован
 * @throws {ForbiddenError} Если ни одна из ролей не совпадает
 */
export function roleGuardMiddleware(...roles: Role[]): (req: Request, res: Response, next: NextFunction) => void {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!res.locals.user) {
      return next(new UnauthorizedError('Необходима авторизация'));
    }

    const hasAccess = roles.some((role) =>
      res.locals.user.roles.includes(role)
    );

    if (!hasAccess) {
      return next(new ForbiddenError('Доступ запрещен'));
    }

    return next();
  };
}

/**
 * Middleware для проверки доступа к ресурсу по принадлежности пользователю.
 * Позволяет доступ, если:
 * - пользователь — администратор;
 * - ресурс принадлежит текущему пользователю (сравнение по ID).
 *
 * @template T - Тип модели Mongoose
 * @param {Model<T>} model - Модель Mongoose для поиска сущности
 * @param {string} idProperty - Имя параметра в req.params, содержащего ID ресурса
 * @param {keyof T} userProperty - Поле в модели, указывающее на владельца ресурса
 * @returns {Function} Middleware-функцию для Express
 * @throws {UnauthorizedError} Если пользователь не авторизован
 * @throws {NotFoundError} Если ресурс не найден
 * @throws {ForbiddenError} Если доступ запрещен
 */
export function currentUserAccessMiddleware<T>(
  model: Model<T>,
  idProperty: string,
  userProperty: keyof T
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = req.params[idProperty];

    if (!res.locals.user) {
      return next(new UnauthorizedError('Необходима авторизация'));
    }

    // Администраторы имеют полный доступ
    if (res.locals.user.roles.includes(Role.Admin)) {
      return next();
    }

    const entity = await model.findById(id);

    if (!entity) {
      return next(new NotFoundError('Не найдено'));
    }

    const userEntityId = entity[userProperty] as Types.ObjectId;
    const hasAccess = new Types.ObjectId(res.locals.user.id).equals(userEntityId);

    if (!hasAccess) {
      return next(new ForbiddenError('Доступ запрещен'));
    }

    return next();
  };
}

export default auth;
