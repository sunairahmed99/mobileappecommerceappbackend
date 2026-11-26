import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        sender: {
            type: String,
            enum: ['user', 'admin', 'assistant'],
            required: true,
        },
        senderName: {
            type: String,
            default: 'User',
        },
        isGuest: { type: Boolean, default: false },
        orderLookup: { type: Boolean, select: false },
        products: {
            type: [new mongoose.Schema({
                id: String,
                name: String,
                price: Number,
                currency: String,
                inStock: Boolean,
            }, { _id: false })],
            default: undefined,
        },
        text: {
            type: String,
            required: true,
            trim: true,
        },
        attachment: {
            type: new mongoose.Schema({
                kind: { type: String, enum: ['image', 'audio', 'file'], required: true },
                name: String,
                mimeType: String,
                size: Number,
                duration: Number,
                publicId: { type: String, required: true },
                resourceType: { type: String, enum: ['image', 'video', 'raw'], required: true },
                format: String,
            }, { _id: false }),
            default: undefined,
        },
        readByAdmin: {
            type: Boolean,
            default: false,
        },
        readByUser: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                if (ret.attachment) {
                    delete ret.attachment.publicId;
                    delete ret.attachment.resourceType;
                    delete ret.attachment.format;
                }
                return ret;
            },
        },
    }
);

messageSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);
