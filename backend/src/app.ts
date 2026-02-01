import { errors } from 'celebrate';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import express, { json, urlencoded } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import path from 'path';
import { DB_ADDRESS, ORIGIN_ALLOW } from './config';
import errorHandler from './middlewares/error-handler';
import serveStatic from './middlewares/serverStatic';
import routes from './routes';

const { PORT = 3000 } = process.env;
const app = express();

// Безопасность HTTP-заголовков
app.use(helmet());

// Rate limiting (защита от DDoS)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // максимум 100 запросов
  })
);

app.use(cookieParser());

// CORS с явной настройкой
app.use(cors({
  origin: ORIGIN_ALLOW,
  credentials: true,
}));

app.use(serveStatic(path.join(__dirname, 'public')));

// Лимиты на размер тела запроса
app.use(urlencoded({ extended: true, limit: '10mb' }));
app.use(json({ limit: '10mb' }));

app.options('*', cors());
app.use(routes);
app.use(errors());
app.use(errorHandler);

const bootstrap = async () => {
  try {
    await mongoose.connect(DB_ADDRESS);
    await app.listen(PORT, () => console.log('ok'));
  } catch (error) {
    console.error(error);
  }
};

bootstrap();
