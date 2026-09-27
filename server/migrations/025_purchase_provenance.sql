-- Retain anonymous transaction tombstones to prevent delete/recreate replay.
ALTER TABLE iap_transactions DROP CONSTRAINT iap_transactions_user_id_fkey;
ALTER TABLE iap_transactions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE iap_transactions ADD CONSTRAINT iap_transactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
-- Legacy rows cannot be proven verified from the ledger alone.
ALTER TABLE iap_transactions ADD COLUMN store_verified boolean NOT NULL DEFAULT false;
