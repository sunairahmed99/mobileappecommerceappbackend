import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('stripe');
import Stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';

export const isStripeConfigured = () => {
    return Boolean(
        stripeSecretKey &&
        !stripeSecretKey.includes('placeholder') &&
        stripeSecretKey.startsWith('sk_')
    );
};

export const getPublishableKey = () => {
    return stripePublishableKey;
};

// Initialize Stripe instance lazily or with current key
let stripeInstance = null;
if (stripeSecretKey) {
    try {
        stripeInstance = new Stripe(stripeSecretKey, {
            apiVersion: '2024-06-20',
        });
    } catch (e) {
        console.warn('⚠️ Stripe initialization notice: Valid secret key required for live transactions.');
    }
}

export const getStripe = () => {
    if (!stripeInstance && process.env.STRIPE_SECRET_KEY) {
        stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
            apiVersion: '2024-06-20',
        });
    }
    return stripeInstance;
};

export default stripeInstance;

