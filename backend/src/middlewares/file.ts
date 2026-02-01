// backend/src/middlewares/file.ts
import { Request, Express } from 'express';
import multer, { FileFilterCallback, StorageEngine } from 'multer';
import { join, resolve, normalize, extname } from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileTypeFromBuffer } from 'file-type';

type MulterFile = Express.Multer.File;


// Разрешённые MIME‑типы изображений
const ACCEPTED_MIME_TYPES = new Set([
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
]);

// Соответствие MIME‑типа и допустимых расширений
const MIME_TO_EXT: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpg': ['.jpg', '.jpeg'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/svg+xml': ['.svg'],
};

/**
 * Генерирует безопасное имя файла: UUID + оригинальное расширение
 */
const generateSafeFileName = (file: MulterFile): string => {
  const ext = extname(file.originalname).toLowerCase();
  const uuid = crypto.randomUUID();
  return `${uuid}${ext}`;
};

/**
 * Проверяет, что целевой путь находится внутри базовой директории (защита от path traversal)
 */
const isSafePath = (baseDir: string, targetPath: string): boolean => {
  const normalized = normalize(targetPath);
  return normalized.startsWith(baseDir);
};

/**
 * Создаёт директорию, если её не существует
 */
const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Директория для временных загрузок
const uploadDir = resolve(
  __dirname,
  '../../public',
  process.env.UPLOAD_PATH_TEMP || 'temp'
);

ensureDirectoryExists(uploadDir);

/**
 * Настройка хранилища для multer: сохранение на диск
 */
const storage: StorageEngine = multer.diskStorage({
  destination: (
    _req: Request,
    _file: MulterFile,
    cb: (error: Error | null, destination: string) => void
  ) => {
    cb(null, uploadDir);
  },
  filename: (
    _req: Request,
    file: MulterFile,
    cb: (error: Error | null, filename: string) => void
  ) => {
    const safeName = generateSafeFileName(file);
    cb(null, safeName);
  },
});

/**
 * Валидация файла перед сохранением
 */
const fileFilter: (req: Request, file: MulterFile, cb: FileFilterCallback) => void = async (
  _req: Request,
  file: MulterFile,
  cb: FileFilterCallback
) => {
  try {
    // 1. Минимум 2 KB
    if (file.size < 2048) {
      return cb(null, false);
    }

    // 2. Максимум 10 MB
    if (file.size > 10 * 1024 * 1024) {
      return cb(null, false);
    }

    // 3. Проверка расширения
    const ext = extname(file.originalname).toLowerCase();
    if (!ext) {
      return cb(null, false);
    }

    // 4. Проверка MIME из заголовка
    const mime = file.mimetype.toLowerCase();
    if (!ACCEPTED_MIME_TYPES.has(mime)) {
      return cb(null, false);
    }

    // 5. Соответствие MIME и расширения
    const validExtensions = MIME_TO_EXT[mime];
    if (!validExtensions || !validExtensions.includes(ext)) {
      return cb(null, false);
    }

    // 6. Глубокая проверка содержимого (по магическим числам)
    try {
      const uint8Array = new Uint8Array(file.buffer);
      const fileType = await fileTypeFromBuffer(uint8Array);
      if (!fileType || !ACCEPTED_MIME_TYPES.has(fileType.mime)) {
        return cb(null, false);
      }
    } catch (err) {
      console.error('Ошибка при анализе содержимого файла:', err);
      return cb(null, false);
    }

    // 7. Проверка безопасности пути
    const fullPath = join(uploadDir, generateSafeFileName(file));
    if (!isSafePath(uploadDir, fullPath)) {
      console.error('Недопустимый путь к файлу:', fullPath);
      return cb(null, false);
    }

    // Всё ок — разрешаем загрузку
    cb(null, true);

  } catch (err) {
    console.error('Неожиданная ошибка при проверке файла:', err);
    cb(null, false);
  }
};

/**
 * Экспорт настроенного middleware multer
 */
export default multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1, // Только 1 файл за запрос
  },
});
