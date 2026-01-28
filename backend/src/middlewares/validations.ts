import { Joi, celebrate } from 'celebrate';
import { Types } from 'mongoose';
import sanitizeHtml from 'sanitize-html'; // Добавлена зависимость для санитации HTML

// eslint-disable-next-line no-useless-escape
export const phoneRegExp = /^(\+\d+)?(?:\s|-?|\(?\d+\)?)+$/;

export enum PaymentType {
  Card = 'card',
  Online = 'online',
}

// Валидация тела заказа с устранением уязвимостей
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
      .messages({
        'array.empty': 'Не указаны товары',
      }),
    payment: Joi.string()
      .valid(...Object.values(PaymentType))
      .required()
      .messages({
        'string.valid':
          'Указано не валидное значение для способа оплаты, возможные значения - "card", "online"',
        'string.empty': 'Не указан способ оплаты',
      }),
    email: Joi.string().email().required().messages({
      'string.empty': 'Не указан email',
    }),
    phone: Joi.string()
      .required()
      .pattern(phoneRegExp)
      .min(6)  // Добавлено: минимальная длина
      .max(20) // Добавлено: максимальная длина
      .messages({
        'string.empty': 'Не указан телефон',
        'string.min': 'Телефон должен быть не короче 6 символов',
        'string.max': 'Телефон должен быть не длиннее 20 символов',
      }),
    address: Joi.string().required().messages({
      'string.empty': 'Не указан адрес',
    }),
    total: Joi.number().required().messages({
      'string.empty': 'Не указана сумма заказа',
    }),
    comment: Joi.string()
      .optional()
      .allow('')
      .custom((value) => 
        // Добавлено: санитация HTML в комментарии
         sanitizeHtml(value || '', {
          allowedTags: [],       // Запретить все HTML-теги
          allowedAttributes: {}, // Запретить все атрибуты
        })
      )
      .messages({
        'string.base': 'Комментарий должен быть строкой',
      }),
  }),
});

// Валидация товара (остаётся без изменений, т.к. не содержит уязвимостей)
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
