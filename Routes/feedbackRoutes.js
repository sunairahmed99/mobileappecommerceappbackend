import express from 'express';
import {
    getAllFeedback,
    markFeedbackRead,
    createFeedback,
    updateFeedbackStatus,
    deleteFeedback,
    approveFeedback,
    declineFeedback,
    getApprovedFeedback,
} from '../Controllers/feedbackController.js';
import { optionalProtect, protect, adminOnly } from '../config/jwt.js';
import { rateLimit } from '../middleware/security.js';

const router = express.Router();

const feedbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many feedback submissions. Please try again after 15 minutes.'
});

// Admin routes
router.get('/admin/all', protect, adminOnly, getAllFeedback);
router.patch('/admin/:id/read', protect, adminOnly, markFeedbackRead);
router.patch('/admin/:id/status', protect, adminOnly, updateFeedbackStatus);
router.patch('/admin/:id/approve', protect, adminOnly, approveFeedback);
router.patch('/admin/:id/decline', protect, adminOnly, declineFeedback);
router.delete('/admin/:id', protect, adminOnly, deleteFeedback);

// Public / User routes
router.get('/public', getApprovedFeedback);
router.post('/review', feedbackLimiter, protect, createFeedback);
router.post('/', feedbackLimiter, optionalProtect, createFeedback);

export default router;

