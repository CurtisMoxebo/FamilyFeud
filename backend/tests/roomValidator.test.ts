import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  createRoomSchema,
  roomCodeParamSchema,
} from '../src/validators/roomValidator';
import { validateRequest } from '../src/middleware/validate';
import { Request, Response, NextFunction } from 'express';

describe('Backend Regression Suite: Room Validation Schemas & Middleware (US-02 & US-29)', () => {
  describe('createRoomSchema', () => {
    it('accepts valid room creation payloads for all supported languages and modes', () => {
      const payloads = [
        { language: 'EN', gameMode: 'FAST_MONEY' },
        { language: 'FR', gameMode: 'MAIN_GAME' },
        { language: 'ES', gameMode: 'FAST_MONEY' },
      ];

      for (const payload of payloads) {
        const result = createRoomSchema.safeParse(payload);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.language).toBe(payload.language);
          expect(result.data.gameMode).toBe(payload.gameMode);
        }
      }
    });

    it('rejects unsupported or missing language codes', () => {
      const cases = [
        { language: 'DE', gameMode: 'FAST_MONEY' },
        { language: 'IT', gameMode: 'FAST_MONEY' },
        { gameMode: 'FAST_MONEY' },
      ];

      for (const item of cases) {
        const result = createRoomSchema.safeParse(item);
        expect(result.success).toBe(false);
        if (!result.success) {
          const langError = result.error.errors.find((e) => e.path.includes('language'));
          expect(langError?.message).toBe('Language must be one of: EN, FR, ES');
        }
      }
    });

    it('rejects unsupported or missing game modes', () => {
      const cases = [
        { language: 'EN', gameMode: 'SURVIVAL' },
        { language: 'EN' },
      ];

      for (const item of cases) {
        const result = createRoomSchema.safeParse(item);
        expect(result.success).toBe(false);
        if (!result.success) {
          const modeError = result.error.errors.find((e) => e.path.includes('gameMode'));
          expect(modeError?.message).toBe('Game mode must be either FAST_MONEY or MAIN_GAME');
        }
      }
    });
  });

  describe('roomCodeParamSchema', () => {
    it('accepts valid room codes and normalizes to uppercase', () => {
      const validCases = ['FEUD-2345', 'feud-abcd', '  FEUD-WXYZ  '];

      for (const code of validCases) {
        const result = roomCodeParamSchema.safeParse({ roomCode: code });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.roomCode).toBe(code.trim().toUpperCase());
        }
      }
    });

    it('rejects malformed room codes with descriptive error', () => {
      const invalidCases = ['FEUD-1111', 'FEUD-0000', 'FEUD-TOO-LONG', 'INVALID', ''];

      for (const code of invalidCases) {
        const result = roomCodeParamSchema.safeParse({ roomCode: code });
        expect(result.success).toBe(false);
        if (!result.success) {
          const error = result.error.errors.find((e) => e.path.includes('roomCode'));
          expect(error?.message).toBe('Invalid room code format (must be FEUD-XXXX)');
        }
      }
    });
  });

  describe('validateRequest middleware', () => {
    it('calls next() when validation succeeds', async () => {
      const middleware = validateRequest({ body: createRoomSchema });
      const req = {
        body: { language: 'EN', gameMode: 'FAST_MONEY' },
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 400 with structured JSON error when body validation fails', async () => {
      const middleware = validateRequest({ body: createRoomSchema });
      const req = {
        body: { language: 'INVALID', gameMode: 'UNKNOWN' },
      } as unknown as Request;
      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = {
        status: statusMock,
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Validation failed',
          message: expect.any(String),
          details: expect.any(Array),
        })
      );
    });

    it('returns 400 when params validation fails', async () => {
      const middleware = validateRequest({ params: roomCodeParamSchema });
      const req = {
        params: { roomCode: 'BAD-CODE' },
      } as unknown as Request;
      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = {
        status: statusMock,
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Validation failed',
          message: 'Invalid room code format (must be FEUD-XXXX)',
        })
      );
    });

    it('validates query parameters when schema.query is provided', async () => {
      const middleware = validateRequest({
        query: z.object({ search: z.string().min(1) }),
      });
      const req = {
        query: { search: 'test' },
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 400 with generic error message when unexpected non-Zod error is thrown', async () => {
      const badSchema = {
        parseAsync: vi.fn().mockRejectedValue(new Error('Internal parser failure')),
      } as unknown as any;
      const middleware = validateRequest({ body: badSchema });
      const req = { body: {} } as unknown as Request;
      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = {
        status: statusMock,
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid request payload',
      });
    });
  });
});
