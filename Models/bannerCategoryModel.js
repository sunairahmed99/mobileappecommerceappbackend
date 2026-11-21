import mongoose from 'mongoose';

const bannerCategorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Category name is required'],
            trim: true,
            unique: true
        },
        image: {
            type: String,
            required: [true, 'Category image URL is required']
        },
        public_id: {
            type: String,
            required: false
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                delete ret.public_id;
                return ret;
            }
        },
        toObject: {
            transform: (doc, ret) => {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                delete ret.public_id;
                return ret;
            }
        }
    }
);

const BannerCategory = mongoose.model('BannerCategory', bannerCategorySchema);

export default BannerCategory;
