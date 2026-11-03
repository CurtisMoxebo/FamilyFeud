import { Request, Response } from 'express';
import { prisma } from '../services/db';
import { generateUniqueRoomCode, normalizeRoomCode } from '../utils/roomCode';
import { logger } from '../utils/logger';
import { CreateRoomInput } from '../validators/roomValidator';
import { sessionRecoveryService } from '../services/sessionRecoveryService';

/**
 * POST /api/rooms
 * Creates a new room session in the database with status 'LOBBY'.
 */
export async function createRoom(
  req: Request<Record<string, unknown>, Record<string, unknown>, CreateRoomInput>,
  res: Response
): Promise<void> {
  try {
    const { roomName, language, gameMode } = req.body;

    const roomCode = await generateUniqueRoomCode(prisma);

    const room = await prisma.room.create({
      data: {
        roomCode,
        roomName,
        language,
        gameMode,
        status: 'LOBBY',
      },
      select: {
        id: true,
        roomCode: true,
        roomName: true,
        language: true,
        gameMode: true,
        status: true,
        createdAt: true,
      },
    });

    logger.info(
      `[ROOM:CREATE] Created room ${room.roomCode} ("${room.roomName}", lang: ${room.language}, mode: ${room.gameMode})`
    );

    const hostSecret = sessionRecoveryService.createHostSecret(room.roomCode);

    res.status(201).json({
      success: true,
      room: {
        ...room,
        hostSecret,
      },
      hostSecret,
    });
  } catch (error) {
    logger.error('Failed to create room', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create room session',
    });
  }
}

/**
 * GET /api/rooms/:roomCode
 * Fetches an existing room by its room code including roster players.
 */
export async function getRoomByCode(
  req: Request<{ roomCode: string }>,
  res: Response
): Promise<void> {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);

    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: {
        id: true,
        roomCode: true,
        roomName: true,
        language: true,
        gameMode: true,
        status: true,
        createdAt: true,
        players: {
          select: {
            id: true,
            nickname: true,
            team: true,
            isReady: true,
            isConnected: true,
          },
        },
      },
    });

    if (!room) {
      res.status(404).json({
        success: false,
        error: 'Room not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      room,
    });
  } catch (error) {
    logger.error(`Failed to fetch room ${req.params.roomCode}`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch room details',
    });
  }
}

