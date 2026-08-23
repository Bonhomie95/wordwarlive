// Per-request logging with a correlation id. Every request gets an id (either
// the inbound X-Request-Id or a fresh uuid) that's attached to the response
// header and logged with the method/path/status/duration. This is what lets
// you trace a single user's request across logs when debugging production.

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            id?: string;
        }
    }
}

export function requestLogger(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const id = req.header('x-request-id') || randomUUID();
    req.id = id;
    res.setHeader('x-request-id', id);

    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
        // Health checks are noisy; log them at debug only.
        const level =
            req.path === '/healthz' || req.path === '/readyz' ? 'debug' : 'info';
        logger[level](
            {
                reqId: id,
                method: req.method,
                path: req.path,
                status: res.statusCode,
                ms: Math.round(ms),
            },
            'request'
        );
    });
    next();
}
