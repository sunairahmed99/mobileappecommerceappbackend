import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';
import User from '../Models/userModel.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

try {
    const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD.');
    if (!process.env.DATABASE) throw new Error('DATABASE is required.');
    dns.setServers(['8.8.8.8', '8.8.4.4']);
    await mongoose.connect(process.env.DATABASE, { serverSelectionTimeoutMS: 15000 });

    let user = await User.findOne({ email }).select('+password');
    const created = !user;
    if (!user) user = new User({ email, name: process.env.SEED_ADMIN_NAME || 'Admin' });
    user.password = password;
    user.role = 'admin';
    user.isActive = true;
    user.isVerified = true;
    user.verificationOtp = null;
    user.verificationOtpExpire = null;
    user.resetPasswordOtp = null;
    user.resetPasswordExpire = null;
    await user.save(); // The model hashes the password with bcrypt.

    const saved = await User.findById(user._id).select('+password');
    if (!saved || saved.role !== 'admin' || !saved.isActive || !saved.isVerified || !(await saved.comparePassword(password))) {
        throw new Error('Admin account verification failed.');
    }
    console.log(JSON.stringify({ action: created ? 'created' : 'updated', email: saved.email, role: saved.role, active: saved.isActive, verified: saved.isVerified, passwordVerified: true }));
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
