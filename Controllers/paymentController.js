import Stripe from 'stripe';
import Order from '../Models/orderModel.js';
import { invalid } from '../services/orderPricing.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config({ quiet: true });

const keyMode = (key, prefix) => new RegExp(`^${prefix}_(test|live)_`).exec(key || '')?.[1];
export const isStripeLiveOrTestConfigured = () => Boolean(keyMode(process.env.STRIPE_SECRET_KEY, '(?:sk|rk)'));
export const isCardCheckoutConfigured = () => isStripeLiveOrTestConfigured() && /^https?:\/\//.test(process.env.PAYMENT_RETURN_URL || '');
const isPaymentSheetConfigured = () => isStripeLiveOrTestConfigured() &&
    keyMode(process.env.STRIPE_SECRET_KEY, '(?:sk|rk)') === keyMode(process.env.STRIPE_PUBLISHABLE_KEY, 'pk');
export const isCardPaymentConfigured = () => isCardCheckoutConfigured() || isPaymentSheetConfigured();
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
    success: true, isConfigured: isCardCheckoutConfigured(), paymentSheetConfigured: isPaymentSheetConfigured(), currency: currency(),
});

async function ownedOrder(req) {
    if (!mongoose.isValidObjectId(req.body?.orderId)) throw invalid('A valid order ID is required.');
    const order = await Order.findOne({ _id: req.body.orderId, user: req.user.id })
        .select('+stripeCheckoutSessionId +stripePaymentFlow +stripePaymentIntentId');
    if (!order) throw invalid('Order not found.', 404);
    if (order.status === 'Cancelled') throw invalid('This order has been cancelled.');
    if (order.paymentMethod !== 'Credit / Debit Card (Stripe)') throw invalid('This order does not use card payment.');
    return order;
}

async function claimPaymentFlow(order, preferredFlow) {
    if (order.stripeCheckoutSessionId) return 'hosted';
    if (order.stripePaymentFlow) return order.stripePaymentFlow;
    const claimed = await Order.findOneAndUpdate({
        _id: order._id, paymentStatus: 'Pending', status: { $ne: 'Cancelled' },
        stripePaymentFlow: null, stripeCheckoutSessionId: null,
    }, { $set: { stripePaymentFlow: preferredFlow } }, { new: true }).select('+stripePaymentFlow');
    if (claimed) return claimed.stripePaymentFlow;
    const current = await Order.findById(order._id).select('+stripePaymentFlow +stripeCheckoutSessionId');
    if (!current || current.status === 'Cancelled' || current.paymentStatus !== 'Pending') throw invalid('This order is no longer payable.', 409);
    return current.stripeCheckoutSessionId ? 'hosted' : current.stripePaymentFlow;
}

export const createCheckoutSession = (req, res) => startPayment(req, res, false);
export const createPaymentSheet = (req, res) => startPayment(req, res, true);

async function startPayment(req, res, supportsSheet) {
    try {
        const api = client();
        const order = await ownedOrder(req);
        if (order.paymentStatus === 'Paid') throw invalid('This order has already been paid.');
        if (order.paymentStatus !== 'Pending') throw invalid('This order is no longer payable.', 409);
        if (order.totalAmount <= 0) throw invalid('Card payment requires a positive total.');
        const canUseSheet = supportsSheet && isPaymentSheetConfigured();
        if (!canUseSheet && !isCardCheckoutConfigured()) throw invalid('Card payments are currently unavailable.', 503);
        const flow = await claimPaymentFlow(order, canUseSheet ? 'sheet' : 'hosted');
        if (flow === 'sheet') {
            if (!canUseSheet) throw invalid('Open this order in the mobile app to finish payment.', 409);
            return await sendPaymentSheet(api, order, req.user.id, res);
        }
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
}

async function sendPaymentSheet(api, order, userId, res) {
    const intent = order.stripePaymentIntentId
        ? await api.paymentIntents.retrieve(order.stripePaymentIntentId)
        : await api.paymentIntents.create({
            amount: Math.round(order.totalAmount * 100), currency: currency(),
            payment_method_types: ['card'],
            metadata: { orderId: String(order._id), userId: String(userId) },
        }, { idempotencyKey: `payment-sheet:${order._id}` });
    const saved = await Order.updateOne({
        _id: order._id, stripePaymentFlow: 'sheet', status: { $ne: 'Cancelled' }, paymentStatus: 'Pending',
        stripePaymentIntentId: { $in: [null, intent.id] },
    }, { $set: { stripePaymentIntentId: intent.id } });
    if (!saved.matchedCount) throw invalid('This order is no longer payable.', 409);
    if (intent.status === 'succeeded') {
        const paid = await confirmIntent(intent);
        return res.json({ success: true, status: paid ? 'Paid' : 'Pending' });
    }
    if (intent.status === 'processing') return res.json({ success: true, status: 'Pending' });
    if (intent.status === 'canceled') throw invalid('This payment was canceled.', 409);
    res.set('Cache-Control', 'no-store');
    return res.json({
        success: true, paymentIntentClientSecret: intent.client_secret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
}

async function confirmIntent(intent) {
    if (intent.status !== 'succeeded' || intent.currency !== currency()) return false;
    const order = await Order.findOne({
        _id: intent.metadata?.orderId, user: intent.metadata?.userId,
        stripePaymentFlow: 'sheet', stripePaymentIntentId: intent.id, status: { $ne: 'Cancelled' },
        paymentMethod: 'Credit / Debit Card (Stripe)',
    });
    if (!order || intent.amount_received !== Math.round(order.totalAmount * 100)) return false;
    if (order.paymentStatus === 'Paid') return true;
    const result = await Order.updateOne({
        _id: order._id, stripePaymentIntentId: intent.id, status: { $ne: 'Cancelled' },
        paymentStatus: { $in: ['Pending', 'Paid'] },
    }, { $set: { paymentStatus: 'Paid' } });
    return Boolean(result.matchedCount);
}

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
        } else if (order.stripePaymentFlow === 'sheet' && order.stripePaymentIntentId && order.paymentStatus !== 'Paid') {
            const intent = await client().paymentIntents.retrieve(order.stripePaymentIntentId);
            if (await confirmIntent(intent)) order.paymentStatus = 'Paid';
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
        if (event.type === 'payment_intent.succeeded' && mongoose.isValidObjectId(event.data.object.metadata?.orderId)) {
            const intent = event.data.object;
            const order = await Order.exists({ _id: intent.metadata.orderId, stripePaymentFlow: 'sheet', status: { $ne: 'Cancelled' } });
            if (order && !await confirmIntent(intent)) return res.sendStatus(409);
        }
        return res.json({ received: true });
    } catch { return res.sendStatus(500); }
};
