// Server entry point. Wires up Express + Socket.io + Postgres + Redis.
//
//   GET  /healthz                  — process liveness probe
//   *    /api/auth/*                — authentication endpoints
//   *    /api/users/*, /api/me/*    — profiles and equipping
//   *    /api/matches/*             — match history
//   *    /api/cosmetics/*           — shop / inventory
//   *    /api/battlepass/*          — battle pass UI
//   socket /                        — real-time gameplay (JWT in handshake)

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { loadWordBank } from './game/words.js';
import { pool } from './db/pool.js';
import { redis } from './db/redis.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter, authLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import { initObservability, captureException } from './observability/index.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { matchesRouter } from './routes/matches.js';
import { cosmeticsRouter } from './routes/cosmetics.js';
import { battlePassRouter } from './routes/battlepass.js';
import { adsRouter } from './routes/ads.js';
import { coinsRouter } from './routes/coins.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { dailyRouter } from './routes/daily.js';
import { settingsRouter } from './routes/settings.js';
import { seasonsRouter } from './routes/seasons.js';
import { mysteryRouter } from './routes/mystery.js';
import { friendsRouter } from './routes/friends.js';
import { replaysRouter } from './routes/replays.js';
import { reportsRouter } from './routes/reports.js';
import { pushRouter } from './routes/push.js';
import { adminRouter } from './routes/admin.js';
import { blocksRouter } from './routes/blocks.js';
import { legalRouter } from './routes/legal.js';
import { createSocketServer } from './socket/server.js';
import { matchRegistry } from './socket/matchHandler.js';
import { resetMatchmakingQueue } from './socket/matchmaking.js';
import { setShuttingDown } from './socket/drain.js';

async function main() {
    await initObservability();

    // Fail-loud production guardrails: wide-open CORS or an unverified IAP
    // path in production are almost always misconfigurations.
    if (env.NODE_ENV === 'production') {
        if (env.corsOrigins === '*') {
            logger.warn(
                'CORS_ORIGINS is "*" in production — lock this down to your real client origins.'
            );
        }
        if (!env.IAP_ENFORCE) {
            logger.warn(
                'IAP_ENFORCE is off in production — purchases are granted WITHOUT verifying store receipts.'
            );
        }
        if (env.APPLE_BUNDLE_ID && !env.appleRevokeConfigured) {
            logger.warn(
                'APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY not set — Sign in with Apple tokens will NOT be revoked on account deletion (Apple requires this).'
            );
        }
        if (!env.METRICS_TOKEN) {
            logger.warn('METRICS_TOKEN is empty — GET /metrics is publicly readable.');
        }
    }

    // Word bank must be loaded before any guess validation runs.
    await loadWordBank();

    // Clear any stale matchmaking queue left behind by a previous run of this
    // node id (e.g. a crash without a clean shutdown).
    await resetMatchmakingQueue();

    // Promote any configured bootstrap admins (ADMIN_EMAILS). Idempotent.
    if (env.adminEmails.length) {
        const { promoteAdminEmails } = await import('./services/adminService.js');
        const n = await promoteAdminEmails(env.adminEmails).catch(() => 0);
        if (n) logger.info({ promoted: n }, 'Promoted bootstrap admin(s)');
    }

    const app = express();
    // Behind a proxy/LB, trust exactly TRUST_PROXY hops so rate limiting keys
    // on the real client IP rather than the proxy's.
    app.set('trust proxy', env.TRUST_PROXY);
    // Security headers. The API is JSON-only (no HTML), so the default CSP
    // isn't relevant; keep the rest of helmet's protections.
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(
        cors({
            origin: env.corsOrigins as string | string[],
            credentials: true,
        })
    );
    app.use(express.json({ limit: '64kb' }));
    app.use(requestLogger);

    // Liveness — is the process up? Cheap, no I/O.
    app.get('/healthz', (_req, res) => {
        res.json({ ok: true, env: env.NODE_ENV });
    });

    // Readiness — can we actually serve traffic? Checks Postgres + Redis.
    // Orchestrators should gate traffic on this, not /healthz.
    app.get('/readyz', async (_req, res) => {
        const checks = { db: false, redis: false };
        try {
            await pool.query('SELECT 1');
            checks.db = true;
        } catch (err) {
            logger.warn({ err }, 'Readiness: Postgres check failed');
        }
        try {
            await redis.ping();
            checks.redis = true;
        } catch (err) {
            logger.warn({ err }, 'Readiness: Redis check failed');
        }
        const ok = checks.db && checks.redis;
        res.status(ok ? 200 : 503).json({ ok, checks });
    });

    // Broad limiter across the whole API; strict limiter on auth.
    app.use('/api', apiLimiter);
    app.use('/api/auth', authLimiter, authRouter);
    app.use('/api', usersRouter);
    app.use('/api', matchesRouter);
    app.use('/api', cosmeticsRouter);
    app.use('/api', battlePassRouter);
    app.use('/api', adsRouter);
    app.use('/api', coinsRouter);
    app.use('/api', leaderboardRouter);
    app.use('/api', dailyRouter);
    app.use('/api', settingsRouter);
    app.use('/api', seasonsRouter);
    app.use('/api', mysteryRouter);
    app.use('/api', friendsRouter);
    app.use('/api', replaysRouter);
    app.use('/api', reportsRouter);
    app.use('/api', pushRouter);
    app.use('/api', adminRouter);
    app.use('/api', blocksRouter);

    // Public legal pages (privacy / terms / delete-account). Outside /api so the
    // API rate limiter and JSON-only assumptions don't apply.
    app.use(legalRouter);

    // Operational metrics. Guarded by METRICS_TOKEN when set (send it as
    // `Authorization: Bearer <token>`); otherwise open for internal scraping.
    app.get('/metrics', async (req, res) => {
        if (env.METRICS_TOKEN) {
            const hdr = req.header('authorization') ?? '';
            if (hdr !== `Bearer ${env.METRICS_TOKEN}`) {
                return res.status(401).json({ error: 'unauthorized' });
            }
        }
        let queueDepth = 0;
        let onlineCount = 0;
        try {
            // This node's own matchmaking queue (queues are per-node).
            queueDepth = await redis.zcard(`mm:queue:${env.nodeId}`);
            onlineCount = await redis.hlen('presence:u2s');
        } catch {
            // metrics are best-effort
        }
        res.json({
            nodeId: env.nodeId,
            uptimeSeconds: Math.round(process.uptime()),
            activeMatches: matchRegistry.activeMatchCount(),
            queueDepth,
            onlineUsers: onlineCount,
            pool: {
                total: pool.totalCount,
                idle: pool.idleCount,
                waiting: pool.waitingCount,
            },
            memory: process.memoryUsage(),
        });
    });

    app.use(errorHandler);

    const httpServer = createServer(app);
    const io = createSocketServer(httpServer);

    httpServer.listen(env.PORT, () => {
        logger.info(
            { port: env.PORT, env: env.NODE_ENV, nodeId: env.nodeId },
            'WordWar server listening'
        );
    });

    let shuttingDown = false;
    const shutdown = async () => {
        if (shuttingDown) return; // ignore a second SIGTERM/SIGINT
        shuttingDown = true;
        setShuttingDown(true); // matchmaking refuses new joins from here on
        logger.info('Shutting down…');

        // Hard cap on the whole graceful sequence.
        const force = setTimeout(() => process.exit(1), 30_000).unref();

        // Stop accepting new HTTP connections immediately.
        httpServer.close();

        // Give in-flight matches a bounded window to finish naturally so we
        // don't yank players out mid-game on a deploy. Poll the live match
        // count; bail out early once it hits zero.
        const DRAIN_MS = 25_000;
        const drainDeadline = Date.now() + DRAIN_MS;
        try {
            io.emit('server_restarting', { graceMs: DRAIN_MS });
        } catch {
            // best-effort notice only
        }
        while (
            matchRegistry.activeMatchCount() > 0 &&
            Date.now() < drainDeadline
        ) {
            await new Promise((r) => setTimeout(r, 500));
        }
        const remaining = matchRegistry.activeMatchCount();
        if (remaining > 0) {
            logger.warn({ remaining }, 'Draining timed out with matches still active');
        }

        // Close sockets, then drain the backing stores.
        try {
            await new Promise<void>((resolve) => io.close(() => resolve()));
            await Promise.allSettled([pool.end(), redis.quit()]);
        } catch (err) {
            logger.error({ err }, 'Error draining connections on shutdown');
        }
        clearTimeout(force);
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

main().catch((err) => {
    captureException(err, { phase: 'startup' });
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
});
