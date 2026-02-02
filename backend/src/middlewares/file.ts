// backend/src/middlewares/file.ts
import { Request, Express } from 'express';
import multer, { FileFilterCallback, StorageEngine } from 'multer';
import { join, extname } from 'path';
import crypto from 'crypto';

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

    if (file.size < 2048) {
      return cb(new Error('File too small. Minimum 2 KB required.') as unknown as null, false);
    }

    if (file.size > 10 * 1024 * 1024) {
      return cb(new Error('File too large. Maximum 10 MB allowed.') as unknown as null, false);
    }

    const ext = extname(file.originalname).toLowerCase();
    if (!ext) {
      return cb(new Error('Invalid file extension.') as unknown as null, false);
    }

    const mime = file.mimetype.toLowerCase();
    if (!ACCEPTED_MIME_TYPES.has(mime)) {
      return cb(new Error(`Unsupported MIME type: ${mime}`) as unknown as null, false);
    }

    const validExtensions = MIME_TO_EXT[mime];
    if (!validExtensions || !validExtensions.includes(ext)) {
      return cb(
        new Error(`MIME type ${mime} does not match extension ${ext}.`) as unknown as null,
        false
      );
    }

    cb(null, true);

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
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});
