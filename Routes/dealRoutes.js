import express from 'express';
import {
    getAllDeals,
    getDealById,
    createDeal,
    updateDeal,
    deleteDeal,
    toggleDealStatus,
} from '../Controllers/dealController.js';
import { upload } from '../config/multer.js';
import { protect, adminOnly } from '../config/jwt.js';
import Deal from '../Models/dealModel.js';
import { loadProductImage } from '../services/productImageDelivery.js';

const router = express.Router();

router.get('/:id/images/:index', async (req, res, next) => {
    try {
        if (!/^\d+$/.test(req.params.index)) return res.sendStatus(400);
        const index = Number(req.params.index);
        if (index > 2) return res.sendStatus(404);
        const deal = await Deal.findById(req.params.id).populate('product', 'images category');
        const linkedImages = deal?.product?.toJSON().images;
        const images = linkedImages?.length ? linkedImages : deal?.customProduct?.images;
        if (!images?.[index]) return res.sendStatus(404);
        try {
            const image = await loadProductImage(images[index]);
            res.set({ 'Content-Type': image.type, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
            return res.send(image.bytes);
        } catch {
            return res.status(502).json({ success: false, message: 'Deal image temporarily unavailable.' });
        }
    } catch (error) { next(error); }
});

// Public Routes
router.get('/', getAllDeals);
router.get('/:id', getDealById);

// Admin Routes
router.post('/', protect, adminOnly, upload.array('images', 3), createDeal);
router.put('/:id', protect, adminOnly, upload.array('images', 3), updateDeal);
router.delete('/:id', protect, adminOnly, deleteDeal);
router.patch('/:id/toggle-status', protect, adminOnly, toggleDealStatus);

export default router;

