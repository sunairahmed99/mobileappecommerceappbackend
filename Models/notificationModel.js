import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        category: {
            type: String,
            enum: ['order', 'offer', 'system', 'coupon', 'deal', 'promo', 'vip'],
            default: 'order'
        },
        title: {
            type: String,
            required: true
        },
        message: {
            type: String,
            required: true
        },
        orderId: {
            type: String,
            default: null
        },
        couponCode: {
            type: String,
            default: null
        },
        discount: {
            type: String,
            default: null
        },
        targetAudience: {
            type: String,
            enum: ['all', 'high_spenders', 'individual'],
            default: 'individual'
        },
        targetUserName: {
            type: String,
            default: null
        },
        read: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                return ret;
            }
        }
    }
);

export default mongoose.model('Notification', notificationSchema);

