-- Back-pay today's daily solvers who solved before the reward existed
-- (022 added coins_awarded). One statement; runs inside the migration tx.
WITH s AS (
    UPDATE daily_challenge_attempts
       SET coins_awarded = 15
     WHERE solved AND coins_awarded = 0
       AND challenge_date = (now() AT TIME ZONE 'utc')::date
    RETURNING user_id
), g AS (
    INSERT INTO coin_grants (user_id, amount, source, metadata)
    SELECT user_id, 15, 'daily_solve', '{"backfill": true}'::jsonb FROM s
)
UPDATE users u SET coins = u.coins + 15, updated_at = now()
  FROM s WHERE u.id = s.user_id;
