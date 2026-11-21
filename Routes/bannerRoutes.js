import express from 'express';
import {
    createBanner,
    getAllBanners,
    getBannerById,
    updateBanner,
    deleteBanner,
    toggleBannerStatus
} from '../Controllers/bannerController.js';
import { upload } from '../config/multer.js';
import { protect, adminOnly } from '../config/jwt.js';

const router = express.Router();

// Routes for /api/banners
router.route('/')
    .get(getAllBanners)                                              // Public: GET all banners
    .post(protect, adminOnly, upload.single('image'), createBanner); // Admin: Create banner

router.route('/:id')
    .get(getBannerById)                                              // Public: GET single banner
    .put(protect, adminOnly, upload.single('image'), updateBanner)   // Admin: Update banner
    .delete(protect, adminOnly, deleteBanner);                       // Admin: Delete banner

// Toggle active/inactive status (Admin only)
router.patch('/:id/toggle-status', protect, adminOnly, toggleBannerStatus);

export default router;
