import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('chatRoutes');
import express from 'express';
import Message from '../Models/messageModel.js';
import User from '../Models/userModel.js';
import { protect, adminOnly, optionalProtect } from '../config/jwt.js';
import multer from 'multer';
import { MAX_CHAT_FILE_SIZE } from '../services/chatAttachments.js';
import { sendChatAttachment, getChatAttachment } from '../Controllers/chatAttachmentController.js';
import { chatAssistant } from '../Controllers/chatAssistantController.js';
import { rateLimit } from '../middleware/security.js';

const router = express.Router();
const chatUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CHAT_FILE_SIZE, files: 1, fields: 4, parts: 5 } });
router.post('/assistant', rateLimit({ windowMs: 60 * 1000, max: 12, message: 'Too many assistant requests. Please wait a minute and try again.' }), optionalProtect, chatAssistant);
router.post('/:userId/attachments', protect, adminOnly, chatUpload.single('file'), sendChatAttachment);
router.get('/attachments/:messageId', protect, getChatAttachment);

// GET /api/chat/history/:userId - Get conversation history
router.get('/history/:userId', protect, async (req, res) => {
    try {
        const { userId } = req.params;
        // User can view their own, Admin can view any
        if (req.user.role !== 'admin' && req.user.id !== userId) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const messages = await Message.find({ user: userId }).sort({ createdAt: 1 });
        return res.status(200).json({ success: true, messages });
    } catch (err) {
        console.error('get chat history error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/chat/admin/conversations - Admin list of all conversations
router.get('/admin/conversations', protect, adminOnly, async (req, res) => {
    try {
        const conversations = await Message.aggregate([
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$user',
                    lastMessage: { $first: '$text' },
                    lastSender: { $first: '$sender' },
                    lastCreatedAt: { $first: '$createdAt' },
                    isGuest: { $max: '$isGuest' },
                    unreadCount: {
                        $sum: {
                            $cond: [{ $and: [{ $eq: ['$sender', 'user'] }, { $eq: ['$readByAdmin', false] }] }, 1, 0],
                        },
                    },
                },
            },
            { $sort: { lastCreatedAt: -1 } },
        ]);

        const populated = await Promise.all(
            conversations.map(async (c) => {
                const userDoc = await User.findById(c._id).select('name email image phone');
                return {
                    userId: c._id,
                    userName: userDoc?.name || (c.isGuest ? 'Guest' : 'Customer'),
                    isGuest: !userDoc && Boolean(c.isGuest),
                    userEmail: userDoc?.email || '',
                    userImage: userDoc?.image || '',
                    lastMessage: c.lastMessage,
                    lastSender: c.lastSender,
                    lastCreatedAt: c.lastCreatedAt,
                    unreadCount: c.unreadCount,
                };
            })
        );

        return res.status(200).json({ success: true, conversations: populated });
    } catch (err) {
        console.error('get admin conversations error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
