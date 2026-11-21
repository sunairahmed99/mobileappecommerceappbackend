import multer from 'multer';

// Use memory storage so we can stream buffer directly to Cloudinary
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(Object.assign(new Error('Only image files are allowed.'), { status: 400 }), false);
    }
};

export const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB max
        files: 3, fields: 50, parts: 60, fieldSize: 64 * 1024,
    }
});
