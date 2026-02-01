// backend/src/middlewares/file.ts
import { Request, Express } from 'express';
import multer, { FileFilterCallback, StorageEngine } from 'multer';
import { join, resolve, normalize, extname } from 'path';
import fs from 'fs';
import crypto from 'crypto';


// Тип файла Multer
type MulterFile = Express.Multer.File;


// Допустимые MIME‑типы
const ACCEPTED_MIME_TYPES = new Set([
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
]);

// Соответствие MIME-типов и допустимых расширений
const MIME_TO_EXT: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpg': ['.jpg', '.jpeg'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/svg+xml': ['.svg'],
};

// Генерируем безопасное имя файла с использованием crypto.randomUUID
const generateSafeFileName = (file: MulterFile): string => {
  const ext = extname(file.originalname).toLowerCase();
  const uuid = crypto.randomUUID();
  return `${uuid}${ext}`;
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
  destination: (_req: Request, _file: MulterFile, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadDir);
  },
  filename: (_req: Request, file: MulterFile, cb: (error: Error | null, filename: string) => void) => {
    const safeName = generateSafeFileName(file);
    cb(null, safeName);
  },
});

// Фильтрация файлов по MIME‑типу и расширению (синхронная)
const fileFilter: (req: Request, file: MulterFile, cb: FileFilterCallback) => void = (
  _req: Request,
  file: MulterFile,
  cb: FileFilterCallback
) => {
  try {
    // 1. Проверка расширения файла
    const ext = extname(file.originalname).toLowerCase();
    if (!ext) {
      return cb(null, false);
    }

    // 2. Проверка MIME-типа по заголовку (эвристика)
    const mime = file.mimetype.toLowerCase();
    if (!ACCEPTED_MIME_TYPES.has(mime)) {
      return cb(null, false);
    }

    // 3. Соответствие MIME-типа и расширения
    const validExtensions = MIME_TO_EXT[mime];
    if (!validExtensions || !validExtensions.includes(ext)) {
      return cb(null, false);
    }

    // 4. Проверка безопасности пути
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
