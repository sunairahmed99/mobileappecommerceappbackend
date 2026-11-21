import { test, afterEach } from '@jest/globals';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import OrderReference from '../Models/orderReferenceModel.js';
import { nextOrderNumber } from '../services/orderNumber.js';

afterEach(() => mock.restoreAll());

test('short random order numbers are reserved before use', async () => {
    const reserved = new Set();
    mock.method(OrderReference, 'create', async ({ _id }) => {
        assert.match(_id, /^ORD-[2-9A-HJ-NP-Z]{6}$/);
        if (reserved.has(_id)) throw Object.assign(new Error('Duplicate'), { code: 11000 });
        reserved.add(_id);
    });
    const numbers = await Promise.all(Array.from({ length: 100 }, () => nextOrderNumber()));
    assert.equal(new Set(numbers).size, 100);
    assert.deepEqual(new Set(numbers), reserved);
});

test('duplicate references are retried before returning a number', async () => {
    let calls = 0;
    mock.method(OrderReference, 'create', async () => {
        if (++calls === 1) throw Object.assign(new Error('Duplicate'), { code: 11000 });
    });
    assert.match(await nextOrderNumber(), /^ORD-[2-9A-HJ-NP-Z]{6}$/);
    assert.equal(calls, 2);
});

test('database failures and exhausted retries never return unreserved numbers', async () => {
    mock.method(OrderReference, 'create', async () => { throw new Error('Database offline'); });
    await assert.rejects(nextOrderNumber(), /Database offline/);
    OrderReference.create.mock.mockImplementation(async () => { throw Object.assign(new Error('Duplicate'), { code: 11000 }); });
    await assert.rejects(nextOrderNumber(), /unique order number/);
});
