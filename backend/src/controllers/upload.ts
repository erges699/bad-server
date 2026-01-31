import { Request, Response } from 'express';
import { join, resolve, normalize } from 'path';
import fs from 'fs';
import { fileTypeFromBuffer } from 'file-type';

// Интерфейс для ответа API
interface UploadResponse {
  filename: string;
  path: string;
  size: number;
  mimetype: string;
}

/**
 * Контроллер загрузки файла
 * @param req - объект запроса Express
 * @param res - объект ответа Express
 * @param next - функция передачи управления следующему middleware
 */
export const uploadFile = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    // Деструктуризация: извлекаем file из req
    const { file } = req;

    // 1. Проверка: файл загружен
    if (!file) {
      return res.status(400).json({
        error: 'Файл не загружен или отсутствует в запросе',
      });
    }

    // 2. Преобразуем Buffer в Uint8Array (один раз для всех операций)
    const bufferAsUint8Array = new Uint8Array(
      file.buffer.buffer,
      file.buffer.byteOffset,
      file.buffer.length
    );

    // 3. Проверка MIME‑типа через содержимое
    let type;
    try {
      type = await fileTypeFromBuffer(bufferAsUint8Array);
      if (!type) {
        return res.status(400).json({ error: 'Не удалось определить тип файла' });
      }

      // Список разрешённых MIME‑типов
      const allowedMimeTypes = [
        'image/png',
        'image/jpg',
        'image/jpeg',
        'image/gif',
        'image/svg+xml',
      ];

      if (!allowedMimeTypes.includes(type.mime)) {
        return res.status(400).json({
          error: `Недопустимый тип файла: ${type.mime}`,
        });
      }
    } catch (err) {
      console.error('Ошибка при анализе типа файла:', err);
      return res.status(500).json({ error: 'Ошибка при анализе типа файла' });
    }

    // 4. Определение пути сохранения
    const uploadDir = resolve(__dirname, '../../public/uploads');
    const safeFilename = file.filename; // Уже безопасно (сгенерировано в middleware)
    const fullPath = join(uploadDir, safeFilename);

    // 5. Проверка безопасности пути (защита от path traversal)
    if (!normalize(fullPath).startsWith(normalize(uploadDir))) {
      return res.status(403).json({ error: 'Запрещённый путь для сохранения файла' });
    }

    // 6. Создание директории, если её нет
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // 7. Сохранение файла (используем уже созданный bufferAsUint8Array)
    try {
      fs.writeFileSync(fullPath, bufferAsUint8Array);
    } catch (err) {
      console.error('Ошибка при сохранении файла:', err);
      return res.status(500).json({ error: 'Ошибка при сохранении файла на сервере' });
    }

    // 8. Формирование ответа
    const responseData: UploadResponse = {
      filename: safeFilename,
      path: `/uploads/${safeFilename}`,
      size: file.size,
      mimetype: file.mimetype,
    };

    return res.status(201).json(responseData);
  } catch (err) {
    console.error('Ошибка в контроллере загрузки:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

/**
 * Контроллер получения списка файлов
 * @param req - объект запроса Express
 * @param res - объект ответа Express
 * @param next - функция передачи управления следующему middleware
 */
export const listFiles = async (
  res: Response,
): Promise<Response> => {
  const uploadDir = resolve(__dirname, '../../public/uploads');


  try {
    // Если директория не существует — возвращаем пустой список
    if (!fs.existsSync(uploadDir)) {
      return res.status(200).json([]);
    }

    // Чтение содержимого директории
    const files = fs.readdirSync(uploadDir);

    // Формирование списка файлов с метаданными
    const fileList = files.map((filename) => ({
      filename,
      path: `/uploads/${filename}`,
      size: fs.statSync(join(uploadDir, filename)).size,
    }));

    return res.status(200).json(fileList);
  } catch (err) {
    console.error('Ошибка при получении списка файлов:', err);
    return res.status(500).json({ error: 'Ошибка при получении списка файлов' });
  }
};
