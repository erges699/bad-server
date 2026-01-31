import { Joi, celebrate } from 'celebrate';
import { Types } from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import { Request, Response, NextFunction } from 'express';
import BadRequestError from '../errors/bad-request-error';

export const blockMongoInjection = (req: Request, _res: Response, next: NextFunction) => {
  const suspiciousKeys = Object.keys(req.query).filter(key => key.includes('$'));
  if (suspiciousKeys.length > 0) {
    return next(new BadRequestError('Недопустимые параметры запроса'));
  }
  next();
};

// Регулярное выражение для телефона (упрощённое, но безопасное)
export const phoneRegExp = /^[+\d\s\-()]{6,20}$/;

export enum PaymentType {
  Card = 'card',
  Online = 'online',
}

// Валидация телефона (отдельный кастомный валидатор)
const validatePhone = (value: string, helpers: Joi.CustomHelpers) => {
  // Проверка формата
  if (!phoneRegExp.test(value)) {
    return helpers.message({ custom: 'Некорректный формат телефона' });
  }

  // Очищаем от нецифровых символов (кроме +)
  const digits = value.replace(/[^\d+]/g, '');
  
  if (digits.length < 6) {
    return helpers.message({ custom: 'Номер должен содержать минимум 6 цифр' });
  }
  if (digits.length > 15) {
    return helpers.message({ custom: 'Номер не может содержать более 15 цифр' });
  }

  return value;
};

// Санирование комментария (отдельный валидатор)
const sanitizeComment = (value: string, helpers: Joi.CustomHelpers) => {
  try {
    const sanitized = sanitizeHtml(value || '', {
      allowedTags: [],
      allowedAttributes: {},
    });
    return sanitized;
  } catch (err) {
    return helpers.message({ custom: 'Ошибка при санитации комментария' });
  }
};

// Валидация тела заказа
export const validateOrderBody = celebrate({
  body: Joi.object().keys({
    items: Joi.array()
      .items(
        Joi.string().custom((value, helpers) => {
          if (Types.ObjectId.isValid(value)) return value;
          return helpers.message({ custom: 'Невалидный id' });
        })
      )
      .min(1)
      .messages({
        'array.empty': 'Не указаны товары',
        'array.min': 'Необходимо выбрать хотя бы один товар',
      }),
    payment: Joi.string()
      .valid(...Object.values(PaymentType))
      .required()
      .messages({
        'string.valid':
          'Указано невалидное значение для способа оплаты. Возможные значения: "card", "online"',
        'string.empty': 'Не указан способ оплаты',
      }),
    email: Joi.string().email().required().messages({
      'string.empty': 'Не указан email',
      'string.email': 'Некорректный email',
    }),
    phone: Joi.string()
      .required()
      .custom(validatePhone)
      .messages({
        'string.empty': 'Не указан телефон',
        'any.custom': '#{error.message}',
      }),
    address: Joi.string().required().messages({
      'string.empty': 'Не указан адрес',
    }),
    total: Joi.number().required().positive().messages({
      'string.empty': 'Не указана сумма заказа',
      'number.base': 'Сумма заказа должна быть числом',
      'number.positive': 'Сумма заказа должна быть положительной',
    }),
    comment: Joi.string()
      .optional()
      .allow('')
      .custom(sanitizeComment)
      .messages({
        'string.base': 'Комментарий должен быть строкой',
        'any.custom': '#{error.message}',
      }),
  }),
});

export const validateProductBody = celebrate({
  body: Joi.object().keys({
    title: Joi.string().required().min(2).max(30).messages({
      'string.min': 'Минимальная длина поля "name" - 2',
      'string.max': 'Максимальная длина поля "name" - 30',
      'string.empty': 'Поле "title" должно быть заполнено',
    }),
    image: Joi.object().keys({
      fileName: Joi.string().required(),
      originalName: Joi.string().required(),
    }),
    category: Joi.string().required().messages({
      'string.empty': 'Поле "category" должно быть заполнено',
    }),
    description: Joi.string().required().messages({
      'string.empty': 'Поле "description" должно быть заполнено',
    }),
    price: Joi.number().allow(null),
  }),
});

export const validateProductUpdateBody = celebrate({
  body: Joi.object().keys({
    title: Joi.string().min(2).max(30).messages({
      'string.min': 'Минимальная длина поля "name" - 2',
      'string.max': 'Максимальная длина поля "name" - 30',
    }),
    image: Joi.object().keys({
      fileName: Joi.string().required(),
      originalName: Joi.string().required(),
    }),
    category: Joi.string(),
    description: Joi.string(),
    price: Joi.number().allow(null),
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
    name: Joi.string().min(2).max(30).messages({
      'string.min': 'Минимальная длина поля "name" - 2',
      'string.max': 'Максимальная длина поля "name" - 30',
    }),
    password: Joi.string().min(6).required().messages({
      'string.empty': 'Поле "password" должно быть заполнено',
    }),
    email: Joi.string()
      .required()
      .email()
      .message('Поле "email" должно быть валидным email-адресом')
      .messages({
        'string.empty': 'Поле "email" должно быть заполнено',
      }),
  }),
});

export const validateAuthentication = celebrate({
  body: Joi.object().keys({
    email: Joi.string()
      .required()
      .email()
      .message('Поле "email" должно быть валидным email-адресом')
      .messages({
        'string.required': 'Поле "email" должно быть заполнено',
      }),
    password: Joi.string().required().messages({
      'string.empty': 'Поле "password" должно быть заполнено',
    }),
  }),
});
