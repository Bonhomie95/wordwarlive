-- Session revocation support. `token_version` is embedded in every issued JWT
-- as the `tv` claim; requireAuth / the socket handshake reject a token whose
-- `tv` doesn't match the current row value. Bumping this column invalidates
-- every outstanding session for that user (used by "log out everywhere" and
-- as a defensive lever if a token is believed compromised).

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
