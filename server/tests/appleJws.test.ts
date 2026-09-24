import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { looksLikeJws, verifyAppleSignedTransaction } from '../src/iap/appleJws.js';

// Fixtures: a throwaway EC chain (root → intermediate → leaf) mimicking Apple's
// x5c layout, and two transactions signed by the leaf key. See fixtures/applejws.
const dir = join(__dirname, 'fixtures', 'applejws');
const rootPem = readFileSync(join(dir, 'root.pem'), 'utf8');
const valid = readFileSync(join(dir, 'valid.jws'), 'utf8').trim();
const revoked = readFileSync(join(dir, 'revoked.jws'), 'utf8').trim();

describe('verifyAppleSignedTransaction', () => {
    it('accepts a transaction whose chain terminates in the pinned root', () => {
        const p = verifyAppleSignedTransaction(valid, { rootPem });
        expect(p.transactionId).toBe('2000000123456789');
        expect(p.bundleId).toBe('dev.bonhomieinc.wordwar');
        expect(p.productId).toBe('dev.bonhomieinc.wordwar.remove_ads');
        expect(p.revocationDate).toBeUndefined();
    });

    it('surfaces revocationDate so callers can refuse refunded purchases', () => {
        const p = verifyAppleSignedTransaction(revoked, { rootPem });
        expect(typeof p.revocationDate).toBe('number');
    });

    it('rejects the same JWS against the real Apple root (chain mismatch)', () => {
        expect(() => verifyAppleSignedTransaction(valid)).toThrow(/Apple Root CA/);
    });

    it('rejects a tampered payload (signature no longer matches)', () => {
        const [h, p, s] = valid.split('.') as [string, string, string];
        const body = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
        body.productId = 'dev.bonhomieinc.wordwar.coins.mega';
        const forged = `${h}.${Buffer.from(JSON.stringify(body)).toString('base64url')}.${s}`;
        expect(() => verifyAppleSignedTransaction(forged, { rootPem })).toThrow(/signature/);
    });

    it('rejects things that are not a JWS', () => {
        expect(looksLikeJws('MIIT...base64receipt==')).toBe(false);
        expect(() => verifyAppleSignedTransaction('nope', { rootPem })).toThrow();
    });
});
