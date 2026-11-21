// Only fetch known image CDNs, never arbitrary addresses from a request.
const hosts = new Set(['cdn.dummyjson.com', 'cdn.shopify.com', 'res.cloudinary.com', 'images.unsplash.com']);
const cache = new Map();
let cacheBytes = 0;
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_CACHE = 64 * 1024 * 1024;

export async function loadProductImage(uri, fetchImage = fetch) {
    const url = new URL(uri);
    if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.port || url.username || url.password) {
        throw new Error('Unsupported image source');
    }
    const cached = cache.get(uri);
    if (cached && cached.expires > Date.now()) return cached;
    if (cached) { cacheBytes -= cached.bytes.length; cache.delete(uri); }
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetchImage(uri, { signal: AbortSignal.timeout(10000), redirect: 'error' });
            if (!response.ok) throw new Error('Image source unavailable');
            const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
            if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(type)) throw new Error('Invalid image format');
            if (Number(response.headers.get('content-length')) > MAX_IMAGE) throw new Error('Image too large');
            const chunks = [];
            let size = 0;
            for await (const chunk of response.body) {
                size += chunk.length;
                if (size > MAX_IMAGE) { await response.body.cancel?.().catch(() => {}); throw new Error('Image too large'); }
                chunks.push(chunk);
            }
            if (!size) throw new Error('Empty image');
            const entry = { bytes: Buffer.concat(chunks), type, expires: Date.now() + 60 * 60 * 1000 };
            while (cacheBytes + size > MAX_CACHE && cache.size) {
                const key = cache.keys().next().value;
                cacheBytes -= cache.get(key).bytes.length;
                cache.delete(key);
            }
            cache.set(uri, entry);
            cacheBytes += size;
            return entry;
        } catch (error) { lastError = error; }
    }
    throw lastError;
}
