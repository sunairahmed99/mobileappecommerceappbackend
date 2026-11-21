import { jest, test, expect, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import Order from '../Models/orderModel.js';
import { updateOrderStatus } from '../Controllers/orderController.js';
import { ORDER_STATUSES } from '../services/orderStatus.js';

const app = express();
app.use(express.json());
app.patch('/status', updateOrderStatus);
afterEach(() => jest.restoreAllMocks());

test('new orders default to Pending, with exactly four supported statuses', () => {
    expect(new Order().status).toBe('Pending');
    expect(Order.schema.path('status').enumValues).toEqual(['Pending', 'Processing', 'Delivered', 'Cancelled']);
});

test('legacy In Transit orders are returned as Processing', () => {
    const legacy = Order.hydrate({ status: 'In Transit' });
    expect(legacy.toJSON().status).toBe('Processing');
});

test.each(ORDER_STATUSES)('admin can set an order to %s', async (status) => {
    const order = { status: 'Pending', paymentMethod: 'Cash on Delivery (COD)', save: jest.fn() };
    jest.spyOn(Order, 'findById').mockResolvedValue(order);
    const response = await request(app).patch('/status').send({ status });
    expect(response.status).toBe(200);
    expect(response.body.order.status).toBe(status);
    expect(order.save).toHaveBeenCalledTimes(1);
});

test.each(['In Transit', 'Shipped', 'Invalid'])('rejects unsupported status %s', async (status) => {
    const lookup = jest.spyOn(Order, 'findById');
    expect((await request(app).patch('/status').send({ status })).status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
});

test('unpaid card orders cannot be marked Delivered', async () => {
    const order = { status: 'Processing', paymentMethod: 'Credit / Debit Card (Stripe)', paymentStatus: 'Pending', save: jest.fn() };
    jest.spyOn(Order, 'findById').mockResolvedValue(order);
    expect((await request(app).patch('/status').send({ status: 'Delivered' })).status).toBe(400);
    expect(order.save).not.toHaveBeenCalled();
});

test.each([
    ['Processing', 'Pending'],
    ['Delivered', 'Pending'],
    ['Delivered', 'Processing'],
    ['Cancelled', 'Pending'],
    ['Cancelled', 'Processing'],
    ['Cancelled', 'Delivered'],
    ['In Transit', 'Pending'],
])('rejects backward transition from %s to %s', async (current, status) => {
    const order = { status: current, save: jest.fn() };
    jest.spyOn(Order, 'findById').mockResolvedValue(order);
    expect((await request(app).patch('/status').send({ status })).status).toBe(400);
    expect(order.status).toBe(current);
    expect(order.save).not.toHaveBeenCalled();
});

test.each([
    ['Processing', 'Delivered'],
    ['Processing', 'Cancelled'],
    ['Delivered', 'Cancelled'],
])('allows forward transition from %s to %s', async (current, status) => {
    const order = { status: current, paymentMethod: 'Cash on Delivery (COD)', save: jest.fn() };
    jest.spyOn(Order, 'findById').mockResolvedValue(order);
    expect((await request(app).patch('/status').send({ status })).status).toBe(200);
    expect(order.save).toHaveBeenCalledTimes(1);
});
