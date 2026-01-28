import { errors } from 'celebrate';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import express, { json, urlencoded } from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { DB_ADDRESS, ORIGIN_ALLOW } from './config';
import errorHandler from './middlewares/error-handler';
import serveStatic from './middlewares/serverStatic';
import routes from './routes';

const { PORT = 3000 } = process.env;
const app = express();

// 1. Безопасность: CORS
const corsOptions: cors.CorsOptions = {
  origin: ORIGIN_ALLOW,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 2. Безопасность: лимит на размер тела
app.use(urlencoded({ extended: true, limit: '10mb' }));
app.use(json({ limit: '10mb' }));

// 3. Безопасность: рейт‑лимит
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Слишком много запросов. Попробуйте позже.',
    standardHeaders: true,
  })
);

// 4. Безопасность: статические файлы
app.use(
  '/public',
  serveStatic(path.join(__dirname, 'public'), {
    index: false,
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      if (filePath.includes('.env') || filePath.includes('package.json')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  })
);

// 5. Остальные middleware
app.use(cookieParser());
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
