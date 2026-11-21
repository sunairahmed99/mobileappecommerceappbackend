// Preview: node scripts/seedDeals.js; save: node scripts/seedDeals.js --apply
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'node:dns';
import Product from '../Models/productModel.js';
import Deal from '../Models/dealModel.js';
import BannerCategory from '../Models/bannerCategoryModel.js';

dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
dns.setServers(['8.8.8.8', '8.8.4.4']);

const offers = [
    ['Watches', 'Watch Special', 20],
    ['Mobiles', 'Mobile Mega Deal', 15],
    ['Electronics', 'Tech Saver', 20],
    ["Men's Fashion", 'Menswear Special', 25],
    ["Women's Fashion", 'Womenswear Special', 25],
    ['Footwear', 'Footwear Flash Deal', 30],
    ['Beauty & Care', 'Beauty Essentials Deal', 20],
    ['Bags', 'Bag Bonus Deal', 25],
    ['Home & Living', 'Home Refresh Deal', 20],
    ['Sports & Fitness', 'Fitness Favourite Deal', 25],
];

try {
    await mongoose.connect(process.env.DATABASE, { serverSelectionTimeoutMS: 15000 });
    const activeCategories = await BannerCategory.find({ isActive: true }).distinct('name');
    const deals = [];
    for (const [category, dealName, percentage] of offers) {
        if (!activeCategories.includes(category)) throw new Error(`Inactive or missing category: ${category}`);
        const product = await Product.findOne({ category, isActive: true, isInStock: true })
            .sort({ createdAt: -1, _id: -1 });
        if (!product?.images?.length || !(product.price > 0)) throw new Error(`No eligible product for ${category}`);
        // Discount the current selling price so each deal offers additional savings.
        const originalPrice = product.price;
        const dealPrice = Math.round(originalPrice * (1 - percentage / 100) * 100) / 100;
        const deal = {
            dealName, description: `Save ${percentage}% on ${product.name}.`,
            product: product._id, originalPrice, dealPrice,
            discountPercentage: Math.round((originalPrice - dealPrice) / originalPrice * 100),
            startDate: new Date(), endDate: null, isActive: true,
        };
        await new Deal(deal).validate();
        deals.push(deal);
        console.log(`${dealName}: ${product.name} | ${originalPrice} -> ${dealPrice} (${percentage}% off)`);
    }
    if (process.argv.includes('--apply')) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                for (const deal of deals) {
                    await Deal.updateOne({ dealName: deal.dealName }, { $set: deal }, { upsert: true, session, runValidators: true });
                }
            });
        } finally {
            await session.endSession();
        }
        const saved = await Deal.find({ dealName: { $in: deals.map(deal => deal.dealName) } }).populate('product');
        if (saved.length !== 10 || new Set(saved.map(deal => String(deal.product?._id))).size !== 10 ||
            saved.some(deal => !deal.product?.images?.length || !deal.isActive || deal.dealPrice >= deal.product.price)) {
            throw new Error('Saved deals verification failed');
        }
        console.log('Verified 10 active deals with distinct products, matching images and discounted prices.');
        console.log(`Total deals: ${await Deal.countDocuments()}`);
    } else {
        console.log(`Preview only. Existing deals: ${await Deal.countDocuments()}. Use --apply to save these ten deals.`);
    }
} catch (error) {
    console.error('Deal setup failed:', error.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
