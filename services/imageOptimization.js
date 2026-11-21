const TRANSFORM = /^(?:a|ar|b|bo|c|co|d|dl|dn|dpr|e|f|fl|g|h|l|o|p|pg|q|r|t|u|w|x|y|z)_/;

/** Delivery-only optimization: existing stored URLs and public IDs stay intact. */
export function optimizeImageUrl(uri, width = 1200) {
    if (typeof uri !== 'string' || !/^https?:\/\//i.test(uri)) return uri;
    const size = Math.max(64, Math.min(1600, Math.round(Number(width) || 1200)));
    try {
        const url = new URL(uri);
        if (url.hostname === 'res.cloudinary.com') {
            const match = url.pathname.match(/^(\/[^/]+\/image\/upload\/)(.+)$/);
            if (!match || /^s--/.test(match[2]) || url.searchParams.has('__cld_token__')) return uri;
            const parts = match[2].split('/');
            const transformations = [];
            while (parts.length > 1 && TRANSFORM.test(parts[0])) {
                const part = parts.shift();
                // Replace our own delivery steps so repeated optimization stays stable.
                if (!/^c_limit,w_\d+,h_\d+$/.test(part) && part !== 'f_auto' && part !== 'q_auto:eco') {
                    transformations.push(part);
                }
            }
            url.pathname = match[1] + [...transformations, `c_limit,w_${size},h_${size}`, 'q_auto:eco', 'f_auto', ...parts].join('/');
            return url.toString();
        }
        if (url.hostname === 'images.unsplash.com') {
            url.searchParams.set('auto', 'format');
            url.searchParams.set('fit', 'max');
            url.searchParams.set('w', String(size));
            url.searchParams.set('q', '70');
            return url.toString();
        }
    } catch { /* Keep local previews and unsupported sources intact. */ }
    return uri;
}

/** Express JSON replacer also covers nested/populated users, orders and deals. */
export function imageResponseReplacer(key, value) {
    if (!/^(?:image|images|logo|userImage|productImage|avatar|\d+)$/.test(key)) return value;
    const size = /^(?:logo|avatar|userImage)$/.test(key) ? 320 : 1200;
    return optimizeImageUrl(value, size);
}

export function imageUploadOptions(folder) {
    const maxSize = { users: 480, store_logo: 512, 'banner-categories': 480, products: 1200, deals: 1200, banners: 1600 }[folder] || 1200;
    return {
        folder,
        resource_type: 'image',
        format: 'webp',
        transformation: [{ width: maxSize, height: maxSize, crop: 'limit' }, { quality: 75 }],
    };
}
