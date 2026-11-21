import express from 'express';
import { getStoreSettings, updateStoreSettings } from '../Controllers/storeSettingsController.js';
import { upload } from '../config/multer.js';
import { protect, adminOnly } from '../config/jwt.js';

const router = express.Router();

// GET: Store settings (public — required by home screen)
router.get('/', getStoreSettings);

// PUT: Admin update store settings (Admin authentication required)
router.put('/', protect, adminOnly, upload.single('logo'), updateStoreSettings);

export default router;

