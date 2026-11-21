import { randomInt } from 'node:crypto';
import OrderReference from '../Models/orderReferenceModel.js';

const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export async function nextOrderNumber() {
    for (let attempt = 0; attempt < 10; attempt++) {
        const reference = 'ORD-' + Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
        try {
            await OrderReference.create({ _id: reference });
            return reference;
        } catch (error) {
            if (error.code !== 11000) throw error;
        }
    }
    throw new Error('Unable to allocate a unique order number.');
}
