import { test, afterEach } from '@jest/globals';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mock } from 'node:test';
import nodemailer from 'nodemailer';
import app from '../app.js';
import User from '../Models/userModel.js';
import Product from '../Models/productModel.js';
import Deal from '../Models/dealModel.js';
import Order from '../Models/orderModel.js';
import OrderReference from '../Models/orderReferenceModel.js';
import Coupon from '../Models/couponModel.js';
import Notification from '../Models/notificationModel.js';
import StoreSettings from '../Models/storeSettingsModel.js';
import DeliverySettings from '../Models/deliverySettingsModel.js';
import { generateToken, authenticateToken } from '../config/jwt.js';
import { priceOrder } from '../services/orderPricing.js';
import { confirmSession } from '../Controllers/paymentController.js';
import { sanitizeInputs, rateLimit } from '../middleware/security.js';
import { initSocket } from '../socket.js';

process.env.JWT_SECRET = 'local-regression-test-secret-not-a-production-key';
const uid = '507f1f77bcf86cd799439011';
const other = '507f191e810c19729de860ea';
const pid = '507f1f77bcf86cd799439012';
const user = { _id: uid, role: 'user', isActive: true, isVerified: true, name: 'Customer', email: '' };
afterEach(() => mock.restoreAll());

async function withServer(fn, sockets = false) {
    const server = http.createServer(app);
    const io = sockets ? initSocket(server) : null;
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try { await fn(`http://127.0.0.1:${server.address().port}`); }
    finally { if (io) io.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${generateToken(uid, 'admin')}` });
function catalog() {
    mock.method(StoreSettings, 'findOne', async () => null);
    mock.method(DeliverySettings, 'findOne', async () => ({ isActive: true, deliveryCharge: 10, freeDeliveryThreshold: 1000 }));
    mock.method(Product, 'findById', async () => ({ name: 'Real product', price: 50, images: [], sizes: [], colors: [], isActive: true, isInStock: true }));
}

test('JWT uses current DB role and rejects disabled/deleted accounts', async () => {
    mock.method(User, 'findById', async () => user);
    assert.equal((await authenticateToken(generateToken(uid, 'admin'))).role, 'user');
    User.findById.mock.mockImplementation(async () => ({ ...user, isActive: false }));
    await assert.rejects(authenticateToken(generateToken(uid, 'admin')));
    User.findById.mock.mockImplementation(async () => null);
    await assert.rejects(authenticateToken(generateToken(uid, 'admin')));
});

test('order quote ignores forged prices, discounts, tax and totals', async () => {
    catalog();
    const quote = await priceOrder({ items: [{ productId: pid, qty: 2, price: 0.01 }], totalAmount: 0.01, discount: 999 }, uid);
    assert.deepEqual([quote.subtotal, quote.discount, quote.tax, quote.shippingFee, quote.totalAmount], [100, 0, 5, 10, 115]);
    for (const qty of [-1, 0, 1.5, 100, '1']) await assert.rejects(priceOrder({ items: [{ productId: pid, qty }] }, uid));
    await assert.rejects(priceOrder({ items: [{ qty: 1 }] }, uid));
    Product.findById.mock.mockImplementation(async () => ({ isActive: false }));
    await assert.rejects(priceOrder({ items: [{ productId: pid, qty: 1 }] }, uid));
});

test('coupon eligibility is rechecked against the authenticated user', async () => {
    catalog();
    mock.method(Coupon, 'findOne', async () => ({ isActive: true, minOrderAmount: 0, usedBy: [{ user: uid }], discountValue: 90 }));
    await assert.rejects(priceOrder({ items: [{ productId: pid, qty: 1 }], couponCode: 'USED' }, uid));
});

test('deal pricing comes from the catalog and rejects expired deals and invalid variants', async () => {
    catalog();
    Product.findById.mock.mockImplementation(async () => null);
    const deal = { isActive: true, startDate: new Date(0), endDate: null, dealPrice: 25,
        customProduct: { name: 'Custom deal', images: [] }, product: null };
    mock.method(Deal, 'findById', () => ({ populate: async () => deal }));
    const quote = await priceOrder({ items: [{ productId: pid, qty: 2, price: 1 }] }, uid);
    assert.equal(quote.subtotal, 50);
    deal.endDate = new Date(0);
    await assert.rejects(priceOrder({ items: [{ productId: pid, qty: 1 }] }, uid));
    deal.endDate = null;
    deal.product = { name: 'Linked product', sizes: ['L'], colors: ['red'], isActive: true, isInStock: true };
    await assert.rejects(priceOrder({ items: [{ productId: pid, qty: 1, size: 'S', color: 'red' }] }, uid));
    assert.equal((await priceOrder({ items: [{ productId: pid, qty: 1, size: 'L', color: 'red' }] }, uid)).subtotal, 25);
});

test('order detail rejects other owners, including orders without an owner', async () => {
    mock.method(User, 'findById', async () => user);
    mock.method(Order, 'findById', async () => ({ user: other }));
    await withServer(async base => {
        assert.equal((await fetch(`${base}/api/orders/${pid}`, { headers: authHeaders() })).status, 403);
        Order.findById.mock.mockImplementation(async () => ({ user: null }));
        assert.equal((await fetch(`${base}/api/orders/${pid}`, { headers: authHeaders() })).status, 403);
        Order.findById.mock.mockImplementation(async () => ({ user: uid }));
        assert.equal((await fetch(`${base}/api/orders/${pid}`, { headers: authHeaders() })).status, 200);
    });
});

test('order creation saves server total and Pending despite a forged Paid payload', async () => {
    catalog();
    mock.method(OrderReference, 'create', async () => ({}));
    mock.method(User, 'findById', async () => user);
    mock.method(Notification, 'create', async () => ({}));
    mock.method(Order, 'create', async payload => ({ ...payload, id: pid }));
    await withServer(async base => {
        const response = await fetch(`${base}/api/orders`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({
            items: [{ productId: pid, qty: 1, price: 0 }], totalAmount: 0,
            paymentMethod: 'Cash on Delivery (COD)', paymentStatus: 'Paid', stripePaymentIntentId: 'fake',
            shippingAddress: { fullName: 'Customer', phone: '123456789', address: 'Street', city: 'City' },
        }) });
        assert.equal(response.status, 201);
        const { order } = await response.json();
        assert.equal(order.paymentStatus, 'Pending');
        assert.equal(order.status, 'Pending');
        assert.equal(order.totalAmount, 63);
        assert.equal(order.stripePaymentIntentId, undefined);
    });
});

test('order confirmation emails account owner with full details and reports delivery failures honestly', async () => {
    catalog();
    mock.method(User, 'findById', async () => ({ ...user, email: 'customer@example.com' }));
    mock.method(OrderReference, 'create', async () => ({}));
    mock.method(Notification, 'create', async () => ({}));
    mock.method(Order, 'create', async payload => ({ ...payload, id: pid, createdAt: new Date() }));
    let fail = false;
    const emails = [];
    mock.method(nodemailer, 'createTransport', () => ({ sendMail: async message => {
        emails.push(message);
        if (fail) throw new Error('Simulated SMTP failure');
        return { accepted: [message.to] };
    } }));
    await withServer(async base => {
        const place = async () => {
            const response = await fetch(`${base}/api/orders`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({
                items: [{ productId: pid, qty: 2 }],
                paymentMethod: 'Cash on Delivery (COD)',
                shippingAddress: { fullName: '<Customer>', phone: '123456789', address: 'Street', city: 'City', email: 'other@example.com' },
            }) });
            assert.equal(response.status, 201);
            return response.json();
        };
        const delivered = await place();
        assert.match(delivered.order.orderNumber, /^ORD-[2-9A-HJ-NP-Z]{6}$/);
        assert.equal(delivered.confirmationEmailSent, true);
        assert.equal(emails[0].to, 'customer@example.com');
        assert.match(emails[0].text, /Real product x 2/);
        assert.match(emails[0].text, /Total: \$115(?:\n|$)/);
        assert.match(emails[0].text, /Payment status: Pending/);
        assert.match(emails[0].html, /&lt;Customer&gt;/);
        fail = true;
        const failed = await place();
        assert.equal(failed.confirmationEmailSent, false);
        assert.match(failed.order.orderNumber, /^ORD-[2-9A-HJ-NP-Z]{6}$/);
        assert.match(failed.message, /could not be sent/);
    });
});

test('payment verification requires login and filters orders by owner', async () => {
    mock.method(User, 'findById', async () => user);
    mock.method(Order, 'findOne', query => {
        assert.equal(query.user, uid);
        return { select: async () => null };
    });
    await withServer(async base => {
        const body = JSON.stringify({ orderId: pid, paymentIntentId: 'fake' });
        assert.equal((await fetch(`${base}/api/payment/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 401);
        assert.equal((await fetch(`${base}/api/payment/verify`, { method: 'POST', headers: authHeaders(), body })).status, 404);
        assert.equal((await fetch(`${base}/api/notifications/send-push`, { method: 'POST', headers: authHeaders(), body: '{}' })).status, 403);
    });
});

test('payment confirmation checks session, owner, currency, amount and paid status', async () => {
    const order = { _id: pid, user: uid, totalAmount: 50, status: 'Processing', stripeCheckoutSessionId: 'cs_expected' };
    mock.method(Order, 'findById', () => ({ select: async () => order }));
    const update = mock.method(Order, 'updateOne', async () => ({}));
    const session = { id: 'cs_expected', metadata: { orderId: pid, userId: uid }, currency: process.env.STRIPE_CURRENCY || 'usd', amount_total: 5000, payment_status: 'paid', payment_intent: 'pi_real' };
    for (const patch of [{ id: 'other' }, { metadata: { orderId: pid, userId: other } }, { currency: 'eur' }, { amount_total: 1 }, { payment_status: 'unpaid' }]) {
        assert.equal(await confirmSession({ ...session, ...patch }), false);
    }
    assert.equal(update.mock.callCount(), 0);
    assert.equal(await confirmSession(session), true);
    assert.equal(update.mock.callCount(), 1);
    assert.equal(update.mock.calls[0].arguments[0].paymentStatus, 'Pending');
});

test('sanitizer visits nested arrays and rate limiter ignores spoofed forwarding headers', () => {
    const req = { body: { items: [{ nested: { $ne: null, name: 'safe' } }] } };
    sanitizeInputs(req, {}, () => {});
    assert.deepEqual(req.body.items[0].nested, { name: 'safe' });
    const limiter = rateLimit({ max: 1 });
    let rejected = false;
    const res = { setHeader() {}, status() { rejected = true; return this; }, json() {} };
    for (const header of ['fake-a', 'fake-b']) limiter({ ip: '127.0.0.1', path: '/unique-test', headers: { 'x-forwarded-for': header } }, res, () => {});
    assert.equal(rejected, true);
});

test('socket handshake rejects anonymous clients and ignores forged admin role', async () => {
    mock.method(User, 'findById', async () => user);
    await withServer(async base => {
        async function connect(token) {
            const ws = new WebSocket(`${base.replace('http:', 'ws:')}/socket.io/?EIO=4&transport=websocket`);
            const messages = [];
            let wait;
            ws.onmessage = event => { messages.push(String(event.data)); wait?.(); };
            async function packet(prefix) {
                const timeout = setTimeout(() => wait?.(new Error('Socket response timed out')), 3000);
                try {
                    while (!messages.some(message => message.startsWith(prefix))) {
                        await new Promise((resolve, reject) => { wait = error => error ? reject(error) : resolve(); });
                    }
                    return messages.splice(messages.findIndex(message => message.startsWith(prefix)), 1)[0];
                } finally { clearTimeout(timeout); wait = null; }
            }
            await packet('0');
            ws.send('40' + JSON.stringify(token ? { token } : {}));
            return { ws, packet };
        }
        const anonymous = await connect();
        assert.match(await anonymous.packet('44'), /Authentication required/);
        anonymous.ws.close();
        const authenticated = await connect(generateToken(uid, 'admin'));
        try {
            await authenticated.packet('40');
            authenticated.ws.send('42["register",{"userId":"fake","role":"admin"}]');
            authenticated.ws.send('420["get_admin_conversations",{}]');
            assert.match(await authenticated.packet('430'), /Admin access required/);
            authenticated.ws.send(`421["send_message",{"userId":"${other}","sender":"admin","text":"spoof"}]`);
            assert.match(await authenticated.packet('431'), /Unauthorized/);
        } finally { authenticated.ws.close(); }
    }, true);
});
