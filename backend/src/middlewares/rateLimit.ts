import rateLimit from 'express-rate-limit';

export const customerRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // максимум 10 запросов за окно
  message: 'Слишком много запросов. Попробуйте позже.',
  standardHeaders: true, // Возвращает заголовки `RateLimit-*`
  legacyHeaders: false, // Не возвращает устаревшие заголовки
});
