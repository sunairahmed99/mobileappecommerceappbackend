import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'node:dns';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import BannerCategory from '../Models/bannerCategoryModel.js';
import Product from '../Models/productModel.js';

dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Preview: node scripts/seedProducts.js
// Replace all old products: node scripts/seedProducts.js --replace
const catalog = JSON.parse(await readFile(new URL('../data/productCatalog.json', import.meta.url), 'utf8'));
const replace = process.argv.includes('--replace');
const names = new Set();
const imagePaths = new Set();
for (const [category, items] of Object.entries(catalog)) {
    if (items.length !== 10) throw new Error(`${category} must contain exactly ten products`);
    for (const item of items) {
        const image = new URL(item.images[0]);
        if (!item.name || !item.description || !item.usd || image.protocol !== 'https:') throw new Error(`Invalid product: ${item.name}`);
        if (names.has(item.name) || imagePaths.has(image.pathname)) throw new Error(`Duplicate product or image: ${item.name}`);
        names.add(item.name);
        imagePaths.add(image.pathname);
    }
}

async function checkImages(products) {
    let next = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
        while (next < products.length) {
            const product = products[next++];
            const response = await fetch(product.images[0], { signal: AbortSignal.timeout(30000) });
            if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
                await response.body?.cancel();
                throw new Error(`Image unavailable: ${product.name} (${response.status})`);
            }
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength < 100) throw new Error(`Empty image: ${product.name}`);
        }
    }));
}

try {
    await mongoose.connect(process.env.DATABASE, { serverSelectionTimeoutMS: 15000 });
    const categories = await BannerCategory.find({}).lean();
    if (!categories.length) throw new Error('No categories found');
    const products = categories.flatMap(category => {
        const items = catalog[category.name];
        if (!items) throw new Error(`Catalog missing category: ${category.name}. No products were changed.`);
        return items.map((item, index) => {
            // Catalog sample prices in PKR; these are editable store prices.
            const originalPrice = Math.round(item.usd * 280 / 10) * 10;
            const discount = index % 3 === 0 ? 10 : 0;
            return {
                name: item.name, description: item.description, category: category.name,
                originalPrice, price: Math.round(originalPrice * (1 - discount / 100)), discount,
                rating: 0, reviewCount: 0, isInStock: true, isActive: category.isActive,
                sizes: /Fashion/.test(category.name) ? ['S', 'M', 'L', 'XL'] : category.name === 'Footwear' ? ['38', '39', '40', '41', '42', '43'] : [],
                colors: [], images: item.images, public_ids: [],
            };
        });
    });
    await Promise.all(products.map(product => new Product(product).validate()));
    for (const category of categories) console.log(`${category.name}: 10 new products`);
    if (replace) {
        console.log(`Checking ${products.length} unique product images before replacement...`);
        await checkImages(products);
        await mkdir(new URL('../backups/', import.meta.url), { recursive: true });
        const backup = new URL(`../backups/products-${Date.now()}.json`, import.meta.url);
        // Read raw documents to preserve IDs and uploaded image references for recovery.
        await writeFile(backup, JSON.stringify(await Product.collection.find({}).toArray(), null, 2));
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await Product.deleteMany({}, { session });
                await Product.insertMany(products, { session });
            });
        } finally {
            await session.endSession();
        }
        const counts = await Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]);
        if (counts.length !== categories.length || counts.some(c => c.count !== 10)) throw new Error('Post-replacement count verification failed');
        console.log(`Replaced old catalog with ${products.length} products. Verified ten per category. Backup: ${backup.pathname}`);
    } else {
        console.log(`Preview only: ${products.length} products. Use --replace to replace the old catalog.`);
    }
} catch (error) {
    console.error('Product replacement failed:', error.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
