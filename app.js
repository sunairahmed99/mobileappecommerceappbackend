import express from 'express';
import mongoose from 'mongoose';
import { vercelDatabase } from './middleware/runtime.js';
import { secureResponseReplacer, secureResponses } from './services/responseSecurity.js';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import { stripeWebhook } from './Controllers/paymentController.js';
import { securityHeaders, sanitizeInputs } from './middleware/security.js';
import bannerRoutes from './Routes/bannerRoutes.js';
import bannerCategoryRoutes from './Routes/bannerCategoryRoutes.js';
import productRoutes from './Routes/productRoutes.js';
import authRoutes from './Routes/authRoutes.js';
import orderRoutes from './Routes/orderRoutes.js';
import notificationRoutes from './Routes/notificationRoutes.js';
import feedbackRoutes from './Routes/feedbackRoutes.js';
import chatRoutes from './Routes/chatRoutes.js';
import deliveryRoutes from './Routes/deliveryRoutes.js';
import storeSettingsRoutes from './Routes/storeSettingsRoutes.js';
import couponRoutes from './Routes/couponRoutes.js';
import paymentRoutes from './Routes/paymentRoutes.js';
import dealRoutes from './Routes/dealRoutes.js';

const app = express();
if (process.env.VERCEL === '1') app.set('trust proxy', 1);
app.set('json replacer', secureResponseReplacer);
app.use(secureResponses);

// Security & Parsing Middlewares
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(vercelDatabase);
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInputs);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/banner-categories', bannerCategoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/delivery-settings', deliveryRoutes);
app.use('/api/store-settings', storeSettingsRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/deals', dealRoutes);

// Health check route
app.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, status: 'ok' });
});
app.get('/health/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.setHeader('Cache-Control', 'no-store');
    res.status(ready ? 200 : 503).json({ success: ready, status: ready ? 'ready' : 'unavailable' });
});
app.get('/', (req, res) => {
    res.json({ message: 'API is running' });
});

app.use((_req, res) => res.status(404).json({ success: false, message: 'Route not found.' }));

app.use((error, _req, res, _next) => {
    const status = error.type === 'entity.parse.failed' || error.name === 'CastError' || error.name === 'ValidationError' ? 400
        : error.code === 'LIMIT_FILE_SIZE' || error.type === 'entity.too.large' ? 413
        : error.name === 'MulterError' ? 400 : Number(error.status) || 500;
    const messages = { 400: 'Invalid request.', 413: 'Request exceeds the allowed size.' };
    res.status(status >= 400 && status <= 599 ? status : 500).json({ success: false, message: messages[status] || 'Unable to process request.' });
});

export default app;

