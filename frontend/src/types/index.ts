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

export interface QuestionData {
  id: string;
  questionText: string;
  orderIndex: number;
  roundNumber: number;
  language: string;
  answers: AnswerItem[];
}
