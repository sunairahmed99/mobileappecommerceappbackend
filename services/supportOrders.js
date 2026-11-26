import Order from '../Models/orderModel.js';
import StoreSettings from '../Models/storeSettingsModel.js';
import { normalizeOrderStatus, ORDER_STATUSES } from './orderStatus.js';

const ORDER_REFERENCE = /\bORD-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/i;
const ORDER_TOPIC = /\b(?:orders?|purchases?|parcel|shipment|tracking|delivery status|refund status|payment status)\b/i;
const LOOKUP_REQUEST = /\b(?:my|mera|meri|mere|apna|status|track|details?|items?|total|amount|history|latest|last|where|when|check|bata\w*|dikha\w*|kab|kahan|kidhar|delivery|shipped|arriv\w*|paid|payment|refund|cancel\w*|return\w*|change|update)\b/i;

export function isOrderLookup(text) {
    return ORDER_REFERENCE.test(text) || (/\b#?\d{5,}\b/.test(text) && ORDER_TOPIC.test(text)) ||
        (ORDER_TOPIC.test(text) && LOOKUP_REQUEST.test(text) && !/\b(?:how (?:do|can) i (?:place|make)|how to (?:place|make)|minimum order)\b/i.test(text));
}

export async function getOrderReply(text, customerId) {
    if (!customerId) return 'Please sign in to check your orders. You can also find your order history in Profile.';

    const reference = text.match(ORDER_REFERENCE)?.[0] || text.match(/\b(?:order\s*(?:number\s*)?#?\s*)(\d{5,})\b/i)?.[1];
    const listRequested = /\b(?:my orders|order history|recent orders|all orders)\b/i.test(text);
    const filter = { user: customerId };
    if (reference) filter.orderNumber = reference.toUpperCase();
    const orders = await Order.find(filter).select('orderNumber status createdAt paymentStatus totalAmount items.name items.qty')
        .sort({ createdAt: -1 }).limit(listRequested && !reference ? 3 : 1).lean();
    if (!orders.length) return reference ? 'I could not find that order in your account. Check the order number in Profile and try again.' :
        'There are no orders in your account yet.';

    const includeItems = /\b(?:details?|items?|products?|contents?|andar)\b/i.test(text);
    const includeTotal = /\b(?:details?|total|amount|cost|how much)\b/i.test(text);
    const store = includeTotal && orders.some(order => Number.isFinite(order.totalAmount))
        ? await StoreSettings.findOne().select('currency').lean()
        : null;
    const wantsChange = /\b(?:cancel|return|refund|change|update)\b/i.test(text);
    const details = orders.map(order => {
        const date = new Date(order.createdAt);
        const placed = Number.isNaN(date.getTime()) ? '' : ` Placed on ${date.toISOString().slice(0, 10)}.`;
        const items = includeItems && order.items?.length
            ? ` Items: ${order.items.slice(0, 8).map(item => `${item.qty} × ${item.name}`).join(', ')}${order.items.length > 8 ? ', and more' : ''}.`
            : '';
        const status = normalizeOrderStatus(order.status);
        const summary = ORDER_STATUSES.includes(status) ? `Order ${order.orderNumber} is ${status}.` : `The status of order ${order.orderNumber} is currently unavailable.`;
        const total = includeTotal && Number.isFinite(order.totalAmount)
            ? ` Total: ${store?.currency || 'Rs.'} ${order.totalAmount.toLocaleString('en-PK')}.`
            : '';
        return `${summary}${placed}${order.paymentStatus ? ` Payment status: ${order.paymentStatus}.` : ''}${total}${items}`;
    });
    if (wantsChange) details.push('A store admin can help with changes or refund requests.');
    return details.join('\n\n');
}
