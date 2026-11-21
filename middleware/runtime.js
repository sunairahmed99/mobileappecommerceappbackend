import { ConnectDb } from '../config/db.js';

export async function ensureRuntimeReady() {
    if (!process.env.JWT_SECRET || !process.env.DATABASE) {
        throw new Error('DATABASE and JWT_SECRET are required.');
    }
    await ConnectDb();
}

export async function vercelDatabase(req, res, next) {
    if (process.env.VERCEL !== '1' || (req.method === 'GET' && ['/', '/health'].includes(req.path))) {
        return next();
    }
    try {
        await ensureRuntimeReady();
        next();
    } catch {
        res.setHeader('Cache-Control', 'no-store');
        res.status(503).json({ success: false, message: 'Service temporarily unavailable.' });
    }
}
