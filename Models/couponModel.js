import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: [true, 'Coupon code is required'],
            unique: true,
            uppercase: true,
            trim: true,
            minlength: [3, 'Coupon code must be at least 3 characters'],
            maxlength: [30, 'Coupon code cannot exceed 30 characters'],
        },
        description: {
            type: String,
            trim: true,
            default: '',
        },
        couponType: {
            type: String,
            enum: ['all_users', 'first_order', 'individual'],
            default: 'all_users',
            required: true,
        },
        assignedUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null, // null for all_users / first_order; set for individual
        },
        assignedUserEmail: {
            type: String,
            default: null,
        },
        assignedUserName: {
            type: String,
            default: null,
        },
        discountType: {
            type: String,
            enum: ['percentage', 'fixed'],
            default: 'percentage',
            required: true,
        },
        discountValue: {
            type: Number,
            required: [true, 'Discount value is required'],
            min: [1, 'Discount value must be at least 1'],
        },
        minOrderAmount: {
            type: Number,
            set: (value) => value == null ? value : Math.round(value),
            default: 0,
            min: [0, 'Minimum order amount cannot be negative'],
        },
        maxDiscountAmount: {
            type: Number,
            set: (value) => value == null ? value : Math.round(value),
            default: null, // For percentage discount cap (null = no cap)
        },
        usageLimit: {
            type: Number,
            default: null, // Overall maximum number of redemptions allowed (null = unlimited)
        },
        usageCount: {
            type: Number,
            default: 0,
        },
        usedBy: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                },
                orderNumber: {
                    type: String,
                    default: '',
                },
                discountApplied: {
                    type: Number,
            set: (value) => value == null ? value : Math.round(value),
                    default: 0,
                },
                usedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        startDate: {
            type: Date,
            default: Date.now,
        },
        expiryDate: {
            type: Date,
            default: null, // null means never expires
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                ret.id = ret._id.toString();
                delete ret.__v;
                return ret;
            },
        },
    }
);

// Index for fast lookup by code is handled by unique: true
const Coupon = mongoose.model('Coupon', couponSchema);

export default Coupon;
