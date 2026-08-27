-- Admin panel + moderation support.
--   is_admin      → gates the /api/admin/* surface.
--   banned        → a banned user's sessions are rejected (auth + socket) and
--                   their token_version is bumped on ban so live sessions drop.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin     boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned       boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at    timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by    uuid;

CREATE INDEX IF NOT EXISTS idx_users_banned ON users (banned) WHERE banned = true;
CREATE INDEX IF NOT EXISTS idx_users_created ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_play ON users (last_play_date DESC);

-- Immutable trail of every mutating admin action (ban, delete, adjust, …).
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id          bigserial PRIMARY KEY,
    admin_id    uuid REFERENCES users(id) ON DELETE SET NULL,
    admin_name  text,
    action      text NOT NULL,
    target_type text,
    target_id   text,
    detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log (created_at DESC);
