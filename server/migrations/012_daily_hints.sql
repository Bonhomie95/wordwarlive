-- Daily-challenge hints reuse the hint_uses audit table with a synthetic
-- key ('daily:YYYY-MM-DD') instead of a match UUID, so the column becomes
-- text. Existing UUID values cast losslessly.

ALTER TABLE hint_uses ALTER COLUMN match_id TYPE text;
CREATE INDEX IF NOT EXISTS idx_hint_uses_match_user ON hint_uses (match_id, user_id);
