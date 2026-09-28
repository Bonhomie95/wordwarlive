import { query } from '../db/pool.js';
export async function playerTimeline(id: string, search = '', before = new Date().toISOString()) {
    return query(
        `WITH events AS (
 SELECT 'match' kind, id::text ref, ended_at at, jsonb_build_object('outcome',outcome,'winnerId',winner_id,'word',word) detail FROM matches WHERE player1_id=$1 OR player2_id=$1
 UNION ALL SELECT 'purchase', id::text, created_at, jsonb_build_object('product',product_id,'platform',platform,'verified',store_verified) FROM iap_transactions WHERE user_id=$1
 UNION ALL SELECT 'coins', id::text, created_at, jsonb_build_object('amount',amount,'source',source) FROM coin_grants WHERE user_id=$1
 UNION ALL SELECT 'cosmetic', cosmetic_id, acquired_at, jsonb_build_object('item',cosmetic_id,'via',acquired_via) FROM user_cosmetics WHERE user_id=$1
 UNION ALL SELECT 'inventory', id::text, created_at, jsonb_build_object('before',before_state,'after',after_state) FROM inventory_history WHERE user_id=$1
 UNION ALL SELECT 'moderation', id::text, created_at, jsonb_build_object('action',action,'admin',admin_name,'detail',detail) FROM admin_audit_log WHERE target_type='user' AND target_id=$1::text
 ) SELECT * FROM events WHERE at < $3::timestamptz AND (kind ILIKE '%'||$2||'%' OR detail::text ILIKE '%'||$2||'%') ORDER BY at DESC,ref DESC LIMIT 100`,
        [id, search, before],
    );
}
