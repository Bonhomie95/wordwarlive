-- User-generated-content reports. Players can report an offensive username,
-- a mystery-mode word, or a match opponent. Reviewed out-of-band; this table
-- is the intake queue.

CREATE TABLE IF NOT EXISTS content_reports (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Who / what is being reported.
    target_type  text NOT NULL CHECK (target_type IN ('user', 'mystery_word', 'match')),
    target_id    text,
    reason       text NOT NULL CHECK (reason IN ('offensive_name', 'offensive_word', 'cheating', 'harassment', 'other')),
    detail       text,
    status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'actioned', 'dismissed')),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports (status, created_at DESC);
-- One open report per (reporter, target) so a user can't spam-report.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_dedup
    ON content_reports (reporter_id, target_type, target_id)
    WHERE status = 'open';
