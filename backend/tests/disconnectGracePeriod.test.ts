import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../src/services/db';
import {
  setupSocketServer,
  PlayerLeftAlertPayload,
  handleAutoForfeitIfActiveTimer,
  setGracePeriodDuration,
} from '../src/sockets/lobbyHandler';
import { sessionRecoveryService } from '../src/services/sessionRecoveryService';
import {
  initFastMoneySession,
  getFastMoneySession,
  TurnEndedPayload,
} from '../src/sockets/fastMoneyHandler';
import {
  initTeamGuessingSession,
} from '../src/services/teamGuessingService';
import {
  initFaceOffSession,
} from '../src/services/faceOffService';

describe('US-20 Step 4: 30-Second Grace Period & Auto-Forfeit Arbiter Suite', () => {
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

  const GP_ROOM_CODES = ['FEUD-GP01', 'FEUD-GP02', 'FEUD-GP03'];

  const cleanGpDb = async () => {
    const rooms = await prisma.room.findMany({
      where: { roomCode: { in: GP_ROOM_CODES } },
      select: { id: true },
    });
    const roomIds = rooms.map((r) => r.id);
    if (prisma.playerResponse) {
      await prisma.playerResponse.deleteMany({
        where: { player: { roomId: { in: roomIds } } },
      });
    }
    await prisma.player.deleteMany({
      where: { roomId: { in: roomIds } },
    });
    await prisma.game.deleteMany({
      where: { roomId: { in: roomIds } },
    });
    await prisma.room.deleteMany({
      where: { roomCode: { in: GP_ROOM_CODES } },
    });
    for (const code of GP_ROOM_CODES) {
      sessionRecoveryService.clearRoomSessions(code);
    }
  };

  beforeAll(async () => {
    await cleanGpDb();

    // Seed test room in DB
    await prisma.room.create({
      data: {
        roomCode: 'FEUD-GP01',
        roomName: 'Grace Period Test Room',
        language: 'EN',
        gameMode: 'FAST_MONEY',
        status: 'ACTIVE',
        players: {
          create: [
            {
              id: 'gp-p1-id',
              nickname: 'Alice',
              team: 'NONE',
              isReady: true,
              isConnected: true,
            },
            {
              id: 'gp-p2-id',
              nickname: 'Bob',
              team: 'NONE',
              isReady: true,
              isConnected: true,
            },
          ],
        },
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
      if (socket.connected) socket.disconnect();
    }
    if (testIo) {
      await new Promise<void>((resolve) => testIo.close(() => resolve()));
    }
    if (testServer) {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
    await cleanGpDb();
  });

  beforeEach(() => {
    for (const socket of clientSockets) {
      if (socket.connected) socket.disconnect();
    }
    clientSockets = [];
  });

  it('1. SessionRecoveryService manages grace period timers, cancellation, and expiration tracking', async () => {
    const roomCode = 'FEUD-GP01';
    const playerId = 'gp-unit-p1';
    const nickname = 'GraceTester';

    sessionRecoveryService.createPlayerSession(roomCode, playerId, nickname);
    expect(sessionRecoveryService.isPlayerInGracePeriod(playerId)).toBe(false);

    let expired = false;
    const timer = sessionRecoveryService.startGraceTimer(playerId, 50, () => {
      expired = true;
    });

    expect(timer).toBeDefined();
    expect(sessionRecoveryService.isPlayerInGracePeriod(playerId)).toBe(true);

    const session = sessionRecoveryService.getPlayerSession(playerId);
    expect(session?.isConnected).toBe(false);
    expect(session?.disconnectedAt).toBeDefined();

    // Wait for expiration
    await new Promise((r) => setTimeout(r, 70));
    expect(expired).toBe(true);
    expect(sessionRecoveryService.isPlayerInGracePeriod(playerId)).toBe(false);

    // Test cancellation
    let cancelledExpired = false;
    sessionRecoveryService.startGraceTimer(playerId, 100, () => {
      cancelledExpired = true;
    });
    expect(sessionRecoveryService.isPlayerInGracePeriod(playerId)).toBe(true);
    sessionRecoveryService.cancelGraceTimer(playerId);
    expect(sessionRecoveryService.isPlayerInGracePeriod(playerId)).toBe(false);

    await new Promise((r) => setTimeout(r, 120));
    expect(cancelledExpired).toBe(false);
  });

  it('2. Scenario 4: Player disconnects and grace timer expiration broadcasts "[Player] has left the game" alert to Host', async () => {
    const roomCode = 'FEUD-GP01';
    const hostSecret = sessionRecoveryService.createHostSecret(roomCode);

    // Host connects and waits for join confirmation
    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    await new Promise<void>((resolve) => {
      hostSocket.emit('reconnect_host', { roomCode, hostSecret }, () => resolve());
    });

    // Player Alice connects
    const playerToken = sessionRecoveryService.createPlayerSession(roomCode, 'gp-p1-id', 'Alice');
    const playerSocket = await connectClient(port);
    clientSockets.push(playerSocket);

    await new Promise<void>((resolve) => {
      playerSocket.emit(
        'reconnect_session',
        { roomCode, playerId: 'gp-p1-id', sessionToken: playerToken },
        () => resolve()
      );
    });

    // Set up alert listener on host
    const alertPromise = waitForEvent<PlayerLeftAlertPayload>(hostSocket, 'player_left_alert');

    // Configure test grace duration to 50ms so disconnect handler's actual timer fires
    setGracePeriodDuration(50);

    // Simulate player disconnect
    playerSocket.disconnect();

    const alert = await alertPromise;
    expect(alert).toBeDefined();
    expect(alert.roomCode).toBe(roomCode);
    expect(alert.playerId).toBe('gp-p1-id');
    expect(alert.nickname).toBe('Alice');
    expect(alert.message).toBe('Alice has left the game');

    // Reset default grace duration
    setGracePeriodDuration(30000);
  });

  it('3. Auto-Forfeit Arbiter: Auto-forfeits Fast Money Player 1 turn when grace expires during active turn', async () => {
    const roomCode = 'FEUD-GP01';
    const hostSecret = sessionRecoveryService.createHostSecret(roomCode);

    const session = initFastMoneySession(roomCode, {
      gameId: 'game-fm-gp1',
      player1Id: 'gp-p1-id',
      player2Id: 'gp-p2-id',
      timerDurationSeconds: 60,
      language: 'EN',
      questions: [
        {
          id: 'q1',
          questionText: 'Name something in a kitchen',
          orderIndex: 1,
          answers: [{ id: 'a1', answerText: 'FRIDGE', points: 30, rankOrder: 1 }],
        },
      ],
    });

    session.startPlayer1Turn('gp-p1-id');
    expect(session.getPhase()).toBe('P1_PLAYING');

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    await new Promise<void>((resolve) => {
      hostSocket.emit('reconnect_host', { roomCode, hostSecret }, () => resolve());
    });

    const turnEndedPromise = waitForEvent<TurnEndedPayload>(hostSocket, 'p1_turn_ended');

    // Execute auto-forfeit arbiter
    const didForfeit = await handleAutoForfeitIfActiveTimer(testIo, roomCode, 'gp-p1-id', prisma);
    expect(didForfeit).toBe(true);

    const turnEnded = await turnEndedPromise;
    expect(turnEnded.reason).toBe('TIME_EXPIRED');
    expect(session.getPhase()).toBe('P1_REVEAL');
  });

  it('4. Auto-Forfeit Arbiter: Auto-forfeits Fast Money Player 2 turn when grace expires during active turn', async () => {
    const roomCode = 'FEUD-GP01';
    const hostSecret = sessionRecoveryService.createHostSecret(roomCode);

    const session = initFastMoneySession(roomCode, {
      gameId: 'game-fm-gp2',
      player1Id: 'gp-p1-id',
      player2Id: 'gp-p2-id',
      timerDurationSeconds: 75,
      language: 'EN',
      questions: [
        {
          id: 'q1',
          questionText: 'Name something in a kitchen',
          orderIndex: 1,
          answers: [{ id: 'a1', answerText: 'FRIDGE', points: 30, rankOrder: 1 }],
        },
      ],
    });

    session.phase = 'P2_READY';
    session.startPlayer2Turn('gp-p2-id');
    expect(session.getPhase()).toBe('P2_PLAYING');

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    await new Promise<void>((resolve) => {
      hostSocket.emit('reconnect_host', { roomCode, hostSecret }, () => resolve());
    });

    const turnEndedPromise = waitForEvent<TurnEndedPayload>(hostSocket, 'p2_turn_ended');

    const didForfeit = await handleAutoForfeitIfActiveTimer(testIo, roomCode, 'gp-p2-id', prisma);
    expect(didForfeit).toBe(true);

    const turnEnded = await turnEndedPromise;
    expect(turnEnded.reason).toBe('TIME_EXPIRED');
  });

  it('5. Auto-Forfeit Arbiter: Auto-forfeits Main Game Team Guessing turn and issues strike on grace expiration', async () => {
    const roomCode = 'FEUD-GP02';
    const hostSecret = sessionRecoveryService.createHostSecret(roomCode);

    await prisma.room.create({
      data: {
        roomCode,
        roomName: 'Main Game Guessing Room',
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'ACTIVE',
        players: {
          create: [
            { id: 'tg-p1', nickname: 'Charlie', team: 'TEAM_1', isConnected: true, isReady: true },
            { id: 'tg-p2', nickname: 'Diana', team: 'TEAM_2', isConnected: true, isReady: true },
          ],
        },
      },
    });

    const teamSession = initTeamGuessingSession(roomCode, {
      gameId: 'game-tg-gp',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      roundBank: 40,
      strikes: 0,
      question: {
        id: 'q-tg-1',
        questionText: 'Name something in a living room',
        roundNumber: 1,
        orderIndex: 1,
        answers: [
          { id: 'ans1', answerText: 'COFFEE', points: 40, rankOrder: 1, isRevealed: false },
        ],
      },
      team1Players: [{ id: 'tg-p1', nickname: 'Charlie', team: 'TEAM_1', battingOrder: 1 }],
      team2Players: [{ id: 'tg-p2', nickname: 'Diana', team: 'TEAM_2', battingOrder: 1 }],
      timerDurationSeconds: 15,
    });

    expect(teamSession.getState().activePlayer?.id).toBe('tg-p1');

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    await new Promise<void>((resolve) => {
      hostSocket.emit('reconnect_host', { roomCode, hostSecret }, () => resolve());
    });

    const strikePromise = waitForEvent<any>(hostSocket, 'strike_issued');

    const didForfeit = await handleAutoForfeitIfActiveTimer(testIo, roomCode, 'tg-p1', prisma);
    expect(didForfeit).toBe(true);

    const strike = await strikePromise;
    expect(strike.strikeCount).toBe(1);
    expect(strike.isTimeout).toBe(true);
    expect(strike.player.id).toBe('tg-p1');
  });

  it('6. Auto-Forfeit Arbiter: Auto-forfeits Face-Off turn when duelist times out during buzzer answering phase', async () => {
    const roomCode = 'FEUD-GP03';
    const hostSecret = sessionRecoveryService.createHostSecret(roomCode);

    await prisma.room.create({
      data: {
        roomCode,
        roomName: 'Main Game Face-Off Room',
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'ACTIVE',
        players: {
          create: [
            { id: 'fo-p1', nickname: 'Edward', team: 'TEAM_1', isConnected: true, isReady: true },
            { id: 'fo-p2', nickname: 'Fiona', team: 'TEAM_2', isConnected: true, isReady: true },
          ],
        },
      },
    });

    const faceOff = initFaceOffSession(roomCode, {
      gameId: 'game-fo-gp',
      roundNumber: 1,
      team1Players: [{ id: 'fo-p1', nickname: 'Edward', team: 'TEAM_1', battingOrder: 1 }],
      team2Players: [{ id: 'fo-p2', nickname: 'Fiona', team: 'TEAM_2', battingOrder: 1 }],
      question: {
        id: 'fo-q1',
        questionText: 'Name something you pack for vacation',
        orderIndex: 1,
        roundNumber: 1,
        answers: [{ id: 'fo-a1', answerText: 'PASSPORT', points: 50, rankOrder: 1 }],
      },
      language: 'EN',
      timerDurationSeconds: 15,
    });

    // Simulate Edward buzzing in
    faceOff.phase = 'ANSWERING';
    faceOff.buzzedPlayerId = 'fo-p1';

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    await new Promise<void>((resolve) => {
      hostSocket.emit('reconnect_host', { roomCode, hostSecret }, () => resolve());
    });

    const timeoutPromise = waitForEvent<any>(hostSocket, 'face_off_timeout');

    const didForfeit = await handleAutoForfeitIfActiveTimer(testIo, roomCode, 'fo-p1', prisma);
    expect(didForfeit).toBe(true);

    const timeout = await timeoutPromise;
    expect(timeout.timedOutPlayerId).toBe('fo-p1');
  });

  it('7. Returns false if disconnected player has no active turn waiting on them', async () => {
    const didForfeit = await handleAutoForfeitIfActiveTimer(
      testIo,
      'FEUD-GP01',
      'non-existent-player',
      prisma
    );
    expect(didForfeit).toBe(false);
  });
});
