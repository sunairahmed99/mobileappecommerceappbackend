import { jest, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../app.js';
import User from '../Models/userModel.js';
import Message from '../Models/messageModel.js';
import cloudinary from '../config/cloudinary.js';
import { generateToken } from '../config/jwt.js';
import { describeChatFile, MAX_CHAT_FILE_SIZE } from '../services/chatAttachments.js';

const adminId = '507f1f77bcf86cd799439011';
const customerId = '507f1f77bcf86cd799439012';
const messageId = '507f1f77bcf86cd799439013';
const auth = () => `Bearer ${generateToken(adminId, 'admin')}`;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
beforeEach(() => {
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: adminId, role: 'admin', name: 'Admin', isActive: true, isVerified: true });
    jest.spyOn(User, 'exists').mockResolvedValue({ _id: customerId });
});
afterEach(() => jest.restoreAllMocks());

test('attachment uploads require an authenticated admin', async () => {
    expect((await request(app).post(`/api/chat/${customerId}/attachments`)).status).toBe(401);
    User.findById.mockResolvedValue({ _id: customerId, role: 'user', isActive: true, isVerified: true });
    expect((await request(app).post(`/api/chat/${customerId}/attachments`).set('Authorization', auth())).status).toBe(403);
});

test('photo uploads are private, persist as messages, and hide storage identifiers', async () => {
    const upload = jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((options, callback) => {
        expect(options.type).toBe('authenticated');
        expect(options.resource_type).toBe('image');
        return { end() { callback(null, { public_id: 'chat-media/photo', resource_type: 'image' }); } };
    });
    jest.spyOn(Message, 'create').mockImplementation(async (data) => new Message({ _id: messageId, ...data }));
    const response = await request(app).post(`/api/chat/${customerId}/attachments`).set('Authorization', auth())
        .field('kind', 'image').field('text', 'Your parcel').attach('file', png, { filename: 'parcel.png', contentType: 'image/png' });
    expect(response.status).toBe(201);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(response.body.message).toMatchObject({ sender: 'admin', text: 'Your parcel', attachment: { kind: 'image', mimeType: 'image/png' } });
    expect(response.body.message.attachment.publicId).toBeUndefined();
    expect(response.body.message.attachment.resourceType).toBeUndefined();
});

test('spoofed images and oversized files are rejected', async () => {
    expect(() => describeChatFile({ buffer: Buffer.from('not an image'), originalname: 'fake.png' }, 'image')).toThrow(/not supported/);
    expect(() => describeChatFile({ buffer: Buffer.alloc(MAX_CHAT_FILE_SIZE + 1) }, 'file')).toThrow(/20 MB/);
    expect((await request(app).post(`/api/chat/${customerId}/attachments`).set('Authorization', auth())
        .field('kind', 'image').attach('file', Buffer.from('fake'), 'fake.png')).status).toBe(400);
});

test.each([
    ['audio', Buffer.from([0, 0, 0, 16, ...Buffer.from('ftypM4A ')]), 'voice.m4a', 'video'],
    ['file', Buffer.from('%PDF-1.7 test document'), 'invoice.pdf', 'raw'],
])('%s attachments are stored and returned with their media metadata', async (kind, bytes, filename, resourceType) => {
    jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((options, callback) => {
        expect(options.resource_type).toBe(resourceType);
        return { end() { callback(null, { public_id: 'chat-media/test', resource_type: resourceType, format: kind === 'audio' ? 'm4a' : undefined }); } };
    });
    jest.spyOn(Message, 'create').mockImplementation(async (data) => new Message({ _id: messageId, ...data }));
    const response = await request(app).post(`/api/chat/${customerId}/attachments`).set('Authorization', auth())
        .field('kind', kind).field('duration', '3000').attach('file', bytes, filename);
    expect(response.status).toBe(201);
    expect(response.body.message.attachment).toMatchObject({ kind, name: filename, size: bytes.length });
    if (kind === 'audio') expect(response.body.message.attachment.duration).toBe(3000);
});

test('database failure removes the uploaded orphan file', async () => {
    jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((_options, callback) => ({ end() { callback(null, { public_id: 'orphan', resource_type: 'image' }); } }));
    const destroy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
    jest.spyOn(Message, 'create').mockRejectedValue(new Error('Database unavailable'));
    expect((await request(app).post(`/api/chat/${customerId}/attachments`).set('Authorization', auth()).field('kind', 'image').attach('file', png, 'photo.png')).status).toBe(500);
    expect(destroy).toHaveBeenCalledWith('orphan', { resource_type: 'image', type: 'authenticated' });
});

test('customers cannot download another customer attachment', async () => {
    User.findById.mockResolvedValue({ _id: adminId, role: 'user', isActive: true, isVerified: true });
    jest.spyOn(Message, 'findById').mockResolvedValue({ user: customerId, attachment: { publicId: 'private' } });
    const upstream = jest.spyOn(globalThis, 'fetch');
    expect((await request(app).get(`/api/chat/attachments/${messageId}`).set('Authorization', auth())).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
});

test('authorized audio downloads support byte ranges for Android playback', async () => {
    jest.spyOn(Message, 'findById').mockResolvedValue({ user: customerId, attachment: { publicId: 'voice', resourceType: 'video', kind: 'audio', mimeType: 'audio/mp4', name: 'voice.m4a' } });
    jest.spyOn(cloudinary, 'url').mockReturnValue('https://example.test/private-audio');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([0, 1, 2, 3, 4])));
    const response = await request(app).get(`/api/chat/attachments/${messageId}`).set('Authorization', auth()).set('Range', 'bytes=1-3');
    expect(response.status).toBe(206);
    expect(response.headers['content-range']).toBe('bytes 1-3/5');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect([...response.body]).toEqual([1, 2, 3]);
});
