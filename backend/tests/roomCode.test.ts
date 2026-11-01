import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateRawRoomCode,
  isValidRoomCodeFormat,
  normalizeRoomCode,
  generateUniqueRoomCode,
  ROOM_CODE_CHARSET,
  ROOM_CODE_PREFIX,
  ROOM_CODE_RANDOM_LENGTH,
} from '../src/utils/roomCode';
import { PrismaClient } from '@prisma/client';

describe('Backend Regression Suite: Room Code Generation & Validation (US-02)', () => {
  describe('generateRawRoomCode', () => {
    it('generates a code with default prefix and length', () => {
      const code = generateRawRoomCode();
      expect(code.startsWith(ROOM_CODE_PREFIX)).toBe(true);
      expect(code.length).toBe(ROOM_CODE_PREFIX.length + ROOM_CODE_RANDOM_LENGTH);
    });

    it('generates a code containing only characters from the allowed charset', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateRawRoomCode();
        const randomPart = code.slice(ROOM_CODE_PREFIX.length);
        for (const char of randomPart) {
          expect(ROOM_CODE_CHARSET.includes(char)).toBe(true);
        }
      }
    });

    it('supports custom length and prefix', () => {
      const code = generateRawRoomCode(6, 'GAME-');
      expect(code.startsWith('GAME-')).toBe(true);
      expect(code.length).toBe(5 + 6);
    });

    it('generates pseudo-random and diverse codes across successive calls', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        codes.add(generateRawRoomCode());
      }
      // With 32^4 combinations, 50 calls should produce at least 45 unique codes
      expect(codes.size).toBeGreaterThanOrEqual(48);
    });
  });

  describe('isValidRoomCodeFormat', () => {
    it('returns true for valid room codes', () => {
      expect(isValidRoomCodeFormat('FEUD-2345')).toBe(true);
      expect(isValidRoomCodeFormat('FEUD-ABCD')).toBe(true);
      expect(isValidRoomCodeFormat('FEUD-WXYZ')).toBe(true);
    });

    it('returns true for lowercase codes and codes with whitespace (case-insensitive)', () => {
      expect(isValidRoomCodeFormat('feud-abcd')).toBe(true);
      expect(isValidRoomCodeFormat('  FEUD-ABCD  ')).toBe(true);
    });

    it('returns false for invalid prefixes', () => {
      expect(isValidRoomCodeFormat('GAME-ABCD')).toBe(false);
      expect(isValidRoomCodeFormat('ABCD-1234')).toBe(false);
      expect(isValidRoomCodeFormat('ABCD')).toBe(false);
    });

    it('returns false for codes with incorrect length', () => {
      expect(isValidRoomCodeFormat('FEUD-ABC')).toBe(false);
      expect(isValidRoomCodeFormat('FEUD-ABCDE')).toBe(false);
      expect(isValidRoomCodeFormat('FEUD-')).toBe(false);
    });

    it('returns false for codes with forbidden/confusing characters (0, O, 1, I)', () => {
      expect(isValidRoomCodeFormat('FEUD-0000')).toBe(false);
      expect(isValidRoomCodeFormat('FEUD-OOOO')).toBe(false);
      expect(isValidRoomCodeFormat('FEUD-1111')).toBe(false);
      expect(isValidRoomCodeFormat('FEUD-IIII')).toBe(false);
      expect(isValidRoomCodeFormat('FEUD-A1B2')).toBe(false);
    });

    it('returns false for non-string, null, or empty values', () => {
      expect(isValidRoomCodeFormat('')).toBe(false);
      expect(isValidRoomCodeFormat(null)).toBe(false);
      expect(isValidRoomCodeFormat(undefined)).toBe(false);
      expect(isValidRoomCodeFormat(12345)).toBe(false);
      expect(isValidRoomCodeFormat({})).toBe(false);
    });
  });

  describe('normalizeRoomCode', () => {
    it('trims leading/trailing whitespace and converts to uppercase', () => {
      expect(normalizeRoomCode('  feud-abcd  ')).toBe('FEUD-ABCD');
      expect(normalizeRoomCode('feud-9876')).toBe('FEUD-9876');
    });

    it('returns an empty string for non-string inputs', () => {
      expect(normalizeRoomCode(null)).toBe('');
      expect(normalizeRoomCode(undefined)).toBe('');
      expect(normalizeRoomCode(42)).toBe('');
    });
  });

  describe('generateUniqueRoomCode', () => {
    it('returns candidate on the first attempt when no collision occurs', async () => {
      const mockDb = {
        room: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaClient;

      const code = await generateUniqueRoomCode(mockDb);
      expect(isValidRoomCodeFormat(code)).toBe(true);
      expect(mockDb.room.findUnique).toHaveBeenCalledTimes(1);
    });

    it('retries when a collision occurs and returns a code once unique', async () => {
      const mockDb = {
        room: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce({ id: 'existing-room-1' })
            .mockResolvedValueOnce(null),
        },
      } as unknown as PrismaClient;

      const code = await generateUniqueRoomCode(mockDb);
      expect(isValidRoomCodeFormat(code)).toBe(true);
      expect(mockDb.room.findUnique).toHaveBeenCalledTimes(2);
    });

    it('throws an error if collisions persist through maxRetries', async () => {
      const mockDb = {
        room: {
          findUnique: vi.fn().mockResolvedValue({ id: 'colliding-room' }),
        },
      } as unknown as PrismaClient;

      await expect(generateUniqueRoomCode(mockDb, 3)).rejects.toThrow(
        'Failed to generate a unique room code after 3 attempts.'
      );
      expect(mockDb.room.findUnique).toHaveBeenCalledTimes(3);
    });
  });
});

