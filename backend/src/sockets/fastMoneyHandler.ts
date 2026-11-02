import { Server as SocketIOServer, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../services/db';
import {
  FastMoneySession,
  FastMoneyQuestionItem,
  FastMoneyRevealSlot,
} from '../services/fastMoneySession';
import { SupportedLanguage } from '../services/geminiService';
import { evaluatePlayerAnswer } from '../services/answerValidationService';
import { normalizeRoomCode } from '../utils/roomCode';
import { logger } from '../utils/logger';

export interface PlayerReadyPayload {
  roomCode: string;
  playerId: string;
}

export interface SubmitAnswerPayload {
  roomCode: string;
  playerId: string;
  questionId: string;
  rawAnswer: string;
}

export interface PassQuestionPayload {
  roomCode: string;
  playerId: string;
  questionId: string;
}

export interface TimerTickPayload {
  secondsRemaining: number;
  endsAt: number;
}

export interface TurnEndedPayload {
  roomCode: string;
  reason: 'TIME_EXPIRED' | 'ALL_ANSWERED';
  answeredCount: number;
  totalQuestions: number;
}

export interface RevealAnswerPayload {
  roomCode: string;
  slotNumber: number;
  isHost?: boolean;
}

export interface RevealPointsPayload {
  roomCode: string;
  slotNumber: number;
  isHost?: boolean;
}

export interface BoardRevealPayload {
  roomCode: string;
  type: 'ANSWER' | 'POINTS';
  slotNumber: number;
  slot: FastMoneyRevealSlot;
  totalScore: number;
  isAllRevealed: boolean;
  nextActiveSlotNumber: number | null;
}

/**
 * Global in-memory registries for active Fast Money game sessions and authoritative timers.
 */
export const fastMoneySessions = new Map<string, FastMoneySession>();
export const fastMoneyTimers = new Map<string, NodeJS.Timeout>();

/**
 * Creates and registers a new FastMoneySession for a room.
 */
export function initFastMoneySession(
  roomCode: string,
  options: {
    gameId: string;
    player1Id: string;
    player2Id: string;
    questions: FastMoneyQuestionItem[];
    timerDurationSeconds?: number;
    language?: SupportedLanguage;
  }
): FastMoneySession {
  const normalizedCode = normalizeRoomCode(roomCode);
  clearFastMoneyTimer(normalizedCode);

  const session = new FastMoneySession({
    gameId: options.gameId,
    roomCode: normalizedCode,
    player1Id: options.player1Id,
    player2Id: options.player2Id,
    questions: options.questions,
    timerDurationSeconds: options.timerDurationSeconds ?? 60,
    language: options.language ?? 'EN',
  });

  fastMoneySessions.set(normalizedCode, session);
  return session;
}

/**
 * Retrieves the active FastMoneySession for a given room.
 */
export function getFastMoneySession(roomCode: string): FastMoneySession | undefined {
  return fastMoneySessions.get(normalizeRoomCode(roomCode));
}

/**
 * Safely cancels and clears the authoritative timer interval for a room.
 */
export function clearFastMoneyTimer(roomCode: string): void {
  const normalizedCode = normalizeRoomCode(roomCode);
  const existingTimer = fastMoneyTimers.get(normalizedCode);
  if (existingTimer) {
    clearInterval(existingTimer);
    fastMoneyTimers.delete(normalizedCode);
  }
}

/**
 * Broadcasts synchronized role-based Fast Money state snapshots to Host and Players.
 */
export function broadcastFastMoneyState(io: SocketIOServer, session: FastMoneySession): void {
  const roomCode = session.roomCode;
  const p1Snapshot = session.getPlayer1Snapshot();
  const p2Snapshot = session.getPlayer2Snapshot();
  const hostSnapshot = session.getHostSnapshot();

  // 1. Emit to entire room for host & general updates
  io.to(`room:${roomCode}`).emit('fast_money_host_state', hostSnapshot);

  // 2. Emit specific tailored snapshots targeting player socket rooms
  io.to(`player:${session.player1Id}`).emit('fast_money_p1_state', p1Snapshot);
  io.to(`player:${session.player2Id}`).emit('fast_money_p2_state', p2Snapshot);

  // Also emit p1 & p2 states to room channel in case client listeners are subscribed at room level
  io.to(`room:${roomCode}`).emit('fast_money_p1_state', p1Snapshot);
  io.to(`room:${roomCode}`).emit('fast_money_p2_state', p2Snapshot);
}

/**
 * Starts the authoritative 60-second countdown timer on the server.
 * Broadcasts 1-second ticks and auto-terminates the turn when time expires.
 */
export function startAuthoritativeTimer(
  io: SocketIOServer,
  session: FastMoneySession,
  onTurnEnd?: (reason: 'TIME_EXPIRED' | 'ALL_ANSWERED') => void
): void {
  const roomCode = session.roomCode;
  clearFastMoneyTimer(roomCode);

  const durationMs = session.timerDurationSeconds * 1000;
  const endsAt = Date.now() + durationMs;

  // Broadcast initial turn started event
  io.to(`room:${roomCode}`).emit('p1_turn_started', {
    roomCode,
    endsAt,
    duration: session.timerDurationSeconds,
    currentQuestionNumber: 1,
  });

  // Broadcast initial timer tick
  io.to(`room:${roomCode}`).emit('timer_tick', {
    secondsRemaining: session.timerDurationSeconds,
    endsAt,
  });

  // Start 1-second authoritative interval
  const interval = setInterval(() => {
    const remainingMs = endsAt - Date.now();
    const secondsRemaining = Math.max(0, Math.ceil(remainingMs / 1000));

    // Broadcast synchronized authoritative timer tick (DoD requirement)
    io.to(`room:${roomCode}`).emit('timer_tick', {
      secondsRemaining,
      endsAt,
    });

    // Check expiration or early completion
    if (secondsRemaining <= 0 || session.isAllAnswered() || session.isTurnFinished()) {
      clearFastMoneyTimer(roomCode);
      session.expireTimer();

      const reason = session.isAllAnswered() ? 'ALL_ANSWERED' : 'TIME_EXPIRED';
      session.startRevealPhase();

      logger.info(
        `[FAST_MONEY:TURN_END] Room ${roomCode} Player 1 turn finished (${reason}, ${session.getAnsweredCount()} answers)`
      );

      const turnEndedPayload: TurnEndedPayload = {
        roomCode,
        reason,
        answeredCount: session.getAnsweredCount(),
        totalQuestions: 5,
      };

      io.to(`room:${roomCode}`).emit('p1_turn_ended', turnEndedPayload);
      broadcastFastMoneyState(io, session);

      if (onTurnEnd) {
        onTurnEnd(reason);
      }
    }
  }, 1000);

  fastMoneyTimers.set(roomCode, interval);
}

/**
 * Registers WebSocket event listeners for Fast Money round mechanics.
 */
export function registerFastMoneyHandlers(
  io: SocketIOServer,
  socket: Socket,
  db: PrismaClient = defaultPrisma
): void {
  /**
   * Scenario 1: Ready Button Starts 60-Second Timer
   * Player 1 clicks "I'm Ready!" -> Starts authoritative server clock and broadcasts state.
   */
  socket.on(
    'player_ready',
    (payload: PlayerReadyPayload, callback?: (res: { success: boolean; error?: string }) => void) => {
      try {
        const { roomCode, playerId } = payload || {};
        if (!roomCode || !playerId) {
          const errMsg = 'roomCode and playerId are required';
          socket.emit('room_error', { code: 'INVALID_ROOM', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        const session = getFastMoneySession(normalizedCode);

        if (!session) {
          const errMsg = 'No active Fast Money session found for this room';
          socket.emit('room_error', { code: 'ROOM_NOT_FOUND', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        if (playerId !== session.player1Id) {
          const errMsg = 'Only Player 1 can start their Fast Money turn';
          socket.emit('room_error', { code: 'CANNOT_START', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        // Start session turn
        session.startPlayer1Turn(playerId);

        // Start server timer interval
        startAuthoritativeTimer(io, session);

        // Broadcast active state to host and players
        broadcastFastMoneyState(io, session);

        logger.info(
          `[FAST_MONEY:START] Player 1 (${playerId}) started 60s speed round in room ${normalizedCode}`
        );

        if (callback) callback({ success: true });
      } catch (error: unknown) {
        logger.error('[FAST_MONEY:ERROR] Error in player_ready handler', error);
        const errMsg = error instanceof Error ? error.message : 'Failed to start Fast Money round';
        socket.emit('room_error', {
          code: 'SERVER_ERROR',
          message: errMsg,
        });
        if (callback) callback({ success: false, error: errMsg });
      }
    }
  );

  /**
   * Scenario 2: Submitting an Answer Advances with Zero Latency (Non-Blocking)
   * Records answer submission, advances question queue instantly, and validates via US-06 in background.
   */
  socket.on(
    'submit_answer',
    async (
      payload: SubmitAnswerPayload,
      callback?: (res: { success: boolean; error?: string; isFinished?: boolean }) => void
    ) => {
      try {
        const { roomCode, playerId, questionId, rawAnswer } = payload || {};
        if (!roomCode || !playerId || !questionId || !rawAnswer) {
          const errMsg = 'roomCode, playerId, questionId, and rawAnswer are required';
          socket.emit('room_error', { code: 'INVALID_ROOM', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        const session = getFastMoneySession(normalizedCode);

        if (!session) {
          const errMsg = 'No active Fast Money session found for this room';
          socket.emit('room_error', { code: 'ROOM_NOT_FOUND', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const activeQuestion = session.getCurrentQuestion();
        if (!activeQuestion || activeQuestion.id !== questionId) {
          const errMsg = 'Submitted questionId does not match current active question';
          socket.emit('room_error', { code: 'INVALID_ROOM', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        // 1. Submit answer in session immediately (advances queue instantly with 0ms lag)
        session.submitAnswer(playerId, questionId, rawAnswer);

        // 2. Broadcast updated snapshots to Host and Players immediately
        broadcastFastMoneyState(io, session);

        const isFinished = session.isAllAnswered() || session.isTurnFinished();

        if (callback) {
          callback({ success: true, isFinished });
        }

        // 3. If all 5 questions answered, finish turn and transition to reveal phase
        if (isFinished) {
          clearFastMoneyTimer(normalizedCode);
          session.startRevealPhase();

          const turnEndedPayload: TurnEndedPayload = {
            roomCode: normalizedCode,
            reason: 'ALL_ANSWERED',
            answeredCount: session.getAnsweredCount(),
            totalQuestions: 5,
          };

          io.to(`room:${normalizedCode}`).emit('p1_turn_ended', turnEndedPayload);
          broadcastFastMoneyState(io, session);
        }

        // 4. Background validation & persistence via US-06 (non-blocking)
        evaluatePlayerAnswer({
          questionId,
          playerId,
          questionText: activeQuestion.questionText,
          candidateAnswers: activeQuestion.answers ?? [],
          rawInput: rawAnswer,
          language: session.language,
          persistAudit: true,
          prismaClient: db,
        })
          .then((outcome) => {
            session.recordEvaluation(questionId, outcome.pointsAwarded, outcome.isMatched);
            logger.info(
              `[FAST_MONEY:BG_EVAL] Evaluated question ${questionId}: ${outcome.pointsAwarded} pts (matched: ${outcome.isMatched})`
            );
          })
          .catch((err) => {
            logger.error(
              `[FAST_MONEY:BG_EVAL_ERROR] Background evaluation failed for question ${questionId}:`,
              err
            );
          });
      } catch (error: unknown) {
        logger.error('[FAST_MONEY:ERROR] Error in submit_answer handler', error);
        const errMsg = error instanceof Error ? error.message : 'Failed to submit answer';
        socket.emit('room_error', {
          code: 'SERVER_ERROR',
          message: errMsg,
        });
        if (callback) callback({ success: false, error: errMsg });
      }
    }
  );

  /**
   * Scenario 3: Passing and Re-visiting Questions
   * Pushes question to passed queue, advances queue, and recycles questions until timer expires.
   */
  socket.on(
    'pass_question',
    (
      payload: PassQuestionPayload,
      callback?: (res: {
        success: boolean;
        error?: string;
        nextQuestionId?: string | null;
        passedCount?: number;
      }) => void
    ) => {
      try {
        const { roomCode, playerId, questionId } = payload || {};
        if (!roomCode || !playerId || !questionId) {
          const errMsg = 'roomCode, playerId, and questionId are required';
          socket.emit('room_error', { code: 'INVALID_ROOM', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        const session = getFastMoneySession(normalizedCode);

        if (!session) {
          const errMsg = 'No active Fast Money session found for this room';
          socket.emit('room_error', { code: 'ROOM_NOT_FOUND', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        // 1. Pass question in session
        const nextQ = session.passQuestion(playerId, questionId);

        // 2. Broadcast updated snapshots immediately
        broadcastFastMoneyState(io, session);

        logger.info(
          `[FAST_MONEY:PASS] Player 1 passed question ${questionId} in room ${normalizedCode}. Next: ${
            nextQ ? nextQ.id : 'NONE'
          }`
        );

        if (callback) {
          callback({
            success: true,
            nextQuestionId: nextQ?.id ?? null,
            passedCount: session.getPassedCount(),
          });
        }
      } catch (error: unknown) {
        logger.error('[FAST_MONEY:ERROR] Error in pass_question handler', error);
        const errMsg = error instanceof Error ? error.message : 'Failed to pass question';
        socket.emit('room_error', {
          code: 'SERVER_ERROR',
          message: errMsg,
        });
        if (callback) callback({ success: false, error: errMsg });
      }
    }
  );

  /**
   * Scenario 1: Host Initiates Fast Money Reveal Phase
   */
  socket.on(
    'start_reveal_phase',
    (
      payload: { roomCode: string; isHost?: boolean },
      callback?: (res: { success: boolean; error?: string; phase?: string }) => void
    ) => {
      try {
        const { roomCode } = payload || {};
        if (!roomCode) {
          const errMsg = 'roomCode is required';
          socket.emit('room_error', { code: 'INVALID_ROOM', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        const session = getFastMoneySession(normalizedCode);

        if (!session) {
          const errMsg = 'No active Fast Money session found for this room';
          socket.emit('room_error', { code: 'ROOM_NOT_FOUND', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const isHost = socket.data?.isHost === true || payload.isHost === true;
        if (!isHost) {
          const errMsg = 'Only the host display can start the reveal phase';
          socket.emit('room_error', { code: 'UNAUTHORIZED', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        session.startRevealPhase();
        broadcastFastMoneyState(io, session);

        logger.info(
          `[FAST_MONEY:REVEAL_START] Host initiated reveal phase in room ${normalizedCode}`
        );

        if (callback) callback({ success: true, phase: 'P1_REVEAL' });
      } catch (error: unknown) {
        logger.error('[FAST_MONEY:ERROR] Error in start_reveal_phase handler', error);
        const errMsg = error instanceof Error ? error.message : 'Failed to start reveal phase';
        socket.emit('room_error', { code: 'SERVER_ERROR', message: errMsg });
        if (callback) callback({ success: false, error: errMsg });
      }
    }
  );

  /**
   * Scenario 1: Host Reveals Answer Text for Slot N
   * Flips card on TV screen to show contestant's answer with Ding SFX.
   */
  socket.on(
    'reveal_answer',
    (
      payload: RevealAnswerPayload,
      callback?: (res: {
        success: boolean;
        error?: string;
        slot?: FastMoneyRevealSlot;
        totalScore?: number;
      }) => void
    ) => {
      try {
        const { roomCode, slotNumber } = payload || {};
        if (!roomCode || typeof slotNumber !== 'number') {
          const errMsg = 'roomCode and valid numeric slotNumber are required';
          socket.emit('room_error', { code: 'INVALID_REQUEST', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        const session = getFastMoneySession(normalizedCode);

        if (!session) {
          const errMsg = 'No active Fast Money session found for this room';
          socket.emit('room_error', { code: 'ROOM_NOT_FOUND', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const isHost = socket.data?.isHost === true || payload.isHost === true;
        if (!isHost) {
          const errMsg = 'Only the host display can trigger answer reveal';
          socket.emit('room_error', { code: 'UNAUTHORIZED', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const slot = session.revealAnswer(slotNumber);
        const totalScore = session.getRoundTotalScore();

        const revealPayload: BoardRevealPayload = {
          roomCode: normalizedCode,
          type: 'ANSWER',
          slotNumber,
          slot: session.getRevealSlot(slotNumber, true),
          totalScore,
          isAllRevealed: session.isAllRevealed(),
          nextActiveSlotNumber: session.getActiveRevealSlotNumber(),
        };

        // Broadcast board_reveal to room (Scenario 1 & 5)
        io.to(`room:${normalizedCode}`).emit('board_reveal', revealPayload);

        // Update all role snapshots
        broadcastFastMoneyState(io, session);

        logger.info(
          `[FAST_MONEY:REVEAL_ANSWER] Room ${normalizedCode} Slot ${slotNumber} revealed: "${slot.rawAnswer}"`
        );

        if (callback) {
          callback({
            success: true,
            slot: revealPayload.slot,
            totalScore,
          });
        }
      } catch (error: unknown) {
        logger.error('[FAST_MONEY:ERROR] Error in reveal_answer handler', error);
        const errMsg = error instanceof Error ? error.message : 'Failed to reveal answer';
        socket.emit('room_error', { code: 'SERVER_ERROR', message: errMsg });
        if (callback) callback({ success: false, error: errMsg });
      }
    }
  );

  /**
   * Scenario 2, 3, & 4: Host Reveals Point Value for Slot N
   * Flips points box on TV screen, chimes/buzzes, increments total score, and advances to P2_READY when complete.
   */
  socket.on(
    'reveal_points',
    (
      payload: RevealPointsPayload,
      callback?: (res: {
        success: boolean;
        error?: string;
        slot?: FastMoneyRevealSlot;
        totalScore?: number;
        isAllRevealed?: boolean;
      }) => void
    ) => {
      try {
        const { roomCode, slotNumber } = payload || {};
        if (!roomCode || typeof slotNumber !== 'number') {
          const errMsg = 'roomCode and valid numeric slotNumber are required';
          socket.emit('room_error', { code: 'INVALID_REQUEST', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        const session = getFastMoneySession(normalizedCode);

        if (!session) {
          const errMsg = 'No active Fast Money session found for this room';
          socket.emit('room_error', { code: 'ROOM_NOT_FOUND', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const isHost = socket.data?.isHost === true || payload.isHost === true;
        if (!isHost) {
          const errMsg = 'Only the host display can trigger points reveal';
          socket.emit('room_error', { code: 'UNAUTHORIZED', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const slot = session.revealPoints(slotNumber);
        const totalScore = session.getRoundTotalScore();
        const isAllRevealed = session.isAllRevealed();

        const revealPayload: BoardRevealPayload = {
          roomCode: normalizedCode,
          type: 'POINTS',
          slotNumber,
          slot: session.getRevealSlot(slotNumber, true),
          totalScore,
          isAllRevealed,
          nextActiveSlotNumber: session.getActiveRevealSlotNumber(),
        };

        // Broadcast board_reveal to room (Scenario 2, 3, 5)
        io.to(`room:${normalizedCode}`).emit('board_reveal', revealPayload);

        // Update all role snapshots
        broadcastFastMoneyState(io, session);

        // Scenario 4: Completion of Player 1 Reveal -> Notify room of P2_READY
        if (session.getPhase() === 'P2_READY') {
          io.to(`room:${normalizedCode}`).emit('p1_reveal_completed', {
            roomCode: normalizedCode,
            totalScore,
            phase: 'P2_READY',
          });
          logger.info(
            `[FAST_MONEY:REVEAL_COMPLETE] Room ${normalizedCode} Player 1 reveal complete. Total: ${totalScore} pts. State: P2_READY`
          );
        } else {
          logger.info(
            `[FAST_MONEY:REVEAL_POINTS] Room ${normalizedCode} Slot ${slotNumber} points revealed: ${slot.pointsAwarded} pts (Total: ${totalScore})`
          );
        }

        if (callback) {
          callback({
            success: true,
            slot: revealPayload.slot,
            totalScore,
            isAllRevealed,
          });
        }
      } catch (error: unknown) {
        logger.error('[FAST_MONEY:ERROR] Error in reveal_points handler', error);
        const errMsg = error instanceof Error ? error.message : 'Failed to reveal points';
        socket.emit('room_error', { code: 'SERVER_ERROR', message: errMsg });
        if (callback) callback({ success: false, error: errMsg });
      }
    }
  );
}
