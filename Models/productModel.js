import mongoose from 'mongoose';
import { resolveProductImages } from '../services/productImages.js';

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Product name is required'],
            trim: true
        },
        description: {
            type: String,
            required: [true, 'Product description is required'],
            trim: true
        },
        category: {
            type: String,
            required: [true, 'Product category is required'],
            trim: true
        },
        price: {
            type: Number,
            set: (value) => value == null ? value : Math.round(value),
            required: [true, 'Product price is required'],
            min: [0, 'Price cannot be negative']
        },
        originalPrice: {
            type: Number,
            set: (value) => value == null ? value : Math.round(value),
            required: [true, 'Original price is required'],
            min: [0, 'Original price cannot be negative']
        },
        discount: {
            type: Number,
            default: 0,
            min: [0, 'Discount cannot be negative'],
            max: [100, 'Discount cannot exceed 100%']
        },
        rating: {
            type: Number,
            default: 0,
            min: [0, 'Rating cannot be negative'],
            max: [5, 'Rating cannot exceed 5']
        },
        reviewCount: {
            type: Number,
            default: 0,
            min: [0, 'Review count cannot be negative']
        },
        sizes: {
            type: [String],
            default: []
        },
        colors: {
            type: [String],
            default: []
        },
        isInStock: {
            type: Boolean,
            default: true
        },
        isActive: {
            type: Boolean,
            default: true
        },
        // Up to 3 product images stored on Cloudinary
        images: {
            type: [String],
            validate: {
                validator: (arr) => arr.length <= 3,
                message: 'A product can have at most 3 images'
            },
            default: []
        },
        public_ids: {
            type: [String],
            default: []
        }
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                ret.images = resolveProductImages(ret.images, ret.category);
                ret.price = Math.round(ret.price);
                ret.originalPrice = Math.round(ret.originalPrice);
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                delete ret.public_ids;
                return ret;
            }
        },
        toObject: {
            transform: (doc, ret) => {
                ret.images = resolveProductImages(ret.images, ret.category);
                ret.price = Math.round(ret.price);
                ret.originalPrice = Math.round(ret.originalPrice);
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                delete ret.public_ids;
                return ret;
            }
        }
    }
);

// Supports the catalog's default newest-first order without an in-memory sort.
productSchema.index({ createdAt: -1 });

const Product = mongoose.model('Product', productSchema);

export default Product;
