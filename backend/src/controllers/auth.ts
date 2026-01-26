import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Error as MongooseError } from 'mongoose';
import { REFRESH_TOKEN } from '../config';
import BadRequestError from '../errors/bad-request-error';
import ConflictError from '../errors/conflict-error';
import NotFoundError from '../errors/not-found-error';
import UnauthorizedError from '../errors/unauthorized-error';
import User from '../models/user';

/**
 * Аутентификация пользователя и выдача токенов.
 * 
 * @route POST /auth/login
 * @param {Request} req - Объект запроса (содержит email и password в body)
 * @param {Response} res - Объект ответа
 * @param {NextFunction} next - Функция перехода к следующему middleware
 * @returns {Response} JSON с accessToken, refreshToken (в cookie) и данными пользователя
 */
const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;
    const user = await User.findUserByCredentials(email, password);
    const accessToken = user.generateAccessToken();
    const refreshToken = await user.generateRefreshToken();

    res.cookie(
      REFRESH_TOKEN.cookie.name,
      refreshToken,
      REFRESH_TOKEN.cookie.options
    );

    return res.json({
      success: true,
      user,
      accessToken,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Регистрация нового пользователя.
 *
 * @route POST /auth/register
 * @param {Request} req - Объект запроса (содержит email, password, name в body)
 * @param {Response} res - Объект ответа
 * @param {NextFunction} next - Функция перехода к следующему middleware
 * @returns {Response} Статус 201 и JSON с accessToken, refreshToken (в cookie) и данными нового пользователя
 */
const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, name } = req.body;
    const newUser = new User({ email, password, name });
    await newUser.save();

    const accessToken = newUser.generateAccessToken();
    const refreshToken = await newUser.generateRefreshToken();

    res.cookie(
      REFRESH_TOKEN.cookie.name,
      refreshToken,
      REFRESH_TOKEN.cookie.options
    );

    return res.status(constants.HTTP_STATUS_CREATED).json({
      success: true,
      user: newUser,
      accessToken,
    });
  } catch (error) {
    if (error instanceof MongooseError.ValidationError) {
      return next(new BadRequestError(error.message));
    }
    if (error instanceof Error && error.message.includes('E11000')) {
      return next(
        new ConflictError('Пользователь с таким email уже существует')
      );
    }
    return next(error);
  }
};

/**
 * Получение данных текущего авторизованного пользователя.
 *
 * @route GET /auth/user
 * @param {Request} _req - Объект запроса (не используется)
 * @param {Response} res - Объект ответа
 * @param {NextFunction} next - Функция перехода к следующему middleware
 * @returns {Response} JSON с данными пользователя
 */
const getCurrentUser = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = res.locals.user._id;
    const user = await User.findById(userId).orFail(
      () =>
        new NotFoundError(
          'Пользователь по заданному id отсутствует в базе'
        )
    );
    res.json({ user, success: true });
  } catch (error) {
    next(error);
  }
};

/**
 * Удаление refresh-токена из базы данных пользователя.
 * Используется в logout и refreshAccessToken.
 *
 * @param {Request} req - Объект запроса (содержит refreshToken в cookie)
 * @param {Response} _res - Объект ответа (не используется)
 * @param {NextFunction} _next - Функция перехода (не используется)
 * @returns {Promise<User>} Обновлённый документ пользователя
 * @throws {UnauthorizedError} Если токен отсутствует или пользователь не найден
 */
const deleteRefreshTokenInUser = async (
  req: Request,
  _res: Response,
  _next: NextFunction
): Promise<User> => {
  const { cookies } = req;
  const rfTkn = cookies[REFRESH_TOKEN.cookie.name];


  if (!rfTkn) {
    throw new UnauthorizedError('Не валидный токен');
  }

  const decodedRefreshTkn = jwt.verify(
    rfTkn,
    REFRESH_TOKEN.secret
  ) as JwtPayload;

  const user = await User.findOne({
    _id: decodedRefreshTkn._id,
  }).orFail(() => new UnauthorizedError('Пользователь не найден в базе'));

  const rTknHash = crypto
    .createHmac('sha256', REFRESH_TOKEN.secret)
    .update(rfTkn)
    .digest('hex');

  user.tokens = user.tokens.filter((tokenObj) => tokenObj.token !== rTknHash);
  await user.save();

  return user;
};

/**
 * Выход пользователя из системы (удаление refresh-токена).
 *
 * @route GET /auth/logout
 * @param {Request} req - Объект запроса
 * @param {Response} res - Объект ответа
 * @param {NextFunction} next - Функция перехода к следующему middleware
 * @returns {Response} Статус 200 и JSON с флагом success
 */
const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await deleteRefreshTokenInUser(req, res, next);
    const expireCookieOptions = {
      ...REFRESH_TOKEN.cookie.options,
      maxAge: -1,
    };
    res.cookie(REFRESH_TOKEN.cookie.name, '', expireCookieOptions);
    res.status(200).json({
      success: true,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Обновление access-токена с использованием refresh-токена.
 *
 * @route GET /auth/token
 * @param {Request} req - Объект запроса (содержит refreshToken в cookie)
 * @param {Response} res - Объект ответа
 * @param {NextFunction} next - Функция перехода к следующему middleware
 * @returns {Response} JSON с новым accessToken, refreshToken (в cookie) и данными пользователя
 */
const refreshAccessToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userWithRefreshTkn = await deleteRefreshTokenInUser(
      req,
      res,
      next
    );
    const accessToken = await userWithRefreshTkn.generateAccessToken();
    const refreshToken = await userWithRefreshTkn.generateRefreshToken();

    res.cookie(
      REFRESH_TOKEN.cookie.name,
      refreshToken,
      REFRESH_TOKEN.cookie.options
    );

    return res.json({
      success: true,
      user: userWithRefreshTkn,
      accessToken,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Получение ролей текущего авторизованного пользователя.
 *
 * @route GET /auth/roles
 * @param {Request} _req - Объект запроса (не используется, данные берутся из res.locals.user)
 * @param {Response} res - Объект ответа
 * @param {NextFunction} next - Функция перехода к следующему middleware
 * @returns {Response} JSON-ответ со статусом 200 и массивом ролей пользователя
 * @throws {NotFoundError} Если пользователь не найден в базе данных
 *
 * @example
 * // Ответ при успешном выполнении:
 * {
 *   "success": true,
 *   "roles": ["user", "premium"]
 * }
 */
const getCurrentUserRoles = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = res.locals.user._id;
  
  try {
    // Ищем пользователя по ID, проверяем существование
    const user = await User.findById(userId).orFail(
      () => new NotFoundError(
        'Пользователь по заданному id отсутствует в базе'
      )
    );
    
    // Возвращаем только роли пользователя
    res.status(200).json({
      success: true,
      roles: user.roles
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Обновление данных текущего авторизованного пользователя.
 *
 * @route PUT /auth/user
 * @param {Request} req - Объект запроса (содержит новые данные пользователя в body)
 * @param {Response} res - Объект ответа
 * @param {NextFunction} next - Функция перехода к следующему middleware
 * @returns {Response} JSON-ответ со статусом 200 и обновлёнными данными пользователя
 * @throws {NotFoundError} Если пользователь не найден в базе данных
 * @throws {MongooseError.ValidationError} При ошибке валидации данных (передаётся как BadRequestError)
 *
 * @example
 * // Тело запроса (req.body):
 * {
 *   "name": "Новый имя",
 *   "email": "new@email.com"
 * }
 * 
 * // Ответ при успешном выполнении:
 * {
 *   "_id": "507f191e810c19729de860ea",
 *   "name": "Новое имя",
 *   "email": "new@email.com",
 *   ...
 * }
 */
const updateCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = res.locals.user._id;
  
  try {
    // Обновляем пользователя по ID, возвращаем новый документ
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      req.body,
      { new: true } // Возвращаем обновлённый документ
    ).orFail(
      () => new NotFoundError(
        'Пользователь по заданному id отсутствует в базе'
      )
    );
    
    res.status(200).json(updatedUser);
  } catch (error) {
    if (error instanceof MongooseError.ValidationError) {
      return next(new BadRequestError(error.message));
    }
    next(error);
  }
};

export {
    getCurrentUser,
    getCurrentUserRoles,
    login,
    logout,
    refreshAccessToken,
    register,
    updateCurrentUser,
}
