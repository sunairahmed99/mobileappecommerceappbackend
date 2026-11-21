import express from 'express';
import multer from 'multer';
import {
    register,
    verifyRegistrationOtp,
    resendVerificationOtp,
    login,
    googleLogin,
    getMe,
    forgotPassword,
    resendForgotPasswordOtp,
    resetPassword,
    updateProfile,
    changePassword,
    sendEmailOtp,
    verifyEmailOtp,
    getAllUsers,
    adminCreateUser,
    adminUpdateUser,
    toggleUserRole,
    toggleUserStatus,
    deleteUser,
} from '../Controllers/authController.js';
import { protect, adminOnly } from '../config/jwt.js';
import { rateLimit } from '../middleware/security.js';

const router = express.Router();
router.use((req, res, next) => {
    const fields = ['email', 'password', 'name', 'phone', 'address', 'currentPassword', 'newPassword', 'newEmail', 'accessToken'];
    if (fields.some(field => req.body?.[field] != null && typeof req.body[field] !== 'string')
        || req.body?.otp != null && !['string', 'number'].includes(typeof req.body.otp)) {
        return res.status(400).json({ success: false, message: 'Invalid authentication input.' });
    }
    next();
});

// Rate limiters for sensitive endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many authentication attempts. Please try again after 15 minutes.'
});

const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: 'Too many OTP requests. Please wait a few minutes before trying again.'
});

// Multer — memory storage (for optional profile image on register/update)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 30, parts: 32, fieldSize: 64 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(Object.assign(new Error('Only image files are allowed.'), { status: 400 }), false);
        }
    }
});

// ── Public Routes (with rate-limiting) ──
router.post('/register', authLimiter, upload.single('image'), register);
router.post('/verify-registration-otp', otpLimiter, verifyRegistrationOtp); // body: { email, otp }
router.post('/resend-verification-otp', otpLimiter, resendVerificationOtp); // body: { email }
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleLogin);                           // body: { accessToken }
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/resend-forgot-password-otp', authLimiter, resendForgotPasswordOtp);
router.post('/reset-password', authLimiter, resetPassword);   // body: { email, otp, password }

// ── Protected User Routes (require valid JWT) ──
router.get('/me', protect, getMe);
router.put('/update-profile', protect, upload.single('image'), updateProfile);
router.put('/change-password', protect, changePassword);
router.post('/send-email-otp', protect, otpLimiter, sendEmailOtp);     // body: { newEmail }
router.post('/verify-email-otp', protect, otpLimiter, verifyEmailOtp); // body: { otp }

// ── Admin User Management (strictly require Admin authentication) ──
router.get('/users', protect, adminOnly, getAllUsers);
router.post('/users', protect, adminOnly, upload.single('image'), adminCreateUser);
router.put('/users/:id', protect, adminOnly, upload.single('image'), adminUpdateUser);
router.patch('/users/:id/role', protect, adminOnly, toggleUserRole);
router.patch('/users/:id/status', protect, adminOnly, toggleUserStatus);
router.delete('/users/:id', protect, adminOnly, deleteUser);

export default router;
