import { createSafeLogger } from '../services/safeLogger.js';
const console = createSafeLogger('feedbackController');
import Feedback from '../Models/feedbackModel.js';
import Notification from '../Models/notificationModel.js';

export const getAllFeedback = async (req, res) => {
    try {
        const feedbacks = await Feedback.find({ type: 'feedback' }).sort({ createdAt: -1 });

        const totalCount = feedbacks.length;
        const openCount = feedbacks.filter((f) => f.status === 'Open').length;
        const inProgressCount = feedbacks.filter((f) => f.status === 'In Progress').length;
        const resolvedCount = feedbacks.filter((f) => f.status === 'Resolved').length;

        // Today's resolved count
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const resolvedTodayCount = feedbacks.filter(
            (f) => f.status === 'Resolved' && f.resolvedAt && new Date(f.resolvedAt) >= todayStart
        ).length;

        // Approval counts
        const approvedCount = feedbacks.filter((f) => f.isApproved === true).length;
        const pendingApprovalCount = feedbacks.filter((f) => f.isApproved !== true && f.isDeclined !== true).length;

        // Average rating calculation
        const ratedFeedbacks = feedbacks.filter((f) => typeof f.rating === 'number' && f.rating > 0);
        const avgRating =
            ratedFeedbacks.length > 0
                ? (ratedFeedbacks.reduce((sum, f) => sum + f.rating, 0) / ratedFeedbacks.length).toFixed(1)
                : '5.0';

        // Satisfaction rate (% of rating >= 4)
        const satisfiedCount = ratedFeedbacks.filter((f) => f.rating >= 4).length;
        const satisfactionRate =
            ratedFeedbacks.length > 0
                ? ((satisfiedCount / ratedFeedbacks.length) * 100).toFixed(1)
                : '100';

        return res.status(200).json({
            success: true,
            totalCount,
            openCount,
            inProgressCount,
            resolvedCount,
            resolvedTodayCount,
            approvedCount,
            pendingApprovalCount,
            avgRating,
            satisfactionRate,
            feedbacks,
        });
    } catch (error) {
        console.error('getAllFeedback error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching feedback.' });
    }
};

// ── POST /api/feedback (public or user submit) ──
export const createFeedback = async (req, res) => {
    try {
        const { name, email, subject, message, type, rating } = req.body;

        if (req.path === '/review' && (!req.user || req.user.role !== 'user')) {
            return res.status(403).json({ success: false, message: 'A customer account is required to submit a review.' });
        }

        const isReview = req.path === '/review';
        if (!name || !email || (!isReview && !subject) || !message) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, subject, and message are required.',
            });
        }

        const newFeedback = await Feedback.create({
            user: req.user?.id || null,
            name: name.trim(),
            email: email.trim(),
            subject: subject.trim(),
            message: message.trim(),
            type: isReview ? 'feedback' : (type || 'support'),
            rating: Number(rating) || 5,
            status: 'Open',
        });

        // Create admin notification
        try {
            await Notification.create({
                user: req.user?.id || null,
                category: 'support',
                title: 'New Support Ticket Received',
                message: `Ticket from ${name.trim()}: "${subject.trim()}".`,
                read: false,
            });
        } catch {}

        return res.status(201).json({
            success: true,
            message: 'Feedback/Ticket submitted successfully!',
            feedback: newFeedback,
        });
    } catch (error) {
        console.error('createFeedback error:', error);
        return res.status(500).json({ success: false, message: 'Server error submitting feedback.' });
    }
};

// ── PATCH /api/feedback/admin/:id/status (admin only) ──
export const markFeedbackRead = async (req, res) => {
    try {
        const feedback = await Feedback.findByIdAndUpdate(
            req.params.id, { $set: { isRead: true } }, { new: true }
        );
        if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found.' });
        return res.json({ success: true, feedback });
    } catch (error) {
        console.error('markFeedbackRead error:', error);
        return res.status(500).json({ success: false, message: 'Could not mark feedback as read.' });
    }
};

export const updateFeedbackStatus = async (req, res) => {
    try {
        const { status, adminReply } = req.body;
        const VALID_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}.`,
            });
        }

        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) {
            return res.status(404).json({ success: false, message: 'Feedback ticket not found.' });
        }

        if (status) {
            feedback.status = status;
            if (status === 'Resolved' && !feedback.resolvedAt) {
                feedback.resolvedAt = new Date();
            } else if (status !== 'Resolved') {
                feedback.resolvedAt = null;
            }
        }

        if (typeof adminReply === 'string') {
            feedback.adminReply = adminReply.trim();
        }

        await feedback.save();

        // Optional notification to user if registered
        if (feedback.user) {
            try {
                await Notification.create({
                    user: feedback.user,
                    category: 'support',
                    title: `Ticket ${feedback.status}`,
                    message: `Your ticket "${feedback.subject}" has been updated to "${feedback.status}".`,
                    read: false,
                });
            } catch {}
        }

        return res.status(200).json({
            success: true,
            message: `Ticket status updated to "${feedback.status}".`,
            feedback,
        });
    } catch (error) {
        console.error('updateFeedbackStatus error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating ticket.' });
    }
};

// ── DELETE /api/feedback/admin/:id (admin only) ──
export const deleteFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.findByIdAndDelete(req.params.id);
        if (!feedback) {
            return res.status(404).json({ success: false, message: 'Feedback not found.' });
        }
        return res.status(200).json({ success: true, message: 'Feedback deleted successfully.' });
    } catch (error) {
        console.error('deleteFeedback error:', error);
        return res.status(500).json({ success: false, message: 'Server error deleting feedback.' });
    }
};

// ── PATCH /api/feedback/admin/:id/approve (admin only) ──
export const approveFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) {
            return res.status(404).json({ success: false, message: 'Feedback not found.' });
        }

        if (feedback.type !== 'feedback') {
            return res.status(400).json({ success: false, message: 'Only customer reviews can be published.' });
        }
        feedback.isApproved = true;
        feedback.isDeclined = false;
        feedback.isRead = true;
        feedback.approvedAt = feedback.approvedAt || new Date();
        await feedback.save();

        return res.status(200).json({
            success: true,
            message: 'Review approved and published to the app.',
            feedback,
        });
    } catch (error) {
        console.error('approveFeedback error:', error);
        return res.status(500).json({ success: false, message: 'Server error approving feedback.' });
    }
};

// ── GET /api/feedback/public (public — only approved feedbacks) ──
export const declineFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found.' });
        feedback.isApproved = false;
        feedback.isDeclined = true;
        feedback.isRead = true;
        feedback.approvedAt = null;
        await feedback.save();
        return res.json({ success: true, message: 'Review declined and hidden from the app.', feedback });
    } catch (error) {
        console.error('declineFeedback error:', error);
        return res.status(500).json({ success: false, message: 'Could not decline review.' });
    }
};

export const getApprovedFeedback = async (req, res) => {
    try {
        const approved = await Feedback.find({ isApproved: true, isDeclined: { $ne: true }, type: 'feedback' })
            .select('name subject message rating createdAt approvedAt')
            .sort({ approvedAt: -1, createdAt: -1 });
        const feedbacks = approved.map(item => ({
            id: String(item._id || item.id), name: item.name, subject: item.subject,
            message: item.message, rating: item.rating, createdAt: item.createdAt, approvedAt: item.approvedAt,
        }));
        const ratedFeedbacks = feedbacks.filter((f) => typeof f.rating === 'number' && f.rating > 0);
        const avgRating =
            ratedFeedbacks.length > 0
                ? (ratedFeedbacks.reduce((sum, f) => sum + f.rating, 0) / ratedFeedbacks.length).toFixed(1)
                : '5.0';

        res.set('Cache-Control', 'no-store');
        return res.status(200).json({
            success: true,
            feedbacks,
            avgRating,
            totalCount: feedbacks.length,
        });
    } catch (error) {
        console.error('getApprovedFeedback error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching approved feedback.' });
    }
};


