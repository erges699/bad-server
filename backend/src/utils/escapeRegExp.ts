// backend/src/utils/escapeRegExp.ts
export default function escapeRegExp(string: string): string {
  if (typeof string !== 'string') {
    throw new TypeError('Ожидается строка');
  }
  return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}
