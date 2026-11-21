import { ORDER_STATUSES, canUpdateOrderStatus } from '../services/orderStatus.js';
import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('orderController');
import Order from '../Models/orderModel.js';
import Notification from '../Models/notificationModel.js';
import User from '../Models/userModel.js';
import { sendOrderConfirmationEmail } from '../config/mailer.js';
import { nextOrderNumber } from '../services/orderNumber.js';
import { priceOrder, invalid } from '../services/orderPricing.js';
import Coupon from '../Models/couponModel.js';
import { isCardCheckoutConfigured } from './paymentController.js';

// ── GET /api/orders/my-orders ───────────────────────────────────────
export const getMyOrders = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Login required to view your orders.',
            });
        }

        const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: orders.length,
            orders,
        });
    } catch (error) {
        console.error('GetMyOrders error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching orders.' });
    }
};

// ── POST /api/orders ────────────────────────────────────────────────
export const createOrder = async (req, res) => {
    let reservedCoupon = null;
    let orderNumber;
    let saved = false;
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Login is required to place an order. Please log in first.',
                requireLogin: true,
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User account not found. Please log in again.',
                requireLogin: true,
            });
        }

        const { shippingAddress, paymentMethod } = req.body;
        const { items, subtotal, discount, couponCode, shippingFee, tax, totalAmount } = await priceOrder(req.body, userId);
        const card = paymentMethod === 'Credit / Debit Card (Stripe)';
        if (!['Cash on Delivery (COD)', 'Credit / Debit Card (Stripe)'].includes(paymentMethod)) throw invalid('Invalid payment method.');
        if (card && !isCardCheckoutConfigured()) throw invalid('Card payments are currently unavailable. Please choose cash on delivery.', 503);

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Order items cannot be empty.' });
        }
        if (!shippingAddress || ['fullName', 'phone', 'address', 'city'].some((field) => typeof shippingAddress[field] !== 'string' || !shippingAddress[field].trim() || shippingAddress[field].length > 500)) {
            return res.status(400).json({ success: false, message: 'Delivery address details are incomplete.' });
        }

        orderNumber = await nextOrderNumber();
        if (couponCode) {
            reservedCoupon = await Coupon.findOneAndUpdate({
                code: couponCode, isActive: true, 'usedBy.user': { $ne: user._id },
                $expr: { $or: [{ $eq: ['$usageLimit', null] }, { $lt: ['$usageCount', '$usageLimit'] }] },
            }, { $inc: { usageCount: 1 }, $push: { usedBy: { user: user._id, orderNumber, discountApplied: discount } } });
            if (!reservedCoupon) throw invalid('This coupon has already been redeemed or reached its limit.');
        }

        const newOrder = await Order.create({
            user: user._id,
            orderNumber,
            items,
            subtotal: Number(subtotal) || 0,
            discount: Number(discount) || 0,
            couponCode: couponCode ? String(couponCode).trim().toUpperCase() : null,
            shippingFee: Number(shippingFee) || 0,
            tax: Number(tax) || 0,
            totalAmount: Number(totalAmount) || 0,
            shippingAddress,
            paymentMethod: paymentMethod || 'Cash on Delivery (COD)',
            paymentStatus: 'Pending',
            status: 'Pending',
        });

        saved = true;

        // 1. Dynamic Notification for User
        try {
            await Notification.create({
                user: user._id,
                category: 'order',
                title: 'Order Placed! 🛍️',
                message: `Your order #${orderNumber} (${items.length} items) has been received and is being prepared.`,
                orderId: orderNumber,
                read: false,
            });
        } catch (notifErr) {
            console.error('Order notification creation error:', notifErr);
        }

        // 2. Send Order Confirmation Email to User
        const recipientEmail = user.email;
        let confirmationEmailSent = false;
        if (recipientEmail) {
            try {
                await sendOrderConfirmationEmail(recipientEmail, user.name || shippingAddress.fullName, {
                    orderNumber,
                    createdAt: newOrder.createdAt,
                    items,
                    subtotal: newOrder.subtotal,
                    shippingFee: newOrder.shippingFee,
                    discount: newOrder.discount,
                    tax: newOrder.tax,
                    totalAmount: newOrder.totalAmount,
                    shippingAddress,
                    paymentMethod: newOrder.paymentMethod,
                    paymentStatus: newOrder.paymentStatus,
                    status: newOrder.status,
                });
                confirmationEmailSent = true;
            } catch (mailErr) {
                console.error('Failed to send order confirmation email:', mailErr);
            }
        }

        return res.status(201).json({
            success: true,
            message: confirmationEmailSent
                ? 'Order placed successfully! Order details have been emailed to your account address.'
                : 'Order placed successfully. The confirmation email could not be sent. Your order details are available in My Orders.',
            confirmationEmailSent,
            order: newOrder,
        });
    } catch (error) {
        if (reservedCoupon && !saved) {
            await Coupon.updateOne({ _id: reservedCoupon._id, 'usedBy.orderNumber': orderNumber }, {
                $inc: { usageCount: -1 }, $pull: { usedBy: { orderNumber } },
            });
        }
        console.error('CreateOrder error:', error);
        return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Server error placing order.' });
    }
};

// ── GET /api/orders/:id ─────────────────────────────────────────────
export const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        // Authorization check: User can view their own order, or Admin can view any order
        if (!req.user || (String(order.user) !== req.user.id && req.user.role !== 'admin')) {
            return res.status(403).json({ success: false, message: 'Access denied. You can only view your own orders.' });
        }

        return res.status(200).json({ success: true, order });
    } catch (error) {
        console.error('GetOrderById error:', error);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ── GET /api/orders/admin/all  (admin only) ──────────────────────────
export const getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find({}).sort({ createdAt: -1 });
        const totalRevenue = orders
            .filter((o) => o.status !== 'Cancelled')
            .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        return res.status(200).json({
            success: true,
            count: orders.length,
            totalRevenue,
            orders,
        });
    } catch (error) {
        console.error('GetAllOrders error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching all orders.' });
    }
};

// ── PATCH /api/orders/admin/:id/status  (admin only) ─────────────────
export const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const VALID_STATUSES = ORDER_STATUSES;
        if (!status || !VALID_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}.`,
            });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (!canUpdateOrderStatus(order.status, status)) {
            return res.status(400).json({ success: false, message: 'Orders cannot be moved back to an earlier status.' });
        }
        if (status === 'Delivered' && order.paymentMethod === 'Credit / Debit Card (Stripe)' && order.paymentStatus !== 'Paid') {
            return res.status(400).json({ success: false, message: 'Confirm card payment before marking this order as delivered.' });
        }
        order.status = status;
        await order.save();

        // Create a notification for the user if there is one
        if (order.user) {
            try {
                await Notification.create({
                    user: order.user,
                    category: 'order',
                    title: `Order ${status} 📦`,
                    message: `Your order #${order.orderNumber} status has been updated to "${status}".`,
                    orderId: order.orderNumber,
                    read: false,
                });
            } catch {}
        }

        return res.status(200).json({
            success: true,
            message: `Order status updated to "${status}".`,
            order,
        });
    } catch (error) {
        console.error('UpdateOrderStatus error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating order status.' });
    }
};

