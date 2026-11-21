import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('authController');
import crypto from 'crypto';
import User from '../Models/userModel.js';
import Notification from '../Models/notificationModel.js';
import { generateToken } from '../config/jwt.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import { sendPasswordResetEmail, sendWelcomeEmail, sendEmailChangeOtp, sendVerificationEmail } from '../config/mailer.js';

// ─────────────────────────────────────────────
//  POST /api/auth/register
//  → Creates unverified user and sends 5-minute OTP code to email
// ─────────────────────────────────────────────
export const register = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check if an account already exists
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            if (existingUser.isVerified) {
                return res.status(409).json({
                    success: false,
                    message: 'An account with this email is already verified and exists. Please login.'
                });
            } else {
                // If the user didn't verify previously, allow re-registration by removing previous unverified record
                if (existingUser.image_public_id) {
                    deleteFromCloudinary(existingUser.image_public_id).catch(() => {});
                }
                await User.deleteOne({ _id: existingUser._id });
            }
        }

        // Upload profile image if provided
        let imageUrl = null;
        let imagePublicId = null;
        if (req.file) {
            try {
                const result = await uploadToCloudinary(req.file.buffer, 'users');
                imageUrl = result.secure_url;
                imagePublicId = result.public_id;
            } catch (uploadErr) {
                console.error('Registration profile image upload error:', uploadErr);
                // image upload failure is non-fatal for registration
            }
        }

        // Generate 6-digit OTP and sha256 hash
        const otp = crypto.randomInt(100000, 1000000).toString();
        const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

        // Create user with isVerified: false and 5-minute expiration
        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            phone: phone?.trim() || null,
            password,
            image: imageUrl,
            image_public_id: imagePublicId,
            isVerified: false,
            verificationOtp: hashedOtp,
            verificationOtpExpire: Date.now() + 5 * 60 * 1000 // 5 minutes validity
        });

        // Send verification email with 5-minute code
        try {
            await sendVerificationEmail(user.email, user.name, otp);
        } catch (mailError) {
            console.error('Registration verification email error:', mailError);
            return res.status(500).json({
                success: false,
                message: 'Failed to send verification email. Please check your email and try again.'
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Registration successful! A 6-digit verification code has been sent to your email (valid for 5 minutes).',
            email: user.email,
            requireVerification: true
        });

    } catch (error) {
        console.error('Register error:', error);
        return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

// ─────────────────────────────────────────────
//  POST /api/auth/verify-registration-otp
//  Body: { email, otp }
//  → Verifies 6-digit code within 5 minutes and marks user as verified
// ─────────────────────────────────────────────
export const verifyRegistrationOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Email and verification code are required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const cleanOtp = otp.toString().trim();

        if (cleanOtp.length !== 6 || isNaN(Number(cleanOtp))) {
            return res.status(400).json({ success: false, message: 'Verification code must be a 6-digit number.' });
        }

        const user = await User.findOne({ email: normalizedEmail }).select('+verificationOtp +verificationOtpExpire');

        if (!user) {
            return res.status(404).json({ success: false, message: 'Account not found. Please register first.' });
        }

        if (user.isVerified) {
            return res.status(400).json({ success: false, message: 'This account is already verified. Please login.' });
        }

        const hashedOtp = crypto.createHash('sha256').update(cleanOtp).digest('hex');

        if (user.verificationOtp !== hashedOtp) {
            return res.status(400).json({ success: false, message: 'Invalid verification code. Please check and try again.' });
        }

        if (!user.verificationOtpExpire || user.verificationOtpExpire.getTime() < Date.now()) {
            return res.status(400).json({
                success: false,
                message: 'Verification code has expired (5 minutes exceeded). Please request a new code or register again.',
                isExpired: true
            });
        }

        // Mark as verified and clear verification fields
        user.isVerified = true;
        user.verificationOtp = null;
        user.verificationOtpExpire = null;
        await user.save({ validateBeforeSave: false });

        // Send welcome email in background
        sendWelcomeEmail(user.email, user.name).catch(() => {});

        // Dynamic System Notification
        try {
            await Notification.create({
                user: user._id,
                category: 'system',
                title: 'Account Verified! ✨',
                message: 'Welcome to E-Store! Your account has been verified and activated.',
                read: false,
            });
        } catch (notifErr) {
            console.error('Verify notification creation error:', notifErr);
        }

        return res.status(200).json({
            success: true,
            message: 'Email verified successfully! You can now login.',
            isVerified: true
        });

    } catch (error) {
        console.error('VerifyRegistrationOtp error:', error);
        return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

// ─────────────────────────────────────────────
//  POST /api/auth/resend-verification-otp
//  Body: { email }
//  → Resends a fresh 6-digit verification code with 5 minutes validity
// ─────────────────────────────────────────────
export const resendVerificationOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail }).select('+verificationOtp +verificationOtpExpire');

        if (!user) {
            return res.status(404).json({ success: false, message: 'Account not found with this email. Please register.' });
        }

        if (user.isVerified) {
            return res.status(400).json({ success: false, message: 'Account is already verified. Please login.' });
        }

        // Generate new 6-digit OTP and 5-minute expiry
        const otp = crypto.randomInt(100000, 1000000).toString();
        const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

        user.verificationOtp = hashedOtp;
        user.verificationOtpExpire = Date.now() + 5 * 60 * 1000; // 5 minutes
        await user.save({ validateBeforeSave: false });

        try {
            await sendVerificationEmail(user.email, user.name, otp);
        } catch (mailError) {
            console.error('Resend verification mail error:', mailError);
            return res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again.' });
        }

        return res.status(200).json({
            success: true,
            message: 'A new 6-digit verification code has been sent to your email (valid for 5 minutes).'
        });

    } catch (error) {
        console.error('ResendVerificationOtp error:', error);
        return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

// ─────────────────────────────────────────────
//  POST /api/auth/login
// ─────────────────────────────────────────────
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        // Fetch user with password field
        const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        // Google-only account check
        if (user.isGoogleLogin && !user.password) {
            return res.status(401).json({
                success: false,
                message: 'This account uses Google Sign-In. Please login with Google.'
            });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        // Check if user is verified
        if (user.isVerified === false) {
            return res.status(403).json({
                success: false,
                message: 'Your account is not verified. Please verify your email before logging in.',
                isUnverified: true,
                email: user.email
            });
        }

        const token = generateToken(user._id, user.role);

        return res.status(200).json({
            success: true,
            message: 'Login successful!',
            token,
            user: user.toJSON()
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

// ─────────────────────────────────────────────
//  GET /api/auth/me  (protected)
// ─────────────────────────────────────────────
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        return res.status(200).json({ success: true, user: user.toJSON() });
    } catch (error) {
        console.error('GetMe error:', error);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ─────────────────────────────────────────────
//  POST /api/auth/forgot-password
//  Body: { email }
//  → Generates 6-digit OTP, saves hashed OTP in DB, sends email
// ─────────────────────────────────────────────
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Please provide your email address.' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
            '+resetPasswordOtp +resetPasswordExpire +resetPasswordResendCount +resetPasswordResendWindowStart +resetPasswordLastSentAt +resetPasswordResendLockedUntil'
        );
        if (!user) {
            // Security: do not reveal whether email exists
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists, a reset code has been sent.'
            });
        }

        // Unverified user check
        if (user.isVerified === false) {
            return res.status(403).json({
                success: false,
                message: 'Your account is unverified. Unverified users cannot reset password. Please register or verify your account first.'
            });
        }

        const now = Date.now();
        const lockedUntil = user.resetPasswordResendLockedUntil?.getTime?.() || 0;
        if (lockedUntil > now) {
            const retryAfterSeconds = Math.ceil((lockedUntil - now) / 1000);
            return res.status(429).json({ success: false, retryAfterSeconds, message: 'You have used all 3 resend attempts. Please wait 15 minutes before requesting another code.' });
        }
        if (user.resetPasswordOtp && user.resetPasswordExpire?.getTime?.() > now) {
            return res.status(429).json({ success: false, message: 'A reset code was already sent. Please use the resend option after the countdown.' });
        }

        // Generate 6-digit OTP
        const otp = crypto.randomInt(100000, 1000000).toString(); // '123456'

        // Hash the OTP before storing (so plain OTP is never saved in DB)
        const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

        // Save hashed OTP + expiry (10 minutes)
        user.resetPasswordOtp = hashedOtp;
        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
        user.resetPasswordResendCount = 0;
        user.resetPasswordResendWindowStart = new Date();
        user.resetPasswordLastSentAt = new Date();
        user.resetPasswordResendLockedUntil = null;
        await user.save({ validateBeforeSave: false });

        try {
            await sendPasswordResetEmail(user.email, user.name, otp);
        } catch (mailError) {
            // Rollback OTP if email fails
            user.resetPasswordOtp = null;
            user.resetPasswordExpire = null;
            user.resetPasswordResendCount = 0;
            user.resetPasswordResendWindowStart = null;
            user.resetPasswordLastSentAt = null;
            user.resetPasswordResendLockedUntil = null;
            await user.save({ validateBeforeSave: false });
            console.error('Mail error:', mailError);
            return res.status(500).json({ success: false, message: 'Failed to send OTP email. Please try again.' });
        }

        return res.status(200).json({
            success: true,
            message: 'A 6-digit verification code has been sent to your email.'
        });

    } catch (error) {
        console.error('ForgotPassword error:', error);
        return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

// ─────────────────────────────────────────────
//  POST /api/auth/reset-password
//  Body: { email, otp, password, confirmPassword }
//  → Verifies OTP, resets password
// ─────────────────────────────────────────────
export const resetPassword = async (req, res) => {
    try {
        const { email, otp, password, confirmPassword } = req.body;

        if (!email || !otp || !password) {
            return res.status(400).json({ success: false, message: 'Email, OTP code and new password are required.' });
        }
        if (otp.length !== 6 || isNaN(Number(otp))) {
            return res.status(400).json({ success: false, message: 'OTP must be a 6-digit number.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }
        if (confirmPassword && password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }

        // Hash the incoming OTP to compare with stored hash
        const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

        const user = await User.findOne({
            email: email.toLowerCase().trim(),
            resetPasswordOtp: hashedOtp,
            resetPasswordExpire: { $gt: Date.now() }  // not expired
        }).select('+resetPasswordOtp +resetPasswordExpire');

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP. Please request a new code.'
            });
        }

        // Unverified user check
        if (user.isVerified === false) {
            return res.status(403).json({
                success: false,
                message: 'Your account is unverified. Password reset is not permitted.'
            });
        }

        // Set new password + clear OTP fields
        user.password = password;
        user.resetPasswordOtp = null;
        user.resetPasswordExpire = null;
        user.resetPasswordResendCount = 0;
        user.resetPasswordResendWindowStart = null;
        user.resetPasswordLastSentAt = null;
        user.resetPasswordResendLockedUntil = null;
        await user.save();

        const token = generateToken(user._id, user.role);

        return res.status(200).json({
            success: true,
            message: 'Password reset successfully! You are now logged in.',
            token,
            user: user.toJSON()
        });

    } catch (error) {
        console.error('ResetPassword error:', error);
        return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

// ─────────────────────────────────────────────
//  PUT /api/auth/update-profile  (protected)
// ─────────────────────────────────────────────
// Password reset OTP resend limits are account-scoped and persisted in MongoDB.
export const resendForgotPasswordOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Please provide your email address.' });

        const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
            '+resetPasswordOtp +resetPasswordExpire +resetPasswordResendCount +resetPasswordResendWindowStart +resetPasswordLastSentAt +resetPasswordResendLockedUntil'
        );
        if (!user) return res.status(200).json({ success: true, message: 'If an account with that email exists, a reset code has been sent.' });
        if (user.isVerified === false) {
            return res.status(403).json({ success: false, message: 'Your account is unverified. Please verify your account first.' });
        }

        const now = Date.now();
        const lockedUntil = user.resetPasswordResendLockedUntil?.getTime?.() || 0;
        if (lockedUntil > now) {
            const retryAfterSeconds = Math.ceil((lockedUntil - now) / 1000);
            return res.status(429).json({ success: false, retryAfterSeconds, message: 'You have used all 3 resend attempts. Please wait 15 minutes before requesting another code.' });
        }

        const lastSentAt = user.resetPasswordLastSentAt?.getTime?.() || 0;
        if (lastSentAt && now - lastSentAt < 10_000) {
            const retryAfterSeconds = Math.ceil((10_000 - (now - lastSentAt)) / 1000);
            return res.status(429).json({ success: false, retryAfterSeconds, message: `Please wait ${retryAfterSeconds} seconds before resending the code.` });
        }

        const windowStart = user.resetPasswordResendWindowStart?.getTime?.() || 0;
        if (!windowStart || now - windowStart >= 15 * 60 * 1000) {
            user.resetPasswordResendCount = 0;
            user.resetPasswordResendWindowStart = new Date(now);
            user.resetPasswordResendLockedUntil = null;
        }

        const previous = {
            otp: user.resetPasswordOtp,
            expires: user.resetPasswordExpire,
            count: user.resetPasswordResendCount,
            windowStart: user.resetPasswordResendWindowStart,
            lastSentAt: user.resetPasswordLastSentAt,
            lockedUntil: user.resetPasswordResendLockedUntil,
        };
        const otp = crypto.randomInt(100000, 1000000).toString();
        user.resetPasswordOtp = crypto.createHash('sha256').update(otp).digest('hex');
        user.resetPasswordExpire = new Date(now + 10 * 60 * 1000);
        user.resetPasswordResendCount += 1;
        user.resetPasswordLastSentAt = new Date(now);
        if (user.resetPasswordResendCount >= 3) user.resetPasswordResendLockedUntil = new Date(now + 15 * 60 * 1000);

        await user.save({ validateBeforeSave: false });
        try {
            await sendPasswordResetEmail(user.email, user.name, otp);
        } catch (mailError) {
            user.resetPasswordOtp = previous.otp;
            user.resetPasswordExpire = previous.expires;
            user.resetPasswordResendCount = previous.count;
            user.resetPasswordResendWindowStart = previous.windowStart;
            user.resetPasswordLastSentAt = previous.lastSentAt;
            user.resetPasswordResendLockedUntil = previous.lockedUntil;
            await user.save({ validateBeforeSave: false });
            console.error('Password reset OTP resend mail error:', mailError);
            return res.status(500).json({ success: false, message: 'Failed to send OTP email. Please try again.' });
        }

        return res.status(200).json({ success: true, message: 'A new password reset code has been sent to your email.', resendCount: user.resetPasswordResendCount });
    } catch (error) {
        console.error('ResendForgotPasswordOtp error:', error);
        return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { name, phone, address, image } = req.body;
        const user = await User.findById(req.user.id).select('+image_public_id');
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        if (name) user.name = name.trim();
        if (phone !== undefined) user.phone = phone?.trim() || null;
        if (address !== undefined) user.address = address?.trim() || null;
        if (image !== undefined && !req.file) user.image = image?.trim() || null;

        // Handle new profile image via file upload
        if (req.file) {
            // Delete old image from Cloudinary
            if (user.image_public_id) {
                await deleteFromCloudinary(user.image_public_id);
            }
            const result = await uploadToCloudinary(req.file.buffer, 'users');
            user.image = result.secure_url;
            user.image_public_id = result.public_id;
        }

        await user.save({ validateBeforeSave: false });

        // Dynamic System Notification
        try {
            await Notification.create({
                user: user._id,
                category: 'system',
                title: 'Profile Updated 👤',
                message: 'Your profile details were updated successfully.',
                read: false,
            });
        } catch {}

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully!',
            user: user.toJSON()
        });

    } catch (error) {
        console.error('UpdateProfile error:', error);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ─────────────────────────────────────────────
//  POST /api/auth/send-email-otp  (protected)
//  Body: { newEmail }
//  → Sends OTP to new email for verification
// ─────────────────────────────────────────────
export const sendEmailOtp = async (req, res) => {
    try {
        const { newEmail } = req.body;

        if (!newEmail) {
            return res.status(400).json({ success: false, message: 'New email is required.' });
        }

        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(newEmail)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
        }

        const normalizedEmail = newEmail.toLowerCase().trim();

        const currentUser = await User.findById(req.user.id);
        if (!currentUser) return res.status(404).json({ success: false, message: 'User not found.' });

        if (currentUser.email === normalizedEmail) {
            return res.status(400).json({ success: false, message: 'New email must be different from current email.' });
        }

        const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: currentUser._id } });
        if (existing) {
            return res.status(409).json({ success: false, message: 'This email is already in use by another account.' });
        }

        // Generate 6-digit OTP
        const otp = crypto.randomInt(100000, 1000000).toString();
        const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

        await User.findByIdAndUpdate(req.user.id, {
            emailChangeOtp: hashedOtp,
            emailChangeOtpExpire: Date.now() + 10 * 60 * 1000,
            pendingEmail: normalizedEmail,
        });

        try {
            await sendEmailChangeOtp(normalizedEmail, currentUser.name, otp);
        } catch (mailErr) {
            await User.findByIdAndUpdate(req.user.id, {
                emailChangeOtp: null,
                emailChangeOtpExpire: null,
                pendingEmail: null,
            });
            console.error('Email OTP send error:', mailErr);
            return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
        }

        return res.status(200).json({
            success: true,
            message: `A 6-digit verification code has been sent to ${normalizedEmail}.`
        });

    } catch (error) {
        console.error('SendEmailOtp error:', error);
        return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

// ─────────────────────────────────────────────
//  POST /api/auth/verify-email-otp  (protected)
//  Body: { otp }
//  → Verifies OTP and updates email to pendingEmail
// ─────────────────────────────────────────────
export const verifyEmailOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!otp || otp.length !== 6 || isNaN(Number(otp))) {
            return res.status(400).json({ success: false, message: 'OTP must be a 6-digit number.' });
        }

        const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

        const user = await User.findOne({
            _id: req.user.id,
            emailChangeOtp: hashedOtp,
            emailChangeOtpExpire: { $gt: Date.now() },
        }).select('+emailChangeOtp +emailChangeOtpExpire +pendingEmail');

        if (!user || !user.pendingEmail) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP. Please request a new code.'
            });
        }

        // Race condition guard
        const conflict = await User.findOne({ email: user.pendingEmail, _id: { $ne: user._id } });
        if (conflict) {
            await User.findByIdAndUpdate(req.user.id, {
                emailChangeOtp: null,
                emailChangeOtpExpire: null,
                pendingEmail: null,
            });
            return res.status(409).json({ success: false, message: 'This email was taken by another account. Please choose a different one.' });
        }

        // Apply email change + clear OTP fields
        user.email = user.pendingEmail;
        user.emailChangeOtp = null;
        user.emailChangeOtpExpire = null;
        user.pendingEmail = null;
        await user.save({ validateBeforeSave: false });

        // Dynamic System Notification
        try {
            await Notification.create({
                user: user._id,
                category: 'system',
                title: 'Profile Updated 👤',
                message: 'Your profile details were updated successfully.',
                read: false,
            });
        } catch {}

        return res.status(200).json({
            success: true,
            message: 'Email updated successfully!',
            user: user.toJSON()
        });

    } catch (error) {
        console.error('VerifyEmailOtp error:', error);
        return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

// ─────────────────────────────────────────────
//  PUT /api/auth/change-password  (protected)
// ─────────────────────────────────────────────
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new password are required.' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
        }

        const user = await User.findById(req.user.id).select('+password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
        }

        user.password = newPassword;
        await user.save();

        // Dynamic System Notification
        try {
            await Notification.create({
                user: user._id,
                category: 'system',
                title: 'Security Alert 🔐',
                message: 'Your account password was updated successfully.',
                read: false,
            });
        } catch {}

        return res.status(200).json({ success: true, message: 'Password changed successfully!' });

    } catch (error) {
        console.error('ChangePassword error:', error);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ─────────────────────────────────────────────
//  GET /api/auth/users
// ─────────────────────────────────────────────
export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: users.length,
            users: users.map(u => {
                const json = u.toJSON();
                if (json.isActive === undefined) json.isActive = true;
                return json;
            })
        });
    } catch (error) {
        console.error('GetAllUsers error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching users.' });
    }
};

// ─────────────────────────────────────────────
//  POST /api/auth/users  (Admin Create User/Customer)
// ─────────────────────────────────────────────
export const adminCreateUser = async (req, res) => {
    try {
        const { name, email, phone, address, role, password, isActive, image } = req.body;

        if (!name || !email) {
            return res.status(400).json({ success: false, message: 'Name and email are required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
        }

        let imageUrl = typeof image === 'string' && image.trim().length > 0 ? image.trim() : null;
        let imagePublicId = null;

        if (req.file) {
            try {
                const result = await uploadToCloudinary(req.file.buffer, 'users');
                imageUrl = result.secure_url;
                imagePublicId = result.public_id;
            } catch (err) {
                console.error('Cloudinary upload error in adminCreateUser:', err);
            }
        }

        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            phone: phone ? phone.trim() : null,
            address: address ? address.trim() : null,
            role: role === 'admin' ? 'admin' : 'user',
            isVerified: true,
            isActive: isActive === 'false' || isActive === false ? false : true,
            password: password && password.length >= 6 ? password : 'password123',
            image: imageUrl,
            image_public_id: imagePublicId,
        });

        return res.status(201).json({
            success: true,
            message: `Customer "${user.name}" created successfully!`,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('AdminCreateUser error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating user.' });
    }
};

// ─────────────────────────────────────────────
//  PUT /api/auth/users/:id  (Admin Update User)
// ─────────────────────────────────────────────
export const adminUpdateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('+image_public_id');
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        const { name, email, phone, address, role, password, isActive, image } = req.body;

        if (name) user.name = name.trim();
        if (email) {
            const normalizedEmail = email.toLowerCase().trim();
            if (normalizedEmail !== user.email) {
                const duplicate = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
                if (duplicate) {
                    return res.status(409).json({ success: false, message: 'Email is already taken by another account.' });
                }
                user.email = normalizedEmail;
            }
        }
        if (phone !== undefined) user.phone = phone ? phone.trim() : null;
        if (address !== undefined) user.address = address ? address.trim() : null;
        if (role && (role === 'admin' || role === 'user')) user.role = role;
        if (isActive !== undefined) {
            user.isActive = isActive === 'true' || isActive === true;
        }

        if (password && password.trim().length >= 6) {
            user.password = password.trim();
        }

        if (req.file) {
            if (user.image_public_id) {
                await deleteFromCloudinary(user.image_public_id).catch(() => {});
            }
            const result = await uploadToCloudinary(req.file.buffer, 'users');
            user.image = result.secure_url;
            user.image_public_id = result.public_id;
        } else if (image !== undefined) {
            user.image = image ? image.trim() : null;
        }

        await user.save();

        return res.status(200).json({
            success: true,
            message: `User "${user.name}" updated successfully!`,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('AdminUpdateUser error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating user.' });
    }
};

// ─────────────────────────────────────────────
//  PATCH /api/auth/users/:id/role
// ─────────────────────────────────────────────
export const toggleUserRole = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        user.role = user.role === 'admin' ? 'user' : 'admin';
        await user.save({ validateBeforeSave: false });

        // Dynamic System Notification
        try {
            await Notification.create({
                user: user._id,
                category: 'system',
                title: 'Profile Updated 👤',
                message: 'Your profile details were updated successfully.',
                read: false,
            });
        } catch {}

        return res.status(200).json({
            success: true,
            message: `User role updated to ${user.role}!`,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('ToggleUserRole error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating role.' });
    }
};

// ─────────────────────────────────────────────
//  PATCH /api/auth/users/:id/status (Toggle Active / Blocked)
// ─────────────────────────────────────────────
export const toggleUserStatus = async (req, res) => {
    try {
        if (req.user?.id === req.params.id) {
            return res.status(400).json({ success: false, message: 'You cannot block your own admin account.' });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        user.isActive = user.isActive === false ? true : false;
        await user.save({ validateBeforeSave: false });

        const statusLabel = user.isActive ? 'Active' : 'Blocked';
        return res.status(200).json({
            success: true,
            message: `User account is now ${statusLabel}!`,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('ToggleUserStatus error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating user status.' });
    }
};

// ─────────────────────────────────────────────
//  DELETE /api/auth/users/:id
// ─────────────────────────────────────────────
export const deleteUser = async (req, res) => {
    try {
        if (req.user?.id === req.params.id) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own admin account.' });
        }

        const user = await User.findById(req.params.id).select('+image_public_id');
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        if (user.image_public_id) {
            await deleteFromCloudinary(user.image_public_id).catch(() => {});
        }

        await User.findByIdAndDelete(req.params.id);

        return res.status(200).json({
            success: true,
            message: 'User deleted successfully.'
        });
    } catch (error) {
        console.error('DeleteUser error:', error);
        return res.status(500).json({ success: false, message: 'Server error deleting user.' });
    }
};


// ─────────────────────────────────────────────
//  POST /api/auth/google
//  → Verifies Google OAuth access token, finds or creates user, returns JWT
// ─────────────────────────────────────────────
export const googleLogin = async (req, res) => {
    try {
        const { accessToken } = req.body;

        if (!accessToken) {
            return res.status(400).json({ success: false, message: 'Google access token is required.' });
        }

        // Fetch Google user info using the access token
        const googleRes = await fetch(
            `https://www.googleapis.com/oauth2/v3/userinfo`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!googleRes.ok) {
            return res.status(401).json({ success: false, message: 'Invalid Google access token.' });
        }

        const googleUser = await googleRes.json();
        const { email, name, picture, sub: googleId } = googleUser;

        if (!email || googleUser.email_verified !== true) {
            return res.status(400).json({ success: false, message: 'Could not retrieve email from Google account.' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Find or create user
        let user = await User.findOne({ email: normalizedEmail });

        if (user) {
            // If user exists but is blocked, deny access
            if (user.isActive === false) {
                return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact support.' });
            }
            // Update Google login flag and profile picture if not set
            if (!user.isGoogleLogin) user.isGoogleLogin = true;
            if (!user.image && picture) user.image = picture;
            if (!user.isVerified) user.isVerified = true;
            await user.save({ validateBeforeSave: false });
        } else {
            // Create new user from Google data — no password needed
            user = await User.create({
                name: name || 'Google User',
                email: normalizedEmail,
                image: picture || null,
                isGoogleLogin: true,
                isVerified: true,
                role: 'user',
            });
        }

        const token = generateToken(user._id);

        return res.status(200).json({
            success: true,
            message: 'Google login successful!',
            token,
            user: user.toJSON(),
        });
    } catch (error) {
        console.error('GoogleLogin error:', error);
        return res.status(500).json({ success: false, message: 'Server error during Google login.' });
    }
};
