export const ORDER_STATUSES = ['Pending', 'Processing', 'Delivered', 'Cancelled'];

// Older orders in transit are still being processed until delivery is confirmed.
export const normalizeOrderStatus = (status) => status === 'In Transit' ? 'Processing' : status;

export function canUpdateOrderStatus(current, next) {
    const currentIndex = ORDER_STATUSES.indexOf(normalizeOrderStatus(current));
    return currentIndex >= 0 && ORDER_STATUSES.indexOf(next) >= currentIndex;
}
