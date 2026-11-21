import { createSafeLogger } from './services/safeLogger.js';
const console = createSafeLogger('socket');
import { Server } from 'socket.io';
import Message from './Models/messageModel.js';
import User from './Models/userModel.js';
import { authenticateToken } from './config/jwt.js';
import { corsOptions } from './config/cors.js';

let ioInstance = null;

// Track online users/admins { userId: [socketId, ...] }
const onlineUsers = new Map();
const onlineAdmins = new Set();

export const initSocket = (httpServer, { beforeAuthenticate } = {}) => {
    const io = new Server(httpServer, {
        cors: corsOptions,
    });

    ioInstance = io;

    io.use(async (socket, next) => {
        try {
            if (beforeAuthenticate) await beforeAuthenticate();
            socket.account = await authenticateToken(socket.handshake.auth?.token);
            next();
        } catch {
            next(new Error('Authentication required'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`[Socket Connected]: ${socket.id}`);
        socket.userId = socket.account.id;
        socket.role = socket.account.role;
        socket.userName = socket.account.name;
        let packetCount = 0;
        let packetWindow = Date.now();
        socket.use(async (_packet, next) => {
            if (Date.now() - packetWindow > 10000) { packetWindow = Date.now(); packetCount = 0; }
            if (++packetCount > 100) return next(new Error('Too many messages'));
            try {
                const current = await authenticateToken(socket.handshake.auth?.token);
                if (current.role !== socket.role) throw new Error('Account permissions changed');
                next();
            } catch {
                socket.disconnect(true);
            }
        });

        // Register user or admin
        socket.on('register', async (data) => {
            try {
                const { id: userId, role, name } = socket.account;
                socket.userId = userId;
                socket.role = role || 'user';
                socket.userName = name || 'User';

                if (role === 'admin') {
                    onlineAdmins.add(socket.id);
                    socket.join('admin_room');
                    console.log(`[Admin Registered]: ${name || 'Admin'} (${socket.id})`);
                    // Inform all connected clients that admin is online
                    io.emit('admin_status', { isAdminOnline: true });
                } else if (userId) {
                    if (!onlineUsers.has(userId)) {
                        onlineUsers.set(userId, new Set());
                    }
                    onlineUsers.get(userId).add(socket.id);
                    socket.join(`user_${userId}`);
                    console.log(`[User Registered]: ${name || 'User'} (${userId})`);
                    
                    // Send admin status directly to this user
                    socket.emit('admin_status', { isAdminOnline: onlineAdmins.size > 0 });
                }

                // Broadcast online status to admins
                io.to('admin_room').emit('online_users', {
                    activeUserIds: Array.from(onlineUsers.keys()),
                });
            } catch (err) {
                console.error('Socket register error:', err);
            }
        });

        // Load conversation history for a user
        socket.on('get_conversation', async (data, callback) => {
            try {
                const targetUserId = data?.userId || socket.userId;
                if (!targetUserId) {
                    if (callback) callback({ success: false, message: 'User ID is required' });
                    return;
                }

                // Security: Regular user can only view their own conversation
                if (socket.role !== 'admin' && String(targetUserId) !== String(socket.userId)) {
                    if (callback) callback({ success: false, message: 'Unauthorized access to conversation' });
                    return;
                }

                const messages = await Message.find({ user: targetUserId }).sort({ createdAt: 1 });
                if (callback) {
                    callback({ success: true, messages });
                } else {
                    socket.emit('conversation_history', { userId: targetUserId, messages });
                }
            } catch (err) {
                console.error('get_conversation error:', err);
                if (callback) callback({ success: false, message: 'Unable to process request.' });
            }
        });

        // Get list of active conversations (for Admin panel)
        socket.on('get_admin_conversations', async (_, callback) => {
            try {
                // Security: Only admins can view the list of all conversations
                if (socket.role !== 'admin') {
                    if (callback) callback({ success: false, message: 'Admin access required' });
                    return;
                }

                const conversations = await Message.aggregate([
                    { $sort: { createdAt: -1 } },
                    {
                        $group: {
                            _id: '$user',
                            lastMessage: { $first: '$text' },
                            lastSender: { $first: '$sender' },
                            lastCreatedAt: { $first: '$createdAt' },
                            senderName: { $first: '$senderName' },
                            unreadCount: {
                                $sum: {
                                    $cond: [{ $and: [{ $eq: ['$sender', 'user'] }, { $eq: ['$readByAdmin', false] }] }, 1, 0],
                                },
                            },
                        },
                    },
                    { $sort: { lastCreatedAt: -1 } },
                ]);

                // Populate user profile info
                const populated = await Promise.all(
                    conversations.map(async (c) => {
                        const userDoc = await User.findById(c._id).select('name email image phone');
                        return {
                            userId: c._id,
                            userName: userDoc?.name || c.senderName || 'Customer',
                            userEmail: userDoc?.email || '',
                            userImage: userDoc?.image || '',
                            lastMessage: c.lastMessage,
                            lastSender: c.lastSender,
                            lastCreatedAt: c.lastCreatedAt,
                            unreadCount: c.unreadCount,
                            isOnline: onlineUsers.has(String(c._id)),
                        };
                    })
                );

                if (callback) {
                    callback({ success: true, conversations: populated });
                } else {
                    socket.emit('admin_conversations_list', populated);
                }
            } catch (err) {
                console.error('get_admin_conversations error:', err);
                if (callback) callback({ success: false, message: 'Unable to process request.' });
            }
        });

        // Send a message (User -> Admin OR Admin -> User)
        socket.on('send_message', async (data, callback) => {
            try {
                const { userId, sender, text, senderName } = data || {};
                const targetUserId = userId || socket.userId;

                if (!socket.userId || (socket.role !== 'admin' && String(targetUserId) !== socket.userId)) {
                    if (callback) callback({ success: false, message: 'Unauthorized' });
                    return;
                }

                if (!targetUserId || typeof text !== 'string' || !text.trim() || text.length > 5000) {
                    if (callback) callback({ success: false, message: 'Message text and userId required' });
                    return;
                }

                const msgSender = socket.role;
                const msgSenderName = socket.userName;

                const savedMsg = await Message.create({
                    user: targetUserId,
                    sender: msgSender,
                    senderName: msgSenderName,
                    text: text.trim(),
                    readByAdmin: msgSender === 'admin',
                    readByUser: msgSender === 'user',
                });

                // Deliver to user's room
                io.to(`user_${targetUserId}`).emit('new_message', savedMsg);

                // Deliver to admin room
                io.to('admin_room').emit('new_message', savedMsg);

                // Notify admin conversation list update
                io.to('admin_room').emit('conversation_updated', {
                    userId: targetUserId,
                    lastMessage: savedMsg.text,
                    lastCreatedAt: savedMsg.createdAt,
                    sender: msgSender,
                });

                if (callback) callback({ success: true, message: savedMsg });
            } catch (err) {
                console.error('send_message error:', err);
                if (callback) callback({ success: false, message: 'Unable to process request.' });
            }
        });

        // Mark messages as read
        socket.on('mark_read', async (data) => {
            try {
                const { userId, role } = data || {};
                const targetUserId = userId || socket.userId;
                if (!targetUserId) return;
                if (!socket.userId || (socket.role !== 'admin' && String(targetUserId) !== socket.userId)) return;

                if (socket.role === 'admin') {
                    await Message.updateMany(
                        { user: targetUserId, sender: 'user', readByAdmin: false },
                        { $set: { readByAdmin: true } }
                    );
                    io.to(`user_${targetUserId}`).emit('messages_read', { by: 'admin', userId: targetUserId });
                } else {
                    await Message.updateMany(
                        { user: targetUserId, sender: 'admin', readByUser: false },
                        { $set: { readByUser: true } }
                    );
                    io.to('admin_room').emit('messages_read', { by: 'user', userId: targetUserId });
                }
            } catch (err) {
                console.error('mark_read error:', err);
            }
        });

        // Typing indicators
        socket.on('typing', (data) => {
            const { userId, isTyping, sender } = data || {};
            const targetUserId = userId || socket.userId;
            if (!targetUserId) return;
            if (!socket.userId || (socket.role !== 'admin' && String(targetUserId) !== socket.userId)) return;

            if (socket.role === 'admin') {
                socket.to(`user_${targetUserId}`).emit('user_typing', { isTyping, sender: 'admin' });
            } else {
                io.to('admin_room').emit('user_typing', { userId: targetUserId, isTyping, sender: 'user' });
            }
        });

        // Disconnect
        socket.on('disconnect', () => {
            console.log(`[Socket Disconnected]: ${socket.id}`);
            if (onlineAdmins.has(socket.id)) {
                onlineAdmins.delete(socket.id);
                // Inform clients if no admin is left online
                if (onlineAdmins.size === 0) {
                    io.emit('admin_status', { isAdminOnline: false });
                }
            }

            if (socket.userId && onlineUsers.has(socket.userId)) {
                const userSockets = onlineUsers.get(socket.userId);
                userSockets.delete(socket.id);
                if (userSockets.size === 0) {
                    onlineUsers.delete(socket.userId);
                }
            }

            // Notify admins about current online users
            io.to('admin_room').emit('online_users', {
                activeUserIds: Array.from(onlineUsers.keys()),
            });
        });
    });

    return io;
};

export const getIO = () => {
    if (!ioInstance) {
        throw new Error('Socket.io not initialized!');
    }
    return ioInstance;
};
