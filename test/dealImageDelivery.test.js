import { jest, test, expect, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import Deal from '../Models/dealModel.js';
import Product from '../Models/productModel.js';
import dealRoutes from '../Routes/dealRoutes.js';

const app = express();
app.use('/api/deals', dealRoutes);
afterEach(() => jest.restoreAllMocks());

test.each(['linked', 'custom'])('delivers the actual %s deal photo', async (kind) => {
    const uri = `https://cdn.dummyjson.com/test-deal-${kind}.webp`;
    const deal = kind === 'linked'
        ? { product: new Product({ images: [uri] }), customProduct: { images: [] } }
        : { product: null, customProduct: { images: [uri] } };
    jest.spyOn(Deal, 'findById').mockReturnValue({ populate: async () => deal });
    const fetchPhoto = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } }));
    const response = await request(app).get('/api/deals/507f1f77bcf86cd799439011/images/0');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^image\/webp/);
    expect([...response.body]).toEqual([1, 2, 3]);
    expect(fetchPhoto).toHaveBeenCalledWith(uri, expect.any(Object));
});

test('returns 404 when a deal has no uploaded photo', async () => {
    jest.spyOn(Deal, 'findById').mockReturnValue({ populate: async () => ({ product: null, customProduct: { images: [] } }) });
    const fetchPhoto = jest.spyOn(globalThis, 'fetch');
    const response = await request(app).get('/api/deals/507f1f77bcf86cd799439011/images/0');
    expect(response.status).toBe(404);
    expect(fetchPhoto).not.toHaveBeenCalled();
});
