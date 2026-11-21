import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Compare against actual server-only secrets without printing their values.
const backend = fileURLToPath(new URL('../', import.meta.url));
const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
const environment = existsSync(join(backend, '.env')) ? dotenv.parse(readFileSync(join(backend, '.env'))) : {};
const names = ['DATABASE', 'JWT_SECRET', 'CLOUDINARY_API_SECRET', 'cloudinarysecret', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'GMAIL_PASSWORD', 'SEED_ADMIN_PASSWORD'];
const secrets = names.filter(name => environment[name]?.length >= 12).map(name => [name, environment[name]]);
let scannedFiles = 0;
const findings = [];
function scan(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) { scan(path); continue; }
        if (!['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.map'].includes(extname(path))) continue;
        scannedFiles++;
        const source = readFileSync(path, 'utf8');
        for (const [name, value] of secrets) if (source.includes(value) || source.includes(JSON.stringify(value).slice(1, -1))) findings.push({ file: path.slice(frontend.length), secretName: name });
        if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk_live_[a-zA-Z0-9]{20,}|mongodb(?:\+srv)?:\/\/[^\s'"/]+:[^\s'"/]+@/.test(source)) findings.push({ file: path.slice(frontend.length), secretName: 'credential-pattern' });
    }
}
scan(join(frontend, 'src'));
scan(join(frontend, 'dist'));
console.log(JSON.stringify({ scannedFiles, findings }));
if (findings.length) process.exitCode = 1;
