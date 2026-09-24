-- Coins granted for solving the daily challenge (shown on the solved card).
ALTER TABLE daily_challenge_attempts
    ADD COLUMN IF NOT EXISTS coins_awarded integer NOT NULL DEFAULT 0;
