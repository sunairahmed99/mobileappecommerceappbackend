import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('couponController');
import Coupon from '../Models/couponModel.js';
import Order from '../Models/orderModel.js';
import User from '../Models/userModel.js';

// ── GET /api/coupons (Admin: Get all coupons with statistics) ────────
export const getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });

        const now = new Date();
        const totalCoupons = coupons.length;
        const activeCoupons = coupons.filter(
            (c) => c.isActive && (!c.expiryDate || new Date(c.expiryDate) >= now)
        ).length;
        const firstOrderCoupons = coupons.filter((c) => c.couponType === 'first_order').length;
        const allUsersCoupons = coupons.filter((c) => c.couponType === 'all_users').length;
        const individualCoupons = coupons.filter((c) => c.couponType === 'individual').length;
        const totalRedemptions = coupons.reduce((sum, c) => sum + (c.usageCount || 0), 0);

        return res.status(200).json({
            success: true,
            count: totalCoupons,
            stats: {
                totalCoupons,
                activeCoupons,
                firstOrderCoupons,
                allUsersCoupons,
                individualCoupons,
                totalRedemptions,
            },
            coupons,
        });
    } catch (error) {
        console.error('getAllCoupons error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve coupons.',
        });
    }
};

// ── POST /api/coupons (Admin: Create new coupon) ─────────────────────
export const createCoupon = async (req, res) => {
    try {
        const {
            code,
            description,
            couponType,
            discountType,
            discountValue,
            minOrderAmount,
            maxDiscountAmount,
            usageLimit,
            expiryDate,
            isActive,
            assignedUserEmail, // for individual coupon type
        } = req.body;

        if (!code || !code.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code is required.',
            });
        }

        const formattedCode = code.trim().toUpperCase();

        // Check if code already exists
        const existing = await Coupon.findOne({ code: formattedCode });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `Coupon with code "${formattedCode}" already exists.`,
            });
        }

        const parsedDiscountValue = Number(discountValue);
        if (isNaN(parsedDiscountValue) || parsedDiscountValue <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Discount value must be greater than 0.',
            });
        }

        const validDiscountType = discountType === 'fixed' ? 'fixed' : 'percentage';
        if (validDiscountType === 'percentage' && parsedDiscountValue > 100) {
            return res.status(400).json({
                success: false,
                message: 'Percentage discount cannot exceed 100%.',
            });
        }

        let validCouponType = 'all_users';
        if (couponType === 'first_order') validCouponType = 'first_order';
        else if (couponType === 'individual') validCouponType = 'individual';

        // For individual coupon: resolve user by email
        let assignedUserId = null;
        let resolvedUserEmail = null;
        let resolvedUserName = null;

        if (validCouponType === 'individual') {
            if (!assignedUserEmail || !assignedUserEmail.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide the user email for an Individual coupon.',
                });
            }
            const targetUser = await User.findOne({ email: assignedUserEmail.trim().toLowerCase() });
            if (!targetUser) {
                return res.status(404).json({
                    success: false,
                    message: `No registered user found with email "${assignedUserEmail}".`,
                });
            }
            assignedUserId = targetUser._id;
            resolvedUserEmail = targetUser.email;
            resolvedUserName = targetUser.name || targetUser.email;
        }

        const newCoupon = await Coupon.create({
            code: formattedCode,
            description: description?.trim() || '',
            couponType: validCouponType,
            discountType: validDiscountType,
            discountValue: discountType === 'fixed' ? Math.round(parsedDiscountValue) : parsedDiscountValue,
            minOrderAmount: Math.max(0, Number(minOrderAmount) || 0),
            maxDiscountAmount: maxDiscountAmount && Number(maxDiscountAmount) > 0 ? Number(maxDiscountAmount) : null,
            usageLimit: usageLimit && Number(usageLimit) > 0 ? Number(usageLimit) : null,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            isActive: isActive !== false,
            assignedUserId,
            assignedUserEmail: resolvedUserEmail,
            assignedUserName: resolvedUserName,
        });

        return res.status(201).json({
            success: true,
            message: 'Coupon created successfully.',
            coupon: newCoupon,
        });
    } catch (error) {
        console.error('createCoupon error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create coupon.',
        });
    }
};

// ── PUT /api/coupons/:id (Admin: Update existing coupon) ───────────────
export const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findById(id);

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found.',
            });
        }

        const {
            code,
            description,
            couponType,
            discountType,
            discountValue,
            minOrderAmount,
            maxDiscountAmount,
            usageLimit,
            expiryDate,
            isActive,
        } = req.body;

        if (code && code.trim()) {
            const formattedCode = code.trim().toUpperCase();
            if (formattedCode !== coupon.code) {
                const existing = await Coupon.findOne({ code: formattedCode });
                if (existing) {
                    return res.status(400).json({
                        success: false,
                        message: `Coupon code "${formattedCode}" is already in use by another coupon.`,
                    });
                }
                coupon.code = formattedCode;
            }
        }

        if (description !== undefined) {
            coupon.description = description.trim();
        }

        if (couponType) {
            if (couponType === 'first_order') coupon.couponType = 'first_order';
            else if (couponType === 'individual') coupon.couponType = 'individual';
            else coupon.couponType = 'all_users';
        }

        // Handle individual user assignment on update
        if (req.body.assignedUserEmail !== undefined) {
            const emailVal = req.body.assignedUserEmail?.trim().toLowerCase();
            if (coupon.couponType === 'individual' && emailVal) {
                const targetUser = await User.findOne({ email: emailVal });
                if (!targetUser) {
                    return res.status(404).json({
                        success: false,
                        message: `No registered user found with email "${req.body.assignedUserEmail}".`,
                    });
                }
                coupon.assignedUserId = targetUser._id;
                coupon.assignedUserEmail = targetUser.email;
                coupon.assignedUserName = targetUser.name || targetUser.email;
            } else if (!emailVal || coupon.couponType !== 'individual') {
                coupon.assignedUserId = null;
                coupon.assignedUserEmail = null;
                coupon.assignedUserName = null;
            }
        }

        if (discountType) {
            coupon.discountType = discountType === 'fixed' ? 'fixed' : 'percentage';
        }

        if (discountValue !== undefined) {
            const parsed = Number(discountValue);
            if (isNaN(parsed) || parsed <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Discount value must be greater than 0.',
                });
            }
            if (coupon.discountType === 'percentage' && parsed > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Percentage discount cannot exceed 100%.',
                });
            }
            coupon.discountValue = coupon.discountType === 'fixed' ? Math.round(parsed) : parsed;
        }

        if (minOrderAmount !== undefined) {
            coupon.minOrderAmount = Math.max(0, Number(minOrderAmount) || 0);
        }

        if (maxDiscountAmount !== undefined) {
            coupon.maxDiscountAmount =
                maxDiscountAmount && Number(maxDiscountAmount) > 0 ? Number(maxDiscountAmount) : null;
        }

        if (usageLimit !== undefined) {
            coupon.usageLimit = usageLimit && Number(usageLimit) > 0 ? Number(usageLimit) : null;
        }

        if (expiryDate !== undefined) {
            coupon.expiryDate = expiryDate ? new Date(expiryDate) : null;
        }

        if (isActive !== undefined) {
            coupon.isActive = Boolean(isActive);
        }

        if (coupon.discountType === 'fixed') coupon.discountValue = Math.round(coupon.discountValue);
        await coupon.save();

        return res.status(200).json({
            success: true,
            message: 'Coupon updated successfully.',
            coupon,
        });
    } catch (error) {
        console.error('updateCoupon error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update coupon.',
        });
    }
};

// ── DELETE /api/coupons/:id (Admin: Delete coupon) ─────────────────────
export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findByIdAndDelete(id);

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found.',
            });
        }

        return res.status(200).json({
            success: true,
            message: `Coupon "${coupon.code}" deleted successfully.`,
        });
    } catch (error) {
        console.error('deleteCoupon error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete coupon.',
        });
    }
};

// ── PATCH /api/coupons/:id/toggle-status (Admin: Toggle coupon status) ──
export const toggleCouponStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findById(id);

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found.',
            });
        }

        coupon.isActive = !coupon.isActive;
        if (coupon.discountType === 'fixed') coupon.discountValue = Math.round(coupon.discountValue);
        await coupon.save();

        return res.status(200).json({
            success: true,
            message: `Coupon "${coupon.code}" is now ${coupon.isActive ? 'Active' : 'Inactive'}.`,
            isActive: coupon.isActive,
            coupon,
        });
    } catch (error) {
        console.error('toggleCouponStatus error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update coupon status.',
        });
    }
};

// ── POST /api/coupons/validate (Public / User: Validate and calculate discount) ──
export const validateCoupon = async (req, res) => {
    try {
        const { code, subtotal } = req.body;
        const userId = req.user?.id;

        if (!code || !code.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a coupon code.',
            });
        }

        const cartSubtotal = Number(subtotal) || 0;
        if (cartSubtotal <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty.',
            });
        }

        const formattedCode = code.trim().toUpperCase();
        const coupon = await Coupon.findOne({ code: formattedCode });

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: `Invalid coupon code "${formattedCode}".`,
            });
        }

        if (!coupon.isActive) {
            return res.status(400).json({
                success: false,
                message: 'This coupon is currently inactive or disabled.',
            });
        }

        const now = new Date();

        if (coupon.startDate && new Date(coupon.startDate) > now) {
            return res.status(400).json({
                success: false,
                message: 'This coupon is not active yet.',
            });
        }

        if (coupon.expiryDate && new Date(coupon.expiryDate) < now) {
            return res.status(400).json({
                success: false,
                message: 'This coupon has expired.',
            });
        }

        if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
            return res.status(400).json({
                success: false,
                message: 'This coupon has reached its maximum redemption limit.',
            });
        }

        if (cartSubtotal < coupon.minOrderAmount) {
            return res.status(400).json({
                success: false,
                message: `Minimum order amount of Rs. ${coupon.minOrderAmount} is required to apply "${coupon.code}". (Current subtotal: Rs. ${cartSubtotal})`,
            });
        }

        // ── First Time User Check ──
        if (coupon.couponType === 'first_order') {
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    requireLogin: true,
                    message: 'Please login to use this First-Time User discount coupon.',
                });
            }

            // Check if user has already placed an order (excluding Cancelled)
            const priorOrder = await Order.findOne({
                user: userId,
                status: { $ne: 'Cancelled' },
            });

            if (priorOrder) {
                return res.status(400).json({
                    success: false,
                    message: 'This coupon code is valid ONLY on your first order. You have already placed an order before.',
                });
            }
        }

        // ── Individual User Check ──
        if (coupon.couponType === 'individual') {
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    requireLogin: true,
                    message: 'Please login to use this exclusive coupon.',
                });
            }
            if (!coupon.assignedUserId || coupon.assignedUserId.toString() !== userId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'This coupon is exclusively assigned to a specific user and cannot be used by you.',
                });
            }
        }

        // ── Per-user usage check ──
        if (userId && coupon.usedBy && coupon.usedBy.length > 0) {
            const alreadyUsed = coupon.usedBy.some(
                (item) => item.user && item.user.toString() === userId.toString()
            );
            if (alreadyUsed) {
                return res.status(400).json({
                    success: false,
                    message: 'You have already used this coupon code.',
                });
            }
        }

        // ── Calculate Discount ──
        let calculatedDiscount = 0;
        let effectivePercent = 0;

        if (coupon.discountType === 'percentage') {
            effectivePercent = coupon.discountValue;
            calculatedDiscount = (cartSubtotal * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount && coupon.maxDiscountAmount > 0) {
                calculatedDiscount = Math.min(calculatedDiscount, coupon.maxDiscountAmount);
            }
        } else {
            // Fixed discount
            calculatedDiscount = Math.min(coupon.discountValue, cartSubtotal);
            effectivePercent = Math.round((calculatedDiscount / cartSubtotal) * 100);
        }

        calculatedDiscount = Math.round(calculatedDiscount);

        return res.status(200).json({
            success: true,
            message: `Coupon "${coupon.code}" applied successfully! You saved Rs. ${calculatedDiscount}.`,
            coupon: {
                id: coupon._id,
                code: coupon.code,
                description: coupon.description,
                couponType: coupon.couponType,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                minOrderAmount: coupon.minOrderAmount,
                maxDiscountAmount: coupon.maxDiscountAmount,
            },
            discountAmount: calculatedDiscount,
            discountPercent: effectivePercent,
            finalSubtotal: Math.max(0, cartSubtotal - calculatedDiscount),
        });
    } catch (error) {
        console.error('validateCoupon error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to validate coupon.',
        });
    }
};

// ── Helper to record coupon redemption upon order completion ────────
export const recordCouponRedemption = async (couponCode, userId, orderNumber, discountAmount) => {
    try {
        if (!couponCode) return;
        const formattedCode = couponCode.trim().toUpperCase();
        const coupon = await Coupon.findOne({ code: formattedCode });
        if (!coupon) return;

        coupon.usageCount = (coupon.usageCount || 0) + 1;
        coupon.usedBy.push({
            user: userId || null,
            orderNumber: orderNumber || '',
            discountApplied: discountAmount || 0,
            usedAt: new Date(),
        });

        if (coupon.discountType === 'fixed') coupon.discountValue = Math.round(coupon.discountValue);
        await coupon.save();
    } catch (err) {
        console.error('recordCouponRedemption error:', err);
    }
};

