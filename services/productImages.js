// Demo products originally used Picsum, which is unreachable on some networks.
// Resolve only those placeholders; merchant-uploaded photos stay unchanged.
const photos = {
    accessories: 'photo-1505740420928-5e560c06d30e',
    automotive: 'photo-1492144534655-ae79c964c9d7',
    beauty: 'photo-1596462502278-27bfdc403348',
    books: 'photo-1495446815901-a7297e633e8d',
    electronics: 'photo-1517336714731-489689fd1ca8',
    fashion: 'photo-1489987707025-afc232f7ea0f',
    food: 'photo-1504674900247-0877df9cc836',
    groceries: 'photo-1542838132-92c53300491e',
    health: 'photo-1505751172876-fa1923c5c528',
    'home & living': 'photo-1484154218962-a197022b5858',
    jewelry: 'photo-1515562141207-7a88fb7ce338',
    shoes: 'photo-1542291026-7eec264c27ff',
    sports: 'photo-1517649763962-0c623066013b',
    'toys & kids': 'photo-1558618666-fcd25c85cd64',
    watches: 'photo-1523275335684-37898b6baf30',
};

export function getDemoProductImage(category, index = 0) {
    const photo = photos[String(category).trim().toLowerCase()] || photos.watches;
    return `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=600&q=80${index % 2 ? '&crop=detail' : ''}`;
}

export function resolveProductImages(images, category) {
    if (!Array.isArray(images)) return [];
    return images.map((image, index) => {
        try {
            const url = new URL(image);
            return url.hostname === 'picsum.photos'
                ? getDemoProductImage(category, index)
                : image;
        } catch {
            return image;
        }
    });
}
