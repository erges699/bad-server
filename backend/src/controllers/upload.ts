// backend/src/controllers/upload.ts
import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import BadRequestError from '../errors/bad-request-error';

export const uploadFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.file) {
      return next(new BadRequestError('Файл не загружен'));
    }

    const fileName = process.env.UPLOAD_PATH
      ? `/${process.env.UPLOAD_PATH}/${req.file.filename}`
      : `/${req.file.filename}`;

    return res.status(constants.HTTP_STATUS_CREATED).json({
      fileName,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  } catch (error) {
    return next(error);
  }
};
