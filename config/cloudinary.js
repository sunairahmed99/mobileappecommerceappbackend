import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('cloudinary');
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import { imageUploadOptions } from '../services/imageOptimization.js';

dotenv.config({ quiet: true });

cloudinary.config({
    cloud_name: process.env.cloudinaryname || process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.cloudinarykey || process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.cloudinarysecret || process.env.CLOUDINARY_API_SECRET
});

// Helper function to upload file buffer to Cloudinary
export const uploadToCloudinary = (fileBuffer, folder = 'banners') => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            imageUploadOptions(folder),
            (error, result) => {
                if (error) {
                    return reject(error);
                }
                resolve(result);
            }
        );
        uploadStream.end(fileBuffer);
    });
};

// Helper function to delete image from Cloudinary
export const deleteFromCloudinary = async (publicId) => {
    try {
        if (!publicId) return;
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error('Cloudinary destroy error:', error);
    }
};

export default cloudinary;
