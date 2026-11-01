import { Request, Response, NextFunction } from 'express';
import { logger, getClientIp } from '../utils/logger';

/**
 * Express middleware that intercepts all incoming HTTP requests and logs:
 * - Client IP address (with proxy support)
 * - Exact ISO timestamp
 * - HTTP Method & URL path
 * - Response status code
 * - Execution duration in milliseconds
 * - User-Agent header
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Unknown';

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    const path = req.originalUrl || req.url;

    logger.http(req.method, path, res.statusCode, durationMs, clientIp, userAgent);
  });

  next();
}

