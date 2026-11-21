import mongoose from 'mongoose';
import Product from '../Models/productModel.js';
import Deal from '../Models/dealModel.js';
import Coupon from '../Models/couponModel.js';
import Order from '../Models/orderModel.js';
import DeliverySettings from '../Models/deliverySettingsModel.js';
import StoreSettings from '../Models/storeSettingsModel.js';

export const money = (value) => Math.round(value);
export const invalid = (message, status = 400) => Object.assign(new Error(message), { status });

export async function priceOrder(input, userId) {
    if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) {
        throw invalid('An order must contain between 1 and 100 items.');
    }
    const store = await StoreSettings.findOne();
    if (store?.isStoreOpen === false) throw invalid('The store is currently closed.');
    const items = [];
    for (const item of input.items) {
        if (!item || !Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 99) {
            throw invalid('Item quantities must be whole numbers between 1 and 99.');
        }
        const id = item.productId;
        if (!mongoose.isValidObjectId(id)) throw invalid('A valid product ID is required.');
        let product = await Product.findById(id);
        let price = product?.price;
        let name = product?.name;
        let image = product?.images?.[0] || '';
        // Deal IDs are distinct catalog entries, including custom deal products.
        if (!product) {
            const deal = await Deal.findById(id).populate('product');
            const now = new Date();
            if (!deal?.isActive || deal.startDate > now || (deal.endDate && deal.endDate < now)) {
                throw invalid('This product or deal is no longer available.');
            }
            product = deal.product;
            price = deal.dealPrice;
            name = product?.name || deal.customProduct?.name || deal.dealName;
            image = product?.images?.[0] || deal.customProduct?.images?.[0] || '';
        }
        if (product && (!product.isActive || !product.isInStock)) throw invalid('A selected product is unavailable.');
        if (!Number.isFinite(price) || price < 0) throw invalid('Invalid catalog price.');
        for (const [field, options] of [['size', product?.sizes], ['color', product?.colors]]) {
            if (options?.length && !options.includes(item[field])) throw invalid(`Choose a valid ${field}.`);
        }
        items.push({ productId: id, name, image, price: money(price), qty: item.qty,
            size: typeof item.size === 'string' ? item.size : null,
            color: typeof item.color === 'string' ? item.color : null });
    }
    const subtotal = money(items.reduce((sum, item) => sum + item.price * item.qty, 0));
    let discount = 0;
    const couponCode = typeof input.couponCode === 'string' ? input.couponCode.trim().toUpperCase() : null;
    if (couponCode) {
        const coupon = await Coupon.findOne({ code: couponCode });
        const now = new Date();
        if (!coupon?.isActive || (coupon.startDate && coupon.startDate > now) ||
            (coupon.expiryDate && coupon.expiryDate < now) ||
            (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) || subtotal < coupon.minOrderAmount ||
            coupon.usedBy.some((entry) => String(entry.user) === String(userId))) {
            throw invalid('This coupon is unavailable or cannot be used on this order.');
        }
        if (coupon.couponType === 'first_order' && await Order.exists({ user: userId, status: { $ne: 'Cancelled' } })) {
            throw invalid('This coupon is only available for your first order.');
        }
        discount = coupon.discountType === 'fixed' ? coupon.discountValue : subtotal * coupon.discountValue / 100;
        if (coupon.maxDiscountAmount) discount = Math.min(discount, coupon.maxDiscountAmount);
        discount = Math.min(subtotal, Math.round(discount));
    }
    const delivery = await DeliverySettings.findOne();
    const rules = delivery || { isActive: true, freeDeliveryThreshold: 2000, deliveryCharge: 150 };
    const shippingFee = subtotal > 0 && rules.isActive && subtotal < rules.freeDeliveryThreshold ? money(rules.deliveryCharge) : 0;
    const tax = money(subtotal * 0.05);
    const totalAmount = money(subtotal - discount + shippingFee + tax);
    if (![subtotal, discount, shippingFee, tax, totalAmount].every(Number.isFinite) || totalAmount < 0) {
        throw invalid('Invalid order total.');
    }
    return { items, subtotal, discount, couponCode: couponCode || null, shippingFee, tax, totalAmount };
}
