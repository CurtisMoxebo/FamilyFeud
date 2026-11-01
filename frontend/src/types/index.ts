export type GameMode = 'FAST_MONEY' | 'MAIN_GAME';
export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'FINISHED';
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
