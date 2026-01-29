// backend/src/middlewares/admin-guard.ts

import { Request, Response, NextFunction } from 'express';
import UnauthorizedError  from '../errors/unauthorized-error';

export const isAdmin = (req: Request & { user?: { isAdmin: boolean } }, _res: Response, next: NextFunction) => {
  if (!req.user || !req.user.isAdmin) {
    return next(new UnauthorizedError('Доступ только для администраторов'));
  }
  next();
};

