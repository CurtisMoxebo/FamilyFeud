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
  | 'P2_REVEAL';

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
  revealSlots?: FastMoneyRevealSlot[];
  activeRevealSlotNumber?: number | null;
}

export interface Player2IsolationSnapshot {
  phase: string;
  isOffstage: boolean;
  isolationMessage: string;
  remainingSeconds: number;
  isTimerRunning: boolean;
  totalScore?: number;
  revealSlots?: FastMoneyRevealSlot[];
  activeRevealSlotNumber?: number | null;
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
  revealSlots?: FastMoneyRevealSlot[];
  activeRevealSlotNumber?: number | null;
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
  slot: FastMoneyRevealSlot;
  totalScore: number;
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
