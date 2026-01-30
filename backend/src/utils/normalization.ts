// backend/src/utils/pagination.ts
import BadRequestError from '../errors/bad-request-error';

export function normalizeLimit(
  limit: string | number | unknown,
  max = 10
): number {
  let num: number;

  if (typeof limit === 'number') {
    num = limit;
  } else if (typeof limit === 'string') {
    num = parseInt(limit, 10);
  } else {
    // Если тип не string/number — пытаемся привести к строке
    num = parseInt(String(limit), 10);
  }

  if (Number.isNaN(num) || num < 1) {
    throw new BadRequestError('limit должен быть положительным числом');
  }

  const normalizedMax = Math.max(1, max); // защита от max ≤ 0
  return Math.min(num, normalizedMax);
}

export function normalizePage(
  page: string | number | unknown
): number {
  let num: number;

  if (typeof page === 'number') {
    num = page;
  } else if (typeof page === 'string') {
    num = parseInt(page, 10);
  } else {
    num = parseInt(String(page), 10);
  }

  if (Number.isNaN(num) || num < 1) {
    throw new BadRequestError('page должен быть положительным числом');
  }

  return num;
}

export function isValidDate(dateString: string): boolean {
  if (!dateString || typeof dateString !== 'string') return false;
  
  // Проверяем формат YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;

  const date = new Date(dateString);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(dateString);
}

