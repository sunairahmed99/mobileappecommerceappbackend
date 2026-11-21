import Stripe from 'stripe';
import Order from '../Models/orderModel.js';
import { invalid } from '../services/orderPricing.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config({ quiet: true });

export const isStripeLiveOrTestConfigured = () => /^sk_(test|live)_/.test(process.env.STRIPE_SECRET_KEY || '');
export const isCardCheckoutConfigured = () => isStripeLiveOrTestConfigured() && /^https?:\/\//.test(process.env.PAYMENT_RETURN_URL || '');
let stripe;
const client = () => {
    if (!isStripeLiveOrTestConfigured()) throw invalid('Card payments are currently unavailable.', 503);
    return stripe ||= new Stripe(process.env.STRIPE_SECRET_KEY);
};
const currency = () => (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
const handleError = (res, error) => res.status(error.status || 500).json({
    success: false, message: error.status ? error.message : 'Unable to process payment. Please try again.',
});

export const getPaymentConfig = (_req, res) => res.json({
    success: true, isConfigured: isCardCheckoutConfigured(), currency: currency(),
});

async function ownedOrder(req) {
    if (!mongoose.isValidObjectId(req.body?.orderId)) throw invalid('A valid order ID is required.');
    const order = await Order.findOne({ _id: req.body.orderId, user: req.user.id }).select('+stripeCheckoutSessionId');
    if (!order) throw invalid('Order not found.', 404);
    if (order.status === 'Cancelled') throw invalid('This order has been cancelled.');
    if (order.paymentMethod !== 'Credit / Debit Card (Stripe)') throw invalid('This order does not use card payment.');
    return order;
}

// Card numbers and CVC never pass through the application server.
export const createCheckoutSession = async (req, res) => {
    try {
        const api = client();
        const order = await ownedOrder(req);
        if (order.paymentStatus === 'Paid') throw invalid('This order has already been paid.');
        if (order.totalAmount <= 0) throw invalid('Card payment requires a positive total.');
        if (order.stripeCheckoutSessionId) {
            const existing = await api.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
            if (existing.status === 'open') return res.json({ success: true, url: existing.url });
            if (existing.status === 'complete') {
                await confirmSession(existing);
                throw invalid('Checkout is complete. Refresh payment status.');
            }
        }
        const returnBase = process.env.PAYMENT_RETURN_URL;
        if (!returnBase || !/^https?:\/\//.test(returnBase)) throw invalid('Payment return URL is not configured.', 503);
        const session = await api.checkout.sessions.create({
            mode: 'payment', payment_method_types: ['card'],
            client_reference_id: String(order._id), customer_email: req.user.email,
            metadata: { orderId: String(order._id), userId: req.user.id },
            payment_intent_data: { metadata: { orderId: String(order._id), userId: req.user.id } },
            line_items: [{ quantity: 1, price_data: { currency: currency(),
                unit_amount: Math.round(order.totalAmount * 100),
                product_data: { name: `Order ${order.orderNumber}` } } }],
            success_url: `${returnBase}${returnBase.includes('?') ? '&' : '?'}payment=success`,
            cancel_url: `${returnBase}${returnBase.includes('?') ? '&' : '?'}payment=cancelled`,
        }, { idempotencyKey: `checkout:${order._id}:${order.stripeCheckoutSessionId || 'initial'}` });
        order.stripeCheckoutSessionId = session.id;
        await order.save();
        return res.json({ success: true, url: session.url });
    } catch (error) { return handleError(res, error); }
};

export async function confirmSession(session) {
    const order = await Order.findById(session.metadata?.orderId).select('+stripeCheckoutSessionId');
    if (!order || order.status === 'Cancelled' || order.stripeCheckoutSessionId !== session.id ||
        String(order.user) !== session.metadata?.userId || session.currency !== currency() ||
        session.amount_total !== Math.round(order.totalAmount * 100) || session.payment_status !== 'paid') return false;
    await Order.updateOne({ _id: order._id, paymentStatus: 'Pending', status: { $ne: 'Cancelled' } }, {
        $set: { paymentStatus: 'Paid', stripePaymentIntentId: session.payment_intent },
    });
    return true;
}

export const verifyPayment = async (req, res) => {
    try {
        const order = await ownedOrder(req);
        if (order.stripeCheckoutSessionId && order.paymentStatus !== 'Paid') {
            const session = await client().checkout.sessions.retrieve(order.stripeCheckoutSessionId);
            if (await confirmSession(session)) order.paymentStatus = 'Paid';
        }
        return res.json({ success: true, status: order.paymentStatus, order });
    } catch (error) { return handleError(res, error); }
};

export const stripeWebhook = async (req, res) => {
    let event;
    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) return res.sendStatus(503);
        event = client().webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } catch { return res.status(400).json({ success: false, message: 'Invalid webhook signature.' }); }
    try {
        if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
            const session = event.data.object;
            if (session.payment_status === 'paid' && !await confirmSession(session)) return res.sendStatus(409);
        }
        return res.json({ received: true });
    } catch { return res.sendStatus(500); }
};
