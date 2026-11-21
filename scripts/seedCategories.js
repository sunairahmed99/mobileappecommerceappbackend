import dotenv from 'dotenv';
import dns from 'node:dns';
import https from 'node:https';
import http from 'node:http';
import { v2 as cloudinary } from 'cloudinary';
import { ConnectDb } from '../config/db.js';
import BannerCategory from '../Models/bannerCategoryModel.js';
import { imageUploadOptions } from '../services/imageOptimization.js';

dotenv.config({ quiet: true });

try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch {}

cloudinary.config({
    cloud_name: process.env.cloudinaryname,
    api_key:    process.env.cloudinarykey,
    api_secret: process.env.cloudinarysecret,
});

const downloadImageBuffer = (url) => {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return downloadImageBuffer(res.headers.location).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
};

const uploadToCloudinary = (buffer, folder) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            imageUploadOptions(folder),
            (err, result) => {
                if (err) return reject(err);
                resolve(result);
            }
        );
        stream.end(buffer);
    });
};

const categorySeedData = [
    { name: 'Watches',          imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&q=80' },
    { name: 'Mobiles',          imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&q=80' },
    { name: 'Electronics',      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80' },
    { name: "Men's Fashion",    imageUrl: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=500&q=80' },
    { name: "Women's Fashion",  imageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=500&q=80' },
    { name: 'Footwear',         imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&q=80' },
    { name: 'Accessories',      imageUrl: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=500&q=80' },
    { name: 'Beauty & Care',    imageUrl: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=500&q=80' },
    { name: 'Bags',             imageUrl: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=500&q=80' },
    { name: 'Home & Living',    imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&q=80' },
    { name: 'Groceries',        imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&q=80' },
    { name: 'Toys & Games',     imageUrl: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=500&q=80' },
    { name: 'Sports & Fitness', imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=500&q=80' },
    { name: 'Jewelry',          imageUrl: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&q=80' },
    { name: 'Fragrances',       imageUrl: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=500&q=80' },
];

const seedCategories = async () => {
    try {
        console.log('\n🔌 Connecting to MongoDB...');
        await ConnectDb();
        console.log('✅ Connected.\n');

        console.log('🗑️  Deleting old categories...');
        const deleted = await BannerCategory.deleteMany({});
        console.log(`✅ Deleted ${deleted.deletedCount} old categories.\n`);

        console.log(`📂 Seeding ${categorySeedData.length} new categories...\n`);
        for (let i = 0; i < categorySeedData.length; i++) {
            const item = categorySeedData[i];
            process.stdout.write(`  [${i + 1}/${categorySeedData.length}] "${item.name}"... `);

            let imageUrl = item.imageUrl;
            let publicId = undefined;

            try {
                const buffer = await downloadImageBuffer(item.imageUrl);
                process.stdout.write(`uploading to Cloudinary... `);
                const uploaded = await uploadToCloudinary(buffer, 'banner-categories');
                imageUrl = uploaded.secure_url;
                publicId = uploaded.public_id;
            } catch (err) {
                process.stdout.write(`(Cloudinary skip: ${err.message}) `);
            }

            process.stdout.write(`saving to DB...\n`);

            await BannerCategory.create({
                name:      item.name,
                image:     imageUrl,
                public_id: publicId,
                isActive:  true,
            });

            console.log(`  ✅ Category "${item.name}" seeded successfully!`);
        }

        const count = await BannerCategory.countDocuments();
        console.log(`\n🎉 Done! Total categories in DB: ${count}\n`);
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Seeding categories failed:', error);
        process.exit(1);
    }
};

seedCategories();
