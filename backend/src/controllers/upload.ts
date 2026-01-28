import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import path from 'path';
import crypto from 'crypto';
import BadRequestError from '../errors/bad-request-error';

const ACCEPTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
  'text/plain',
]);

const ACCEPTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt']);

const MIN_FILE_SIZE = 2 * 1024; // 2 КБ
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 МБ

export const uploadFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.file) {
    return next(new BadRequestError('Файл не загружен'));
  }

  try {
    if (req.file.size < MIN_FILE_SIZE) {
      return next(new BadRequestError('Размер файла меньше допустимого лимита (2 КБ)'));
    }

    if (req.file.size > MAX_FILE_SIZE) {
      return next(new BadRequestError('Размер файла превышает допустимый лимит (10 МБ)'));
    }

    if (!ACCEPTED_MIME_TYPES.has(req.file.mimetype)) {
      return next(new BadRequestError('Неподдерживаемый тип файла'));
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      return next(new BadRequestError('Неподдерживаемое расширение файла'));
    }

    const safeFilename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;

    const uploadPath = process.env.UPLOAD_PATH
      ? path.resolve(process.env.UPLOAD_PATH)
      : path.resolve('./uploads');

    const filePath = path.join(uploadPath, safeFilename);

    return res.status(constants.HTTP_STATUS_CREATED).send({
      fileName: safeFilename,
      originalName: req.file.originalname,
      filePath,
    });
  } catch (error) {
    return next(error);
  }
};

export default {};
