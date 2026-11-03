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
  initFaceOffSession,
} from '../src/services/faceOffService';
import {
  initTeamGuessingSession,
} from '../src/services/teamGuessingService';
import {
  initMatchScoreboard,
} from '../src/services/mainGameScoreboardService';
import {
  initFastMoneySession,
} from '../src/sockets/fastMoneyHandler';

describe('US-20 Step 2: Host Display Fast Reconnection & State Recovery Suite', () => {
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
          in: ['FEUD-REC1', 'FEUD-REC2', 'FEUD-REC3', 'FEUD-REC4'],
        },
      },
    });

    await prisma.room.createMany({
      data: [
        {
          roomCode: 'FEUD-REC1',
          roomName: 'Host Recovery Team Guessing Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'ACTIVE',
        },
        {
          roomCode: 'FEUD-REC2',
          roomName: 'Host Recovery Face Off Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'ACTIVE',
        },
        {
          roomCode: 'FEUD-REC3',
          roomName: 'Host Recovery Fast Money Room',
          language: 'EN',
          gameMode: 'FAST_MONEY',
          status: 'ACTIVE',
        },
      ],
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
          in: ['FEUD-REC1', 'FEUD-REC2', 'FEUD-REC3', 'FEUD-REC4'],
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

  it('satisfies Scenario 1: Accidental Host Browser Refresh re-hydrates full board, strikes, scores in < 500ms without resetting game', async () => {
    const roomCode = 'FEUD-REC1';
    const hostSecret = sessionRecoveryService.createHostSecret(roomCode);

    // Seed mock Team Guessing session with strikes and revealed answers
    const mockQuestion = {
      id: 'q-rec-1',
      questionText: 'Name something in a refrigerator',
      answers: [
        { id: 'a1', answerText: 'Milk', points: 40, rankOrder: 1 },
        { id: 'a2', answerText: 'Cheese', points: 30, rankOrder: 2 },
        { id: 'a3', answerText: 'Butter', points: 15, rankOrder: 3 },
      ],
    };

    const team1Players = [
      { id: 'p1', nickname: 'Alice', team: 'TEAM_1' as const, battingOrder: 1 },
      { id: 'p2', nickname: 'Bob', team: 'TEAM_1' as const, battingOrder: 2 },
    ];
    const team2Players = [
      { id: 'p3', nickname: 'Charlie', team: 'TEAM_2' as const, battingOrder: 1 },
      { id: 'p4', nickname: 'Diana', team: 'TEAM_2' as const, battingOrder: 2 },
    ];

    const teamGuessing = initTeamGuessingSession(roomCode, {
      gameId: 'game-rec-1',
      roundNumber: 1,
      language: 'EN',
      controllingTeam: 'TEAM_1',
      opposingTeam: 'TEAM_2',
      question: mockQuestion,
      team1Players,
      team2Players,
    });

    // Simulate 2 strikes and 1 revealed answer + bank points
    teamGuessing.strikes = 2;
    teamGuessing.roundBank = 40;
    teamGuessing.revealedAnswers = [
      {
        id: 'a1',
        answerText: 'Milk',
        points: 40,
        rankOrder: 1,
      },
    ];
    expect(teamGuessing.getState().strikes).toBe(2);
    expect(teamGuessing.getState().revealedAnswers.length).toBe(1);
    expect(teamGuessing.getState().roundBank).toBe(40);

    // Scoreboard with active match score
    const scoreboard = initMatchScoreboard(roomCode, {
      gameId: 'game-rec-1',
      totalRounds: 3,
    });
    scoreboard.team1GrandTotal = 100;

    // Host initially connected and then browser refreshes (disconnects)
    const oldHostSocket = await connectClient(port);
    clientSockets.push(oldHostSocket);
    sessionRecoveryService.registerHostSocket(roomCode, oldHostSocket.id);
    oldHostSocket.disconnect();

    // Reconnection via new socket simulating page reload
    const newHostSocket = await connectClient(port);
    clientSockets.push(newHostSocket);

    const startTime = Date.now();

    // Emit reconnect_host
    const ackPromise = waitForEvent<ReconnectAcknowledgedPayload>(
      newHostSocket,
      'reconnect_acknowledged'
    );

    newHostSocket.emit('reconnect_host', {
      roomCode,
      hostSecret,
    });

    const ack = await ackPromise;
    const duration = Date.now() - startTime;

    // AC Scenario 1: Reconnection time < 500ms
    expect(duration).toBeLessThan(500);

    // Verify authenticated host and payload
    expect(ack.success).toBe(true);
    expect(ack.role).toBe('HOST');
    expect(ack.roomCode).toBe(roomCode);
    expect(ack.gameState.status).toBe('ACTIVE');

    // Verify strikes and revealed cards persisted without reset
    const recoveredGuessing = ack.gameState.teamGuessingState;
    expect(recoveredGuessing).toBeDefined();
    expect(recoveredGuessing.strikes).toBe(2);
    expect(recoveredGuessing.revealedAnswers.length).toBe(1);
    expect(recoveredGuessing.revealedAnswers[0].answerText).toBe('Milk');
    expect(recoveredGuessing.roundBank).toBe(40);
    expect(recoveredGuessing.controllingTeam).toBe('TEAM_1');

    // Verify scoreboard persisted
    expect(ack.gameState.scoreboardState?.team1GrandTotal).toBe(100);

    // Verify host socket ID updated in session recovery service
    expect(sessionRecoveryService.getHostSocket(roomCode)).toBe(newHostSocket.id);
  });

  it('restores Face-Off board state when host reconnects during buzzer duel', async () => {
    const roomCode = 'FEUD-REC2';
    const hostSecret = sessionRecoveryService.createHostSecret(roomCode);

    const faceOff = initFaceOffSession(roomCode, {
      gameId: 'game-rec-2',
      roundNumber: 1,
      language: 'EN',
      question: {
        id: 'q-rec-2',
        questionText: 'Name a fruit that is red',
        answerCount: 3,
        answers: [
          { id: 'fa1', answerText: 'Apple', points: 50, rankOrder: 1 },
          { id: 'fa2', answerText: 'Strawberry', points: 30, rankOrder: 2 },
          { id: 'fa3', answerText: 'Cherry', points: 20, rankOrder: 3 },
        ],
      },
      team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
      team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
    });

    // Simulate buzzer active and press
    faceOff.phase = 'BUZZER_ACTIVE';
    faceOff.pressBuzzer('p1', Date.now());
    expect(faceOff.getState().buzzerLocked).toBe(true);
    expect(faceOff.getState().buzzedPlayerId).toBe('p1');

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    const ackPromise = waitForEvent<ReconnectAcknowledgedPayload>(
      hostSocket,
      'reconnect_acknowledged'
    );

    hostSocket.emit('reconnect_host', {
      roomCode,
      hostSecret,
    });

    const ack = await ackPromise;
    expect(ack.success).toBe(true);
    expect(ack.gameState.faceOffState).toBeDefined();
    expect(ack.gameState.faceOffState?.buzzerLocked).toBe(true);
    expect(ack.gameState.faceOffState?.buzzedPlayerNickname).toBe('Alice');
    expect(ack.gameState.faceOffState?.question.id).toBe('q-rec-2');
  });

  it('restores Fast Money host state when host reconnects during Fast Money', async () => {
    const roomCode = 'FEUD-REC3';
    const hostSecret = sessionRecoveryService.createHostSecret(roomCode);

    const fastMoney = initFastMoneySession(roomCode, {
      player1Id: 'fm-p1',
      player2Id: 'fm-p2',
      questions: [
        {
          id: 'fm-q1',
          questionText: 'Fast Money Q1',
          answerCount: 1,
          answers: [{ text: 'Sunny', points: 50 }],
        },
      ],
    });

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    const ackPromise = waitForEvent<ReconnectAcknowledgedPayload>(
      hostSocket,
      'reconnect_acknowledged'
    );

    hostSocket.emit('reconnect_host', {
      roomCode,
      hostSecret,
    });

    const ack = await ackPromise;
    expect(ack.success).toBe(true);
    expect(ack.gameState.fastMoneyHostState).toBeDefined();
    expect(ack.gameState.gameMode).toBe('FAST_MONEY');
  });

  it('rejects host reconnection with invalid hostSecret', async () => {
    const roomCode = 'FEUD-REC1';
    sessionRecoveryService.createHostSecret(roomCode);

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    const errPromise = waitForEvent<RoomErrorPayload>(hostSocket, 'room_error');

    hostSocket.emit('reconnect_host', {
      roomCode,
      hostSecret: 'WRONG-SECRET-KEY',
    });

    const err = await errPromise;
    expect(err.code).toBe('INVALID_ROOM');
    expect(err.message).toMatch(/Invalid host secret/i);
  });

  it('rejects host reconnection with missing parameters', async () => {
    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    const errPromise = waitForEvent<RoomErrorPayload>(hostSocket, 'room_error');

    hostSocket.emit('reconnect_host', {
      roomCode: '',
      hostSecret: '',
    });

    const err = await errPromise;
    expect(err.code).toBe('INVALID_ROOM');
    expect(err.message).toMatch(/Missing roomCode or hostSecret/i);
  });
});
