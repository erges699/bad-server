// backend/src/app.ts
import { errors } from 'celebrate';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express, { json, urlencoded } from 'express';
import mongoose from 'mongoose';

import { DB_ADDRESS, ORIGIN_ALLOW } from './config';
import errorHandler from './middlewares/error-handler';
import serveStatic from './middlewares/serverStatic';
import routes from './routes';

const { PORT = 3000 } = process.env;
const app = express();

const tempDir = path.join(__dirname, 'public', process.env.UPLOAD_PATH_TEMP || 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// 1. CORS
const corsOptions: cors.CorsOptions = {
  origin: ORIGIN_ALLOW,
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 2. Лимит на размер тела запроса
app.use(urlencoded({ extended: true, limit: '10mb' }));
app.use(json({ limit: '10mb' }));

// 3. Рейт‑лимит
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100,
    message: 'Слишком много запросов. Попробуйте позже.',
    standardHeaders: true,
  })
);

// 4. Статические файлы
app.use(
  '/public',
  serveStatic(path.join(__dirname, 'public'), {
    index: false,
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      if (
        filePath.includes('.env') ||
        filePath.includes('package.json') ||
        filePath.includes('..')
      ) {
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
    await app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

bootstrap();
