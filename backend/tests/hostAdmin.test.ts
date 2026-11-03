import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../src/services/db';
import { setupSocketServer, RoomStateUpdate } from '../src/sockets/lobbyHandler';
import { sessionRecoveryService } from '../src/services/sessionRecoveryService';
import { hostAdminService, ManualOverrideResult } from '../src/services/hostAdminService';
import { initTeamGuessingSession } from '../src/services/teamGuessingService';
import { initFastMoneySession, clearFastMoneyTimer } from '../src/sockets/fastMoneyHandler';
import { AdminErrorPayload } from '../src/sockets/adminHandler';

describe('US-21 Step 1: Host Administrative Controls & Security Suite', () => {
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

  const ADMIN_TEST_CODES = ['FEUD-ADM1', 'FEUD-ADM2', 'FEUD-ADM3', 'FEUD-ADM4'];

  const cleanAdminDb = async () => {
    const rooms = await prisma.room.findMany({
      where: { roomCode: { in: ADMIN_TEST_CODES } },
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
      where: { roomCode: { in: ADMIN_TEST_CODES } },
    });
  };

  beforeAll(async () => {
    testServer = http.createServer();
    testIo = new SocketIOServer(testServer, {
      cors: { origin: '*' },
    });

    setupSocketServer(testIo, prisma);

    await new Promise<void>((resolve) => {
      testServer.listen(0, () => {
        port = (testServer.address() as AddressInfo).port;
        resolve();
      });
    });

    await cleanAdminDb();
  });

  afterAll(async () => {
    clientSockets.forEach((s) => s.disconnect());
    clientSockets = [];
    sessionRecoveryService.clearAllSessions();
    hostAdminService.clearAllAdmin();
    await cleanAdminDb();

    if (testIo) {
      await new Promise<void>((resolve) => testIo.close(() => resolve()));
    }
    if (testServer) {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
  });

  beforeEach(async () => {
    clientSockets.forEach((s) => s.disconnect());
    clientSockets = [];
    sessionRecoveryService.clearAllSessions();
    hostAdminService.clearAllAdmin();
    ADMIN_TEST_CODES.forEach((c) => clearFastMoneyTimer(c));
    await cleanAdminDb();
  });

  describe('Administrative Security & Authorization Checks (DoD requirement)', () => {
    it('rejects host_pause_game from a non-host socket with UNAUTHORIZED error', async () => {
      const roomCode = 'FEUD-ADM1';
      await prisma.room.create({
        data: {
          roomCode,
          roomName: 'Security Test Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'ACTIVE',
        },
      });

      const playerSocket = await connectClient(port);
      clientSockets.push(playerSocket);

      // Join as standard player
      await new Promise<void>((resolve) => {
        playerSocket.emit('join_room', { roomCode, nickname: 'HackerPlayer' }, () => resolve());
      });

      const [errorPayload, callbackRes] = await Promise.all([
        waitForEvent<AdminErrorPayload>(playerSocket, 'admin_error'),
        new Promise<any>((resolve) => {
          playerSocket.emit('host_pause_game', { roomCode }, (res: any) => resolve(res));
        }),
      ]);

      expect(errorPayload.code).toBe('UNAUTHORIZED');
      expect(callbackRes.success).toBe(false);
      expect(callbackRes.error).toContain('host');
    });

    it('rejects host_resume_game from an unauthorized socket', async () => {
      const roomCode = 'FEUD-ADM1';
      const playerSocket = await connectClient(port);
      clientSockets.push(playerSocket);

      const [errorPayload, callbackRes] = await Promise.all([
        waitForEvent<AdminErrorPayload>(playerSocket, 'admin_error'),
        new Promise<any>((resolve) => {
          playerSocket.emit('host_resume_game', { roomCode }, (res: any) => resolve(res));
        }),
      ]);

      expect(errorPayload.code).toBe('UNAUTHORIZED');
      expect(callbackRes.success).toBe(false);
    });

    it('rejects host_override_answer from an unauthorized socket', async () => {
      const roomCode = 'FEUD-ADM1';
      const playerSocket = await connectClient(port);
      clientSockets.push(playerSocket);

      const [errorPayload, callbackRes] = await Promise.all([
        waitForEvent<AdminErrorPayload>(playerSocket, 'admin_error'),
        new Promise<any>((resolve) => {
          playerSocket.emit('host_override_answer', { roomCode, rankOrder: 1 }, (res: any) => resolve(res));
        }),
      ]);

      expect(errorPayload.code).toBe('UNAUTHORIZED');
      expect(callbackRes.success).toBe(false);
    });

    it('rejects host_kick_player from an unauthorized socket', async () => {
      const roomCode = 'FEUD-ADM1';
      const playerSocket = await connectClient(port);
      clientSockets.push(playerSocket);

      const [errorPayload, callbackRes] = await Promise.all([
        waitForEvent<AdminErrorPayload>(playerSocket, 'admin_error'),
        new Promise<any>((resolve) => {
          playerSocket.emit('host_kick_player', { roomCode, playerId: 'target-id' }, (res: any) => resolve(res));
        }),
      ]);

      expect(errorPayload.code).toBe('UNAUTHORIZED');
      expect(callbackRes.success).toBe(false);
    });
  });

  describe('Scenario 3: Kicking an Inactive Player from Lobby', () => {
    it('allows host to kick an unresponsive player, terminating socket and deleting database row', async () => {
      const roomCode = 'FEUD-ADM2';
      const room = await prisma.room.create({
        data: {
          roomCode,
          roomName: 'Kick Test Room',
          language: 'EN',
          gameMode: 'FAST_MONEY',
          status: 'LOBBY',
        },
      });

      // 1. Host joins
      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);
      await new Promise<void>((resolve) => {
        hostSocket.emit('join_room', { roomCode, isHost: true }, () => resolve());
      });

      // 2. Player joins
      const playerSocket = await connectClient(port);
      clientSockets.push(playerSocket);
      let playerId = '';
      await new Promise<void>((resolve) => {
        playerSocket.emit(
          'join_room',
          { roomCode, nickname: 'LazyPlayer' },
          (res: any) => {
            playerId = res.playerId;
            resolve();
          }
        );
      });

      expect(playerId).toBeTruthy();
      const dbPlayerBefore = await prisma.player.findUnique({ where: { id: playerId } });
      expect(dbPlayerBefore).not.toBeNull();

      // Drain any join room_state_update
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 3. Set up listeners for kicked event and roster update
      const kickPromise = waitForEvent<{ roomCode: string; playerId: string; reason: string }>(
        playerSocket,
        'player_kicked'
      );
      const hostRosterPromise = waitForEvent<RoomStateUpdate>(hostSocket, 'room_state_update');

      // 4. Host issues kick
      const kickRes = await new Promise<any>((resolve) => {
        hostSocket.emit('host_kick_player', { roomCode, playerId }, (res: any) => resolve(res));
      });

      expect(kickRes.success).toBe(true);
      expect(kickRes.playerId).toBe(playerId);

      const kickedEvent = await kickPromise;
      expect(kickedEvent.playerId).toBe(playerId);
      expect(kickedEvent.reason).toContain('removed');

      // 5. Verify database row is deleted
      const dbPlayerAfter = await prisma.player.findUnique({ where: { id: playerId } });
      expect(dbPlayerAfter).toBeNull();

      // 6. Verify sessionRecoveryService cleaned up
      expect(sessionRecoveryService.getPlayerSession(playerId)).toBeNull();

      // 7. Verify roster update shows 0 connected players
      const updatedRoster = await hostRosterPromise;
      expect(updatedRoster.players.some((p) => p.id === playerId)).toBe(false);
      expect(updatedRoster.playerCount).toBe(0);
    });

    it('returns error when host attempts to kick a non-existent player', async () => {
      const roomCode = 'FEUD-ADM2';
      await prisma.room.create({
        data: {
          roomCode,
          roomName: 'Kick Non-Existent Room',
          language: 'EN',
          gameMode: 'FAST_MONEY',
          status: 'LOBBY',
        },
      });

      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);
      await new Promise<void>((resolve) => {
        hostSocket.emit('join_room', { roomCode, isHost: true }, () => resolve());
      });

      const kickRes = await new Promise<any>((resolve) => {
        hostSocket.emit('host_kick_player', { roomCode, playerId: 'ghost-player' }, (res: any) => resolve(res));
      });

      expect(kickRes.success).toBe(false);
      expect(kickRes.error).toContain('not found');
    });
  });

  describe('Scenario 1: Pausing and Resuming the Countdown', () => {
    it('freezes Team Guessing timer on host_pause_game and resumes on host_resume_game without time loss', async () => {
      const roomCode = 'FEUD-ADM3';
      await prisma.room.create({
        data: {
          roomCode,
          roomName: 'Pause Team Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
      });

      const hostSocket = await connectClient(port);
      const playerSocket = await connectClient(port);
      clientSockets.push(hostSocket, playerSocket);

      await new Promise<void>((resolve) => {
        hostSocket.emit('join_room', { roomCode, isHost: true }, () => resolve());
      });
      await new Promise<void>((resolve) => {
        playerSocket.emit('join_room', { roomCode, nickname: 'Contender1' }, () => resolve());
      });

      // Initialize team guessing session with 15s timer
      const teamSession = initTeamGuessingSession(roomCode, {
        gameId: 'game-pause-1',
        roundNumber: 1,
        language: 'EN',
        question: {
          id: 'q1',
          questionText: 'Name something in a kitchen',
          answers: [
            { id: 'a1', rankOrder: 1, answerText: 'Refrigerator', points: 40 },
            { id: 'a2', rankOrder: 2, answerText: 'Stove', points: 30 },
          ],
        },
        controllingTeam: 'TEAM_1',
        opposingTeam: 'TEAM_2',
        team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', isConnected: true }],
        team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', isConnected: true }],
      });

      expect(teamSession.isTimerRunning).toBe(true);

      // 1. Host presses Pause
      const playerPausedPromise = waitForEvent<{ roomCode: string; remainingTime: number; pausedByHost: boolean }>(
        playerSocket,
        'game_paused'
      );

      const pauseRes = await new Promise<any>((resolve) => {
        hostSocket.emit('host_pause_game', { roomCode }, (res: any) => resolve(res));
      });

      expect(pauseRes.success).toBe(true);
      expect(pauseRes.remainingTime).toBeGreaterThanOrEqual(14);
      expect(hostAdminService.isRoomPaused(roomCode)).toBe(true);

      const pausedBroadcast = await playerPausedPromise;
      expect(pausedBroadcast.pausedByHost).toBe(true);
      expect(pausedBroadcast.remainingTime).toBe(pauseRes.remainingTime);

      // 2. Host presses Resume
      const playerResumedPromise = waitForEvent<{ roomCode: string; remainingTime: number }>(
        playerSocket,
        'game_resumed'
      );

      const resumeRes = await new Promise<any>((resolve) => {
        hostSocket.emit('host_resume_game', { roomCode }, (res: any) => resolve(res));
      });

      expect(resumeRes.success).toBe(true);
      expect(resumeRes.remainingTime).toBe(pauseRes.remainingTime);
      expect(hostAdminService.isRoomPaused(roomCode)).toBe(false);

      const resumedBroadcast = await playerResumedPromise;
      expect(resumedBroadcast.remainingTime).toBe(pauseRes.remainingTime);

      teamSession.stopTimer();
    });

    it('pauses and resumes Fast Money timers accurately', async () => {
      const roomCode = 'FEUD-ADM4';
      await prisma.room.create({
        data: {
          roomCode,
          roomName: 'Fast Money Pause Room',
          language: 'EN',
          gameMode: 'FAST_MONEY',
          status: 'LOBBY',
        },
      });

      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);
      await new Promise<void>((resolve) => {
        hostSocket.emit('join_room', { roomCode, isHost: true }, () => resolve());
      });

      const fmSession = initFastMoneySession(roomCode, {
        gameId: 'game-fm-pause',
        player1Id: 'fm-p1',
        player2Id: 'fm-p2',
        timerDurationSeconds: 60,
        questions: [
          {
            id: 'q1',
            questionText: 'Name a pizza topping',
            answers: [{ id: 'a1', answerText: 'Pepperoni', points: 50, rankOrder: 1 }],
          },
        ],
      });

      fmSession.startPlayer1Turn('fm-p1');
      // Start timer
      const { startAuthoritativeTimer } = await import('../src/sockets/fastMoneyHandler');
      startAuthoritativeTimer(testIo, fmSession, 1);

      // Host pauses Fast Money
      const pauseRes = await new Promise<any>((resolve) => {
        hostSocket.emit('host_pause_game', { roomCode }, (res: any) => resolve(res));
      });

      expect(pauseRes.success).toBe(true);
      expect(pauseRes.remainingTime).toBeGreaterThanOrEqual(58);

      // Host resumes Fast Money
      const resumeRes = await new Promise<any>((resolve) => {
        hostSocket.emit('host_resume_game', { roomCode }, (res: any) => resolve(res));
      });

      expect(resumeRes.success).toBe(true);
      expect(resumeRes.remainingTime).toBe(pauseRes.remainingTime);

      clearFastMoneyTimer(roomCode);
    });
  });

  describe('Scenario 2: Host Manual Answer Override & Strike Retraction', () => {
    it('accepts answer #1, flips card on host board, credits points, and cancels issued strike', async () => {
      const roomCode = 'FEUD-ADM1';
      await prisma.room.create({
        data: {
          roomCode,
          roomName: 'Override Test Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
      });

      const hostSocket = await connectClient(port);
      const playerSocket = await connectClient(port);
      clientSockets.push(hostSocket, playerSocket);

      await new Promise<void>((resolve) => {
        hostSocket.emit('join_room', { roomCode, isHost: true }, () => resolve());
      });
      await new Promise<void>((resolve) => {
        playerSocket.emit('join_room', { roomCode, nickname: 'Contender' }, () => resolve());
      });

      const teamSession = initTeamGuessingSession(roomCode, {
        gameId: 'game-override-1',
        roundNumber: 1,
        language: 'EN',
        question: {
          id: 'q1',
          questionText: 'Name a popular pet',
          answers: [
            { id: 'a1', rankOrder: 1, answerText: 'Dog', points: 45 },
            { id: 'a2', rankOrder: 2, answerText: 'Cat', points: 35 },
            { id: 'a3', rankOrder: 3, answerText: 'Fish', points: 15 },
          ],
        },
        controllingTeam: 'TEAM_1',
        opposingTeam: 'TEAM_2',
        team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', isConnected: true }],
        team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', isConnected: true }],
      });

      // Simulate a strike issued for an answer that Gemini flagged/rejected (e.g. "Puppy")
      teamSession.strikes = 1;
      expect(teamSession.strikes).toBe(1);
      expect(teamSession.roundBank).toBe(0);

      // Listen for broadcast events
      const boardRevealPromise = waitForEvent<any>(hostSocket, 'board_reveal');
      const strikeCancelledPromise = waitForEvent<{ roomCode: string; strikeCount: number }>(
        playerSocket,
        'strike_cancelled'
      );
      const overrideAckPromise = waitForEvent<any>(playerSocket, 'answer_override_acknowledged');

      // Host clicks "Manual Override" for slot #1 ("Dog", 45 pts)
      const overrideRes: ManualOverrideResult = await new Promise((resolve) => {
        hostSocket.emit(
          'host_override_answer',
          { roomCode, rankOrder: 1 },
          (res: ManualOverrideResult) => resolve(res)
        );
      });

      expect(overrideRes.success).toBe(true);
      expect(overrideRes.rankOrder).toBe(1);
      expect(overrideRes.answerText).toBe('Dog');
      expect(overrideRes.points).toBe(45);
      expect(overrideRes.roundBank).toBe(45);
      expect(overrideRes.strikeCount).toBe(0); // Strike cancelled!

      // Verify board_reveal broadcast
      const boardReveal = await boardRevealPromise;
      expect(boardReveal.rankOrder).toBe(1);
      expect(boardReveal.answerText).toBe('Dog');
      expect(boardReveal.points).toBe(45);

      // Verify strike_cancelled broadcast
      const strikeCancel = await strikeCancelledPromise;
      expect(strikeCancel.strikeCount).toBe(0);

      // Verify answer_override_acknowledged
      const ack = await overrideAckPromise;
      expect(ack.answerText).toBe('Dog');
      expect(ack.pointsAwarded).toBe(45);

      teamSession.stopTimer();
    });

    it('rejects manual override if slot is already revealed or does not exist', async () => {
      const roomCode = 'FEUD-ADM1';
      await prisma.room.create({
        data: {
          roomCode,
          roomName: 'Override Invalid Slot Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
      });

      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);
      await new Promise<void>((resolve) => {
        hostSocket.emit('join_room', { roomCode, isHost: true }, () => resolve());
      });

      // Initialize session so host override can query it
      initTeamGuessingSession(roomCode, {
        gameId: 'game-override-invalid',
        roundNumber: 1,
        language: 'EN',
        question: {
          id: 'q1',
          questionText: 'Name a popular pet',
          answers: [
            { id: 'a1', rankOrder: 1, answerText: 'Dog', points: 45 },
          ],
        },
        controllingTeam: 'TEAM_1',
        opposingTeam: 'TEAM_2',
        team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', isConnected: true }],
        team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', isConnected: true }],
      });

      // Try overriding an invalid rankOrder
      const overrideRes: ManualOverrideResult = await new Promise((resolve) => {
        hostSocket.emit(
          'host_override_answer',
          { roomCode, rankOrder: 99 },
          (res: ManualOverrideResult) => resolve(res)
        );
      });

      expect(overrideRes.success).toBe(false);
      expect(overrideRes.error).toContain('not found');
    });

    it('accepts manual override with custom points and team override', async () => {
      const roomCode = 'FEUD-ADM1';
      await prisma.room.create({
        data: {
          roomCode,
          roomName: 'Custom Override Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
      });

      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);
      await new Promise<void>((resolve) => {
        hostSocket.emit('join_room', { roomCode, isHost: true }, () => resolve());
      });

      initTeamGuessingSession(roomCode, {
        gameId: 'game-override-custom',
        roundNumber: 1,
        language: 'EN',
        question: {
          id: 'q1',
          questionText: 'Name a popular fruit',
          answers: [
            { id: 'a1', rankOrder: 1, answerText: 'Apple', points: 40 },
          ],
        },
        controllingTeam: 'TEAM_1',
        opposingTeam: 'TEAM_2',
        team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', isConnected: true }],
        team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', isConnected: true }],
      });

      const overrideRes: ManualOverrideResult = await new Promise((resolve) => {
        hostSocket.emit(
          'host_override_answer',
          { roomCode, rankOrder: 1, points: 55, teamId: 'TEAM_2' },
          (res: ManualOverrideResult) => resolve(res)
        );
      });

      expect(overrideRes.success).toBe(true);
      expect(overrideRes.points).toBe(55);
      expect(overrideRes.answerText).toBe('Apple');
      expect(overrideRes.isBoardCleared).toBe(true);
    });
  });

  describe('Edge Cases & Missing Parameters Validation', () => {
    it('validates missing roomCode on host_pause_game', async () => {
      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);

      const [err, callbackRes] = await Promise.all([
        waitForEvent<AdminErrorPayload>(hostSocket, 'admin_error'),
        new Promise<any>((resolve) => {
          hostSocket.emit('host_pause_game', {}, (res: any) => resolve(res));
        }),
      ]);

      expect(err.code).toBe('INVALID_ACTION');
      expect(callbackRes.success).toBe(false);
    });

    it('validates missing roomCode on host_resume_game', async () => {
      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);

      const [err, callbackRes] = await Promise.all([
        waitForEvent<AdminErrorPayload>(hostSocket, 'admin_error'),
        new Promise<any>((resolve) => {
          hostSocket.emit('host_resume_game', {}, (res: any) => resolve(res));
        }),
      ]);

      expect(err.code).toBe('INVALID_ACTION');
      expect(callbackRes.success).toBe(false);
    });

    it('validates missing rankOrder or roomCode on host_override_answer', async () => {
      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);

      const [err, callbackRes] = await Promise.all([
        waitForEvent<AdminErrorPayload>(hostSocket, 'admin_error'),
        new Promise<any>((resolve) => {
          hostSocket.emit('host_override_answer', { roomCode: 'ROOM' }, (res: any) => resolve(res));
        }),
      ]);

      expect(err.code).toBe('INVALID_ACTION');
      expect(callbackRes.success).toBe(false);
    });

    it('validates missing playerId or roomCode on host_kick_player', async () => {
      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);

      const [err, callbackRes] = await Promise.all([
        waitForEvent<AdminErrorPayload>(hostSocket, 'admin_error'),
        new Promise<any>((resolve) => {
          hostSocket.emit('host_kick_player', { roomCode: 'ROOM' }, (res: any) => resolve(res));
        }),
      ]);

      expect(err.code).toBe('INVALID_ACTION');
      expect(callbackRes.success).toBe(false);
    });

    it('returns error when host resumes a game that is not paused', async () => {
      const roomCode = 'FEUD-ADM1';
      await prisma.room.create({
        data: {
          roomCode,
          roomName: 'Not Paused Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
      });

      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);
      await new Promise<void>((resolve) => {
        hostSocket.emit('join_room', { roomCode, isHost: true }, () => resolve());
      });

      const resumeRes = await new Promise<any>((resolve) => {
        hostSocket.emit('host_resume_game', { roomCode }, (res: any) => resolve(res));
      });

      expect(resumeRes.success).toBe(false);
      expect(resumeRes.error).toContain('not currently paused');
    });

    it('pauses and resumes Face-Off game timers', async () => {
      const roomCode = 'FEUD-ADM3';
      await prisma.room.create({
        data: {
          roomCode,
          roomName: 'FaceOff Pause Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
      });

      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);
      await new Promise<void>((resolve) => {
        hostSocket.emit('join_room', { roomCode, isHost: true }, () => resolve());
      });

      const { initFaceOffSession } = await import('../src/services/faceOffService');
      const foSession = initFaceOffSession(roomCode, {
        gameId: 'game-fo-pause',
        roundNumber: 1,
        question: {
          id: 'q1',
          questionText: 'Name an animal',
          answers: [{ id: 'a1', rankOrder: 1, answerText: 'Lion', points: 50 }],
        },
        team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', isConnected: true }],
        team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', isConnected: true }],
      });

      foSession.markContenderReady('p1');
      foSession.markContenderReady('p2');
      foSession.pressBuzzer('p1', Date.now()); // Transitions to ANSWERING with 15s timer

      const pauseRes = await new Promise<any>((resolve) => {
        hostSocket.emit('host_pause_game', { roomCode }, (res: any) => resolve(res));
      });

      expect(pauseRes.success).toBe(true);
      expect(hostAdminService.isRoomPaused(roomCode)).toBe(true);
      expect(hostAdminService.getPauseState(roomCode)).not.toBeNull();

      const resumeRes = await new Promise<any>((resolve) => {
        hostSocket.emit('host_resume_game', { roomCode }, (res: any) => resolve(res));
      });

      expect(resumeRes.success).toBe(true);
      expect(hostAdminService.isRoomPaused(roomCode)).toBe(false);

      foSession.stopTimer();
    });

    it('clears admin pause state properly via clearRoomAdmin', () => {
      hostAdminService.clearRoomAdmin('FEUD-CLEAR');
      expect(hostAdminService.getPauseState('FEUD-CLEAR')).toBeNull();
    });
  });
});
