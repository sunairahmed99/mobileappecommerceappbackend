import { randomUUID } from 'node:crypto';
import cloudinary from '../config/cloudinary.js';

export const MAX_CHAT_FILE_SIZE = 20 * 1024 * 1024;

export function describeChatFile(file, kind = 'file', duration = 0) {
    if (!file?.buffer?.length) throw Object.assign(new Error('Choose a file to send.'), { status: 400 });
    if (file.buffer.length > MAX_CHAT_FILE_SIZE) throw Object.assign(new Error('Files must be 20 MB or smaller.'), { status: 413 });
    if (!['image', 'audio', 'file'].includes(kind)) throw Object.assign(new Error('Invalid attachment type.'), { status: 400 });
    const b = file.buffer;
    const starts = (value) => b.subarray(0, value.length).equals(Buffer.from(value));
    const brand = b.subarray(8, 12).toString();
    const isBmff = b.subarray(4, 8).toString() === 'ftyp';
    let mimeType = 'application/octet-stream';
    if (starts([0xff, 0xd8, 0xff])) mimeType = 'image/jpeg';
    else if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) mimeType = 'image/png';
    else if (starts('GIF8')) mimeType = 'image/gif';
    else if (starts('RIFF') && b.subarray(8, 12).toString() === 'WEBP') mimeType = 'image/webp';
    else if (isBmff && /heic|heix|hevc|mif1|avif/.test(brand)) mimeType = brand === 'avif' ? 'image/avif' : 'image/heic';
    else if (isBmff) mimeType = 'audio/mp4';
    else if (starts('OggS')) mimeType = 'audio/ogg';
    else if (starts('RIFF') && b.subarray(8, 12).toString() === 'WAVE') mimeType = 'audio/wav';
    else if (starts('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) mimeType = 'audio/mpeg';
    else if (starts([0x1a, 0x45, 0xdf, 0xa3])) mimeType = 'audio/webm';
    else if (starts('%PDF-')) mimeType = 'application/pdf';
    else if (kind === 'file' && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(file.mimetype || '')) mimeType = file.mimetype;
    if ((kind === 'image' && !mimeType.startsWith('image/')) || (kind === 'audio' && !mimeType.startsWith('audio/'))) {
        throw Object.assign(new Error('The selected media file is not supported.'), { status: 400 });
    }
    const name = (file.originalname || 'attachment').replace(/[\x00-\x1f/\\]/g, '_').slice(0, 150);
    return { kind, name, mimeType, size: b.length, duration: kind === 'audio' ? Math.max(0, Math.min(120000, Number(duration) || 0)) : 0 };
}

export const storeChatFile = (buffer, kind) => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
        folder: 'chat-media', public_id: randomUUID(), type: 'authenticated',
        resource_type: kind === 'image' ? 'image' : kind === 'audio' ? 'video' : 'raw',
    }, (error, result) => error ? reject(error) : resolve(result));
    stream.end(buffer);
});

export async function removeChatFile(attachment) {
    if (attachment?.publicId) await cloudinary.uploader.destroy(attachment.publicId, {
        resource_type: attachment.resourceType, type: 'authenticated',
    });
}

export function chatFileUrl(attachment) {
    return cloudinary.url(attachment.publicId, {
        resource_type: attachment.resourceType, type: 'authenticated', sign_url: true, secure: true,
        ...(attachment.resourceType !== 'raw' && attachment.format ? { format: attachment.format } : {}),
    });
}
