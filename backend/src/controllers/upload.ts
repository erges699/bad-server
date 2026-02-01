import { NextFunction, Request, Response } from 'express';
import { constants } from 'http2';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import BadRequestError from '../errors/bad-request-error';

// Расширяем тип Request
interface CustomRequest extends Request {
  fileValidationError?: Error;
}

const ensureUploadDir = () => {
  const uploadPath = process.env.UPLOAD_PATH || './uploads';
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, process.env.UPLOAD_PATH || './uploads');
  },
  filename: (_req, file, cb) => {
    const uniqueFilename = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueFilename);
  }
});

const isAllowedFileType = (mimetype: string): boolean =>
  ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mimetype);

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 - 1, // < 10 MB
    files: 1
  },
  fileFilter: (req: CustomRequest, file, cb) => {
    if (!isAllowedFileType(file.mimetype)) {
      (req).fileValidationError = new BadRequestError(
        'Допустимы только изображения (PNG, JPEG, JPG, WebP)'
      );
      return cb(null, false);
    }
    cb(null, true);
  }
});

const uploadSingle = promisify(upload.single('file'));

export const uploadFile = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    await uploadSingle(req, res);

    if (!req.file) {
      if (req.fileValidationError) {
        return next(req.fileValidationError);
      }
      return next(new BadRequestError('Файл не загружен'));
    }

    if (req.file.size <= 2 * 1024) {
      return next(new BadRequestError('Размер файла должен быть больше 2 KB'));
    }

    const uploadPath = process.env.UPLOAD_PATH || '';
    const fileName = `/${uploadPath}/${req.file.filename}`;

    res.status(constants.HTTP_STATUS_CREATED).json({
      fileName,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new BadRequestError('Размер файла превышает 10 MB'));
      }
      return next(new BadRequestError(`Ошибка загрузки: ${error.message}`));
    }
    if (error instanceof BadRequestError) {
      return next(error);
    }
    next(new BadRequestError('Ошибка при загрузке файла'));
  }
};

export default { uploadFile };
