import { Server as SocketIOServer, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../services/db';
import {
  FaceOffSession,
  FaceOffTimeoutResult,
  FaceOffQuestion,
  getFaceOffSession,
} from '../services/faceOffService';
import { generateAndSaveGameQuestions } from '../services/questionService';
import { SupportedLanguage } from '../services/geminiService';
import { normalizeRoomCode } from '../utils/roomCode';
import { logger } from '../utils/logger';

export interface FaceOffReadyPayload {
  roomCode: string;
  playerId: string;
}

export interface PressBuzzerPayload {
  roomCode: string;
  playerId: string;
  clientTimestamp?: number;
}

export interface SubmitFaceOffAnswerPayload {
  roomCode: string;
  playerId: string;
  questionId: string;
  rawAnswer: string;
}

/**
 * Broadcasts the current Face-Off session state to all clients in the room.
 */
export function broadcastFaceOffState(
  io: SocketIOServer,
  session: FaceOffSession
): void {
  io.to(`room:${session.roomCode}`).emit('face_off_state', session.getState());
}

/**
 * Broadcasts timeout cascade or deadlock resolution to the room (Scenarios 3, 4 & 5).
 */
export async function handleFaceOffTimeoutBroadcast(
  io: SocketIOServer,
  roomCode: string,
  timeoutResult: FaceOffTimeoutResult,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  const normalizedCode = normalizeRoomCode(roomCode);
  const session = getFaceOffSession(normalizedCode);
  if (!session) return;

  io.to(`room:${normalizedCode}`).emit('face_off_timeout', {
    roomCode: normalizedCode,
    ...timeoutResult,
  });

  if (timeoutResult.type === 'DEADLOCK_RESET') {
    // Scenario 5: Generate replacement survey question for deadlock reset
    try {
      const room = await db.room.findUnique({ where: { roomCode: normalizedCode } });
      const language = (room?.language as SupportedLanguage) || 'EN';
      const replacement = await generateAndSaveGameQuestions({
        gameId: session.gameId,
        gameMode: 'MAIN_GAME',
        language,
        roundNumber: session.roundNumber,
        count: 1,
        prismaClient: db,
      });

      if (replacement && replacement.length > 0) {
        const q = replacement[0];
        const newQuestion: FaceOffQuestion = {
          id: q.id,
          questionText: q.questionText,
          orderIndex: q.orderIndex,
          roundNumber: q.roundNumber,
          answers: q.answers.map((a) => ({
            id: a.id,
            answerText: a.answerText,
            points: a.points,
            rankOrder: a.rankOrder,
          })),
        };

        session.resetWithNewQuestion(newQuestion);

        io.to(`room:${normalizedCode}`).emit('face_off_reset', {
          roomCode: normalizedCode,
          newQuestion: {
            id: newQuestion.id,
            questionText: newQuestion.questionText,
          },
        });

        logger.info(
          `[FACEOFF:DEADLOCK_RESOLVED] Emitted replacement question in room ${normalizedCode}`
        );
      }
    } catch (err) {
      logger.error(
        `Failed to generate replacement question for deadlock in room ${normalizedCode}`,
        err
      );
    }
  }

  broadcastFaceOffState(io, session);
}

/**
 * Registers WebSocket event listeners for Main Game Face-Off duel mechanics (US-12).
 */
export function registerMainGameHandlers(
  io: SocketIOServer,
  socket: Socket,
  _db: PrismaClient = defaultPrisma
): void {
  /**
   * Contender marks ready for the Face-Off duel (Scenario 1).
   * Event: 'player_ready' or 'face_off_ready'
   */
  const handleContenderReady = async (
    payload: FaceOffReadyPayload,
    callback?: (res: { success: boolean; bothReady?: boolean; error?: string }) => void
  ) => {
    try {
      const { roomCode, playerId } = payload;
      if (!roomCode || !playerId) {
        if (callback) callback({ success: false, error: 'Missing roomCode or playerId' });
        return;
      }

      const normalizedCode = normalizeRoomCode(roomCode);
      const session = getFaceOffSession(normalizedCode);
      if (!session) {
        // Not a Main Game face-off session; ignore or pass through
        if (callback) callback({ success: false, error: 'No active face-off session found' });
        return;
      }

      const result = session.markContenderReady(playerId);
      if (!result.success) {
        socket.emit('face_off_error', { code: 'INVALID_READY', message: result.error });
        if (callback) callback({ success: false, error: result.error });
        return;
      }

      io.to(`room:${normalizedCode}`).emit('contender_ready', {
        roomCode: normalizedCode,
        playerId,
        bothReady: result.bothReady,
        waitingForPlayerId: result.waitingForPlayerId,
        waitingForNickname: result.waitingForNickname,
      });

      if (result.bothReady) {
        io.to(`room:${normalizedCode}`).emit('buzzer_active', {
          roomCode: normalizedCode,
          question: {
            id: session.question.id,
            questionText: session.question.questionText,
          },
        });
      }

      broadcastFaceOffState(io, session);
      if (callback) callback({ success: true, bothReady: result.bothReady });
    } catch (err) {
      logger.error('Error handling face_off_ready event', err);
      if (callback) callback({ success: false, error: 'Internal server error' });
    }
  };

  socket.on('face_off_ready', handleContenderReady);

  // Hook into existing player_ready for Main Game rooms if applicable
  socket.on('player_ready', (payload: FaceOffReadyPayload) => {
    if (payload?.roomCode) {
      const session = getFaceOffSession(normalizeRoomCode(payload.roomCode));
      if (session) {
        handleContenderReady(payload);
      }
    }
  });

  /**
   * Contender presses mobile buzzer button (Scenario 2).
   * Event: 'press_buzzer'
   */
  socket.on(
    'press_buzzer',
    (
      payload: PressBuzzerPayload,
      callback?: (res: { accepted: boolean; reason?: string }) => void
    ) => {
      try {
        const { roomCode, playerId, clientTimestamp } = payload;
        if (!roomCode || !playerId) {
          if (callback) callback({ accepted: false, reason: 'INVALID_PAYLOAD' });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        const session = getFaceOffSession(normalizedCode);
        if (!session) {
          if (callback) callback({ accepted: false, reason: 'NO_SESSION' });
          return;
        }

        const buzzResult = session.pressBuzzer(playerId, clientTimestamp);

        if (!buzzResult.accepted) {
          socket.emit('buzzer_rejected', {
            roomCode: normalizedCode,
            playerId,
            reason: buzzResult.reason,
          });
          if (callback) callback({ accepted: false, reason: buzzResult.reason });
          return;
        }

        const result = buzzResult.result!;
        io.to(`room:${normalizedCode}`).emit('buzzer_locked', {
          roomCode: normalizedCode,
          winnerPlayerId: result.winnerPlayerId,
          winnerNickname: result.winnerNickname,
          winnerTeam: result.winnerTeam,
          endsAt: result.endsAt,
          duration: result.duration,
        });

        broadcastFaceOffState(io, session);
        if (callback) callback({ accepted: true });
      } catch (err) {
        logger.error('Error handling press_buzzer event', err);
        if (callback) callback({ accepted: false, reason: 'INTERNAL_ERROR' });
      }
    }
  );

  /**
   * Active respondent submits their answer for the Face-Off duel.
   * Event: 'submit_face_off_answer'
   */
  socket.on(
    'submit_face_off_answer',
    (
      payload: SubmitFaceOffAnswerPayload,
      callback?: (res: { success: boolean; error?: string }) => void
    ) => {
      try {
        const { roomCode, playerId, questionId, rawAnswer } = payload;
        if (!roomCode || !playerId || !rawAnswer) {
          if (callback) callback({ success: false, error: 'Missing required fields' });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        const session = getFaceOffSession(normalizedCode);
        if (!session) {
          if (callback) callback({ success: false, error: 'No active face-off session found' });
          return;
        }

        const submitRes = session.submitAnswer(playerId, rawAnswer);
        if (!submitRes.success) {
          socket.emit('face_off_error', { code: 'INVALID_SUBMISSION', message: submitRes.error });
          if (callback) callback({ success: false, error: submitRes.error });
          return;
        }

        io.to(`room:${normalizedCode}`).emit('face_off_answer_submitted', {
          roomCode: normalizedCode,
          playerId,
          questionId,
          rawAnswer,
        });

        broadcastFaceOffState(io, session);
        if (callback) callback({ success: true });
      } catch (err) {
        logger.error('Error handling submit_face_off_answer event', err);
        if (callback) callback({ success: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * Allows clients to fetch the active Face-Off state snapshot.
   * Event: 'get_face_off_state'
   */
  socket.on(
    'get_face_off_state',
    (
      payload: { roomCode: string },
      callback?: (res: { success: boolean; state?: any; error?: string }) => void
    ) => {
      const { roomCode } = payload || {};
      if (!roomCode) {
        if (callback) callback({ success: false, error: 'Missing roomCode' });
        return;
      }

      const session = getFaceOffSession(normalizeRoomCode(roomCode));
      if (!session) {
        if (callback) callback({ success: false, error: 'No active session' });
        return;
      }

      const state = session.getState();
      if (callback) callback({ success: true, state });
    }
  );
}
