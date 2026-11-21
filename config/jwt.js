import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../Models/userModel.js';

dotenv.config({ quiet: true });

// ── Generate JWT Access Token ──
export const generateToken = (userId, role) => {
    return jwt.sign(
        { id: userId, role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};

// ── Verify token middleware (protect routes) ──
export const authenticateToken = async (token) => {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive || !user.isVerified) throw new Error('Account unavailable');
    return { id: String(user._id), role: user.role, name: user.name, email: user.email };
};

export const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        const token = authHeader.split(' ')[1];
        req.user = await authenticateToken(token);
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token. Please login again.'
        });
    }
};

// ── Optional token middleware (attaches req.user if present, but doesn't block) ──
export const optionalProtect = async (req, res, next) => {
    if (req.headers.authorization) return protect(req, res, next);
    next();
};

// ── Admin only middleware ──
export const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admins only.'
        });
    }
    next();
};
