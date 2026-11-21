import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('db');
import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "node:dns";

dotenv.config({ quiet: true });

// Fix for Node.js / Windows querySrv ECONNREFUSED issue with MongoDB Atlas
try {
    if (process.platform === 'win32') {
        dns.setServers(['8.8.8.8', '8.8.4.4']);
    }
} catch {
    // Fallback if environment doesn't allow changing DNS servers
}

let connectionPromise;

export const ConnectDb = async () => {
    if (mongoose.connection.readyState === 1) return mongoose;
    if (!process.env.DATABASE) throw new Error('DATABASE is required.');
    if (!connectionPromise) {
        connectionPromise = mongoose.connect(process.env.DATABASE, {
            maxPoolSize: 5,
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
        }).catch((err) => {
            console.error('MongoDB connection failed.');
            throw new Error('Database connection failed', { cause: err });
        }).finally(() => { connectionPromise = undefined; });
    }
    return connectionPromise;
};
