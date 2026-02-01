import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { promisify } from 'util';
import BadRequestError from '../errors/bad-request-error';

// Конфигурация хранения файлов через multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    // Генерируем уникальное имя с помощью crypto.randomUUID()
    const uniqueFilename = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueFilename);
  }
});

// Проверка допустимых MIME-типов
const isAllowedFileType = (mimetype: string): boolean => {
  const allowedTypes = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp'
  ];
  return allowedTypes.includes(mimetype);
};

// Настройка multer с лимитами и фильтрацией
const upload = multer({
  storage,
  limits: {
    fileSize: 1000000 // 1MB
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedFileType(file.mimetype)) {
      return cb(new Error('Error: images only'));
    }
    cb(null, true);
  }
});

// Промисифицированная версия multer для использования в async/await
const uploadSingle = promisify(upload.single('file'));

export const uploadFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Обрабатываем файл через multer
    await uploadSingle(req, res);

    if (!req.file) {
      return next(new BadRequestError('Файл не загружен'));
    }

    // Формируем путь к файлу
    const uploadPath = process.env.UPLOAD_PATH || '';
    const fileName = `/${uploadPath}/${req.file.filename}`;

    return res.status(constants.HTTP_STATUS_CREATED).send({
      fileName,
      originalName: req.file.originalname
    });
  } catch (error) {
    // Обработка ошибок multer (например, превышение размера или неверный тип файла)
    if (error instanceof Error) {
      if (error.message === 'Error: images only') {
        return next(new BadRequestError('Допустимы только изображения (PNG, JPEG, JPG, WebP)'));
      }
      if (error.message.includes('File too large')) {
        return next(new BadRequestError('Размер файла превышает 1 МБ'));
      }
    }
    return next(error);
  }
};

export default {
  uploadFile
};
