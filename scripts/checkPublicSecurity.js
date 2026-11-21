// Read-only smoke checks against a locally running app. Never sends credentials or writes data.
const base = (process.argv[2] || 'http://127.0.0.1:9000').replace(/\/$/, '');
const checks = [['/', 200], ['/api/products', 200], ['/api/banners', 200], ['/api/banner-categories', 200], ['/api/deals', 200], ['/api/feedback/public', 200], ['/api/store-settings', 200], ['/api/delivery-settings', 200], ['/api/auth/users', 401], ['/api/orders/my-orders', 401], ['/api/notifications', 401], ['/api/chat/admin/conversations', 401], ['/api/payment/config', 200], ['/api/__qa_missing__', 404]];
try {
    for (const [path, expected] of checks) {
        const response = await fetch(base + path, { signal: AbortSignal.timeout(5000) });
        const text = await response.text();
        let body;
        try { body = JSON.parse(text); } catch {
            console.log(JSON.stringify({ path, status: response.status, expected, passed: false, reason: 'Non-JSON response' }));
            process.exitCode = 1;
            continue;
        }
        const serialized = JSON.stringify(body);
        const privateField = /"(?:password|verificationOtp|resetPasswordOtp|pushToken|api_secret|api_key|stripeCheckoutSessionId|image_public_ids|image_public_id|public_id|logoPublicId|stack)"\s*:/i.test(serialized);
        const passed = response.status === expected && !privateField && !response.headers.get('x-powered-by');
        console.log(JSON.stringify({ path, status: response.status, expected, passed }));
        if (!passed) process.exitCode = 1;
    }
} catch {
    console.error('Live API smoke check unavailable: no reachable JSON API at the supplied base URL.');
    process.exitCode = 1;
}
