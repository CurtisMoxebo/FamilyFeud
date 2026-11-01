import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  createRoomSchema,
  roomCodeParamSchema,
} from '../src/validators/roomValidator';
import { validateRequest } from '../src/middleware/validate';
import { Request, Response, NextFunction } from 'express';

describe('Backend Regression Suite: Room Validation Schemas & Middleware (US-02)', () => {
  describe('createRoomSchema', () => {
    it('accepts valid room creation payloads for all supported languages and modes', () => {
      const payloads = [
        { roomName: 'Family Game Night', language: 'EN', gameMode: 'FAST_MONEY' },
        { roomName: 'Soirée Famille', language: 'FR', gameMode: 'MAIN_GAME' },
        { roomName: 'Noche en Familia', language: 'ES', gameMode: 'FAST_MONEY' },
      ];

      for (const payload of payloads) {
        const result = createRoomSchema.safeParse(payload);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.roomName).toBe(payload.roomName);
          expect(result.data.language).toBe(payload.language);
          expect(result.data.gameMode).toBe(payload.gameMode);
        }
      }
    });

    it('trims leading and trailing whitespace from roomName', () => {
      const result = createRoomSchema.safeParse({
        roomName: '   Game Night   ',
        language: 'EN',
        gameMode: 'FAST_MONEY',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.roomName).toBe('Game Night');
      }
    });

    it('rejects empty or whitespace-only room names with specific error message', () => {
      const cases = [
        { roomName: '', language: 'EN', gameMode: 'FAST_MONEY' },
        { roomName: '   ', language: 'FR', gameMode: 'MAIN_GAME' },
        { language: 'EN', gameMode: 'FAST_MONEY' }, // missing roomName
      ];

      for (const item of cases) {
        const result = createRoomSchema.safeParse(item);
        expect(result.success).toBe(false);
        if (!result.success) {
          const roomNameError = result.error.errors.find((e) => e.path.includes('roomName'));
          expect(roomNameError?.message).toBe('Please enter a room name (3-50 characters)');
        }
      }
    });

    it('rejects room names shorter than 3 characters', () => {
      const result = createRoomSchema.safeParse({
        roomName: 'AB',
        language: 'EN',
        gameMode: 'FAST_MONEY',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('Please enter a room name (3-50 characters)');
      }
    });

    it('rejects room names longer than 50 characters', () => {
      const result = createRoomSchema.safeParse({
        roomName: 'A'.repeat(51),
        language: 'EN',
        gameMode: 'FAST_MONEY',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('Please enter a room name (3-50 characters)');
      }
    });

    it('rejects unsupported or missing language codes', () => {
      const cases = [
        { roomName: 'Feud Party', language: 'DE', gameMode: 'FAST_MONEY' },
        { roomName: 'Feud Party', language: 'IT', gameMode: 'FAST_MONEY' },
        { roomName: 'Feud Party', gameMode: 'FAST_MONEY' },
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
        { roomName: 'Feud Party', language: 'EN', gameMode: 'SURVIVAL' },
        { roomName: 'Feud Party', language: 'EN' },
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
        body: { roomName: 'Family Feud', language: 'EN', gameMode: 'FAST_MONEY' },
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
        body: { roomName: '', language: 'INVALID', gameMode: 'UNKNOWN' },
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
