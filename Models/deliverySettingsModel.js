import mongoose from 'mongoose';

const deliverySettingsSchema = new mongoose.Schema(
  {
    minOrderForDelivery: {
      type: Number,
            set: (value) => value == null ? value : Math.round(value),
      required: true,
      default: 500,         // Rs. 500 se kam order pr delivery charge lagegi
    },
    deliveryCharge: {
      type: Number,
            set: (value) => value == null ? value : Math.round(value),
      required: true,
      default: 150,         // Default delivery charge (Rs.)
    },
    freeDeliveryThreshold: {
      type: Number,
            set: (value) => value == null ? value : Math.round(value),
      required: true,
      default: 2000,        // Is amount ya usse zyada pr delivery free hogi
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Sirf ek hi settings document hoga (singleton pattern)
const DeliverySettings = mongoose.model('DeliverySettings', deliverySettingsSchema);

export default DeliverySettings;

