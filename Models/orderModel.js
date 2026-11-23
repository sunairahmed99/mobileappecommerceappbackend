import mongoose from 'mongoose';
import { ORDER_STATUSES, normalizeOrderStatus } from '../services/orderStatus.js';

const orderSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        orderNumber: {
            type: String,
            required: true,
            unique: true
        },
        items: [
            {
                productId: { type: mongoose.Schema.Types.ObjectId },
                name: { type: String, required: true },
                image: { type: String, default: '' },
                qty: { type: Number, required: true, default: 1 },
                price: { type: Number, required: true },
                size: { type: String, default: null },
                color: { type: String, default: null }
            }
        ],
        subtotal: { type: Number, required: true },
        discount: { type: Number, default: 0 },
        couponCode: { type: String, default: null },
        shippingFee: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        totalAmount: { type: Number, required: true },
        shippingAddress: {
            fullName: { type: String, required: true },
            phone: { type: String, required: true },
            address: { type: String, required: true },
            city: { type: String, required: true },
            landmark: { type: String, default: '' }
        },
        paymentMethod: {
            type: String,
            default: 'Cash on Delivery (COD)'
        },
        paymentStatus: {
            type: String,
            enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
            default: 'Pending'
        },
        stripePaymentIntentId: {
            type: String,
            default: null
        },
        stripeChargeId: {
            type: String,
            default: null
        },
        stripeCheckoutSessionId: { type: String, default: null, select: false },
        stripePaymentFlow: { type: String, enum: ['hosted', 'sheet'], select: false },
        status: {
            type: String,
            enum: ORDER_STATUSES,
            default: 'Pending'
        }
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                ret.status = normalizeOrderStatus(ret.status);
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                delete ret.stripeCheckoutSessionId;
                delete ret.stripePaymentFlow;
                delete ret.stripePaymentIntentId;
                delete ret.stripeChargeId;
                return ret;
            }
        }
    }
);

export default mongoose.model('Order', orderSchema);

