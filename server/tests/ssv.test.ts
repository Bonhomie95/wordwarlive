import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySignedQuery } from '../src/services/adsService.js';

// AdMob signs the decoded query; the callback URL carries it percent-encoded.
describe('AdMob SSV signature', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const signed =
        'ad_network=5450213213286189855&ad_unit=2747237135&custom_data=user-1|daily_bonus' +
        '&reward_amount=1&reward_item=Reward&timestamp=1795107331165&transaction_id=000660a255e5919306c246981e1eafe8';
    const sig = crypto.sign('sha256', Buffer.from(signed), { key: privateKey, dsaEncoding: 'der' }).toString('base64url');
    const callback = `${signed.replace('|', '%7C')}&signature=${sig}&key_id=3335741209`;

    it('accepts a real-shaped callback with an encoded custom_data', () => {
        expect(verifySignedQuery(callback, sig, pem)).toBe(true);
    });

    it('rejects a tampered callback', () => {
        expect(verifySignedQuery(callback.replace('daily_bonus', 'coin_boost'), sig, pem)).toBe(false);
    });
});
