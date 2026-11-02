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
  evaluate?: boolean;
}

export interface SubmitFaceOffGuessPayload {
  roomCode: string;
  playerId: string;
  questionId?: string;
  rawAnswer: string;
  evaluate?: boolean;
}

export interface ChoosePlayPassPayload {
  roomCode: string;
  playerId: string;
  decision: 'play' | 'pass';
}

export interface RoundControlAssignedPayload {
  roomCode: string;
  winnerPlayerId: string;
  winnerTeam: 'TEAM_1' | 'TEAM_2';
  decision: 'play' | 'pass';
  controllingTeam: 'TEAM_1' | 'TEAM_2';
  controllingTeamName: string;
  message: string;
}

export interface PromptPassPlayPayload {
  roomCode: string;
  winnerPlayerId: string;
  winnerNickname: string;
  winnerTeam: 'TEAM_1' | 'TEAM_2';
  roundNumber: number;
  outcome?: string;
  message?: string;
}

export interface FaceOffBoardRevealPayload {
  roomCode: string;
  slotRank: number;
  rankOrder: number;
  answerText: string;
  points: number;
  playerId: string;
  playerNickname: string;
  playerTeam: 'TEAM_1' | 'TEAM_2';
  isNumberOneAnswer: boolean;
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

  if (timeoutResult.type === 'TIMEOUT_WINNER') {
    // Scenario: Opponent timed out during OPPONENT_GUESS -> Initial contender won
    io.to(`room:${normalizedCode}`).emit('prompt_pass_play', {
      roomCode: normalizedCode,
      winnerPlayerId: timeoutResult.winnerPlayerId!,
      winnerNickname: timeoutResult.winnerNickname!,
      winnerTeam: timeoutResult.winnerTeam!,
      roundNumber: session.roundNumber,
      message: timeoutResult.message,
    });
  } else if (timeoutResult.type === 'DEADLOCK_RESET') {
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
 * Registers WebSocket event listeners for Main Game Face-Off duel mechanics (US-12 & US-13).
 */
export function registerMainGameHandlers(
  io: SocketIOServer,
  socket: Socket,
  _db: PrismaClient = defaultPrisma
): void {
  /**
   * Contender marks ready for the Face-Off duel (US-12 Scenario 1).
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
   * Contender presses mobile buzzer button (US-12 Scenario 2).
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
   * Evaluates face-off answer guesses using Two-Tier validation and arbiter rules (US-13 Scenarios 1-5).
   * Event: 'submit_face_off_guess'
   */
  const handleFaceOffGuess = async (
    payload: SubmitFaceOffGuessPayload,
    callback?: (res: { success: boolean; outcome?: string; error?: string }) => void
  ) => {
    try {
      const { roomCode, playerId, questionId, rawAnswer } = payload || {};
      if (!roomCode || !playerId || !rawAnswer || !rawAnswer.trim()) {
        if (callback) callback({ success: false, error: 'Missing required fields' });
        return;
      }

      const normalizedCode = normalizeRoomCode(roomCode);
      const session = getFaceOffSession(normalizedCode);
      if (!session) {
        if (callback) callback({ success: false, error: 'No active face-off session found' });
        return;
      }

      if (session.activeRespondentId !== playerId) {
        socket.emit('face_off_error', {
          code: 'INVALID_SUBMISSION',
          message: 'Only the active respondent may submit an answer.',
        });
        if (callback) callback({ success: false, error: 'Only the active respondent may submit an answer.' });
        return;
      }

      if (session.phase !== 'ANSWERING' && session.phase !== 'OPPONENT_GUESS') {
        socket.emit('face_off_error', {
          code: 'INVALID_PHASE',
          message: 'Face-off is not in an answering phase.',
        });
        if (callback) callback({ success: false, error: 'Face-off is not in an answering phase.' });
        return;
      }

      // Notify clients of raw answer submission
      io.to(`room:${normalizedCode}`).emit('face_off_answer_submitted', {
        roomCode: normalizedCode,
        playerId,
        questionId: questionId || session.question.id,
        rawAnswer: rawAnswer.trim(),
      });

      // Execute authoritative scoring arbiter
      const evalResult = await session.evaluateContenderAnswer(playerId, rawAnswer.trim());

      // If matched, reveal the card on the host TV stage
      if (evalResult.revealedAnswer) {
        const boardRevealData: FaceOffBoardRevealPayload = {
          roomCode: normalizedCode,
          slotRank: evalResult.revealedAnswer.rankOrder,
          rankOrder: evalResult.revealedAnswer.rankOrder,
          answerText: evalResult.revealedAnswer.answerText,
          points: evalResult.revealedAnswer.points,
          playerId: evalResult.guessResult.playerId,
          playerNickname: evalResult.guessResult.playerNickname,
          playerTeam: evalResult.guessResult.playerTeam,
          isNumberOneAnswer: evalResult.guessResult.isNumberOneAnswer,
        };
        io.to(`room:${normalizedCode}`).emit('board_reveal', boardRevealData);
      }

      // Emit evaluation outcome
      io.to(`room:${normalizedCode}`).emit('face_off_guess_result', {
        roomCode: normalizedCode,
        outcome: evalResult.outcome,
        guessResult: evalResult.guessResult,
        revealedAnswer: evalResult.revealedAnswer,
        message: evalResult.message,
      });

      // State-specific broadcasts
      if (
        evalResult.outcome === 'NUMBER_ONE_WIN' ||
        evalResult.outcome === 'OPPONENT_WON' ||
        evalResult.outcome === 'INITIAL_WINNER_WON'
      ) {
        // Face-Off duel won -> prompt winner with "Play or Pass" (US-13 Scenarios 1, 3, 4)
        const promptPayload: PromptPassPlayPayload = {
          roomCode: normalizedCode,
          winnerPlayerId: evalResult.winnerPlayerId!,
          winnerNickname: evalResult.winnerNickname!,
          winnerTeam: evalResult.winnerTeam!,
          roundNumber: session.roundNumber,
          outcome: evalResult.outcome,
          message: evalResult.message,
        };
        io.to(`room:${normalizedCode}`).emit('prompt_pass_play', promptPayload);
      } else if (evalResult.outcome === 'OPPONENT_TURN') {
        // Floor passed to opponent with 15s timer (US-13 Scenarios 2 & 4)
        io.to(`room:${normalizedCode}`).emit('opponent_turn_prompt', {
          roomCode: normalizedCode,
          nextRespondentId: evalResult.nextRespondentId!,
          nextRespondentNickname: evalResult.nextRespondentNickname!,
          nextRespondentTeam: evalResult.nextRespondentTeam!,
          endsAt: evalResult.endsAt!,
          duration: evalResult.duration!,
          initialPoints: session.firstGuessResult?.points || 0,
          initialRawAnswer: session.firstGuessResult?.rawAnswer || '',
          message: evalResult.message,
        });
      } else if (evalResult.outcome === 'BOTH_MISSED_CASCADE') {
        // Both initial contenders missed -> cascades to next teammate (US-13 Scenario 5)
        io.to(`room:${normalizedCode}`).emit('face_off_cascade', {
          roomCode: normalizedCode,
          nextRespondentId: evalResult.nextRespondentId!,
          nextRespondentNickname: evalResult.nextRespondentNickname!,
          nextRespondentTeam: evalResult.nextRespondentTeam!,
          endsAt: evalResult.endsAt!,
          duration: evalResult.duration!,
          message: evalResult.message,
        });
      } else if (evalResult.outcome === 'DEADLOCK_RESET') {
        await handleFaceOffTimeoutBroadcast(
          io,
          normalizedCode,
          {
            type: 'DEADLOCK_RESET',
            timedOutPlayerId: playerId,
            timedOutPlayerNickname: evalResult.guessResult.playerNickname,
            timedOutPlayerTeam: evalResult.guessResult.playerTeam,
            message: 'All contenders missed without an answer. Generating replacement survey question.',
          },
          _db
        );
      }

      broadcastFaceOffState(io, session);
      if (callback) callback({ success: true, outcome: evalResult.outcome });
    } catch (err: any) {
      logger.error('Error handling face_off guess event', err);
      socket.emit('face_off_error', {
        code: 'EVALUATION_ERROR',
        message: err.message || 'Internal server error',
      });
      if (callback) callback({ success: false, error: err.message || 'Internal server error' });
    }
  };

  socket.on('submit_face_off_guess', handleFaceOffGuess);

  /**
   * Active respondent submits their answer for the Face-Off duel.
   * Event: 'submit_face_off_answer' (US-12 backward compatibility or evaluated if evaluate=true)
   */
  socket.on(
    'submit_face_off_answer',
    (
      payload: SubmitFaceOffAnswerPayload,
      callback?: (res: { success: boolean; error?: string }) => void
    ) => {
      try {
        const { roomCode, playerId, questionId, rawAnswer, evaluate } = payload || {};
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

        if (evaluate) {
          handleFaceOffGuess(payload, callback);
          return;
        }

        // US-12 backwards-compatible legacy path
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
   * Winner chooses whether their team will "PLAY" or "PASS" (US-13 Scenarios 6 & 7).
   * Event: 'choose_play_pass'
   */
  socket.on(
    'choose_play_pass',
    (
      payload: ChoosePlayPassPayload,
      callback?: (res: {
        success: boolean;
        decision?: 'play' | 'pass';
        controllingTeam?: 'TEAM_1' | 'TEAM_2';
        error?: string;
      }) => void
    ) => {
      try {
        const { roomCode, playerId, decision } = payload || {};
        if (!roomCode || !playerId || (decision !== 'play' && decision !== 'pass')) {
          if (callback) callback({ success: false, error: 'Invalid payload' });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        const session = getFaceOffSession(normalizedCode);
        if (!session) {
          if (callback) callback({ success: false, error: 'No active face-off session found' });
          return;
        }

        const decisionRes = session.choosePlayOrPass(playerId, decision);
        if (!decisionRes.success) {
          socket.emit('face_off_error', {
            code: 'INVALID_DECISION',
            message: decisionRes.error,
          });
          if (callback) callback({ success: false, error: decisionRes.error });
          return;
        }

        const controlAssignedPayload: RoundControlAssignedPayload = {
          roomCode: normalizedCode,
          winnerPlayerId: decisionRes.winnerPlayerId!,
          winnerTeam: decisionRes.winnerTeam!,
          decision: decisionRes.decision!,
          controllingTeam: decisionRes.controllingTeam!,
          controllingTeamName: decisionRes.controllingTeamName!,
          message:
            decisionRes.decision === 'play'
              ? `Team ${decisionRes.controllingTeam === 'TEAM_1' ? '1' : '2'} has chosen to PLAY!`
              : `Team ${decisionRes.winnerTeam === 'TEAM_1' ? '1' : '2'} has PASSED to Team ${decisionRes.controllingTeam === 'TEAM_1' ? '1' : '2'}!`,
        };

        io.to(`room:${normalizedCode}`).emit('round_control_assigned', controlAssignedPayload);
        broadcastFaceOffState(io, session);

        if (callback) {
          callback({
            success: true,
            decision: decisionRes.decision,
            controllingTeam: decisionRes.controllingTeam,
          });
        }
      } catch (err) {
        logger.error('Error handling choose_play_pass event', err);
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
