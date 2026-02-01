import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
// import fs from 'fs';
import { promisify } from 'util';
import BadRequestError from '../errors/bad-request-error';

// Конфигурация хранения файлов
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const uniqueFilename = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueFilename);
  }
});

// Проверка MIME-типа
const isAllowedFileType = (mimetype: string): boolean => {
  const allowedTypes = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp'
  ];
  return allowedTypes.includes(mimetype);
};

// Настройка multer с лимитами
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 - 1, // 10 MB - 1 байт (строго < 10 MB)
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedFileType(file.mimetype)) {
      // Блокируем файл, но не передаём ошибку через cb
      return cb(null, false);
    }
    cb(null, true);
  }
});

const uploadSingle = promisify(upload.single('file'));

export const uploadFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await uploadSingle(req, res);

    // Если файл не загружен (ошибка multer или отсутствие файла)
    if (!req.file) {
      // multer уже отправил ответ (например, 400), но мы можем переопределить
      if (!res.headersSent) {
        return next(new BadRequestError('Файл не загружен'));
      }
      return;
    }

    // Проверка минимума (2 KB) — теперь после загрузки
    if (req.file.size <= 2 * 1024) {
      return next(new BadRequestError('Размер файла должен быть больше 2 KB'));
    }

    const uploadPath = process.env.UPLOAD_PATH || '';
    const fileName = `/${uploadPath}/${req.file.filename}`;

    return res.status(constants.HTTP_STATUS_CREATED).send({
      fileName,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    // Обработка ошибок multer (например, LIMIT_FILE_SIZE)
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new BadRequestError('Размер файла превышает 10 MB'));
      }
      return next(new BadRequestError(`Ошибка загрузки: ${error.message}`));
    }
    if (error instanceof BadRequestError) {
      return next(error);
    }
    return next(new BadRequestError('Ошибка при загрузке файла'));
  }
};

export default { uploadFile };
