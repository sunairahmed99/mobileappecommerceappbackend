import express from 'express';
import {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    toggleProductStock,
    toggleProductStatus
} from '../Controllers/productController.js';
import { upload } from '../config/multer.js';
import { protect, adminOnly } from '../config/jwt.js';
import Product from '../Models/productModel.js';
import { loadProductImage } from '../services/productImageDelivery.js';

const router = express.Router();

// Deliver the product's actual stored photo through our API, with CDN retries/cache.
router.get('/:id/images/:index', async (req, res, next) => {
    try {
        if (!/^\d+$/.test(req.params.index)) return res.sendStatus(400);
        const index = Number(req.params.index);
        if (index > 2) return res.sendStatus(404);
        const product = await Product.findById(req.params.id).select('images category');
        const uri = product?.toJSON().images?.[index];
        if (!uri) return res.sendStatus(404);
        try {
            const image = await loadProductImage(uri);
            res.set({ 'Content-Type': image.type, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
            return res.send(image.bytes);
        } catch {
            return res.status(502).json({ success: false, message: 'Product image temporarily unavailable.' });
        }
    } catch (error) { next(error); }
});

// Routes for /api/products
router.route('/')
    .get(getAllProducts)                                                     // Public: GET all products
    .post(protect, adminOnly, upload.array('images', 3), createProduct);      // Admin: Create product

router.route('/:id')
    .get(getProductById)                                                     // Public: GET single product
    .put(protect, adminOnly, upload.array('images', 3), updateProduct)        // Admin: Update product
    .delete(protect, adminOnly, deleteProduct);                              // Admin: Delete product

// Toggle in-stock / out-of-stock (Admin only)
router.patch('/:id/toggle-stock', protect, adminOnly, toggleProductStock);

// Toggle active / inactive status (Admin only)
router.patch('/:id/toggle-status', protect, adminOnly, toggleProductStatus);

export default router;
