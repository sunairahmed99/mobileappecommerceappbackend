import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('bannerController');
import mongoose from 'mongoose';
import Banner from '../Models/bannerModel.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';

// @desc    Create new Banner
// @route   POST /api/banners
export const createBanner = async (req, res) => {
    try {
        const { name, isActive } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Banner name is required' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Banner image file is required' });
        }

        // Upload buffer to Cloudinary
        const uploadResult = await uploadToCloudinary(req.file.buffer, 'banners');

        // Save banner to database
        const banner = await Banner.create({
            name: name.trim(),
            image: uploadResult.secure_url,
            public_id: uploadResult.public_id,
            isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true
        });

        res.status(201).json({
            success: true,
            message: 'Banner created successfully',
            banner
        });
    } catch (error) {
        console.error('Error creating banner:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating banner'
        });
    }
};

// @desc    Get all Banners
// @route   GET /api/banners
export const getAllBanners = async (req, res) => {
    try {
        // Optional filter: ?isActive=true or ?isActive=false
        const filter = {};
        if (req.query.isActive !== undefined) {
            filter.isActive = req.query.isActive === 'true';
        }

        const banners = await Banner.find(filter).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: banners.length,
            banners
        });
    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching banners'
        });
    }
};

// @desc    Get single Banner by ID
// @route   GET /api/banners/:id
export const getBannerById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Banner ID format' });
        }

        const banner = await Banner.findById(id);

        if (!banner) {
            return res.status(404).json({ success: false, message: 'Banner not found' });
        }

        res.status(200).json({
            success: true,
            banner
        });
    } catch (error) {
        console.error('Error fetching banner by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching banner'
        });
    }
};

// @desc    Update Banner (name, image and/or isActive)
// @route   PUT /api/banners/:id
export const updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, isActive } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Banner ID format' });
        }

        const banner = await Banner.findById(id);

        if (!banner) {
            return res.status(404).json({ success: false, message: 'Banner not found' });
        }

        // Update name if provided
        if (name && name.trim()) {
            banner.name = name.trim();
        }

        // Update isActive if provided
        if (isActive !== undefined) {
            banner.isActive = isActive === 'true' || isActive === true;
        }

        // If new image provided, upload new and delete old
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file.buffer, 'banners');

            // Delete old image from cloudinary if public_id exists
            if (banner.public_id) {
                await deleteFromCloudinary(banner.public_id);
            }

            banner.image = uploadResult.secure_url;
            banner.public_id = uploadResult.public_id;
        }

        const updatedBanner = await banner.save();

        res.status(200).json({
            success: true,
            message: 'Banner updated successfully',
            banner: updatedBanner
        });
    } catch (error) {
        console.error('Error updating banner:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating banner'
        });
    }
};

// @desc    Delete Banner
// @route   DELETE /api/banners/:id
export const deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Banner ID format' });
        }

        const banner = await Banner.findById(id);

        if (!banner) {
            return res.status(404).json({ success: false, message: 'Banner not found' });
        }

        // Delete from Cloudinary
        if (banner.public_id) {
            await deleteFromCloudinary(banner.public_id);
        }

        await Banner.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Banner deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting banner:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting banner'
        });
    }
};

// @desc    Toggle Banner Active Status
// @route   PATCH /api/banners/:id/toggle-status
export const toggleBannerStatus = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Banner ID format' });
        }

        const banner = await Banner.findById(id);

        if (!banner) {
            return res.status(404).json({ success: false, message: 'Banner not found' });
        }

        banner.isActive = banner.isActive === false ? true : false;
        const updatedBanner = await banner.save();

        res.status(200).json({
            success: true,
            message: `Banner ${updatedBanner.isActive ? 'activated' : 'deactivated'} successfully`,
            banner: updatedBanner
        });
    } catch (error) {
        console.error('Error toggling banner status:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while toggling banner status'
        });
    }
};
