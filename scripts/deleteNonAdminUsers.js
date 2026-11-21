import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';
import User from '../Models/userModel.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

try {
    if (!process.env.DATABASE) throw new Error('DATABASE is required.');
    dns.setServers(['8.8.8.8', '8.8.4.4']);
    await mongoose.connect(process.env.DATABASE, { serverSelectionTimeoutMS: 15000 });
    const admins = await User.find({ role: 'admin' }).select('_id').lean();
    if (!admins.length) throw new Error('No admin accounts found; deletion cancelled.');
    const result = await User.deleteMany({ role: { $ne: 'admin' } });
    const remainingAdmins = await User.countDocuments({ _id: { $in: admins.map(user => user._id) }, role: 'admin' });
    const remainingNonAdmins = await User.countDocuments({ role: { $ne: 'admin' } });
    if (remainingAdmins !== admins.length || remainingNonAdmins !== 0) {
        throw new Error('Post-deletion verification failed.');
    }
    console.log(JSON.stringify({ deletedUsers: result.deletedCount, preservedAdmins: remainingAdmins, remainingNonAdmins }));
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
