// backend/src/controllers/upload.ts
import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import BadRequestError from '../errors/bad-request-error';
import { lookup } from 'mime';


// Сигнатуры изображений (в HEX)
const IMAGE_SIGNATURES = {
  png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  jpg: [0xFF, 0xD8, 0xFF],
  jpeg: [0xFF, 0xD8, 0xFF],
  gif: [0x47, 0x49, 0x46, 0x38],
  svg: [0x3C, 0x3F, 0x78, 0x6D, 0x6C]
} as const;

type ImageFormat = keyof typeof IMAGE_SIGNATURES;

// Тип-гард для проверки, является ли строка допустимым форматом изображения
const isValidImageFormat = (ext: string): ext is ImageFormat => {
  return Object.prototype.hasOwnProperty.call(IMAGE_SIGNATURES, ext);
};

// Проверка сигнатуры файла по первым байтам
const checkImageSignature = (buffer: Buffer, mimeType: string): boolean => {
  // Получаем расширение по MIME-типу
  const ext = lookup(mimeType)?.toLowerCase() || '';

  // Если расширение не распознано или не поддерживается — пропускаем проверку
  if (!ext || !isValidImageFormat(ext)) {
    return true;
  }

  const signature = IMAGE_SIGNATURES[ext];

  // Сравниваем первые байты буфера с сигнатурой
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) {
      return false;
    }
  }
  return true;
};

// Константы размеров
const MIN_FILE_SIZE = 2048; // 2 KB
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB


export const uploadFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.file) {
    return next(new BadRequestError('Файл не загружен'));
  }

  const file = req.file;

  // 1. Проверка MIME-типа
  if (!file.mimetype) {
    return next(new BadRequestError('Не указан MIME-тип файла'));
  }

  const ACCEPTED_MIME_TYPES = [
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/gif',
    'image/svg+xml'
  ];

  if (!ACCEPTED_MIME_TYPES.includes(file.mimetype)) {
    return next(new BadRequestError('Недопустимый тип файла'));
  }

  // 2. Проверка размера
  if (file.size < MIN_FILE_SIZE) {
    return next(new BadRequestError('Размер файла должен быть больше 2KB'));
  }
  if (file.size > MAX_FILE_SIZE) {
    return next(new BadRequestError('Размер файла не должен превышать 10MB'));
  }

  // 3. Проверка сигнатуры файла (чтобы убедиться, что это реально изображение)
  if (!file.buffer) {
    return next(new BadRequestError('Не удалось прочитать содержимое файла'));
  }

  if (!checkImageSignature(file.buffer, file.mimetype)) {
    return next(new BadRequestError('Файл не является корректным изображением'));
  }

  try {
    // Формируем путь к файлу
    const fileName = process.env.UPLOAD_PATH_TEMP
      ? `/${process.env.UPLOAD_PATH_TEMP}/${file.filename}`
      : `/${file.filename}`;

      console.log('file.filename:', file.filename);          // Сгенерированное имя
      console.log('file.originalname:', file.originalname);  // Оригинальное имя
      console.log('Ответ fileName:', fileName);                  // Что пойдёт в ответ

    return res.status(constants.HTTP_STATUS_CREATED).send({
      fileName,
      originalName: file.originalname,
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  uploadFile
};
