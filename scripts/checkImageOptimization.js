import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';
import { optimizeImageUrl } from '../services/imageOptimization.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
    await mongoose.connect(process.env.DATABASE, { serverSelectionTimeoutMS: 15000 });
    const documents = (await Promise.all(['products', 'banners', 'bannercategories', 'storesettings', 'deals', 'users'].map(name =>
        mongoose.connection.collection(name).find({}).project({ images: 1, image: 1, logo: 1, 'customProduct.images': 1 }).limit(20).toArray()
    ))).flat();
    const candidates = [...new Set(documents.flatMap(doc => [doc.image, doc.logo, ...(doc.images || []), ...(doc.customProduct?.images || [])]))].filter(uri => typeof uri === 'string');
    const cloudinary = candidates.filter(uri => /^https:\/\/res\.cloudinary\.com\//.test(uri));
    const urls = (cloudinary.length ? cloudinary : candidates.filter(uri => /^https:\/\/images\.unsplash\.com\//.test(uri))).slice(0, 3);
    if (!urls.length) throw new Error('No supported remote images found for measurement.');
    for (const [index, uri] of urls.entries()) {
        const sizes = [];
        for (const url of [uri, optimizeImageUrl(uri, 480)]) {
            const response = await fetch(url, { headers: { Accept: 'image/webp,image/*;q=0.8' }, signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
            sizes.push((await response.arrayBuffer()).byteLength);
        }
        console.log(JSON.stringify({ sample: index + 1, originalKB: +(sizes[0] / 1024).toFixed(1), optimizedKB: +(sizes[1] / 1024).toFixed(1), reductionPercent: +((1 - sizes[1] / sizes[0]) * 100).toFixed(1) }));
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
