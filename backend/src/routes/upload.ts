// backend/src/routes/upload.ts
import { Router } from 'express';
import { uploadFile } from '../controllers/upload';
import fileMiddleware from '../middlewares/file';
import auth from '../middlewares/auth';

const uploadRouter = Router();

uploadRouter.post('/', fileMiddleware.single('file'), auth, uploadFile);

export default uploadRouter;
