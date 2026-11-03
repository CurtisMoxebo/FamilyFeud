import { Server as SocketIOServer, Socket } from 'socket.io';
import { PrismaClient, Room, Player } from '@prisma/client';
import { prisma as defaultPrisma } from '../services/db';
import { normalizeRoomCode } from '../utils/roomCode';
import { sessionRecoveryService } from '../services/sessionRecoveryService';
import { logger, getSocketIp } from '../utils/logger';
import { generateAndSaveGameQuestions } from '../services/questionService';
import {
  initFastMoneySession,
  broadcastFastMoneyState,
  registerFastMoneyHandlers,
  getFastMoneySession,
} from './fastMoneyHandler';
import {
  initFaceOffSession,
  getFaceOffSession,
} from '../services/faceOffService';
import {
  initMatchScoreboard,
  getMatchScoreboard,
} from '../services/mainGameScoreboardService';
import {
  getTeamGuessingSession,
} from '../services/teamGuessingService';
import {
  broadcastFaceOffState,
  registerMainGameHandlers,
  handleFaceOffTimeoutBroadcast,
} from './mainGameHandler';
import { FastMoneyQuestionItem } from '../services/fastMoneySession';
import {
  partitionTeams,
  persistTeamAssignments,
  validateTeamCount,
  PartitionResult,
  AssignedPlayer,
} from '../services/teamService';

export interface JoinRoomPayload {
  roomCode: string;
  nickname?: string;
  isHost?: boolean;
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
  language: 'EN' | 'FR' | 'ES';
  gameMode: 'FAST_MONEY' | 'MAIN_GAME';
  status: 'LOBBY' | 'ACTIVE' | 'FINISHED';
  playerCount: number;
  maxPlayers: number;
  canStart: boolean;
  startDisabledReason?: string;
  players: PlayerRosterItem[];
}

export interface RoomErrorPayload {
  code:
    | 'ROOM_NOT_FOUND'
    | 'ROOM_FULL'
    | 'ROOM_LOCKED'
    | 'INVALID_ROOM'
    | 'INVALID_NICKNAME'
    | 'CANNOT_START'
    | 'SERVER_ERROR';
  message: string;
}

export interface GameStartedPayload {
  gameId: string;
  roomCode: string;
  gameMode: 'FAST_MONEY' | 'MAIN_GAME';
  language: 'EN' | 'FR' | 'ES';
  currentRound: number;
  status: 'IN_PROGRESS';
  questionCount: number;
  firstQuestion: {
    id: string;
    questionText: string;
    answerCount: number;
  };
}

export interface TeamsAssignedPayload {
  roomCode: string;
  team1: AssignedPlayer[];
  team2: AssignedPlayer[];
}

export interface ReconnectHostPayload {
  roomCode: string;
  hostSecret: string;
}

export interface FullGameState {
  roomCode: string;
  roomName: string;
  language: 'EN' | 'FR' | 'ES';
  gameMode: 'FAST_MONEY' | 'MAIN_GAME';
  status: 'LOBBY' | 'ACTIVE' | 'FINISHED';
  room: RoomStateUpdate;
  teamsAssigned?: TeamsAssignedPayload | null;
  faceOffState?: any;
  teamGuessingState?: any;
  scoreboardState?: any;
  fastMoneyHostState?: any;
  timerTick?: { roomCode?: string; secondsRemaining: number; endsAt?: number } | null;
}

export interface ReconnectSessionPayload {
  roomCode: string;
  playerId: string;
  sessionToken: string;
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

/**
 * Calculates whether a room can start based on gameMode capacity and player count.
 */
export function calculateCanStart(
  gameMode: 'FAST_MONEY' | 'MAIN_GAME',
  connectedCount: number
): { canStart: boolean; startDisabledReason?: string } {
  if (gameMode === 'FAST_MONEY') {
    if (connectedCount === 2) {
      return { canStart: true };
    }
    return {
      canStart: false,
      startDisabledReason: `Waiting for 2 players (current: ${connectedCount}/2)`,
    };
  }

  // MAIN_GAME rules: 2 to 10 players, must be even (US-11)
  const validation = validateTeamCount(connectedCount);
  if (!validation.isValid) {
    return {
      canStart: false,
      startDisabledReason: validation.error,
    };
  }

  return { canStart: true };
}

/**
 * Formats full room state payload with dynamic capacity counters.
 */
export function buildRoomStateUpdate(room: Room & { players: Player[] }): RoomStateUpdate {
  const connectedPlayers = room.players.filter((p) => p.isConnected);
  const connectedCount = connectedPlayers.length;
  const maxPlayers = room.gameMode === 'FAST_MONEY' ? 2 : 10;
  const { canStart, startDisabledReason } = calculateCanStart(room.gameMode, connectedCount);

  return {
    roomCode: room.roomCode,
    roomName: room.roomName,
    language: room.language,
    gameMode: room.gameMode,
    status: room.status,
    playerCount: connectedCount,
    maxPlayers,
    canStart,
    startDisabledReason,
    players: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      team: p.team,
      isReady: p.isReady,
      isConnected: p.isConnected,
    })),
  };
}

/**
 * Assembles the authoritative full game state for host and player session recovery (US-20).
 */
export async function buildFullGameState(
  roomCode: string,
  db: PrismaClient = defaultPrisma
): Promise<FullGameState | null> {
  const normalizedCode = normalizeRoomCode(roomCode);
  const room = await db.room.findUnique({
    where: { roomCode: normalizedCode },
    include: { players: true },
  });

  if (!room) return null;

  const roomState = buildRoomStateUpdate(room);

  let teamsAssigned: TeamsAssignedPayload | null = null;
  const team1: AssignedPlayer[] = room.players
    .filter((p) => p.team === 'TEAM_1')
    .map((p, idx) => ({
      id: p.id,
      nickname: p.nickname,
      team: 'TEAM_1' as const,
      battingOrder: (p as any).battingOrder ?? idx + 1,
      originalPlayer: { id: p.id, nickname: p.nickname },
    }));
  const team2: AssignedPlayer[] = room.players
    .filter((p) => p.team === 'TEAM_2')
    .map((p, idx) => ({
      id: p.id,
      nickname: p.nickname,
      team: 'TEAM_2' as const,
      battingOrder: (p as any).battingOrder ?? idx + 1,
      originalPlayer: { id: p.id, nickname: p.nickname },
    }));

  if (team1.length > 0 || team2.length > 0) {
    teamsAssigned = {
      roomCode: normalizedCode,
      team1,
      team2,
    };
  }

  const faceOffSession = getFaceOffSession(normalizedCode);
  const teamGuessingSession = getTeamGuessingSession(normalizedCode);
  const scoreboard = getMatchScoreboard(normalizedCode);
  const fastMoneySession = getFastMoneySession(normalizedCode);

  const faceOffState = faceOffSession ? faceOffSession.getState() : null;
  const teamGuessingState = teamGuessingSession ? teamGuessingSession.getState() : null;

  let timerTick: { roomCode: string; secondsRemaining: number; endsAt?: number } | null = null;
  if (teamGuessingState && teamGuessingState.endsAt) {
    const secondsRemaining = Math.max(0, Math.ceil((teamGuessingState.endsAt - Date.now()) / 1000));
    timerTick = {
      roomCode: normalizedCode,
      secondsRemaining,
      endsAt: teamGuessingState.endsAt,
    };
  } else if (faceOffState && (faceOffState as any).endsAt) {
    const endsAt = (faceOffState as any).endsAt;
    const secondsRemaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    timerTick = {
      roomCode: normalizedCode,
      secondsRemaining,
      endsAt,
    };
  }

  return {
    roomCode: normalizedCode,
    roomName: room.roomName,
    language: room.language as 'EN' | 'FR' | 'ES',
    gameMode: room.gameMode as 'FAST_MONEY' | 'MAIN_GAME',
    status: room.status as 'LOBBY' | 'ACTIVE' | 'FINISHED',
    room: roomState,
    teamsAssigned,
    faceOffState,
    teamGuessingState,
    scoreboardState: scoreboard ? scoreboard.getState() : null,
    fastMoneyHostState: fastMoneySession ? fastMoneySession.getHostSnapshot() : null,
    timerTick,
  };
}

/**
 * Registers WebSocket handlers for lobby roster, joining, and disconnection.
 */
export function registerLobbyHandlers(
  io: SocketIOServer,
  socket: Socket,
  db: PrismaClient = defaultPrisma
): void {
  socket.on(
    'join_room',
    async (
      data: JoinRoomPayload,
      callback?: (res: {
        success: boolean;
        error?: string;
        room?: RoomStateUpdate;
        playerId?: string;
        sessionToken?: string;
        hostSecret?: string;
      }) => void
    ) => {
      try {
        if (!data || !data.roomCode) {
          const err: RoomErrorPayload = {
            code: 'INVALID_ROOM',
            message: 'Invalid room code provided.',
          };
          socket.emit('room_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        const normalizedCode = normalizeRoomCode(data.roomCode);
        const room = await db.room.findUnique({
          where: { roomCode: normalizedCode },
          include: { players: true },
        });

        if (!room) {
          const err: RoomErrorPayload = {
            code: 'ROOM_NOT_FOUND',
            message: 'Room not found or session has ended.',
          };
          socket.emit('room_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        if (room.status !== 'LOBBY') {
          const err: RoomErrorPayload = {
            code: 'ROOM_LOCKED',
            message: 'Game has already started in this room.',
          };
          socket.emit('room_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        // Host attachment flow
        if (data.isHost) {
          socket.join(`room:${normalizedCode}`);
          socket.data = { roomCode: normalizedCode, isHost: true };
          sessionRecoveryService.registerHostSocket(normalizedCode, socket.id);
          const hostSecret = sessionRecoveryService.getHostSecret(normalizedCode) || sessionRecoveryService.createHostSecret(normalizedCode);

          const state = buildRoomStateUpdate(room);
          socket.emit('room_state_update', state);
          socket.emit('host_secret_granted', { roomCode: normalizedCode, hostSecret });
          if (callback) callback({ success: true, room: state });
          return;
        }

        // Player attachment flow
        const rawNickname = data.nickname || '';
        const trimmedNickname = rawNickname.trim();

        if (trimmedNickname.length < 2 || trimmedNickname.length > 20) {
          const err: RoomErrorPayload = {
            code: 'INVALID_NICKNAME',
            message: 'Nickname must be between 2 and 20 characters.',
          };
          socket.emit('room_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        const existingPlayer = room.players.find(
          (p) => p.nickname.toLowerCase() === trimmedNickname.toLowerCase()
        );

        // If new player, check capacity lock (US-04 Scenario 2)
        if (!existingPlayer) {
          const connectedCount = room.players.filter((p) => p.isConnected).length;

          if (room.gameMode === 'FAST_MONEY' && connectedCount >= 2) {
            const err: RoomErrorPayload = {
              code: 'ROOM_FULL',
              message: 'This Fast Money room is already full (2/2 players).',
            };
            socket.emit('room_error', err);
            if (callback) callback({ success: false, error: err.message });
            return;
          }

          if (room.gameMode === 'MAIN_GAME' && connectedCount >= 10) {
            const err: RoomErrorPayload = {
              code: 'ROOM_FULL',
              message: 'This Main Game room is already full (10/10 players).',
            };
            socket.emit('room_error', err);
            if (callback) callback({ success: false, error: err.message });
            return;
          }
        }

        // Upsert player in database
        let player: Player;
        if (existingPlayer) {
          player = await db.player.update({
            where: { id: existingPlayer.id },
            data: { socketId: socket.id, isConnected: true },
          });
        } else {
          player = await db.player.create({
            data: {
              roomId: room.id,
              nickname: trimmedNickname,
              socketId: socket.id,
              isConnected: true,
              isReady: true,
            },
          });
        }

        socket.join(`room:${normalizedCode}`);
        socket.data = {
          roomCode: normalizedCode,
          playerId: player.id,
          nickname: player.nickname,
          isHost: false,
        };

        // Broadcast updated state to room
        const refreshedRoom = await db.room.findUnique({
          where: { roomCode: normalizedCode },
          include: { players: true },
        });

        const sessionToken = sessionRecoveryService.createPlayerSession(
          normalizedCode,
          player.id,
          player.nickname,
          socket.id
        );

        socket.emit('session_granted', {
          roomCode: normalizedCode,
          playerId: player.id,
          sessionToken,
          nickname: player.nickname,
        });

        if (refreshedRoom) {
          const state = buildRoomStateUpdate(refreshedRoom);
          io.to(`room:${normalizedCode}`).emit('room_state_update', state);
          if (callback) callback({ success: true, room: state, playerId: player.id, sessionToken });
        }
      } catch (error) {
        logger.error('Error handling join_room socket event', error);
        const err: RoomErrorPayload = {
          code: 'SERVER_ERROR',
          message: 'An unexpected server error occurred.',
        };
        socket.emit('room_error', err);
        if (callback) callback({ success: false, error: err.message });
      }
    }
  );

  // Handle reconnect_host event (US-20 Scenario 1)
  socket.on(
    'reconnect_host',
    async (
      data: ReconnectHostPayload,
      callback?: (res: {
        success: boolean;
        error?: string;
        role?: 'HOST';
        gameState?: FullGameState;
      }) => void
    ) => {
      try {
        if (!data || !data.roomCode || !data.hostSecret) {
          const errMsg = 'Missing roomCode or hostSecret in reconnect_host.';
          socket.emit('room_error', { code: 'INVALID_ROOM', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const normalizedCode = normalizeRoomCode(data.roomCode);
        const isValid = sessionRecoveryService.validateHostSecret(normalizedCode, data.hostSecret);

        if (!isValid) {
          const errMsg = 'Invalid host secret for session reconnection.';
          logger.warn(`[RECONNECT:HOST] Rejected host reconnection for room ${normalizedCode}: invalid host secret`);
          socket.emit('room_error', { code: 'INVALID_ROOM', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        // Re-attach host socket
        socket.join(`room:${normalizedCode}`);
        socket.data = { roomCode: normalizedCode, isHost: true };
        sessionRecoveryService.registerHostSocket(normalizedCode, socket.id);

        const gameState = await buildFullGameState(normalizedCode, db);
        if (!gameState) {
          const errMsg = 'Room session not found for host recovery.';
          socket.emit('room_error', { code: 'ROOM_NOT_FOUND', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        logger.info(`[RECONNECT:HOST] Host successfully reconnected to room ${normalizedCode} (status: ${gameState.status}, gameMode: ${gameState.gameMode})`);

        // Emit authoritative reconnect acknowledgment
        const ackPayload: ReconnectAcknowledgedPayload = {
          success: true,
          role: 'HOST',
          roomCode: normalizedCode,
          gameState,
        };

        socket.emit('reconnect_acknowledged', ackPayload);

        // Re-hydrate standard socket channels directly to trigger all view bindings
        socket.emit('room_state_update', gameState.room);
        if (gameState.teamsAssigned) {
          socket.emit('teams_assigned', gameState.teamsAssigned);
        }
        if (gameState.faceOffState) {
          socket.emit('face_off_state', gameState.faceOffState);
        }
        if (gameState.teamGuessingState) {
          socket.emit('team_guessing_state', gameState.teamGuessingState);
        }
        if (gameState.scoreboardState) {
          socket.emit('scoreboard_update', gameState.scoreboardState);
        }
        if (gameState.fastMoneyHostState) {
          socket.emit('fast_money_host_state', gameState.fastMoneyHostState);
        }
        if (gameState.timerTick) {
          socket.emit('timer_tick', gameState.timerTick);
        }

        if (callback) {
          callback({
            success: true,
            role: 'HOST',
            gameState,
          });
        }
      } catch (err: any) {
        logger.error(`[RECONNECT:HOST] Unexpected error during host reconnection: ${err?.message || err}`);
        socket.emit('room_error', {
          code: 'SERVER_ERROR',
          message: 'Internal server error while recovering host session.',
        });
        if (callback) callback({ success: false, error: 'Internal server error.' });
      }
    }
  );

  // Handle reconnect_session event (US-20 Scenario 2 & 3)
  socket.on(
    'reconnect_session',
    async (
      data: ReconnectSessionPayload,
      callback?: (res: {
        success: boolean;
        error?: string;
        role?: 'PLAYER';
        gameState?: FullGameState;
        player?: { id: string; nickname: string; team: string };
      }) => void
    ) => {
      try {
        if (!data || !data.roomCode || !data.playerId || !data.sessionToken) {
          const errMsg = 'Missing roomCode, playerId, or sessionToken.';
          socket.emit('room_error', { code: 'INVALID_ROOM', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const normalizedCode = normalizeRoomCode(data.roomCode);
        const isValid = sessionRecoveryService.validatePlayerSession(
          normalizedCode,
          data.playerId,
          data.sessionToken
        );

        if (!isValid) {
          const errMsg = 'Invalid or expired player session token.';
          logger.warn(
            `[RECONNECT:PLAYER] Rejected player reconnection for player ${data.playerId} in room ${normalizedCode}: invalid session token`
          );
          socket.emit('room_error', { code: 'INVALID_ROOM', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        const player = await db.player.findUnique({
          where: { id: data.playerId },
        });

        if (!player) {
          const errMsg = 'Player record not found for session reconnection.';
          socket.emit('room_error', { code: 'ROOM_NOT_FOUND', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        // 1. Update player status in DB
        await db.player.update({
          where: { id: data.playerId },
          data: { isConnected: true },
        });

        // 2. Update socket mapping and cancel grace timer in memory
        sessionRecoveryService.updatePlayerSocket(data.playerId, socket.id);

        // 3. Attach socket to channels
        socket.join(`room:${normalizedCode}`);
        socket.join(`player:${data.playerId}`);
        socket.data = { roomCode: normalizedCode, playerId: data.playerId, isHost: false };

        // 4. Assemble full game state
        const gameState = await buildFullGameState(normalizedCode, db);
        if (!gameState) {
          const errMsg = 'Room session not found for player recovery.';
          socket.emit('room_error', { code: 'ROOM_NOT_FOUND', message: errMsg });
          if (callback) callback({ success: false, error: errMsg });
          return;
        }

        logger.info(
          `[RECONNECT:PLAYER] Player ${player.nickname} (${player.id}) successfully reconnected to room ${normalizedCode}`
        );

        // 5. Broadcast refreshed room state to the room
        io.to(`room:${normalizedCode}`).emit('room_state_update', gameState.room);

        // 6. Emit tailored snapshots based on game mode and phase
        const fastMoneySession = getFastMoneySession(normalizedCode);
        if (fastMoneySession) {
          if (fastMoneySession.player1Id === data.playerId) {
            socket.emit('fast_money_p1_state', fastMoneySession.getPlayer1Snapshot());
          } else if (fastMoneySession.player2Id === data.playerId) {
            socket.emit('fast_money_p2_state', fastMoneySession.getPlayer2Snapshot());
          }
        }

        if (gameState.faceOffState) {
          socket.emit('face_off_state', gameState.faceOffState);
        }
        if (gameState.teamGuessingState) {
          socket.emit('team_guessing_state', gameState.teamGuessingState);
        }
        if (gameState.teamsAssigned) {
          socket.emit('teams_assigned', gameState.teamsAssigned);
        }
        if (gameState.scoreboardState) {
          socket.emit('scoreboard_update', gameState.scoreboardState);
        }
        if (gameState.timerTick) {
          socket.emit('timer_tick', gameState.timerTick);
        }

        // 7. Emit reconnect acknowledgment
        const ackPayload: ReconnectAcknowledgedPayload = {
          success: true,
          role: 'PLAYER',
          roomCode: normalizedCode,
          gameState,
          player: {
            id: player.id,
            nickname: player.nickname,
            team: player.team,
          },
        };

        socket.emit('reconnect_acknowledged', ackPayload);

        if (callback) {
          callback({
            success: true,
            role: 'PLAYER',
            gameState,
            player: {
              id: player.id,
              nickname: player.nickname,
              team: player.team,
            },
          });
        }
      } catch (err: any) {
        logger.error(
          `[RECONNECT:PLAYER] Unexpected error during player reconnection: ${err?.message || err}`
        );
        socket.emit('room_error', {
          code: 'SERVER_ERROR',
          message: 'Internal server error while recovering player session.',
        });
        if (callback) callback({ success: false, error: 'Internal server error.' });
      }
    }
  );

  // Handle start_game event (US-05 Step 4)
  socket.on(
    'start_game',
    async (
      data?: { roomCode?: string },
      callback?: (res: {
        success: boolean;
        error?: string;
        game?: GameStartedPayload;
        teams?: { team1: AssignedPlayer[]; team2: AssignedPlayer[] };
      }) => void
    ) => {
      try {
        const rawCode = data?.roomCode || socket.data?.roomCode;
        if (!rawCode) {
          const err: RoomErrorPayload = {
            code: 'INVALID_ROOM',
            message: 'No room code provided to start game.',
          };
          socket.emit('room_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        const normalizedCode = normalizeRoomCode(rawCode);
        const room = await db.room.findUnique({
          where: { roomCode: normalizedCode },
          include: { players: true },
        });

        if (!room) {
          const err: RoomErrorPayload = {
            code: 'ROOM_NOT_FOUND',
            message: 'Room not found or session has ended.',
          };
          socket.emit('room_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        if (room.status !== 'LOBBY') {
          const err: RoomErrorPayload = {
            code: 'ROOM_LOCKED',
            message: 'Game has already started in this room.',
          };
          socket.emit('room_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        const connectedCount = room.players.filter((p) => p.isConnected).length;
        const { canStart, startDisabledReason } = calculateCanStart(room.gameMode, connectedCount);

        if (!canStart) {
          const err: RoomErrorPayload = {
            code: 'CANNOT_START',
            message: startDisabledReason || 'Requirements to start game not met.',
          };
          socket.emit('room_error', err);
          if (callback) callback({ success: false, error: err.message });
          return;
        }

        // For MAIN_GAME: Partition teams and persist team assignments (US-11)
        let partitionResult: PartitionResult | undefined;
        if (room.gameMode === 'MAIN_GAME') {
          const connectedPlayers = room.players.filter((p) => p.isConnected);
          partitionResult = partitionTeams(connectedPlayers);
          await persistTeamAssignments(db, partitionResult.allAssigned);
        }

        // 1. Create Game record in MySQL
        const game = await db.game.create({
          data: {
            roomId: room.id,
            mode: room.gameMode,
            status: 'IN_PROGRESS',
            currentRound: 1,
          },
        });

        // 2. Generate and persist questions in MySQL via questionService
        const questions = await generateAndSaveGameQuestions({
          gameId: game.id,
          gameMode: room.gameMode,
          language: room.language,
          roundNumber: 1,
          count: room.gameMode === 'FAST_MONEY' ? 5 : 1,
          prismaClient: db,
        });

        // 3. Transition Room status to ACTIVE
        const updatedRoom = await db.room.update({
          where: { id: room.id },
          data: { status: 'ACTIVE' },
          include: { players: true },
        });

        // 4. If MAIN_GAME, broadcast teams_assigned event (US-11)
        if (room.gameMode === 'MAIN_GAME' && partitionResult) {
          const teamsAssignedPayload: TeamsAssignedPayload = {
            roomCode: normalizedCode,
            team1: partitionResult.team1,
            team2: partitionResult.team2,
          };
          io.to(`room:${normalizedCode}`).emit('teams_assigned', teamsAssignedPayload);
          logger.info(
            `[MAIN_GAME:TEAMS_ASSIGNED] Room ${normalizedCode} broadcast teams_assigned: Team 1 (${partitionResult.team1.length}), Team 2 (${partitionResult.team2.length})`
          );
        }

        // 5. Construct payload and broadcast to room
        const gameStartedPayload: GameStartedPayload = {
          gameId: game.id,
          roomCode: room.roomCode,
          gameMode: room.gameMode,
          language: room.language,
          currentRound: 1,
          status: 'IN_PROGRESS',
          questionCount: questions.length,
          firstQuestion: {
            id: questions[0].id,
            questionText: questions[0].questionText,
            answerCount: questions[0].answers.length,
          },
        };

        io.to(`room:${normalizedCode}`).emit('game_started', gameStartedPayload);

        // 6. Broadcast refreshed room state
        const state = buildRoomStateUpdate(updatedRoom);
        io.to(`room:${normalizedCode}`).emit('room_state_update', state);

        logger.info(
          `[GAME:START] Started game ${game.id} for room ${normalizedCode} (${questions.length} questions generated)`
        );

        // 6. Initialize Fast Money session if mode is FAST_MONEY (US-07)
        // 7. Initialize Face-Off session if mode is MAIN_GAME (US-12)
        if (room.gameMode === 'MAIN_GAME' && partitionResult) {
          const session = initFaceOffSession(normalizedCode, {
            gameId: game.id,
            roundNumber: 1,
            team1Players: partitionResult.team1.map((p) => ({
              id: p.id,
              nickname: p.nickname || 'Contender',
              team: 'TEAM_1' as const,
              battingOrder: p.battingOrder,
            })),
            team2Players: partitionResult.team2.map((p) => ({
              id: p.id,
              nickname: p.nickname || 'Contender',
              team: 'TEAM_2' as const,
              battingOrder: p.battingOrder,
            })),
            question: {
              id: questions[0].id,
              questionText: questions[0].questionText,
              orderIndex: questions[0].orderIndex,
              roundNumber: questions[0].roundNumber,
              answers: questions[0].answers.map((a) => ({
                id: a.id,
                answerText: a.answerText,
                points: a.points,
                rankOrder: a.rankOrder,
              })),
            },
            language: room.language,
            timerDurationSeconds: 15,
            persistAudit: true,
            prismaClient: db,
            onTick: (secondsRemaining, endsAt) => {
              io.to(`room:${normalizedCode}`).emit('timer_tick', {
                roomCode: normalizedCode,
                secondsRemaining,
                endsAt,
              });
            },
            onTimeout: (timeoutResult) => {
              handleFaceOffTimeoutBroadcast(io, normalizedCode, timeoutResult, db);
            },
          });

          broadcastFaceOffState(io, session);

          // US-16: Initialize match scoreboard and broadcast initial score state
          const scoreboard = initMatchScoreboard(normalizedCode, game.id, { totalRounds: 3 });
          io.to(`room:${normalizedCode}`).emit('scoreboard_update', scoreboard.getState());
        }

        if (room.gameMode === 'FAST_MONEY') {
          const connectedPlayers = updatedRoom.players.filter((p) => p.isConnected);
          if (connectedPlayers.length >= 2) {
            const fmQuestions: FastMoneyQuestionItem[] = questions.map((q) => ({
              id: q.id,
              questionText: q.questionText,
              orderIndex: q.orderIndex,
              answers: q.answers.map((a) => ({
                id: a.id,
                answerText: a.answerText,
                points: a.points,
                rankOrder: a.rankOrder,
              })),
            }));

            const session = initFastMoneySession(normalizedCode, {
              gameId: game.id,
              player1Id: connectedPlayers[0].id,
              player2Id: connectedPlayers[1].id,
              questions: fmQuestions,
              timerDurationSeconds: 60,
              language: room.language,
            });

            broadcastFastMoneyState(io, session);
          }
        }

        if (callback) {
          callback({
            success: true,
            game: gameStartedPayload,
            teams: partitionResult
              ? { team1: partitionResult.team1, team2: partitionResult.team2 }
              : undefined,
          });
        }
      } catch (error) {
        logger.error('Error handling start_game socket event', error);
        const err: RoomErrorPayload = {
          code: 'SERVER_ERROR',
          message: 'Failed to start game due to an unexpected error.',
        };
        socket.emit('room_error', err);
        if (callback) callback({ success: false, error: err.message });
      }
    }
  );

  // Handle player departure or disconnect (US-04 Scenario 4)
  socket.on('disconnect', async () => {
    const { roomCode, playerId } = socket.data || {};
    if (!roomCode) return;

    if (playerId) {
      try {
        await db.player.update({
          where: { id: playerId },
          data: { isConnected: false },
        });

        const refreshedRoom = await db.room.findUnique({
          where: { roomCode },
          include: { players: true },
        });

        if (refreshedRoom) {
          const state = buildRoomStateUpdate(refreshedRoom);
          io.to(`room:${roomCode}`).emit('room_state_update', state);
        }
      } catch (err) {
        logger.warn(`Failed to update player disconnect for ${playerId}: ${err}`);
      }
    }
  });
}

/**
 * Initializes socket server event listeners and wires all modules.
 */
export function setupSocketServer(io: SocketIOServer, db: PrismaClient = defaultPrisma): void {
  io.on('connection', (socket: Socket) => {
    const clientIp = getSocketIp(socket);
    const transport = socket.conn.transport.name;
    logger.socket('CONNECT', socket.id, clientIp, `Transport: ${transport}`);

    registerLobbyHandlers(io, socket, db);
    registerFastMoneyHandlers(io, socket, db);
    registerMainGameHandlers(io, socket, db);

    socket.on('disconnect', (reason) => {
      logger.socket('DISCONNECT', socket.id, clientIp, `Reason: ${reason}`);
    });
  });
}
