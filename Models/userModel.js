import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            maxlength: [50, 'Name cannot exceed 50 characters']
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
        },
        phone: {
            type: String,
            trim: true,
            default: null
        },
        address: {
            type: String,
            trim: true,
            default: null
        },
        password: {
            type: String,
            minlength: [6, 'Password must be at least 6 characters'],
            select: false   // never returned by default in queries
        },
        image: {
            type: String,
            default: null
        },
        image_public_id: {
            type: String,
            default: null,
            select: false
        },
        role: {
            type: String,
            enum: ['user', 'admin'],
            default: 'user'
        },
        isActive: {
            type: Boolean,
            default: true
        },
        isGoogleLogin: {
            type: Boolean,
            default: false
        },
        // Registration email verification
        isVerified: {
            type: Boolean,
            default: false
        },
        verificationOtp: {
            type: String,      // stores hashed OTP
            default: null,
            select: false
        },
        verificationOtpExpire: {
            type: Date,
            default: null,
            select: false
        },
        // Forgot password — OTP based
        resetPasswordOtp: {
            type: String,      // stores hashed OTP
            default: null,
            select: false
        },
        resetPasswordExpire: {
            type: Date,
            default: null,
            select: false
        },
        resetPasswordResendCount: { type: Number, default: 0, select: false },
        resetPasswordResendWindowStart: { type: Date, default: null, select: false },
        resetPasswordLastSentAt: { type: Date, default: null, select: false },
        resetPasswordResendLockedUntil: { type: Date, default: null, select: false },
        // Email change — OTP based
        emailChangeOtp: {
            type: String,      // stores hashed OTP
            default: null,
            select: false
        },
        emailChangeOtpExpire: {
            type: Date,
            default: null,
            select: false
        },
        pendingEmail: {
            type: String,      // new email waiting for OTP verification
            default: null,
            select: false
        },
        pushToken: {
            type: String,      // Expo Push Token or FCM Device Token
            default: null,
            trim: true
        }
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                delete ret.password;
                delete ret.image_public_id;
                delete ret.resetPasswordOtp;
                delete ret.resetPasswordExpire;
                delete ret.resetPasswordResendCount;
                delete ret.resetPasswordResendWindowStart;
                delete ret.resetPasswordLastSentAt;
                delete ret.resetPasswordResendLockedUntil;
                delete ret.verificationOtp;
                delete ret.verificationOtpExpire;
                delete ret.emailChangeOtp;
                delete ret.emailChangeOtpExpire;
                delete ret.pendingEmail;
                delete ret.pushToken;
                return ret;
            }
        },
        toObject: {
            transform: (doc, ret) => {
                ret.id = ret._id;
                delete ret._id;
                delete ret.__v;
                delete ret.password;
                delete ret.image_public_id;
                delete ret.resetPasswordOtp;
                delete ret.resetPasswordExpire;
                delete ret.resetPasswordResendCount;
                delete ret.resetPasswordResendWindowStart;
                delete ret.resetPasswordLastSentAt;
                delete ret.resetPasswordResendLockedUntil;
                delete ret.verificationOtp;
                delete ret.verificationOtpExpire;
                delete ret.emailChangeOtp;
                delete ret.emailChangeOtpExpire;
                delete ret.pendingEmail;
                delete ret.pushToken;
                return ret;
            }
        }
    }
);

// ── Hash password before save ──
userSchema.pre('save', async function () {
    if (!this.isModified('password') || !this.password) return;
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
});

// ── Compare entered password with hashed ──
userSchema.methods.comparePassword = async function (enteredPassword) {
    if (!this.password) return false;
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;
