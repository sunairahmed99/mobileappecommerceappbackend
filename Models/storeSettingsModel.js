import mongoose from 'mongoose';

const storeSettingsSchema = new mongoose.Schema(
  {
    storeName: {
      type: String,
      required: true,
      default: 'My App',
      trim: true,
    },
    tagline: {
      type: String,
      default: 'Explore • Shop • Experience',
      trim: true,
    },
    logo: {
      type: String,
      default: '',
    },
    logoPublicId: {
      type: String,
      default: '',
    },
    supportEmail: {
      type: String,
      default: 'support@store.com',
      trim: true,
    },
    supportPhone: {
      type: String,
      default: '+92 300 0000000',
      trim: true,
    },
    address: {
      type: String,
      default: 'Main Boulevard, Pakistan',
      trim: true,
    },
    currency: {
      type: String,
      default: 'Rs.',
      trim: true,
    },
    noticeBarText: {
      type: String,
      default: '🎉 Welcome to our store! Free shipping on eligible orders.',
      trim: true,
    },
    isStoreOpen: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const StoreSettings = mongoose.model('StoreSettings', storeSettingsSchema);

export default StoreSettings;

