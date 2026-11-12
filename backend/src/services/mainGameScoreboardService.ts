import { logger } from '../utils/logger';

export type MatchPhase =
  | 'ROUND_IN_PROGRESS'
  | 'ROUND_RESOLVED'
  | 'MATCH_OVER'
  | 'SUDDEN_DEATH';

export interface RoundScoreRecord {
  roundNumber: number;
  winningTeam: 'TEAM_1' | 'TEAM_2';
  pointsAwarded: number;
  roundBank: number;
  outcome?: string;
}

export interface ScoreboardState {
  roomCode: string;
  gameId: string;
  currentRoundNumber: number;
  totalRounds: number;
  team1GrandTotal: number;
  team2GrandTotal: number;
  activeRoundBank: number;
  phase: MatchPhase;
  roundWinners: RoundScoreRecord[];
  matchWinner: 'TEAM_1' | 'TEAM_2' | 'TIE' | null;
  isSuddenDeath: boolean;
  suddenDeathWinner?: 'TEAM_1' | 'TEAM_2' | null;
}

export interface InitMatchOptions {
  totalRounds?: number;
  team1Initial?: number;
  team2Initial?: number;
}

export interface PlayerRosterItem {
  id: string;
  nickname: string;
  team: 'TEAM_1' | 'TEAM_2';
  battingOrder: number;
}

export interface ContenderRotationResult<T1 = PlayerRosterItem, T2 = T1> {
  team1Contender: T1;
  team2Contender: T2;
  t1Index: number;
  t2Index: number;
  roundNumber: number;
}

/**
 * Fallback single-answer questions for Sudden Death tie-breakers across supported languages.
 */
export const SUDDEN_DEATH_FALLBACK_QUESTIONS: Record<
  string,
  { questionText: string; answerText: string }
> = {
  EN: {
    questionText: 'Name something people bring to the beach',
    answerText: 'Towel',
  },
  FR: {
    questionText: "Nommez quelque chose qu'on apporte à la plage",
    answerText: 'Serviette',
  },
  ES: {
    questionText: 'Nombre algo que la gente lleva a la playa',
    answerText: 'Toalla',
  },
};

/**
 * Calculates rotating face-off contenders based on the round number and team batting orders (modulo team size).
 */
export function getFaceOffContendersForRound<
  T1 extends PlayerRosterItem,
  T2 extends PlayerRosterItem = T1,
>(
  roundNumber: number,
  team1Players: T1[],
  team2Players: T2[]
): ContenderRotationResult<T1, T2> {
  if (!team1Players || team1Players.length === 0) {
    throw new Error('Team 1 players roster cannot be empty');
  }
  if (!team2Players || team2Players.length === 0) {
    throw new Error('Team 2 players roster cannot be empty');
  }

  // Sort by batting order
  const sortedT1 = [...team1Players].sort((a, b) => a.battingOrder - b.battingOrder);
  const sortedT2 = [...team2Players].sort((a, b) => a.battingOrder - b.battingOrder);

  const t1Index = (roundNumber - 1) % sortedT1.length;
  const t2Index = (roundNumber - 1) % sortedT2.length;

  return {
    team1Contender: sortedT1[t1Index],
    team2Contender: sortedT2[t2Index],
    t1Index,
    t2Index,
    roundNumber,
  };
}

/**
 * Manages match-level scoring, cumulative grand totals, round progression,
 * sudden-death tie-breakers, and replay resets.
 */
export class MainGameScoreboardSession {
  public readonly roomCode: string;
  public gameId: string;
  public currentRoundNumber = 1;
  public totalRounds = 3;
  public team1GrandTotal = 0;
  public team2GrandTotal = 0;
  public activeRoundBank = 0;
  public phase: MatchPhase = 'ROUND_IN_PROGRESS';
  public roundWinners: RoundScoreRecord[] = [];
  public matchWinner: 'TEAM_1' | 'TEAM_2' | 'TIE' | null = null;
  public isSuddenDeath = false;
  public suddenDeathWinner: 'TEAM_1' | 'TEAM_2' | null = null;

  constructor(roomCode: string, gameId: string, options?: InitMatchOptions) {
    this.roomCode = roomCode;
    this.gameId = gameId;
    this.totalRounds = options?.totalRounds ?? 3;
    this.team1GrandTotal = options?.team1Initial ?? 0;
    this.team2GrandTotal = options?.team2Initial ?? 0;
  }

  /**
   * Updates the live points accumulated in the current round bank (Scenario 2).
   */
  public updateActiveRoundBank(bank: number): void {
    this.activeRoundBank = Math.max(0, bank);
  }

  /**
   * Awards accumulated round points to the winning/stealing team and determines
   * if the match continues, concludes, or triggers a sudden-death tie breaker.
   */
  public awardRoundPoints(
    winningTeam: 'TEAM_1' | 'TEAM_2',
    points: number,
    outcome?: string
  ): ScoreboardState {
    const sanitizedPoints = Math.max(0, points);

    if (winningTeam === 'TEAM_1') {
      this.team1GrandTotal += sanitizedPoints;
    } else {
      this.team2GrandTotal += sanitizedPoints;
    }

    this.roundWinners.push({
      roundNumber: this.currentRoundNumber,
      winningTeam,
      pointsAwarded: sanitizedPoints,
      roundBank: this.activeRoundBank,
      outcome,
    });

    this.activeRoundBank = 0;

    // Sudden death evaluation
    if (this.isSuddenDeath) {
      this.suddenDeathWinner = winningTeam;
      this.matchWinner = winningTeam;
      this.phase = 'MATCH_OVER';
      logger.info(
        `[SCOREBOARD:SUDDEN_DEATH_WIN] Room ${this.roomCode} won by Team ${winningTeam} (+${sanitizedPoints} pts). Final scores: Team 1 (${this.team1GrandTotal}) vs Team 2 (${this.team2GrandTotal})`
      );
      return this.getState();
    }

    // Standard match resolution evaluation
    if (this.currentRoundNumber >= this.totalRounds) {
      if (this.team1GrandTotal === this.team2GrandTotal) {
        // Exact tie: trigger Sudden Death (Scenario 6)
        this.phase = 'SUDDEN_DEATH';
        this.isSuddenDeath = true;
        this.matchWinner = null;
        logger.info(
          `[SCOREBOARD:SUDDEN_DEATH_TRIGGER] Room ${this.roomCode} ended in tie (${this.team1GrandTotal} - ${this.team2GrandTotal}). Initiating Sudden Death round!`
        );
      } else if (this.team1GrandTotal > this.team2GrandTotal) {
        this.phase = 'MATCH_OVER';
        this.matchWinner = 'TEAM_1';
        logger.info(
          `[SCOREBOARD:MATCH_OVER] Room ${this.roomCode} Champion: Team 1 (${this.team1GrandTotal} vs ${this.team2GrandTotal})`
        );
      } else {
        this.phase = 'MATCH_OVER';
        this.matchWinner = 'TEAM_2';
        logger.info(
          `[SCOREBOARD:MATCH_OVER] Room ${this.roomCode} Champion: Team 2 (${this.team2GrandTotal} vs ${this.team1GrandTotal})`
        );
      }
    } else {
      this.phase = 'ROUND_RESOLVED';
      logger.info(
        `[SCOREBOARD:ROUND_RESOLVED] Room ${this.roomCode} Round ${this.currentRoundNumber} won by Team ${winningTeam} (+${sanitizedPoints} pts). Running totals: Team 1 (${this.team1GrandTotal}), Team 2 (${this.team2GrandTotal})`
      );
    }

    return this.getState();
  }

  /**
   * Advances match to the next round, rotating the round number and clearing temporary bank.
   */
  public advanceToNextRound(): {
    nextRoundNumber: number;
    isSuddenDeath: boolean;
    state: ScoreboardState;
  } {
    if (this.phase === 'MATCH_OVER') {
      throw new Error('Cannot advance round: match has already concluded');
    }

    this.currentRoundNumber += 1;
    this.activeRoundBank = 0;
    this.phase = this.isSuddenDeath ? 'SUDDEN_DEATH' : 'ROUND_IN_PROGRESS';

    logger.info(
      `[SCOREBOARD:NEXT_ROUND] Room ${this.roomCode} advanced to Round ${this.currentRoundNumber} (Sudden Death: ${this.isSuddenDeath})`
    );

    return {
      nextRoundNumber: this.currentRoundNumber,
      isSuddenDeath: this.isSuddenDeath,
      state: this.getState(),
    };
  }

  /**
   * Resets scores, rounds, and phase for a new match while preserving the room and players (Scenario 5).
   */
  public resetForReplay(newGameId: string, options?: InitMatchOptions): ScoreboardState {
    this.gameId = newGameId;
    this.currentRoundNumber = 1;
    this.totalRounds = options?.totalRounds ?? 3;
    this.team1GrandTotal = 0;
    this.team2GrandTotal = 0;
    this.activeRoundBank = 0;
    this.phase = 'ROUND_IN_PROGRESS';
    this.roundWinners = [];
    this.matchWinner = null;
    this.isSuddenDeath = false;
    this.suddenDeathWinner = null;

    logger.info(
      `[SCOREBOARD:REPLAY_RESET] Room ${this.roomCode} reset for new game ${newGameId} (Total Rounds: ${this.totalRounds})`
    );

    return this.getState();
  }

  /**
   * Returns a snapshot of the current scoreboard state.
   */
  public getState(): ScoreboardState {
    return {
      roomCode: this.roomCode,
      gameId: this.gameId,
      currentRoundNumber: this.currentRoundNumber,
      totalRounds: this.totalRounds,
      team1GrandTotal: this.team1GrandTotal,
      team2GrandTotal: this.team2GrandTotal,
      activeRoundBank: this.activeRoundBank,
      phase: this.phase,
      roundWinners: [...this.roundWinners],
      matchWinner: this.matchWinner,
      isSuddenDeath: this.isSuddenDeath,
      suddenDeathWinner: this.suddenDeathWinner,
    };
  }
}

// Global in-memory registry of match scoreboards by roomCode
const activeMatchScoreboards = new Map<string, MainGameScoreboardSession>();

export function normalizeRoomCode(code: string): string {
  return (code || '').trim().toUpperCase();
}

/**
 * Initializes or replaces the scoreboard session for a room.
 */
export function initMatchScoreboard(
  roomCode: string,
  gameId: string,
  options?: InitMatchOptions
): MainGameScoreboardSession {
  const code = normalizeRoomCode(roomCode);
  const session = new MainGameScoreboardSession(code, gameId, options);
  activeMatchScoreboards.set(code, session);
  return session;
}

/**
 * Retrieves the active scoreboard session for a room.
 */
export function getMatchScoreboard(
  roomCode: string
): MainGameScoreboardSession | undefined {
  return activeMatchScoreboards.get(normalizeRoomCode(roomCode));
}

/**
 * Deletes the scoreboard session for a room.
 */
export function deleteMatchScoreboard(roomCode: string): boolean {
  return activeMatchScoreboards.delete(normalizeRoomCode(roomCode));
}

/**
 * Clears all active scoreboard sessions (useful for test tear-downs).
 */
export function clearAllMatchScoreboards(): void {
  activeMatchScoreboards.clear();
}

