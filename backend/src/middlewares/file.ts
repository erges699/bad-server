// backend/src/middlewares/file.ts
import { Request, Express } from 'express';
import multer, { FileFilterCallback, StorageEngine } from 'multer';
import { join, extname } from 'path';
import crypto from 'crypto';
import { fileTypeFromBuffer } from 'file-type';

type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void
type MulterFile = Express.Multer.File;

const ACCEPTED_MIME_TYPES = new Set([
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
]);

const MIME_TO_EXT: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpg': ['.jpg', '.jpeg'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/svg+xml': ['.svg'],
};

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
        )
   },
    filename: (
        _req: Request,
        file: Express.Multer.File,
        cb: FileNameCallback
    ) => {
    const safeName = generateSafeFileName(file);
    cb(null, safeName);
    },
})

const fileFilter: (req: Request, file: MulterFile, cb: FileFilterCallback) => void = async (
  _req: Request,
  file: MulterFile,
  cb: FileFilterCallback
) => {
  try {
    // 1. Проверка минимального размера (2KB)
    if (file.size < 2048) {
      return cb(new Error('File too small. Minimum 2 KB required.') as unknown as null, false);
    }

    // 2. Проверка максимального размера (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return cb(new Error('File too large. Maximum 10 MB allowed.') as unknown as null, false);
    }

    // 3. Проверка расширения
    const ext = extname(file.originalname).toLowerCase();
    if (!ext) {
      return cb(new Error('Invalid file extension.') as unknown as null, false);
    }

    // 4. Проверка MIME по заголовку
    const mime = file.mimetype.toLowerCase();
    if (!ACCEPTED_MIME_TYPES.has(mime)) {
      return cb(new Error(`Unsupported MIME type: ${mime}`) as unknown as null, false);
    }

    // 5. Соответствие MIME и расширения
    const validExtensions = MIME_TO_EXT[mime];
    if (!validExtensions || !validExtensions.includes(ext)) {
      return cb(
        new Error(`MIME type ${mime} does not match extension ${ext}.`) as unknown as null,
        false
      );
    }

    // 6. Глубокая проверка содержимого (через file-type)
    try {
      const uint8Array = new Uint8Array(file.buffer);
      const fileType = await fileTypeFromBuffer(uint8Array);

      if (!fileType || !ACCEPTED_MIME_TYPES.has(fileType.mime)) {
        return cb(
          new Error('Invalid file content. Not a valid image.') as unknown as null,
          false
        );
      }
    } catch (err) {
      console.error('Ошибка при анализе содержимого файла:', err);
      return cb(
        new Error('Failed to validate file content.') as unknown as null,
        false
      );
    }

    cb(null, true); // Всё ок

  } catch (err) {
    console.error('Ошибка при проверке файла:', err);
    const error = err instanceof Error ? err : new Error('File validation failed.');
    cb(error as unknown as null, false);
  }
};

export default multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB (максимум)
    files: 1,
  },
});
