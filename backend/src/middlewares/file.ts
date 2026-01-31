import { Request, Express } from 'express';
import multer, { FileFilterCallback, StorageEngine } from 'multer';
import { join, resolve, normalize, extname } from 'path';
import { fileTypeFromBuffer } from 'file-type';
import crypto from 'crypto';
import fs from 'fs';

// Типы для callback-функций Multer
type DestinationCallback = (error: Error | null, destination: string) => void;
type FileNameCallback = (error: Error | null, filename: string) => void;


// Допустимые MIME‑типы
const ACCEPTED_MIME_TYPES = [
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
];

// Генерируем безопасное имя файла
const generateSafeFileName = (file: Express.Multer.File): string => {
  const ext = extname(file.originalname).toLowerCase();
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${randomHash}${ext}`;
};

// Проверяем, что путь не выходит за пределы разрешённой директории
const isSafePath = (baseDir: string, targetPath: string): boolean => {
  const normalized = normalize(targetPath);
  return normalized.startsWith(baseDir);
};

// Создаём директорию, если её нет
const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Определяем директорию для загрузки
const uploadDir = resolve(
  __dirname,
  '../../public',
  process.env.UPLOAD_PATH_TEMP || 'temp'
);

// Гарантируем существование директории
ensureDirectoryExists(uploadDir);

// Настройка хранилища Multer (тип StorageEngine)
const storage: StorageEngine = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: DestinationCallback) => {
    cb(null, uploadDir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb: FileNameCallback) => {
    const safeName = generateSafeFileName(file);
    cb(null, safeName);
  },
});

// Фильтрация файлов по MIME‑типу и содержимому
const fileFilter = async (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  try {
    // Преобразуем Buffer в Uint8Array для совместимости с file-type
    const bufferAsUint8Array = new Uint8Array(file.buffer);
    const type = await fileTypeFromBuffer(bufferAsUint8Array);

    if (!type || !ACCEPTED_MIME_TYPES.includes(type.mime)) {
      return cb(null, false);
    }

    // Дополнительная проверка расширения
    const ext = extname(file.originalname).toLowerCase();
    const mimeToExt: { [key: string]: string[] } = {
      'image/png': ['.png'],
      'image/jpg': ['.jpg', '.jpeg'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/gif': ['.gif'],
      'image/svg+xml': ['.svg'],
    };
    if (!mimeToExt[type.mime]?.includes(ext)) {
      return cb(null, false);
    }

    // Проверяем безопасность пути
    const fullPath = join(uploadDir, generateSafeFileName(file));
    if (!isSafePath(uploadDir, fullPath)) {
      console.error('Недопустимый путь к файлу:', fullPath);
      return cb(null, false);
    }

    cb(null, true);
  } catch (err) {
    console.error('Ошибка при проверке файла:', err);
    cb(null, false);
  }
};


// Экспортируем настроенного Multer с лимитами
export default multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1, // Только 1 файл за запрос
  },
});
