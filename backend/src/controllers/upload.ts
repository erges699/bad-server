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

// Проверка на небезопасные символы в имени файла
const isFilenameSafe = (filename: string): boolean => {
  const unsafeChars = /[<>:"/\\|?*]|^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  return !unsafeChars.test(filename);
};

export const uploadFile = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { file } = req;

    if (!file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // Проверка имени файла на небезопасные символы
    if (!isFilenameSafe(file.originalname)) {
      return res.status(400).json({ error: 'Недопустимое имя файла' });
    }

    // Преобразуем Buffer в Uint8Array для проверки MIME
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
        'image/png',
        'image/jpg',
        'image/jpeg',
        'image/gif',
        'image/svg+xml'
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

    // Временная директория (как в новой версии)
    const uploadDir = resolve(
      __dirname,
      '../public/',
      process.env.UPLOAD_PATH_TEMP || ''
    );

    // Безопасное имя файла
    const uniqueFileName = `${crypto.randomUUID()}${extname(file.originalname)}`;
    const finalPath = join(uploadDir, uniqueFileName);

    // Защита от path traversal
    if (
      !normalize(finalPath).startsWith(normalize(uploadDir))
    ) {
      return res.status(403).json({ error: 'Запрещённый путь' });
    }

    // Создание директорий (если нет)
    [uploadDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });


    try {
      fs.renameSync(finalPath, finalPath);
    } catch (err) {
      console.error('Ошибка перемещения файла:', err);
      // Удаляем временный файл при ошибке
      try {
        fs.unlinkSync(finalPath);
      } catch (unlinkErr) {
        console.error('Не удалось удалить временный файл:', unlinkErr);
      }
      return res.status(500).json({ error: 'Не удалось переместить файл в uploads' });
    }


    // Ответ
    const responseData: UploadResponse = {
      fileName: uniqueFileName,
      originalName: file.originalname,
      path: `/uploads/${uniqueFileName}`,
      size: file.size,
      mimetype: file.mimetype,
    };

    return res.status(201).json(responseData);

  } catch (err) {
    console.error('Ошибка загрузки:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка' });
  }
};
