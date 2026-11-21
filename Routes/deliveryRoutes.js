import express from 'express';
import { getDeliverySettings, updateDeliverySettings } from '../Controllers/deliveryController.js';
import { protect, adminOnly } from '../config/jwt.js';

const router = express.Router();

// Public: GET delivery settings (checkout ke liye)
router.get('/', getDeliverySettings);

// Admin: PUT delivery settings update (Admin authentication required)
router.put('/', protect, adminOnly, updateDeliverySettings);

export default router;

