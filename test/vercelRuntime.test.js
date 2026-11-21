import { jest, test, beforeEach, afterEach, expect } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import { ConnectDb } from '../config/db.js';
import { vercelDatabase } from '../middleware/runtime.js';

const originalVercel = process.env.VERCEL;
const originalReadyState = mongoose.connection.readyState;
beforeEach(() => { process.env.VERCEL = '1'; });
afterEach(() => {
    jest.restoreAllMocks();
    mongoose.connection.readyState = originalReadyState;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
});

test('concurrent cold requests share one database connection and connected requests reuse it', async () => {
    const connect = jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    await Promise.all([ConnectDb(), ConnectDb(), ConnectDb()]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect.mock.calls[0][1]).toMatchObject({ maxPoolSize: 5, serverSelectionTimeoutMS: 10000 });
    mongoose.connection.readyState = 1;
    await ConnectDb();
    expect(connect).toHaveBeenCalledTimes(1);
});

test('failed connection can be retried on a later request', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const connect = jest.spyOn(mongoose, 'connect').mockRejectedValueOnce(new Error('private database URI')).mockResolvedValueOnce(mongoose);
    await expect(ConnectDb()).rejects.toThrow('Database connection failed');
    await expect(ConnectDb()).resolves.toBe(mongoose);
    expect(connect).toHaveBeenCalledTimes(2);
});

test('liveness works without opening a database connection', async () => {
    const connect = jest.spyOn(mongoose, 'connect');
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(connect).not.toHaveBeenCalled();
});

test('database outage returns 503 without exposing connection details or reaching routes', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(mongoose, 'connect').mockRejectedValue(new Error('private database URI'));
    const response = await request(app).get('/api/products');
    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toContain('private');
});

test('readiness reports an established database connection', async () => {
    mongoose.connection.readyState = 1;
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ready');
});

test('standalone requests do not trigger serverless connection middleware', async () => {
    delete process.env.VERCEL;
    const connect = jest.spyOn(mongoose, 'connect');
    const next = jest.fn();
    await vercelDatabase({ method: 'POST', path: '/api/auth/login' }, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
});
