import crypto from 'crypto';
import { prisma as defaultPrisma } from '../services/db';
import { PrismaClient } from '@prisma/client';

// Unambiguous alphanumeric charset avoiding easily confused characters (0/O, 1/I)
export const ROOM_CODE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_PREFIX = 'FEUD-';
export const ROOM_CODE_RANDOM_LENGTH = 4;
export const ROOM_CODE_REGEX = /^FEUD-[2-9A-HJ-NP-Z]{4}$/i;

/**
 * Generates a formatted random room code (e.g. "FEUD-8291" or "FEUD-A7B2").
 */
export function generateRawRoomCode(
  length = ROOM_CODE_RANDOM_LENGTH,
  prefix = ROOM_CODE_PREFIX
): string {
  let randomPart = '';
  const charsetLength = ROOM_CODE_CHARSET.length;
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, charsetLength);
    randomPart += ROOM_CODE_CHARSET[randomIndex];
  }
  return `${prefix}${randomPart}`.toUpperCase();
}

/**
 * Validates whether a given string is a valid room code format.
 */
export function isValidRoomCodeFormat(code: unknown): boolean {
  if (typeof code !== 'string') return false;
  return ROOM_CODE_REGEX.test(code.trim());
}

/**
 * Normalizes a room code to uppercase and trimmed format.
 */
export function normalizeRoomCode(code: unknown): string {
  if (typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

/**
 * Generates a collision-free room code by querying the database.
 * Retries up to maxRetries times if a collision is detected.
 */
export async function generateUniqueRoomCode(
  db: PrismaClient = defaultPrisma,
  maxRetries = 5
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const candidate = generateRawRoomCode();
    const existing = await db.room.findUnique({
      where: { roomCode: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new Error(`Failed to generate a unique room code after ${maxRetries} attempts.`);
}

