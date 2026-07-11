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
import { createSocketServer } from './socket/server.js';

async function main() {
    // Word bank must be loaded before any guess validation runs.
    await loadWordBank();

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

    app.use(errorHandler);

    const httpServer = createServer(app);
    createSocketServer(httpServer);

    httpServer.listen(env.PORT, () => {
        logger.info(
            { port: env.PORT, env: env.NODE_ENV },
            'WordWar server listening'
        );
    });

    let shuttingDown = false;
    const shutdown = async () => {
        if (shuttingDown) return; // ignore a second SIGTERM/SIGINT
        shuttingDown = true;
        logger.info('Shutting down…');
        // Force-exit if graceful close hangs.
        const force = setTimeout(() => process.exit(1), 10_000).unref();
        // Stop accepting new connections, then drain the pools.
        httpServer.close(async () => {
            try {
                await Promise.allSettled([pool.end(), redis.quit()]);
            } catch (err) {
                logger.error({ err }, 'Error draining connections on shutdown');
            }
            clearTimeout(force);
            process.exit(0);
        });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

main().catch((err) => {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
});
