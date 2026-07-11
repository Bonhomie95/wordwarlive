-- Ledger of processed in-app-purchase transactions. Its job is replay
-- protection: a store transaction id can only ever grant an entitlement
-- once, even if the client re-sends the same (valid) receipt. Verification
-- of the receipt itself happens in code (src/iap/verify.ts); this table is
-- the idempotency backstop.

CREATE TABLE IF NOT EXISTS iap_transactions (
    id              BIGSERIAL PRIMARY KEY,
    platform        TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    transaction_id  TEXT NOT NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id      TEXT NOT NULL,
    -- What the purchase granted, e.g. 'coins:treasure', 'remove_ads',
    -- 'battle_pass_premium', 'cosmetic:<id>'. For auditing/support.
    entitlement     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One transaction id per store = one grant, forever.
    UNIQUE (platform, transaction_id)
);

CREATE INDEX IF NOT EXISTS iap_transactions_user_idx
    ON iap_transactions (user_id);
