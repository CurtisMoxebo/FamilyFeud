/**
 * Host Administrative WebSocket Handlers (US-21)
 * Wires authoritative host controls: Pause/Resume countdown timers,
 * manual answer overrides with strike cancellations, and player kick operations.
 */
import { Socket, Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import defaultPrisma from '../services/db';
import { normalizeRoomCode } from '../utils/roomCode';
import { hostAdminService, ManualOverrideResult } from '../services/hostAdminService';
import { HostOverrideAnswerOption } from '../services/teamGuessingService';
import { logger } from '../utils/logger';

export interface HostPauseGamePayload {
  roomCode: string;
  hostSecret?: string;
}

export interface HostResumeGamePayload {
  roomCode: string;
  hostSecret?: string;
}

export interface HostOverrideAnswerPayload {
  roomCode: string;
  rankOrder: number;
  points?: number;
  teamId?: 'TEAM_1' | 'TEAM_2';
  hostSecret?: string;
}

export interface HostKickPlayerPayload {
  roomCode: string;
  playerId: string;
  hostSecret?: string;
}

export interface AdminErrorPayload {
  code: 'UNAUTHORIZED' | 'INVALID_ACTION' | 'ROOM_NOT_FOUND' | 'PLAYER_NOT_FOUND' | 'SERVER_ERROR';
  message: string;
}

/**
 * Registers WebSocket event listeners for Host Administrative Controls.
 */
export function registerAdminHandlers(
  io: SocketIOServer,
  socket: Socket,
  db: PrismaClient = defaultPrisma
): void {
  // 1. Host Pause Game Event (US-21 Scenario 1)
  socket.on(
    'host_pause_game',
    (
      data: HostPauseGamePayload,
      callback?: (res: { success: boolean; remainingTime?: number; error?: string }) => void
    ) => {
      try {
        const rawCode = data?.roomCode || socket.data?.roomCode;
        if (!rawCode) {
          const err: AdminErrorPayload = {
            code: 'INVALID_ACTION',
            message: 'Room code is required to pause the game.',
          };
          socket.emit('admin_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        const normalizedCode = normalizeRoomCode(rawCode);

        // Security Validation (DoD requirement: Non-host clients cannot trigger administrative events)
        if (!hostAdminService.isHostAuthorized(socket, normalizedCode, data?.hostSecret)) {
          logger.warn(
            `[ADMIN:UNAUTHORIZED] Unauthorized attempt to pause game in room ${normalizedCode} from socket ${socket.id}`
          );
          const err: AdminErrorPayload = {
            code: 'UNAUTHORIZED',
            message: 'Only the room host is authorized to pause the game.',
          };
          socket.emit('admin_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        const res = hostAdminService.pauseGame(normalizedCode, io);
        if (callback) {
          callback(res);
        }
      } catch (err: any) {
        logger.error(`[ADMIN:PAUSE_ERROR] Error pausing room: ${err?.message || err}`);
        const errorPayload: AdminErrorPayload = {
          code: 'SERVER_ERROR',
          message: 'An error occurred while pausing the game.',
        };
        socket.emit('admin_error', errorPayload);
        if (callback) callback({ success: false, error: errorPayload.message });
      }
    }
  );

  // 2. Host Resume Game Event (US-21 Scenario 1)
  socket.on(
    'host_resume_game',
    (
      data: HostResumeGamePayload,
      callback?: (res: { success: boolean; remainingTime?: number; error?: string }) => void
    ) => {
      try {
        const rawCode = data?.roomCode || socket.data?.roomCode;
        if (!rawCode) {
          const err: AdminErrorPayload = {
            code: 'INVALID_ACTION',
            message: 'Room code is required to resume the game.',
          };
          socket.emit('admin_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        const normalizedCode = normalizeRoomCode(rawCode);

        // Security Validation
        if (!hostAdminService.isHostAuthorized(socket, normalizedCode, data?.hostSecret)) {
          logger.warn(
            `[ADMIN:UNAUTHORIZED] Unauthorized attempt to resume game in room ${normalizedCode} from socket ${socket.id}`
          );
          const err: AdminErrorPayload = {
            code: 'UNAUTHORIZED',
            message: 'Only the room host is authorized to resume the game.',
          };
          socket.emit('admin_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        const res = hostAdminService.resumeGame(normalizedCode, io);
        if (callback) {
          callback(res);
        }
      } catch (err: any) {
        logger.error(`[ADMIN:RESUME_ERROR] Error resuming room: ${err?.message || err}`);
        const errorPayload: AdminErrorPayload = {
          code: 'SERVER_ERROR',
          message: 'An error occurred while resuming the game.',
        };
        socket.emit('admin_error', errorPayload);
        if (callback) callback({ success: false, error: errorPayload.message });
      }
    }
  );

  // 3. Host Manual Override Answer (US-21 Scenario 2)
  socket.on(
    'host_override_answer',
    (
      data: HostOverrideAnswerPayload,
      callback?: (res: ManualOverrideResult) => void
    ) => {
      try {
        const rawCode = data?.roomCode || socket.data?.roomCode;
        if (!rawCode || typeof data?.rankOrder !== 'number') {
          const err: AdminErrorPayload = {
            code: 'INVALID_ACTION',
            message: 'Valid roomCode and rankOrder are required for manual override.',
          };
          socket.emit('admin_error', err);
          if (callback) {
            callback({
              success: false,
              roomCode: rawCode || '',
              rankOrder: data?.rankOrder || 0,
              answerText: '',
              points: 0,
              strikeCount: 0,
              roundBank: 0,
              controllingTeam: 'TEAM_1',
              isBoardCleared: false,
              error: err.message,
            });
          }
          return;
        }

        const normalizedCode = normalizeRoomCode(rawCode);

        // Security Validation
        if (!hostAdminService.isHostAuthorized(socket, normalizedCode, data?.hostSecret)) {
          logger.warn(
            `[ADMIN:UNAUTHORIZED] Unauthorized attempt to override answer in room ${normalizedCode} from socket ${socket.id}`
          );
          const err: AdminErrorPayload = {
            code: 'UNAUTHORIZED',
            message: 'Only the room host is authorized to override answers.',
          };
          socket.emit('admin_error', err);
          if (callback) {
            callback({
              success: false,
              roomCode: normalizedCode,
              rankOrder: data.rankOrder,
              answerText: '',
              points: 0,
              strikeCount: 0,
              roundBank: 0,
              controllingTeam: 'TEAM_1',
              isBoardCleared: false,
              error: err.message,
            });
          }
          return;
        }

        const res = hostAdminService.overrideAnswer(
          normalizedCode,
          data.rankOrder,
          data.points,
          data.teamId,
          io
        );

        if (callback) {
          callback(res);
        }
      } catch (err: any) {
        logger.error(`[ADMIN:OVERRIDE_ERROR] Error in manual override: ${err?.message || err}`);
        const errorPayload: AdminErrorPayload = {
          code: 'SERVER_ERROR',
          message: 'An error occurred during manual answer override.',
        };
        socket.emit('admin_error', errorPayload);
        if (callback) {
          callback({
            success: false,
            roomCode: data?.roomCode || '',
            rankOrder: data?.rankOrder || 0,
            answerText: '',
            points: 0,
            strikeCount: 0,
            roundBank: 0,
            controllingTeam: 'TEAM_1',
            isBoardCleared: false,
            error: errorPayload.message,
          });
        }
      }
    }
  );

  // 4. Host Kick Player (US-21 Scenario 3)
  socket.on(
    'host_kick_player',
    async (
      data: HostKickPlayerPayload,
      callback?: (res: { success: boolean; playerId?: string; error?: string }) => void
    ) => {
      try {
        const rawCode = data?.roomCode || socket.data?.roomCode;
        if (!rawCode || !data?.playerId) {
          const err: AdminErrorPayload = {
            code: 'INVALID_ACTION',
            message: 'Room code and playerId are required to kick a player.',
          };
          socket.emit('admin_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        const normalizedCode = normalizeRoomCode(rawCode);

        // Security Validation
        if (!hostAdminService.isHostAuthorized(socket, normalizedCode, data?.hostSecret)) {
          logger.warn(
            `[ADMIN:UNAUTHORIZED] Unauthorized attempt to kick player ${data.playerId} in room ${normalizedCode} from socket ${socket.id}`
          );
          const err: AdminErrorPayload = {
            code: 'UNAUTHORIZED',
            message: 'Only the room host is authorized to kick players.',
          };
          socket.emit('admin_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        const res = await hostAdminService.kickPlayer(normalizedCode, data.playerId, io, db);
        if (callback) {
          callback(res);
        }
      } catch (err: any) {
        logger.error(`[ADMIN:KICK_ERROR] Error kicking player: ${err?.message || err}`);
        const errorPayload: AdminErrorPayload = {
          code: 'SERVER_ERROR',
          message: 'An error occurred while kicking the player.',
        };
        socket.emit('admin_error', errorPayload);
        if (callback) callback({ success: false, error: errorPayload.message });
      }
    }
  );

  // 5. Host Get Override Answer Options (Strictly Host-Authorized, US-21 Scenario 2)
  socket.on(
    'host_get_override_answers',
    (
      data: { roomCode: string; hostSecret?: string },
      callback?: (res: { success: boolean; answers: HostOverrideAnswerOption[]; error?: string }) => void
    ) => {
      try {
        const rawCode = data?.roomCode || socket.data?.roomCode;
        if (!rawCode) {
          const err: AdminErrorPayload = {
            code: 'INVALID_ACTION',
            message: 'Room code is required to fetch override answers.',
          };
          socket.emit('admin_error', err);
          if (callback) callback({ success: false, answers: [], error: err.message });
          return;
        }

        const normalizedCode = normalizeRoomCode(rawCode);
        if (!hostAdminService.isHostAuthorized(socket, normalizedCode, data?.hostSecret)) {
          logger.warn(
            `[ADMIN:UNAUTHORIZED] Unauthorized attempt to fetch override answers in room ${normalizedCode} from socket ${socket.id}`
          );
          const err: AdminErrorPayload = {
            code: 'UNAUTHORIZED',
            message: 'Only the room host is authorized to inspect unrevealed answers.',
          };
          socket.emit('admin_error', err);
          if (callback) callback({ success: false, answers: [], error: err.message });
          return;
        }

        const res = hostAdminService.getHostOverrideOptions(normalizedCode);
        if (res.success) {
          socket.emit('host_override_options', {
            roomCode: normalizedCode,
            answers: res.answers,
          });
        }
        if (callback) {
          callback(res);
        }
      } catch (err: any) {
        logger.error(`[ADMIN:OVERRIDE_OPTIONS_ERROR] Error fetching override options: ${err?.message || err}`);
        const errorPayload: AdminErrorPayload = {
          code: 'SERVER_ERROR',
          message: 'An error occurred while fetching override options.',
        };
        socket.emit('admin_error', errorPayload);
        if (callback) callback({ success: false, answers: [], error: errorPayload.message });
      }
    }
  );
}
