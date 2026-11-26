import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import User from '../Models/userModel.js';
import Order from '../Models/orderModel.js';
import Product from '../Models/productModel.js';
import Banner from '../Models/bannerModel.js';
import BannerCategory from '../Models/bannerCategoryModel.js';
import Deal from '../Models/dealModel.js';
import Feedback from '../Models/feedbackModel.js';
import Notification from '../Models/notificationModel.js';
import Message from '../Models/messageModel.js';
import StoreSettings from '../Models/storeSettingsModel.js';
import DeliverySettings from '../Models/deliverySettingsModel.js';
import Coupon from '../Models/couponModel.js';
import { generateToken } from '../config/jwt.js';
import { createSafeLogger } from '../services/safeLogger.js';
import { secureResponseReplacer } from '../services/responseSecurity.js';
import { rateLimit } from '../middleware/security.js';
import authRoutes from '../Routes/authRoutes.js';
import productRoutes from '../Routes/productRoutes.js';
import bannerRoutes from '../Routes/bannerRoutes.js';
import categoryRoutes from '../Routes/bannerCategoryRoutes.js';
import dealRoutes from '../Routes/dealRoutes.js';
import orderRoutes from '../Routes/orderRoutes.js';
import feedbackRoutes from '../Routes/feedbackRoutes.js';
import notificationRoutes from '../Routes/notificationRoutes.js';
import chatRoutes from '../Routes/chatRoutes.js';
import couponRoutes from '../Routes/couponRoutes.js';
import deliveryRoutes from '../Routes/deliveryRoutes.js';
import settingsRoutes from '../Routes/storeSettingsRoutes.js';
import paymentRoutes from '../Routes/paymentRoutes.js';

const uid = '507f1f77bcf86cd799439011';
const other = '507f191e810c19729de860ea';
const id = '507f1f77bcf86cd799439012';
const secret = 'QA_PRIVATE_MARKER_never_expose';
const account = role => new User({ _id: uid, name: 'QA User', email: 'qa@example.test', role, isActive: true, isVerified: true, password: secret, verificationOtp: secret, resetPasswordOtp: secret, emailChangeOtp: secret, pendingEmail: secret, pushToken: secret });
const chain = value => {
    const result = {};
    for (const method of ['select', 'sort', 'skip', 'limit', 'populate', 'lean']) result[method] = () => result;
    result.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
    return result;
};
let current;
beforeEach(() => {
    jest.spyOn(globalThis.console, 'error').mockImplementation(() => {});
    current = account('user');
    jest.spyOn(User, 'findById').mockImplementation(() => chain(current));
});
afterEach(() => jest.restoreAllMocks());
const authorized = method => method.set('Authorization', `Bearer ${generateToken(uid, 'admin')}`);

describe('feedback read state', () => {
    test('opening feedback saves read state without changing its workflow or approval', async () => {
        current.role = 'admin';
        const feedback = { id, isRead: true, status: 'Open', isApproved: false };
        const update = jest.spyOn(Feedback, 'findByIdAndUpdate').mockResolvedValue(feedback);
        const response = await authorized(request(app).patch(`/api/feedback/admin/${id}/read`));
        expect(response.status).toBe(200);
        expect(response.body.feedback).toEqual(feedback);
        expect(update).toHaveBeenCalledWith(id, { $set: { isRead: true } }, { new: true });
    });

    test('missing feedback returns 404', async () => {
        current.role = 'admin';
        jest.spyOn(Feedback, 'findByIdAndUpdate').mockResolvedValue(null);
        const response = await authorized(request(app).patch(`/api/feedback/admin/${id}/read`));
        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
    });
});

describe('review moderation', () => {
    test('approval is repeatable and publishes a previously declined review', async () => {
        current.role = 'admin';
        const feedback = { id, type: 'feedback', isApproved: false, isDeclined: true, approvedAt: null, save: jest.fn().mockResolvedValue(undefined) };
        jest.spyOn(Feedback, 'findById').mockResolvedValue(feedback);
        for (let attempt = 0; attempt < 2; attempt++) {
            const response = await authorized(request(app).patch(`/api/feedback/admin/${id}/approve`));
            expect(response.status).toBe(200);
            expect(response.body.feedback).toMatchObject({ isApproved: true, isDeclined: false, isRead: true });
        }
        expect(feedback.approvedAt).toBeInstanceOf(Date);
    });

    test('declining an approved review removes its public approval', async () => {
        current.role = 'admin';
        const feedback = { id, type: 'feedback', isApproved: true, approvedAt: new Date(), save: jest.fn().mockResolvedValue(undefined) };
        jest.spyOn(Feedback, 'findById').mockResolvedValue(feedback);
        const response = await authorized(request(app).patch(`/api/feedback/admin/${id}/decline`));
        expect(response.status).toBe(200);
        expect(response.body.feedback).toMatchObject({ isApproved: false, isDeclined: true, isRead: true, approvedAt: null });
    });

    test('support tickets cannot be published as reviews', async () => {
        current.role = 'admin';
        const save = jest.fn();
        jest.spyOn(Feedback, 'findById').mockResolvedValue({ type: 'support', save });
        const response = await authorized(request(app).patch(`/api/feedback/admin/${id}/approve`));
        expect(response.status).toBe(400);
        expect(save).not.toHaveBeenCalled();
    });

    test.each(['approve', 'decline'])('missing review cannot be moderated: %s', async (decision) => {
        current.role = 'admin';
        jest.spyOn(Feedback, 'findById').mockResolvedValue(null);
        const response = await authorized(request(app).patch(`/api/feedback/admin/${id}/${decision}`));
        expect(response.status).toBe(404);
    });

    test('an empty inbox stays empty without recreating demo reviews', async () => {
        current.role = 'admin';
        const find = jest.spyOn(Feedback, 'find').mockReturnValue(chain([]));
        const insert = jest.spyOn(Feedback, 'insertMany');
        const response = await authorized(request(app).get('/api/feedback/admin/all'));
        expect(response.status).toBe(200);
        expect(response.body.feedbacks).toEqual([]);
        expect(find).toHaveBeenCalledWith({ type: 'feedback' });
        expect(insert).not.toHaveBeenCalled();
    });
});

const mounts = { auth: authRoutes, products: productRoutes, banners: bannerRoutes, 'banner-categories': categoryRoutes, deals: dealRoutes, orders: orderRoutes, feedback: feedbackRoutes, notifications: notificationRoutes, chat: chatRoutes, coupons: couponRoutes, 'delivery-settings': deliveryRoutes, 'store-settings': settingsRoutes, payment: paymentRoutes };
const publicAuth = new Set(['/register', '/login', '/google', '/verify-registration-otp', '/resend-verification-otp', '/forgot-password', '/resend-forgot-password-otp', '/reset-password']);
const routes = Object.entries(mounts).flatMap(([mount, router]) => router.stack.filter(layer => layer.route).flatMap(({ route }) => Object.keys(route.methods).map(method => {
    const path = `/api/${mount}${route.path === '/' ? '' : route.path}`;
    const publicRoute = mount === 'auth' ? publicAuth.has(route.path)
        : ['products', 'banners', 'banner-categories', 'deals', 'delivery-settings', 'store-settings'].includes(mount) ? method === 'get'
        : mount === 'payment' ? route.path === '/config'
        : mount === 'feedback' ? (method === 'get' && route.path === '/public') || (method === 'post' && route.path === '/')
        : (mount === 'coupons' && route.path === '/validate') || (mount === 'chat' && method === 'post' && route.path === '/assistant');
    const admin = !publicRoute && (['products', 'banners', 'banner-categories', 'deals', 'delivery-settings', 'store-settings'].includes(mount)
        || mount === 'auth' && route.path.startsWith('/users') || mount === 'coupons'
        || path.includes('/admin/') || mount === 'notifications' && ['/customer-spending', '/send-deal', '/send-coupon', '/campaign-history', '/send-push'].includes(route.path));
    return { method, path, url: path.replace(/:[\w]+/g, id), publicRoute, admin };
})));

describe('every protected API route rejects unauthenticated requests', () => {
    test.each(routes.filter(route => !route.publicRoute))('$method $path → 401', async ({ method, url }) => {
        const response = await request(app)[method](url).send({});
        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
        expect(response.headers['cache-control']).toBe('no-store');
    });
});
describe('every admin route rejects a regular account even with a forged admin claim', () => {
    test.each(routes.filter(route => route.admin))('$method $path → 403', async ({ method, url }) => {
        const response = await authorized(request(app)[method](url)).send({});
        expect(response.status).toBe(403);
        expect(response.text).not.toContain(secret);
    });
});

describe('JWT and owner boundaries', () => {
    test.each([
        ['malformed', 'invalid-token'],
        ['expired', jwt.sign({ id: uid }, process.env.JWT_SECRET, { expiresIn: -1 })],
        ['wrong secret', jwt.sign({ id: uid }, 'wrong-secret')],
        ['wrong algorithm', jwt.sign({ id: uid }, process.env.JWT_SECRET, { algorithm: 'HS384' })],
    ])('%s tokens fail without leaking diagnostics', async (_label, token) => {
        const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
        expect(response.status).toBe(401);
        expect(response.text).not.toMatch(/JsonWebTokenError|jwt expired|signature|stack/);
    });
    test.each(['disabled', 'unverified', 'deleted'])('%s account fails on an existing valid JWT', async state => {
        if (state === 'deleted') current = null;
        if (state === 'disabled') current.isActive = false;
        if (state === 'unverified') current.isVerified = false;
        expect((await authorized(request(app).get('/api/auth/me'))).status).toBe(401);
    });
    test('a regular account cannot read another customer chat', async () => {
        const query = jest.spyOn(Message, 'find');
        expect((await authorized(request(app).get(`/api/chat/history/${other}`))).status).toBe(403);
        expect(query).not.toHaveBeenCalled();
    });
    test('notifications can only be marked for the authenticated owner', async () => {
        const update = jest.spyOn(Notification, 'findOne').mockResolvedValue(null);
        await authorized(request(app).patch(`/api/notifications/${id}/read`));
        expect(update.mock.calls[0][0]).toEqual(expect.objectContaining({ _id: id, user: uid }));
    });
});

describe('sensitive response data', () => {
    test('user model serialization removes auth secrets and push token', () => {
        for (const output of [current.toJSON(), current.toObject()]) {
            expect(JSON.stringify(output)).not.toContain(secret);
            expect(output.email).toBe('qa@example.test');
        }
    });
    test('GET /me returns profile fields without secrets or server headers', async () => {
        const response = await authorized(request(app).get('/api/auth/me'));
        expect(response.status).toBe(200);
        expect(response.body.user.email).toBe('qa@example.test');
        expect(response.text).not.toContain(secret);
        expect(response.headers['x-powered-by']).toBeUndefined();
        expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
    test('login returns the required access token but never password or OTP', async () => {
        jest.spyOn(User, 'findOne').mockReturnValue(chain(current));
        jest.spyOn(current, 'comparePassword').mockResolvedValue(true);
        const response = await request(app).post('/api/auth/login').send({ email: current.email, password: 'test-password' });
        expect(response.status).toBe(200);
        expect(response.body.token).toEqual(expect.any(String));
        expect(response.text).not.toContain(secret);
        expect(response.body.user.password).toBeUndefined();
    });
    test('nested plain responses are redacted even if a controller uses lean objects', () => {
        const output = JSON.stringify({ token: 'intentional-login-token', nested: [{ password: secret, pushToken: secret, resetPasswordOtp: secret, stripeCheckoutSessionId: secret, client_secret: secret, public_id: secret, safe: true }] }, secureResponseReplacer);
        expect(output).not.toContain(secret);
        expect(JSON.parse(output)).toEqual({ token: 'intentional-login-token', nested: [{ safe: true }] });
    });
    test('orders hide internal Stripe references', async () => {
        const order = new Order({ user: uid, orderNumber: 'QA-ORDER', items: [], subtotal: 20, totalAmount: 20, stripeCheckoutSessionId: secret, stripePaymentIntentId: secret, stripeChargeId: secret });
        jest.spyOn(Order, 'find').mockReturnValue(chain([order]));
        const response = await authorized(request(app).get('/api/orders/my-orders'));
        expect(response.status).toBe(200);
        expect(response.body.orders[0].totalAmount).toBe(20);
        expect(response.text).not.toContain(secret);
    });
    test('admin user lists omit password hashes and private tokens', async () => {
        current.role = 'admin';
        jest.spyOn(User, 'find').mockReturnValue(chain([current]));
        const response = await authorized(request(app).get('/api/auth/users'));
        expect(response.status).toBe(200);
        expect(response.text).not.toContain(secret);
    });
    test('public feedback exposes only approved review fields', async () => {
        const find = jest.spyOn(Feedback, 'find').mockReturnValue(chain([{ _id: id, name: 'Reviewer', subject: 'Review', message: 'Good product', rating: 4, email: secret, user: uid, adminReply: secret, status: secret }]));
        const response = await request(app).get('/api/feedback/public');
        expect(response.status).toBe(200);
        expect(find).toHaveBeenCalledWith({ isApproved: true, isDeclined: { $ne: true }, type: 'feedback' });
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body.feedbacks[0]).toEqual({ id, name: 'Reviewer', subject: 'Review', message: 'Good product', rating: 4 });
        expect(response.text).not.toContain(secret);
    });
    test('public payment config exposes no Stripe credentials', async () => {
        const response = await request(app).get('/api/payment/config');
        expect(response.status).toBe(200);
        expect(Object.keys(response.body).sort()).toEqual(['currency', 'isConfigured', 'paymentSheetConfigured', 'success']);
    });
});

describe('safe HTTP errors, CORS and request validation', () => {
    test('oversized upload is rejected with 413 and no internal error data', async () => {
        current.role = 'admin';
        const response = await authorized(request(app).post('/api/products'))
            .attach('images', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'qa.jpg', contentType: 'image/jpeg' });
        expect(response.status).toBe(413);
        expect(response.body).toEqual({ success: false, message: 'Request exceeds the allowed size.' });
    });
    test('non-image uploads are rejected before any Cloudinary upload', async () => {
        current.role = 'admin';
        const response = await authorized(request(app).post('/api/products'))
            .attach('images', Buffer.from('not an image'), { filename: 'qa.txt', contentType: 'text/plain' });
        expect(response.status).toBe(400);
        expect(response.text).not.toMatch(/stack|MulterError|cloudinary.*secret/);
    });
    test.each(['limit=0', 'limit=-1', 'limit=999999', 'page=-1', 'page=NaN', 'page=1.2'])('catalog rejects unsafe pagination %s', async query => {
        expect((await request(app).get('/api/products?' + query)).status).toBe(400);
        expect((await request(app).get('/api/deals?' + query)).status).toBe(400);
    });
    test('search input is treated as literal text rather than executable regex', async () => {
        const count = jest.spyOn(Product, 'countDocuments').mockResolvedValue(0);
        jest.spyOn(Product, 'find').mockReturnValue(chain([]));
        const response = await request(app).get('/api/products').query({ search: '(a+)+$' });
        expect(response.status).toBe(200);
        const regex = count.mock.calls[0][0].$or[0].name.$regex;
        expect(regex.test('(a+)+$')).toBe(true);
        expect(regex.test('aaaa')).toBe(false);
    });
    test.each([{ email: { $ne: null }, password: 'x' }, { email: ['one', 'two'], password: 'x' }, { email: 'qa@example.test', password: { $gt: '' } }])('login rejects object/array credential injection %j', async payload => {
        const find = jest.spyOn(User, 'findOne');
        expect((await request(app).post('/api/auth/login').send(payload)).status).toBe(400);
        expect(find).not.toHaveBeenCalled();
    });
    const failures = [
        ['/api/products', Product, 'countDocuments'], ['/api/banners', Banner, 'find'],
        ['/api/banner-categories', BannerCategory, 'find'], ['/api/deals', Deal, 'countDocuments'],
        ['/api/store-settings', StoreSettings, 'findOne'], ['/api/delivery-settings', DeliverySettings, 'findOne'],
        ['/api/feedback/public', Feedback, 'find'], ['/api/orders/my-orders', Order, 'find'],
        ['/api/notifications', Notification, 'find'], ['/api/chat/history/' + uid, Message, 'find'],
        ['/api/coupons', Coupon, 'find'],
    ];
    test.each(failures)('%s never leaks a DB URI, stack or exception details', async (url, model, method) => {
        current.role = 'admin';
        jest.spyOn(model, method).mockImplementation(() => { throw new Error(`mongodb://qa:${secret}@db/private?api_key=${secret}`); });
        const response = await authorized(request(app).get(url));
        expect(response.status).toBe(500);
        expect(response.body).toEqual({ success: false, message: 'An internal error occurred. Please try again later.' });
        expect(response.text).not.toMatch(/mongodb|api_key|stack|QA_PRIVATE/);
    });
    test('malformed JSON never echoes submitted passwords', async () => {
        const response = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send(`{"password":"${secret}",broken`);
        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Invalid request.');
        expect(response.text).not.toContain(secret);
    });
    test.each(['products', 'banners', 'banner-categories', 'deals'])('invalid %s ID has a safe 400 response', async resource => {
        const response = await request(app).get(`/api/${resource}/invalid-id`);
        expect(response.status).toBe(400);
        expect(response.text).not.toMatch(/CastError|ObjectId|stack/);
    });
    test('unknown API route is JSON and does not reflect request URL', async () => {
        const response = await request(app).get(`/api/nonexistent-${secret}`);
        expect(response.status).toBe(404);
        expect(response.body.message).toBe('Route not found.');
        expect(response.text).not.toContain(secret);
    });
    test('CORS sends an allow-origin header only to an allowed browser origin', async () => {
        const allowed = await request(app).get('/').set('Origin', 'https://shop.example.test');
        const denied = await request(app).get('/').set('Origin', 'https://evil.example.test');
        expect(allowed.headers['access-control-allow-origin']).toBe('https://shop.example.test');
        expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });
    test('rate limiter returns 429 and Retry-After without trusting spoofed forwarded IPs', () => {
        const middleware = rateLimit({ max: 1, windowMs: 10000 });
        const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();
        for (const fake of ['a', 'b']) middleware({ ip: 'qa-unique-ip', path: '/test', headers: { 'x-forwarded-for': fake } }, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    });
    test('logs contain diagnostic context but no exception message or payload', () => {
        const spy = jest.spyOn(globalThis.console, 'error').mockImplementation(() => {});
        createSafeLogger('qa').error('User ' + secret, new Error('mongodb://' + secret), { authorization: secret });
        const output = JSON.stringify(spy.mock.calls);
        expect(output).toContain('qa');
        expect(output).not.toContain(secret);
        expect(output).not.toContain('mongodb');
    });
});
