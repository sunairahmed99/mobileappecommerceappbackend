import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Banner name is required'],
            trim: true
        },
        image: {
            type: String,
            required: [true, 'Banner image URL is required']
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
                delete ret.createdAt;
                delete ret.updatedAt;
                return ret;
            }
        },
        toObject: {
            transform: (doc, ret) => {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                delete ret.public_id;
                delete ret.createdAt;
                delete ret.updatedAt;
                return ret;
            }
        }
    }
);

const Banner = mongoose.model('Banner', bannerSchema);

export default Banner;
