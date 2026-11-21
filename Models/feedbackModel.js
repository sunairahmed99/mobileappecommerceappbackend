import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
        },
        message: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ['support', 'feedback', 'inquiry', 'complaint'],
            default: 'support',
        },
        rating: {
            type: Number,
            min: 1,
            max: 5,
            default: 5,
        },
        status: {
            type: String,
            enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
            default: 'Open',
        },
        adminReply: {
            type: String,
            default: '',
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        resolvedAt: {
            type: Date,
            default: null,
        },
        isApproved: {
            type: Boolean,
            default: false,
        },
        isDeclined: {
            type: Boolean,
            default: false,
        },
        approvedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                return ret;
            },
        },
    }
);

export default mongoose.model('Feedback', feedbackSchema);

