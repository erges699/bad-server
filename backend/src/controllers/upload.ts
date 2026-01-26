import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import BadRequestError from '../errors/bad-request-error';
import path from 'path';

/**
 * Контроллер загрузки файла.
 * 
 * @param {Request} req - Объект запроса (должен содержать файл в req.file)
 * @param {Response} res - Объект ответа
 * @param {NextFunction} next - Функция перехода к следующему middleware
 * @returns {Response} JSON с путями к файлу при успешной загрузке
 * @throws {BadRequestError} Если файл не загружен или имя файла некорректно
 */
export const uploadFile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // 1. Проверка наличия файла
  if (!req.file) {
    return next(new BadRequestError('Файл не загружен'));
  }

  try {
    const file = req.file;

    // 2. Валидация имени файла (защита от путей с ../ и прочих инъекций)
    const sanitizedFilename = path.basename(file.filename);

    if (!sanitizedFilename || sanitizedFilename === '.') {
      return next(new BadRequestError('Некорректное имя файла'));
    }

    // 3. Проверка размера файла (пример: ограничение в 10МБ)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10МБ
    if (file.size > MAX_FILE_SIZE) {
      return next(new BadRequestError('Размер файла превышает допустимый лимит (10МБ)'));
    }

    // 4. Проверка MIME-типа (базовая защита от загрузки исполняемых файлов)
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'text/plain',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return next(new BadRequestError('Недопустимый тип файла'));
    }

    // 5. Формирование безопасного пути
    const uploadPath = process.env.UPLOAD_PATH
      ? path.join('/', process.env.UPLOAD_PATH, sanitizedFilename)
      : path.join('/', sanitizedFilename);

    return res.status(constants.HTTP_STATUS_CREATED).send({
      fileName: uploadPath,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    });

  } catch (error) {
    // 6. Обработка неожиданных ошибок
    return next(error);
  }
};

export default {};
