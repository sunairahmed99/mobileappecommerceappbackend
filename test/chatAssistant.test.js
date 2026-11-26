import { jest, afterEach, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../app.js';
import Product from '../Models/productModel.js';
import StoreSettings from '../Models/storeSettingsModel.js';
import DeliverySettings from '../Models/deliverySettingsModel.js';
import Message from '../Models/messageModel.js';
import User from '../Models/userModel.js';
import Order from '../Models/orderModel.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { initSocket } from '../socket.js';
import { generateToken } from '../config/jwt.js';

const originalApiKey = process.env.GEMINI_API_KEY;
const originalModel = process.env.GEMINI_MODEL;
const query = value => ({
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
});

afterEach(() => {
    jest.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
});

describe('public AI store assistant', () => {
    test('reads only the authenticated customer order and keeps its data out of Gemini', async () => {
        const customerId = '507f1f77bcf86cd799439011';
        jest.spyOn(User, 'findById').mockResolvedValue({
            _id: customerId, role: 'user', isActive: true, isVerified: true,
        });
        const orderQuery = { ...query([{
            orderNumber: 'ORD-ABC234', status: 'In Transit', paymentStatus: 'Paid', totalAmount: 2400,
            createdAt: '2026-11-25', items: [{ qty: 2, name: 'Cotton Shirt' }],
            shippingAddress: { phone: 'PRIVATE_PHONE' },
        }]), sort: jest.fn().mockReturnThis() };
        const find = jest.spyOn(Order, 'find').mockReturnValue(orderQuery);
        jest.spyOn(StoreSettings, 'findOne').mockReturnValue(query({ currency: 'Rs.' }));
        const provider = jest.spyOn(globalThis, 'fetch');
        const guest = await request(app).post('/api/chat/assistant').send({ message: 'What is my order status?' });
        expect(guest.body.reply).toContain('Please sign in');
        expect(find).not.toHaveBeenCalled();
        const customer = await request(app).post('/api/chat/assistant')
            .set('Authorization', `Bearer ${generateToken(customerId, 'user')}`)
            .send({ message: 'Show order details for ORD-ABC234', userId: '507f191e810c19729de860ea' });
        expect(find).toHaveBeenCalledWith({ user: customerId, orderNumber: 'ORD-ABC234' });
        expect(customer.body.reply).toContain('Order ORD-ABC234 is Processing');
        expect(customer.body.reply).toContain('Cotton Shirt');
        expect(customer.body.reply).toContain('Total: Rs. 2,400');
        expect(customer.body.reply).not.toContain('PRIVATE_PHONE');
        expect(provider).not.toHaveBeenCalled();
    });

    test('uses delivered sales for bestseller cards and asks Gemini to reply in English', async () => {
        process.env.GEMINI_API_KEY = 'test-key-not-a-real-credential';
        const id = '507f1f77bcf86cd799439012';
        const aggregate = jest.spyOn(Order, 'aggregate').mockResolvedValue([{ _id: id, name: 'Cotton Shirt', price: 1200, isInStock: true }]);
        jest.spyOn(StoreSettings, 'findOne').mockReturnValue(query({ currency: 'Rs.' }));
        jest.spyOn(DeliverySettings, 'findOne').mockReturnValue(query(null));
        const provider = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'The Cotton Shirt is a bestseller.' }] } }],
        })));
        const response = await request(app).post('/api/chat/assistant').send({ message: 'Best sell product nikaldo' });
        expect(aggregate).toHaveBeenCalledWith(expect.arrayContaining([
            { $match: { status: 'Delivered', paymentStatus: { $nin: ['Refunded', 'Failed'] } } },
            { $group: { _id: '$items.productId', sold: { $sum: '$items.qty' } } },
        ]));
        expect(response.body.products).toEqual([{ id, name: 'Cotton Shirt', price: 1200, currency: 'Rs.', inStock: true }]);
        expect(provider.mock.calls[0][1].body).toContain('Always reply in clear, natural English');
        expect(provider.mock.calls[0][1].body).not.toContain(id);
    });

    test('guest chat hands off to an admin and resumes AI when the admin leaves', async () => {
        process.env.GEMINI_API_KEY = 'test-key-not-a-real-credential';
        const adminId = '507f1f77bcf86cd799439011';
        const saved = [];
        jest.spyOn(User, 'findById').mockResolvedValue({ _id: adminId, name: 'Admin', role: 'admin', isActive: true, isVerified: true });
        jest.spyOn(Message, 'create').mockImplementation(async input => {
            const message = { ...input, _id: String(saved.length + 1), createdAt: new Date() };
            saved.push(message);
            return message;
        });
        jest.spyOn(Message, 'find').mockImplementation(() => ({ ...query([]), sort: jest.fn().mockReturnThis() }));
        jest.spyOn(Product, 'find').mockReturnValue(query([]));
        jest.spyOn(StoreSettings, 'findOne').mockReturnValue(query(null));
        jest.spyOn(DeliverySettings, 'findOne').mockReturnValue(query(null));
        let started;
        const firstRequest = new Promise(resolve => { started = resolve; });
        const upstream = jest.spyOn(globalThis, 'fetch')
            .mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
                started(options.signal);
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                candidates: [{ content: { parts: [{ text: 'Welcome back!' }] } }],
            })));
        const server = createServer(app);
        const io = initSocket(server);
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const clients = [];
        async function connect(auth) {
            const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/socket.io/?EIO=4&transport=websocket`);
            clients.push(ws);
            const packets = [];
            ws.addEventListener('message', ({ data }) => packets.push(String(data)));
            const packet = async prefix => {
                for (let turn = 0; turn < 400; turn++) {
                    const index = packets.findIndex(value => value.startsWith(prefix));
                    if (index >= 0) return packets.splice(index, 1)[0];
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
                throw new Error(`Timed out waiting for ${prefix}`);
            };
            await packet('0');
            ws.send('40' + JSON.stringify(auth));
            await packet('40');
            return { ws, packet, emit: (name, data, ack = '') => ws.send('42' + ack + JSON.stringify([name, data])) };
        }
        try {
            const guest = await connect({ guestKey: randomUUID() });
            guest.emit('register', {});
            expect(await guest.packet('42["admin_status"')).toContain('false');
            guest.emit('get_admin_conversations', {}, '0');
            expect(await guest.packet('430')).toContain('Admin access required');
            guest.emit('send_message', { text: 'Hello' }, '1');
            expect(await guest.packet('431')).toContain('"success":true');
            expect(await guest.packet('42["assistant_status"')).toContain('"pending":true');
            const signal = await firstRequest;

            const admin = await connect({ token: generateToken(adminId, 'admin') });
            admin.emit('admin_availability', true);
            expect(await guest.packet('42["admin_status"')).toContain('true');
            expect(signal.aborted).toBe(true);
            guest.emit('send_message', { text: 'Can a person help?' }, '2');
            expect(await guest.packet('432')).toContain('"success":true');
            expect(await admin.packet('42["new_message"')).toContain('Can a person help?');
            expect(upstream).toHaveBeenCalledTimes(1);
            admin.emit('send_message', { userId: saved[0].user, text: 'Yes, how can I help?' }, '1');
            expect(await admin.packet('431')).toContain('"success":true');
            await guest.packet('42["new_message"');
            await guest.packet('42["new_message"');
            expect(await guest.packet('42["new_message"')).toContain('Yes, how can I help?');

            admin.ws.close();
            expect(await guest.packet('42["admin_status"')).toContain('false');
            guest.emit('send_message', { text: 'Hello again' }, '3');
            expect(await guest.packet('433')).toContain('"success":true');
            await guest.packet('42["new_message"');
            expect(await guest.packet('42["new_message"')).toContain('Welcome back!');
            expect(saved.map(message => message.sender)).toEqual(['user', 'user', 'admin', 'user', 'assistant']);

            const blueId = '507f1f77bcf86cd799439012';
            const bestsellerId = '507f1f77bcf86cd799439013';
            const blueShirt = { _id: blueId, name: 'Blue & Black Check Shirt', price: 1200, isInStock: true };
            const bestseller = { _id: bestsellerId, name: 'Cotton Shirt', price: 1400, isInStock: true };
            Product.find.mockReturnValue(query([bestseller, blueShirt]));
            jest.spyOn(Order, 'aggregate').mockResolvedValue([bestseller, blueShirt]);
            for (const [text, productId] of [
                ['Blue shirt ka 1', blueId],
                ['Best sale', bestsellerId],
            ]) {
                guest.emit('send_message', { text });
                expect(await guest.packet('42["assistant_open_product"')).toBe(
                    '42' + JSON.stringify(['assistant_open_product', { productId }])
                );
            }
            expect(upstream).toHaveBeenCalledTimes(2);
        } finally {
            for (const client of clients) client.close();
            await io.close();
        }
    }, 10000);

    test('answers without login using only public catalog and store fields', async () => {
        process.env.GEMINI_API_KEY = 'test-key-not-a-real-credential';
        delete process.env.GEMINI_MODEL;
        const products = query([{
            _id: '507f1f77bcf86cd799439012',
            name: 'Blue Shirt',
            description: 'Cotton shirt',
            category: 'Clothing',
            price: 1200,
            originalPrice: 1500,
            discount: 20,
            sizes: ['M'],
            colors: ['Blue'],
            isInStock: true,
            privateMarker: 'PRIVATE_ACCOUNT_DATA',
        }]);
        const store = query({ storeName: 'Example Store', supportPhone: '555-0100', privateMarker: 'PRIVATE_STORE_DATA' });
        const delivery = query({ deliveryCharge: 100, freeDeliveryThreshold: 2000, privateMarker: 'PRIVATE_DELIVERY_DATA' });
        const findProducts = jest.spyOn(Product, 'find').mockReturnValue(products);
        jest.spyOn(StoreSettings, 'findOne').mockReturnValue(store);
        jest.spyOn(DeliverySettings, 'findOne').mockReturnValue(delivery);
        const upstream = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Blue Shirt costs Rs. 1200.' }] } }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const response = await request(app).post('/api/chat/assistant').send({
            message: 'What is the blue shirt price?',
            history: [{ role: 'user', text: 'Show me a shirt' }],
        });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true, reply: 'Blue Shirt costs Rs. 1200.',
            products: [{ id: '507f1f77bcf86cd799439012', name: 'Blue Shirt', price: 1200, currency: 'Rs.', inStock: true }],
        });
        expect(findProducts).toHaveBeenCalledWith(expect.objectContaining({ isActive: true, $or: expect.any(Array) }));
        expect(products.select).toHaveBeenCalledWith('name description category price originalPrice discount sizes colors isInStock');
        expect(store.select).toHaveBeenCalledWith('storeName tagline supportEmail supportPhone address currency noticeBarText isStoreOpen');
        expect(delivery.select).toHaveBeenCalledWith('minOrderForDelivery deliveryCharge freeDeliveryThreshold isActive');
        expect(upstream.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-key-not-a-real-credential');
        const sentPrompt = JSON.stringify(JSON.parse(upstream.mock.calls[0][1].body));
        expect(sentPrompt).toContain('Blue Shirt');
        expect(sentPrompt).not.toContain('PRIVATE_');
        expect(sentPrompt).toContain('customer accounts, orders, payments');
    });

    test('validates input and reports missing server configuration without calling Gemini', async () => {
        delete process.env.GEMINI_API_KEY;
        const upstream = jest.spyOn(globalThis, 'fetch');

        const invalid = await request(app).post('/api/chat/assistant').send({ message: '   ' });
        const unconfigured = await request(app).post('/api/chat/assistant').send({ message: 'Hello' });

        expect(invalid.status).toBe(400);
        expect(unconfigured.status).toBe(503);
        expect(unconfigured.body.success).toBe(false);
        expect(upstream).not.toHaveBeenCalled();
    });

    test('does not expose provider errors or accept oversized chat history', async () => {
        process.env.GEMINI_API_KEY = 'test-key-not-a-real-credential';
        jest.spyOn(Product, 'find').mockReturnValue(query([]));
        jest.spyOn(StoreSettings, 'findOne').mockReturnValue(query(null));
        jest.spyOn(DeliverySettings, 'findOne').mockReturnValue(query(null));
        const upstream = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('provider secret detail', { status: 500 }));

        const tooMuchHistory = await request(app).post('/api/chat/assistant').send({
            message: 'Hello',
            history: Array.from({ length: 9 }, () => ({ role: 'user', text: 'Hello' })),
        });
        const failed = await request(app).post('/api/chat/assistant').send({ message: 'Hello' });

        expect(tooMuchHistory.status).toBe(400);
        expect(failed.status).toBe(502);
        expect(failed.text).not.toContain('provider secret detail');
        expect(upstream).toHaveBeenCalledTimes(1);
    });
});
