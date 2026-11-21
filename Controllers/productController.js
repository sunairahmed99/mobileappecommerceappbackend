import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('productController');
import mongoose from 'mongoose';
import Product from '../Models/productModel.js';
import BannerCategory from '../Models/bannerCategoryModel.js';
import { pagination, literalSearch } from '../services/queryValidation.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';

// ============================================================
//  Helper: parse comma-separated or JSON array strings
// ============================================================
const parseArrayField = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch {
        // comma-separated fallback
        return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
    return [];
};

// ============================================================
//  @desc    Create new Product
//  @route   POST /api/products
//  @access  Public
// ============================================================
export const createProduct = async (req, res) => {
    try {
        const {
            name, description, category,
            price, originalPrice, discount,
            rating, reviewCount,
            sizes, colors, isInStock, isActive
        } = req.body;

        // ── Required field validation ──
        if (!name?.trim())        return res.status(400).json({ success: false, message: 'Product name is required' });
        if (!description?.trim()) return res.status(400).json({ success: false, message: 'Description is required' });
        if (!category?.trim())    return res.status(400).json({ success: false, message: 'Category is required' });
        if (!price)               return res.status(400).json({ success: false, message: 'Price is required' });
        if (!originalPrice)       return res.status(400).json({ success: false, message: 'Original price is required' });

        // Check if category exists and whether it is active
        const trimmedCat = category.trim();
        const escapedCat = trimmedCat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existingCat = await BannerCategory.findOne({ name: new RegExp(`^\\s*${escapedCat}\\s*$`, 'i') });
        const isCatActive = existingCat ? existingCat.isActive !== false : true;

        let productActive = isActive !== undefined ? (isActive === 'true' || isActive === true) : true;
        // If the category itself is inactive, product must also be inactive
        if (!isCatActive) {
            productActive = false;
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'At least 1 product image is required' });
        }
        if (req.files.length > 3) {
            return res.status(400).json({ success: false, message: 'Maximum 3 images allowed per product' });
        }

        // ── Upload all images to Cloudinary ──
        const uploadedImages = [];
        const uploadedPublicIds = [];

        for (const file of req.files) {
            const result = await uploadToCloudinary(file.buffer, 'products');
            uploadedImages.push(result.secure_url);
            uploadedPublicIds.push(result.public_id);
        }

        // ── Auto-calculate discount if not provided ──
        const calcDiscount = discount !== undefined
            ? Number(discount)
            : Math.round(((Number(originalPrice) - Number(price)) / Number(originalPrice)) * 100);

        const product = await Product.create({
            name:          name.trim(),
            description:   description.trim(),
            category:      trimmedCat,
            price:         Number(price),
            originalPrice: Number(originalPrice),
            discount:      calcDiscount >= 0 ? calcDiscount : 0,
            rating:        rating ? Number(rating) : 0,
            reviewCount:   reviewCount ? Number(reviewCount) : 0,
            sizes:         parseArrayField(sizes),
            colors:        parseArrayField(colors),
            isInStock:     productActive ? (isInStock === 'false' || isInStock === false ? false : true) : false,
            isActive:      productActive,
            images:        uploadedImages,
            public_ids:    uploadedPublicIds
        });

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            product
        });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating product'
        });
    }
};

// ============================================================
//  @desc    Get all Products (with filters & pagination)
//  @route   GET /api/products
// ============================================================
export const getAllProducts = async (req, res) => {
    try {
        const {
            category,
            minPrice,
            maxPrice,
            isInStock,
            search,
            page = 1,
            limit = 20
        } = req.query;

        const paging = pagination(req.query);
        if (!paging || [category, search].some(value => value !== undefined && (typeof value !== 'string' || value.length > 120))
            || [minPrice, maxPrice].some(value => value !== undefined && (typeof value !== 'string' || !Number.isFinite(Number(value)) || Number(value) < 0))
            || minPrice !== undefined && maxPrice !== undefined && Number(minPrice) > Number(maxPrice)) {
            return res.status(400).json({ success: false, message: 'Invalid catalog query.' });
        }

        const filter = {};

        if (category)           filter.category   = { $regex: literalSearch(category) };
        if (isInStock !== undefined) filter.isInStock = isInStock === 'true';
        if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = Number(minPrice);
            if (maxPrice) filter.price.$lte = Number(maxPrice);
        }
        if (search) {
            filter.$or = [
                { name:        { $regex: literalSearch(search) } },
                { description: { $regex: literalSearch(search) } },
                { category:    { $regex: literalSearch(search) } }
            ];
        }

        const skip = paging.skip;
        const total = await Product.countDocuments(filter);

        const products = await Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(paging.limit);

        res.status(200).json({
            success:     true,
            count:       products.length,
            total,
            currentPage: paging.page,
            totalPages:  Math.ceil(total / paging.limit),
            products
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching products'
        });
    }
};

// ============================================================
//  @desc    Get single Product by ID
//  @route   GET /api/products/:id
// ============================================================
export const getProductById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Product ID format' });
        }

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.status(200).json({ success: true, product });
    } catch (error) {
        console.error('Error fetching product by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching product'
        });
    }
};

// ============================================================
//  @desc    Update Product
//  @route   PUT /api/products/:id
// ============================================================
export const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Product ID format' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const {
            name, description, category,
            price, originalPrice, discount,
            rating, reviewCount,
            sizes, colors, isInStock, isActive,
            removeImageIndex  // optional: "0", "1", or "2" to remove a specific image
        } = req.body;

        // ── Update scalar fields ──
        if (name?.trim())        product.name        = name.trim();
        if (description?.trim()) product.description = description.trim();
        if (category?.trim())    product.category    = category.trim();
        if (price)               product.price        = Number(price);
        if (originalPrice)       product.originalPrice = Number(originalPrice);
        if (discount !== undefined) product.discount  = Number(discount);
        if (rating !== undefined)   product.rating    = Number(rating);
        if (reviewCount !== undefined) product.reviewCount = Number(reviewCount);
        if (sizes  !== undefined)  product.sizes  = parseArrayField(sizes);
        if (colors !== undefined)  product.colors = parseArrayField(colors);
        if (isInStock !== undefined) {
            product.isInStock = isInStock === 'false' || isInStock === false ? false : true;
        }
        if (isActive !== undefined) {
            product.isActive = isActive === 'true' || isActive === true;
        }

        // ── Remove a specific image by index ──
        if (removeImageIndex !== undefined) {
            const idx = Number(removeImageIndex);
            if (idx >= 0 && idx < product.images.length) {
                await deleteFromCloudinary(product.public_ids[idx]);
                product.images.splice(idx, 1);
                product.public_ids.splice(idx, 1);
            }
        }

        // ── Upload new images (replace old ones or add up to 3 total) ──
        if (req.files && req.files.length > 0) {
            const slotsAvailable = 3 - product.images.length;
            if (slotsAvailable <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Product already has 3 images. Remove one first before uploading new.'
                });
            }
            const filesToUpload = req.files.slice(0, slotsAvailable);
            for (const file of filesToUpload) {
                const result = await uploadToCloudinary(file.buffer, 'products');
                product.images.push(result.secure_url);
                product.public_ids.push(result.public_id);
            }
        }

        // ── Auto-recalculate discount if price/originalPrice changed ──
        if ((price || originalPrice) && discount === undefined) {
            const discountCalc = Math.round(
                ((product.originalPrice - product.price) / product.originalPrice) * 100
            );
            product.discount = discountCalc >= 0 ? discountCalc : 0;
        }

        const updatedProduct = await product.save();

        res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            product: updatedProduct
        });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating product'
        });
    }
};

// ============================================================
//  @desc    Delete Product (+ all Cloudinary images)
//  @route   DELETE /api/products/:id
// ============================================================
export const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Product ID format' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // ── Delete all images from Cloudinary ──
        for (const publicId of product.public_ids) {
            await deleteFromCloudinary(publicId);
        }

        await Product.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting product'
        });
    }
};

// ============================================================
//  @desc    Toggle Product Stock Status
//  @route   PATCH /api/products/:id/toggle-stock
// ============================================================
export const toggleProductStock = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Product ID format' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        product.isInStock = !product.isInStock;
        const updated = await product.save();

        res.status(200).json({
            success: true,
            message: `Product marked as ${updated.isInStock ? 'In Stock' : 'Out of Stock'}`,
            product: updated
        });
    } catch (error) {
        console.error('Error toggling product stock:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while toggling stock'
        });
    }
};

// ============================================================
//  @desc    Toggle Product Active Status
//  @route   PATCH /api/products/:id/toggle-status
// ============================================================
export const toggleProductStatus = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Product ID format' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        product.isActive = product.isActive === false ? true : false;
        const updated = await product.save();

        res.status(200).json({
            success: true,
            message: `Product marked as ${updated.isActive ? 'Active' : 'Inactive'}`,
            product: updated
        });
    } catch (error) {
        console.error('Error toggling product status:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while toggling status'
        });
    }
};
