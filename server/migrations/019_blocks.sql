-- User blocking (App Store 1.2 UGC requirement: users must be able to block
-- abusive users). A block prevents the two users from being matched together
-- (random + mystery), from challenging each other, and ends any friendship.
CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);
-- Reverse lookup: "who has blocked me" (for the either-direction match filter).
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks (blocked_id);
