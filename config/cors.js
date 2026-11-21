import dotenv from 'dotenv';
dotenv.config({ quiet: true });
export const corsOptions = {
    origin(origin, callback) {
        const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
        const development = process.env.NODE_ENV !== 'production' && allowed.length === 0;
        callback(null, !origin || allowed.includes(origin) || development);
    },
};
