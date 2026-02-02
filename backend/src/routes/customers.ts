// backend/src/routes/customers.ts
import { Router } from 'express'
import {
    deleteCustomer,
    getCustomerById,
    getCustomers,
    updateCustomer,
} from '../controllers/customers'
import auth , { roleGuardMiddleware } from '../middlewares/auth'
import { Role } from '../models/user'
import { customerRateLimit } from '../middlewares/rateLimit';

const customerRouter = Router()

// Применяем рейт‑лимит КО ВСЕМ маршрутам роутера
customerRouter.use(customerRateLimit);

customerRouter.get('/', auth, roleGuardMiddleware(Role.Admin), getCustomers)
customerRouter.get('/:id', auth, roleGuardMiddleware(Role.Admin), getCustomerById)
customerRouter.patch('/:id', auth, roleGuardMiddleware(Role.Admin), updateCustomer)
customerRouter.delete('/:id', auth, roleGuardMiddleware(Role.Admin), deleteCustomer)

export default customerRouter
