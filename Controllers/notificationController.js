import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('notificationController');
import Notification from '../Models/notificationModel.js';
import User from '../Models/userModel.js';
import Order from '../Models/orderModel.js';

// ── EXPO / FIREBASE PUSH SENDER HELPER ─────────────────────────────
export const sendPushNotification = async (pushTokens, title, body, data = {}) => {
    try {
        const tokens = Array.isArray(pushTokens) ? pushTokens : [pushTokens];
        const validTokens = tokens.filter(
            (t) => typeof t === 'string' && /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(t)
        );

        if (validTokens.length === 0) {
            console.log('No valid push tokens provided.');
            return null;
        }

        const messages = validTokens.map((token) => ({
            to: token,
            sound: 'default',
            title,
            body,
            data,
            priority: 'high',
            channelId: 'default',
        }));

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messages),
        });

        const result = await response.json();
        console.log('Push notification response:', result);
        return result;
    } catch (error) {
        console.error('sendPushNotification error:', error);
        return null;
    }
};

// ── POST /api/notifications/push-token ──────────────────────────────
export const savePushToken = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { pushToken } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }

        if (typeof pushToken !== 'string' || !/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(pushToken)) {
            return res.status(400).json({ success: false, message: 'Push token is required.' });
        }

        await User.findByIdAndUpdate(userId, { pushToken });

        return res.status(200).json({
            success: true,
            message: 'Push notification token registered successfully.',
        });
    } catch (error) {
        console.error('SavePushToken error:', error);
        return res.status(500).json({ success: false, message: 'Server error saving push token.' });
    }
};

// ── POST /api/notifications/send-push ───────────────────────────────
export const sendPushToUser = async (req, res) => {
    try {
        const { userId, title, body, data } = req.body;

        if (!title || !body) {
            return res.status(400).json({ success: false, message: 'Title and body are required.' });
        }

        let targetTokens = [];
        if (userId) {
            const targetUser = await User.findById(userId);
            if (targetUser?.pushToken) {
                targetTokens.push(targetUser.pushToken);
            }
        } else {
            // Broadcast to all users who have registered push tokens
            const users = await User.find({ pushToken: { $ne: null } }).select('pushToken');
            targetTokens = users.map((u) => u.pushToken).filter(Boolean);
        }

        if (targetTokens.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No active push device token found.',
            });
        }

        const result = await sendPushNotification(targetTokens, title, body, data || {});

        // If target user provided, also create an in-app database notification
        if (userId) {
            await Notification.create({
                user: userId,
                title,
                message: body,
                type: data?.type || 'general',
            });
        }

        return res.status(200).json({
            success: true,
            message: `Push notification delivered to ${targetTokens.length} device(s).`,
            result,
        });
    } catch (error) {
        console.error('SendPushToUser error:', error);
        return res.status(500).json({ success: false, message: 'Server error sending push notification.' });
    }
};

// ── GET /api/notifications ──────────────────────────────────────────
export const getNotifications = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(200).json({
                success: true,
                count: 0,
                notifications: [],
            });
        }

        // Fetch dynamic notifications: both user-specific and broadcast (user: null)
        const notifications = await Notification.find({
            $or: [{ user: userId }, { user: null }],
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: notifications.length,
            notifications,
        });
    } catch (error) {
        console.error('GetNotifications error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching notifications.' });
    }
};

// ── PATCH /api/notifications/:id/read ───────────────────────────────
export const markAsRead = async (req, res) => {
    try {
        const userId = req.user?.id;
        const notification = await Notification.findOne({ _id: req.params.id, user: userId });
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found.' });
        }
        if (userId && notification.user && notification.user.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        notification.read = !notification.read;
        await notification.save();

        return res.status(200).json({ success: true, notification });
    } catch (error) {
        console.error('MarkAsRead error:', error);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ── PATCH /api/notifications/mark-all-read ──────────────────────────
export const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }

        await Notification.updateMany({ user: userId }, { read: true });

        return res.status(200).json({ success: true, message: 'All notifications marked as read.' });
    } catch (error) {
        console.error('MarkAllAsRead error:', error);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ── DELETE /api/notifications ───────────────────────────────────────
export const clearNotifications = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }

        await Notification.deleteMany({ user: userId });

        return res.status(200).json({ success: true, message: 'Notifications cleared successfully.' });
    } catch (error) {
        console.error('ClearNotifications error:', error);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ── GET /api/notifications/customer-spending (Admin: Customers list with lifetime spending) ──
export const getCustomerSpending = async (req, res) => {
    try {
        const users = await User.find().select('name email phone role pushToken createdAt image');

        const orderAgg = await Order.aggregate([
            { $match: { status: { $ne: 'Cancelled' }, user: { $ne: null } } },
            {
                $group: {
                    _id: '$user',
                    totalSpent: { $sum: '$totalAmount' },
                    ordersCount: { $sum: 1 },
                    lastOrderDate: { $max: '$createdAt' },
                },
            },
        ]);

        const orderMap = {};
        orderAgg.forEach((item) => {
            if (item._id) {
                orderMap[item._id.toString()] = item;
            }
        });

        const customers = users
            .filter((u) => u.role !== 'admin')
            .map((u) => {
                const uid = u._id.toString();
                const agg = orderMap[uid] || { totalSpent: 0, ordersCount: 0, lastOrderDate: null };
                return {
                    id: uid,
                    _id: uid,
                    name: u.name || 'Customer',
                    email: u.email || '',
                    phone: u.phone || '',
                    image: u.image || null,
                    hasPushToken: Boolean(u.pushToken),
                    pushToken: u.pushToken || null,
                    totalSpent: Math.round(agg.totalSpent || 0),
                    ordersCount: agg.ordersCount || 0,
                    lastOrderDate: agg.lastOrderDate || null,
                    joinedAt: u.createdAt,
                };
            });

        // Sort by total spent descending
        customers.sort((a, b) => b.totalSpent - a.totalSpent);

        const totalCustomers = customers.length;
        const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
        const highSpendersCount = customers.filter((c) => c.totalSpent >= 2000).length;
        const activeDevicesCount = customers.filter((c) => c.hasPushToken).length;

        return res.status(200).json({
            success: true,
            stats: {
                totalCustomers,
                totalRevenue,
                highSpendersCount,
                activeDevicesCount,
            },
            customers,
        });
    } catch (error) {
        console.error('getCustomerSpending error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving customer spending.' });
    }
};

// ── POST /api/notifications/send-deal (Admin: Broadcast or target Deals/Promotions) ──
export const sendDealNotification = async (req, res) => {
    try {
        const { title, message, dealType, target, minSpend, userId, userIds } = req.body;

        if (!title || !title.trim() || !message || !message.trim()) {
            return res.status(400).json({ success: false, message: 'Title and message are required.' });
        }

        let targetUsers = [];
        let audienceType = target || 'all';

        if (audienceType === 'individual') {
            if (!userId) {
                return res.status(400).json({ success: false, message: 'Customer ID is required for individual target.' });
            }
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'Target customer not found.' });
            }
            targetUsers = [user];
        } else if (audienceType === 'high_spenders') {
            const threshold = Number(minSpend) || 2000;
            const orderAgg = await Order.aggregate([
                { $match: { status: { $ne: 'Cancelled' }, user: { $ne: null } } },
                { $group: { _id: '$user', totalSpent: { $sum: '$totalAmount' } } },
                { $match: { totalSpent: { $gte: threshold } } },
            ]);
            const qualifyingUserIds = orderAgg.map((o) => o._id);
            targetUsers = await User.find({ _id: { $in: qualifyingUserIds }, role: { $ne: 'admin' } });
        } else if (Array.isArray(userIds) && userIds.length > 0) {
            targetUsers = await User.find({ _id: { $in: userIds } });
        } else {
            // All Customers
            audienceType = 'all';
            targetUsers = await User.find({ role: { $ne: 'admin' } });
        }

        // 1. Gather push tokens
        const pushTokens = targetUsers.map((u) => u.pushToken).filter(Boolean);

        // 2. Send Expo push notifications to devices
        let pushResult = null;
        if (pushTokens.length > 0) {
            pushResult = await sendPushNotification(pushTokens, title.trim(), message.trim(), {
                type: dealType || 'deal',
                url: '/shop',
            });
        }

        // 3. Create In-App notifications in Database
        if (audienceType === 'all') {
            // Global broadcast notification (user: null) visible to everyone in their profile
            await Notification.create({
                user: null,
                category: 'offer',
                title: title.trim(),
                message: message.trim(),
                targetAudience: 'all',
            });
        } else {
            // Per-user notifications for targeted users
            const notifDocs = targetUsers.map((u) => ({
                user: u._id,
                category: 'offer',
                title: title.trim(),
                message: message.trim(),
                targetAudience: audienceType,
                targetUserName: u.name,
            }));
            if (notifDocs.length > 0) {
                await Notification.insertMany(notifDocs);
            }
        }

        return res.status(200).json({
            success: true,
            message: `Deal notification delivered! (${targetUsers.length} customer(s) targeted, ${pushTokens.length} push notification(s) sent).`,
            recipientsCount: targetUsers.length,
            pushDeliveredCount: pushTokens.length,
            pushResult,
        });
    } catch (error) {
        console.error('sendDealNotification error:', error);
        return res.status(500).json({ success: false, message: 'Server error sending deal notification.' });
    }
};

// ── POST /api/notifications/send-coupon (Admin: Send Discount Coupon to All, VIP Spenders, or Individual) ──
export const sendCouponCampaign = async (req, res) => {
    try {
        const { couponCode, title, message, target, minSpend, userId, userIds, discount } = req.body;

        if (!couponCode || !couponCode.trim()) {
            return res.status(400).json({ success: false, message: 'Coupon code is required.' });
        }

        const formattedCode = couponCode.trim().toUpperCase();
        const customTitle = title?.trim() || `Special Discount Coupon: ${formattedCode} 🎁`;
        const customMessage =
            message?.trim() ||
            `Use coupon code "${formattedCode}" to get an exclusive discount on your next order!`;

        let targetUsers = [];
        let audienceType = target || 'all';

        if (audienceType === 'individual') {
            if (!userId) {
                return res.status(400).json({ success: false, message: 'Please select a customer to send coupon.' });
            }
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'Target customer not found.' });
            }
            targetUsers = [user];
        } else if (audienceType === 'high_spenders') {
            const threshold = Number(minSpend) || 2000;
            const orderAgg = await Order.aggregate([
                { $match: { status: { $ne: 'Cancelled' }, user: { $ne: null } } },
                { $group: { _id: '$user', totalSpent: { $sum: '$totalAmount' } } },
                { $match: { totalSpent: { $gte: threshold } } },
            ]);
            const qualifyingUserIds = orderAgg.map((o) => o._id);
            targetUsers = await User.find({ _id: { $in: qualifyingUserIds }, role: { $ne: 'admin' } });
        } else if (Array.isArray(userIds) && userIds.length > 0) {
            targetUsers = await User.find({ _id: { $in: userIds } });
        } else {
            // All Customers
            audienceType = 'all';
            targetUsers = await User.find({ role: { $ne: 'admin' } });
        }

        // 1. Send Push notification to devices with push tokens
        const pushTokens = targetUsers.map((u) => u.pushToken).filter(Boolean);
        let pushResult = null;
        if (pushTokens.length > 0) {
            pushResult = await sendPushNotification(pushTokens, customTitle, customMessage, {
                type: 'coupon',
                couponCode: formattedCode,
                url: '/cart',
            });
        }

        // 2. Create in-app notifications with couponCode so it pops up in their Profile alerts
        if (audienceType === 'all') {
            // Global broadcast notification with coupon
            await Notification.create({
                user: null,
                category: 'coupon',
                title: customTitle,
                message: customMessage,
                couponCode: formattedCode,
                discount: discount || null,
                targetAudience: 'all',
            });
        } else {
            // Personalized VIP / Individual coupon in-app notifications
            const notifDocs = targetUsers.map((u) => ({
                user: u._id,
                category: 'coupon',
                title: customTitle,
                message: customMessage,
                couponCode: formattedCode,
                discount: discount || null,
                targetAudience: audienceType,
                targetUserName: u.name,
            }));
            if (notifDocs.length > 0) {
                await Notification.insertMany(notifDocs);
            }
        }

        return res.status(200).json({
            success: true,
            message: `Coupon "${formattedCode}" sent successfully! (${targetUsers.length} customer(s) received in Profile Alerts & ${pushTokens.length} push notification(s) dispatched).`,
            recipientsCount: targetUsers.length,
            pushDeliveredCount: pushTokens.length,
            pushResult,
        });
    } catch (error) {
        console.error('sendCouponCampaign error:', error);
        return res.status(500).json({ success: false, message: 'Server error sending coupon campaign.' });
    }
};

// ── GET /api/notifications/campaign-history (Admin: View sent campaigns) ──
export const getCampaignHistory = async (req, res) => {
    try {
        const campaigns = await Notification.find({
            category: { $in: ['offer', 'coupon', 'deal', 'promo', 'vip'] },
        })
            .sort({ createdAt: -1 })
            .limit(50);

        return res.status(200).json({
            success: true,
            count: campaigns.length,
            campaigns,
        });
    } catch (error) {
        console.error('getCampaignHistory error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching campaign history.' });
    }
};
