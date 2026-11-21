import express from 'express';
import {
    createBannerCategory,
    getAllBannerCategories,
    getBannerCategoryById,
    updateBannerCategory,
    deleteBannerCategory,
    toggleBannerCategoryStatus
} from '../Controllers/bannerCategoryController.js';
import { upload } from '../config/multer.js';
import { protect, adminOnly } from '../config/jwt.js';

const router = express.Router();

// Routes for /api/banner-categories
router.route('/')
    .get(getAllBannerCategories)                                              // Public: Get All (supports ?isActive=true/false)
    .post(protect, adminOnly, upload.single('image'), createBannerCategory); // Admin: Create

router.route('/:id')
    .get(getBannerCategoryById)                                              // Public: Get One
    .put(protect, adminOnly, upload.single('image'), updateBannerCategory)   // Admin: Update
    .delete(protect, adminOnly, deleteBannerCategory);                       // Admin: Delete

// Toggle active/inactive status (Admin only)
router.patch('/:id/toggle-status', protect, adminOnly, toggleBannerCategoryStatus);

export default router;
