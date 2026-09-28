DELETE FROM match_checkpoints c WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=(c.state->>'p1UserId')::uuid) OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id=(c.state->>'p2UserId')::uuid);
ALTER TABLE match_checkpoints ADD COLUMN p1_id UUID GENERATED ALWAYS AS ((state->>'p1UserId')::uuid) STORED REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE match_checkpoints ADD COLUMN p2_id UUID GENERATED ALWAYS AS ((state->>'p2UserId')::uuid) STORED REFERENCES users(id) ON DELETE CASCADE;
