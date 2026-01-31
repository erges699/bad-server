// backend/src/controllers/upload.ts
import { Request, Response } from 'express';
import { join, resolve, normalize, extname } from 'path';
import fs from 'fs';
import { fileTypeFromBuffer } from 'file-type';
import crypto from 'crypto';

interface UploadResponse {
  fileName: string;
  originalName: string;
  path: string;
  size: number;
  mimetype: string;
}

export const uploadFile = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { file } = req;

    if (!file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // Преобразуем Buffer в Uint8Array
    const bufferAsUint8Array = new Uint8Array(
      file.buffer.buffer,
      file.buffer.byteOffset,
      file.buffer.length
    );

    // Проверка MIME‑типа
    let type;
    try {
      type = await fileTypeFromBuffer(bufferAsUint8Array);
      if (!type) {
        return res.status(400).json({ error: 'Не удалось определить тип файла' });
      }

      const allowedMimeTypes = [
        'image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/svg+xml'
      ];
      if (!allowedMimeTypes.includes(type.mime)) {
        return res.status(400).json({
          error: `Недопустимый тип: ${type.mime}`
        });
      }
    } catch (err) {
      console.error('Ошибка проверки MIME:', err);
      return res.status(500).json({ error: 'Ошибка проверки типа файла' });
    }

    // Безопасное имя файла (используем crypto.randomUUID)
    const uploadDir = resolve(__dirname, '../../public/uploads');
    const uniquefileName = `${crypto.randomUUID()}${extname(file.originalname)}`;
    const fullPath = join(uploadDir, uniquefileName);

    // Защита от path traversal
    if (!normalize(fullPath).startsWith(normalize(uploadDir))) {
      return res.status(403).json({ error: 'Запрещённый путь' });
    }

    // Создание директории
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Сохранение файла
    try {
      fs.writeFileSync(fullPath, bufferAsUint8Array);
    } catch (err) {
      console.error('Ошибка сохранения:', err);
      return res.status(500).json({ error: 'Не удалось сохранить файл' });
    }

    // Ответ
    const responseData: UploadResponse = {
      fileName: uniquefileName,
      originalName: file.originalname,
      path: `/uploads/${uniquefileName}`,
      size: file.size,
      mimetype: file.mimetype,
    };

    return res.status(201).json(responseData);
  } catch (err) {
    console.error('Ошибка загрузки:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка' });
  }
};
