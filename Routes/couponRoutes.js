import express from 'express';
import {
    getAllCoupons,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    toggleCouponStatus,
    validateCoupon,
} from '../Controllers/couponController.js';
import { protect, adminOnly, optionalProtect } from '../config/jwt.js';

const router = express.Router();

// ── Public / Authenticated Route to Validate Coupon ──
router.post('/validate', optionalProtect, validateCoupon);

// ── Admin Protected Routes ──
router.get('/', protect, adminOnly, getAllCoupons);
router.post('/', protect, adminOnly, createCoupon);
router.put('/:id', protect, adminOnly, updateCoupon);
router.delete('/:id', protect, adminOnly, deleteCoupon);
router.patch('/:id/toggle-status', protect, adminOnly, toggleCouponStatus);

export default router;

