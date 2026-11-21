import { test } from '@jest/globals';
import assert from 'node:assert/strict';
import Product from '../Models/productModel.js';
import { resolveProductImages } from '../services/productImages.js';

test('legacy demo photos resolve in list/detail JSON and populated product objects', () => {
    const product = new Product({ category: 'Shoes', images: ['https://picsum.photos/seed/20/400/400'] });
    for (const result of [product.toJSON(), product.toObject()]) {
        assert.match(result.images[0], /^https:\/\/images\.unsplash\.com\/photo-1542291026/);
    }
    assert.equal(product.images[0], 'https://picsum.photos/seed/20/400/400');
});

test('uploaded images are preserved and lookalike hosts are not treated as demo photos', () => {
    const images = ['https://res.cloudinary.com/shop/image/upload/product.jpg', 'https://picsum.photos.example.com/photo.jpg', '/uploads/product.jpg'];
    assert.deepEqual(resolveProductImages(images, 'Shoes'), images);
    assert.deepEqual(resolveProductImages(undefined, 'Shoes'), []);
});
