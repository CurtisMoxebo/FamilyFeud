import { Server as SocketIOServer, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../services/db';
import {
  FaceOffSession,
  FaceOffTimeoutResult,
  FaceOffQuestion,
  FaceOffPlayer,
  getFaceOffSession,
  initFaceOffSession,
} from '../services/faceOffService';
import {
  TeamGuessingSession,
  TeamGuessingTimeoutResult,
  TeamGuessingPlayer,
  TeamRevealedAnswer,
  StealEvaluationResult,
  getTeamGuessingSession,
  createTeamGuessingSessionFromFaceOff,
} from '../services/teamGuessingService';
import { generateAndSaveGameQuestions, saveQuestionsForGame } from '../services/questionService';
import { SupportedLanguage } from '../services/geminiService';
import { normalizeRoomCode } from '../utils/roomCode';
import { hostAdminService } from '../services/hostAdminService';
import { sessionRecoveryService } from '../services/sessionRecoveryService';
import { logger } from '../utils/logger';
import {
  getMatchScoreboard,
  getFaceOffContendersForRound,
  SUDDEN_DEATH_FALLBACK_QUESTIONS,
  ScoreboardState,
} from '../services/mainGameScoreboardService';
import { getFastMoneySession } from './fastMoneyHandler';

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
  rawAnswer?: string;
}

export interface SubmitTeamGuessPayload {
  roomCode: string;
  playerId: string;
  rawAnswer: string;
}

export interface PassTeamTurnPayload {
  roomCode: string;
  playerId: string;
}

export interface StrikeIssuedPayload {
  roomCode: string;
  team: 'TEAM_1' | 'TEAM_2';
  strikeCount: number;
  maxStrikes: number;
  player?: {
    id: string;
    nickname: string;
  };
  rawAnswer?: string;
  isDuplicate?: boolean;
  isTimeout?: boolean;
  isPass?: boolean;
}

export interface RoundClearedPayload {
  roomCode: string;
  winningTeam: 'TEAM_1' | 'TEAM_2';
  totalRoundPoints: number;
}

export interface TransitionStealPhasePayload {
  roomCode: string;
  controllingTeam: 'TEAM_1' | 'TEAM_2';
  opposingTeam: 'TEAM_1' | 'TEAM_2';
  roundBank: number;
  reason?: string;
  spokesperson?: TeamGuessingPlayer | null;
  endsAt?: number | null;
  duration?: number;
}

export interface SubmitStealGuessPayload {
  roomCode: string;
  playerId: string;
  rawAnswer: string;
}

export interface StealResolvedPayload {
  roomCode: string;
  success: boolean;
  outcome: 'STEAL_SUCCESS' | 'STEAL_FAILED' | 'STEAL_TIMEOUT';
  winningTeam: 'TEAM_1' | 'TEAM_2';
  pointsAwarded: number;
  stealingPlayer: TeamGuessingPlayer;
  matchedAnswer?: TeamRevealedAnswer;
  rawAnswer?: string;
  roundBank: number;
  remainingAnswers: TeamRevealedAnswer[];
  message: string;
}

export interface RoundWinnerPayload {
  roomCode: string;
  winningTeam: 'TEAM_1' | 'TEAM_2';
  pointsAwarded: number;
  roundBank: number;
  totalTeam1?: number;
  totalTeam2?: number;
  message?: string;
}

export interface ScoreboardUpdatePayload {
  roomCode: string;
  activeRoundBank: number;
  winningTeam?: 'TEAM_1' | 'TEAM_2';
  pointsAwarded?: number;
  team1GrandTotal?: number;
  team2GrandTotal?: number;
  currentRoundNumber?: number;
  totalRounds?: number;
  phase?: 'ROUND_IN_PROGRESS' | 'ROUND_RESOLVED' | 'MATCH_OVER' | 'SUDDEN_DEATH';
  matchWinner?: 'TEAM_1' | 'TEAM_2' | 'TIE' | null;
  isSuddenDeath?: boolean;
}

export interface MatchOverPayload {
  roomCode: string;
  winningTeam: 'TEAM_1' | 'TEAM_2';
  team1GrandTotal: number;
  team2GrandTotal: number;
  totalRounds: number;
  isSuddenDeath: boolean;
  message?: string;
}

export interface SuddenDeathInitiatedPayload {
  roomCode: string;
  team1GrandTotal: number;
  team2GrandTotal: number;
  roundNumber: number;
  message: string;
}

export interface NextRoundStartedPayload {
  roomCode: string;
  roundNumber: number;
  totalRounds: number;
  isSuddenDeath: boolean;
  question: {
    id: string;
    questionText: string;
    answerCount: number;
  };
  team1Contender: FaceOffPlayer;
  team2Contender: FaceOffPlayer;
}

export interface TeamTurnStartedPayload {
  roomCode: string;
  activePlayer: TeamGuessingPlayer | null;
  endsAt?: number;
  duration?: number;
}

/**
 * Broadcasts the current Team Guessing session state to all clients in the room (US-14).
 */
export function broadcastTeamGuessingState(
  io: SocketIOServer,
  session: TeamGuessingSession
): void {
  io.to(`room:${session.roomCode}`).emit('team_guessing_state', session.getState());
  const hostSocketId = sessionRecoveryService.getHostSocket(session.roomCode);
  if (hostSocketId) {
    io.to(hostSocketId).emit('host_override_options', {
      roomCode: session.roomCode,
      answers: session.getHostAnswerOptions(),
    });
  }
}

/**
 * Broadcasts team turn timeout, strike, and potential steal phase transition (US-14 Scenario 4).
 */
export function handleTeamGuessingTimeoutBroadcast(
  io: SocketIOServer,
  roomCode: string,
  timeoutResult: TeamGuessingTimeoutResult
): void {
  const normalizedCode = normalizeRoomCode(roomCode);
  const session = getTeamGuessingSession(normalizedCode);
  if (!session) return;

  const strikePayload: StrikeIssuedPayload = {
    roomCode: normalizedCode,
    team: session.controllingTeam,
    strikeCount: timeoutResult.strikeCount,
    maxStrikes: 3,
    player: {
      id: timeoutResult.timedOutPlayer.id,
      nickname: timeoutResult.timedOutPlayer.nickname,
    },
    isTimeout: true,
  };
  io.to(`room:${normalizedCode}`).emit('strike_issued', strikePayload);

  if (timeoutResult.type === 'STRIKE_TIMEOUT') {
    io.to(`room:${normalizedCode}`).emit('team_turn_started', {
      roomCode: normalizedCode,
      activePlayer: timeoutResult.nextPlayer,
      endsAt: timeoutResult.endsAt,
      duration: timeoutResult.duration,
    });
  } else if (timeoutResult.type === 'STEAL_PHASE_TRIGGERED') {
    io.to(`room:${normalizedCode}`).emit('transition_steal_phase', {
      roomCode: normalizedCode,
      controllingTeam: session.controllingTeam,
      opposingTeam: session.opposingTeam,
      roundBank: session.roundBank,
      reason: 'THREE_STRIKES',
      spokesperson: session.stealSpokesperson,
      endsAt: session.getState().endsAt,
      duration: session.timerDurationSeconds,
    });
  }

  broadcastTeamGuessingState(io, session);
}

/**
 * Broadcasts Steal Phase resolution, card reveals, score updates, and round winner (US-15 Scenarios 1-3).
 */
export function handleStealResolvedBroadcast(
  io: SocketIOServer,
  roomCode: string,
  stealResult: StealEvaluationResult,
  db: PrismaClient = defaultPrisma
): void {
  const normalizedCode = normalizeRoomCode(roomCode);
  const session = getTeamGuessingSession(normalizedCode);

  if (session && (session as any)._stealBroadcastDone) {
    return;
  }
  if (session) {
    (session as any)._stealBroadcastDone = true;
  }

  // Scenario 1: Flip matched steal card on host TV board
  if (stealResult.matchedAnswer) {
    io.to(`room:${normalizedCode}`).emit('board_reveal', {
      roomCode: normalizedCode,
      slotRank: stealResult.matchedAnswer.rankOrder,
      rankOrder: stealResult.matchedAnswer.rankOrder,
      answerText: stealResult.matchedAnswer.answerText,
      points: stealResult.matchedAnswer.points,
      roundBank: stealResult.roundBank,
      playerId: stealResult.stealingPlayer.id,
      playerNickname: stealResult.stealingPlayer.nickname,
      playerTeam: stealResult.winningTeam,
      isStealMatch: true,
    });
  }

  // Scenario 3: Flip open all remaining unrevealed cards on survey board
  if (stealResult.remainingAnswers && stealResult.remainingAnswers.length > 0) {
    for (const remaining of stealResult.remainingAnswers) {
      io.to(`room:${normalizedCode}`).emit('board_reveal', {
        roomCode: normalizedCode,
        slotRank: remaining.rankOrder,
        rankOrder: remaining.rankOrder,
        answerText: remaining.answerText,
        points: remaining.points,
        roundBank: stealResult.roundBank,
        isRemainingReveal: true,
      });
    }

    io.to(`room:${normalizedCode}`).emit('remaining_answers_reveal', {
      roomCode: normalizedCode,
      remainingAnswers: stealResult.remainingAnswers,
    });
  }

  // Scenario 2: Sound strike buzzer on failed steal or timeout
  if (!stealResult.success) {
    const strikePayload: StrikeIssuedPayload = {
      roomCode: normalizedCode,
      team: stealResult.stealingPlayer.team,
      strikeCount: 1,
      maxStrikes: 1,
      player: {
        id: stealResult.stealingPlayer.id,
        nickname: stealResult.stealingPlayer.nickname,
      },
      rawAnswer: stealResult.rawAnswer,
      isTimeout: stealResult.outcome === 'STEAL_TIMEOUT',
    };
    io.to(`room:${normalizedCode}`).emit('strike_issued', strikePayload);
  }

  // Emit steal resolution outcome
  const stealPayload: StealResolvedPayload = {
    roomCode: normalizedCode,
    success: stealResult.success,
    outcome: stealResult.outcome,
    winningTeam: stealResult.winningTeam,
    pointsAwarded: stealResult.pointsAwarded,
    stealingPlayer: stealResult.stealingPlayer,
    matchedAnswer: stealResult.matchedAnswer,
    rawAnswer: stealResult.rawAnswer,
    roundBank: stealResult.roundBank,
    remainingAnswers: stealResult.remainingAnswers,
    message: stealResult.message,
  };
  io.to(`room:${normalizedCode}`).emit('steal_resolved', stealPayload);

  // Emit round winner
  const winnerPayload: RoundWinnerPayload = {
    roomCode: normalizedCode,
    winningTeam: stealResult.winningTeam,
    pointsAwarded: stealResult.pointsAwarded,
    roundBank: stealResult.roundBank,
    message: stealResult.message,
  };
  io.to(`room:${normalizedCode}`).emit('round_winner', winnerPayload);

  // US-16: Update scoreboard and evaluate match resolution
  const scoreboard = getMatchScoreboard(normalizedCode);
  let scoreboardState = scoreboard?.getState();

  if (scoreboard) {
    scoreboardState = scoreboard.awardRoundPoints(
      stealResult.winningTeam,
      stealResult.pointsAwarded,
      stealResult.outcome
    );
  }

  // Emit scoreboard update
  const scorePayload: ScoreboardUpdatePayload = {
    roomCode: normalizedCode,
    activeRoundBank: 0,
    winningTeam: stealResult.winningTeam,
    pointsAwarded: stealResult.pointsAwarded,
    team1GrandTotal: scoreboardState?.team1GrandTotal ?? (stealResult.winningTeam === 'TEAM_1' ? stealResult.pointsAwarded : 0),
    team2GrandTotal: scoreboardState?.team2GrandTotal ?? (stealResult.winningTeam === 'TEAM_2' ? stealResult.pointsAwarded : 0),
    currentRoundNumber: scoreboardState?.currentRoundNumber ?? session?.roundNumber ?? 1,
    totalRounds: scoreboardState?.totalRounds ?? 3,
    phase: scoreboardState?.phase ?? 'ROUND_RESOLVED',
    matchWinner: scoreboardState?.matchWinner ?? null,
    isSuddenDeath: scoreboardState?.isSuddenDeath ?? false,
  };
  io.to(`room:${normalizedCode}`).emit('scoreboard_update', scorePayload);

  if (scoreboardState?.phase === 'MATCH_OVER' && scoreboardState.matchWinner && scoreboardState.matchWinner !== 'TIE') {
    const matchOverPayload: MatchOverPayload = {
      roomCode: normalizedCode,
      winningTeam: scoreboardState.matchWinner,
      team1GrandTotal: scoreboardState.team1GrandTotal,
      team2GrandTotal: scoreboardState.team2GrandTotal,
      totalRounds: scoreboardState.totalRounds,
      isSuddenDeath: scoreboardState.isSuddenDeath,
      message: `🏆 TEAM ${scoreboardState.matchWinner === 'TEAM_1' ? '1' : '2'} WINS THE GAME! (${scoreboardState.team1GrandTotal} vs ${scoreboardState.team2GrandTotal})`,
    };
    io.to(`room:${normalizedCode}`).emit('match_over', matchOverPayload);

    // Persist to MySQL via Prisma
    if (scoreboard?.gameId) {
      db.game
        .update({
          where: { id: scoreboard.gameId },
          data: {
            winnerTeam: scoreboardState.matchWinner,
            totalPointsAccumulated: scoreboardState.team1GrandTotal + scoreboardState.team2GrandTotal,
            status: 'COMPLETED',
          },
        })
        .catch((err) => {
          logger.error(`Failed to update game completion for ${scoreboard.gameId}`, err);
        });
    }
  } else if (scoreboardState?.phase === 'SUDDEN_DEATH') {
    const sdPayload: SuddenDeathInitiatedPayload = {
      roomCode: normalizedCode,
      team1GrandTotal: scoreboardState.team1GrandTotal,
      team2GrandTotal: scoreboardState.team2GrandTotal,
      roundNumber: scoreboardState.currentRoundNumber + 1,
      message: 'Scores are tied! Sudden Death tie-breaker initiated!',
    };
    io.to(`room:${normalizedCode}`).emit('sudden_death_initiated', sdPayload);
  }

  if (session) {
    broadcastTeamGuessingState(io, session);
  }
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

  // Emit strike_issued for timed out contender
  io.to(`room:${normalizedCode}`).emit('strike_issued', {
    roomCode: normalizedCode,
    team: timeoutResult.timedOutPlayerTeam,
    strikeCount: 1,
    maxStrikes: 3,
    isStrike: true,
    isTimeout: true,
    player: {
      id: timeoutResult.timedOutPlayerId,
      nickname: timeoutResult.timedOutPlayerNickname,
    },
    playerId: timeoutResult.timedOutPlayerId,
    playerNickname: timeoutResult.timedOutPlayerNickname,
    playerTeam: timeoutResult.timedOutPlayerTeam,
    reason: 'TIMEOUT',
  });

  if (timeoutResult.type === 'HAND_OFF') {
    // Scenario: Contender 1 timed out -> Floor passed to opponent contender
    io.to(`room:${normalizedCode}`).emit('opponent_turn_prompt', {
      roomCode: normalizedCode,
      nextRespondentId: timeoutResult.nextPlayerId!,
      nextRespondentNickname: timeoutResult.nextPlayerNickname!,
      nextRespondentTeam: timeoutResult.nextPlayerTeam!,
      endsAt: timeoutResult.endsAt!,
      duration: timeoutResult.duration!,
      initialPoints: 0,
      initialRawAnswer: '',
      message: timeoutResult.message,
    });
  } else if (timeoutResult.type === 'TIMEOUT_WINNER') {
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
      if (hostAdminService.isRoomPaused(normalizedCode)) {
        const errMsg = 'Game is currently paused by the host.';
        socket.emit('face_off_error', { code: 'GAME_PAUSED', message: errMsg });
        if (callback) callback({ success: false, error: errMsg });
        return;
      }
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
        if (hostAdminService.isRoomPaused(normalizedCode)) {
          socket.emit('buzzer_rejected', {
            roomCode: normalizedCode,
            playerId,
            reason: 'GAME_PAUSED',
          });
          if (callback) callback({ accepted: false, reason: 'GAME_PAUSED' });
          return;
        }
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

      // Execute authoritative scoring arbiter
      const evalResult = await session.evaluateContenderAnswer(playerId, rawAnswer.trim());

      // Notify clients of raw answer submission
      io.to(`room:${normalizedCode}`).emit('face_off_answer_submitted', {
        roomCode: normalizedCode,
        playerId,
        playerNickname: evalResult.guessResult.playerNickname,
        questionId: questionId || session.question.id,
        rawAnswer: rawAnswer.trim(),
      });

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
          rawAnswer: evalResult.guessResult.rawAnswer,
        };
        io.to(`room:${normalizedCode}`).emit('board_reveal', boardRevealData);
        io.to(`room:${normalizedCode}`).emit('face_off_board_reveal', boardRevealData);
      }

      // Emit evaluation outcome
      io.to(`room:${normalizedCode}`).emit('face_off_guess_result', {
        roomCode: normalizedCode,
        outcome: evalResult.outcome,
        guessResult: evalResult.guessResult,
        revealedAnswer: evalResult.revealedAnswer,
        message: evalResult.message,
      });

      if (!evalResult.guessResult.isMatched || evalResult.guessResult.points === 0) {
        io.to(`room:${normalizedCode}`).emit('strike_issued', {
          roomCode: normalizedCode,
          strikeCount: 1,
          isStrike: true,
          playerId: evalResult.guessResult.playerId,
          playerNickname: evalResult.guessResult.playerNickname,
          playerTeam: evalResult.guessResult.playerTeam,
          rawAnswer: evalResult.guessResult.rawAnswer,
          reason: 'WRONG_ANSWER',
        });
      }

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
        if (hostAdminService.isRoomPaused(normalizedCode)) {
          const errMsg = 'Game is currently paused by the host.';
          socket.emit('face_off_error', { code: 'GAME_PAUSED', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }
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
        if (hostAdminService.isRoomPaused(normalizedCode)) {
          const errMsg = 'Game is currently paused by the host.';
          socket.emit('face_off_error', { code: 'GAME_PAUSED', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }
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

        // Initialize and start Team Guessing Session (US-14)
        try {
          const teamSession = createTeamGuessingSessionFromFaceOff(session, {
            onTick: (secondsRemaining, endsAt) => {
              io.to(`room:${normalizedCode}`).emit('timer_tick', {
                secondsRemaining,
                endsAt,
              });
            },
            onTimeout: (timeoutRes) => {
              handleTeamGuessingTimeoutBroadcast(io, normalizedCode, timeoutRes);
            },
            onStealResolved: (stealRes) => {
              handleStealResolvedBroadcast(io, normalizedCode, stealRes);
            },
          });

          io.to(`room:${normalizedCode}`).emit('team_turn_started', {
            roomCode: normalizedCode,
            activePlayer: teamSession.activePlayer,
            endsAt: teamSession.getState().endsAt,
            duration: 15,
          });

          broadcastTeamGuessingState(io, teamSession);
        } catch (teamErr) {
          logger.error(`Error initializing TeamGuessingSession for room ${normalizedCode}`, teamErr);
        }

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

  /**
   * Active team member submits guess during Team Guessing phase (US-14 Scenarios 1-4).
   * Event: 'submit_team_guess'
   */
  socket.on(
    'submit_team_guess',
    async (
      payload: SubmitTeamGuessPayload,
      callback?: (res: { success: boolean; outcome?: string; error?: string }) => void
    ) => {
      try {
        const { roomCode, playerId, rawAnswer } = payload || {};
        if (!roomCode || !playerId || rawAnswer === undefined) {
          if (callback) callback({ success: false, error: 'Missing required fields' });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        if (hostAdminService.isRoomPaused(normalizedCode)) {
          const errMsg = 'Game is currently paused by the host.';
          socket.emit('team_guess_error', { code: 'GAME_PAUSED', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }
        const session = getTeamGuessingSession(normalizedCode);
        if (!session) {
          if (callback) callback({ success: false, error: 'No active team guessing session found' });
          return;
        }

        const evalResult = await session.evaluateGuess(playerId, rawAnswer);

        // Notify clients of raw answer submission
        io.to(`room:${normalizedCode}`).emit('team_guess_submitted', {
          roomCode: normalizedCode,
          playerId,
          playerNickname: evalResult.guessResult.playerNickname,
          rawAnswer: rawAnswer.trim(),
        });

        // If matched and card revealed (Scenario 1 & 3)
        if (evalResult.revealedAnswer) {
          const scoreboard = getMatchScoreboard(normalizedCode);
          scoreboard?.updateActiveRoundBank(evalResult.roundBank);

          const revealData = {
            roomCode: normalizedCode,
            slotRank: evalResult.revealedAnswer.rankOrder,
            rankOrder: evalResult.revealedAnswer.rankOrder,
            answerText: evalResult.revealedAnswer.answerText,
            points: evalResult.revealedAnswer.points,
            roundBank: evalResult.roundBank,
            playerId: evalResult.guessResult.playerId,
            playerNickname: evalResult.guessResult.playerNickname,
            playerTeam: evalResult.guessResult.playerTeam,
            rawAnswer: evalResult.guessResult.rawAnswer,
            isAllRevealed: evalResult.outcome === 'ROUND_CLEARED',
          };
          io.to(`room:${normalizedCode}`).emit('board_reveal', revealData);
          io.to(`room:${normalizedCode}`).emit('scoreboard_update', {
            roomCode: normalizedCode,
            activeRoundBank: evalResult.roundBank,
            team1GrandTotal: scoreboard?.team1GrandTotal ?? 0,
            team2GrandTotal: scoreboard?.team2GrandTotal ?? 0,
            currentRoundNumber: scoreboard?.currentRoundNumber ?? session.roundNumber ?? 1,
            totalRounds: scoreboard?.totalRounds ?? 3,
            phase: scoreboard?.phase ?? 'ROUND_IN_PROGRESS',
            matchWinner: scoreboard?.matchWinner ?? null,
            isSuddenDeath: scoreboard?.isSuddenDeath ?? false,
          });
        }

        // Emit strike notification (Scenario 2 & 4)
        if (evalResult.outcome === 'STRIKE' || evalResult.outcome === 'STEAL_PHASE_TRIGGERED') {
          const strikePayload: StrikeIssuedPayload = {
            roomCode: normalizedCode,
            team: session.controllingTeam,
            strikeCount: evalResult.strikeCount,
            maxStrikes: 3,
            player: {
              id: evalResult.guessResult.playerId,
              nickname: evalResult.guessResult.playerNickname,
            },
            rawAnswer: evalResult.guessResult.rawAnswer,
            isDuplicate: evalResult.guessResult.isDuplicate,
          };
          io.to(`room:${normalizedCode}`).emit('strike_issued', strikePayload);
        }

        io.to(`room:${normalizedCode}`).emit('team_guess_result', {
          roomCode: normalizedCode,
          outcome: evalResult.outcome,
          guessResult: evalResult.guessResult,
          revealedAnswer: evalResult.revealedAnswer,
          strikeCount: evalResult.strikeCount,
          isStrike: evalResult.isStrike,
          roundBank: evalResult.roundBank,
          message: evalResult.message,
        });

        if (evalResult.outcome === 'CORRECT_GUESS' || evalResult.outcome === 'STRIKE') {
          io.to(`room:${normalizedCode}`).emit('team_turn_started', {
            roomCode: normalizedCode,
            activePlayer: evalResult.nextPlayer,
            endsAt: evalResult.endsAt,
            duration: evalResult.duration,
          });
        } else if (evalResult.outcome === 'ROUND_CLEARED') {
          io.to(`room:${normalizedCode}`).emit('round_cleared', {
            roomCode: normalizedCode,
            winningTeam: session.controllingTeam,
            totalRoundPoints: evalResult.roundBank,
          });
          io.to(`room:${normalizedCode}`).emit('round_winner', {
            roomCode: normalizedCode,
            winningTeam: session.controllingTeam,
            pointsAwarded: evalResult.roundBank,
            roundBank: evalResult.roundBank,
            message: `Team ${session.controllingTeam === 'TEAM_1' ? '1' : '2'} cleared the board!`,
          });

          // US-16: Update scoreboard and evaluate match resolution
          const scoreboard = getMatchScoreboard(normalizedCode);
          let scoreboardState = scoreboard?.getState();

          if (scoreboard) {
            scoreboardState = scoreboard.awardRoundPoints(
              session.controllingTeam,
              evalResult.roundBank,
              'ROUND_CLEARED'
            );
          }

          io.to(`room:${normalizedCode}`).emit('scoreboard_update', {
            roomCode: normalizedCode,
            activeRoundBank: 0,
            winningTeam: session.controllingTeam,
            pointsAwarded: evalResult.roundBank,
            team1GrandTotal: scoreboardState?.team1GrandTotal ?? (session.controllingTeam === 'TEAM_1' ? evalResult.roundBank : 0),
            team2GrandTotal: scoreboardState?.team2GrandTotal ?? (session.controllingTeam === 'TEAM_2' ? evalResult.roundBank : 0),
            currentRoundNumber: scoreboardState?.currentRoundNumber ?? session.roundNumber ?? 1,
            totalRounds: scoreboardState?.totalRounds ?? 3,
            phase: scoreboardState?.phase ?? 'ROUND_RESOLVED',
            matchWinner: scoreboardState?.matchWinner ?? null,
            isSuddenDeath: scoreboardState?.isSuddenDeath ?? false,
          });

          if (scoreboardState?.phase === 'MATCH_OVER' && scoreboardState.matchWinner && scoreboardState.matchWinner !== 'TIE') {
            io.to(`room:${normalizedCode}`).emit('match_over', {
              roomCode: normalizedCode,
              winningTeam: scoreboardState.matchWinner,
              team1GrandTotal: scoreboardState.team1GrandTotal,
              team2GrandTotal: scoreboardState.team2GrandTotal,
              totalRounds: scoreboardState.totalRounds,
              isSuddenDeath: scoreboardState.isSuddenDeath,
              message: `🏆 TEAM ${scoreboardState.matchWinner === 'TEAM_1' ? '1' : '2'} WINS THE GAME! (${scoreboardState.team1GrandTotal} vs ${scoreboardState.team2GrandTotal})`,
            });

            if (scoreboard?.gameId) {
              _db.game
                .update({
                  where: { id: scoreboard.gameId },
                  data: {
                    winnerTeam: scoreboardState.matchWinner,
                    totalPointsAccumulated: scoreboardState.team1GrandTotal + scoreboardState.team2GrandTotal,
                    status: 'COMPLETED',
                  },
                })
                .catch((err) => {
                  logger.error(`Failed to update game completion for ${scoreboard.gameId}`, err);
                });
            }
          } else if (scoreboardState?.phase === 'SUDDEN_DEATH') {
            io.to(`room:${normalizedCode}`).emit('sudden_death_initiated', {
              roomCode: normalizedCode,
              team1GrandTotal: scoreboardState.team1GrandTotal,
              team2GrandTotal: scoreboardState.team2GrandTotal,
              roundNumber: scoreboardState.currentRoundNumber + 1,
              message: 'Scores are tied! Sudden Death tie-breaker initiated!',
            });
          }
        } else if (evalResult.outcome === 'STEAL_PHASE_TRIGGERED') {
          io.to(`room:${normalizedCode}`).emit('transition_steal_phase', {
            roomCode: normalizedCode,
            controllingTeam: session.controllingTeam,
            opposingTeam: session.opposingTeam,
            roundBank: evalResult.roundBank,
            reason: 'THREE_STRIKES',
            spokesperson: session.stealSpokesperson,
            endsAt: session.getState().endsAt,
            duration: session.timerDurationSeconds,
          });
        }

        broadcastTeamGuessingState(io, session);
        if (callback) callback({ success: true, outcome: evalResult.outcome });
      } catch (err: any) {
        logger.error('Error handling submit_team_guess event', err);
        socket.emit('team_guess_error', {
          code: 'GUESS_ERROR',
          message: err.message || 'Internal server error',
        });
        if (callback) callback({ success: false, error: err.message || 'Internal server error' });
      }
    }
  );

  /**
   * Active player voluntarily passes their turn during Team Guessing phase.
   * Event: 'pass_team_turn'
   */
  socket.on(
    'pass_team_turn',
    (
      payload: PassTeamTurnPayload,
      callback?: (res: { success: boolean; outcome?: string; error?: string }) => void
    ) => {
      try {
        const { roomCode, playerId } = payload || {};
        if (!roomCode || !playerId) {
          if (callback) callback({ success: false, error: 'Missing required fields' });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        if (hostAdminService.isRoomPaused(normalizedCode)) {
          const errMsg = 'Game is currently paused by the host.';
          socket.emit('team_guess_error', { code: 'GAME_PAUSED', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }
        const session = getTeamGuessingSession(normalizedCode);
        if (!session) {
          if (callback) callback({ success: false, error: 'No active team guessing session found' });
          return;
        }

        const passResult = session.passTurn(playerId);

        const strikePayload: StrikeIssuedPayload = {
          roomCode: normalizedCode,
          team: session.controllingTeam,
          strikeCount: passResult.strikeCount,
          maxStrikes: 3,
          player: {
            id: passResult.guessResult.playerId,
            nickname: passResult.guessResult.playerNickname,
          },
          rawAnswer: passResult.guessResult.rawAnswer,
          isPass: true,
        };
        io.to(`room:${normalizedCode}`).emit('strike_issued', strikePayload);

        io.to(`room:${normalizedCode}`).emit('team_guess_result', {
          roomCode: normalizedCode,
          outcome: passResult.outcome,
          guessResult: passResult.guessResult,
          strikeCount: passResult.strikeCount,
          isStrike: true,
          roundBank: passResult.roundBank,
          message: passResult.message,
        });

        if (passResult.outcome === 'STRIKE') {
          io.to(`room:${normalizedCode}`).emit('team_turn_started', {
            roomCode: normalizedCode,
            activePlayer: passResult.nextPlayer,
            endsAt: passResult.endsAt,
            duration: passResult.duration,
          });
        } else if (passResult.outcome === 'STEAL_PHASE_TRIGGERED') {
          io.to(`room:${normalizedCode}`).emit('transition_steal_phase', {
            roomCode: normalizedCode,
            controllingTeam: session.controllingTeam,
            opposingTeam: session.opposingTeam,
            roundBank: passResult.roundBank,
            reason: 'THREE_STRIKES',
            spokesperson: session.stealSpokesperson,
            endsAt: session.getState().endsAt,
            duration: session.timerDurationSeconds,
          });
        }

        broadcastTeamGuessingState(io, session);
        if (callback) callback({ success: true, outcome: passResult.outcome });
      } catch (err: any) {
        logger.error('Error handling pass_team_turn event', err);
        socket.emit('team_guess_error', {
          code: 'PASS_ERROR',
          message: err.message || 'Internal server error',
        });
        if (callback) callback({ success: false, error: err.message || 'Internal server error' });
      }
    }
  );

  /**
   * Allows clients to fetch the active Team Guessing state snapshot.
   * Event: 'get_team_guessing_state'
   */
  socket.on(
    'get_team_guessing_state',
    (
      payload: { roomCode: string },
      callback?: (res: { success: boolean; state?: any; error?: string }) => void
    ) => {
      const { roomCode } = payload || {};
      if (!roomCode) {
        if (callback) callback({ success: false, error: 'Missing roomCode' });
        return;
      }

      const session = getTeamGuessingSession(normalizeRoomCode(roomCode));
      if (!session) {
        if (callback) callback({ success: false, error: 'No active team guessing session' });
        return;
      }

      const state = session.getState();
      if (callback) callback({ success: true, state });
    }
  );

  /**
   * Designated spokesperson submits steal guess during Steal Phase (US-15 Scenarios 1-4).
   * Event: 'submit_steal_guess'
   */
  socket.on(
    'submit_steal_guess',
    async (
      payload: SubmitStealGuessPayload,
      callback?: (res: {
        success: boolean;
        outcome?: string;
        stealSuccess?: boolean;
        error?: string;
      }) => void
    ) => {
      try {
        const { roomCode, playerId, rawAnswer } = payload || {};
        if (!roomCode || !playerId || rawAnswer === undefined || !rawAnswer.trim()) {
          if (callback) callback({ success: false, error: 'Missing required fields' });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        if (hostAdminService.isRoomPaused(normalizedCode)) {
          const errMsg = 'Game is currently paused by the host.';
          socket.emit('steal_error', { code: 'GAME_PAUSED', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }
        const session = getTeamGuessingSession(normalizedCode);
        if (!session) {
          if (callback) callback({ success: false, error: 'No active team guessing session found' });
          return;
        }

        if (session.phase !== 'STEAL_PHASE') {
          socket.emit('steal_error', {
            code: 'INVALID_PHASE',
            message: `Steal phase is not active (current phase: ${session.phase}).`,
          });
          if (callback) callback({ success: false, error: 'Steal phase is not active.' });
          return;
        }

        if (session.stealSpokespersonId && session.stealSpokespersonId !== playerId) {
          socket.emit('steal_error', {
            code: 'NOT_SPOKESPERSON',
            message: `Only the designated spokesperson (${session.stealSpokesperson?.nickname || 'spokesperson'}) may submit the steal answer.`,
          });
          if (callback)
            callback({
              success: false,
              error: 'Only the designated spokesperson may submit the steal answer.',
            });
          return;
        }

        const evalResult = await session.evaluateStealGuess(playerId, rawAnswer.trim());

        io.to(`room:${normalizedCode}`).emit('steal_guess_submitted', {
          roomCode: normalizedCode,
          playerId,
          playerNickname: session.stealSpokesperson?.nickname || 'Spokesperson',
          rawAnswer: rawAnswer.trim(),
        });

        handleStealResolvedBroadcast(io, normalizedCode, evalResult);

        if (callback) {
          callback({
            success: true,
            outcome: evalResult.outcome,
            stealSuccess: evalResult.success,
          });
        }
      } catch (err: any) {
        logger.error('Error handling submit_steal_guess event', err);
        socket.emit('steal_error', {
          code: 'STEAL_EVALUATION_ERROR',
          message: err.message || 'Internal server error',
        });
        if (callback) callback({ success: false, error: err.message || 'Internal server error' });
      }
    }
  );

  /**
   * Allows clients to fetch the active Steal Phase state snapshot.
   * Event: 'get_steal_state'
   */
  socket.on(
    'get_steal_state',
    (
      payload: { roomCode: string },
      callback?: (res: { success: boolean; state?: any; error?: string }) => void
    ) => {
      const { roomCode } = payload || {};
      if (!roomCode) {
        if (callback) callback({ success: false, error: 'Missing roomCode' });
        return;
      }

      const session = getTeamGuessingSession(normalizeRoomCode(roomCode));
      if (!session) {
        if (callback) callback({ success: false, error: 'No active session found' });
        return;
      }

      const state = session.getState();
      if (callback) callback({ success: true, state });
    }
  );

  /**
   * Host notifies room that answer announcement has completed and reveals can finalize (US-28).
   * Event: 'answer_reveal_completed'
   */
  socket.on('answer_reveal_completed', (payload: { roomCode: string }) => {
    if (!payload?.roomCode) return;
    const normalizedCode = normalizeRoomCode(payload.roomCode);
    io.to(`room:${normalizedCode}`).emit('answer_reveal_completed', {
      roomCode: normalizedCode,
    });
  });

  /**
   * Allows clients to fetch the active Scoreboard state snapshot (US-16).
   * Event: 'get_scoreboard_state'
   */
  socket.on(
    'get_scoreboard_state',
    (
      payload: { roomCode: string },
      callback?: (res: { success: boolean; scoreboard?: ScoreboardState; error?: string }) => void
    ) => {
      const { roomCode } = payload || {};
      if (!roomCode) {
        if (callback) callback({ success: false, error: 'roomCode is required' });
        return;
      }

      const normalizedCode = normalizeRoomCode(roomCode);
      const scoreboard = getMatchScoreboard(normalizedCode);
      if (!scoreboard) {
        if (callback) callback({ success: false, error: 'No active match found for this room' });
        return;
      }

      const state = scoreboard.getState();
      socket.emit('scoreboard_update', state);
      if (callback) callback({ success: true, scoreboard: state });
    }
  );

  /**
   * Advances the match to the next round with rotated Face-Off contenders (US-16 Scenario 3 & 6).
   * Event: 'advance_next_round' | 'main_game_next_round'
   */
  const handleAdvanceNextRound = async (
    payload: { roomCode: string; isHost?: boolean },
    callback?: (res: { success: boolean; nextRoundNumber?: number; error?: string }) => void
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
      const scoreboard = getMatchScoreboard(normalizedCode);
      if (!scoreboard) {
        const errMsg = 'No active scoreboard session found for this room';
        socket.emit('room_error', { code: 'SESSION_NOT_FOUND', message: errMsg });
        if (callback) callback({ success: false, error: errMsg });
        return;
      }

      if (scoreboard.phase === 'MATCH_OVER') {
        const errMsg = 'Cannot advance round: match has already concluded';
        socket.emit('room_error', { code: 'MATCH_CONCLUDED', message: errMsg });
        if (callback) callback({ success: false, error: errMsg });
        return;
      }

      hostAdminService.clearRoomAdmin(normalizedCode, io);
      const { nextRoundNumber, isSuddenDeath, state } = scoreboard.advanceToNextRound();

      // Update current round in database
      await _db.game.update({
        where: { id: scoreboard.gameId },
        data: { currentRound: nextRoundNumber },
      });

      const room = await _db.room.findUnique({
        where: { roomCode: normalizedCode },
        include: { players: true },
      });

      const language = (room?.language as SupportedLanguage) || 'EN';

      // Retrieve existing face-off session players or build from room.players
      const prevFaceOff = getFaceOffSession(normalizedCode);
      const team1Players =
        prevFaceOff?.team1Players ||
        (room?.players || [])
          .filter((p) => p.team === 'TEAM_1')
          .map((p, i) => ({
            id: p.id,
            nickname: p.nickname || 'Contender',
            team: 'TEAM_1' as const,
            battingOrder: i + 1,
          }));
      const team2Players =
        prevFaceOff?.team2Players ||
        (room?.players || [])
          .filter((p) => p.team === 'TEAM_2')
          .map((p, i) => ({
            id: p.id,
            nickname: p.nickname || 'Contender',
            team: 'TEAM_2' as const,
            battingOrder: i + 1,
          }));

      let newQuestion: FaceOffQuestion;

      if (isSuddenDeath) {
        // Scenario 6: Sudden Death question with single #1 answer
        const fallback =
          SUDDEN_DEATH_FALLBACK_QUESTIONS[language] || SUDDEN_DEATH_FALLBACK_QUESTIONS.EN;
        const [savedQ] = await saveQuestionsForGame({
          gameId: scoreboard.gameId,
          questions: [
            {
              questionText: fallback.questionText,
              answers: [{ text: fallback.answerText, points: 100 }],
            },
          ],
          language,
          gameMode: 'MAIN_GAME',
          startingRoundNumber: nextRoundNumber,
          prismaClient: _db,
        });

        newQuestion = {
          id: savedQ.id,
          questionText: savedQ.questionText,
          orderIndex: savedQ.orderIndex,
          roundNumber: nextRoundNumber,
          answers: savedQ.answers.map((a) => ({
            id: a.id,
            answerText: a.answerText,
            points: a.points,
            rankOrder: a.rankOrder,
          })),
        };
      } else {
        // Standard next round question
        const questions = await generateAndSaveGameQuestions({
          gameId: scoreboard.gameId,
          gameMode: 'MAIN_GAME',
          language,
          roundNumber: nextRoundNumber,
          count: 1,
          prismaClient: _db,
        });

        const q = questions[0];
        newQuestion = {
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
      }

      // Rotate contenders modulo team size (Scenario 3)
      const contenderResult = getFaceOffContendersForRound(
        nextRoundNumber,
        team1Players,
        team2Players
      );

      // Initialize new Face-Off session for the new round
      const newFaceOff = initFaceOffSession(normalizedCode, {
        gameId: scoreboard.gameId,
        roundNumber: nextRoundNumber,
        team1Players,
        team2Players,
        question: newQuestion,
        language,
        timerDurationSeconds: 15,
        persistAudit: true,
        prismaClient: _db,
        onTick: (secondsRemaining, endsAt) => {
          io.to(`room:${normalizedCode}`).emit('timer_tick', {
            roomCode: normalizedCode,
            secondsRemaining,
            endsAt,
          });
        },
        onTimeout: (timeoutResult) => {
          handleFaceOffTimeoutBroadcast(io, normalizedCode, timeoutResult, _db);
        },
      });

      // Broadcast next round started event
      const nextRoundPayload: NextRoundStartedPayload = {
        roomCode: normalizedCode,
        roundNumber: nextRoundNumber,
        totalRounds: state.totalRounds,
        isSuddenDeath,
        question: {
          id: newQuestion.id,
          questionText: newQuestion.questionText,
          answerCount: newQuestion.answers.length,
        },
        team1Contender: contenderResult.team1Contender,
        team2Contender: contenderResult.team2Contender,
      };
      io.to(`room:${normalizedCode}`).emit('next_round_started', nextRoundPayload);

      // Broadcast updated scoreboard & faceoff states
      io.to(`room:${normalizedCode}`).emit('scoreboard_update', state);
      broadcastFaceOffState(io, newFaceOff);

      logger.info(
        `[MAIN_GAME:NEXT_ROUND] Room ${normalizedCode} advanced to Round ${nextRoundNumber} (Contenders: ${contenderResult.team1Contender.nickname} vs ${contenderResult.team2Contender.nickname})`
      );

      if (callback) callback({ success: true, nextRoundNumber });
    } catch (err: any) {
      logger.error('Error handling advance_next_round event', err);
      socket.emit('room_error', {
        code: 'ADVANCE_ROUND_ERROR',
        message: err.message || 'Internal server error',
      });
      if (callback) callback({ success: false, error: err.message || 'Internal server error' });
    }
  };

  socket.on('advance_next_round', handleAdvanceNextRound);
  socket.on('main_game_next_round', handleAdvanceNextRound);

  /**
   * Host requests match replay in the same room (US-16 Scenario 5).
   * Event: 'request_replay' | 'main_game_replay'
   */
  const handleMainGameReplay = async (
    payload: { roomCode: string; isHost?: boolean },
    callback?: (res: { success: boolean; gameId?: string; error?: string }) => void
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
      const scoreboard = getMatchScoreboard(normalizedCode);
      const fastMoneySession = getFastMoneySession(normalizedCode);

      if (!scoreboard) {
        if (fastMoneySession) {
          return; // Handled by fastMoneyHandler
        }
        const errMsg = 'No active Main Game session found for this room';
        socket.emit('room_error', { code: 'ROOM_NOT_FOUND', message: errMsg });
        if (callback) callback({ success: false, error: errMsg });
        return;
      }

      const isHost = socket.data?.isHost === true || payload?.isHost === true;
      if (!isHost) {
        const errMsg = 'Only the host display can initiate match replay';
        socket.emit('room_error', { code: 'UNAUTHORIZED', message: errMsg });
        if (callback) callback({ success: false, error: errMsg });
        return;
      }

      const room = await _db.room.findUnique({
        where: { roomCode: normalizedCode },
        include: { players: true },
      });

      if (!room) {
        const errMsg = `Room ${normalizedCode} not found in database`;
        socket.emit('room_error', { code: 'ROOM_NOT_FOUND', message: errMsg });
        if (callback) callback({ success: false, error: errMsg });
        return;
      }

      // Create new game record in MySQL
      const newGame = await _db.game.create({
        data: {
          roomId: room.id,
          mode: 'MAIN_GAME',
          status: 'IN_PROGRESS',
          currentRound: 1,
        },
      });

      const language = (room.language as SupportedLanguage) || 'EN';

      // Generate round 1 question for new match
      const questions = await generateAndSaveGameQuestions({
        gameId: newGame.id,
        gameMode: 'MAIN_GAME',
        language,
        roundNumber: 1,
        count: 1,
        prismaClient: _db,
      });

      hostAdminService.clearRoomAdmin(normalizedCode, io);

      // Retrieve players preserving team assignments
      const prevFaceOff = getFaceOffSession(normalizedCode);
      const team1Players =
        prevFaceOff?.team1Players ||
        room.players
          .filter((p) => p.team === 'TEAM_1')
          .sort((a, b) => a.nickname.localeCompare(b.nickname))
          .map((p, i) => ({
            id: p.id,
            nickname: p.nickname || 'Contender',
            team: 'TEAM_1' as const,
            battingOrder: i + 1,
          }));
      const team2Players =
        prevFaceOff?.team2Players ||
        room.players
          .filter((p) => p.team === 'TEAM_2')
          .sort((a, b) => a.nickname.localeCompare(b.nickname))
          .map((p, i) => ({
            id: p.id,
            nickname: p.nickname || 'Contender',
            team: 'TEAM_2' as const,
            battingOrder: i + 1,
          }));

      // Reset scoreboard session: total rounds equal to players per team
      const replayTotalRounds = team1Players.length > 0 ? team1Players.length : scoreboard.totalRounds;
      const resetState = scoreboard.resetForReplay(newGame.id, { totalRounds: replayTotalRounds });

      const q = questions[0];
      const newQuestion: FaceOffQuestion = {
        id: q.id,
        questionText: q.questionText,
        orderIndex: q.orderIndex,
        roundNumber: 1,
        answers: q.answers.map((a) => ({
          id: a.id,
          answerText: a.answerText,
          points: a.points,
          rankOrder: a.rankOrder,
        })),
      };

      // Initialize Round 1 Face-Off session
      const newSession = initFaceOffSession(normalizedCode, {
        gameId: newGame.id,
        roundNumber: 1,
        team1Players,
        team2Players,
        question: newQuestion,
        language,
        timerDurationSeconds: 15,
        persistAudit: true,
        prismaClient: _db,
        onTick: (secondsRemaining, endsAt) => {
          io.to(`room:${normalizedCode}`).emit('timer_tick', {
            roomCode: normalizedCode,
            secondsRemaining,
            endsAt,
          });
        },
        onTimeout: (timeoutResult) => {
          handleFaceOffTimeoutBroadcast(io, normalizedCode, timeoutResult, _db);
        },
      });

      // Broadcast game_replayed & initial scoreboard
      io.to(`room:${normalizedCode}`).emit('game_replayed', {
        roomCode: normalizedCode,
        gameId: newGame.id,
        gameMode: 'MAIN_GAME',
        currentRound: 1,
        totalRounds: resetState.totalRounds,
      });
      io.to(`room:${normalizedCode}`).emit('scoreboard_update', resetState);
      broadcastFaceOffState(io, newSession);

      logger.info(
        `[MAIN_GAME:REPLAY] Room ${normalizedCode} reset and replayed with new game ${newGame.id}`
      );

      if (callback) callback({ success: true, gameId: newGame.id });
    } catch (err: any) {
      logger.error('Error handling main_game_replay event', err);
      socket.emit('room_error', {
        code: 'REPLAY_ERROR',
        message: err.message || 'Internal server error',
      });
      if (callback) callback({ success: false, error: err.message || 'Internal server error' });
    }
  };

  socket.on('request_replay', handleMainGameReplay);
  socket.on('main_game_replay', handleMainGameReplay);
}
