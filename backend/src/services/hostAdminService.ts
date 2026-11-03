/**
 * Host Administrative Service (US-21)
 * Encapsulates host security verification, game pause/resume timer controls,
 * manual answer acceptance overrides, and player kick operations.
 */
import { Socket, Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import defaultPrisma from './db';
import { normalizeRoomCode } from '../utils/roomCode';
import { sessionRecoveryService } from './sessionRecoveryService';
import {
  getTeamGuessingSession,
} from './teamGuessingService';
import {
  getFaceOffSession,
} from './faceOffService';
import {
  getFastMoneySession,
  pauseFastMoneyTimer,
  resumeFastMoneyTimer,
  isFastMoneyTimerPaused,
  broadcastFastMoneyState,
} from '../sockets/fastMoneyHandler';
import { buildRoomStateUpdate } from '../sockets/lobbyHandler';
import { logger } from '../utils/logger';

export interface RoomPauseState {
  roomCode: string;
  isPaused: boolean;
  pausedAt: number;
  remainingSeconds: number;
  mode: 'FAST_MONEY' | 'TEAM_GUESSING' | 'FACE_OFF' | 'GENERIC';
}

export interface ManualOverrideResult {
  success: boolean;
  roomCode: string;
  rankOrder: number;
  answerText: string;
  points: number;
  strikeCount: number;
  roundBank: number;
  controllingTeam: 'TEAM_1' | 'TEAM_2';
  isBoardCleared: boolean;
  error?: string;
}

export class HostAdminService {
  private pausedRooms = new Map<string, RoomPauseState>();

  /**
   * Authoritatively checks whether a given socket belongs to the room's Host (DoD requirement).
   * Checks socket metadata, registered host socket ID, or matching hostSecret.
   */
  public isHostAuthorized(
    socket: Socket,
    roomCode: string,
    hostSecret?: string
  ): boolean {
    if (!roomCode) return false;
    const normalizedCode = normalizeRoomCode(roomCode);

    // 1. Check direct hostSecret if provided
    if (hostSecret && sessionRecoveryService.validateHostSecret(normalizedCode, hostSecret)) {
      return true;
    }

    // 2. Check socket session data
    if (socket.data?.isHost === true && socket.data?.roomCode === normalizedCode) {
      return true;
    }

    // 3. Check registered host socket ID
    const registeredSocketId = sessionRecoveryService.getHostSocket(normalizedCode);
    if (registeredSocketId && registeredSocketId === socket.id) {
      return true;
    }

    return false;
  }

  /**
   * Pauses the active game timer without loss of remaining time (US-21 Scenario 1).
   */
  public pauseGame(
    roomCode: string,
    io: SocketIOServer
  ): { success: boolean; remainingTime: number; error?: string } {
    const normalizedCode = normalizeRoomCode(roomCode);

    if (this.isRoomPaused(normalizedCode)) {
      const existing = this.pausedRooms.get(normalizedCode)!;
      return { success: true, remainingTime: existing.remainingSeconds };
    }

    let remainingSeconds = 0;
    let mode: RoomPauseState['mode'] = 'GENERIC';

    // 1. Check Team Guessing session
    const teamSession = getTeamGuessingSession(normalizedCode);
    if (teamSession && (teamSession.phase === 'TEAM_GUESSING' || teamSession.phase === 'STEAL_PHASE')) {
      remainingSeconds = teamSession.pauseTimer();
      mode = 'TEAM_GUESSING';
      io.to(`room:${normalizedCode}`).emit('team_guessing_state', teamSession.getState());
    } else {
      // 2. Check Face-Off session
      const faceOffSession = getFaceOffSession(normalizedCode);
      if (faceOffSession && (faceOffSession.phase === 'ANSWERING' || faceOffSession.phase === 'OPPONENT_GUESS')) {
        remainingSeconds = faceOffSession.pauseTimer();
        mode = 'FACE_OFF';
        io.to(`room:${normalizedCode}`).emit('face_off_state', faceOffSession.getState());
      } else if (faceOffSession) {
        faceOffSession.isPaused = true;
        mode = 'GENERIC';
      } else {
        // 3. Check Fast Money session
        const fmSession = getFastMoneySession(normalizedCode);
        if (fmSession && (fmSession.getPhase() === 'P1_PLAYING' || fmSession.getPhase() === 'P2_PLAYING')) {
          remainingSeconds = pauseFastMoneyTimer(normalizedCode);
          mode = 'FAST_MONEY';
          broadcastFastMoneyState(io, fmSession);
        }
      }
    }

    const pauseRecord: RoomPauseState = {
      roomCode: normalizedCode,
      isPaused: true,
      pausedAt: Date.now(),
      remainingSeconds,
      mode,
    };

    this.pausedRooms.set(normalizedCode, pauseRecord);

    logger.info(
      `[ADMIN:PAUSE] Room ${normalizedCode} game paused by host (${mode}, remaining: ${remainingSeconds}s)`
    );

    // Broadcast authoritative game_paused to room (US-21 Scenario 1)
    io.to(`room:${normalizedCode}`).emit('game_paused', {
      roomCode: normalizedCode,
      remainingTime: remainingSeconds,
      pausedByHost: true,
    });

    return { success: true, remainingTime: remainingSeconds };
  }

  /**
   * Resumes the paused game timer from where it stopped (US-21 Scenario 1).
   */
  public resumeGame(
    roomCode: string,
    io: SocketIOServer
  ): { success: boolean; remainingTime: number; error?: string } {
    const normalizedCode = normalizeRoomCode(roomCode);
    const pauseRecord = this.pausedRooms.get(normalizedCode);

    if (!pauseRecord) {
      return { success: false, remainingTime: 0, error: 'Game is not currently paused.' };
    }

    const { remainingSeconds, mode } = pauseRecord;
    this.pausedRooms.delete(normalizedCode);

    if (mode === 'TEAM_GUESSING') {
      const teamSession = getTeamGuessingSession(normalizedCode);
      if (teamSession) {
        const resumed = teamSession.resumeTimer();
        const state = teamSession.getState();
        io.to(`room:${normalizedCode}`).emit('team_guessing_state', state);
        io.to(`room:${normalizedCode}`).emit('timer_tick', {
          roomCode: normalizedCode,
          secondsRemaining: resumed,
          endsAt: state.endsAt ?? Date.now() + resumed * 1000,
        });
      }
    } else if (mode === 'FACE_OFF') {
      const faceOffSession = getFaceOffSession(normalizedCode);
      if (faceOffSession) {
        const resumed = faceOffSession.resumeTimer();
        const state = faceOffSession.getState();
        io.to(`room:${normalizedCode}`).emit('face_off_state', state);
        io.to(`room:${normalizedCode}`).emit('timer_tick', {
          roomCode: normalizedCode,
          secondsRemaining: resumed,
          endsAt: state.endsAt ?? Date.now() + resumed * 1000,
        });
      }
    } else if (mode === 'FAST_MONEY') {
      resumeFastMoneyTimer(io, normalizedCode);
    } else {
      const faceOffSession = getFaceOffSession(normalizedCode);
      if (faceOffSession) {
        faceOffSession.isPaused = false;
      }
    }

    logger.info(
      `[ADMIN:RESUME] Room ${normalizedCode} game resumed by host (${mode}, remaining: ${remainingSeconds}s)`
    );

    // Broadcast authoritative game_resumed to room (US-21 Scenario 1)
    io.to(`room:${normalizedCode}`).emit('game_resumed', {
      roomCode: normalizedCode,
      remainingTime: remainingSeconds,
    });

    return { success: true, remainingTime: remainingSeconds };
  }

  /**
   * Manually accepts an answer and cancels strikes on Host Override (US-21 Scenario 2).
   */
  public overrideAnswer(
    roomCode: string,
    rankOrder: number,
    pointsOverride: number | undefined,
    teamOverride: 'TEAM_1' | 'TEAM_2' | undefined,
    io: SocketIOServer
  ): ManualOverrideResult {
    const normalizedCode = normalizeRoomCode(roomCode);
    const teamSession = getTeamGuessingSession(normalizedCode);

    if (!teamSession) {
      return {
        success: false,
        roomCode: normalizedCode,
        rankOrder,
        answerText: '',
        points: 0,
        strikeCount: 0,
        roundBank: 0,
        controllingTeam: 'TEAM_1',
        isBoardCleared: false,
        error: 'No active team guessing session for manual answer override.',
      };
    }

    const overrideRes = teamSession.overrideAcceptAnswer(
      rankOrder,
      pointsOverride,
      teamOverride
    );

    if (!overrideRes) {
      return {
        success: false,
        roomCode: normalizedCode,
        rankOrder,
        answerText: '',
        points: 0,
        strikeCount: teamSession.strikes,
        roundBank: teamSession.roundBank,
        controllingTeam: teamSession.controllingTeam,
        isBoardCleared: false,
        error: `Answer #${rankOrder} not found or already revealed.`,
      };
    }

    logger.info(
      `[ADMIN:OVERRIDE] Host overridden answer #${rankOrder} ("${overrideRes.revealedAnswer.answerText}", +${overrideRes.pointsAwarded} pts) in room ${normalizedCode}. Strikes retracted to ${overrideRes.strikeCount}. Bank: ${overrideRes.roundBank}`
    );

    // Broadcast board reveal on TV display and controllers
    const boardRevealData = {
      roomCode: normalizedCode,
      slotRank: overrideRes.revealedAnswer.rankOrder,
      rankOrder: overrideRes.revealedAnswer.rankOrder,
      answerText: overrideRes.revealedAnswer.answerText,
      points: overrideRes.revealedAnswer.points,
      playerId: 'HOST_OVERRIDE',
      playerNickname: 'Host Override',
      playerTeam: overrideRes.controllingTeam,
      isNumberOneAnswer: overrideRes.revealedAnswer.rankOrder === 1,
    };

    io.to(`room:${normalizedCode}`).emit('board_reveal', boardRevealData);
    io.to(`room:${normalizedCode}`).emit('face_off_board_reveal', boardRevealData);

    // Broadcast strike retracted/updated
    io.to(`room:${normalizedCode}`).emit('strike_cancelled', {
      roomCode: normalizedCode,
      controllingTeam: overrideRes.controllingTeam,
      strikeCount: overrideRes.strikeCount,
    });

    // Broadcast updated team guessing state
    io.to(`room:${normalizedCode}`).emit('team_guessing_state', teamSession.getState());

    // Broadcast dedicated answer_override_acknowledged event
    io.to(`room:${normalizedCode}`).emit('answer_override_acknowledged', {
      roomCode: normalizedCode,
      rankOrder: overrideRes.revealedAnswer.rankOrder,
      answerText: overrideRes.revealedAnswer.answerText,
      pointsAwarded: overrideRes.pointsAwarded,
      strikeCount: overrideRes.strikeCount,
      roundBank: overrideRes.roundBank,
      controllingTeam: overrideRes.controllingTeam,
      isBoardCleared: overrideRes.isBoardCleared,
    });

    return {
      success: true,
      roomCode: normalizedCode,
      rankOrder: overrideRes.revealedAnswer.rankOrder,
      answerText: overrideRes.revealedAnswer.answerText,
      points: overrideRes.pointsAwarded,
      strikeCount: overrideRes.strikeCount,
      roundBank: overrideRes.roundBank,
      controllingTeam: overrideRes.controllingTeam,
      isBoardCleared: overrideRes.isBoardCleared,
    };
  }

  /**
   * Kicks/removes an inactive player from the room (US-21 Scenario 3).
   */
  public async kickPlayer(
    roomCode: string,
    playerId: string,
    io: SocketIOServer,
    db: PrismaClient = defaultPrisma
  ): Promise<{ success: boolean; playerId?: string; error?: string }> {
    const normalizedCode = normalizeRoomCode(roomCode);

    if (!playerId) {
      return { success: false, error: 'Player ID is required.' };
    }

    const room = await db.room.findUnique({
      where: { roomCode: normalizedCode },
      include: { players: true },
    });

    if (!room) {
      return { success: false, error: 'Room not found.' };
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Player not found in room roster.' };
    }

    // 1. Disconnect and notify the target socket
    const session = sessionRecoveryService.getPlayerSession(playerId);
    const socketId = session?.socketId || player.socketId;

    if (socketId) {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (targetSocket) {
        if (targetSocket.data) {
          targetSocket.data.playerId = undefined; // prevent duplicate disconnect handler race
        }
        targetSocket.emit('player_kicked', {
          roomCode: normalizedCode,
          playerId,
          reason: 'You have been removed from the room by the host.',
        });
        targetSocket.leave(`room:${normalizedCode}`);
        targetSocket.disconnect(true);
      }
    }

    // 2. Clean up recovery sessions and active grace timers
    sessionRecoveryService.cancelGraceTimer(playerId);
    sessionRecoveryService.removePlayerSession(playerId);

    // 3. Delete player from database (US-21 Scenario 3: "deletes the player row in MySQL")
    try {
      await db.player.delete({
        where: { id: playerId },
      });
    } catch (delErr) {
      logger.warn(`[ADMIN:KICK] Could not delete player ${playerId} from DB: ${delErr}`);
    }

    logger.info(
      `[ADMIN:KICK] Player ${player.nickname} (${playerId}) removed from room ${normalizedCode} by host.`
    );

    // 4. Broadcast updated roster and player count to remaining clients
    const refreshedRoom = await db.room.findUnique({
      where: { roomCode: normalizedCode },
      include: { players: true },
    });

    if (refreshedRoom) {
      const state = buildRoomStateUpdate(refreshedRoom);
      io.to(`room:${normalizedCode}`).emit('room_state_update', state);
    }

    return { success: true, playerId };
  }

  public isRoomPaused(roomCode: string): boolean {
    const normalizedCode = normalizeRoomCode(roomCode);
    return this.pausedRooms.has(normalizedCode) || isFastMoneyTimerPaused(normalizedCode);
  }

  public getPauseState(roomCode: string): RoomPauseState | null {
    const normalizedCode = normalizeRoomCode(roomCode);
    return this.pausedRooms.get(normalizedCode) || null;
  }

  public clearRoomAdmin(roomCode: string): void {
    const normalizedCode = normalizeRoomCode(roomCode);
    this.pausedRooms.delete(normalizedCode);
  }

  public clearAllAdmin(): void {
    this.pausedRooms.clear();
  }
}

export const hostAdminService = new HostAdminService();
export default hostAdminService;
