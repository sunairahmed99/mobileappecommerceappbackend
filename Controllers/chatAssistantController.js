import { generateCatalogReply } from '../services/geminiAssistant.js';
import { getOrderReply, isOrderLookup } from '../services/supportOrders.js';

export async function chatAssistant(req, res) {
    const { message, history = [] } = req.body || {};
    if (typeof message !== 'string' || !message.trim() || message.trim().length > 500) {
        return res.status(400).json({ success: false, message: 'Enter a message of up to 500 characters.' });
    }
    if (!Array.isArray(history) || history.length > 8 || history.some(item =>
        !item || !['user', 'model'].includes(item.role) || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 500
    )) {
        return res.status(400).json({ success: false, message: 'Chat history is invalid.' });
    }

    try {
        if (isOrderLookup(message)) {
            const reply = await getOrderReply(message, req.user?.role === 'user' ? req.user.id : undefined);
            return res.status(200).json({ success: true, reply });
        }
        const { reply, products } = await generateCatalogReply({
            message: message.trim(),
            history: history.filter(item => !isOrderLookup(item.text)).map(item => ({ role: item.role, text: item.text.trim() })),
        });
        return res.status(200).json({ success: true, reply, ...(products.length && { products }) });
    } catch (error) {
        if (error.code === 'GEMINI_NOT_CONFIGURED') {
            return res.status(503).json({ success: false, message: 'The AI assistant is not configured yet. Please contact store support.' });
        }
        return res.status(502).json({ success: false, message: 'The AI assistant is temporarily unavailable. Please try again or contact store support.' });
    }
}
