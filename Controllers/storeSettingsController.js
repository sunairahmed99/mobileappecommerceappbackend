import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('storeSettingsController');
import StoreSettings from '../Models/storeSettingsModel.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';

// ── GET: Public store settings ──
export const getStoreSettings = async (req, res) => {
  try {
    let settings = await StoreSettings.findOne();

    if (!settings) {
      settings = await StoreSettings.create({
        storeName: 'My App',
        tagline: 'Explore • Shop • Experience',
        logo: '',
        supportEmail: 'support@store.com',
        supportPhone: '+92 300 0000000',
        address: 'Main Boulevard, Pakistan',
        currency: 'Rs.',
        noticeBarText: '🎉 Welcome to our store! Free shipping on eligible orders.',
        isStoreOpen: true,
      });
    }

    res.json({ success: true, settings });
  } catch (err) {
    console.error('getStoreSettings error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching store settings' });
  }
};

// ── PUT: Admin update store settings ──
export const updateStoreSettings = async (req, res) => {
  try {
    const {
      storeName,
      tagline,
      supportEmail,
      supportPhone,
      address,
      currency,
      noticeBarText,
      isStoreOpen,
    } = req.body;

    let settings = await StoreSettings.findOne();
    if (!settings) {
      settings = new StoreSettings();
    }

    if (storeName !== undefined && storeName.trim()) {
      settings.storeName = storeName.trim();
    }
    if (tagline !== undefined) {
      settings.tagline = tagline.trim();
    }
    if (supportEmail !== undefined) {
      settings.supportEmail = supportEmail.trim();
    }
    if (supportPhone !== undefined) {
      settings.supportPhone = supportPhone.trim();
    }
    if (address !== undefined) {
      settings.address = address.trim();
    }
    if (currency !== undefined) {
      settings.currency = currency.trim();
    }
    if (noticeBarText !== undefined) {
      settings.noticeBarText = noticeBarText.trim();
    }
    if (isStoreOpen !== undefined) {
      settings.isStoreOpen = isStoreOpen === 'true' || isStoreOpen === true;
    }

    // Logo upload if provided
    if (req.file) {
      // If old logo exists in Cloudinary, delete it
      if (settings.logoPublicId) {
        try {
          await deleteFromCloudinary(settings.logoPublicId);
        } catch (delErr) {
          console.warn('Old logo deletion error:', delErr.message);
        }
      }

      const uploadResult = await uploadToCloudinary(req.file.buffer, 'store_logo');
      settings.logo = uploadResult.secure_url;
      settings.logoPublicId = uploadResult.public_id;
    }

    await settings.save();

    res.json({
      success: true,
      message: 'Store settings updated successfully!',
      settings,
    });
  } catch (err) {
    console.error('updateStoreSettings error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error updating store settings',
    });
  }
};

