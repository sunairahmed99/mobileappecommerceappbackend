import { createSafeLogger } from './services/safeLogger.js';
const console = createSafeLogger('socket');
import { Server } from 'socket.io';
import Message from './Models/messageModel.js';
import User from './Models/userModel.js';
import { authenticateToken } from './config/jwt.js';
import { corsOptions } from './config/cors.js';
import { createHash } from 'node:crypto';
import { generateCatalogReply } from './services/geminiAssistant.js';
import { getOrderReply, isOrderLookup } from './services/supportOrders.js';

let ioInstance = null;

// Track online users/admins { userId: [socketId, ...] }
export const initSocket = (httpServer, { beforeAuthenticate } = {}) => {
    const io = new Server(httpServer, {
        cors: corsOptions,
    });

    ioInstance = io;
    const onlineUsers = new Map();
    const onlineAdmins = new Set();
    const pendingReplies = new Map();
    const chatLimits = new Map();
    let adminArrival = 0;
    let nextLimitCleanup = 0;

    function setAdminAvailable(socket, available) {
        const wasOnline = onlineAdmins.size > 0;
        if (available) onlineAdmins.add(socket.id);
        else onlineAdmins.delete(socket.id);
        const isAdminOnline = onlineAdmins.size > 0;
        if (!wasOnline && isAdminOnline) {
            adminArrival++;
            for (const pending of pendingReplies.values()) pending.abort();
            pendingReplies.clear();
        }
        if (wasOnline !== isAdminOnline) io.emit('admin_status', { isAdminOnline });
    }

    function consumeChatQuota(key) {
        const now = Date.now();
        if (now >= nextLimitCleanup) {
            for (const [expiredKey, limit] of chatLimits) {
                if (limit.until <= now) chatLimits.delete(expiredKey);
            }
            nextLimitCleanup = now + 60000;
        }
        const currentLimit = chatLimits.get(key);
        const limit = currentLimit?.until > now ? currentLimit : { count: 0, until: now + 60000 };
        if (limit.count >= 12) return false;
        limit.count++;
        chatLimits.set(key, limit);
        return true;
    }

    async function replyAsAssistant(socket, message, arrival) {
        const user = String(message.user);
        const room = io.to(`user_${user}`);
        const pending = new AbortController();
        const canReply = () => !pending.signal.aborted && onlineAdmins.size === 0 && arrival === adminArrival;
        if (!socket.account.guest && !consumeChatQuota(`assistant:${socket.handshake.address}`)) {
            room.emit('assistant_status', { error: 'Please wait a minute before sending another AI request.' });
            return;
        }
        pendingReplies.get(user)?.abort();
        pendingReplies.set(user, pending);
        room.emit('assistant_status', { pending: true });
        try {
            let answer;
            if (message.orderLookup) {
                answer = { reply: await getOrderReply(message.text, socket.account.guest ? undefined : socket.account.id) };
            } else {
                const recent = await Message.find({
                    user,
                    _id: { $ne: message._id },
                    orderLookup: { $ne: true },
                    sender: { $in: ['user', 'assistant'] },
                }).sort({ createdAt: -1 }).limit(8).select('sender text').lean();
                if (!canReply()) return;
                const history = recent.reverse().filter(item => !isOrderLookup(item.text)).map(item => ({
                    role: item.sender === 'assistant' ? 'model' : 'user',
                    text: item.text.slice(0, 500),
                }));
                answer = await generateCatalogReply({ message: message.text.slice(0, 500), history, signal: pending.signal, openProduct: true });
            }
            if (!canReply()) return;
            const reply = await Message.create({
                user, sender: 'assistant', senderName: 'AI Assistant', text: answer.reply, readByAdmin: true,
                orderLookup: message.orderLookup, products: answer.products?.length ? answer.products : undefined,
            });
            if (!canReply()) {
                await Message.deleteOne({ _id: reply._id });
                return;
            }
            room.emit('new_message', reply);
            io.to('admin_room').emit('new_message', reply);
            if (answer.productToOpen && socket.connected) {
                socket.emit('assistant_open_product', { productId: answer.productToOpen });
            }
        } catch {
            if (canReply()) room.emit('assistant_status', { error: 'The AI assistant is temporarily unavailable.' });
        } finally {
            if (pendingReplies.get(user) === pending) {
                pendingReplies.delete(user);
                room.emit('assistant_status', { pending: false });
            }
        }
    }

    io.use(async (socket, next) => {
        try {
            if (beforeAuthenticate) await beforeAuthenticate();
            const { token, guestKey } = socket.handshake.auth || {};
            if (!token && typeof guestKey === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(guestKey)) {
                const id = createHash('sha256').update(`support-guest:${guestKey}`).digest('hex').slice(0, 24);
                socket.account = { id, role: 'user', name: 'Guest', guest: true };
            } else {
                socket.account = await authenticateToken(token);
            }
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
        socket.join(socket.role === 'admin' ? 'admin_room' : `user_${socket.userId}`);
        let packetCount = 0;
        let packetWindow = Date.now();
        socket.use(async (_packet, next) => {
            if (Date.now() - packetWindow > 10000) { packetWindow = Date.now(); packetCount = 0; }
            if (++packetCount > 100) return next(new Error('Too many messages'));
            if (socket.account.guest) return next();
            try {
                const current = await authenticateToken(socket.handshake.auth?.token);
                if (current.role !== socket.role) throw new Error('Account permissions changed');
                next();
            } catch {
                socket.disconnect(true);
            }
        });

        // Register user or admin
        socket.on('register', async () => {
            try {
                const { id: userId, role, name } = socket.account;
                socket.userId = userId;
                socket.role = role || 'user';
                socket.userName = name || 'User';

                if (role === 'admin') {
                    console.log(`[Admin Registered]: ${name || 'Admin'} (${socket.id})`);
                } else if (userId) {
                    if (!onlineUsers.has(userId)) {
                        onlineUsers.set(userId, new Set());
                    }
                    onlineUsers.get(userId).add(socket.id);
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

        socket.on('admin_availability', (available) => {
            if (socket.role === 'admin' && typeof available === 'boolean') {
                setAdminAvailable(socket, available);
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
                    callback({ success: true, messages, assistantPending: onlineAdmins.size === 0 && pendingReplies.has(String(targetUserId)) });
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

                // Populate user profile info
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
                const { userId, text } = data || {};
                const targetUserId = userId || socket.userId;

                if (!socket.userId || (socket.role !== 'admin' && String(targetUserId) !== socket.userId)) {
                    if (callback) callback({ success: false, message: 'Unauthorized' });
                    return;
                }

                if (typeof targetUserId !== 'string' || !/^[a-f0-9]{24}$/i.test(targetUserId) || typeof text !== 'string' || !text.trim() || text.length > (socket.account.guest ? 500 : 5000)) {
                    if (callback) callback({ success: false, message: 'Message text and userId required' });
                    return;
                }
                if (socket.account.guest && !consumeChatQuota(`guest:${socket.handshake.address}`)) {
                    if (callback) callback({ success: false, message: 'Please wait a minute before sending another message.' });
                    return;
                }

                const msgSender = socket.role;
                const msgSenderName = socket.userName;
                const assistantArrival = msgSender === 'user' && onlineAdmins.size === 0 ? adminArrival : null;

                const savedMsg = await Message.create({
                    user: targetUserId,
                    sender: msgSender,
                    senderName: msgSenderName,
                    isGuest: Boolean(socket.account.guest),
                    orderLookup: msgSender === 'user' && isOrderLookup(text),
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
                if (onlineAdmins.size === 0 && assistantArrival === adminArrival) {
                    void replyAsAssistant(socket, savedMsg, assistantArrival);
                }
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
            setAdminAvailable(socket, false);

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
