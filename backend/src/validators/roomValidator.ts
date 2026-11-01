import { z } from 'zod';
import { ROOM_CODE_REGEX } from '../utils/roomCode';

/**
 * Zod validation schema for POST /api/rooms request body.
 */
export const createRoomSchema = z.object({
  roomName: z
    .string({
      required_error: 'Please enter a room name (3-50 characters)',
      invalid_type_error: 'Please enter a room name (3-50 characters)',
    })
    .trim()
    .min(3, { message: 'Please enter a room name (3-50 characters)' })
    .max(50, { message: 'Please enter a room name (3-50 characters)' }),
  language: z.enum(['EN', 'FR', 'ES'], {
    errorMap: () => ({ message: 'Language must be one of: EN, FR, ES' }),
  }),
  gameMode: z.enum(['FAST_MONEY', 'MAIN_GAME'], {
    errorMap: () => ({ message: 'Game mode must be either FAST_MONEY or MAIN_GAME' }),
  }),
});

/**
 * Zod validation schema for :roomCode route parameters.
 */
export const roomCodeParamSchema = z.object({
  roomCode: z
    .string({
      required_error: 'Room code is required',
      invalid_type_error: 'Room code must be a string',
    })
    .trim()
    .transform((val) => val.toUpperCase())
    .refine((val) => ROOM_CODE_REGEX.test(val), {
      message: 'Invalid room code format (must be FEUD-XXXX)',
    }),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type RoomCodeParamInput = z.infer<typeof roomCodeParamSchema>;

