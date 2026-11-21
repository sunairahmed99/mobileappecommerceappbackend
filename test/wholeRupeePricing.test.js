import { jest, test, expect, afterEach } from '@jest/globals';
import Product from '../Models/productModel.js';
import Deal from '../Models/dealModel.js';
import Coupon from '../Models/couponModel.js';
import DeliverySettings from '../Models/deliverySettingsModel.js';
import StoreSettings from '../Models/storeSettingsModel.js';
import { priceOrder } from '../services/orderPricing.js';

afterEach(() => jest.restoreAllMocks());

test('product and deal writes round monetary fields to whole rupees', () => {
    const product = new Product({ price: 874.13, originalPrice: 999.75 });
    const deal = new Deal({ dealPrice: 874.75, originalPrice: 999.13 });
    expect([product.price, product.originalPrice, deal.dealPrice, deal.originalPrice]).toEqual([874, 1000, 875, 999]);
});

test('legacy decimal prices are rounded per unit before quantity, discount and tax', async () => {
    jest.spyOn(StoreSettings, 'findOne').mockResolvedValue(null);
    jest.spyOn(Product, 'findById').mockResolvedValue({ price: 99.6, name: 'Product', isActive: true, isInStock: true });
    jest.spyOn(Coupon, 'findOne').mockResolvedValue({ isActive: true, discountType: 'percentage', discountValue: 12.5, usedBy: [] });
    jest.spyOn(DeliverySettings, 'findOne').mockResolvedValue({ isActive: true, freeDeliveryThreshold: 2000, deliveryCharge: 150.5 });
    const result = await priceOrder({ items: [{ productId: '507f1f77bcf86cd799439011', qty: 3 }], couponCode: 'TEST' }, 'user');
    expect(result.items[0].price).toBe(100);
    expect(result).toMatchObject({ subtotal: 300, discount: 38, shippingFee: 151, tax: 15, totalAmount: 428 });
});
