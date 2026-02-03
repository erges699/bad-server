// backend/src/controllers/upload.ts
import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import BadRequestError from '../errors/bad-request-error';

const ACCEPTED_MIME_TYPES = [
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
];

const MIN_FILE_SIZE = 2048; // 2 KB
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const uploadFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.file) {
        return next(new BadRequestError('Файл не загружен'))
    }

    // const mime = req.file.mimetype.toLowerCase();
    if (!ACCEPTED_MIME_TYPES.includes(req.file.mimetype)) {
      return next(new BadRequestError('Недопустимый тип файла'));
    }
    
    // 3. Минимальный размер (2 KB)
    if (req.file.size < MIN_FILE_SIZE) {
      return next(new BadRequestError('Размер файла должен быть больше 2KB'));
    }

    // 4. Максимальный размер (10 MB) — Multer уже проверяет через limits
    if (req.file.size > MAX_FILE_SIZE) {
      return next(new BadRequestError('Размер файла не должен превышать 10MB'));
    }

    try {
        const fileName = process.env.UPLOAD_PATH
            ? `/${process.env.UPLOAD_PATH}/${req.file.filename}`
            : `/${req.file?.filename}`
        return res.status(constants.HTTP_STATUS_CREATED).send({
            fileName,
            originalName: req.file?.originalname,
        })
    } catch (error) {
        return next(error)
    }
}

export default {}
