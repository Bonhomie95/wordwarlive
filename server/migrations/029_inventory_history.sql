CREATE TABLE inventory_history (
 id BIGSERIAL PRIMARY KEY,user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 before_state JSONB NOT NULL,after_state JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inventory_history_player ON inventory_history(user_id,created_at DESC);
CREATE FUNCTION record_inventory_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_state jsonb; new_state jsonb;
BEGIN
 SELECT jsonb_object_agg(key,value) INTO old_state FROM jsonb_each(to_jsonb(OLD)) WHERE key IN ('hint_credits','powerup_reveal','powerup_scramble','powerup_lock','ads_removed','battle_pass_premium','equipped_avatar','equipped_board_theme','equipped_victory_anim','equipped_nameplate','equipped_profile_border','streak_shields');
 SELECT jsonb_object_agg(key,value) INTO new_state FROM jsonb_each(to_jsonb(NEW)) WHERE key IN ('hint_credits','powerup_reveal','powerup_scramble','powerup_lock','ads_removed','battle_pass_premium','equipped_avatar','equipped_board_theme','equipped_victory_anim','equipped_nameplate','equipped_profile_border','streak_shields');
 IF old_state IS DISTINCT FROM new_state THEN INSERT INTO inventory_history(user_id,before_state,after_state) VALUES(NEW.id,old_state,new_state); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER users_inventory_history AFTER UPDATE ON users FOR EACH ROW EXECUTE FUNCTION record_inventory_change();
