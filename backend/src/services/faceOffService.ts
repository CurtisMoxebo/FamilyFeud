import { logger } from '../utils/logger';

export type FaceOffPhase =
  | 'AWAITING_READY'
  | 'BUZZER_ACTIVE'
  | 'ANSWERING'
  | 'DEADLOCK_RESET'
  | 'RESOLVED';

export interface FaceOffQuestionAnswer {
  id: string;
  answerText: string;
  points: number;
  rankOrder: number;
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
  type: 'HAND_OFF' | 'DEADLOCK_RESET';
  timedOutPlayerId: string;
  timedOutPlayerNickname: string;
  timedOutPlayerTeam: 'TEAM_1' | 'TEAM_2';
  nextPlayerId?: string;
  nextPlayerNickname?: string;
  nextPlayerTeam?: 'TEAM_1' | 'TEAM_2';
  endsAt?: number;
  duration?: number;
  message?: string;
}

export interface FaceOffSessionConfig {
  gameId: string;
  roundNumber: number;
  team1Players: FaceOffPlayer[];
  team2Players: FaceOffPlayer[];
  question: FaceOffQuestion;
  language?: string;
  timerDurationSeconds?: number;
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
  public startAuthoritativeTimer(): void {
    this.stopTimer();

    this.remainingSeconds = this.timerDurationSeconds;
    this.endsAt = Date.now() + this.timerDurationSeconds * 1000;
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

    // Determine the next player in the cascade order
    const nextPlayer = this.resolveNextCascadePlayer(timedOutPlayer);

    if (!nextPlayer) {
      // Scenario 5: Deadlock resolution (2-player match or all players exhausted)
      this.phase = 'DEADLOCK_RESET';
      this.activeRespondentId = null;

      const result: FaceOffTimeoutResult = {
        type: 'DEADLOCK_RESET',
        timedOutPlayerId: timedOutPlayer.id,
        timedOutPlayerNickname: timedOutPlayer.nickname,
        timedOutPlayerTeam: timedOutPlayer.team,
        message: 'All contenders timed out without an answer. Generating replacement survey question.',
      };

      if (this.onTimeoutCallback) {
        this.onTimeoutCallback(result);
      }

      return result;
    }

    // Scenarios 3 & 4: Floor cascades to next contender with a fresh 15s timer
    this.activeRespondentId = nextPlayer.id;
    this.attemptedPlayerIds.push(nextPlayer.id);
    this.phase = 'ANSWERING';

    this.startAuthoritativeTimer();

    const result: FaceOffTimeoutResult = {
      type: 'HAND_OFF',
      timedOutPlayerId: timedOutPlayer.id,
      timedOutPlayerNickname: timedOutPlayer.nickname,
      timedOutPlayerTeam: timedOutPlayer.team,
      nextPlayerId: nextPlayer.id,
      nextPlayerNickname: nextPlayer.nickname,
      nextPlayerTeam: nextPlayer.team,
      endsAt: this.endsAt!,
      duration: this.timerDurationSeconds,
      message: `Time expired! Floor passed to ${nextPlayer.nickname} (${nextPlayer.team}).`,
    };

    if (this.onTimeoutCallback) {
      this.onTimeoutCallback(result);
    }

    return result;
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

    // Next teammate cascade (Scenario 4):
    // Determine target team for next attempt (alternates between teams)
    const targetTeamList = opponentTeamList; // Pass to the opposing team's next unattempted player
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
   * Records answer submission and halts the timer.
   */
  public submitAnswer(
    playerId: string,
    rawAnswer: string
  ): {
    success: boolean;
    error?: string;
    rawAnswer?: string;
  } {
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
