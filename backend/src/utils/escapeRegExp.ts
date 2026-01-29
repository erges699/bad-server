// backend/src/utils/escapeRegExp.ts
export default function escapeRegExp(string: string): string {
  if (typeof string !== 'string') {
    throw new TypeError('Ожидается строка');
  }
  // Экранируем все метасимволы регулярных выражений
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
