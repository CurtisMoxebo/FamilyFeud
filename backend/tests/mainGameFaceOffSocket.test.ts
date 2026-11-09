import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../src/services/db';
import {
  setupSocketServer,
  TeamsAssignedPayload,
  GameStartedPayload,
  RoomStateUpdate,
} from '../src/sockets/lobbyHandler';
import {
  initFaceOffSession,
  getFaceOffSession,
  clearAllFaceOffSessions,
  FaceOffSessionState,
} from '../src/services/faceOffService';
import { handleFaceOffTimeoutBroadcast } from '../src/sockets/mainGameHandler';

describe('US-12: Main Game Face-Off Buzzer Duel WebSocket Integration', () => {
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

  beforeAll(async () => {
    // 1. Create clean test rooms in DB
    await prisma.room.createMany({
      data: [
        {
          roomCode: 'FEUD-FO01',
          roomName: 'Face-Off 4P Main Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-FO02',
          roomName: 'Face-Off Cascade Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-FO03',
          roomName: 'Face-Off Teammate Cascade Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-FO04',
          roomName: 'Face-Off 2P Deadlock Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
      ],
      skipDuplicates: true,
    });

    // 2. Initialize isolated test socket server
    testServer = http.createServer();
    testIo = new SocketIOServer(testServer, {
      cors: { origin: '*' },
    });

    setupSocketServer(testIo, prisma);

    await new Promise<void>((resolve) => {
      testServer.listen(0, () => {
        const addr = testServer.address() as AddressInfo;
        port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    clientSockets.forEach((s) => s.disconnect());
    clientSockets = [];
    clearAllFaceOffSessions();

    await new Promise<void>((resolve) => {
      testIo.close(() => {
        testServer.close(() => resolve());
      });
    });

    // Clean up test data
    await prisma.room.deleteMany({
      where: {
        roomCode: { in: ['FEUD-FO01', 'FEUD-FO02', 'FEUD-FO03', 'FEUD-FO04'] },
      },
    });
  });

  beforeEach(() => {
    clientSockets.forEach((s) => s.disconnect());
    clientSockets = [];
  });

  it('satisfies Scenario 1 & 2: Dual contender readiness, atomic buzzer lockout, rejection, and answer submission', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    const p2Socket = await connectClient(port);
    const p3Socket = await connectClient(port);
    const p4Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket, p2Socket, p3Socket, p4Socket);

    // Host joins
    hostSocket.emit('join_room', { roomCode: 'FEUD-FO01', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    // 4 players join
    p1Socket.emit('join_room', { roomCode: 'FEUD-FO01', nickname: 'Alice', isHost: false });
    await waitForEvent(p1Socket, 'room_state_update');

    p2Socket.emit('join_room', { roomCode: 'FEUD-FO01', nickname: 'Bob', isHost: false });
    await waitForEvent(p2Socket, 'room_state_update');

    p3Socket.emit('join_room', { roomCode: 'FEUD-FO01', nickname: 'Charlie', isHost: false });
    await waitForEvent(p3Socket, 'room_state_update');

    p4Socket.emit('join_room', { roomCode: 'FEUD-FO01', nickname: 'Diana', isHost: false });
    await waitForEvent(p4Socket, 'room_state_update');

    // Prepare listeners for game_started and initial face_off_state
    const gameStartedPromise = waitForEvent<GameStartedPayload>(hostSocket, 'game_started');
    const teamsAssignedPromise = waitForEvent<TeamsAssignedPayload>(p1Socket, 'teams_assigned');
    const faceOffStatePromise = waitForEvent<FaceOffSessionState>(p1Socket, 'face_off_state');

    // Host starts game
    hostSocket.emit('start_game', { roomCode: 'FEUD-FO01' });

    const gameStarted = await gameStartedPromise;
    const teamsAssigned = await teamsAssignedPromise;
    const initialFaceOffState = await faceOffStatePromise;

    expect(gameStarted.gameMode).toBe('MAIN_GAME');
    expect(teamsAssigned.team1).toHaveLength(2);
    expect(teamsAssigned.team2).toHaveLength(2);

    expect(initialFaceOffState.phase).toBe('AWAITING_READY');
    expect(initialFaceOffState.team1Contender).toBeDefined();
    expect(initialFaceOffState.team2Contender).toBeDefined();

    const contender1 = initialFaceOffState.team1Contender;
    const contender2 = initialFaceOffState.team2Contender;
    const c1Socket = [p1Socket, p2Socket, p3Socket, p4Socket].find(
      (s) => (s as any).playerId === contender1.id
    ) || p1Socket;
    const c2Socket = [p1Socket, p2Socket, p3Socket, p4Socket].find(
      (s) => (s as any).playerId === contender2.id
    ) || p2Socket;
    const spectatorSocket = p3Socket;

    // --- Scenario 1: Dual Contender Readiness ---
    // Contender 1 marks ready
    const c1ReadyPromise = waitForEvent<any>(hostSocket, 'contender_ready');
    c1Socket.emit('face_off_ready', {
      roomCode: 'FEUD-FO01',
      playerId: contender1.id,
    });
    const c1ReadyData = await c1ReadyPromise;
    expect(c1ReadyData.bothReady).toBe(false);
    expect(c1ReadyData.waitingForNickname).toBe(contender2.nickname);

    // Contender 2 marks ready (using standard player_ready event)
    const c2ReadyPromise = waitForEvent<any>(hostSocket, 'contender_ready');
    const buzzerActivePromise = waitForEvent<any>(hostSocket, 'buzzer_active');
    c2Socket.emit('player_ready', {
      roomCode: 'FEUD-FO01',
      playerId: contender2.id,
    });
    const c2ReadyData = await c2ReadyPromise;
    expect(c2ReadyData.bothReady).toBe(true);

    const buzzerActiveData = await buzzerActivePromise;
    expect(buzzerActiveData.question).toBeDefined();
    expect(buzzerActiveData.question.questionText).toBeTruthy();

    // Verify session phase is BUZZER_ACTIVE
    const session = getFaceOffSession('FEUD-FO01');
    expect(session?.phase).toBe('BUZZER_ACTIVE');

    // --- Scenario 2: Buzzer Lockout Mechanics ---
    // Non-contender spectator tries to buzz -> rejected
    const nonContenderRejectPromise = waitForEvent<any>(spectatorSocket, 'buzzer_rejected');
    spectatorSocket.emit('press_buzzer', {
      roomCode: 'FEUD-FO01',
      playerId: 'some-spectator-id',
    });
    const rejectData = await nonContenderRejectPromise;
    expect(rejectData.reason).toBe('NOT_A_CONTENDER');

    // Contender 1 presses buzzer -> wins floor
    const buzzerLockedPromise = waitForEvent<any>(hostSocket, 'buzzer_locked');
    c1Socket.emit('press_buzzer', {
      roomCode: 'FEUD-FO01',
      playerId: contender1.id,
    });
    const lockedData = await buzzerLockedPromise;
    expect(lockedData.winnerPlayerId).toBe(contender1.id);
    expect(lockedData.winnerNickname).toBe(contender1.nickname);
    expect(lockedData.duration).toBe(15);
    expect(lockedData.endsAt).toBeGreaterThan(Date.now());

    // Contender 2 presses buzzer -> rejected with BUZZER_LOCKED
    const c2RejectPromise = waitForEvent<any>(c2Socket, 'buzzer_rejected');
    c2Socket.emit('press_buzzer', {
      roomCode: 'FEUD-FO01',
      playerId: contender2.id,
    });
    const c2RejectData = await c2RejectPromise;
    expect(c2RejectData.reason).toBe('BUZZER_LOCKED');

    // Non-active respondent tries to submit answer -> rejected
    const errorPromise = waitForEvent<any>(c2Socket, 'face_off_error');
    c2Socket.emit('submit_face_off_answer', {
      roomCode: 'FEUD-FO01',
      playerId: contender2.id,
      questionId: buzzerActiveData.question.id,
      rawAnswer: 'Apples',
    });
    const errorData = await errorPromise;
    expect(errorData.code).toBe('INVALID_SUBMISSION');

    // Active respondent submits answer -> accepted
    const answerSubmittedPromise = waitForEvent<any>(hostSocket, 'face_off_answer_submitted');
    c1Socket.emit('submit_face_off_answer', {
      roomCode: 'FEUD-FO01',
      playerId: contender1.id,
      questionId: buzzerActiveData.question.id,
      rawAnswer: 'Chocolate',
    });
    const submittedData = await answerSubmittedPromise;
    expect(submittedData.playerId).toBe(contender1.id);
    expect(submittedData.rawAnswer).toBe('Chocolate');

    // Session is resolved and timer stopped
    expect(session?.phase).toBe('RESOLVED');
    expect(session?.isTimerRunning).toBe(false);

    // Verify get_face_off_state snapshot
    const stateSnapshotPromise = new Promise<any>((resolve) => {
      hostSocket.emit('get_face_off_state', { roomCode: 'FEUD-FO01' }, (res: any) => {
        resolve(res);
      });
    });
    const snapshotRes = await stateSnapshotPromise;
    expect(snapshotRes.success).toBe(true);
    expect(snapshotRes.state.phase).toBe('RESOLVED');
  });

  it('satisfies Scenario 3: 15s timeout cascades floor to opponent with fresh timer', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    const p2Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket, p2Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-FO02', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    // Set up mock session directly with short timerDurationSeconds (1s) to test timeout over sockets
    const session = initFaceOffSession('FEUD-FO02', {
      gameId: 'game-fo02',
      roundNumber: 1,
      team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
      team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
      question: {
        id: 'q-fo02',
        questionText: 'Name something in your kitchen',
        answers: [{ id: 'a1', answerText: 'FRIDGE', points: 40, rankOrder: 1 }],
      },
      timerDurationSeconds: 1,
      onTick: (secondsRemaining, endsAt) => {
        testIo.to('room:FEUD-FO02').emit('timer_tick', {
          roomCode: 'FEUD-FO02',
          secondsRemaining,
          endsAt,
        });
      },
      onTimeout: (timeoutResult) => {
        handleFaceOffTimeoutBroadcast(testIo, 'FEUD-FO02', timeoutResult, prisma);
      },
    });

    // Contenders mark ready
    session.markContenderReady('p1');
    session.markContenderReady('p2');

    // Winner buzzes
    session.pressBuzzer('p1');
    expect(session.activeRespondentId).toBe('p1');

    // Wait for timeout broadcast over socket
    const timeoutPromise = waitForEvent<any>(hostSocket, 'face_off_timeout', 3000);
    const timeoutData = await timeoutPromise;

    expect(timeoutData.type).toBe('HAND_OFF');
    expect(timeoutData.timedOutPlayerId).toBe('p1');
    expect(timeoutData.nextPlayerId).toBe('p2');
    expect(timeoutData.nextPlayerTeam).toBe('TEAM_2');
    expect(session.activeRespondentId).toBe('p2');
    expect(session.isTimerRunning).toBe(true);

    // Cleanup session timer
    session.stopTimer();
  });

  it('satisfies Scenario 4: Triggers deadlock reset on dual contender timeout without teammate cascade (US-28)', async () => {
    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-FO03', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    const session = initFaceOffSession('FEUD-FO03', {
      gameId: 'game-fo03',
      roundNumber: 1,
      team1Players: [
        { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
        { id: 'p3', nickname: 'Charlie', team: 'TEAM_1', battingOrder: 2 },
      ],
      team2Players: [
        { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
        { id: 'p4', nickname: 'Diana', team: 'TEAM_2', battingOrder: 2 },
      ],
      question: {
        id: 'q-fo03',
        questionText: 'Name a popular fruit',
        answers: [{ id: 'a1', answerText: 'APPLE', points: 50, rankOrder: 1 }],
      },
      timerDurationSeconds: 1,
      onTimeout: (timeoutResult) => {
        handleFaceOffTimeoutBroadcast(testIo, 'FEUD-FO03', timeoutResult, prisma);
      },
    });

    session.markContenderReady('p1');
    session.markContenderReady('p2');
    session.pressBuzzer('p1');

    // First timeout: p1 -> p2 (HAND_OFF)
    const timeout1Promise = waitForEvent<any>(hostSocket, 'face_off_timeout', 3000);
    const t1 = await timeout1Promise;
    expect(t1.type).toBe('HAND_OFF');
    expect(t1.timedOutPlayerId).toBe('p1');
    expect(t1.nextPlayerId).toBe('p2');

    // Second timeout: p2 times out -> DEADLOCK_RESET (strictly 2 attempts, no teammate cascade)
    const timeout2Promise = waitForEvent<any>(hostSocket, 'face_off_timeout', 3000);
    const t2 = await timeout2Promise;
    expect(t2.type).toBe('DEADLOCK_RESET');
    expect(t2.timedOutPlayerId).toBe('p2');

    session.stopTimer();
  });

  it('satisfies Scenario 5: Deadlock resolution on 2-player match resets with fresh survey question', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    const p2Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket, p2Socket);

    // Host joins
    hostSocket.emit('join_room', { roomCode: 'FEUD-FO04', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    // 2 players join (1 per team)
    p1Socket.emit('join_room', { roomCode: 'FEUD-FO04', nickname: 'PlayerA', isHost: false });
    await waitForEvent(p1Socket, 'room_state_update');

    p2Socket.emit('join_room', { roomCode: 'FEUD-FO04', nickname: 'PlayerB', isHost: false });
    await waitForEvent(p2Socket, 'room_state_update');

    // Start game so Game and Question exist in DB
    const gameStartedPromise = waitForEvent<GameStartedPayload>(hostSocket, 'game_started');
    hostSocket.emit('start_game', { roomCode: 'FEUD-FO04' });
    const gameStarted = await gameStartedPromise;

    const session = getFaceOffSession('FEUD-FO04');
    expect(session).toBeDefined();

    // Reconfigure session timer duration to 1s for fast test execution
    session!.timerDurationSeconds = 1;

    // Both contenders mark ready
    session!.markContenderReady(session!.team1Contender.id);
    session!.markContenderReady(session!.team2Contender.id);

    // First contender buzzes
    session!.pressBuzzer(session!.team1Contender.id);

    // First timeout: winner -> opponent
    const timeout1Promise = waitForEvent<any>(hostSocket, 'face_off_timeout', 3000);
    const t1 = await timeout1Promise;
    expect(t1.type).toBe('HAND_OFF');

    // Second timeout: opponent times out -> DEADLOCK_RESET!
    const deadlockPromise = waitForEvent<any>(hostSocket, 'face_off_timeout', 3000);
    const resetPromise = waitForEvent<any>(hostSocket, 'face_off_reset', 4000);

    const deadlockData = await deadlockPromise;
    expect(deadlockData.type).toBe('DEADLOCK_RESET');
    expect(deadlockData.message).toContain('All contenders timed out');

    const resetData = await resetPromise;
    expect(resetData.roomCode).toBe('FEUD-FO04');
    expect(resetData.newQuestion).toBeDefined();
    expect(resetData.newQuestion.questionText).toBeTruthy();

    // Session has been reset with new question and zero points awarded
    expect(session!.phase).toBe('BUZZER_ACTIVE');
    expect(session!.attemptedPlayerIds).toHaveLength(0);
    expect(session!.buzzerLocked).toBe(false);

    session!.stopTimer();
  });

  it('validates edge cases, invalid payloads, and unknown rooms', async () => {
    const socket = await connectClient(port);
    clientSockets.push(socket);

    // 1. face_off_ready with missing roomCode
    const readyCallbackPromise = new Promise<any>((resolve) => {
      socket.emit('face_off_ready', { roomCode: '', playerId: 'p1' }, (res: any) => resolve(res));
    });
    const readyRes = await readyCallbackPromise;
    expect(readyRes.success).toBe(false);
    expect(readyRes.error).toContain('Missing roomCode');

    // 2. face_off_ready with nonexistent session
    const noSessionReadyPromise = new Promise<any>((resolve) => {
      socket.emit('face_off_ready', { roomCode: 'NO-ROOM', playerId: 'p1' }, (res: any) => resolve(res));
    });
    const noSessionReadyRes = await noSessionReadyPromise;
    expect(noSessionReadyRes.success).toBe(false);

    // 3. press_buzzer with invalid payload
    const buzzInvalidPromise = new Promise<any>((resolve) => {
      socket.emit('press_buzzer', { roomCode: '', playerId: '' }, (res: any) => resolve(res));
    });
    const buzzInvalidRes = await buzzInvalidPromise;
    expect(buzzInvalidRes.accepted).toBe(false);
    expect(buzzInvalidRes.reason).toBe('INVALID_PAYLOAD');

    // 4. press_buzzer with nonexistent session
    const buzzNoSessionPromise = new Promise<any>((resolve) => {
      socket.emit('press_buzzer', { roomCode: 'NO-ROOM', playerId: 'p1' }, (res: any) => resolve(res));
    });
    const buzzNoSessionRes = await buzzNoSessionPromise;
    expect(buzzNoSessionRes.accepted).toBe(false);
    expect(buzzNoSessionRes.reason).toBe('NO_SESSION');

    // 5. submit_face_off_answer with missing rawAnswer
    const submitMissingPromise = new Promise<any>((resolve) => {
      socket.emit('submit_face_off_answer', { roomCode: 'NO-ROOM', playerId: 'p1', rawAnswer: '' }, (res: any) => resolve(res));
    });
    const submitMissingRes = await submitMissingPromise;
    expect(submitMissingRes.success).toBe(false);

    // 6. submit_face_off_answer with nonexistent session
    const submitNoSessionPromise = new Promise<any>((resolve) => {
      socket.emit('submit_face_off_answer', { roomCode: 'NO-ROOM', playerId: 'p1', rawAnswer: 'Ans' }, (res: any) => resolve(res));
    });
    const submitNoSessionRes = await submitNoSessionPromise;
    expect(submitNoSessionRes.success).toBe(false);

    // 7. get_face_off_state with nonexistent session
    const getStateNoSessionPromise = new Promise<any>((resolve) => {
      socket.emit('get_face_off_state', { roomCode: 'NO-ROOM' }, (res: any) => resolve(res));
    });
    const getStateRes = await getStateNoSessionPromise;
    expect(getStateRes.success).toBe(false);
    expect(getStateRes.error).toBe('No active session');

    // 8. get_face_off_state with missing roomCode
    const getStateMissingPromise = new Promise<any>((resolve) => {
      socket.emit('get_face_off_state', { roomCode: '' }, (res: any) => resolve(res));
    });
    const getStateMissingRes = await getStateMissingPromise;
    expect(getStateMissingRes.success).toBe(false);
    expect(getStateMissingRes.error).toBe('Missing roomCode');
  });
});
