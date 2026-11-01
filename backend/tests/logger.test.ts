import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, normalizeIp, getClientIp, getSocketIp } from '../src/utils/logger';
import { requestLogger } from '../src/middleware/requestLogger';
import { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';

describe('Backend Regression Suite: Logger System & IP Resolution', () => {
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeIp', () => {
    it('defaults to 127.0.0.1 if input is empty or null', () => {
      expect(normalizeIp()).toBe('127.0.0.1');
      expect(normalizeIp(null)).toBe('127.0.0.1');
      expect(normalizeIp('')).toBe('127.0.0.1');
    });

    it('strips IPv6-mapped IPv4 prefix (::ffff:)', () => {
      expect(normalizeIp('::ffff:192.168.1.45')).toBe('192.168.1.45');
    });

    it('normalizes IPv6 loopback (::1) to 127.0.0.1', () => {
      expect(normalizeIp('::1')).toBe('127.0.0.1');
    });

    it('preserves clean standard IPv4 addresses', () => {
      expect(normalizeIp('10.0.0.5')).toBe('10.0.0.5');
    });
  });

  describe('getClientIp', () => {
    it('extracts client IP from x-forwarded-for header string (first entry)', () => {
      const mockReq = {
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
        },
        socket: {},
      } as unknown as Request;

      expect(getClientIp(mockReq)).toBe('203.0.113.195');
    });

    it('extracts client IP from x-forwarded-for header array', () => {
      const mockReq = {
        headers: {
          'x-forwarded-for': ['198.51.100.1', '10.0.0.1'],
        },
        socket: {},
      } as unknown as Request;

      expect(getClientIp(mockReq)).toBe('198.51.100.1');
    });

    it('falls back to socket.remoteAddress if x-forwarded-for is missing', () => {
      const mockReq = {
        headers: {},
        socket: { remoteAddress: '::ffff:172.16.0.1' },
      } as unknown as Request;

      expect(getClientIp(mockReq)).toBe('172.16.0.1');
    });
  });

  describe('getSocketIp', () => {
    it('extracts IP from socket handshake header', () => {
      const mockSocket = {
        handshake: {
          headers: { 'x-forwarded-for': '192.168.1.200' },
          address: '127.0.0.1',
        },
      } as any;

      expect(getSocketIp(mockSocket)).toBe('192.168.1.200');
    });

    it('falls back to socket handshake address if header is absent', () => {
      const mockSocket = {
        handshake: {
          headers: {},
          address: '::ffff:192.168.1.55',
        },
      } as any;

      expect(getSocketIp(mockSocket)).toBe('192.168.1.55');
    });
  });

  describe('logger methods', () => {
    it('logs INFO messages with timestamp', () => {
      logger.info('Server started', { port: 5000 });
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[INFO]');
      expect(output).toContain('Server started');
      expect(output).toContain('"port":5000');
    });

    it('logs WARN messages with timestamp', () => {
      logger.warn('High latency detected');
      expect(consoleWarnSpy).toHaveBeenCalled();
      const output = consoleWarnSpy.mock.calls[0][0];
      expect(output).toContain('[WARN]');
      expect(output).toContain('High latency detected');
    });

    it('logs ERROR messages with error stack/details', () => {
      const err = new Error('Database connection failed');
      logger.error('Database query failure', err);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('[ERROR]');
      expect(output).toContain('Database query failure');
      expect(output).toContain('Database connection failed');
    });

    it('logs HTTP requests with method, path, status, duration, and user IP', () => {
      logger.http('GET', '/api/health', 200, 1.45, '192.168.1.50', 'TestAgent/1.0');
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[HTTP]');
      expect(output).toContain('GET');
      expect(output).toContain('/api/health');
      expect(output).toContain('200');
      expect(output).toContain('1.45ms');
      expect(output).toContain('192.168.1.50');
      expect(output).toContain('TestAgent/1.0');
    });

    it('logs SOCKET events with socket ID and client IP', () => {
      logger.socket('CONNECT', 'sock-abc-123', '10.0.0.5', 'Transport: websocket');
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[SOCKET:CONNECT]');
      expect(output).toContain('sock-abc-123');
      expect(output).toContain('10.0.0.5');
      expect(output).toContain('Transport: websocket');
    });
  });

  describe('requestLogger middleware', () => {
    it('calls next() and logs response upon finish event', () => {
      const mockReq = {
        method: 'GET',
        url: '/api/test',
        originalUrl: '/api/test',
        headers: { 'user-agent': 'VitestClient', 'x-forwarded-for': '192.168.1.99' },
        socket: {},
      } as unknown as Request;

      const mockRes = new EventEmitter() as unknown as Response & EventEmitter;
      (mockRes as any).statusCode = 200;

      const mockNext = vi.fn() as NextFunction;

      requestLogger(mockReq, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);

      // Trigger finish event
      mockRes.emit('finish');

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[HTTP]');
      expect(output).toContain('GET');
      expect(output).toContain('/api/test');
      expect(output).toContain('200');
      expect(output).toContain('192.168.1.99');
    });
  });
});

