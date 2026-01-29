// backend/src/routes/customers.ts

import { Router } from 'express';
import {
    deleteCustomer,
    getCustomerById,
    getCustomers,
    updateCustomer,
} from '../controllers/customers';
import auth from '../middlewares/auth';
import { isAdmin } from '../middlewares/admin-guard';
import { validateCustomersQuery } from '../middlewares/validations';

const customerRouter = Router()

customerRouter.get('/', auth, isAdmin, validateCustomersQuery, getCustomers)
customerRouter.get('/:id', auth, getCustomerById)
customerRouter.patch('/:id', auth, updateCustomer)
customerRouter.delete('/:id', auth, deleteCustomer)

export default customerRouter
