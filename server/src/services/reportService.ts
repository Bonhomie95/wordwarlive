// User-generated-content reports (offensive usernames, mystery words, match
// opponents). Intake only — reports land in `content_reports` for out-of-band
// review. A unique partial index dedups open reports per (reporter, target).

import { query } from '../db/pool.js';

export type ReportTargetType = 'user' | 'mystery_word' | 'match';
export type ReportReason =
    | 'offensive_name'
    | 'offensive_word'
    | 'cheating'
    | 'harassment'
    | 'other';

export interface CreateReportArgs {
    reporterId: string;
    targetType: ReportTargetType;
    targetId?: string | null;
    reason: ReportReason;
    detail?: string | null;
}

export async function createReport(
    args: CreateReportArgs
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    // Best-effort dedup: the partial unique index makes a second OPEN report
    // for the same target a no-op.
    const rows = await query<{ id: string }>(
        `INSERT INTO content_reports (reporter_id, target_type, target_id, reason, detail)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
            args.reporterId,
            args.targetType,
            args.targetId ?? null,
            args.reason,
            args.detail ? args.detail.slice(0, 1000) : null,
        ]
    );
    if (rows.length === 0) {
        // Already reported (open) — treat as success so the UI is idempotent.
        return { ok: true, id: 'existing' };
    }
    return { ok: true, id: rows[0]!.id };
}
