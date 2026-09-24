-- Revenue pass: give coins something to buy and add a few fair boosts.
--   cosmetics.price_coins   → cosmetics purchasable with coins (0 = cash only)
--   users.streak_shields    → held shields; each covers one missed day
--   users.xp_boost_until    → 2x battle-pass XP from matches until this time
--   users.starter_bundle_at → one-time starter bundle already claimed
--   users.coin_ads_*        → rewarded "watch an ad for coins" daily counter
--   users.username_changed_at → first rename is free, later ones cost coins
ALTER TABLE cosmetics ADD COLUMN IF NOT EXISTS price_coins integer NOT NULL DEFAULT 0;
UPDATE cosmetics SET price_coins = CASE price_cents
    WHEN 199 THEN 250 WHEN 299 THEN 400 WHEN 399 THEN 550
    WHEN 499 THEN 700 WHEN 599 THEN 850 WHEN 799 THEN 1100 ELSE 0 END
WHERE price_cents > 0 AND available_in_shop = TRUE AND price_coins = 0;

ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_shields integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_boost_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS starter_bundle_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS coin_ads_today integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS coin_ads_day date;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;
