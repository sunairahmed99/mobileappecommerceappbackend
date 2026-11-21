// Security Middleware: Headers, Rate Limiting, and Input Sanitization

// ── In-Memory Rate Limiter ──────────────────────────────────────────
const rateLimitStore = new Map();

/**
 * Creates a rate limiting middleware.
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Max requests allowed in windowMs
 * @param {string} options.message - Error message when limit reached
 */
export const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 30, message = 'Too many requests. Please try again later.' }) => {
    return (req, res, next) => {
        // IP address identification
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const key = `${req.baseUrl || ''}${req.path}:${ip}`;
        const now = Date.now();

        const record = rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + windowMs;
        } else {
            record.count += 1;
        }

        rateLimitStore.set(key, record);

        // Periodically cleanup expired entries
        if (rateLimitStore.size > 10000) {
            for (const [k, v] of rateLimitStore.entries()) {
                if (now > v.resetTime) {
                    rateLimitStore.delete(k);
                }
            }
        }

        if (record.count > max) {
            const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
            res.setHeader('Retry-After', retryAfterSec);
            return res.status(429).json({
                success: false,
                message,
                retryAfter: retryAfterSec
            });
        }

        next();
    };
};

// ── Security Headers Middleware ────────────────────────────────────
export const securityHeaders = (req, res, next) => {
    // Prevent MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Prevent Clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // Basic XSS Protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Disable server header disclosure
    res.removeHeader('X-Powered-By');
    if (req.headers.authorization || /^\/api\/(auth|orders|payment|notifications|chat)(\/|$)/.test(req.path)) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
    }
    next();
};

// ── Input Sanitizer to prevent NoSQL query operator injection ($gt, $ne, etc.) ──
const sanitizeValue = (val) => {
    if (Array.isArray(val)) {
        val.forEach(sanitizeValue);
        return val;
    }
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
        for (const key of Object.keys(val)) {
            if (key.startsWith('$') || key.includes('.') || ['__proto__', 'constructor', 'prototype'].includes(key)) {
                delete val[key];
            } else {
                sanitizeValue(val[key]);
            }
        }
    }
    return val;
};

export const sanitizeInputs = (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        sanitizeValue(req.body);
    }
    if (req.params && typeof req.params === 'object') {
        sanitizeValue(req.params);
    }
    if (req.query && typeof req.query === 'object') {
        sanitizeValue(req.query);
    }
    next();
};

