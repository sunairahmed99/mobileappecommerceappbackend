import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('dealController');
import mongoose from 'mongoose';
import Deal from '../Models/dealModel.js';
import Product from '../Models/productModel.js';
import { pagination } from '../services/queryValidation.js';
import { uploadToCloudinary } from '../config/cloudinary.js';

// ============================================================
//  Helper: auto-calculate discount %
// ============================================================
const calcDiscount = (original, deal) => {
    if (!original || original <= 0) return 0;
    const pct = Math.round(((original - deal) / original) * 100);
    return pct >= 0 ? pct : 0;
};

// ============================================================
//  GET /api/deals  — Public: get all active deals (populated)
// ============================================================
export const getAllDeals = async (req, res) => {
    try {
        const { active, page = 1, limit = 50 } = req.query;
        const paging = pagination(req.query, 50);
        if (!paging) return res.status(400).json({ success: false, message: 'Invalid deals query.' });
        const filter = {};
        if (active === 'true') {
            filter.isActive = true;
            filter.$or = [{ endDate: null }, { endDate: { $gte: new Date() } }];
        }

        const skip = paging.skip;
        const total = await Deal.countDocuments(filter);
        const deals = await Deal.find(filter)
            .populate('product', 'name images price originalPrice discount category sizes colors isInStock isActive')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(paging.limit);

        return res.status(200).json({
            success: true,
            count: deals.length,
            total,
            deals,
        });
    } catch (error) {
        console.error('getAllDeals error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============================================================
//  GET /api/deals/:id  — Public: single deal
// ============================================================
export const getDealById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Deal ID' });
        }
        const deal = await Deal.findById(id).populate(
            'product',
            'name images price originalPrice discount category sizes colors isInStock isActive'
        );
        if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' });
        return res.status(200).json({ success: true, deal });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Unable to process request.' });
    }
};

// ============================================================
//  POST /api/deals  — Admin: create deal
//  Body (JSON or multipart if custom product image uploaded):
//    dealName, description, productId (optional),
//    customProductName, customProductCategory (optional),
//    dealPrice, originalPrice, discountPercentage (optional),
//    startDate (optional), endDate (optional), isActive
// ============================================================
export const createDeal = async (req, res) => {
    try {
        const {
            dealName, description,
            productId,
            customProductName, customProductCategory,
            dealPrice, originalPrice,
            discountPercentage,
            startDate, endDate, isActive,
        } = req.body;

        if (!dealName?.trim()) {
            return res.status(400).json({ success: false, message: 'Deal name is required' });
        }
        if (!dealPrice || isNaN(Number(dealPrice))) {
            return res.status(400).json({ success: false, message: 'Deal price is required' });
        }
        if (!originalPrice || isNaN(Number(originalPrice))) {
            return res.status(400).json({ success: false, message: 'Original price is required' });
        }

        let linkedProduct = null;
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            linkedProduct = productId;
        }

        // Handle custom product images (if any uploaded)
        const customImages = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const result = await uploadToCloudinary(file.buffer, 'deals');
                customImages.push(result.secure_url);
            }
        }

        const dPrice = Number(dealPrice);
        const oPrice = Number(originalPrice);
        const discPct = discountPercentage !== undefined
            ? Number(discountPercentage)
            : calcDiscount(oPrice, dPrice);

        const deal = await Deal.create({
            dealName: dealName.trim(),
            description: description?.trim() || '',
            product: linkedProduct,
            customProduct: {
                name: customProductName?.trim() || '',
                images: customImages,
                category: customProductCategory?.trim() || '',
            },
            dealPrice: dPrice,
            originalPrice: oPrice,
            discountPercentage: discPct,
            startDate: startDate ? new Date(startDate) : new Date(),
            endDate: endDate ? new Date(endDate) : null,
            isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true,
        });

        const populated = await Deal.findById(deal._id).populate(
            'product',
            'name images price originalPrice discount category isInStock isActive'
        );

        return res.status(201).json({
            success: true,
            message: 'Deal created successfully',
            deal: populated,
        });
    } catch (error) {
        console.error('createDeal error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============================================================
//  PUT /api/deals/:id  — Admin: update deal
// ============================================================
export const updateDeal = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Deal ID' });
        }

        const deal = await Deal.findById(id);
        if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' });

        const {
            dealName, description,
            productId,
            customProductName, customProductCategory,
            dealPrice, originalPrice,
            discountPercentage,
            startDate, endDate, isActive,
        } = req.body;

        if (dealName?.trim()) deal.dealName = dealName.trim();
        if (description !== undefined) deal.description = description.trim();
        if (productId !== undefined) {
            deal.product = (productId && mongoose.Types.ObjectId.isValid(productId)) ? productId : null;
        }
        if (dealPrice !== undefined) deal.dealPrice = Number(dealPrice);
        if (originalPrice !== undefined) deal.originalPrice = Number(originalPrice);

        // Auto-recalculate discount
        if (discountPercentage !== undefined) {
            deal.discountPercentage = Number(discountPercentage);
        } else if (dealPrice !== undefined || originalPrice !== undefined) {
            deal.discountPercentage = calcDiscount(deal.originalPrice, deal.dealPrice);
        }

        if (startDate !== undefined) deal.startDate = startDate ? new Date(startDate) : new Date();
        if (endDate !== undefined) deal.endDate = endDate ? new Date(endDate) : null;
        if (isActive !== undefined) deal.isActive = isActive === 'true' || isActive === true;

        // Custom product fields
        if (customProductName !== undefined) deal.customProduct.name = customProductName.trim();
        if (customProductCategory !== undefined) deal.customProduct.category = customProductCategory.trim();

        // Handle new custom image uploads
        if (req.files && req.files.length > 0) {
            const newImages = [];
            for (const file of req.files) {
                const result = await uploadToCloudinary(file.buffer, 'deals');
                newImages.push(result.secure_url);
            }
            deal.customProduct.images = newImages;
        }

        await deal.save();

        const populated = await Deal.findById(deal._id).populate(
            'product',
            'name images price originalPrice discount category isInStock isActive'
        );

        return res.status(200).json({
            success: true,
            message: 'Deal updated successfully',
            deal: populated,
        });
    } catch (error) {
        console.error('updateDeal error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============================================================
//  DELETE /api/deals/:id  — Admin
// ============================================================
export const deleteDeal = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Deal ID' });
        }
        const deal = await Deal.findByIdAndDelete(id);
        if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' });
        return res.status(200).json({ success: true, message: 'Deal deleted successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Unable to process request.' });
    }
};

// ============================================================
//  PATCH /api/deals/:id/toggle-status  — Admin
// ============================================================
export const toggleDealStatus = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Deal ID' });
        }
        const deal = await Deal.findById(id);
        if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' });
        deal.isActive = !deal.isActive;
        await deal.save();
        return res.status(200).json({
            success: true,
            message: `Deal ${deal.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: deal.isActive,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Unable to process request.' });
    }
};

