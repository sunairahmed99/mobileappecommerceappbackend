import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Coupon from '../Models/couponModel.js';
import { ConnectDb } from '../config/db.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env'), quiet: true });

const seedInitialCoupons = async () => {
    try {
        await ConnectDb();

        const count = await Coupon.countDocuments();
        if (count === 0) {
            console.log('No coupons found. Seeding default initial coupons...');

            await Coupon.create([
                {
                    code: 'WELCOME10',
                    description: 'Get 10% discount on your first order as a new user!',
                    couponType: 'first_order',
                    discountType: 'percentage',
                    discountValue: 10,
                    minOrderAmount: 500,
                    maxDiscountAmount: 500,
                    isActive: true,
                },
                {
                    code: 'FIRST50',
                    description: 'Special first purchase promo: Flat Rs. 150 off on orders above Rs. 1000',
                    couponType: 'first_order',
                    discountType: 'fixed',
                    discountValue: 150,
                    minOrderAmount: 1000,
                    isActive: true,
                },
                {
                    code: 'SAVE20',
                    description: 'Universal 20% discount code for all customers!',
                    couponType: 'all_users',
                    discountType: 'percentage',
                    discountValue: 20,
                    minOrderAmount: 1200,
                    maxDiscountAmount: 1000,
                    isActive: true,
                },
                {
                    code: 'FLAT200',
                    description: 'Flat Rs. 200 off for all users on minimum purchase of Rs. 1500',
                    couponType: 'all_users',
                    discountType: 'fixed',
                    discountValue: 200,
                    minOrderAmount: 1500,
                    isActive: true,
                },
            ]);

            console.log('Default coupons seeded successfully!');
        } else {
            console.log(`Already found ${count} coupons in database.`);
        }

        process.exit(0);
    } catch (err) {
        console.error('Coupon seed error:', err);
        process.exit(1);
    }
};

seedInitialCoupons();
