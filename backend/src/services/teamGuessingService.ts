import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './db';
import { logger } from '../utils/logger';
import { evaluatePlayerAnswer } from './answerValidationService';
import { SupportedLanguage } from './geminiService';
import { FaceOffSession } from './faceOffService';

export type TeamId = 'TEAM_1' | 'TEAM_2';

export type TeamGuessingPhase =
  | 'TEAM_GUESSING'
  | 'ROUND_CLEARED'
  | 'STEAL_PHASE'
  | 'RESOLVED';

export interface TeamGuessingPlayer {
  id: string;
  nickname: string;
  team: TeamId;
  battingOrder: number;
}

export interface TeamGuessingQuestionAnswer {
  id: string;
  answerText: string;
  points: number;
  rankOrder: number;
  [key: string]: unknown;
}

export interface TeamGuessingQuestion {
  id: string;
  questionText: string;
  orderIndex?: number;
  roundNumber?: number;
  answers: TeamGuessingQuestionAnswer[];
}

export interface TeamRevealedAnswer {
  id: string;
  answerText: string;
  points: number;
  rankOrder: number;
  revealedByPlayerId?: string;
  revealedByNickname?: string;
  revealedByTeam?: TeamId;
}

export interface TeamGuessResult {
  playerId: string;
  playerNickname: string;
  playerTeam: TeamId;
  rawAnswer: string;
  isMatched: boolean;
  matchedAnswer?: TeamGuessingQuestionAnswer;
  points: number;
  rankOrder?: number;
  isDuplicate?: boolean;
}

export interface TeamGuessEvaluationResult {
  outcome: 'CORRECT_GUESS' | 'ROUND_CLEARED' | 'STRIKE' | 'STEAL_PHASE_TRIGGERED';
  guessResult: TeamGuessResult;
  revealedAnswer?: TeamRevealedAnswer;
  pointsAwarded: number;
  strikeCount: number; // 0, 1, 2, 3
  isStrike: boolean;
  roundBank: number;
  activePlayer: TeamGuessingPlayer | null;
  nextPlayer?: TeamGuessingPlayer | null;
  phase: TeamGuessingPhase;
  message: string;
  endsAt?: number;
  duration?: number;
}

export interface TeamGuessingTimeoutResult {
  type: 'STRIKE_TIMEOUT' | 'STEAL_PHASE_TRIGGERED';
  timedOutPlayer: TeamGuessingPlayer;
  strikeCount: number;
  nextPlayer?: TeamGuessingPlayer | null;
  phase: TeamGuessingPhase;
  message: string;
  endsAt?: number;
  duration?: number;
}

export interface StealEvaluationResult {
  success: boolean;
  outcome: 'STEAL_SUCCESS' | 'STEAL_FAILED' | 'STEAL_TIMEOUT';
  winningTeam: TeamId;
  pointsAwarded: number;
  stealingPlayer: TeamGuessingPlayer;
  matchedAnswer?: TeamRevealedAnswer;
  rawAnswer?: string;
  roundBank: number;
  remainingAnswers: TeamRevealedAnswer[];
  message: string;
}

export interface TeamGuessingSessionConfig {
  gameId: string;
  roundNumber: number;
  controllingTeam: TeamId;
  team1Players: TeamGuessingPlayer[];
  team2Players: TeamGuessingPlayer[];
  question: TeamGuessingQuestion;
  initialRevealedAnswers?: TeamRevealedAnswer[];
  initialBank?: number;
  startPlayerIndex?: number;
  startPlayerId?: string;
  stealSpokespersonId?: string;
  timerDurationSeconds?: number;
  language?: SupportedLanguage | string;
  autoStartTimer?: boolean;
  autoStartStealTimer?: boolean;
  persistAudit?: boolean;
  prismaClient?: PrismaClient;
  onTick?: (secondsRemaining: number, endsAt: number) => void;
  onTimeout?: (result: TeamGuessingTimeoutResult) => void;
  onTurnAdvanced?: (nextPlayer: TeamGuessingPlayer, endsAt: number) => void;
  onStrike?: (strikeCount: number, player: TeamGuessingPlayer) => void;
  onRoundCleared?: (winningTeam: TeamId, totalRoundPoints: number) => void;
  onStealPhase?: (
    controllingTeam: TeamId,
    opposingTeam: TeamId,
    roundBank: number,
    spokesperson?: TeamGuessingPlayer | null,
    endsAt?: number | null
  ) => void;
  onStealResolved?: (result: StealEvaluationResult) => void;
}

export interface TeamGuessingSessionState {
  roomCode: string;
  gameId: string;
  roundNumber: number;
  language: string;
  phase: TeamGuessingPhase;
  controllingTeam: TeamId;
  controllingTeamName: string;
  opposingTeam: TeamId;
  opposingTeamName: string;
  activePlayer: TeamGuessingPlayer | null;
  activePlayerIndex: number;
  controllingTeamPlayers: TeamGuessingPlayer[];
  opposingTeamPlayers: TeamGuessingPlayer[];
  stealSpokesperson?: TeamGuessingPlayer | null;
  stealSpokespersonId?: string | null;
  strikes: number;
  roundBank: number;
  revealedAnswers: TeamRevealedAnswer[];
  totalAnswersCount: number;
  revealedAnswersCount: number;
  remainingAnswersCount: number;
  remainingSeconds: number;
  endsAt: number | null;
  isTimerRunning: boolean;
  question: {
    id: string;
    questionText: string;
    answerCount: number;
  };
  winningTeam?: TeamId | null;
}

/**
 * Manages the Main Game Team Guessing Turn, Board Flips & 3-Strike System (US-14).
 */
export class TeamGuessingSession {
  public readonly roomCode: string;
  public readonly gameId: string;
  public readonly roundNumber: number;
  public readonly language: string;
  public readonly question: TeamGuessingQuestion;
  public readonly controllingTeam: TeamId;
  public readonly opposingTeam: TeamId;

  public readonly team1Players: TeamGuessingPlayer[];
  public readonly team2Players: TeamGuessingPlayer[];
  public readonly controllingTeamPlayers: TeamGuessingPlayer[];
  public readonly opposingTeamPlayers: TeamGuessingPlayer[];

  public activePlayerIndex: number = 0;
  public phase: TeamGuessingPhase = 'TEAM_GUESSING';
  public strikes: number = 0; // 0, 1, 2, 3
  public roundBank: number = 0;
  public revealedAnswers: TeamRevealedAnswer[] = [];
  public winningTeam: TeamId | null = null;
  public stealSpokespersonId: string | null = null;
  public stealSpokesperson: TeamGuessingPlayer | null = null;
  public autoStartStealTimer: boolean = true;
  public persistAudit: boolean = false;
  public prismaClient: PrismaClient = defaultPrisma;

  public timerDurationSeconds: number = 15;
  public isPaused: boolean = false;
  public get isTimerRunning(): boolean {
    return this.timer !== null;
  }
  private remainingSecondsOnPause: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private timerInterval: NodeJS.Timeout | null = null;
  private endsAt: number | null = null;
  private remainingSeconds: number = 0;

  private onTickCallback?: (secondsRemaining: number, endsAt: number) => void;
  private onTimeoutCallback?: (result: TeamGuessingTimeoutResult) => void;
  private onTurnAdvancedCallback?: (nextPlayer: TeamGuessingPlayer, endsAt: number) => void;
  private onStrikeCallback?: (strikeCount: number, player: TeamGuessingPlayer) => void;
  private onRoundClearedCallback?: (winningTeam: TeamId, totalRoundPoints: number) => void;
  private onStealPhaseCallback?: (
    controllingTeam: TeamId,
    opposingTeam: TeamId,
    roundBank: number,
    spokesperson?: TeamGuessingPlayer | null,
    endsAt?: number | null
  ) => void;
  private onStealResolvedCallback?: (result: StealEvaluationResult) => void;

  constructor(roomCode: string, config: TeamGuessingSessionConfig) {
    this.roomCode = roomCode.toUpperCase();
    this.gameId = config.gameId;
    this.roundNumber = config.roundNumber;
    this.language = config.language || 'EN';
    this.question = config.question;
    this.controllingTeam = config.controllingTeam;
    this.opposingTeam = config.controllingTeam === 'TEAM_1' ? 'TEAM_2' : 'TEAM_1';
    this.timerDurationSeconds = config.timerDurationSeconds ?? 15;
    this.persistAudit = config.persistAudit ?? false;
    this.prismaClient = config.prismaClient || defaultPrisma;

    // Clone and sort players by battingOrder
    this.team1Players = [...config.team1Players].sort(
      (a, b) => a.battingOrder - b.battingOrder
    );
    this.team2Players = [...config.team2Players].sort(
      (a, b) => a.battingOrder - b.battingOrder
    );

    this.controllingTeamPlayers =
      this.controllingTeam === 'TEAM_1' ? this.team1Players : this.team2Players;
    this.opposingTeamPlayers =
      this.controllingTeam === 'TEAM_1' ? this.team2Players : this.team1Players;

    if (this.controllingTeamPlayers.length === 0) {
      throw new Error(`Controlling team ${this.controllingTeam} has no players registered.`);
    }

    // Populate initial revealed answers (e.g. from Face-Off duel)
    if (config.initialRevealedAnswers && config.initialRevealedAnswers.length > 0) {
      this.revealedAnswers = [...config.initialRevealedAnswers];
    }

    // Initialize round bank (sum of initial revealed answers or explicit bank)
    if (config.initialBank !== undefined) {
      this.roundBank = config.initialBank;
    } else {
      this.roundBank = this.revealedAnswers.reduce((sum, a) => sum + (a.points || 0), 0);
    }

    // Determine starting active player index
    if (config.startPlayerId) {
      const idx = this.controllingTeamPlayers.findIndex((p) => p.id === config.startPlayerId);
      this.activePlayerIndex = idx !== -1 ? idx : 0;
    } else if (config.startPlayerIndex !== undefined) {
      this.activePlayerIndex =
        config.startPlayerIndex % this.controllingTeamPlayers.length;
    } else {
      // Default: If more than 1 player, start with Player 2 (batting order 2, index 1)
      // because Contender 1 was the Face-Off contender. If only 1 player, start at 0.
      this.activePlayerIndex =
        this.controllingTeamPlayers.length > 1 ? 1 : 0;
    }

    this.autoStartStealTimer = config.autoStartStealTimer !== false;
    this.stealSpokespersonId =
      config.stealSpokespersonId || this.opposingTeamPlayers[0]?.id || null;
    this.stealSpokesperson =
      this.opposingTeamPlayers.find((p) => p.id === this.stealSpokespersonId) ||
      this.opposingTeamPlayers[0] ||
      null;

    this.onTickCallback = config.onTick;
    this.onTimeoutCallback = config.onTimeout;
    this.onTurnAdvancedCallback = config.onTurnAdvanced;
    this.onStrikeCallback = config.onStrike;
    this.onRoundClearedCallback = config.onRoundCleared;
    this.onStealPhaseCallback = config.onStealPhase;
    this.onStealResolvedCallback = config.onStealResolved;

    if (config.autoStartTimer !== false) {
      this.startAuthoritativeTimer();
    }
  }

  /**
   * Returns the currently active player whose turn it is to guess.
   */
  public get activePlayer(): TeamGuessingPlayer {
    return this.controllingTeamPlayers[this.activePlayerIndex];
  }

  /**
   * Starts or restarts the authoritative turn countdown timer.
   */
  public startAuthoritativeTimer(customDurationSeconds?: number): void {
    this.stopTimer();

    const duration = customDurationSeconds ?? this.timerDurationSeconds;
    this.remainingSeconds = duration;
    this.endsAt = Date.now() + duration * 1000;

    this.timerInterval = setInterval(() => {
      if (this.endsAt) {
        const remaining = Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000));
        this.remainingSeconds = remaining;

        if (this.onTickCallback) {
          this.onTickCallback(remaining, this.endsAt);
        }

        if (remaining <= 0) {
          this.handleTimeout();
        }
      }
    }, 1000);

    this.timer = setTimeout(() => {
      this.handleTimeout();
    }, duration * 1000);

    logger.info(
      `[TEAM_GUESS:TIMER_START] Room ${this.roomCode} ${duration}s turn started for ${this.activePlayer ? this.activePlayer.nickname : 'Active Player'} (${this.controllingTeam})`
    );
  }

  /**
   * Pauses the active countdown timer, freezing remaining seconds (US-21 Scenario 1).
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
    return remaining;
  }

  /**
   * Resumes the countdown timer with frozen remaining seconds (US-21 Scenario 1).
   */
  public resumeTimer(): number {
    const remaining = this.remainingSecondsOnPause ?? this.timerDurationSeconds;
    this.isPaused = false;
    this.remainingSecondsOnPause = null;
    this.startAuthoritativeTimer(remaining);
    return remaining;
  }

  /**
   * Manually accepts an answer and flips the card on host override (US-21 Scenario 2).
   */
  public overrideAcceptAnswer(
    rankOrder: number,
    pointsOverride?: number,
    teamOverride?: TeamId
  ): {
    revealedAnswer: TeamRevealedAnswer;
    strikeCount: number;
    roundBank: number;
    pointsAwarded: number;
    controllingTeam: TeamId;
    isBoardCleared: boolean;
  } | null {
    const matchedAnswer = this.question.answers.find((a) => a.rankOrder === rankOrder);
    if (!matchedAnswer) return null;

    const isAlreadyRevealed = this.revealedAnswers.some((a) => a.rankOrder === rankOrder);
    if (isAlreadyRevealed) return null;

    const points = pointsOverride ?? matchedAnswer.points;
    const team = teamOverride ?? this.controllingTeam;

    const revealedItem: TeamRevealedAnswer = {
      id: matchedAnswer.id,
      answerText: matchedAnswer.answerText,
      points,
      rankOrder: matchedAnswer.rankOrder,
      revealedByPlayerId: 'HOST_OVERRIDE',
      revealedByNickname: 'Host Override',
      revealedByTeam: team,
    };

    this.revealedAnswers.push(revealedItem);
    this.roundBank += points;

    // Retract strike if strikes > 0 (Scenario 2: "and cancels any strike issued")
    if (this.strikes > 0) {
      this.strikes = Math.max(0, this.strikes - 1);
      if (this.phase === 'STEAL_PHASE' && this.strikes < 3) {
        this.phase = 'TEAM_GUESSING';
      }
    }

    const isBoardCleared = this.revealedAnswers.length >= this.question.answers.length;
    if (isBoardCleared) {
      this.phase = 'ROUND_CLEARED';
      this.winningTeam = this.controllingTeam;
      if (this.onRoundClearedCallback) {
        this.onRoundClearedCallback(this.controllingTeam, this.roundBank);
      }
    }

    return {
      revealedAnswer: revealedItem,
      strikeCount: this.strikes,
      roundBank: this.roundBank,
      pointsAwarded: points,
      controllingTeam: this.controllingTeam,
      isBoardCleared,
    };
  }

  /**
   * Stops the active countdown timer.
   */
  public stopTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.endsAt = null;
    this.remainingSeconds = 0;
  }

  /**
   * Evaluates the active player's guess against hidden survey answers (US-14 Scenarios 1-4).
   */
  public async evaluateGuess(
    playerId: string,
    rawAnswer: string,
    customValidator?: (
      rawInput: string,
      candidateAnswers: TeamGuessingQuestionAnswer[]
    ) => Promise<{
      isMatched: boolean;
      matchedAnswer?: TeamGuessingQuestionAnswer;
      points: number;
      rankOrder?: number;
    }>
  ): Promise<TeamGuessEvaluationResult> {
    if (this.phase !== 'TEAM_GUESSING') {
      throw new Error(`Team guessing is not in progress (current phase: ${this.phase}).`);
    }

    if (this.activePlayer.id !== playerId) {
      throw new Error(
        `It is not your turn to guess. Active player is ${this.activePlayer.nickname}.`
      );
    }

    this.stopTimer();
    const player = this.activePlayer;
    const trimmedInput = rawAnswer.trim();

    // Check duplicate against already revealed answers (repeating a revealed answer is a strike)
    const isDuplicate = this.isAnswerAlreadyRevealed(trimmedInput);

    let matchInfo = {
      isMatched: false,
      matchedAnswer: undefined as TeamGuessingQuestionAnswer | undefined,
      points: 0,
      rankOrder: undefined as number | undefined,
      isDuplicate,
    };

    if (!isDuplicate && trimmedInput.length > 0) {
      if (customValidator) {
        const customRes = await customValidator(trimmedInput, this.question.answers);
        matchInfo = {
          isMatched: customRes.isMatched,
          matchedAnswer: customRes.matchedAnswer,
          points: customRes.points,
          rankOrder: customRes.rankOrder,
          isDuplicate: false,
        };
      } else {
        const validation = await evaluatePlayerAnswer({
          questionId: this.question.id,
          playerId: player.id,
          questionText: this.question.questionText,
          candidateAnswers: this.question.answers.map((a) => ({
            id: a.id,
            answerText: a.answerText,
            points: a.points,
            rankOrder: a.rankOrder,
          })),
          rawInput: trimmedInput,
          language: this.language as SupportedLanguage,
          persistAudit: this.persistAudit,
          prismaClient: this.prismaClient,
        });

        if (validation.isMatched && validation.matchedAnswer) {
          const matched = validation.matchedAnswer as TeamGuessingQuestionAnswer;
          // Check if the matched answer was already revealed
          const alreadyRevealed = this.revealedAnswers.some(
            (ra) => ra.id === matched.id || ra.rankOrder === matched.rankOrder
          );

          if (alreadyRevealed) {
            matchInfo.isDuplicate = true;
            matchInfo.isMatched = false;
          } else {
            matchInfo.isMatched = true;
            matchInfo.matchedAnswer = matched;
            matchInfo.points = validation.pointsAwarded || matched.points;
            matchInfo.rankOrder = matched.rankOrder;
          }
        }
      }
    }

    const guessResult: TeamGuessResult = {
      playerId: player.id,
      playerNickname: player.nickname,
      playerTeam: player.team,
      rawAnswer: trimmedInput,
      isMatched: matchInfo.isMatched,
      matchedAnswer: matchInfo.matchedAnswer,
      points: matchInfo.points,
      rankOrder: matchInfo.rankOrder,
      isDuplicate: matchInfo.isDuplicate,
    };

    // Branch 1: Correct Guess (Scenario 1 & Scenario 3)
    if (guessResult.isMatched && guessResult.matchedAnswer && guessResult.points > 0) {
      const revealedItem: TeamRevealedAnswer = {
        id: guessResult.matchedAnswer.id,
        answerText: guessResult.matchedAnswer.answerText,
        points: guessResult.points,
        rankOrder: guessResult.matchedAnswer.rankOrder,
        revealedByPlayerId: player.id,
        revealedByNickname: player.nickname,
        revealedByTeam: player.team,
      };

      this.revealedAnswers.push(revealedItem);
      this.roundBank += revealedItem.points;

      logger.info(
        `[TEAM_GUESS:CORRECT] Room ${this.roomCode} ${player.nickname} guessed "${revealedItem.answerText}" (+${revealedItem.points} pts). Total bank: ${this.roundBank}`
      );

      // Scenario 3: Clearing the Entire Board (All Answers Revealed)
      if (this.revealedAnswers.length >= this.question.answers.length) {
        this.phase = 'ROUND_CLEARED';
        this.winningTeam = this.controllingTeam;

        logger.info(
          `[TEAM_GUESS:BOARD_CLEARED] Room ${this.roomCode} Team ${this.controllingTeam} cleared all ${this.question.answers.length} answers! Round Bank: ${this.roundBank}`
        );

        if (this.onRoundClearedCallback) {
          this.onRoundClearedCallback(this.controllingTeam, this.roundBank);
        }

        return {
          outcome: 'ROUND_CLEARED',
          guessResult,
          revealedAnswer: revealedItem,
          pointsAwarded: revealedItem.points,
          strikeCount: this.strikes,
          isStrike: false,
          roundBank: this.roundBank,
          activePlayer: null,
          phase: this.phase,
          message: `${player.nickname} cleared the board! Team ${this.controllingTeam === 'TEAM_1' ? '1' : '2'} wins the round!`,
        };
      }

      // Scenario 1: Correct Guess advances to next teammate
      this.advanceTurn();
      this.startAuthoritativeTimer();

      if (this.onTurnAdvancedCallback) {
        this.onTurnAdvancedCallback(this.activePlayer, this.endsAt!);
      }

      return {
        outcome: 'CORRECT_GUESS',
        guessResult,
        revealedAnswer: revealedItem,
        pointsAwarded: revealedItem.points,
        strikeCount: this.strikes,
        isStrike: false,
        roundBank: this.roundBank,
        activePlayer: this.activePlayer,
        nextPlayer: this.activePlayer,
        phase: this.phase,
        message: `${player.nickname} hit "${revealedItem.answerText}" for ${revealedItem.points} points!`,
        endsAt: this.endsAt!,
        duration: this.timerDurationSeconds,
      };
    }

    // Branch 2: Incorrect Guess or Duplicate (Scenario 2 & Scenario 4)
    return this.applyStrike(player, guessResult);
  }

  /**
   * Applies a strike to the controlling team (Scenario 2 & 4).
   */
  private applyStrike(
    player: TeamGuessingPlayer,
    guessResult: TeamGuessResult
  ): TeamGuessEvaluationResult {
    this.strikes += 1;

    logger.warn(
      `[TEAM_GUESS:STRIKE] Room ${this.roomCode} Strike ${this.strikes}/3 issued to Team ${this.controllingTeam} after guess: "${guessResult.rawAnswer}"`
    );

    if (this.onStrikeCallback) {
      this.onStrikeCallback(this.strikes, player);
    }

    // Scenario 4: Accumulating 3 Strikes Triggers Steal Phase
    if (this.strikes >= 3) {
      this.phase = 'STEAL_PHASE';
      this.stopTimer();

      logger.info(
        `[TEAM_GUESS:STEAL_PHASE] Room ${this.roomCode} 3 strikes reached. Control transitions to opposing team (${this.opposingTeam}) for Steal Phase.`
      );

      if (this.autoStartStealTimer) {
        this.startStealTimer();
      }

      if (this.onStealPhaseCallback) {
        this.onStealPhaseCallback(
          this.controllingTeam,
          this.opposingTeam,
          this.roundBank,
          this.stealSpokesperson,
          this.endsAt
        );
      }

      return {
        outcome: 'STEAL_PHASE_TRIGGERED',
        guessResult,
        pointsAwarded: 0,
        strikeCount: this.strikes,
        isStrike: true,
        roundBank: this.roundBank,
        activePlayer: null,
        nextPlayer: null,
        phase: this.phase,
        message: `Three strikes! Team ${this.opposingTeam === 'TEAM_1' ? '1' : '2'} has a chance to steal!`,
      };
    }

    // Scenario 2: Fewer than 3 strikes (Strike 1 or 2) -> advances to next teammate
    this.advanceTurn();
    this.startAuthoritativeTimer();

    if (this.onTurnAdvancedCallback) {
      this.onTurnAdvancedCallback(this.activePlayer, this.endsAt!);
    }

    const strikeSymbols = 'X'.repeat(this.strikes);
    const reasonMsg = guessResult.isDuplicate
      ? 'Duplicate answer!'
      : 'That is not on the board!';

    return {
      outcome: 'STRIKE',
      guessResult,
      pointsAwarded: 0,
      strikeCount: this.strikes,
      isStrike: true,
      roundBank: this.roundBank,
      activePlayer: this.activePlayer,
      nextPlayer: this.activePlayer,
      phase: this.phase,
      message: `Strike ${this.strikes} (${strikeSymbols})! ${reasonMsg} Floor passes to ${this.activePlayer.nickname}.`,
      endsAt: this.endsAt!,
      duration: this.timerDurationSeconds,
    };
  }

  /**
   * Handles turn timeout when 15 seconds expire without a valid submission.
   */
  public handleTimeout(): TeamGuessingTimeoutResult {
    this.stopTimer();
    const timedOutPlayer = this.activePlayer;

    this.strikes += 1;
    logger.warn(
      `[TEAM_GUESS:TIMEOUT_STRIKE] Room ${this.roomCode} 15s expired for ${timedOutPlayer.nickname}. Strike ${this.strikes}/3.`
    );

    if (this.onStrikeCallback) {
      this.onStrikeCallback(this.strikes, timedOutPlayer);
    }

    // Scenario 4: 3rd strike via timeout triggers Steal Phase
    if (this.strikes >= 3) {
      this.phase = 'STEAL_PHASE';

      if (this.autoStartStealTimer) {
        this.startStealTimer();
      }

      if (this.onStealPhaseCallback) {
        this.onStealPhaseCallback(
          this.controllingTeam,
          this.opposingTeam,
          this.roundBank,
          this.stealSpokesperson,
          this.endsAt
        );
      }

      const result: TeamGuessingTimeoutResult = {
        type: 'STEAL_PHASE_TRIGGERED',
        timedOutPlayer,
        strikeCount: this.strikes,
        nextPlayer: null,
        phase: this.phase,
        message: `Time expired! 3 strikes reached. Control transitions to Team ${this.opposingTeam === 'TEAM_1' ? '1' : '2'} to steal!`,
      };

      if (this.onTimeoutCallback) {
        this.onTimeoutCallback(result);
      }

      return result;
    }

    // Strike 1 or 2 via timeout -> advance turn to next player
    this.advanceTurn();
    this.startAuthoritativeTimer();

    if (this.onTurnAdvancedCallback) {
      this.onTurnAdvancedCallback(this.activePlayer, this.endsAt!);
    }

    const result: TeamGuessingTimeoutResult = {
      type: 'STRIKE_TIMEOUT',
      timedOutPlayer,
      strikeCount: this.strikes,
      nextPlayer: this.activePlayer,
      phase: this.phase,
      message: `Time expired for ${timedOutPlayer.nickname}! Strike ${this.strikes} ('${'X'.repeat(this.strikes)}'). Floor passes to ${this.activePlayer.nickname}.`,
      endsAt: this.endsAt!,
      duration: this.timerDurationSeconds,
    };

    if (this.onTimeoutCallback) {
      this.onTimeoutCallback(result);
    }

    return result;
  }

  /**
   * Advances the active player index sequentially through controlling team members.
   */
  public advanceTurn(): void {
    this.activePlayerIndex =
      (this.activePlayerIndex + 1) % this.controllingTeamPlayers.length;
  }

  /**
   * Player voluntarily passes their turn, triggering a strike and advancing.
   */
  public passTurn(playerId: string): TeamGuessEvaluationResult {
    if (this.phase !== 'TEAM_GUESSING') {
      throw new Error(`Cannot pass turn when phase is ${this.phase}.`);
    }

    if (this.activePlayer.id !== playerId) {
      throw new Error(`Only the active player (${this.activePlayer.nickname}) can pass.`);
    }

    this.stopTimer();
    const player = this.activePlayer;

    const dummyGuess: TeamGuessResult = {
      playerId: player.id,
      playerNickname: player.nickname,
      playerTeam: player.team,
      rawAnswer: '(Pass)',
      isMatched: false,
      points: 0,
      isDuplicate: false,
    };

    return this.applyStrike(player, dummyGuess);
  }

  /**
   * Starts the authoritative 15-second countdown timer for the Steal Phase (US-15).
   */
  public startStealTimer(): void {
    this.stopTimer();

    this.remainingSeconds = this.timerDurationSeconds;
    this.endsAt = Date.now() + this.timerDurationSeconds * 1000;

    this.timerInterval = setInterval(() => {
      if (this.endsAt) {
        const remaining = Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000));
        this.remainingSeconds = remaining;

        if (this.onTickCallback) {
          this.onTickCallback(remaining, this.endsAt);
        }

        if (remaining <= 0) {
          this.handleStealTimeout();
        }
      }
    }, 1000);

    this.timer = setTimeout(() => {
      this.handleStealTimeout();
    }, this.timerDurationSeconds * 1000);

    logger.info(
      `[STEAL:TIMER_START] Room ${this.roomCode} 15s steal timer started for spokesperson ${this.stealSpokesperson?.nickname} (${this.opposingTeam})`
    );
  }

  /**
   * Stops the active steal timer.
   */
  public stopStealTimer(): void {
    this.stopTimer();
  }

  /**
   * Returns candidate survey answers that have not yet been revealed on the board.
   */
  public getUnrevealedAnswers(): TeamGuessingQuestionAnswer[] {
    return this.question.answers.filter(
      (a) => !this.revealedAnswers.some((ra) => ra.id === a.id || ra.rankOrder === a.rankOrder)
    );
  }

  /**
   * Flips open all remaining unrevealed cards on the survey board upon round resolution (US-15 Scenario 3).
   */
  public revealRemainingHiddenAnswers(): TeamRevealedAnswer[] {
    const unrevealed = this.getUnrevealedAnswers();
    const newlyRevealed: TeamRevealedAnswer[] = unrevealed
      .map((a) => ({
        id: a.id,
        answerText: a.answerText,
        points: a.points,
        rankOrder: a.rankOrder,
      }))
      .sort((a, b) => a.rankOrder - b.rankOrder);

    this.revealedAnswers.push(...newlyRevealed);
    return newlyRevealed;
  }

  /**
   * Evaluates the steal guess submitted by the opposing team's spokesperson (US-15 Scenarios 1-3).
   */
  public async evaluateStealGuess(
    playerId: string,
    rawAnswer: string,
    customValidator?: (
      rawInput: string,
      candidateAnswers: TeamGuessingQuestionAnswer[]
    ) => Promise<{
      isMatched: boolean;
      matchedAnswer?: TeamGuessingQuestionAnswer;
      points: number;
      rankOrder?: number;
    }>
  ): Promise<StealEvaluationResult> {
    if (this.phase !== 'STEAL_PHASE') {
      throw new Error(`Steal phase is not active (current phase: ${this.phase}).`);
    }

    if (!this.stealSpokesperson || this.stealSpokesperson.id !== playerId) {
      throw new Error(
        `Only the designated spokesperson (${this.stealSpokesperson?.nickname || 'spokesperson'}) can submit the steal answer.`
      );
    }

    const trimmedInput = rawAnswer.trim();
    if (!trimmedInput) {
      throw new Error('Steal answer cannot be empty.');
    }

    this.stopTimer();

    const unrevealed = this.getUnrevealedAnswers();
    const isDuplicate = this.isAnswerAlreadyRevealed(trimmedInput);

    let matchInfo = {
      isMatched: false,
      matchedAnswer: undefined as TeamGuessingQuestionAnswer | undefined,
      points: 0,
      rankOrder: undefined as number | undefined,
    };

    if (!isDuplicate && unrevealed.length > 0) {
      if (customValidator) {
        const customRes = await customValidator(trimmedInput, unrevealed);
        matchInfo = {
          isMatched: customRes.isMatched,
          matchedAnswer: customRes.matchedAnswer,
          points: customRes.points,
          rankOrder: customRes.rankOrder,
        };
      } else {
        const validation = await evaluatePlayerAnswer({
          questionId: this.question.id,
          playerId,
          questionText: this.question.questionText,
          candidateAnswers: unrevealed.map((a) => ({
            id: a.id,
            answerText: a.answerText,
            points: a.points,
            rankOrder: a.rankOrder,
          })),
          rawInput: trimmedInput,
          language: this.language as SupportedLanguage,
          persistAudit: this.persistAudit,
          prismaClient: this.prismaClient,
        });

        if (validation.isMatched && validation.matchedAnswer) {
          const matched = validation.matchedAnswer as TeamGuessingQuestionAnswer;
          matchInfo = {
            isMatched: true,
            matchedAnswer: matched,
            points: validation.pointsAwarded || matched.points,
            rankOrder: matched.rankOrder,
          };
        }
      }
    }

    // Scenario 1: Steal Succeeded
    if (matchInfo.isMatched && matchInfo.matchedAnswer) {
      const revealedItem: TeamRevealedAnswer = {
        id: matchInfo.matchedAnswer.id,
        answerText: matchInfo.matchedAnswer.answerText,
        points: matchInfo.points,
        rankOrder: matchInfo.matchedAnswer.rankOrder,
        revealedByPlayerId: playerId,
        revealedByNickname: this.stealSpokesperson.nickname,
        revealedByTeam: this.opposingTeam,
      };

      this.revealedAnswers.push(revealedItem);
      this.winningTeam = this.opposingTeam;
      this.phase = 'RESOLVED';

      // Scenario 3: Reveal remaining unrevealed cards
      const remainingAnswers = this.revealRemainingHiddenAnswers();

      logger.info(
        `[STEAL:SUCCESS] Room ${this.roomCode} ${this.stealSpokesperson.nickname} correctly stole with "${revealedItem.answerText}"! Team ${this.opposingTeam} steals ${this.roundBank} pts!`
      );

      const result: StealEvaluationResult = {
        success: true,
        outcome: 'STEAL_SUCCESS',
        winningTeam: this.opposingTeam,
        pointsAwarded: this.roundBank,
        stealingPlayer: this.stealSpokesperson,
        matchedAnswer: revealedItem,
        rawAnswer: trimmedInput,
        roundBank: this.roundBank,
        remainingAnswers,
        message: `Steal successful! ${this.stealSpokesperson.nickname} found "${revealedItem.answerText}"! Team ${this.opposingTeam === 'TEAM_1' ? '1' : '2'} steals ${this.roundBank} points!`,
      };

      if (this.onStealResolvedCallback) {
        this.onStealResolvedCallback(result);
      }

      return result;
    }

    // Scenario 2: Steal Failed (Wrong answer or duplicate)
    this.winningTeam = this.controllingTeam;
    this.phase = 'RESOLVED';

    // Scenario 3: Reveal remaining unrevealed cards
    const remainingAnswers = this.revealRemainingHiddenAnswers();

    logger.info(
      `[STEAL:FAILED] Room ${this.roomCode} ${this.stealSpokesperson.nickname} missed steal with "${trimmedInput}". Team ${this.controllingTeam} keeps ${this.roundBank} pts.`
    );

    const result: StealEvaluationResult = {
      success: false,
      outcome: 'STEAL_FAILED',
      winningTeam: this.controllingTeam,
      pointsAwarded: this.roundBank,
      stealingPlayer: this.stealSpokesperson,
      rawAnswer: trimmedInput,
      roundBank: this.roundBank,
      remainingAnswers,
      message: `Steal failed! "${trimmedInput}" is not on the board. Team ${this.controllingTeam === 'TEAM_1' ? '1' : '2'} retains ${this.roundBank} points!`,
    };

    if (this.onStealResolvedCallback) {
      this.onStealResolvedCallback(result);
    }

    return result;
  }

  /**
   * Handles timeout when 15 seconds expire during Steal Phase without a submission (US-15 Scenario 2).
   */
  public handleStealTimeout(): StealEvaluationResult {
    this.stopTimer();

    if (this.phase !== 'STEAL_PHASE') {
      throw new Error(`Cannot handle steal timeout when phase is ${this.phase}.`);
    }

    this.winningTeam = this.controllingTeam;
    this.phase = 'RESOLVED';

    // Scenario 3: Reveal remaining unrevealed cards
    const remainingAnswers = this.revealRemainingHiddenAnswers();

    logger.warn(
      `[STEAL:TIMEOUT] Room ${this.roomCode} 15s steal timer expired. Team ${this.controllingTeam} retains ${this.roundBank} pts.`
    );

    const result: StealEvaluationResult = {
      success: false,
      outcome: 'STEAL_TIMEOUT',
      winningTeam: this.controllingTeam,
      pointsAwarded: this.roundBank,
      stealingPlayer: this.stealSpokesperson!,
      roundBank: this.roundBank,
      remainingAnswers,
      message: `Time expired! Team ${this.opposingTeam === 'TEAM_1' ? '1' : '2'} failed to steal. Team ${this.controllingTeam === 'TEAM_1' ? '1' : '2'} retains ${this.roundBank} points!`,
    };

    if (this.onStealResolvedCallback) {
      this.onStealResolvedCallback(result);
    }

    return result;
  }

  /**
   * Helper to check if a raw answer string matches an already revealed answer.
   */
  private isAnswerAlreadyRevealed(rawInput: string): boolean {
    if (!rawInput) return false;
    const normalized = rawInput.trim().toLowerCase();

    return this.revealedAnswers.some((ra) => {
      const raNorm = ra.answerText.trim().toLowerCase();
      return (
        raNorm === normalized ||
        raNorm.includes(normalized) ||
        normalized.includes(raNorm)
      );
    });
  }

  /**
   * Returns a complete serialized state snapshot for client synchronization.
   */
  public getState(): TeamGuessingSessionState {
    const totalAnswers = this.question.answers.length;
    const revealedCount = this.revealedAnswers.length;
    const remainingCount = Math.max(0, totalAnswers - revealedCount);

    return {
      roomCode: this.roomCode,
      gameId: this.gameId,
      roundNumber: this.roundNumber,
      language: this.language,
      phase: this.phase,
      controllingTeam: this.controllingTeam,
      controllingTeamName: this.controllingTeam === 'TEAM_1' ? 'Team 1' : 'Team 2',
      opposingTeam: this.opposingTeam,
      opposingTeamName: this.opposingTeam === 'TEAM_1' ? 'Team 1' : 'Team 2',
      activePlayer: this.phase === 'TEAM_GUESSING' ? this.activePlayer : null,
      activePlayerIndex: this.activePlayerIndex,
      controllingTeamPlayers: this.controllingTeamPlayers,
      opposingTeamPlayers: this.opposingTeamPlayers,
      stealSpokesperson: this.stealSpokesperson,
      stealSpokespersonId: this.stealSpokespersonId,
      strikes: this.strikes,
      roundBank: this.roundBank,
      revealedAnswers: this.revealedAnswers,
      totalAnswersCount: totalAnswers,
      revealedAnswersCount: revealedCount,
      remainingAnswersCount: remainingCount,
      remainingSeconds: this.remainingSeconds,
      endsAt: this.endsAt,
      isTimerRunning: Boolean(this.timer !== null),
      question: {
        id: this.question.id,
        questionText: this.question.questionText,
        answerCount: totalAnswers,
      },
      winningTeam: this.winningTeam,
    };
  }

  /**
   * Cleans up timers and memory references.
   */
  public destroy(): void {
    this.stopTimer();
    this.onTickCallback = undefined;
    this.onTimeoutCallback = undefined;
    this.onTurnAdvancedCallback = undefined;
    this.onStrikeCallback = undefined;
    this.onRoundClearedCallback = undefined;
    this.onStealPhaseCallback = undefined;
    this.onStealResolvedCallback = undefined;
  }
}

/**
 * Creates and initializes a TeamGuessingSession seamlessly from an existing FaceOffSession.
 */
export function createTeamGuessingSessionFromFaceOff(
  faceOffSession: FaceOffSession,
  overrides?: Partial<TeamGuessingSessionConfig>
): TeamGuessingSession {
  const controllingTeam = faceOffSession.controllingTeam;
  if (!controllingTeam) {
    throw new Error('Cannot create TeamGuessingSession: FaceOff controllingTeam is not set.');
  }

  const initialRevealed: TeamRevealedAnswer[] = faceOffSession.revealedAnswers.map((ra) => ({
    id: ra.id,
    answerText: ra.answerText,
    points: ra.points,
    rankOrder: ra.rankOrder,
    revealedByPlayerId: ra.revealedByPlayerId,
    revealedByNickname: ra.revealedByNickname,
    revealedByTeam: ra.revealedByTeam,
  }));

  const initialBank = initialRevealed.reduce((sum, a) => sum + (a.points || 0), 0);

  // Opposing face-off contender acts as default spokesperson during Steal Phase
  const opposingContender =
    controllingTeam === 'TEAM_1'
      ? faceOffSession.team2Contender
      : faceOffSession.team1Contender;

  const config: TeamGuessingSessionConfig = {
    gameId: faceOffSession.gameId,
    roundNumber: faceOffSession.roundNumber,
    controllingTeam,
    team1Players: faceOffSession.team1Players,
    team2Players: faceOffSession.team2Players,
    question: faceOffSession.question,
    initialRevealedAnswers: initialRevealed,
    initialBank,
    language: faceOffSession.language,
    stealSpokespersonId: opposingContender?.id,
    persistAudit: faceOffSession.persistAudit,
    prismaClient: faceOffSession.prismaClient,
    ...overrides,
  };

  return initTeamGuessingSession(faceOffSession.roomCode, config);
}

// Global In-Memory Registry for active Team Guessing sessions
const teamGuessingSessions = new Map<string, TeamGuessingSession>();

export function initTeamGuessingSession(
  roomCode: string,
  config: TeamGuessingSessionConfig
): TeamGuessingSession {
  const normalized = roomCode.toUpperCase();
  const existing = teamGuessingSessions.get(normalized);
  if (existing) {
    existing.destroy();
  }

  const session = new TeamGuessingSession(normalized, config);
  teamGuessingSessions.set(normalized, session);
  return session;
}

export function getTeamGuessingSession(roomCode: string): TeamGuessingSession | undefined {
  return teamGuessingSessions.get(roomCode.toUpperCase());
}

export function removeTeamGuessingSession(roomCode: string): void {
  const normalized = roomCode.toUpperCase();
  const session = teamGuessingSessions.get(normalized);
  if (session) {
    session.destroy();
    teamGuessingSessions.delete(normalized);
  }
}

export function clearAllTeamGuessingSessions(): void {
  for (const session of teamGuessingSessions.values()) {
    session.destroy();
  }
  teamGuessingSessions.clear();
}
