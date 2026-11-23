import { imageResponseReplacer } from './imageOptimization.js';

const privateFields = new Set([
    'password', 'passwordhash', 'verificationotp', 'verificationotpexpire',
    'resetpasswordotp', 'resetpasswordexpire', 'resetpasswordresendcount',
    'resetpasswordresendwindowstart', 'resetpasswordlastsentat', 'resetpasswordresendlockeduntil',
    'emailchangeotp', 'emailchangeotpexpire', 'pendingemail', 'pushtoken',
    'stripecheckoutsessionid', 'stripepaymentintentid', 'stripechargeid', 'stripepaymentflow',
    'publicid', 'publicids', 'imagepublicid', 'imagepublicids', 'logopublicid',
    'apikey', 'apisecret', 'clientsecret', 'jwtsecret', 'authorization', 'stack', '__v',
]);

// Login's intentional `token` response remains available to the authenticated client.
export function secureResponseReplacer(key, value) {
    if (privateFields.has(key.replace(/[_-]/g, '').toLowerCase()) || key === '__v') return undefined;
    return imageResponseReplacer(key, value);
}

/** Apply the same error contract even when controllers catch errors themselves. */
export function secureResponses(_req, res, next) {
    const json = res.json;
    res.json = function (body) {
        if (this.statusCode >= 400) {
            this.setHeader('Cache-Control', 'no-store');
            this.setHeader('Pragma', 'no-cache');
        }
        if (this.statusCode >= 500) body = { success: false, message: 'An internal error occurred. Please try again later.' };
        return json.call(this, body);
    };
    next();
}
