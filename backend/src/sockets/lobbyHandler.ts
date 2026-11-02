import { Server as SocketIOServer, Socket } from 'socket.io';
import { PrismaClient, Room, Player } from '@prisma/client';
import { prisma as defaultPrisma } from '../services/db';
import { normalizeRoomCode } from '../utils/roomCode';
import { logger, getSocketIp } from '../utils/logger';

export interface JoinRoomPayload {
  roomCode: string;
  nickname?: string;
  isHost?: boolean;
}

export interface PlayerRosterItem {
  id: string;
  nickname: string;
  team: string;
  isReady: boolean;
  isConnected: boolean;
}

export interface RoomStateUpdate {
  roomCode: string;
  roomName: string;
  language: 'EN' | 'FR' | 'ES';
  gameMode: 'FAST_MONEY' | 'MAIN_GAME';
  status: 'LOBBY' | 'ACTIVE' | 'FINISHED';
  playerCount: number;
  maxPlayers: number;
  canStart: boolean;
  startDisabledReason?: string;
  players: PlayerRosterItem[];
}

export interface RoomErrorPayload {
  code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'ROOM_LOCKED' | 'INVALID_ROOM' | 'INVALID_NICKNAME' | 'SERVER_ERROR';
  message: string;
}

/**
 * Calculates whether a room can start based on gameMode capacity and player count.
 */
export function calculateCanStart(
  gameMode: 'FAST_MONEY' | 'MAIN_GAME',
  connectedCount: number
): { canStart: boolean; startDisabledReason?: string } {
  if (gameMode === 'FAST_MONEY') {
    if (connectedCount === 2) {
      return { canStart: true };
    }
    return {
      canStart: false,
      startDisabledReason: `Waiting for 2 players (current: ${connectedCount}/2)`,
    };
  }

  // MAIN_GAME rules: 2 to 10 players, must be even
  if (connectedCount < 2) {
    return {
      canStart: false,
      startDisabledReason: `At least 2 players required (current: ${connectedCount})`,
    };
  }
  if (connectedCount > 10) {
    return {
      canStart: false,
      startDisabledReason: 'Maximum 10 players allowed',
    };
  }
  if (connectedCount % 2 !== 0) {
    return {
      canStart: false,
      startDisabledReason: `Waiting for an even number of players (current: ${connectedCount})`,
    };
  }

  return { canStart: true };
}

/**
 * Formats full room state payload with dynamic capacity counters.
 */
export function buildRoomStateUpdate(room: Room & { players: Player[] }): RoomStateUpdate {
  const connectedPlayers = room.players.filter((p) => p.isConnected);
  const connectedCount = connectedPlayers.length;
  const maxPlayers = room.gameMode === 'FAST_MONEY' ? 2 : 10;
  const { canStart, startDisabledReason } = calculateCanStart(room.gameMode, connectedCount);

  return {
    roomCode: room.roomCode,
    roomName: room.roomName,
    language: room.language,
    gameMode: room.gameMode,
    status: room.status,
    playerCount: connectedCount,
    maxPlayers,
    canStart,
    startDisabledReason,
    players: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      team: p.team,
      isReady: p.isReady,
      isConnected: p.isConnected,
    })),
  };
}

/**
 * Registers WebSocket handlers for lobby roster, joining, and disconnection.
 */
export function registerLobbyHandlers(
  io: SocketIOServer,
  socket: Socket,
  db: PrismaClient = defaultPrisma
): void {
  socket.on(
    'join_room',
    async (
      data: JoinRoomPayload,
      callback?: (res: { success: boolean; error?: string; room?: RoomStateUpdate }) => void
    ) => {
      try {
        if (!data || !data.roomCode) {
          const err: RoomErrorPayload = {
            code: 'INVALID_ROOM',
            message: 'Invalid room code provided.',
          };
          socket.emit('room_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        const normalizedCode = normalizeRoomCode(data.roomCode);
        const room = await db.room.findUnique({
          where: { roomCode: normalizedCode },
          include: { players: true },
        });

        if (!room) {
          const err: RoomErrorPayload = {
            code: 'ROOM_NOT_FOUND',
            message: 'Room not found or session has ended.',
          };
          socket.emit('room_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        if (room.status !== 'LOBBY') {
          const err: RoomErrorPayload = {
            code: 'ROOM_LOCKED',
            message: 'Game has already started in this room.',
          };
          socket.emit('room_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        // Host attachment flow
        if (data.isHost) {
          socket.join(`room:${normalizedCode}`);
          socket.data = { roomCode: normalizedCode, isHost: true };

          const state = buildRoomStateUpdate(room);
          socket.emit('room_state_update', state);
          if (callback) callback({ success: true, room: state });
          return;
        }

        // Player attachment flow
        const rawNickname = data.nickname || '';
        const trimmedNickname = rawNickname.trim();

        if (trimmedNickname.length < 2 || trimmedNickname.length > 20) {
          const err: RoomErrorPayload = {
            code: 'INVALID_NICKNAME',
            message: 'Nickname must be between 2 and 20 characters.',
          };
          socket.emit('room_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        const existingPlayer = room.players.find(
          (p) => p.nickname.toLowerCase() === trimmedNickname.toLowerCase()
        );

        // If new player, check capacity lock (US-04 Scenario 2)
        if (!existingPlayer) {
          const connectedCount = room.players.filter((p) => p.isConnected).length;

          if (room.gameMode === 'FAST_MONEY' && connectedCount >= 2) {
            const err: RoomErrorPayload = {
              code: 'ROOM_FULL',
              message: 'This Fast Money room is already full (2/2 players).',
            };
            socket.emit('room_error', err);
            if (callback) callback({ success: false, error: err.message });
            return;
          }

          if (room.gameMode === 'MAIN_GAME' && connectedCount >= 10) {
            const err: RoomErrorPayload = {
              code: 'ROOM_FULL',
              message: 'This Main Game room is already full (10/10 players).',
            };
            socket.emit('room_error', err);
            if (callback) callback({ success: false, error: err.message });
            return;
          }
        }

        // Upsert player in database
        let player: Player;
        if (existingPlayer) {
          player = await db.player.update({
            where: { id: existingPlayer.id },
            data: { socketId: socket.id, isConnected: true },
          });
        } else {
          player = await db.player.create({
            data: {
              roomId: room.id,
              nickname: trimmedNickname,
              socketId: socket.id,
              isConnected: true,
              isReady: true,
            },
          });
        }

        socket.join(`room:${normalizedCode}`);
        socket.data = {
          roomCode: normalizedCode,
          playerId: player.id,
          nickname: player.nickname,
          isHost: false,
        };

        // Broadcast updated state to room
        const refreshedRoom = await db.room.findUnique({
          where: { roomCode: normalizedCode },
          include: { players: true },
        });

        if (refreshedRoom) {
          const state = buildRoomStateUpdate(refreshedRoom);
          io.to(`room:${normalizedCode}`).emit('room_state_update', state);
          if (callback) callback({ success: true, room: state });
        }
      } catch (error) {
        logger.error('Error handling join_room socket event', error);
        const err: RoomErrorPayload = {
          code: 'SERVER_ERROR',
          message: 'An unexpected server error occurred.',
        };
        socket.emit('room_error', err);
        if (callback) callback({ success: false, error: err.message });
      }
    }
  );

  // Handle player departure or disconnect (US-04 Scenario 4)
  socket.on('disconnect', async () => {
    const { roomCode, playerId } = socket.data || {};
    if (!roomCode) return;

    if (playerId) {
      try {
        await db.player.update({
          where: { id: playerId },
          data: { isConnected: false },
        });

        const refreshedRoom = await db.room.findUnique({
          where: { roomCode },
          include: { players: true },
        });

        if (refreshedRoom) {
          const state = buildRoomStateUpdate(refreshedRoom);
          io.to(`room:${roomCode}`).emit('room_state_update', state);
        }
      } catch (err) {
        logger.warn(`Failed to update player disconnect for ${playerId}: ${err}`);
      }
    }
  });
}

/**
 * Initializes socket server event listeners and wires all modules.
 */
export function setupSocketServer(io: SocketIOServer, db: PrismaClient = defaultPrisma): void {
  io.on('connection', (socket: Socket) => {
    const clientIp = getSocketIp(socket);
    const transport = socket.conn.transport.name;
    logger.socket('CONNECT', socket.id, clientIp, `Transport: ${transport}`);

    registerLobbyHandlers(io, socket, db);

    socket.on('disconnect', (reason) => {
      logger.socket('DISCONNECT', socket.id, clientIp, `Reason: ${reason}`);
    });
  });
}

