import express from 'express';
import {
    getNotifications,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    savePushToken,
    sendPushToUser,
    getCustomerSpending,
    sendDealNotification,
    sendCouponCampaign,
    getCampaignHistory,
} from '../Controllers/notificationController.js';
import { protect, adminOnly } from '../config/jwt.js';

const router = express.Router();

// ── Admin Hub Routes ──
router.get('/customer-spending', protect, adminOnly, getCustomerSpending);
router.post('/send-deal', protect, adminOnly, sendDealNotification);
router.post('/send-coupon', protect, adminOnly, sendCouponCampaign);
router.get('/campaign-history', protect, adminOnly, getCampaignHistory);

// ── User In-App & Device Notification Routes ──
router.get('/', protect, getNotifications);
router.post('/push-token', protect, savePushToken);
router.post('/send-push', protect, adminOnly, sendPushToUser);
router.patch('/mark-all-read', protect, markAllAsRead);
router.patch('/:id/read', protect, markAsRead);
router.delete('/', protect, clearNotifications);

export default router;

