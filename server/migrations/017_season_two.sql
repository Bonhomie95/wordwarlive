-- Season 2 for the battle pass, dated relative to NOW() at migration time so
-- the pass is active out of the box (Season 1 expired 2026-07-31). A future
-- season rotation would insert Season 3 the same way. 90-day window.

INSERT INTO battle_pass_seasons (season_number, name, starts_at, ends_at, xp_per_tier, max_tier)
VALUES (2, 'Season Two: Sharper Words', now() - interval '1 day', now() + interval '90 days', 100, 50)
ON CONFLICT (season_number) DO NOTHING;

-- Reward ladder (reuses the seeded cosmetics catalog). Free track is earnable
-- by everyone; premium track needs the $3.99 unlock.
INSERT INTO battle_pass_rewards (season_number, tier, track, cosmetic_id) VALUES
  (2, 5,  'free', 'theme_paper'),
  (2, 12, 'free', 'avatar_fox_01'),
  (2, 20, 'free', 'victory_confetti'),
  (2, 35, 'free', 'theme_neon'),
  (2, 50, 'free', 'border_diamond'),
  (2, 1,  'premium', 'theme_obsidian'),
  (2, 6,  'premium', 'avatar_owl_01'),
  (2, 10, 'premium', 'nameplate_gold'),
  (2, 18, 'premium', 'victory_lightning'),
  (2, 30, 'premium', 'nameplate_rainbow'),
  (2, 45, 'premium', 'border_legend')
ON CONFLICT (season_number, tier, track) DO NOTHING;
