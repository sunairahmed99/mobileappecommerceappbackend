import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('bannerCategoryController');
import mongoose from 'mongoose';
import BannerCategory from '../Models/bannerCategoryModel.js';
import Product from '../Models/productModel.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';

// @desc    Create new Banner Category
// @route   POST /api/banner-categories
export const createBannerCategory = async (req, res) => {
    try {
        const { name, isActive } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Category image file is required' });
        }

        // Check if category with same name already exists
        const existingCategory = await BannerCategory.findOne({ name: name.trim() });
        if (existingCategory) {
            return res.status(409).json({ success: false, message: 'Banner category with this name already exists' });
        }

        // Upload image buffer to Cloudinary
        const uploadResult = await uploadToCloudinary(req.file.buffer, 'banner-categories');

        // Save category to database
        const category = await BannerCategory.create({
            name: name.trim(),
            image: uploadResult.secure_url,
            public_id: uploadResult.public_id,
            isActive: isActive !== undefined ? isActive : true
        });

        res.status(201).json({
            success: true,
            message: 'Banner category created successfully',
            category
        });
    } catch (error) {
        console.error('Error creating banner category:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating banner category'
        });
    }
};

// @desc    Get all Banner Categories
// @route   GET /api/banner-categories
export const getAllBannerCategories = async (req, res) => {
    try {
        // Optional filter: ?isActive=true or ?isActive=false
        const filter = {};
        if (req.query.isActive !== undefined) {
            filter.isActive = req.query.isActive === 'true';
        }

        const categories = await BannerCategory.find(filter).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: categories.length,
            categories
        });
    } catch (error) {
        console.error('Error fetching banner categories:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching banner categories'
        });
    }
};

// @desc    Get single Banner Category by ID
// @route   GET /api/banner-categories/:id
export const getBannerCategoryById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Category ID format' });
        }

        const category = await BannerCategory.findById(id);

        if (!category) {
            return res.status(404).json({ success: false, message: 'Banner category not found' });
        }

        res.status(200).json({
            success: true,
            category
        });
    } catch (error) {
        console.error('Error fetching banner category by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching banner category'
        });
    }
};

// @desc    Update Banner Category (name, image and/or isActive)
// @route   PUT /api/banner-categories/:id
export const updateBannerCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, isActive } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Category ID format' });
        }

        const category = await BannerCategory.findById(id);

        if (!category) {
            return res.status(404).json({ success: false, message: 'Banner category not found' });
        }

        // Update name if provided — check for duplicate name (excluding current doc)
        const oldName = category.name;
        if (name && name.trim()) {
            const trimmedName = name.trim();
            const duplicate = await BannerCategory.findOne({
                name: trimmedName,
                _id: { $ne: id }
            });
            if (duplicate) {
                return res.status(409).json({ success: false, message: 'Another banner category with this name already exists' });
            }
            if (oldName && oldName.toLowerCase() !== trimmedName.toLowerCase()) {
                const oldEscaped = oldName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const oldRegex = new RegExp(`^\\s*${oldEscaped}\\s*$`, 'i');
                await Product.updateMany({ category: oldRegex }, { $set: { category: trimmedName } });
            }
            category.name = trimmedName;
        }

        // Update isActive if provided
        if (isActive !== undefined) {
            category.isActive = isActive === 'true' || isActive === true;
        }

        // If new image provided, upload to Cloudinary and delete old one
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file.buffer, 'banner-categories');

            // Delete old image from Cloudinary
            if (category.public_id) {
                await deleteFromCloudinary(category.public_id);
            }

            category.image = uploadResult.secure_url;
            category.public_id = uploadResult.public_id;
        }

        const updatedCategory = await category.save();

        // Sync active status with related products
        if (isActive !== undefined) {
            const catName = (updatedCategory.name || category.name || '').trim();
            const escapedName = catName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const categoryRegex = new RegExp(`^\\s*${escapedName}\\s*$`, 'i');
            if (!updatedCategory.isActive) {
                await Product.updateMany(
                    { category: categoryRegex },
                    { $set: { isActive: false, isInStock: false } }
                );
            } else {
                await Product.updateMany(
                    { category: categoryRegex },
                    { $set: { isActive: true, isInStock: true } }
                );
            }
        }

        res.status(200).json({
            success: true,
            message: 'Banner category updated successfully',
            category: updatedCategory
        });
    } catch (error) {
        console.error('Error updating banner category:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating banner category'
        });
    }
};

// @desc    Delete Banner Category & its related products
// @route   DELETE /api/banner-categories/:id
export const deleteBannerCategory = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Category ID format' });
        }

        const category = await BannerCategory.findById(id);

        if (!category) {
            return res.status(404).json({ success: false, message: 'Banner category not found' });
        }

        // Find all products matching this category (case-insensitive & trimmed)
        const catName = (category.name || '').trim();
        const escapedName = catName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const categoryRegex = new RegExp(`^\\s*${escapedName}\\s*$`, 'i');
        const relatedProducts = await Product.find({ category: categoryRegex });

        // Delete all images of related products from Cloudinary
        for (const product of relatedProducts) {
            if (Array.isArray(product.public_ids) && product.public_ids.length > 0) {
                for (const publicId of product.public_ids) {
                    await deleteFromCloudinary(publicId);
                }
            }
        }

        // Delete related products from database
        if (relatedProducts.length > 0) {
            await Product.deleteMany({ category: categoryRegex });
        }

        // Delete category image from Cloudinary
        if (category.public_id) {
            await deleteFromCloudinary(category.public_id);
        }

        await BannerCategory.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: `Category "${category.name}" and ${relatedProducts.length} related product(s) deleted successfully`,
            deletedProductsCount: relatedProducts.length,
            deletedCategoryName: category.name
        });
    } catch (error) {
        console.error('Error deleting banner category and related products:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting banner category'
        });
    }
};

// @desc    Toggle Banner Category Active Status
// @route   PATCH /api/banner-categories/:id/toggle-status
export const toggleBannerCategoryStatus = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Category ID format' });
        }

        const category = await BannerCategory.findById(id);

        if (!category) {
            return res.status(404).json({ success: false, message: 'Banner category not found' });
        }

        category.isActive = !category.isActive;
        const updatedCategory = await category.save();

        // Sync active status with all related products
        const catName = (updatedCategory.name || category.name || '').trim();
        const escapedName = catName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const categoryRegex = new RegExp(`^\\s*${escapedName}\\s*$`, 'i');

        let affectedProductsCount = 0;
        if (!updatedCategory.isActive) {
            // Category deactivated -> mark its products as inactive & out of stock
            const result = await Product.updateMany(
                { category: categoryRegex },
                { $set: { isActive: false, isInStock: false } }
            );
            affectedProductsCount = result.modifiedCount || 0;
        } else {
            // Category activated -> reactivate products
            const result = await Product.updateMany(
                { category: categoryRegex },
                { $set: { isActive: true, isInStock: true } }
            );
            affectedProductsCount = result.modifiedCount || 0;
        }

        res.status(200).json({
            success: true,
            message: `Category "${catName}" and ${affectedProductsCount} product(s) ${updatedCategory.isActive ? 'activated' : 'deactivated'} successfully`,
            category: updatedCategory,
            affectedProductsCount
        });
    } catch (error) {
        console.error('Error toggling banner category status:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while toggling banner category status'
        });
    }
};
