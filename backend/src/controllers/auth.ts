import crypto from 'crypto'
import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { Error as MongooseError } from 'mongoose'
import { REFRESH_TOKEN } from '../config'
import BadRequestError from '../errors/bad-request-error'
import ConflictError from '../errors/conflict-error'
import NotFoundError from '../errors/not-found-error'
import UnauthorizedError from '../errors/unauthorized-error'
import User from '../models/user'

// POST /auth/login
const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return next(new BadRequestError('Email и пароль обязательны'));
        }

        const user = await User.findUserByCredentials(email, password);
        const accessToken = user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();

        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            {
                ...REFRESH_TOKEN.cookie.options,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            }
        );

        return res.json({
            success: true,
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                roles: user.roles,
            },
            accessToken,
        });
    } catch (err) {
        return next(err);
    }
};


// POST /auth/register
const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
            return next(new BadRequestError('Email, пароль и имя обязательны'));
        }

        const newUser = new User({ email, password, name });
        await newUser.save();

        const accessToken = newUser.generateAccessToken();
        const refreshToken = await newUser.generateRefreshToken();

        res.cookie(
            REFRESH_TOKEN.cookie.name,
            refreshToken,
            {
                ...REFRESH_TOKEN.cookie.options,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            }
        );

        return res.status(constants.HTTP_STATUS_CREATED).json({
            success: true,
            user: {
                _id: newUser._id,
                email: newUser.email,
                name: newUser.name,
                roles: newUser.roles,
            },
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


// GET /auth/user
const getCurrentUser = async (
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user?._id;
        if (!userId) {
            return next(new UnauthorizedError('Пользователь не аутентифицирован'));
        }

        const user = await User.findById(userId).orFail(
            () => new NotFoundError('Пользователь по заданному id отсутствует в базе')
        );

        res.json({
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                roles: user.roles,
            },
            success: true
        });
    } catch (error) {
        next(error);
    }
};


const deleteRefreshTokenInUser = async (
    req: Request,
    _res: Response,
    _next: NextFunction
) => {
    const { cookies } = req;
    const rfTkn = cookies[REFRESH_TOKEN.cookie.name];

    if (!rfTkn) {
        throw new UnauthorizedError('Не валидный токен');
    }

    try {
        const decodedRefreshTkn = jwt.verify(
            rfTkn,
            REFRESH_TOKEN.secret
        ) as JwtPayload;

        const user = await User.findOne({
            _id: decodedRefreshTkn._id,
        }).orFail(() => new UnauthorizedError('Пользователь не найден в базе'));

        const rTknHash = crypto
            .createHmac('sha256', REFRESH_TOKEN.secret + user.salt)
            .update(rfTkn)
            .digest('hex');

        user.tokens = user.tokens.filter((tokenObj) => tokenObj.token !== rTknHash);
        await user.save();

        return user;
    } catch (err) {
        if (err instanceof jwt.JsonWebTokenError) {
            throw new UnauthorizedError('Токен недействителен');
        }
        throw err;
    }
};


// Реализация удаления токена из базы может отличаться
// GET  /auth/logout
const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await deleteRefreshTokenInUser(req, res, next);
        res.clearCookie(REFRESH_TOKEN.cookie.name, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};


// GET  /auth/token
const refreshAccessToken = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
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
            {
                ...REFRESH_TOKEN.cookie.options,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            }
        );

        return res.json({
            success: true,
            user: {
                _id: userWithRefreshTkn._id,
                email: userWithRefreshTkn.email,
                name: userWithRefreshTkn.name
            },
            accessToken,
        });
    } catch (error) {
        return next(error);
    }
};

const getCurrentUserRoles = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    try {
        await User.findById(userId, req.body, {
            new: true,
        }).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.status(200).json(res.locals.user.roles)
    } catch (error) {
        next(error)
    }
}

const updateCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    try {
        const updatedUser = await User.findByIdAndUpdate(userId, req.body, {
            new: true,
        }).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.status(200).json(updatedUser)
    } catch (error) {
        next(error)
    }
}

export {
    getCurrentUser,
    getCurrentUserRoles,
    login,
    logout,
    refreshAccessToken,
    register,
    updateCurrentUser,
}
