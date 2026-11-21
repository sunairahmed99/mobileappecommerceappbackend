export function pagination(query, defaultLimit = 20) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? defaultLimit);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        return null;
    }
    return { page, limit, skip: (page - 1) * limit };
}
export function literalSearch(value) {
    return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}
