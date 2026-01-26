import { existsSync, rename } from 'fs';
import { basename, join, normalize } from 'path';
import { promisify } from 'util';

const renamePromise = promisify(rename);

/**
 * Перемещение файла из временной директории в постоянную.
 * 
 * @param {string} imagePath - Исходное имя файла (только имя, без пути)
 * @param {string} from - Абсолютный путь к исходной директории
 * @param {string} to - Абсолютный путь к целевой директории
 * @throws {Error} При ошибках валидации или перемещения
 */
async function movingFile(imagePath: string, from: string, to: string): Promise<void> {
  // 1. Валидация входных параметров
  if (!imagePath || !from || !to) {
    throw new Error('Не указаны обязательные параметры');
  }

  // 2. Нормализация путей для защиты от обхода директорий (../)
  const normalizedFrom = normalize(from);
  const normalizedTo = normalize(to);

  // 3. Получение безопасного имени файла
  const fileName = basename(imagePath);
  
  if (!fileName || fileName === '.' || fileName === '..') {
    throw new Error('Недопустимое имя файла');
  }

  // 4. Формирование полных путей
  const imagePathTemp = join(normalizedFrom, fileName);
  const imagePathPermanent = join(normalizedTo, fileName);

  // 5. Проверка существования исходного файла
  if (!existsSync(imagePathTemp)) {
    throw new Error('Исходный файл не найден');
  }

  // 6. Асинхронное перемещение файла (безопаснее, чем callback-версия)
  try {
    await renamePromise(imagePathTemp, imagePathPermanent);
  } catch (err) {
    throw new Error(`Ошибка при перемещении файла: ${err.message}`);
  }
}

export default movingFile;
