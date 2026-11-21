import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// ── Create reusable transporter ──
const createTransporter = () => {
    return nodemailer.createTransport({
        service: 'gmail',
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASSWORD
        }
    });
};

// ── Send Password Reset OTP Email ──
export const sendPasswordResetEmail = async (toEmail, userName, otp) => {
    const transporter = createTransporter();

    const mailOptions = {
        from: `"E-Store Support" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: 'Your Password Reset Code – E-Store',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 0;">
                <div style="background: linear-gradient(135deg, #06b6d4, #3b82f6); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700;">🔐 Password Reset Code</h1>
                    <p style="color: rgba(255,255,255,0.85); margin-top: 8px; font-size: 14px;">E-Store Account Security</p>
                </div>
                <div style="background: #ffffff; padding: 36px 30px; text-align: center;">
                    <p style="color: #374151; font-size: 16px; margin: 0 0 8px; text-align: left;">Hi <strong>${userName}</strong>,</p>
                    <p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 28px; text-align: left;">
                        We received a request to reset your password. Use the code below to verify your identity.
                        This code is valid for <strong>10 minutes</strong>.
                    </p>
                    <div style="background: #f0fdfe; border: 2px dashed #06b6d4; border-radius: 16px; padding: 28px 20px; margin: 0 auto 28px; max-width: 300px;">
                        <p style="margin: 0 0 6px; color: #64748b; font-size: 13px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">Your Verification Code</p>
                        <p style="margin: 0; font-size: 42px; font-weight: 800; letter-spacing: 10px; color: #06b6d4; font-family: 'Courier New', monospace;">${otp}</p>
                    </div>
                    <p style="color: #9ca3af; font-size: 13px; margin: 0 0 6px; text-align: left; line-height: 1.6;">
                        Enter this code in the app to reset your password.
                    </p>
                    <p style="color: #9ca3af; font-size: 13px; margin: 0; text-align: left; line-height: 1.6;">
                        If you didn't request a password reset, please ignore this email — your account is safe.
                    </p>
                </div>
                <div style="background: #f3f4f6; padding: 20px 30px; text-align: center; border-radius: 0 0 12px 12px;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} E-Store. All rights reserved.</p>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

// ── Send Email Change OTP ──
export const sendEmailChangeOtp = async (toEmail, userName, otp) => {
    const transporter = createTransporter();

    const mailOptions = {
        from: `"E-Store Security" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: 'Verify Your New Email – E-Store',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 0;">
                <div style="background: linear-gradient(135deg, #10b981, #2563eb); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700;">📧 Email Verification Code</h1>
                    <p style="color: rgba(255,255,255,0.85); margin-top: 8px; font-size: 14px;">E-Store Account Security</p>
                </div>
                <div style="background: #ffffff; padding: 36px 30px; text-align: center;">
                    <p style="color: #374151; font-size: 16px; margin: 0 0 8px; text-align: left;">Hi <strong>${userName}</strong>,</p>
                    <p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 28px; text-align: left;">
                        You requested to update your email address. Use the code below to verify this new email.
                        This code is valid for <strong>10 minutes</strong>.
                    </p>
                    <div style="background: #ecfdf5; border: 2px dashed #10b981; border-radius: 16px; padding: 28px 20px; margin: 0 auto 28px; max-width: 300px;">
                        <p style="margin: 0 0 6px; color: #64748b; font-size: 13px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">Your Verification Code</p>
                        <p style="margin: 0; font-size: 42px; font-weight: 800; letter-spacing: 10px; color: #10b981; font-family: 'Courier New', monospace;">${otp}</p>
                    </div>
                    <p style="color: #9ca3af; font-size: 13px; margin: 0 0 6px; text-align: left; line-height: 1.6;">
                        Enter this code in the app to confirm your new email address.
                    </p>
                    <p style="color: #9ca3af; font-size: 13px; margin: 0; text-align: left; line-height: 1.6;">
                        If you didn't request this change, please ignore this email — your account remains secure.
                    </p>
                </div>
                <div style="background: #f3f4f6; padding: 20px 30px; text-align: center; border-radius: 0 0 12px 12px;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} E-Store. All rights reserved.</p>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

// ── Send Registration Verification OTP Email (Valid for 5 minutes) ──
export const sendVerificationEmail = async (toEmail, userName, otp) => {
    const transporter = createTransporter();

    const mailOptions = {
        from: `"E-Store Verification" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: 'Your Account Verification Code – E-Store',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 0;">
                <div style="background: linear-gradient(135deg, #4f46e5, #06b6d4); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700;">✨ Account Verification</h1>
                    <p style="color: rgba(255,255,255,0.9); margin-top: 8px; font-size: 14px;">Welcome to E-Store</p>
                </div>
                <div style="background: #ffffff; padding: 36px 30px; text-align: center;">
                    <p style="color: #374151; font-size: 16px; margin: 0 0 8px; text-align: left;">Hi <strong>${userName}</strong>,</p>
                    <p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 28px; text-align: left;">
                        Thank you for registering with E-Store! To complete your registration and activate your account, please enter the 6-digit verification code below.
                    </p>
                    <div style="background: #eef2ff; border: 2px dashed #6366f1; border-radius: 16px; padding: 28px 20px; margin: 0 auto 24px; max-width: 320px;">
                        <p style="margin: 0 0 6px; color: #4f46e5; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Your Verification Code</p>
                        <p style="margin: 0; font-size: 42px; font-weight: 800; letter-spacing: 10px; color: #4338ca; font-family: 'Courier New', monospace;">${otp}</p>
                    </div>
                    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 0 auto 24px; text-align: left;">
                        <p style="margin: 0; color: #b45309; font-size: 13px; font-weight: 600;">
                            ⚠️ Important: This code is valid for <strong>5 minutes only</strong>.
                        </p>
                    </div>
                    <p style="color: #9ca3af; font-size: 13px; margin: 0; text-align: left; line-height: 1.6;">
                        If you did not register for an account with E-Store, you can safely ignore this email.
                    </p>
                </div>
                <div style="background: #f3f4f6; padding: 20px 30px; text-align: center; border-radius: 0 0 12px 12px;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} E-Store. All rights reserved.</p>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

// ── Send Welcome Email ──
export const sendWelcomeEmail = async (toEmail, userName) => {
    const transporter = createTransporter();

    const mailOptions = {
        from: `"E-Store" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: 'Welcome to E-Store! 🎉',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 0;">
                <div style="background: linear-gradient(135deg, #06b6d4, #3b82f6); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700;">🎉 Welcome to E-Store!</h1>
                </div>
                <div style="background: #ffffff; padding: 36px 30px;">
                    <p style="color: #374151; font-size: 16px; margin: 0 0 12px;">Hi <strong>${userName}</strong>,</p>
                    <p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                        Your account has been created successfully. Start shopping and enjoy the best deals!
                    </p>
                </div>
                <div style="background: #f3f4f6; padding: 20px 30px; text-align: center; border-radius: 0 0 12px 12px;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} E-Store. All rights reserved.</p>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

// ── Send Order Confirmation Email with Details ──
export const sendOrderConfirmationEmail = async (toEmail, userName, order) => {
    const transporter = createTransporter();
    const text = [
        `Hello ${userName},`,
        `Your order ${order.orderNumber} has been received.`,
        ...order.items.map(item => `${item.name}${item.size ? ` / ${item.size}` : ''}${item.color ? ` / ${item.color}` : ''} x ${item.qty}: $${Number(item.price * item.qty).toFixed(0)}`),
        `Subtotal: $${Number(order.subtotal || 0).toFixed(0)}`,
        `Discount: $${Number(order.discount || 0).toFixed(0)}`,
        `Shipping: $${Number(order.shippingFee || 0).toFixed(0)}`,
        `Tax: $${Number(order.tax || 0).toFixed(0)}`,
        `Total: $${Number(order.totalAmount || 0).toFixed(0)}`,
        `Delivery: ${order.shippingAddress.fullName}, ${order.shippingAddress.address}, ${order.shippingAddress.city}`,
        `Phone: ${order.shippingAddress.phone}`,
        `Payment method: ${order.paymentMethod}`,
        `Payment status: ${order.paymentStatus || 'Pending'}`,
        `Order status: ${order.status}`,
    ].join('\n');
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
    userName = escapeHtml(userName);
    order = {
        ...order,
        items: order.items.map(item => ({ ...item, name: escapeHtml(item.name), size: escapeHtml(item.size), color: escapeHtml(item.color) })),
        shippingAddress: Object.fromEntries(Object.entries(order.shippingAddress).map(([key, value]) => [key, escapeHtml(value)])),
        paymentMethod: escapeHtml(order.paymentMethod),
    };

    const itemsHtml = (order.items || []).map((item) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px 8px; text-align: left; vertical-align: middle;">
                <strong style="color: #1e293b; font-size: 14px;">${item.name}</strong>
                ${item.size ? `<span style="display: block; color: #64748b; font-size: 12px;">Size: ${item.size}</span>` : ''}
                ${item.color ? `<span style="display: block; color: #64748b; font-size: 12px;">Color: ${item.color}</span>` : ''}
            </td>
            <td style="padding: 12px 8px; text-align: center; color: #475569; font-size: 14px; vertical-align: middle;">
                ${item.qty}
            </td>
            <td style="padding: 12px 8px; text-align: right; color: #1e293b; font-weight: 600; font-size: 14px; vertical-align: middle;">
                $${Number(item.price * item.qty).toFixed(0)}
            </td>
        </tr>
    `).join('');

    const formattedDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const mailOptions = {
        from: `"E-Store Orders" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: `Order Confirmed! #${order.orderNumber} – E-Store 🛍️`,
        text,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #f8fafc; padding: 16px 0;">
                <div style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #2563eb, #1d4ed8); padding: 36px 28px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0 0 6px; font-size: 24px; font-weight: 800;">🛍️ Order Confirmed!</h1>
                        <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 14px;">Thank you for shopping with E-Store</p>
                    </div>

                    <!-- Intro -->
                    <div style="padding: 24px 28px 12px;">
                        <p style="color: #1e293b; font-size: 16px; margin: 0 0 8px;">Hi <strong>${userName}</strong>,</p>
                        <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
                            We have received your order <strong>#${order.orderNumber}</strong> and it is now being prepared. Below are your full order details:
                        </p>

                        <!-- Order Info Box -->
                        <table style="width: 100%; background: #f1f5f9; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px;">
                            <tr>
                                <td>
                                    <span style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700;">Order ID</span>
                                    <div style="font-size: 16px; font-weight: 800; color: #2563eb;">#${order.orderNumber}</div>
                                </td>
                                <td style="text-align: right;">
                                    <span style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700;">Date</span>
                                    <div style="font-size: 13px; font-weight: 600; color: #334155;">${formattedDate}</div>
                                </td>
                            </tr>
                        </table>

                        <!-- Items Table -->
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <thead>
                                <tr style="border-bottom: 2px solid #cbd5e1; background: #f8fafc;">
                                    <th style="padding: 10px 8px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Product</th>
                                    <th style="padding: 10px 8px; text-align: center; font-size: 12px; color: #475569; text-transform: uppercase;">Qty</th>
                                    <th style="padding: 10px 8px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                        </table>

                        <!-- Calculation breakdown -->
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
                            <table style="width: 100%; font-size: 14px; color: #475569;">
                                <tr>
                                    <td style="padding: 4px 0;">Subtotal</td>
                                    <td style="padding: 4px 0; text-align: right;">$${Number(order.subtotal || 0).toFixed(0)}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 4px 0;">Shipping Fee</td>
                                    <td style="padding: 4px 0; text-align: right;">${Number(order.shippingFee || 0) === 0 ? '<strong style="color: #16a34a;">FREE</strong>' : `$${Number(order.shippingFee).toFixed(0)}`}</td>
                                </tr>
                                ${order.discount ? `
                                <tr>
                                    <td style="padding: 4px 0; color: #16a34a;">Discount</td>
                                    <td style="padding: 4px 0; text-align: right; color: #16a34a;">-$${Number(order.discount).toFixed(0)}</td>
                                </tr>` : ''}
                                <tr>
                                    <td style="padding: 4px 0;">Tax</td>
                                    <td style="padding: 4px 0; text-align: right;">$${Number(order.tax || 0).toFixed(0)}</td>
                                </tr>
                                <tr>
                                    <td colspan="2" style="border-top: 2px dashed #cbd5e1; padding-top: 10px; font-size: 18px; font-weight: 800; color: #0f172a;">
                                        <table style="width: 100%;">
                                            <tr>
                                                <td style="font-size: 17px; font-weight: 800; color: #0f172a;">Total Amount</td>
                                                <td style="text-align: right; font-size: 18px; font-weight: 800; color: #2563eb;">$${Number(order.totalAmount || 0).toFixed(0)}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </div>

                        <!-- Delivery & Payment Info -->
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
                            <h3 style="margin: 0 0 10px; font-size: 15px; color: #0f172a; font-weight: 700;">📍 Delivery & Payment Details</h3>
                            <p style="margin: 0 0 4px; font-size: 13px; color: #334155;"><strong>Recipient:</strong> ${order.shippingAddress?.fullName || userName}</p>
                            <p style="margin: 0 0 4px; font-size: 13px; color: #334155;"><strong>Phone:</strong> ${order.shippingAddress?.phone || 'N/A'}</p>
                            <p style="margin: 0 0 4px; font-size: 13px; color: #334155;"><strong>Address:</strong> ${order.shippingAddress?.address || ''}, ${order.shippingAddress?.city || ''} ${order.shippingAddress?.landmark ? `(${order.shippingAddress.landmark})` : ''}</p>
                            <p style="margin: 0; font-size: 13px; color: #334155;"><strong>Payment Method:</strong> ${order.paymentMethod || 'Cash on Delivery'}</p>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div style="background: #f1f5f9; padding: 20px 28px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="color: #64748b; font-size: 13px; margin: 0 0 4px;">Thank you for your trust in E-Store!</p>
                        <p style="color: #94a3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} E-Store. All rights reserved.</p>
                    </div>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};
