export default function escapeRegExp(string: string): string {
  // 1. Проверка на null/undefined
  if (string == null) {
    return '';
  }

  // 2. Приведение к строке (защита от нестроковых входных данных)
  const str = String(string);

  // 3. Экранирование специальных символов RegExp
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
