export type GameMode = 'FAST_MONEY' | 'MAIN_GAME';
export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'ACTIVE' | 'FINISHED';
export type Language = 'EN' | 'FR' | 'ES';

export interface Player {
  id: string;
  roomId: string;
  nickname: string;
  team: 'TEAM_1' | 'TEAM_2' | 'NONE';
  socketId: string | null;
  isReady: boolean;
  totalScore: number;
  isConnected: boolean;
  createdAt: string;
}

export interface PlayerRosterItem {
  id: string;
  nickname: string;
  team: string;
  isReady: boolean;
  isConnected: boolean;
}

export interface RoomStateUpdate {
  roomCode: string;
  roomName: string;
  language: Language;
  gameMode: GameMode;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  canStart: boolean;
  startDisabledReason?: string;
  players: PlayerRosterItem[];
}

export interface RoomErrorPayload {
  code: string;
  message: string;
}

export interface GameStartedPayload {
  gameId: string;
  roomCode: string;
  gameMode: GameMode;
  language: Language;
  currentRound: number;
  status: 'IN_PROGRESS';
  questionCount: number;
  firstQuestion: {
    id: string;
    questionText: string;
    answerCount: number;
  };
}

export interface Room {
  id: string;
  roomCode: string;
  roomName: string;
  gameMode: GameMode;
  status: RoomStatus;
  language: Language;
  createdAt: string;
  players?: Player[];
}

export interface AnswerItem {
  id: string;
  answerText: string;
  points: number;
  rankOrder: number;
  isRevealed?: boolean;
}

export type FastMoneyPhase =
  | 'P1_READY'
  | 'P1_PLAYING'
  | 'P1_FINISHED'
  | 'P2_READY'
  | 'P2_PLAYING'
  | 'P2_FINISHED'
  | 'P1_REVEAL'
  | 'P2_REVEAL'
  | 'GAME_OVER';

export interface GameOverPayload {
  roomCode: string;
  isVictory: boolean;
  p1TotalScore: number;
  p2TotalScore: number;
  grandTotal: number;
  targetScore: number;
}

export interface FastMoneyRevealSlot {
  slotNumber: number;
  questionId: string;
  questionText: string;
  rawAnswer: string;
  pointsAwarded: number;
  isAnswerRevealed: boolean;
  isPointsRevealed: boolean;
  isMatched: boolean;
}

export interface Player1StateSnapshot {
  phase: FastMoneyPhase;
  currentQuestion: {
    id: string;
    questionText: string;
    questionNumber: number;
    totalQuestions: number;
  } | null;
  answeredCount: number;
  passedCount: number;
  totalQuestions: number;
  remainingSeconds: number;
  isTimerRunning: boolean;
  canSubmit: boolean;
  canPass: boolean;
  totalScore?: number;
  p1TotalScore?: number;
  p2TotalScore?: number;
  grandTotal?: number;
  revealSlots?: FastMoneyRevealSlot[];
  p1RevealSlots?: FastMoneyRevealSlot[];
  p2RevealSlots?: FastMoneyRevealSlot[];
  activeRevealSlotNumber?: number | null;
  activeP2RevealSlotNumber?: number | null;
  isVictory?: boolean;
  targetScore?: number;
}

export interface Player2IsolationSnapshot {
  phase: string;
  isOffstage: boolean;
  isolationMessage: string;
  remainingSeconds: number;
  isTimerRunning: boolean;
  totalScore?: number;
  p1TotalScore?: number;
  p2TotalScore?: number;
  grandTotal?: number;
  revealSlots?: FastMoneyRevealSlot[];
  p1RevealSlots?: FastMoneyRevealSlot[];
  p2RevealSlots?: FastMoneyRevealSlot[];
  activeRevealSlotNumber?: number | null;
  activeP2RevealSlotNumber?: number | null;
  isVictory?: boolean;
  targetScore?: number;
  currentQuestion?: {
    id: string;
    questionText: string;
    questionNumber: number;
    totalQuestions: number;
  } | null;
  answeredCount?: number;
  passedCount?: number;
  totalQuestions?: number;
  canSubmit?: boolean;
  canPass?: boolean;
}

export interface TimerTickPayload {
  roomCode?: string;
  secondsRemaining: number;
  endsAt: number;
}

export interface TurnEndedPayload {
  roomCode: string;
  reason: 'TIME_EXPIRED' | 'ALL_ANSWERED';
  answeredCount: number;
  totalQuestions: number;
}

export interface HostStateSnapshot {
  phase: FastMoneyPhase;
  activeQuestionNumber: number | null;
  totalQuestions: number;
  answeredCount: number;
  remainingSeconds: number;
  isTimerRunning: boolean;
  currentQuestionText: string | null;
  slots: Array<{
    slotNumber: number;
    isFilled: boolean;
  }>;
  totalScore?: number;
  p1TotalScore?: number;
  p2TotalScore?: number;
  grandTotal?: number;
  revealSlots?: FastMoneyRevealSlot[];
  p1RevealSlots?: FastMoneyRevealSlot[];
  p2RevealSlots?: FastMoneyRevealSlot[];
  activeRevealSlotNumber?: number | null;
  activeP2RevealSlotNumber?: number | null;
  p1Slots?: FastMoneyRevealSlot[];
  p2Slots?: FastMoneyRevealSlot[];
  isVictory?: boolean;
  targetScore?: number;
}

export interface QuestionData {
  id: string;
  questionText: string;
  orderIndex: number;
  roundNumber: number;
  language: string;
  answers: AnswerItem[];
}

export interface BoardRevealPayload {
  roomCode: string;
  type: 'ANSWER' | 'POINTS';
  slotNumber: number;
  column?: 1 | 2;
  slot: FastMoneyRevealSlot;
  totalScore: number;
  p1TotalScore?: number;
  p2TotalScore?: number;
  isAllRevealed: boolean;
  nextActiveSlotNumber: number | null;
}

export interface DuplicateAnswerWarningPayload {
  roomCode: string;
  rawInput: string;
  message: string;
  questionId: string;
  duplicateWithAnswer?: string;
  reason?: 'EXACT_RAW' | 'SEMANTIC_MATCH';
}

export interface AssignedTeamPlayer {
  id: string;
  nickname?: string;
  team: 'TEAM_1' | 'TEAM_2';
  battingOrder: number;
}

export interface TeamsAssignedPayload {
  roomCode: string;
  team1: AssignedTeamPlayer[];
  team2: AssignedTeamPlayer[];
}


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
  revealedAnswers?: FaceOffRevealedAnswer[];
  firstGuessResult?: FaceOffGuessResult | null;
  secondGuessResult?: FaceOffGuessResult | null;
  winnerPlayerId?: string | null;
  winnerNickname?: string | null;
  winnerTeam?: 'TEAM_1' | 'TEAM_2' | null;
  controllingTeam?: 'TEAM_1' | 'TEAM_2' | null;
  passOrPlayDecision?: 'play' | 'pass' | null;
}

export interface BuzzerLockedPayload {
  roomCode: string;
  winnerPlayerId: string;
  winnerNickname: string;
  winnerTeam: 'TEAM_1' | 'TEAM_2';
  endsAt: number;
  duration: number;
}

export interface BuzzerRejectedPayload {
  roomCode: string;
  playerId: string;
  reason: string;
}

export interface FaceOffTimeoutPayload {
  roomCode: string;
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

export interface FaceOffResetPayload {
  roomCode: string;
  newQuestion: {
    id: string;
    questionText: string;
  };
}

export interface ContenderReadyPayload {
  roomCode: string;
  playerId: string;
  bothReady: boolean;
  waitingForPlayerId?: string;
  waitingForNickname?: string;
}

export interface BuzzerActivePayload {
  roomCode: string;
  question: {
    id: string;
    questionText: string;
  };
}

export interface FaceOffAnswerSubmittedPayload {
  roomCode: string;
  playerId: string;
  questionId: string;
  rawAnswer: string;
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

export interface RoundControlAssignedPayload {
  roomCode: string;
  winnerPlayerId: string;
  winnerTeam: 'TEAM_1' | 'TEAM_2';
  decision: 'play' | 'pass';
  controllingTeam: 'TEAM_1' | 'TEAM_2';
  controllingTeamName: string;
  message: string;
}

export interface OpponentTurnPromptPayload {
  roomCode: string;
  nextRespondentId: string;
  nextRespondentNickname: string;
  nextRespondentTeam: 'TEAM_1' | 'TEAM_2';
  endsAt: number;
  duration: number;
  initialPoints: number;
  initialRawAnswer: string;
  message?: string;
}

export interface FaceOffBoardRevealPayload {
  roomCode: string;
  slotRank?: number;
  rankOrder?: number;
  answerText: string;
  points: number;
  playerId: string;
  playerNickname: string;
  playerTeam: 'TEAM_1' | 'TEAM_2';
  isNumberOneAnswer: boolean;
}

// US-14: Team Guessing Turn, Board Flips & 3-Strike System Payloads
export interface TeamGuessingPlayer {
  id: string;
  nickname: string;
  team: 'TEAM_1' | 'TEAM_2';
  battingOrder: number;
}

export interface TeamRevealedAnswer {
  id: string;
  answerText: string;
  points: number;
  rankOrder: number;
  revealedByPlayerId?: string;
  revealedByNickname?: string;
  revealedByTeam?: 'TEAM_1' | 'TEAM_2';
  isStealMatch?: boolean;
  isRemainingReveal?: boolean;
}

export interface TeamGuessingSessionState {
  roomCode: string;
  gameId: string;
  roundNumber: number;
  language: string;
  phase: 'TEAM_GUESSING' | 'ROUND_CLEARED' | 'STEAL_PHASE' | 'RESOLVED';
  controllingTeam: 'TEAM_1' | 'TEAM_2';
  controllingTeamName: string;
  opposingTeam: 'TEAM_1' | 'TEAM_2';
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
  winningTeam?: 'TEAM_1' | 'TEAM_2' | null;
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

export interface TeamTurnStartedPayload {
  roomCode: string;
  activePlayer: TeamGuessingPlayer | null;
  endsAt?: number;
  duration?: number;
}

export interface TeamGuessResultPayload {
  roomCode: string;
  outcome: 'CORRECT_GUESS' | 'ROUND_CLEARED' | 'STRIKE' | 'STEAL_PHASE_TRIGGERED';
  guessResult: {
    playerId: string;
    playerNickname: string;
    playerTeam: 'TEAM_1' | 'TEAM_2';
    rawAnswer: string;
    isMatched: boolean;
    points: number;
    rankOrder?: number;
    isDuplicate?: boolean;
  };
  revealedAnswer?: TeamRevealedAnswer;
  strikeCount: number;
  isStrike: boolean;
  roundBank: number;
  message: string;
}

export interface MainGameBoardRevealPayload {
  roomCode: string;
  slotRank?: number;
  rankOrder?: number;
  answerText: string;
  points: number;
  roundBank?: number;
  playerId?: string;
  playerNickname?: string;
  playerTeam?: 'TEAM_1' | 'TEAM_2';
  isAllRevealed?: boolean;
  isStealMatch?: boolean;
  isRemainingReveal?: boolean;
}

// US-15: 3-Strike Steal Phase & Round Resolution Payloads
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

export interface RemainingAnswersRevealPayload {
  roomCode: string;
  remainingAnswers: TeamRevealedAnswer[];
}

// US-16: Real-Time Grand Total Scores & Match Replay Payloads
export interface ScoreboardState {
  team1GrandTotal: number;
  team2GrandTotal: number;
  activeRoundBank: number;
  currentRoundNumber: number;
  totalRounds: number;
  phase: 'ROUND_IN_PROGRESS' | 'ROUND_RESOLVED' | 'SUDDEN_DEATH' | 'MATCH_OVER';
  roundWinners?: Array<{
    roundNumber: number;
    winningTeam: 'TEAM_1' | 'TEAM_2';
    pointsAwarded: number;
    roundBank: number;
    outcome?: string;
  }>;
  matchWinner?: 'TEAM_1' | 'TEAM_2' | 'TIE' | null;
  isSuddenDeath?: boolean;
}

export interface ScoreboardUpdatePayload {
  roomCode: string;
  team1GrandTotal: number;
  team2GrandTotal: number;
  activeRoundBank: number;
  currentRoundNumber: number;
  totalRounds: number;
  phase: string;
  winningTeam?: 'TEAM_1' | 'TEAM_2' | null;
  pointsAwarded?: number;
  matchWinner?: 'TEAM_1' | 'TEAM_2' | 'TIE' | null;
  isSuddenDeath?: boolean;
}

export interface MatchOverPayload {
  roomCode: string;
  winningTeam: 'TEAM_1' | 'TEAM_2';
  team1GrandTotal: number;
  team2GrandTotal: number;
  totalRounds: number;
  isSuddenDeath?: boolean;
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
  team1Contender: {
    id: string;
    nickname: string;
    team: 'TEAM_1' | 'TEAM_2';
    battingOrder: number;
  };
  team2Contender: {
    id: string;
    nickname: string;
    team: 'TEAM_1' | 'TEAM_2';
    battingOrder: number;
  };
  question: {
    id: string;
    questionText: string;
    answerCount: number;
  };
  isSuddenDeath: boolean;
  scoreboard: ScoreboardState;
}

// US-20: Reconnection and State Recovery Payloads
export interface ReconnectHostPayload {
  roomCode: string;
  hostSecret: string;
}

export interface ReconnectSessionPayload {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface FullGameState {
  roomCode: string;
  roomName: string;
  language: Language;
  gameMode: GameMode;
  status: RoomStatus;
  room: RoomStateUpdate;
  teamsAssigned?: TeamsAssignedPayload | null;
  faceOffState?: FaceOffSessionState | null;
  teamGuessingState?: TeamGuessingSessionState | null;
  scoreboardState?: ScoreboardUpdatePayload | null;
  fastMoneyHostState?: HostStateSnapshot | null;
  timerTick?: TimerTickPayload | null;
}

export interface ReconnectAcknowledgedPayload {
  success: boolean;
  role: 'HOST' | 'PLAYER';
  roomCode: string;
  gameState: FullGameState;
  player?: {
    id: string;
    nickname: string;
    team: string;
  };
  message?: string;
}

export type { PlayerSessionCredentials } from '../utils/sessionStorage';
