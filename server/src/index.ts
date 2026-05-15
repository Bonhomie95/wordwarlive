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
import { createServer } from 'node:http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { loadWordBank } from './game/words.js';
import { errorHandler } from './middleware/errorHandler.js';
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
    app.use(
        cors({
            origin: env.corsOrigins as string | string[],
            credentials: true,
        })
    );
    app.use(express.json({ limit: '64kb' }));

    app.get('/healthz', (_req, res) => {
        res.json({ ok: true, env: env.NODE_ENV });
    });

    app.use('/api/auth', authRouter);
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

    const shutdown = async () => {
        logger.info('Shutting down…');
        httpServer.close(() => process.exit(0));
        // Force-exit after 10s
        setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

main().catch((err) => {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
});
