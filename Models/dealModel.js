import mongoose from 'mongoose';

const dealSchema = new mongoose.Schema(
    {
        dealName: {
            type: String,
            required: [true, 'Deal name is required'],
            trim: true,
        },
        description: {
            type: String,
            default: '',
            trim: true,
        },
        // Either link to an existing product OR store a custom product inline
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            default: null,
        },
        // If admin adds a custom product (not from DB), store details here
        customProduct: {
            name: { type: String, default: '' },
            images: { type: [String], default: [] },
            category: { type: String, default: '' },
        },
        // Deal-specific price fields (overrides product price when set)
        dealPrice: {
            type: Number,
            set: (value) => value == null ? value : Math.round(value),
            required: [true, 'Deal price is required'],
            min: [0, 'Deal price cannot be negative'],
        },
        originalPrice: {
            type: Number,
            set: (value) => value == null ? value : Math.round(value),
            required: [true, 'Original price is required'],
            min: [0, 'Original price cannot be negative'],
        },
        discountPercentage: {
            type: Number,
            default: 0,
            min: [0, 'Discount cannot be negative'],
            max: [100, 'Discount cannot exceed 100%'],
        },
        // Deal validity
        startDate: {
            type: Date,
            default: Date.now,
        },
        endDate: {
            type: Date,
            default: null,
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
                ret.dealPrice = Math.round(ret.dealPrice);
                ret.originalPrice = Math.round(ret.originalPrice);
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                return ret;
            },
        },
        toObject: {
            transform: (doc, ret) => {
                ret.dealPrice = Math.round(ret.dealPrice);
                ret.originalPrice = Math.round(ret.originalPrice);
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                return ret;
            },
        },
    }
);

const Deal = mongoose.model('Deal', dealSchema);
export default Deal;

