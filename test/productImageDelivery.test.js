import { test, expect, jest } from '@jest/globals';
import { loadProductImage } from '../services/productImageDelivery.js';

test('retries the same actual image and caches its bytes', async () => {
    const uri = 'https://cdn.dummyjson.com/product-images/test-retry.webp';
    const fetchImage = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary connection error'))
        .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } }));
    const image = await loadProductImage(uri, fetchImage);
    expect(image.type).toBe('image/webp');
    expect([...image.bytes]).toEqual([1, 2, 3]);
    expect(fetchImage).toHaveBeenCalledTimes(2);
    expect(fetchImage.mock.calls.every(([url]) => url === uri)).toBe(true);
    expect(await loadProductImage(uri, fetchImage)).toBe(image);
    expect(fetchImage).toHaveBeenCalledTimes(2);
});

test('rejects private addresses and non-image responses', async () => {
    const fetchImage = jest.fn();
    await expect(loadProductImage('http://127.0.0.1/private', fetchImage)).rejects.toThrow();
    await expect(loadProductImage('https://cdn.dummyjson.com.evil.test/file', fetchImage)).rejects.toThrow();
    expect(fetchImage).not.toHaveBeenCalled();
    fetchImage.mockImplementation(async () => new Response('html', { headers: { 'content-type': 'text/html' } }));
    await expect(loadProductImage('https://cdn.dummyjson.com/not-an-image', fetchImage)).rejects.toThrow('Invalid image format');
});
