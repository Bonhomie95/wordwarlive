import type { ErrorRequestHandler } from 'express';
import { captureException } from '../observability/index.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    captureException(err, { reqId: req.id, path: req.path, method: req.method });
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
};
