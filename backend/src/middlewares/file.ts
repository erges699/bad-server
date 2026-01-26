import { Request, Express } from 'express';
import multer, { FileFilterCallback, diskStorage } from 'multer';
import { join, normalize, sep } from 'path';
import { createHash } from 'crypto';
import fs from 'fs';

/**
 * Максимальный допустимый размер файла в байтах (5 МБ).
 * @type {number}
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Безопасный путь к директории для загрузки файлов.
 * Формируется относительно текущего файла с учётом переменной окружения.
 * @type {string}
 */
const UPLOAD_DIR = normalize(
  join(__dirname, '..', 'public', process.env.UPLOAD_PATH_TEMP || 'uploads')
);

// Проверка существования директории и её создание при необходимости
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Список разрешённых MIME‑типов для загружаемых файлов.
 * Включает изображения, PDF и текстовые файлы.
 * @type {string[]}
 */
const ACCEPTED_MIME_TYPES = [
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
];

/**
 * Очищает имя файла от потенциально опасных символов и добавляет уникальный хеш.
 * Защищает от атак Path Traversal и коллизий имён.
 * 
 * @param {string} filename - Исходное имя файла от клиента
 * @returns {string} Безопасное имя файла с уникальным префиксом
 * @example
 * sanitizeFilename('photo.jpg') → 'a1b2c3d4_photo.jpg'
 */
const sanitizeFilename = (filename: string): string => {
  const sanitized = filename
    .replace(/[^a-zA-Z0-9_\- .]/g, '_')
    .replace(/\.+\./, '');

  const hash = createHash('md5')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex')
    .slice(0, 8);

  return `${hash}_${sanitized}`;
};

/**
 * Функция для определения пути сохранения файла.
 * Гарантирует использование безопасной директории.
 *
 * @param {Request} _req - Объект запроса Express (не используется)
 * @param {Express.Multer.File} _file - Информация о загружаемом файле (не используется)
 * @param {(error: Error | null, destination: string) => void} cb - Callback для передачи пути
 * @returns {void} Вызывает callback с безопасным путём к директории
 */
const destination = (
  _req: Request,
  _file: Express.Multer.File,
  cb: (error: Error | null, destination: string) => void
): void => {
  cb(null, UPLOAD_DIR);
};

/**
 * Функция для генерации имени файла при сохранении.
 * Использует безопасное имя с хешем и сохраняет оригинальное расширение.
 *
 * @param {Request} req - Объект запроса Express
 * @param {Express.Multer.File} file - Информация о загружаемом файле
 * @param {(error: Error | null, filename: string) => void} cb - Callback для передачи имени файла
 * @returns {void} Вызывает callback с безопасным именем файла
 */
const filename = (
  req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, filename: string) => void
): void => {
  const ext = file.originalname.split('.').pop() || '';
  const safeName = sanitizeFilename(file.originalname);
  cb(null, `${safeName}.${ext}`);
};

/**
 * Фильтр для проверки валидности загружаемого файла.
 * Проверяет MIME‑тип, размер и расширение файла.
 *
 * @param {Request} req - Объект запроса Express
 * @param {Express.Multer.File} file - Информация о загружаемом файле
 * @param {FileFilterCallback} cb - Callback для разрешения/запрета загрузки
 * @returns {void} Вызывает callback с ошибкой или подтверждением
 * @throws {multer.MulterError} При нарушении правил загрузки
 */
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  // Проверка MIME‑типа
  if (!ACCEPTED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Неподдерживаемый тип файла'),
      false
    );
  }

  // Проверка размера файла
  if (file.size > MAX_FILE_SIZE) {
    return cb(
      new multer.MulterError('LIMIT_FILE_SIZE', 'Файл превышает допустимый размер (5 МБ)'),
      false
    );
  }

  // Проверка расширения
  const allowedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'pdf', 'txt'];
  const ext = file.originalname
    .toLowerCase()
    .split('.')
    .pop();

  if (!ext || !allowedExtensions.includes(ext)) {
    return cb(
      new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Недопустимое расширение файла'),
      false
    );
  }

  cb(null, true);
};

/**
 * Настроенный экземпляр multer для обработки загрузок файлов.
 * Включает:
 * - Безопасное хранение файлов
 * - Фильтрацию по типу/размеру
 * - Ограничение количества файлов (5 за запрос)
 * - Генерацию уникальных имён
 *
 * @exports
 * @type {multer.Multer}
 */
export default multer({
  storage: diskStorage({ destination, filename }),
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5,
  },
});
