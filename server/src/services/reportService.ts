// User-generated-content reports (offensive usernames, mystery words, match
// opponents). Intake only — reports land in `content_reports` for out-of-band
// review. A unique partial index dedups open reports per (reporter, target).

import { col, newId, registerIndexes } from '../db/mongo.js';

registerIndexes('content_reports', [
    { key: { id: 1 }, unique: true },
    { key: { status: 1, created_at: -1 } },
    // One open report per (reporter, target) so a user can't spam-report.
    {
        key: { reporter_id: 1, target_type: 1, target_id: 1 },
        unique: true,
        partialFilterExpression: { status: 'open' },
    },
]);

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
    const id = newId();
    try {
        await col('content_reports').insertOne({
            id,
            reporter_id: args.reporterId,
            target_type: args.targetType,
            target_id: args.targetId ?? null,
            reason: args.reason,
            detail: args.detail ? args.detail.slice(0, 1000) : null,
            status: 'open',
            created_at: new Date(),
        });
    } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
        // Already reported (open) — treat as success so the UI is idempotent.
        return { ok: true, id: 'existing' };
    }
    return { ok: true, id };
}
