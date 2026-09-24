// StoreKit 2 signed-transaction (JWS) verification, done offline.
//
// Since StoreKit 2 every purchase comes with `jwsRepresentation`: a JWS whose
// header carries Apple's x5c certificate chain (leaf → intermediate → Apple
// Root CA G3) and whose payload is the transaction. Verifying it needs no
// shared secret and no App Store Server API key — we pin Apple's root, walk
// the chain, then check the ES256 signature with the leaf key. This replaces
// the deprecated /verifyReceipt round-trip for new purchases.
//
// Mirrors what Apple's app-store-server-library SignedDataVerifier does,
// minus the OCSP/online revocation check.
// ponytail: no OID (1.2.840.113635.100.6.11.1) check on the leaf; forging a
// transaction would still require an Apple-issued signing key.

import { verify as cryptoVerify, X509Certificate } from 'node:crypto';

/** Apple Root CA - G3 (https://www.apple.com/certificateauthority/), valid to 2039. */
export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

/** The subset of Apple's JWSTransactionDecodedPayload we act on. */
export interface AppleTransactionPayload {
    transactionId: string;
    originalTransactionId?: string;
    bundleId: string;
    productId: string;
    /** 'Sandbox' | 'Production' */
    environment?: string;
    /** 'Consumable' | 'Non-Consumable' | 'Auto-Renewable Subscription' | … */
    type?: string;
    /** Present (ms epoch) when Apple refunded / revoked the purchase. */
    revocationDate?: number;
    signedDate?: number;
    purchaseDate?: number;
}

const JWS_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** True if the string is shaped like a compact JWS (vs. a legacy base64 receipt). */
export function looksLikeJws(s: string): boolean {
    return JWS_RE.test(s);
}

/**
 * Verify a StoreKit 2 signed transaction and return its payload. Throws on any
 * failure (malformed, bad chain, bad signature, expired certificate).
 *
 * `rootPem` overrides the pinned Apple root — only for tests.
 */
export function verifyAppleSignedTransaction(
    jws: string,
    opts: { rootPem?: string } = {}
): AppleTransactionPayload {
    if (!looksLikeJws(jws)) throw new Error('Not a JWS');
    const [h, p, s] = jws.split('.') as [string, string, string];

    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as {
        alg?: string;
        x5c?: string[];
    };
    if (header.alg !== 'ES256') throw new Error(`Unsupported alg ${header.alg}`);
    if (!Array.isArray(header.x5c) || header.x5c.length !== 3) {
        throw new Error('JWS x5c chain must have exactly 3 certificates');
    }
    const [leaf, intermediate, root] = header.x5c.map(
        (b64) => new X509Certificate(Buffer.from(b64, 'base64'))
    ) as [X509Certificate, X509Certificate, X509Certificate];

    // 1. The chain must terminate in the pinned root (byte-for-byte).
    const pinned = new X509Certificate(opts.rootPem ?? APPLE_ROOT_CA_G3_PEM);
    if (root.fingerprint256 !== pinned.fingerprint256) {
        throw new Error('JWS certificate chain does not terminate in the Apple Root CA');
    }
    // 2. Each link must be issued + signed by the next.
    if (!intermediate.checkIssued(root) || !intermediate.verify(root.publicKey)) {
        throw new Error('Intermediate certificate not signed by root');
    }
    if (!leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey)) {
        throw new Error('Leaf certificate not signed by intermediate');
    }

    const payload = JSON.parse(
        Buffer.from(p, 'base64url').toString('utf8')
    ) as AppleTransactionPayload;

    // 3. Certificates must have been valid when Apple signed the transaction
    //    (old restored purchases may carry a since-expired leaf).
    const at = typeof payload.signedDate === 'number' ? payload.signedDate : Date.now();
    for (const c of [leaf, intermediate, root]) {
        const from = Date.parse(c.validFrom);
        const to = Date.parse(c.validTo);
        if (!(at >= from && at <= to)) throw new Error('Certificate not valid at signing time');
    }

    // 4. ES256 signature over `header.payload` with the leaf key.
    const ok = cryptoVerify(
        'sha256',
        Buffer.from(`${h}.${p}`, 'utf8'),
        { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(s, 'base64url')
    );
    if (!ok) throw new Error('JWS signature invalid');

    if (!payload.transactionId || !payload.bundleId || !payload.productId) {
        throw new Error('JWS payload missing required fields');
    }
    return payload;
}
