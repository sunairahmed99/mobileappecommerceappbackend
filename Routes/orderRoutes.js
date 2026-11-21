import express from 'express';
import {
    createOrder,
    getMyOrders,
    getOrderById,
    getAllOrders,
    updateOrderStatus,
} from '../Controllers/orderController.js';
import { optionalProtect, protect, adminOnly } from '../config/jwt.js';

const router = express.Router();

// ── Admin routes (must be placed BEFORE /:id to avoid param conflicts) ──
router.get('/admin/all', protect, adminOnly, getAllOrders);
router.patch('/admin/:id/status', protect, adminOnly, updateOrderStatus);

// ── User routes (login required) ──
router.get('/my-orders', protect, getMyOrders);
router.post('/', protect, createOrder);
router.get('/:id', protect, getOrderById);

export default router;

