import { Request, Express } from 'express';
import multer, { FileFilterCallback, StorageEngine } from 'multer';
import { join, extname } from 'path';
import crypto from 'crypto';

type DestinationCallback = (error: Error | null, destination: string) => void;
type FileNameCallback = (error: Error | null, filename: string) => void;
type MulterFile = Express.Multer.File;

const allowedMimeTypes = [
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
];

const MIN_FILE_SIZE = 2048; // 2 KB в байтах
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB в байтах

const generateSafeFileName = (file: MulterFile): string => {
  const ext = extname(file.originalname).toLowerCase();
  const uuid = crypto.randomUUID();
  return `${uuid}${ext}`;
};

const storage: StorageEngine = multer.diskStorage({
  destination: (
    _req: Request,
    _file: Express.Multer.File,
    cb: DestinationCallback
  ) => {
    cb(
      null,
      join(
        __dirname,
        process.env.UPLOAD_PATH_TEMP
          ? `../public/${process.env.UPLOAD_PATH_TEMP}`
          : '../public'
      )
    );
  },
  filename: (
    _req: Request,
    file: Express.Multer.File,
    cb: FileNameCallback
  ) => {
    const safeName = generateSafeFileName(file);
    cb(null, safeName);
  },
});

const fileFilter: (req: Request, file: MulterFile, cb: FileFilterCallback) => void = (
  _req,
  file,
  cb
) => {
  // 1. Проверка MIME-типа
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(null, false);
  }

  // 2. Проверка минимального размера (2 KB)
  if (file.size < MIN_FILE_SIZE) {
    return cb(null, false);
  }

  // 3. Проверка максимального размера (10 MB)
  if (file.size > MAX_FILE_SIZE) {
    return cb(null, false);
  }

  cb(null, true);
};

export default multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});
