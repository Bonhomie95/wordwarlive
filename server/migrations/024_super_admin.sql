-- Preserve existing operators' full access; new promoted admins are moderators.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;
UPDATE users SET is_super_admin = true WHERE is_admin = true;
ALTER TABLE users ADD CONSTRAINT super_admin_requires_admin CHECK (NOT is_super_admin OR is_admin);
