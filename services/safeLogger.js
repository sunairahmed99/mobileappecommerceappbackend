/** Diagnostics intentionally exclude payloads, exception messages, URLs and personal data. */
export function createSafeLogger(scope) {
    const write = level => (...args) => {
        const error = args.find(value => value instanceof Error);
        const errorType = ['Error', 'TypeError', 'ValidationError', 'CastError', 'MongoServerError'].includes(error?.name) ? error.name : 'Error';
        globalThis.console[level](JSON.stringify({ level, scope, ...(level === 'log' ? {} : { errorType }) }));
    };
    return { log: write('log'), warn: write('warn'), error: write('error') };
}
