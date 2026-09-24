-- Sign in with Apple: Apple requires apps to revoke the user's tokens when the
-- account is deleted (App Store guideline 5.1.1(v)). We exchange the one-time
-- authorization code for a refresh token at sign-in and keep it here so
-- deleteAccount() can call Apple's /auth/revoke.
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_refresh_token text;
