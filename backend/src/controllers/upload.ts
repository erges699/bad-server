import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import multer from 'multer';
import { promisify } from 'util';
import BadRequestError from '../errors/bad-request-error'

interface CustomRequest extends Request {
  fileValidationError?: Error;
}

const isAllowedFileType = (mimetype: string): boolean =>
  ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mimetype);

const upload = multer({
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

    try {
        const fileName = process.env.UPLOAD_PATH
            ? `/${process.env.UPLOAD_PATH}/${req.file.filename}`
            : `/${req.file?.filename}`
        return res.status(constants.HTTP_STATUS_CREATED).send({
            fileName,
            originalName: req.file?.originalname,
        })
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
}

export default {}
