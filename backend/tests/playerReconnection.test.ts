import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../src/services/db';
import {
  setupSocketServer,
  ReconnectAcknowledgedPayload,
  RoomErrorPayload,
} from '../src/sockets/lobbyHandler';
import { sessionRecoveryService } from '../src/services/sessionRecoveryService';
import {
  initFastMoneySession,
  broadcastFastMoneyState,
  getFastMoneySession,
} from '../src/sockets/fastMoneyHandler';
import {
  initTeamGuessingSession,
} from '../src/services/teamGuessingService';

describe('US-20 Step 3: Player Automatic Reconnection & Turn Resumption Suite', () => {
  let testServer: http.Server;
  let testIo: SocketIOServer;
  let port: number;
  let clientSockets: ClientSocket[] = [];

  const connectClient = (p: number): Promise<ClientSocket> => {
    return new Promise((resolve, reject) => {
      const socket = Client(`http://localhost:${p}`, {
        transports: ['websocket'],
        forceNew: true,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
    });
  };

  const waitForEvent = <T = unknown>(
    socket: ClientSocket,
    event: string,
    timeout = 3000
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for event "${event}" after ${timeout}ms`));
      }, timeout);

      socket.once(event, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  };

  beforeAll(async () => {
    if (prisma.playerResponse) {
      await prisma.playerResponse.deleteMany({});
    }
    await prisma.player.deleteMany({});
    await prisma.game.deleteMany({});
    await prisma.room.deleteMany({
      where: {
        roomCode: {
          in: ['FEUD-PR01', 'FEUD-PR02', 'FEUD-PR03'],
        },
      },
    });

    // Create test rooms with players in DB
    const room1 = await prisma.room.create({
      data: {
        roomCode: 'FEUD-PR01',
        roomName: 'Player Fast Money Reconnect Room',
        language: 'EN',
        gameMode: 'FAST_MONEY',
        status: 'ACTIVE',
      },
    });

    await prisma.player.create({
      data: {
        id: 'player-p1-uuid',
        roomId: room1.id,
        nickname: 'SpeedyP1',
        isConnected: true,
      },
    });

    await prisma.player.create({
      data: {
        id: 'player-p2-uuid',
        roomId: room1.id,
        nickname: 'Player2',
        isConnected: true,
      },
    });

    const room2 = await prisma.room.create({
      data: {
        roomCode: 'FEUD-PR02',
        roomName: 'Player Main Game Reconnect Room',
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'ACTIVE',
      },
    });

    await prisma.player.create({
      data: {
        id: 'player-mg-p1',
        roomId: room2.id,
        nickname: 'TeamPlayer1',
        team: 'TEAM_1',
        isConnected: true,
      },
    });

    testServer = http.createServer();
    testIo = new SocketIOServer(testServer, {
      cors: { origin: '*' },
    });
    setupSocketServer(testIo);

    await new Promise<void>((resolve) => {
      testServer.listen(0, () => {
        port = (testServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const socket of clientSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    if (testIo) {
      await new Promise<void>((resolve) => testIo.close(() => resolve()));
    }
    if (testServer) {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
    if (prisma.playerResponse) {
      await prisma.playerResponse.deleteMany({});
    }
    await prisma.player.deleteMany({});
    await prisma.game.deleteMany({});
    await prisma.room.deleteMany({
      where: {
        roomCode: {
          in: ['FEUD-PR01', 'FEUD-PR02', 'FEUD-PR03'],
        },
      },
    });
  });

  beforeEach(() => {
    for (const socket of clientSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    clientSockets = [];
  });

  it('satisfies Scenario 2: Player locks screen and reconnects within grace period, re-attaching without duplicate player entry and resuming active turn', async () => {
    const roomCode = 'FEUD-PR01';
    const playerId = 'player-p1-uuid';
    const nickname = 'SpeedyP1';

    // Register active player session
    const sessionToken = sessionRecoveryService.createPlayerSession(roomCode, playerId, nickname);

    // Initialize Fast Money session
    const fastMoney = initFastMoneySession(roomCode, {
      player1Id: playerId,
      player2Id: 'player-p2-uuid',
      questions: [
        {
          id: 'q-fm-1',
          questionText: 'Name something you eat with soup',
          answerCount: 2,
          answers: [
            { text: 'Crackers', points: 45 },
            { text: 'Bread', points: 35 },
          ],
        },
      ],
    });

    // Start Player 1's turn (Scenario 2: Player 1 is taking their 60-second turn)
    fastMoney.startPlayer1Turn(playerId);
    expect(fastMoney.phase).toBe('P1_PLAYING');

    // Initial socket connects and disconnects (screen lock simulation)
    const initialSocket = await connectClient(port);
    clientSockets.push(initialSocket);
    sessionRecoveryService.updatePlayerSocket(playerId, initialSocket.id);
    initialSocket.disconnect();

    // 5 seconds later, phone unlocks and reconnects
    const reconnectedSocket = await connectClient(port);
    clientSockets.push(reconnectedSocket);

    // Set up listeners for reconnect_acknowledged and fast_money_p1_state
    const ackPromise = waitForEvent<ReconnectAcknowledgedPayload>(
      reconnectedSocket,
      'reconnect_acknowledged'
    );
    const p1StatePromise = waitForEvent<any>(
      reconnectedSocket,
      'fast_money_p1_state'
    );

    reconnectedSocket.emit('reconnect_session', {
      roomCode,
      playerId,
      sessionToken,
    });

    const [ack, p1State] = await Promise.all([ackPromise, p1StatePromise]);

    // Verify successful reconnection
    expect(ack.success).toBe(true);
    expect(ack.role).toBe('PLAYER');
    expect(ack.player?.id).toBe(playerId);
    expect(ack.player?.nickname).toBe(nickname);

    // Verify player is attached and receives their active turn state
    expect(p1State).toBeDefined();
    expect(p1State.currentQuestion.questionText).toBe('Name something you eat with soup');

    // Verify no duplicate players created in DB
    const playersInDb = await prisma.player.findMany({
      where: { roomId: (await prisma.room.findUnique({ where: { roomCode } }))?.id },
    });
    expect(playersInDb.length).toBe(2);
    const reconnectedDbPlayer = playersInDb.find((p) => p.id === playerId);
    expect(reconnectedDbPlayer?.isConnected).toBe(true);
  });

  it('satisfies Scenario 3: Accidental mobile browser refresh re-hydrates team guessing stage and updates connection status', async () => {
    const roomCode = 'FEUD-PR02';
    const playerId = 'player-mg-p1';
    const nickname = 'TeamPlayer1';

    const sessionToken = sessionRecoveryService.createPlayerSession(roomCode, playerId, nickname);

    // Initialize team guessing session
    initTeamGuessingSession(roomCode, {
      gameId: 'game-pr-2',
      roundNumber: 1,
      language: 'EN',
      controllingTeam: 'TEAM_1',
      opposingTeam: 'TEAM_2',
      question: {
        id: 'q-mg-1',
        questionText: 'Name something you pack for the beach',
        answers: [{ id: 'a1', answerText: 'Towel', points: 50, rankOrder: 1 }],
      },
      team1Players: [{ id: playerId, nickname, team: 'TEAM_1', battingOrder: 1 }],
      team2Players: [{ id: 'opp-1', nickname: 'Opponent', team: 'TEAM_2', battingOrder: 1 }],
    });

    const socket = await connectClient(port);
    clientSockets.push(socket);

    const ackPromise = waitForEvent<ReconnectAcknowledgedPayload>(
      socket,
      'reconnect_acknowledged'
    );
    const teamStatePromise = waitForEvent<any>(
      socket,
      'team_guessing_state'
    );

    socket.emit('reconnect_session', {
      roomCode,
      playerId,
      sessionToken,
    });

    const [ack, teamState] = await Promise.all([ackPromise, teamStatePromise]);

    expect(ack.success).toBe(true);
    expect(ack.player?.team).toBe('TEAM_1');
    expect(teamState).toBeDefined();
    expect(teamState.question.questionText).toBe('Name something you pack for the beach');

    // DB isConnected should be true
    const dbPlayer = await prisma.player.findUnique({ where: { id: playerId } });
    expect(dbPlayer?.isConnected).toBe(true);
  });

  it('rejects player reconnection with invalid sessionToken', async () => {
    const roomCode = 'FEUD-PR01';
    const playerId = 'player-p1-uuid';
    sessionRecoveryService.createPlayerSession(roomCode, playerId, 'SpeedyP1');

    const socket = await connectClient(port);
    clientSockets.push(socket);

    const errPromise = waitForEvent<RoomErrorPayload>(socket, 'room_error');

    socket.emit('reconnect_session', {
      roomCode,
      playerId,
      sessionToken: 'INVALID-SESSION-TOKEN-XYZ',
    });

    const err = await errPromise;
    expect(err.code).toBe('INVALID_ROOM');
    expect(err.message).toMatch(/Invalid or expired player session token/i);
  });

  it('rejects player reconnection with missing fields', async () => {
    const socket = await connectClient(port);
    clientSockets.push(socket);

    const errPromise = waitForEvent<RoomErrorPayload>(socket, 'room_error');

    socket.emit('reconnect_session', {
      roomCode: '',
      playerId: '',
      sessionToken: '',
    });

    const err = await errPromise;
    expect(err.code).toBe('INVALID_ROOM');
    expect(err.message).toMatch(/Missing roomCode, playerId, or sessionToken/i);
  });
});

