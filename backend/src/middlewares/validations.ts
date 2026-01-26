import { Joi, celebrate } from 'celebrate';
import { Types } from 'mongoose';

// Улучшенное регулярное выражение для телефона (пример для международных номеров)
export const phoneRegExp = /^\+?[1-9]\d{1,14}$/;

export enum PaymentType {
  Card = 'card',
  Online = 'online',
}
/**
 * Проверяет валидность MongoDB ObjectId
 * @param id - строка ID
 * @returns Date | null - валидная дата или null
 */
export const isValidObjectId = (id: string): boolean => {
  return Types.ObjectId.isValid(id);
};

/**
 * Проверяет и преобразует строку в валидную дату
 * @param dateStr - строка даты
 * @returns Date | null - валидная дата или null
 */
export const isValidDate = (dateStr: string): Date | null => {
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
};

/**
 * Санитирует строку для безопасного использования в RegExp
 * (экранирует спецсимволы)
 * @param str - исходная строка
 * @returns string - очищенная строка
 */
export const sanitizeString = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const validateOrderBody = celebrate({
  body: Joi.object().keys({
    items: Joi.array()
      .items(
        Joi.string().custom((value, helpers) => {
          if (Types.ObjectId.isValid(value)) {
            return value;
          }
          return helpers.message({ custom: 'Невалидный id' });
        })
      )
      .min(1) // Минимум 1 товар
      .max(50) // Максимум 50 товаров
      .required()
      .messages({
        'array.min': 'Необходимо выбрать хотя бы один товар',
        'array.max': 'Нельзя заказать более 50 товаров за раз',
        'array.empty': 'Не указаны товары',
      }),
    payment: Joi.string()
      .valid(...Object.values(PaymentType))
      .required()
      .messages({
        'string.valid':
          'Указано невалидное значение для способа оплаты. Возможные значения: "card", "online"',
        'string.empty': 'Не указан способ оплаты',
      }),
    email: Joi.string()
      .email()
      .required()
      .max(254) // Стандартная максимальная длина email
      .messages({
        'string.empty': 'Не указан email',
        'string.max': 'Email слишком длинный',
      }),
    phone: Joi.string()
      .pattern(phoneRegExp)
      .required()
      .messages({
        'string.empty': 'Не указан телефон',
        'string.pattern.base': 'Некорректный формат телефона',
      }),
    address: Joi.string()
      .required()
      .max(500) // Ограничение длины адреса
      .messages({
        'string.empty': 'Не указан адрес',
        'string.max': 'Адрес слишком длинный',
      }),
    total: Joi.number()
      .positive() // Только положительные значения
      .precision(2) // До 2 знаков после запятой
      .min(0.01) // Минимальная сумма
      .max(1000000) // Максимальная сумма заказа
      .required()
      .messages({
        'number.base': 'Сумма заказа должна быть числом',
        'number.positive': 'Сумма заказа должна быть положительной',
        'number.min': 'Сумма заказа слишком мала',
        'number.max': 'Сумма заказа слишком велика',
      }),
    comment: Joi.string()
      .optional()
      .allow('')
      .max(1000) // Ограничение на комментарий
      .messages({
        'string.max': 'Комментарий слишком длинный',
      }),
  }),
});

export const validateProductBody = celebrate({
  body: Joi.object().keys({
    title: Joi.string()
      .required()
      .min(2)
      .max(30)
      .messages({
        'string.min': 'Минимальная длина поля "title" — 2 символа',
        'string.max': 'Максимальная длина поля "title" — 30 символов',
        'string.empty': 'Поле "title" должно быть заполнено',
      }),
    image: Joi.object().keys({
      fileName: Joi.string().required(),
      originalName: Joi.string().required(),
    }),
    category: Joi.string()
      .required()
      .max(50) // Ограничение длины категории
      .messages({
        'string.empty': 'Поле "category" должно быть заполнено',
        'string.max': 'Категория слишком длинная',
      }),
    description: Joi.string()
      .required()
      .max(1000) // Ограничение длины описания
      .messages({
        'string.empty': 'Поле "description" должно быть заполнено',
        'string.max': 'Описание слишком длинное',
      }),
    price: Joi.number().allow(null).positive().precision(2),
  }),
});

export const validateProductUpdateBody = celebrate({
  body: Joi.object().keys({
    title: Joi.string()
      .min(2)
      .max(30)
      .messages({
        'string.min': 'Минимальная длина поля "title" — 2 символа',
        'string.max': 'Максимальная длина поля "title" — 30 символов',
      }),
    image: Joi.object().keys({
      fileName: Joi.string().required(),
      originalName: Joi.string().required(),
    }),
    category: Joi.string().max(50),
    description: Joi.string().max(1000),
    price: Joi.number().allow(null).positive().precision(2),
  }),
});

export const validateObjId = celebrate({
  params: Joi.object().keys({
    productId: Joi.string()
      .required()
      .custom((value, helpers) => {
        if (Types.ObjectId.isValid(value)) {
          return value;
        }
        return helpers.message({ any: 'Невалидный id' });
      }),
  }),
});

export const validateUserBody = celebrate({
  body: Joi.object().keys({
    name: Joi.string()
      .min(2)
      .max(30)
      .optional() // Имя необязательно при регистрации
      .messages({
        'string.min': 'Минимальная длина поля "name" — 2 символа',
        'string.max': 'Максимальная длина поля "name" — 30 символов',
      }),
    password: Joi.string()
      .required()
      .min(8)
      .max(128) // Ограничение максимальной длины для защиты от DoS
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*])[a-zA-Z\\d!@#$%^&*]{8,128}$'))
      .message(
        'Пароль должен содержать минимум 8 символов, включая: ' +
        '1 заглавную букву, 1 строчную букву, 1 цифру и 1 спецсимвол (!@#$%^&*)'
      )
      .messages({
        'string.empty': 'Поле "password" должно быть заполнено',
        'string.min': 'Пароль должен содержать не менее 8 символов',
        'string.max': 'Пароль не может превышать 128 символов',
        'string.pattern.base': 'Пароль не соответствует требованиям сложности',
      }),
    email: Joi.string()
      .required()
      .email({ tlds: { allow: false } }) // Отключаем проверку TLD для гибкости
      .max(254) // Стандартное ограничение длины email
      .messages({
        'string.empty': 'Поле "email" должно быть заполнено',
        'string.email': 'Поле "email" должно быть валидным email-адресом',
        'string.max': 'Email не может превышать 254 символа',
      }),
  }),
});

export const validateAuthentication = celebrate({
  body: Joi.object().keys({
    email: Joi.string()
      .required()
      .email({ tlds: { allow: false } })
      .max(254)
      .messages({
        'string.empty': 'Поле "email" должно быть заполнено',
        'string.email': 'Поле "email" должно быть валидным email-адресом',
        'string.max': 'Email не может превышать 254 символа',
      }),
    password: Joi.string()
      .required()
      .min(8)
      .max(128)
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*])[a-zA-Z\\d!@#$%^&*]{8,128}$'))
      .message(
        'Пароль должен содержать минимум 8 символов, включая: ' +
        '1 заглавную букву, 1 строчную букву, 1 цифру и 1 спецсимвол (!@#$%^&*)'
      )
      .messages({
        'string.empty': 'Поле "password" должно быть заполнено',
        'string.min': 'Пароль должен содержать не менее 8 символов',
        'string.max': 'Пароль не может превышать 128 символов',
        'string.pattern.base': 'Пароль не соответствует требованиям сложности',
      }),
  }),
});
