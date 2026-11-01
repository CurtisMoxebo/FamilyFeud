import { Request } from 'express';
import { Socket } from 'socket.io';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'HTTP' | 'SOCKET' | 'DEBUG';

// ANSI escape codes for terminal colorizing
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

/**
 * Normalizes an IP address string:
 * Converts IPv6-mapped IPv4 addresses (e.g., '::ffff:127.0.0.1') and loopback '::1'
 * to standard clean IPv4 formatting.
 */
export function normalizeIp(ip?: string | null): string {
  if (!ip) return '127.0.0.1';
  let cleanIp = ip.trim();

  // Strip IPv6 prefix for IPv4-mapped addresses
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  }

  // Normalize localhost loopback
  if (cleanIp === '::1') {
    cleanIp = '127.0.0.1';
  }

  return cleanIp;
}

/**
 * Extracts the real client IP address from an Express HTTP request,
 * inspecting proxy headers (X-Forwarded-For) followed by socket connection address.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    // If multiple proxy hops, client IP is the first entry
    const clientIp = forwarded.split(',')[0].trim();
    return normalizeIp(clientIp);
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return normalizeIp(forwarded[0].trim());
  }

  return normalizeIp(req.socket.remoteAddress || req.ip);
}

/**
 * Extracts the real client IP address from a Socket.io WebSocket connection.
 */
export function getSocketIp(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const clientIp = forwarded.split(',')[0].trim();
    return normalizeIp(clientIp);
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return normalizeIp(forwarded[0].trim());
  }

  return normalizeIp(socket.handshake.address);
}

/**
 * Centralized logging utility with timestamps, user IP tracking, and severity levels.
 */
export const logger = {
  info(message: string, meta?: Record<string, any>) {
    const ts = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`${colors.dim}[${ts}]${colors.reset} ${colors.cyan}[INFO]${colors.reset} ${message}${metaStr}`);
  },

  warn(message: string, meta?: Record<string, any>) {
    const ts = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.warn(`${colors.dim}[${ts}]${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${message}${metaStr}`);
  },

  error(message: string, error?: any, meta?: Record<string, any>) {
    const ts = new Date().toISOString();
    const errDetails = error?.stack || error?.message || (error ? JSON.stringify(error) : '');
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.error(
      `${colors.dim}[${ts}]${colors.reset} ${colors.red}[ERROR]${colors.reset} ${message} ${errDetails}${metaStr}`
    );
  },

  http(method: string, path: string, statusCode: number, durationMs: number, ip: string, userAgent?: string) {
    const ts = new Date().toISOString();

    // Color code status: 2xx green, 3xx cyan, 4xx yellow, 5xx red
    let statusColor = colors.green;
    if (statusCode >= 500) statusColor = colors.red;
    else if (statusCode >= 400) statusColor = colors.yellow;
    else if (statusCode >= 300) statusColor = colors.cyan;

    const durationStr = `${durationMs.toFixed(2)}ms`;
    const uaStr = userAgent ? ` | UA: "${userAgent}"` : '';

    console.log(
      `${colors.dim}[${ts}]${colors.reset} ${colors.blue}[HTTP]${colors.reset} ` +
      `${colors.bold}${method}${colors.reset} ${path} ${statusColor}${statusCode}${colors.reset} ` +
      `${colors.dim}(${durationStr})${colors.reset} - IP: ${colors.green}${ip}${colors.reset}${uaStr}`
    );
  },

  socket(event: 'CONNECT' | 'DISCONNECT' | 'EVENT', socketId: string, ip: string, details?: string) {
    const ts = new Date().toISOString();
    const extra = details ? ` - ${details}` : '';
    console.log(
      `${colors.dim}[${ts}]${colors.reset} ${colors.magenta}[SOCKET:${event}]${colors.reset} ` +
      `ID: ${socketId} | IP: ${colors.green}${ip}${colors.reset}${extra}`
    );
  },
};

