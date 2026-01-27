import { errors } from 'celebrate';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import express, { json, urlencoded } from 'express';
import mongoose from 'mongoose';
import mongoSanitize from 'express-mongo-sanitize';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import csurf from 'csurf';

import { DB_ADDRESS } from './config';
import errorHandler from './middlewares/error-handler';
import serveStatic from './middlewares/serverStatic';
import routes from './routes';

const { PORT = 3000 } = process.env;
const app = express();


app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.',
});
app.use(limiter);


const csrfProtection = csurf({ cookie: true });
app.use('/admin', csrfProtection);


const CORS_OPTIONS = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
};
app.use(cors(CORS_OPTIONS));
app.options('*', cors(CORS_OPTIONS));


app.use(json({ limit: '10mb' }));
app.use(urlencoded({ extended: true, limit: '10mb' }));

app.use(cookieParser());

const PUBLIC_DIR = path.join(__dirname, 'public');
app.use('/static', serveStatic(PUBLIC_DIR, {
  index: false,
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.includes('private')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

app.use(errors());
app.use(mongoSanitize({ replaceWith: '_' }))
app.use(routes);
app.use(errorHandler);


const bootstrap = async () => {
  try {
    await mongoose.connect(DB_ADDRESS);
    await app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('Startup error:', error);
    process.exit(1);
  }
};

bootstrap();
