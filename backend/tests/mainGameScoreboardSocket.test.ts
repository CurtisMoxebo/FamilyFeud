import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../src/services/db';
import { setupSocketServer } from '../src/sockets/lobbyHandler';
import { clearAllFaceOffSessions, initFaceOffSession } from '../src/services/faceOffService';
import { clearAllTeamGuessingSessions } from '../src/services/teamGuessingService';
import {
  initMatchScoreboard,
  getMatchScoreboard,
  clearAllMatchScoreboards,
  ScoreboardState,
} from '../src/services/mainGameScoreboardService';
import {
  handleStealResolvedBroadcast,
  ScoreboardUpdatePayload,
  MatchOverPayload,
  SuddenDeathInitiatedPayload,
  NextRoundStartedPayload,
} from '../src/sockets/mainGameHandler';

describe('US-16: Main Game Scoreboard, Multi-Round Progression & Replay WebSocket Integration', () => {
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
    timeout = 4000
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

  const testRoomCodes = ['FEUD-SC01', 'FEUD-SC02', 'FEUD-SC03', 'FEUD-SC04', 'FEUD-SC05', 'FEUD-SC06'];

  const cleanupTestRooms = async () => {
    try {
      await prisma.playerResponse.deleteMany({
        where: { player: { room: { roomCode: { in: testRoomCodes } } } },
      });
      await prisma.answer.deleteMany({
        where: { question: { game: { room: { roomCode: { in: testRoomCodes } } } } },
      });
      await prisma.question.deleteMany({
        where: { game: { room: { roomCode: { in: testRoomCodes } } } },
      });
      await prisma.game.deleteMany({
        where: { room: { roomCode: { in: testRoomCodes } } },
      });
      await prisma.player.deleteMany({
        where: { room: { roomCode: { in: testRoomCodes } } },
      });
      await prisma.room.deleteMany({
        where: { roomCode: { in: testRoomCodes } },
      });
    } catch {
      // Ignore errors if records do not exist
    }
  };

  beforeAll(async () => {
    await cleanupTestRooms();
    testServer = http.createServer();
    testIo = new SocketIOServer(testServer, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    setupSocketServer(testIo, prisma);

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
    await cleanupTestRooms();
    await new Promise<void>((resolve) => testIo.close(() => resolve()));
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  });

  beforeEach(async () => {
    for (const socket of clientSockets) {
      if (socket.connected) socket.disconnect();
    }
    clientSockets = [];
    clearAllFaceOffSessions();
    clearAllTeamGuessingSessions();
    clearAllMatchScoreboards();
    await cleanupTestRooms();
  });

  it('satisfies Scenario 1: allows client to fetch scoreboard state via get_scoreboard_state', async () => {
    const roomCode = 'FEUD-SC01';
    const game = await prisma.game.create({
      data: {
        room: {
          create: {
            roomCode,
            language: 'EN',
            gameMode: 'MAIN_GAME',
            status: 'LOBBY',
          },
        },
        mode: 'MAIN_GAME',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });

    initMatchScoreboard(roomCode, game.id, {
      totalRounds: 3,
      team1Initial: 65,
      team2Initial: 40,
    });

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    await new Promise<void>((res) => {
      hostSocket.emit('join_room', { roomCode, isHost: true }, () => res());
    });

    const scoreboardPromise = waitForEvent<ScoreboardUpdatePayload>(hostSocket, 'scoreboard_update');

    const ack = await new Promise<any>((res) => {
      hostSocket.emit('get_scoreboard_state', { roomCode }, res);
    });

    expect(ack.success).toBe(true);
    expect(ack.scoreboard.team1GrandTotal).toBe(65);
    expect(ack.scoreboard.team2GrandTotal).toBe(40);
    expect(ack.scoreboard.totalRounds).toBe(3);

    const emittedState = await scoreboardPromise;
    expect(emittedState.team1GrandTotal).toBe(65);
    expect(emittedState.team2GrandTotal).toBe(40);
  });

  it('satisfies Scenario 2: awards points and updates cumulative totals on steal resolution', async () => {
    const roomCode = 'FEUD-SC02';
    const game = await prisma.game.create({
      data: {
        room: {
          create: {
            roomCode,
            language: 'EN',
            gameMode: 'MAIN_GAME',
            status: 'LOBBY',
          },
        },
        mode: 'MAIN_GAME',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });

    const scoreboard = initMatchScoreboard(roomCode, game.id, {
      totalRounds: 3,
      team1Initial: 0,
      team2Initial: 0,
    });

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    await new Promise<void>((res) => {
      hostSocket.emit('join_room', { roomCode, isHost: true }, () => res());
    });

    const scoreboardPromise = waitForEvent<ScoreboardUpdatePayload>(hostSocket, 'scoreboard_update');

    // Simulate Steal Phase success: Team 2 steals 65 pts in Round 1
    handleStealResolvedBroadcast(testIo, roomCode, {
      roomCode,
      success: true,
      outcome: 'STEAL_SUCCESS',
      winningTeam: 'TEAM_2',
      pointsAwarded: 65,
      roundBank: 65,
      stealingPlayer: { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
      matchedAnswer: { id: 'a2', answerText: 'BUTTER', points: 25, rankOrder: 2 },
      rawAnswer: 'BUTTER',
      remainingAnswers: [],
      message: 'Steal successful!',
    });

    const scoreUpdate = await scoreboardPromise;
    expect(scoreUpdate.winningTeam).toBe('TEAM_2');
    expect(scoreUpdate.pointsAwarded).toBe(65);
    expect(scoreUpdate.team1GrandTotal).toBe(0);
    expect(scoreUpdate.team2GrandTotal).toBe(65);
    expect(scoreUpdate.currentRoundNumber).toBe(1);
    expect(scoreUpdate.phase).toBe('ROUND_RESOLVED');

    // Verify scoreboard session state
    expect(scoreboard.team2GrandTotal).toBe(65);
  });

  it('satisfies Scenario 3: advances to next round, rotates Face-Off contenders, and updates currentRound', async () => {
    const roomCode = 'FEUD-SC03';
    const room = await prisma.room.create({
      data: {
        roomCode,
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'LOBBY',
        players: {
          create: [
            { nickname: 'Alice', team: 'TEAM_1', isConnected: true },
            { nickname: 'Bob', team: 'TEAM_1', isConnected: true },
            { nickname: 'Charlie', team: 'TEAM_2', isConnected: true },
            { nickname: 'David', team: 'TEAM_2', isConnected: true },
          ],
        },
      },
      include: { players: true },
    });

    const game = await prisma.game.create({
      data: {
        roomId: room.id,
        mode: 'MAIN_GAME',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });

    const scoreboard = initMatchScoreboard(roomCode, game.id, { totalRounds: 3 });
    // Round 1 completed
    scoreboard.awardRoundPoints('TEAM_1', 75);

    // Initial Face-Off session for round 1
    initFaceOffSession(roomCode, {
      gameId: game.id,
      roundNumber: 1,
      team1Players: [
        { id: room.players[0].id, nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
        { id: room.players[1].id, nickname: 'Bob', team: 'TEAM_1', battingOrder: 2 },
      ],
      team2Players: [
        { id: room.players[2].id, nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
        { id: room.players[3].id, nickname: 'David', team: 'TEAM_2', battingOrder: 2 },
      ],
      question: {
        id: 'q-init',
        questionText: 'Initial Question',
        answers: [{ id: 'a1', answerText: 'One', points: 100, rankOrder: 1 }],
      },
    });

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    await new Promise<void>((res) => {
      hostSocket.emit('join_room', { roomCode, isHost: true }, () => res());
    });

    const nextRoundPromise = waitForEvent<NextRoundStartedPayload>(hostSocket, 'next_round_started');
    const faceOffPromise = waitForEvent<any>(hostSocket, 'face_off_state');

    const ack = await new Promise<any>((res) => {
      hostSocket.emit('advance_next_round', { roomCode }, res);
    });

    expect(ack.success).toBe(true);
    expect(ack.nextRoundNumber).toBe(2);

    const nextRoundPayload = await nextRoundPromise;
    expect(nextRoundPayload.roundNumber).toBe(2);
    // Batting order 2 contenders step up to the buzzer!
    expect(nextRoundPayload.team1Contender.nickname).toBe('Bob');
    expect(nextRoundPayload.team2Contender.nickname).toBe('David');

    const faceOffState = await faceOffPromise;
    expect(faceOffState.roundNumber).toBe(2);
    expect(faceOffState.team1Contender.nickname).toBe('Bob');
    expect(faceOffState.team2Contender.nickname).toBe('David');

    // Verify MySQL currentRound update
    const updatedGame = await prisma.game.findUnique({ where: { id: game.id } });
    expect(updatedGame?.currentRound).toBe(2);
  });

  it('satisfies Scenario 4: declares champion, emits match_over, and updates database on final round', async () => {
    const roomCode = 'FEUD-SC04';
    const game = await prisma.game.create({
      data: {
        room: {
          create: {
            roomCode,
            language: 'EN',
            gameMode: 'MAIN_GAME',
            status: 'LOBBY',
          },
        },
        mode: 'MAIN_GAME',
        status: 'IN_PROGRESS',
        currentRound: 3,
      },
    });

    // Scoreboard in Round 3 (final round)
    const scoreboard = initMatchScoreboard(roomCode, game.id, {
      totalRounds: 3,
      team1Initial: 145,
      team2Initial: 180,
    });
    scoreboard.currentRoundNumber = 3;

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    await new Promise<void>((res) => {
      hostSocket.emit('join_room', { roomCode, isHost: true }, () => res());
    });

    const matchOverPromise = waitForEvent<MatchOverPayload>(hostSocket, 'match_over');

    // Round 3 resolved: Team 1 wins 100 pts -> 145 + 100 = 245 vs 180
    handleStealResolvedBroadcast(testIo, roomCode, {
      roomCode,
      success: true,
      outcome: 'STEAL_SUCCESS',
      winningTeam: 'TEAM_1',
      pointsAwarded: 100,
      roundBank: 100,
      stealingPlayer: { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
      matchedAnswer: { id: 'a1', answerText: 'WIN', points: 100, rankOrder: 1 },
      rawAnswer: 'WIN',
      remainingAnswers: [],
      message: 'Steal successful!',
    });

    const matchOver = await matchOverPromise;
    expect(matchOver.winningTeam).toBe('TEAM_1');
    expect(matchOver.team1GrandTotal).toBe(245);
    expect(matchOver.team2GrandTotal).toBe(180);
    expect(matchOver.message).toContain('TEAM 1 WINS THE GAME! (245 vs 180)');

    // Verify Prisma persistence
    await new Promise((r) => setTimeout(r, 200));
    const persistedGame = await prisma.game.findUnique({ where: { id: game.id } });
    expect(persistedGame?.winnerTeam).toBe('TEAM_1');
    expect(persistedGame?.totalPointsAccumulated).toBe(425);
    expect(persistedGame?.status).toBe('COMPLETED');
  });

  it('satisfies Scenario 6: triggers Sudden Death on exact tie and generates sudden death question', async () => {
    const roomCode = 'FEUD-SC06';
    const room = await prisma.room.create({
      data: {
        roomCode,
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'LOBBY',
        players: {
          create: [
            { nickname: 'Alice', team: 'TEAM_1', isConnected: true },
            { nickname: 'Charlie', team: 'TEAM_2', isConnected: true },
          ],
        },
      },
      include: { players: true },
    });

    const game = await prisma.game.create({
      data: {
        roomId: room.id,
        mode: 'MAIN_GAME',
        status: 'IN_PROGRESS',
        currentRound: 3,
      },
    });

    // Scoreboard in Round 3 tied: Team 1: 150, Team 2: 50 + 100
    const scoreboard = initMatchScoreboard(roomCode, game.id, {
      totalRounds: 3,
      team1Initial: 150,
      team2Initial: 50,
    });
    scoreboard.currentRoundNumber = 3;

    initFaceOffSession(roomCode, {
      gameId: game.id,
      roundNumber: 3,
      team1Players: [{ id: room.players[0].id, nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
      team2Players: [{ id: room.players[1].id, nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 }],
      question: {
        id: 'q-r3',
        questionText: 'Question 3',
        answers: [{ id: 'a1', answerText: 'Answer', points: 100, rankOrder: 1 }],
      },
    });

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    await new Promise<void>((res) => {
      hostSocket.emit('join_room', { roomCode, isHost: true }, () => res());
    });

    const suddenDeathPromise = waitForEvent<SuddenDeathInitiatedPayload>(
      hostSocket,
      'sudden_death_initiated'
    );

    // Team 2 wins 100 pts -> EXACT TIE: 150 - 150
    handleStealResolvedBroadcast(testIo, roomCode, {
      roomCode,
      success: true,
      outcome: 'STEAL_SUCCESS',
      winningTeam: 'TEAM_2',
      pointsAwarded: 100,
      roundBank: 100,
      stealingPlayer: { id: room.players[1].id, nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
      matchedAnswer: { id: 'a1', answerText: 'Answer', points: 100, rankOrder: 1 },
      rawAnswer: 'Answer',
      remainingAnswers: [],
      message: 'Steal successful!',
    });

    const sdEvent = await suddenDeathPromise;
    expect(sdEvent.team1GrandTotal).toBe(150);
    expect(sdEvent.team2GrandTotal).toBe(150);
    expect(sdEvent.message).toContain('Sudden Death');

    // Advance to Sudden Death round
    const nextRoundPromise = waitForEvent<NextRoundStartedPayload>(hostSocket, 'next_round_started');
    const ack = await new Promise<any>((res) => {
      hostSocket.emit('advance_next_round', { roomCode }, res);
    });

    expect(ack.success).toBe(true);
    const nextPayload = await nextRoundPromise;
    expect(nextPayload.isSuddenDeath).toBe(true);
    expect(nextPayload.roundNumber).toBe(4);
    // Sudden death question has single #1 answer
    expect(nextPayload.question.answerCount).toBe(1);
  });

  it('satisfies Scenario 5: resets game on request_replay while preserving players and teams', async () => {
    const roomCode = 'FEUD-SC05';
    const room = await prisma.room.create({
      data: {
        roomCode,
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'LOBBY',
        players: {
          create: [
            { nickname: 'Alice', team: 'TEAM_1', isConnected: true },
            { nickname: 'Bob', team: 'TEAM_1', isConnected: true },
            { nickname: 'Charlie', team: 'TEAM_2', isConnected: true },
            { nickname: 'David', team: 'TEAM_2', isConnected: true },
          ],
        },
      },
      include: { players: true },
    });

    const oldGame = await prisma.game.create({
      data: {
        roomId: room.id,
        mode: 'MAIN_GAME',
        status: 'COMPLETED',
        winnerTeam: 'TEAM_1',
        totalPointsAccumulated: 320,
        currentRound: 3,
      },
    });

    const scoreboard = initMatchScoreboard(roomCode, oldGame.id, {
      totalRounds: 3,
      team1Initial: 200,
      team2Initial: 120,
    });
    scoreboard.phase = 'MATCH_OVER';
    scoreboard.matchWinner = 'TEAM_1';

    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    await new Promise<void>((res) => {
      hostSocket.emit('join_room', { roomCode, isHost: true }, () => res());
    });

    const replayedPromise = waitForEvent<any>(hostSocket, 'game_replayed');
    const scoreResetPromise = waitForEvent<ScoreboardUpdatePayload>(hostSocket, 'scoreboard_update');
    const faceOffPromise = waitForEvent<any>(hostSocket, 'face_off_state');

    const ack = await new Promise<any>((res) => {
      hostSocket.emit('request_replay', { roomCode, isHost: true }, res);
    });

    expect(ack.success).toBe(true);
    expect(ack.gameId).not.toBe(oldGame.id);

    const replayed = await replayedPromise;
    expect(replayed.currentRound).toBe(1);
    expect(replayed.gameMode).toBe('MAIN_GAME');

    const scoreReset = await scoreResetPromise;
    expect(scoreReset.team1GrandTotal).toBe(0);
    expect(scoreReset.team2GrandTotal).toBe(0);
    expect(scoreReset.currentRoundNumber).toBe(1);
    expect(scoreReset.phase).toBe('ROUND_IN_PROGRESS');

    const faceOff = await faceOffPromise;
    expect(faceOff.roundNumber).toBe(1);
    expect(faceOff.team1Contender.nickname).toBe('Alice');
    expect(faceOff.team2Contender.nickname).toBe('Charlie');

    // Verify player connections remain preserved in database
    const preservedPlayers = await prisma.player.findMany({ where: { roomId: room.id } });
    expect(preservedPlayers).toHaveLength(4);
  });
});
