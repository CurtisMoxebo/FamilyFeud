import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './db';
import { logger } from '../utils/logger';
import { evaluatePlayerAnswer } from './answerValidationService';
import { SupportedLanguage } from './geminiService';

export type FaceOffPhase =
  | 'AWAITING_READY'
  | 'BUZZER_ACTIVE'
  | 'ANSWERING'
  | 'OPPONENT_GUESS'
  | 'PASS_OR_PLAY'
  | 'ROUND_CONTROL_ASSIGNED'
  | 'DEADLOCK_RESET'
  | 'RESOLVED';

export interface FaceOffQuestionAnswer {
  id: string;
  answerText: string;
  points: number;
  rankOrder: number;
  [key: string]: any;
}

export interface FaceOffQuestion {
  id: string;
  questionText: string;
  orderIndex?: number;
  roundNumber?: number;
  answers: FaceOffQuestionAnswer[];
}

export interface FaceOffPlayer {
  id: string;
  nickname: string;
  team: 'TEAM_1' | 'TEAM_2';
  battingOrder: number;
}

export interface FaceOffContender extends FaceOffPlayer {
  isReady: boolean;
}

export interface BuzzerLockedResult {
  winnerPlayerId: string;
  winnerNickname: string;
  winnerTeam: 'TEAM_1' | 'TEAM_2';
  endsAt: number;
  duration: number;
}

export interface FaceOffTimeoutResult {
  type: 'HAND_OFF' | 'DEADLOCK_RESET' | 'TIMEOUT_WINNER';
  timedOutPlayerId: string;
  timedOutPlayerNickname: string;
  timedOutPlayerTeam: 'TEAM_1' | 'TEAM_2';
  nextPlayerId?: string;
  nextPlayerNickname?: string;
  nextPlayerTeam?: 'TEAM_1' | 'TEAM_2';
  endsAt?: number;
  duration?: number;
  message?: string;
  winnerPlayerId?: string;
  winnerNickname?: string;
  winnerTeam?: 'TEAM_1' | 'TEAM_2';
  phase?: FaceOffPhase;
}

export interface FaceOffRevealedAnswer {
  id: string;
  answerText: string;
  points: number;
  rankOrder: number;
  revealedByPlayerId: string;
  revealedByNickname?: string;
  revealedByTeam?: 'TEAM_1' | 'TEAM_2';
}

export interface FaceOffGuessResult {
  playerId: string;
  playerNickname: string;
  playerTeam: 'TEAM_1' | 'TEAM_2';
  rawAnswer: string;
  isMatched: boolean;
  matchedAnswer?: FaceOffQuestionAnswer;
  points: number;
  rankOrder?: number;
  isNumberOneAnswer: boolean;
  isDuplicate?: boolean;
}

export interface FaceOffAnswerEvaluationResult {
  outcome:
    | 'NUMBER_ONE_WIN'
    | 'OPPONENT_TURN'
    | 'OPPONENT_WON'
    | 'INITIAL_WINNER_WON'
    | 'BOTH_MISSED_CASCADE'
    | 'DEADLOCK_RESET';
  guessResult: FaceOffGuessResult;
  revealedAnswer?: FaceOffRevealedAnswer;
  winnerPlayerId?: string;
  winnerNickname?: string;
  winnerTeam?: 'TEAM_1' | 'TEAM_2';
  nextRespondentId?: string;
  nextRespondentNickname?: string;
  nextRespondentTeam?: 'TEAM_1' | 'TEAM_2';
  endsAt?: number;
  duration?: number;
  phase: FaceOffPhase;
  message?: string;
}

export interface PlayOrPassResult {
  success: boolean;
  decision?: 'play' | 'pass';
  winnerPlayerId?: string;
  winnerTeam?: 'TEAM_1' | 'TEAM_2';
  controllingTeam?: 'TEAM_1' | 'TEAM_2';
  controllingTeamName?: string;
  error?: string;
}

export interface FaceOffSessionConfig {
  gameId: string;
  roundNumber: number;
  team1Players: FaceOffPlayer[];
  team2Players: FaceOffPlayer[];
  question: FaceOffQuestion;
  language?: string;
  timerDurationSeconds?: number;
  persistAudit?: boolean;
  prismaClient?: PrismaClient;
  onTick?: (secondsRemaining: number, endsAt: number) => void;
  onTimeout?: (result: FaceOffTimeoutResult) => void;
}

export interface FaceOffSessionState {
  roomCode: string;
  gameId: string;
  roundNumber: number;
  language: string;
  phase: FaceOffPhase;
  question: FaceOffQuestion;
  team1Players: FaceOffPlayer[];
  team2Players: FaceOffPlayer[];
  team1Contender: FaceOffContender;
  team2Contender: FaceOffContender;
  buzzerLocked: boolean;
  buzzedPlayerId: string | null;
  buzzedPlayerNickname: string | null;
  buzzedPlayerTeam: 'TEAM_1' | 'TEAM_2' | null;
  buzzedAtTimestamp: number | null;
  activeRespondentId: string | null;
  attemptedPlayerIds: string[];
  initialBuzzerWinnerId: string | null;
  timerDurationSeconds: number;
  remainingSeconds: number;
  endsAt: number | null;
  isTimerRunning: boolean;
  submittedAnswer?: string | null;
  revealedAnswers: FaceOffRevealedAnswer[];
  firstGuessResult?: FaceOffGuessResult | null;
  secondGuessResult?: FaceOffGuessResult | null;
  winnerPlayerId: string | null;
  winnerNickname: string | null;
  winnerTeam: 'TEAM_1' | 'TEAM_2' | null;
  controllingTeam: 'TEAM_1' | 'TEAM_2' | null;
  passOrPlayDecision: 'play' | 'pass' | null;
}

export class FaceOffSession {
  public readonly roomCode: string;
  public readonly gameId: string;
  public readonly roundNumber: number;
  public readonly language: string;
  public phase: FaceOffPhase = 'AWAITING_READY';
  public question: FaceOffQuestion;
  public readonly team1Players: FaceOffPlayer[];
  public readonly team2Players: FaceOffPlayer[];
  public team1Contender: FaceOffContender;
  public team2Contender: FaceOffContender;
  public buzzerLocked = false;
  public buzzedPlayerId: string | null = null;
  public buzzedPlayerNickname: string | null = null;
  public buzzedPlayerTeam: 'TEAM_1' | 'TEAM_2' | null = null;
  public buzzedAtTimestamp: number | null = null;
  public activeRespondentId: string | null = null;
  public attemptedPlayerIds: string[] = [];
  public initialBuzzerWinnerId: string | null = null;
  public timerDurationSeconds: number;
  public remainingSeconds = 15;
  public endsAt: number | null = null;
  public isTimerRunning = false;
  public isPaused = false;
  private remainingSecondsOnPause: number | null = null;
  public submittedAnswer: string | null = null;

  // US-13 Scoring & Pass/Play State
  public revealedAnswers: FaceOffRevealedAnswer[] = [];
  public firstGuessResult: FaceOffGuessResult | null = null;
  public secondGuessResult: FaceOffGuessResult | null = null;
  public winnerPlayerId: string | null = null;
  public winnerNickname: string | null = null;
  public winnerTeam: 'TEAM_1' | 'TEAM_2' | null = null;
  public controllingTeam: 'TEAM_1' | 'TEAM_2' | null = null;
  public passOrPlayDecision: 'play' | 'pass' | null = null;
  public persistAudit: boolean = false;
  public prismaClient: PrismaClient = defaultPrisma;

  private timerInterval: NodeJS.Timeout | null = null;
  private onTickCallback?: (secondsRemaining: number, endsAt: number) => void;
  private onTimeoutCallback?: (result: FaceOffTimeoutResult) => void;

  constructor(roomCode: string, config: FaceOffSessionConfig) {
    this.roomCode = roomCode;
    this.gameId = config.gameId;
    this.roundNumber = config.roundNumber || 1;
    this.language = config.language || 'EN';
    this.question = config.question;
    this.timerDurationSeconds = config.timerDurationSeconds || 15;
    this.onTickCallback = config.onTick;
    this.onTimeoutCallback = config.onTimeout;
    this.persistAudit = config.persistAudit ?? false;
    this.prismaClient = config.prismaClient || defaultPrisma;

    // Sort players by batting order 1..N
    this.team1Players = [...config.team1Players].sort(
      (a, b) => a.battingOrder - b.battingOrder
    );
    this.team2Players = [...config.team2Players].sort(
      (a, b) => a.battingOrder - b.battingOrder
    );

    // Contender index cycles modulo team size based on roundNumber
    const t1Index = (this.roundNumber - 1) % (this.team1Players.length || 1);
    const t2Index = (this.roundNumber - 1) % (this.team2Players.length || 1);

    const p1 = this.team1Players[t1Index] || {
      id: 'p1-placeholder',
      nickname: 'Player 1',
      team: 'TEAM_1',
      battingOrder: 1,
    };
    const p2 = this.team2Players[t2Index] || {
      id: 'p2-placeholder',
      nickname: 'Player 2',
      team: 'TEAM_2',
      battingOrder: 1,
    };

    this.team1Contender = { ...p1, isReady: false };
    this.team2Contender = { ...p2, isReady: false };

    logger.info(
      `[FACEOFF:INIT] Room ${roomCode} Round ${this.roundNumber} Face-Off initialized: ` +
        `Team 1 Contender: ${this.team1Contender.nickname} (${this.team1Contender.id}), ` +
        `Team 2 Contender: ${this.team2Contender.nickname} (${this.team2Contender.id})`
    );
  }

  /**
   * Marks a designated contender as ready (Scenario 1).
   * Once both contenders are ready, transitions phase to BUZZER_ACTIVE.
   */
  public markContenderReady(playerId: string): {
    success: boolean;
    bothReady: boolean;
    phase: FaceOffPhase;
    waitingForPlayerId?: string;
    waitingForNickname?: string;
    error?: string;
  } {
    if (this.phase !== 'AWAITING_READY') {
      return {
        success: false,
        bothReady: this.phase === 'BUZZER_ACTIVE' || this.phase === 'ANSWERING',
        phase: this.phase,
        error: 'Face-off is no longer in ready phase.',
      };
    }

    if (this.team1Contender.id === playerId) {
      this.team1Contender.isReady = true;
    } else if (this.team2Contender.id === playerId) {
      this.team2Contender.isReady = true;
    } else {
      return {
        success: false,
        bothReady: false,
        phase: this.phase,
        error: 'Player is not one of the active face-off contenders.',
      };
    }

    const bothReady = this.team1Contender.isReady && this.team2Contender.isReady;

    if (bothReady) {
      this.phase = 'BUZZER_ACTIVE';
      logger.info(
        `[FACEOFF:READY] Both contenders ready in room ${this.roomCode}. Buzzer is active!`
      );
      return {
        success: true,
        bothReady: true,
        phase: this.phase,
      };
    }

    const waitingContender = !this.team1Contender.isReady
      ? this.team1Contender
      : this.team2Contender;

    return {
      success: true,
      bothReady: false,
      phase: this.phase,
      waitingForPlayerId: waitingContender.id,
      waitingForNickname: waitingContender.nickname,
    };
  }

  /**
   * Registers a contender's buzzer press with atomic sub-millisecond lockout (Scenario 2).
   */
  public pressBuzzer(
    playerId: string,
    clientTimestamp?: number
  ): {
    accepted: boolean;
    reason?: 'BUZZER_LOCKED' | 'NOT_ACTIVE' | 'NOT_A_CONTENDER';
    result?: BuzzerLockedResult;
  } {
    if (this.isPaused) {
      return { accepted: false, reason: 'NOT_ACTIVE' };
    }

    if (this.buzzerLocked) {
      return { accepted: false, reason: 'BUZZER_LOCKED' };
    }

    if (this.phase !== 'BUZZER_ACTIVE') {
      return { accepted: false, reason: 'NOT_ACTIVE' };
    }

    // Only active contenders can buzz
    const isContender =
      playerId === this.team1Contender.id || playerId === this.team2Contender.id;
    if (!isContender) {
      return { accepted: false, reason: 'NOT_A_CONTENDER' };
    }

    const player =
      this.team1Players.find((p) => p.id === playerId) ||
      this.team2Players.find((p) => p.id === playerId);

    if (!player) {
      return { accepted: false, reason: 'NOT_A_CONTENDER' };
    }

    // Atomic Lockout Acquisition
    this.buzzerLocked = true;
    this.buzzedPlayerId = player.id;
    this.buzzedPlayerNickname = player.nickname;
    this.buzzedPlayerTeam = player.team;
    this.buzzedAtTimestamp = clientTimestamp || Date.now();
    this.activeRespondentId = player.id;
    this.initialBuzzerWinnerId = player.id;
    this.attemptedPlayerIds = [player.id];
    this.phase = 'ANSWERING';

    logger.info(
      `[FACEOFF:BUZZER] Room ${this.roomCode} buzzer won by ${player.nickname} (${player.team})`
    );

    // Start Authoritative 15-second Timer
    this.startAuthoritativeTimer();

    return {
      accepted: true,
      result: {
        winnerPlayerId: player.id,
        winnerNickname: player.nickname,
        winnerTeam: player.team,
        endsAt: this.endsAt!,
        duration: this.timerDurationSeconds,
      },
    };
  }

  /**
   * Starts or restarts the 15-second authoritative countdown timer.
   */
  public startAuthoritativeTimer(customDurationSeconds?: number): void {
    this.stopTimer();

    const duration = customDurationSeconds ?? this.timerDurationSeconds;
    this.remainingSeconds = duration;
    this.endsAt = Date.now() + duration * 1000;
    this.isTimerRunning = true;

    this.timerInterval = setInterval(() => {
      this.remainingSeconds -= 1;

      if (this.onTickCallback && this.endsAt) {
        this.onTickCallback(Math.max(0, this.remainingSeconds), this.endsAt);
      }

      if (this.remainingSeconds <= 0) {
        this.stopTimer();
        this.handleTimeout();
      }
    }, 1000);
  }

  /**
   * Pauses the active countdown timer (US-21 Scenario 1).
   */
  public pauseTimer(): number {
    let remaining = this.remainingSeconds;
    if (this.endsAt) {
      remaining = Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000));
    }
    if (remaining <= 0) {
      remaining = this.timerDurationSeconds;
    }
    this.remainingSecondsOnPause = remaining;
    this.isPaused = true;
    this.stopTimer();
    this.endsAt = null;
    this.remainingSeconds = remaining;
    return remaining;
  }

  /**
   * Resumes the countdown timer (US-21 Scenario 1).
   */
  public resumeTimer(): number {
    const remaining = this.remainingSecondsOnPause ?? this.timerDurationSeconds;
    this.isPaused = false;
    this.remainingSecondsOnPause = null;
    this.startAuthoritativeTimer(remaining);
    return remaining;
  }

  /**
   * Stops the active countdown timer.
   */
  public stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.isTimerRunning = false;
  }

  /**
   * Authoritative timeout cascade handler (Scenarios 3, 4 & 5).
   */
  public handleTimeout(): FaceOffTimeoutResult {
    const timedOutId = this.activeRespondentId || this.buzzedPlayerId || 'unknown';
    const timedOutPlayer =
      this.team1Players.find((p) => p.id === timedOutId) ||
      this.team2Players.find((p) => p.id === timedOutId) || {
        id: timedOutId,
        nickname: 'Player',
        team: 'TEAM_1' as const,
        battingOrder: 1,
      };

    logger.warn(
      `[FACEOFF:TIMEOUT] Room ${this.roomCode} player ${timedOutPlayer.nickname} timed out (15s)`
    );

    // Case 1: Timeout occurred during OPPONENT_GUESS phase (Contender 2)
    if (this.phase === 'OPPONENT_GUESS') {
      this.stopTimer();
      const initialPoints = this.firstGuessResult?.points || 0;

      if (initialPoints > 0) {
        // Contender 1 had scored valid points -> Contender 1 wins!
        const initialWinner =
          this.team1Players.find((p) => p.id === this.initialBuzzerWinnerId) ||
          this.team2Players.find((p) => p.id === this.initialBuzzerWinnerId) ||
          timedOutPlayer;

        this.winnerPlayerId = initialWinner.id;
        this.winnerNickname = initialWinner.nickname;
        this.winnerTeam = initialWinner.team;
        this.phase = 'PASS_OR_PLAY';

        const result: FaceOffTimeoutResult = {
          type: 'TIMEOUT_WINNER',
          timedOutPlayerId: timedOutPlayer.id,
          timedOutPlayerNickname: timedOutPlayer.nickname,
          timedOutPlayerTeam: timedOutPlayer.team,
          winnerPlayerId: initialWinner.id,
          winnerNickname: initialWinner.nickname,
          winnerTeam: initialWinner.team,
          phase: 'PASS_OR_PLAY',
          message: `${timedOutPlayer.nickname} timed out. ${initialWinner.nickname} wins the Face-Off!`,
        };

        if (this.onTimeoutCallback) {
          this.onTimeoutCallback(result);
        }

        return result;
      } else {
        // Both Contender 1 and Contender 2 failed to submit an answer -> Deadlock reset!
        this.phase = 'DEADLOCK_RESET';
        this.activeRespondentId = null;

        const result: FaceOffTimeoutResult = {
          type: 'DEADLOCK_RESET',
          timedOutPlayerId: timedOutPlayer.id,
          timedOutPlayerNickname: timedOutPlayer.nickname,
          timedOutPlayerTeam: timedOutPlayer.team,
          phase: 'DEADLOCK_RESET',
          message: 'All contenders timed out without an answer. Generating replacement survey question.',
        };

        if (this.onTimeoutCallback) {
          this.onTimeoutCallback(result);
        }

        return result;
      }
    }

    // Case 2: Timeout occurred during ANSWERING phase (Contender 1 initial guess)
    if (this.phase === 'ANSWERING') {
      const opponentContender =
        timedOutPlayer.team === 'TEAM_1' ? this.team2Contender : this.team1Contender;

      // Mark Contender 1 as attempted with 0 points so opponent turn evaluates properly
      this.firstGuessResult = {
        playerId: timedOutPlayer.id,
        playerNickname: timedOutPlayer.nickname,
        playerTeam: timedOutPlayer.team,
        rawAnswer: '',
        isMatched: false,
        points: 0,
        isNumberOneAnswer: false,
      };

      this.activeRespondentId = opponentContender.id;
      if (!this.attemptedPlayerIds.includes(opponentContender.id)) {
        this.attemptedPlayerIds.push(opponentContender.id);
      }
      this.phase = 'OPPONENT_GUESS';

      this.startAuthoritativeTimer();

      const result: FaceOffTimeoutResult = {
        type: 'HAND_OFF',
        timedOutPlayerId: timedOutPlayer.id,
        timedOutPlayerNickname: timedOutPlayer.nickname,
        timedOutPlayerTeam: timedOutPlayer.team,
        nextPlayerId: opponentContender.id,
        nextPlayerNickname: opponentContender.nickname,
        nextPlayerTeam: opponentContender.team,
        endsAt: this.endsAt!,
        duration: this.timerDurationSeconds,
        phase: 'OPPONENT_GUESS',
        message: `${timedOutPlayer.nickname} timed out! Floor passed to ${opponentContender.nickname}. Any board answer wins!`,
      };

      if (this.onTimeoutCallback) {
        this.onTimeoutCallback(result);
      }

      return result;
    }

    // Fallback for any other unexpected phase timeout
    this.phase = 'DEADLOCK_RESET';
    this.activeRespondentId = null;
    const fallbackResult: FaceOffTimeoutResult = {
      type: 'DEADLOCK_RESET',
      timedOutPlayerId: timedOutPlayer.id,
      timedOutPlayerNickname: timedOutPlayer.nickname,
      timedOutPlayerTeam: timedOutPlayer.team,
      phase: 'DEADLOCK_RESET',
      message: 'Face-off timed out. Generating replacement survey question.',
    };
    if (this.onTimeoutCallback) this.onTimeoutCallback(fallbackResult);
    return fallbackResult;
  }

  /**
   * Resolves the next candidate player in the cascading fail-over order.
   * Order: Winner (Attempt 1) -> Opponent (Attempt 2) -> Next Teammate -> Next Opponent Teammate...
   */
  private resolveNextCascadePlayer(
    currentTimedOut: FaceOffPlayer
  ): FaceOffPlayer | null {
    const isTeam1 = currentTimedOut.team === 'TEAM_1';
    const opponentTeamList = isTeam1 ? this.team2Players : this.team1Players;
    const sameTeamList = isTeam1 ? this.team1Players : this.team2Players;

    // Check if opponent contender has had a turn yet (Scenario 3)
    const opponentContender = isTeam1 ? this.team2Contender : this.team1Contender;
    if (!this.attemptedPlayerIds.includes(opponentContender.id)) {
      return (
        opponentTeamList.find((p) => p.id === opponentContender.id) ||
        opponentContender
      );
    }

    // Both initial contenders have attempted.
    // If 1v1 match (1 player per team), deadlock reached (Scenario 5)
    if (this.team1Players.length <= 1 && this.team2Players.length <= 1) {
      return null;
    }

    // Next teammate cascade (Scenario 4 / Scenario 5):
    // Pass to the opposing team's next unattempted player
    const targetTeamList = opponentTeamList;
    const unattemptedOpponent = targetTeamList.find(
      (p) => !this.attemptedPlayerIds.includes(p.id)
    );
    if (unattemptedOpponent) {
      return unattemptedOpponent;
    }

    // If opponent team is fully exhausted, check same team for unattempted players
    const unattemptedTeammate = sameTeamList.find(
      (p) => !this.attemptedPlayerIds.includes(p.id)
    );
    if (unattemptedTeammate) {
      return unattemptedTeammate;
    }

    // All players exhausted
    return null;
  }

  /**
   * Evaluates a contender's submitted answer with two-tier validation and executes
   * Face-Off scoring arbiter rules (US-13 Scenarios 1-5).
   */
  public async evaluateContenderAnswer(
    playerId: string,
    rawAnswer: string,
    customValidator?: (
      rawInput: string,
      candidateAnswers: FaceOffQuestionAnswer[]
    ) => Promise<{
      isMatched: boolean;
      matchedAnswer?: FaceOffQuestionAnswer;
      points: number;
      rankOrder?: number;
    }>
  ): Promise<FaceOffAnswerEvaluationResult> {
    if (this.isPaused) {
      throw new Error('Game is currently paused by the host.');
    }

    if (this.phase !== 'ANSWERING' && this.phase !== 'OPPONENT_GUESS') {
      throw new Error(`Face-off is not in an answering phase (current: ${this.phase}).`);
    }

    if (this.activeRespondentId !== playerId) {
      throw new Error('Only the active respondent may submit an answer.');
    }

    this.stopTimer();
    this.submittedAnswer = rawAnswer;

    const player =
      this.team1Players.find((p) => p.id === playerId) ||
      this.team2Players.find((p) => p.id === playerId) || {
        id: playerId,
        nickname: 'Contender',
        team: (this.team1Contender.id === playerId ? 'TEAM_1' : 'TEAM_2') as 'TEAM_1' | 'TEAM_2',
        battingOrder: 1,
      };

    // Check duplicate against already revealed answers
    const isAlreadyRevealed = this.revealedAnswers.some((ra) =>
      ra.answerText.trim().toLowerCase() === rawAnswer.trim().toLowerCase()
    );

    let matchInfo: {
      isMatched: boolean;
      matchedAnswer?: FaceOffQuestionAnswer;
      points: number;
      rankOrder?: number;
      isDuplicate?: boolean;
    };

    if (isAlreadyRevealed) {
      matchInfo = {
        isMatched: false,
        points: 0,
        isDuplicate: true,
      };
    } else if (customValidator) {
      const vResult = await customValidator(rawAnswer, this.question.answers);
      const matchedAlready = vResult.matchedAnswer
        ? this.revealedAnswers.some((ra) => ra.id === vResult.matchedAnswer!.id)
        : false;

      if (matchedAlready) {
        matchInfo = {
          isMatched: false,
          points: 0,
          isDuplicate: true,
        };
      } else {
        matchInfo = {
          isMatched: vResult.isMatched,
          matchedAnswer: vResult.matchedAnswer,
          points: vResult.isMatched ? vResult.points : 0,
          rankOrder: vResult.isMatched
            ? (vResult.rankOrder ?? vResult.matchedAnswer?.rankOrder)
            : undefined,
          isDuplicate: false,
        };
      }
    } else {
      const evalOutcome = await evaluatePlayerAnswer<FaceOffQuestionAnswer>({
        questionId: this.question.id,
        playerId,
        questionText: this.question.questionText,
        candidateAnswers: this.question.answers,
        rawInput: rawAnswer,
        language: this.language as SupportedLanguage,
        persistAudit: this.persistAudit,
        prismaClient: this.prismaClient,
      });

      const matchedAlready = evalOutcome.matchedAnswer
        ? this.revealedAnswers.some((ra) => ra.id === evalOutcome.matchedAnswer!.id)
        : false;

      if (matchedAlready) {
        matchInfo = {
          isMatched: false,
          points: 0,
          isDuplicate: true,
        };
      } else {
        matchInfo = {
          isMatched: evalOutcome.isMatched,
          matchedAnswer: evalOutcome.matchedAnswer ?? undefined,
          points: evalOutcome.isMatched ? evalOutcome.pointsAwarded : 0,
          rankOrder: evalOutcome.isMatched ? evalOutcome.matchedAnswer?.rankOrder : undefined,
          isDuplicate: false,
        };
      }
    }

    const isNumberOne = Boolean(matchInfo.isMatched && matchInfo.rankOrder === 1);

    const guessResult: FaceOffGuessResult = {
      playerId: player.id,
      playerNickname: player.nickname,
      playerTeam: player.team,
      rawAnswer,
      isMatched: matchInfo.isMatched,
      matchedAnswer: matchInfo.matchedAnswer,
      points: matchInfo.points,
      rankOrder: matchInfo.rankOrder,
      isNumberOneAnswer: isNumberOne,
      isDuplicate: matchInfo.isDuplicate,
    };

    let revealedItem: FaceOffRevealedAnswer | undefined;
    if (guessResult.isMatched && guessResult.matchedAnswer) {
      revealedItem = {
        id: guessResult.matchedAnswer.id,
        answerText: guessResult.matchedAnswer.answerText,
        points: guessResult.points,
        rankOrder: guessResult.matchedAnswer.rankOrder,
        revealedByPlayerId: player.id,
        revealedByNickname: player.nickname,
        revealedByTeam: player.team,
      };
      this.revealedAnswers.push(revealedItem);
      logger.info(
        `[FACEOFF:CARD_REVEAL] Room ${this.roomCode} card #${revealedItem.rankOrder} revealed: "${revealedItem.answerText}" (${revealedItem.points} pts)`
      );
    }

    // Branch A: Contender 1 Initial Guess (Phase === 'ANSWERING' and firstGuessResult is null)
    if (this.phase === 'ANSWERING' && !this.firstGuessResult) {
      this.firstGuessResult = guessResult;

      // Scenario 1: Immediate Win with #1 Answer
      if (guessResult.isNumberOneAnswer) {
        this.winnerPlayerId = player.id;
        this.winnerNickname = player.nickname;
        this.winnerTeam = player.team;
        this.phase = 'PASS_OR_PLAY';

        logger.info(
          `[FACEOFF:WIN_#1] Room ${this.roomCode} Contender ${player.nickname} found #1 Answer (${guessResult.points} pts). Bypassing opponent turn.`
        );

        return {
          outcome: 'NUMBER_ONE_WIN',
          guessResult,
          revealedAnswer: revealedItem,
          winnerPlayerId: player.id,
          winnerNickname: player.nickname,
          winnerTeam: player.team,
          phase: this.phase,
          message: `${player.nickname} hit the #1 answer with ${guessResult.points} points!`,
        };
      }

      // Scenario 2: Opponent gets chance to beat non-#1 answer
      // Scenario 4 (Part 1): Contender 1 missed (0 pts), opponent can win with any answer
      const opponentContender =
        player.team === 'TEAM_1' ? this.team2Contender : this.team1Contender;

      this.activeRespondentId = opponentContender.id;
      if (!this.attemptedPlayerIds.includes(opponentContender.id)) {
        this.attemptedPlayerIds.push(opponentContender.id);
      }
      this.phase = 'OPPONENT_GUESS';
      this.startAuthoritativeTimer();

      logger.info(
        `[FACEOFF:OPPONENT_TURN] Room ${this.roomCode} Floor passed to ${opponentContender.nickname} to beat ${guessResult.points} pts.`
      );

      return {
        outcome: 'OPPONENT_TURN',
        guessResult,
        revealedAnswer: revealedItem,
        nextRespondentId: opponentContender.id,
        nextRespondentNickname: opponentContender.nickname,
        nextRespondentTeam: opponentContender.team,
        endsAt: this.endsAt!,
        duration: this.timerDurationSeconds,
        phase: this.phase,
        message:
          guessResult.points > 0
            ? `Can you beat ${guessResult.rawAnswer} (${guessResult.points} pts)?`
            : `${player.nickname} missed! Any board answer wins!`,
      };
    }

    // Branch B: Contender 2 Guess (Phase === 'OPPONENT_GUESS')
    if (this.phase === 'OPPONENT_GUESS') {
      this.secondGuessResult = guessResult;
      const initialPoints = this.firstGuessResult?.points || 0;
      const initialWinner =
        this.team1Players.find((p) => p.id === this.initialBuzzerWinnerId) ||
        this.team2Players.find((p) => p.id === this.initialBuzzerWinnerId) ||
        (player.team === 'TEAM_1' ? this.team2Contender : this.team1Contender);

      // Scenario 1 (Opponent): Contender 2 hit the #1 answer
      if (guessResult.isNumberOneAnswer) {
        this.winnerPlayerId = player.id;
        this.winnerNickname = player.nickname;
        this.winnerTeam = player.team;
        this.phase = 'PASS_OR_PLAY';

        logger.info(
          `[FACEOFF:WIN_#1] Room ${this.roomCode} Contender 2 (${player.nickname}) hit the #1 answer (${guessResult.points} pts). Won face-off.`
        );

        return {
          outcome: 'OPPONENT_WON',
          guessResult,
          revealedAnswer: revealedItem,
          winnerPlayerId: player.id,
          winnerNickname: player.nickname,
          winnerTeam: player.team,
          phase: this.phase,
          message: `${player.nickname} hit the #1 answer with ${guessResult.points} points!`,
        };
      }

      // Scenario 4 (Part 2): Contender 1 had missed (0 pts)
      if (initialPoints === 0) {
        if (guessResult.isMatched && guessResult.points > 0) {
          // Contender 2 capitalizes with any board answer
          this.winnerPlayerId = player.id;
          this.winnerNickname = player.nickname;
          this.winnerTeam = player.team;
          this.phase = 'PASS_OR_PLAY';

          logger.info(
            `[FACEOFF:OPPONENT_WIN] Room ${this.roomCode} Contender 2 (${player.nickname}) scored ${guessResult.points} pts and won face-off.`
          );

          return {
            outcome: 'OPPONENT_WON',
            guessResult,
            revealedAnswer: revealedItem,
            winnerPlayerId: player.id,
            winnerNickname: player.nickname,
            winnerTeam: player.team,
            phase: this.phase,
            message: `${player.nickname} landed on the board and won the face-off!`,
          };
        }

        // Scenario 5: Both Contenders Missed! Trigger Deadlock Reset directly (no improper turn loop)
        this.phase = 'DEADLOCK_RESET';
        this.activeRespondentId = null;

        logger.warn(
          `[FACEOFF:DEADLOCK] Room ${this.roomCode} Both contenders missed without valid answers.`
        );

        return {
          outcome: 'DEADLOCK_RESET',
          guessResult,
          phase: this.phase,
          message: 'Both contenders missed. Generating replacement survey question.',
        };
      }

      // Contender 1 had points (>0). Check if Contender 2 beat them!
      if (guessResult.isMatched && guessResult.points > initialPoints) {
        // Scenario 3: Contender 2 beats initial guess!
        this.winnerPlayerId = player.id;
        this.winnerNickname = player.nickname;
        this.winnerTeam = player.team;
        this.phase = 'PASS_OR_PLAY';

        logger.info(
          `[FACEOFF:OPPONENT_BEAT] Room ${this.roomCode} Contender 2 (${player.nickname}, ${guessResult.points} pts) beat Contender 1 (${initialPoints} pts).`
        );

        return {
          outcome: 'OPPONENT_WON',
          guessResult,
          revealedAnswer: revealedItem,
          winnerPlayerId: player.id,
          winnerNickname: player.nickname,
          winnerTeam: player.team,
          phase: this.phase,
          message: `${player.nickname} beat ${this.firstGuessResult?.playerNickname}'s guess with ${guessResult.points} points!`,
        };
      }

      // Contender 2 did not beat Contender 1 (lower points or miss). Contender 1 wins!
      this.winnerPlayerId = initialWinner.id;
      this.winnerNickname = initialWinner.nickname;
      this.winnerTeam = initialWinner.team;
      this.phase = 'PASS_OR_PLAY';

      logger.info(
        `[FACEOFF:INITIAL_WINNER_KEPT] Room ${this.roomCode} Contender 2 failed to beat ${initialPoints} pts. ${initialWinner.nickname} wins.`
      );

      return {
        outcome: 'INITIAL_WINNER_WON',
        guessResult,
        revealedAnswer: revealedItem,
        winnerPlayerId: initialWinner.id,
        winnerNickname: initialWinner.nickname,
        winnerTeam: initialWinner.team,
        phase: this.phase,
        message: `${initialWinner.nickname} wins the Face-Off!`,
      };
    }

    // Branch C: Cascaded Teammate Guess (after Scenario 5 both missed)
    if (guessResult.isMatched && guessResult.points > 0) {
      // Teammate landed a valid answer!
      this.winnerPlayerId = player.id;
      this.winnerNickname = player.nickname;
      this.winnerTeam = player.team;
      this.phase = 'PASS_OR_PLAY';

      logger.info(
        `[FACEOFF:CASCADE_WIN] Room ${this.roomCode} Teammate ${player.nickname} scored ${guessResult.points} pts and won the face-off.`
      );

      return {
        outcome: 'INITIAL_WINNER_WON',
        guessResult,
        revealedAnswer: revealedItem,
        winnerPlayerId: player.id,
        winnerNickname: player.nickname,
        winnerTeam: player.team,
        phase: this.phase,
        message: `${player.nickname} scored ${guessResult.points} pts to win round control for ${player.team}!`,
      };
    }

    // Cascaded teammate missed. Continue cascading alternating teams.
    const nextPlayer = this.resolveNextCascadePlayer(player);
    if (nextPlayer) {
      this.activeRespondentId = nextPlayer.id;
      if (!this.attemptedPlayerIds.includes(nextPlayer.id)) {
        this.attemptedPlayerIds.push(nextPlayer.id);
      }
      this.phase = 'ANSWERING';
      this.startAuthoritativeTimer();

      return {
        outcome: 'BOTH_MISSED_CASCADE',
        guessResult,
        nextRespondentId: nextPlayer.id,
        nextRespondentNickname: nextPlayer.nickname,
        nextRespondentTeam: nextPlayer.team,
        endsAt: this.endsAt!,
        duration: this.timerDurationSeconds,
        phase: this.phase,
        message: `${player.nickname} missed. Floor passes to ${nextPlayer.nickname} (${nextPlayer.team}).`,
      };
    }

    this.phase = 'DEADLOCK_RESET';
    this.activeRespondentId = null;

    return {
      outcome: 'DEADLOCK_RESET',
      guessResult,
      phase: this.phase,
      message: 'All contenders missed. Generating replacement survey question.',
    };
  }

  /**
   * Records the winner's "Play" or "Pass" choice and assigns round control (Scenarios 6 & 7).
   */
  public choosePlayOrPass(
    playerId: string,
    decision: 'play' | 'pass'
  ): PlayOrPassResult {
    if (this.phase !== 'PASS_OR_PLAY') {
      return { success: false, error: 'Face-off is not in pass or play phase.' };
    }

    if (this.winnerPlayerId !== playerId) {
      return {
        success: false,
        error: 'Only the winning contender may choose to play or pass.',
      };
    }

    if (decision !== 'play' && decision !== 'pass') {
      return { success: false, error: 'Decision must be either "play" or "pass".' };
    }

    this.passOrPlayDecision = decision;
    if (decision === 'play') {
      this.controllingTeam = this.winnerTeam!;
    } else {
      this.controllingTeam = this.winnerTeam === 'TEAM_1' ? 'TEAM_2' : 'TEAM_1';
    }

    this.phase = 'ROUND_CONTROL_ASSIGNED';

    logger.info(
      `[FACEOFF:DECISION] Winner ${this.winnerNickname} (${this.winnerTeam}) chose to ${decision.toUpperCase()} in room ${this.roomCode}. Controlling team: ${this.controllingTeam}`
    );

    return {
      success: true,
      decision,
      winnerPlayerId: this.winnerPlayerId,
      winnerTeam: this.winnerTeam!,
      controllingTeam: this.controllingTeam,
      controllingTeamName: this.controllingTeam === 'TEAM_1' ? 'Team 1' : 'Team 2',
    };
  }

  /**
   * Records answer submission and halts the timer (US-12 backward compatibility).
   */
  public submitAnswer(
    playerId: string,
    rawAnswer: string
  ): {
    success: boolean;
    error?: string;
    rawAnswer?: string;
  } {
    if (this.isPaused) {
      return { success: false, error: 'Game is currently paused by the host.' };
    }

    if (this.phase !== 'ANSWERING') {
      return { success: false, error: 'Face-off is not in answering phase.' };
    }

    if (this.activeRespondentId !== playerId) {
      return {
        success: false,
        error: 'Only the active respondent may submit an answer.',
      };
    }

    this.stopTimer();
    this.phase = 'RESOLVED';
    this.submittedAnswer = rawAnswer;

    logger.info(
      `[FACEOFF:ANSWER] Player ${playerId} submitted face-off answer: "${rawAnswer}" in room ${this.roomCode}`
    );

    return {
      success: true,
      rawAnswer,
    };
  }

  /**
   * Resets the face-off session with a fresh replacement question (Scenario 5 deadlock recovery).
   */
  public resetWithNewQuestion(question: FaceOffQuestion): void {
    this.stopTimer();
    this.question = question;
    this.phase = 'BUZZER_ACTIVE';
    this.buzzerLocked = false;
    this.buzzedPlayerId = null;
    this.buzzedPlayerNickname = null;
    this.buzzedPlayerTeam = null;
    this.buzzedAtTimestamp = null;
    this.activeRespondentId = null;
    this.attemptedPlayerIds = [];
    this.initialBuzzerWinnerId = null;
    this.remainingSeconds = this.timerDurationSeconds;
    this.endsAt = null;
    this.submittedAnswer = null;
    this.revealedAnswers = [];
    this.firstGuessResult = null;
    this.secondGuessResult = null;
    this.winnerPlayerId = null;
    this.winnerNickname = null;
    this.winnerTeam = null;
    this.controllingTeam = null;
    this.passOrPlayDecision = null;

    logger.info(
      `[FACEOFF:RESET] Room ${this.roomCode} reset with new question: "${question.questionText}"`
    );
  }

  /**
   * Produces a serializable state snapshot.
   */
  public getState(): FaceOffSessionState {
    return {
      roomCode: this.roomCode,
      gameId: this.gameId,
      roundNumber: this.roundNumber,
      language: this.language,
      phase: this.phase,
      question: this.question,
      team1Players: this.team1Players,
      team2Players: this.team2Players,
      team1Contender: this.team1Contender,
      team2Contender: this.team2Contender,
      buzzerLocked: this.buzzerLocked,
      buzzedPlayerId: this.buzzedPlayerId,
      buzzedPlayerNickname: this.buzzedPlayerNickname,
      buzzedPlayerTeam: this.buzzedPlayerTeam,
      buzzedAtTimestamp: this.buzzedAtTimestamp,
      activeRespondentId: this.activeRespondentId,
      attemptedPlayerIds: this.attemptedPlayerIds,
      initialBuzzerWinnerId: this.initialBuzzerWinnerId,
      timerDurationSeconds: this.timerDurationSeconds,
      remainingSeconds: this.remainingSeconds,
      endsAt: this.endsAt,
      isTimerRunning: this.isTimerRunning,
      submittedAnswer: this.submittedAnswer,
      revealedAnswers: this.revealedAnswers,
      firstGuessResult: this.firstGuessResult,
      secondGuessResult: this.secondGuessResult,
      winnerPlayerId: this.winnerPlayerId,
      winnerNickname: this.winnerNickname,
      winnerTeam: this.winnerTeam,
      controllingTeam: this.controllingTeam,
      passOrPlayDecision: this.passOrPlayDecision,
    };
  }

  /**
   * Cleanup method to prevent timer leaks.
   */
  public destroy(): void {
    this.stopTimer();
    this.onTickCallback = undefined;
    this.onTimeoutCallback = undefined;
  }
}

// Global In-Memory Registry for active Face-Off sessions
const faceOffSessions = new Map<string, FaceOffSession>();

export function initFaceOffSession(
  roomCode: string,
  config: FaceOffSessionConfig
): FaceOffSession {
  const normalized = roomCode.toUpperCase();
  const existing = faceOffSessions.get(normalized);
  if (existing) {
    existing.destroy();
  }

  const session = new FaceOffSession(normalized, config);
  faceOffSessions.set(normalized, session);
  return session;
}

export function getFaceOffSession(roomCode: string): FaceOffSession | undefined {
  return faceOffSessions.get(roomCode.toUpperCase());
}

export function removeFaceOffSession(roomCode: string): void {
  const normalized = roomCode.toUpperCase();
  const session = faceOffSessions.get(normalized);
  if (session) {
    session.destroy();
    faceOffSessions.delete(normalized);
  }
}

export function clearAllFaceOffSessions(): void {
  for (const session of faceOffSessions.values()) {
    session.destroy();
  }
  faceOffSessions.clear();
}
