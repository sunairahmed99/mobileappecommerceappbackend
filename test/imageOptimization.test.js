import { test } from '@jest/globals';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { optimizeImageUrl, imageResponseReplacer, imageUploadOptions } from '../services/imageOptimization.js';

const original = 'https://res.cloudinary.com/shop/image/upload/v123/products/photo.jpg';

test('legacy images use bounded dimensions, automatic quality and format', () => {
    assert.equal(optimizeImageUrl(original, 480), 'https://res.cloudinary.com/shop/image/upload/c_limit,w_480,h_480/q_auto:eco/f_auto/v123/products/photo.jpg');
    assert.equal(optimizeImageUrl(optimizeImageUrl(original, 480), 480), optimizeImageUrl(original, 480));
    assert.match(optimizeImageUrl(original, 99999), /w_1600,h_1600/);
});

test('thumbnail sizing replaces delivery steps and preserves existing crops/version/queries', () => {
    const cropped = original.replace('/v123/', '/c_fill,w_900,h_600/v123/') + '?foo=bar';
    const small = optimizeImageUrl(optimizeImageUrl(cropped), 180);
    assert.match(small, /c_fill,w_900,h_600\/c_limit,w_180,h_180\/q_auto:eco\/f_auto\/v123/);
    assert.ok(small.endsWith('?foo=bar'));
    assert.equal((small.match(/q_auto:eco/g) || []).length, 1);
});

test('signed URLs, unsupported hosts and local previews stay usable', () => {
    for (const uri of [null, '', '/uploads/test.jpg', 'blob:http://localhost/test', 'data:image/png;base64,AA', 'https://res.cloudinary.com.evil.test/image/upload/test.jpg', original.replace('/v123/', '/s--signature--/v123/'), original + '?__cld_token__=token']) {
        assert.equal(optimizeImageUrl(uri), uri);
    }
});

test('all nested API image fields are optimized without altering public IDs or data', () => {
    const input = { product: { images: [original], image_public_ids: ['products/photo'] }, user: { image: original }, logo: original, items: [{ image: original }], count: 5 };
    const result = JSON.parse(JSON.stringify(input, imageResponseReplacer));
    assert.match(result.product.images[0], /q_auto:eco/);
    assert.match(result.user.image, /q_auto:eco/);
    assert.match(result.logo, /w_320/);
    assert.match(result.items[0].image, /q_auto:eco/);
    assert.deepEqual(result.product.image_public_ids, ['products/photo']);
    assert.equal(input.product.images[0], original);
    assert.equal(result.count, 5);
});

test('uploads compress to WebP and bound dimensions without cropping', () => {
    for (const [folder, size] of Object.entries({ users: 480, store_logo: 512, 'banner-categories': 480, products: 1200, deals: 1200, banners: 1600 })) {
        const options = imageUploadOptions(folder);
        assert.equal(options.format, 'webp');
        assert.deepEqual(options.transformation, [{ width: size, height: size, crop: 'limit' }, { quality: 75 }]);
    }
});

test('frontend and backend delivery stay compatible for cached and already optimized URLs', async () => {
    const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
    const ts = require('typescript');
    const source = readFileSync(new URL('../../frontend/src/Compoennts/Common/imageUtils.ts', import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const { optimizeRemoteImage } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
    for (const uri of [original, optimizeImageUrl(original), 'https://images.unsplash.com/photo-test?w=2000&q=100', '/local.jpg', original.replace('/v123/', '/f_auto,q_auto:eco,w_640,c_limit/v123/')]) {
        assert.equal(optimizeRemoteImage(uri, 240), optimizeImageUrl(uri, 240));
        assert.equal(optimizeRemoteImage(optimizeRemoteImage(uri, 240), 240), optimizeRemoteImage(uri, 240));
    }
});
