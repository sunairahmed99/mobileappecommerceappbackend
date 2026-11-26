import { jest, test, beforeEach, afterEach, expect } from '@jest/globals';
import request from 'supertest';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import app from '../app.js';
import User from '../Models/userModel.js';
import Notification from '../Models/notificationModel.js';
import { generateToken } from '../config/jwt.js';

const uid = '507f1f77bcf86cd799439011';
const chain = value => ({ select: () => Promise.resolve(value), then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
let user, save;
beforeEach(() => {
    user = new User({ _id: uid, name: 'QA', email: 'qa@example.test', role: 'user', isActive: true, isVerified: true });
    save = jest.spyOn(user, 'save').mockResolvedValue(user);
    jest.spyOn(User, 'findById').mockImplementation(() => chain(user));
    jest.spyOn(User, 'findOne').mockImplementation(() => chain(user));
    jest.spyOn(Notification, 'create').mockResolvedValue({});
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail: jest.fn().mockResolvedValue({}) });
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('registration ignores forged admin role and verification status', async () => {
    User.findOne.mockImplementation(() => chain(null));
    const create = jest.spyOn(User, 'create').mockImplementation(async payload => new User({ _id: uid, ...payload }));
    const response = await request(app).post('/api/auth/register').send({ name: 'QA', email: 'new@example.test', password: 'long-password', role: 'admin', isVerified: true });
    expect(response.status).toBe(201);
    expect(create.mock.calls[0][0].role).toBeUndefined();
    expect(create.mock.calls[0][0].isVerified).toBe(false);
    expect(response.body.token).toBeUndefined();
    expect(response.body.user).toBeUndefined();
});
test('profile update cannot elevate role, change email without OTP, or enable a disabled account', async () => {
    const response = await request(app).put('/api/auth/update-profile').set('Authorization', 'Bearer ' + generateToken(uid, 'user'))
        .send({ name: 'Updated', role: 'admin', isVerified: false, isActive: false, email: 'attacker@example.test', password: 'injected-password' });
    expect(response.status).toBe(200);
    expect(user.name).toBe('Updated');
    expect(user.role).toBe('user');
    expect(user.email).toBe('qa@example.test');
    expect(user.isActive).toBe(true);
    expect(user.isVerified).toBe(true);
    expect(user.password).toBeUndefined();
});
test('password change requires proof of current password', async () => {
    jest.spyOn(user, 'comparePassword').mockResolvedValue(false);
    const response = await request(app).put('/api/auth/change-password').set('Authorization', 'Bearer ' + generateToken(uid, 'user'))
        .send({ currentPassword: 'wrong', newPassword: 'long-password' });
    expect(response.status).toBe(401);
    expect(save).not.toHaveBeenCalled();
});
test('incorrect registration OTP never activates an account', async () => {
    user.isVerified = false;
    user.verificationOtp = crypto.createHash('sha256').update('123456').digest('hex');
    user.verificationOtpExpire = new Date(Date.now() + 100000);
    const response = await request(app).post('/api/auth/verify-registration-otp').send({ email: user.email, otp: '654321' });
    expect(response.status).toBe(400);
    expect(user.isVerified).toBe(false);
    expect(save).not.toHaveBeenCalled();
});
test('expired registration OTP is rejected even when the code matches', async () => {
    user.isVerified = false;
    user.verificationOtp = crypto.createHash('sha256').update('123456').digest('hex');
    user.verificationOtpExpire = new Date(Date.now() - 10000);
    const response = await request(app).post('/api/auth/verify-registration-otp').send({ email: user.email, otp: '123456' });
    expect(response.status).toBe(400);
    expect(response.body.isExpired).toBe(true);
    expect(save).not.toHaveBeenCalled();
});
test('valid OTP is consumed and its hash is never returned', async () => {
    user.isVerified = false;
    user.verificationOtp = crypto.createHash('sha256').update('123456').digest('hex');
    user.verificationOtpExpire = new Date(Date.now() + 100000);
    const response = await request(app).post('/api/auth/verify-registration-otp').send({ email: user.email, otp: '123456' });
    expect(response.status).toBe(200);
    expect(user.isVerified).toBe(true);
    expect(user.verificationOtp).toBeNull();
    expect(user.verificationOtpExpire).toBeNull();
    expect(response.text).not.toContain('123456');
});
test('password reset queries a hashed OTP and enforces server-side expiry', async () => {
    User.findOne.mockImplementation(() => chain(null));
    const response = await request(app).post('/api/auth/reset-password').send({ email: user.email, otp: '123456', password: 'long-password' });
    expect(response.status).toBe(400);
    const query = User.findOne.mock.calls[0][0];
    expect(query.resetPasswordOtp).toBe(crypto.createHash('sha256').update('123456').digest('hex'));
    expect(query.resetPasswordExpire.$gt).toBeGreaterThan(Date.now() - 5000);
    expect(save).not.toHaveBeenCalled();
});
test('password hashing and comparison work without a database', async () => {
    const model = new User({ name: 'QA', email: 'qa@example.test', password: 'long-password' });
    await User.schema.s.hooks.execPre('save', model, []);
    expect(model.password).toMatch(/^\$2[aby]\$/);
    expect(await model.comparePassword('long-password')).toBe(true);
    expect(await model.comparePassword('wrong')).toBe(false);
    expect(model.toJSON().password).toBeUndefined();
});

test('Google sign-in verifies the configured audience and creates a customer linked by subject', async () => {
    const previousAudience = process.env.GOOGLE_SERVER_CLIENT_ID;
    process.env.GOOGLE_SERVER_CLIENT_ID = 'android-backend.apps.googleusercontent.com';
    try {
        const config = await request(app).get('/api/auth/google/config');
        expect(config.status).toBe(200);
        expect(config.body).toEqual({ success: true, clientId: process.env.GOOGLE_SERVER_CLIENT_ID });
        const verify = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
            getPayload: () => ({ sub: 'google-subject', email: 'qa@gmail.com', email_verified: true, name: 'QA' }),
        });
        User.findOne.mockImplementation(() => chain(null));
        const create = jest.spyOn(User, 'create').mockImplementation(async payload => new User({ _id: uid, ...payload }));
        const response = await request(app).post('/api/auth/google').send({ idToken: 'test-id-token' });
        expect(response.status).toBe(200);
        expect(verify).toHaveBeenCalledWith({ idToken: 'test-id-token', audience: process.env.GOOGLE_SERVER_CLIENT_ID });
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ googleId: 'google-subject', role: 'user' }));
        expect(response.body.token).toEqual(expect.any(String));
        expect(response.body.user.googleId).toBeUndefined();
    } finally {
        if (previousAudience === undefined) delete process.env.GOOGLE_SERVER_CLIENT_ID;
        else process.env.GOOGLE_SERVER_CLIENT_ID = previousAudience;
    }
});

test('Google sign-in rejects a token that fails audience verification before looking up users', async () => {
    const previousAudience = process.env.GOOGLE_SERVER_CLIENT_ID;
    process.env.GOOGLE_SERVER_CLIENT_ID = 'android-backend.apps.googleusercontent.com';
    try {
        jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockRejectedValue(new Error('Wrong recipient'));
        const response = await request(app).post('/api/auth/google').send({ idToken: 'wrong-audience' });
        expect(response.status).toBe(401);
        expect(User.findOne).not.toHaveBeenCalled();
    } finally {
        if (previousAudience === undefined) delete process.env.GOOGLE_SERVER_CLIENT_ID;
        else process.env.GOOGLE_SERVER_CLIENT_ID = previousAudience;
    }
});
