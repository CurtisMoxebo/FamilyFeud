export type GameMode = 'FAST_MONEY' | 'MAIN_GAME';
export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'FINISHED';
export type Language = 'en' | 'fr' | 'es';

export interface Player {
  id: string;
  roomId: string;
  name: string;
  team: string | null;
  isHost: boolean;
  score: number;
  socketId: string | null;
  createdAt: string;
}

export interface Room {
  id: string;
  code: string;
  mode: GameMode;
  status: RoomStatus;
  language: Language;
  createdAt: string;
  players?: Player[];
}

export interface AnswerItem {
  id: string;
  text: string;
  points: number;
  orderIndex: number;
  isRevealed?: boolean;
}

export interface QuestionData {
  id: string;
  text: string;
  orderIndex: number;
  answers: AnswerItem[];
}

