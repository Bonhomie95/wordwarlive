-- Expo push notification tokens. One row per device; a user can have several.
-- Used to deliver friend-challenge invites and turn-reminders when the app
-- isn't foregrounded.

CREATE TABLE IF NOT EXISTS push_tokens (
    token       text PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform    text CHECK (platform IN ('ios', 'android')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens (user_id);
