import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('deliveryController');
import DeliverySettings from '../Models/deliverySettingsModel.js';

// ── GET: Public — Delivery settings fetch karo (checkout ke liye) ──
export const getDeliverySettings = async (req, res) => {
  try {
    let settings = await DeliverySettings.findOne();

    // Agar koi settings nahi hai to default bana do
    if (!settings) {
      settings = await DeliverySettings.create({
        minOrderForDelivery: 500,
        deliveryCharge: 150,
        freeDeliveryThreshold: 2000,
        isActive: true,
      });
    }

    res.json({ success: true, settings });
  } catch (err) {
    console.error('getDeliverySettings error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── PUT: Admin — Delivery settings update karo ──
export const updateDeliverySettings = async (req, res) => {
  try {
    const { minOrderForDelivery, deliveryCharge, freeDeliveryThreshold, isActive } = req.body;

    // Validation
    if (
      minOrderForDelivery === undefined ||
      deliveryCharge === undefined ||
      freeDeliveryThreshold === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: 'Minimum order amount, delivery fee, and free delivery threshold are required.',
      });
    }

    const minOrder = Number(minOrderForDelivery);
    const charge = Number(deliveryCharge);
    const freeThreshold = Number(freeDeliveryThreshold);

    if (![minOrder, charge, freeThreshold].every(Number.isFinite)) {
      return res.status(400).json({ success: false, message: 'All values must be valid numbers.' });
    }

    if (minOrder < 0 || charge < 0 || freeThreshold < 0) {
      return res.status(400).json({ success: false, message: 'Values cannot be negative.' });
    }

    if (freeThreshold < minOrder) {
      return res.status(400).json({
        success: false,
        message: 'The free delivery threshold cannot be less than the minimum order amount.',
      });
    }

    let settings = await DeliverySettings.findOne();

    if (!settings) {
      settings = await DeliverySettings.create({
        minOrderForDelivery: minOrder,
        deliveryCharge: charge,
        freeDeliveryThreshold: freeThreshold,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      });
    } else {
      settings.minOrderForDelivery = minOrder;
      settings.deliveryCharge = charge;
      settings.freeDeliveryThreshold = freeThreshold;
      if (isActive !== undefined) settings.isActive = Boolean(isActive);
      await settings.save();
    }

    res.json({ success: true, message: 'Delivery settings updated successfully!', settings });
  } catch (err) {
    console.error('updateDeliverySettings error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

