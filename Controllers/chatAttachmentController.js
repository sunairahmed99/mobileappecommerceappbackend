import mongoose from 'mongoose';
import Message from '../Models/messageModel.js';
import User from '../Models/userModel.js';
import { getIO } from '../socket.js';
import { describeChatFile, storeChatFile, removeChatFile, chatFileUrl } from '../services/chatAttachments.js';

export async function sendChatAttachment(req, res, next) {
    let attachment;
    let saved = false;
    try {
        const { userId } = req.params;
        if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ success: false, message: 'Invalid customer ID.' });
        if (!await User.exists({ _id: userId })) return res.status(404).json({ success: false, message: 'Customer not found.' });
        const metadata = describeChatFile(req.file, req.body.kind, req.body.duration);
        const uploaded = await storeChatFile(req.file.buffer, metadata.kind);
        attachment = { ...metadata, publicId: uploaded.public_id, resourceType: uploaded.resource_type, format: uploaded.format };
        const text = typeof req.body.text === 'string' ? req.body.text.trim().slice(0, 500) : '';
        const message = await Message.create({
            user: userId, sender: 'admin', senderName: req.user.name || 'Store Admin',
            text: text || (metadata.kind === 'image' ? 'Photo' : metadata.kind === 'audio' ? 'Voice message' : `File: ${metadata.name}`),
            attachment, readByAdmin: true, readByUser: false,
        });
        saved = true;
        // Persisted messages remain available in history even if the socket server is restarting.
        try {
            const io = getIO();
            io.to(`user_${userId}`).emit('new_message', message);
            io.to('admin_room').emit('new_message', message);
            io.to('admin_room').emit('conversation_updated', { userId, lastMessage: message.text, lastCreatedAt: message.createdAt, sender: 'admin' });
        } catch { /* The next history request retrieves the saved attachment. */ }
        return res.status(201).json({ success: true, message });
    } catch (error) {
        if (attachment && !saved) await removeChatFile(attachment).catch(() => {});
        next(error);
    }
}

export async function getChatAttachment(req, res, next) {
    try {
        if (!mongoose.isValidObjectId(req.params.messageId)) return res.status(400).json({ success: false, message: 'Invalid message ID.' });
        const message = await Message.findById(req.params.messageId);
        if (!message?.attachment) return res.status(404).json({ success: false, message: 'Attachment not found.' });
        if (req.user.role !== 'admin' && String(message.user) !== String(req.user.id)) return res.status(403).json({ success: false, message: 'Access denied.' });
        const upstream = await fetch(chatFileUrl(message.attachment), { signal: AbortSignal.timeout(30000) });
        if (!upstream.ok) return res.status(502).json({ success: false, message: 'Unable to load this attachment. Please retry.' });
        const bytes = Buffer.from(await upstream.arrayBuffer());
        const { mimeType, name, kind } = message.attachment;
        res.set('Cache-Control', 'private, no-store');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Type', mimeType || 'application/octet-stream');
        res.set('Content-Disposition', `${kind === 'file' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name || 'attachment')}`);
        const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        if (range) {
            const start = Number(range[1]);
            const end = Math.min(bytes.length - 1, range[2] ? Number(range[2]) : bytes.length - 1);
            if (start > end || start >= bytes.length) return res.status(416).set('Content-Range', `bytes */${bytes.length}`).end();
            return res.status(206).set('Accept-Ranges', 'bytes').set('Content-Range', `bytes ${start}-${end}/${bytes.length}`).send(bytes.subarray(start, end + 1));
        }
        return res.set('Accept-Ranges', 'bytes').send(bytes);
    } catch (error) { next(error); }
}
