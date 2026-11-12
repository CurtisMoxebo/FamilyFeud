import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../src/services/db';
import { setupSocketServer } from '../src/sockets/lobbyHandler';
import {
  clearAllFaceOffSessions,
} from '../src/services/faceOffService';
import {
  initTeamGuessingSession,
  getTeamGuessingSession,
  clearAllTeamGuessingSessions,
  TeamGuessingQuestion,
  TeamGuessingPlayer,
} from '../src/services/teamGuessingService';
import {
  handleStealResolvedBroadcast,
  SubmitStealGuessPayload,
  StealResolvedPayload,
  RoundWinnerPayload,
  ScoreboardUpdatePayload,
  TransitionStealPhasePayload,
  StrikeIssuedPayload,
} from '../src/sockets/mainGameHandler';

describe('US-15: Main Game 3-Strike Steal Phase & Round Resolution WebSocket Integration', () => {
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

  const mockQuestion: TeamGuessingQuestion = {
    id: 'q-living-room',
    questionText: 'Name something found in a living room',
    orderIndex: 1,
    roundNumber: 1,
    answers: [
      { id: 'ans-1', answerText: 'Sofa / Couch', points: 42, rankOrder: 1 },
      { id: 'ans-2', answerText: 'Television', points: 28, rankOrder: 2 },
      { id: 'ans-3', answerText: 'Coffee Table', points: 18, rankOrder: 3 },
      { id: 'ans-4', answerText: 'Lamp', points: 12, rankOrder: 4 },
    ],
  };

  const team1Players: TeamGuessingPlayer[] = [
    { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
    { id: 'p2', nickname: 'Bob', team: 'TEAM_1', battingOrder: 2 },
    { id: 'p3', nickname: 'Charlie', team: 'TEAM_1', battingOrder: 3 },
  ];

  const team2Players: TeamGuessingPlayer[] = [
    { id: 'p4', nickname: 'David', team: 'TEAM_2', battingOrder: 1 },
    { id: 'p5', nickname: 'Eve', team: 'TEAM_2', battingOrder: 2 },
    { id: 'p6', nickname: 'Frank', team: 'TEAM_2', battingOrder: 3 },
  ];

  const testRooms = [
    'FEUD-S15A',
    'FEUD-S15B',
    'FEUD-S15C',
    'FEUD-S15D',
    'FEUD-S15E',
    'FEUD-S15F',
  ];

  beforeAll(async () => {
    await prisma.room.createMany({
      data: testRooms.map((code) => ({
        roomCode: code,
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'LOBBY',
      })),
      skipDuplicates: true,
    });

    testServer = http.createServer();
    testIo = new SocketIOServer(testServer, { cors: { origin: '*' } });
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
    clientSockets = [];

    await new Promise<void>((resolve) => {
      testIo.close(() => {
        testServer.close(() => resolve());
      });
    });

    await prisma.room.deleteMany({
      where: {
        roomCode: { in: testRooms },
      },
    });

    clearAllFaceOffSessions();
    clearAllTeamGuessingSessions();
  });

  beforeEach(() => {
    for (const socket of clientSockets) {
      if (socket.connected) socket.disconnect();
    }
    clientSockets = [];
    clearAllFaceOffSessions();
    clearAllTeamGuessingSessions();
  });

  /* -------------------------------------------------------------
   * 1. Scenario 1: Successful Steal Takes All Round Points
   * ------------------------------------------------------------- */
  it('satisfies Scenario 1: Successful Steal flips card, transfers entire round bank to opposing team, and emits round_winner', async () => {
    const hostSocket = await connectClient(port);
    const spokespersonSocket = await connectClient(port);
    clientSockets.push(hostSocket, spokespersonSocket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S15A', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    spokespersonSocket.emit('join_room', {
      roomCode: 'FEUD-S15A',
      nickname: 'David',
      playerId: 'p4',
    });
    await waitForEvent(spokespersonSocket, 'room_state_update');

    // Controlling Team 1 reached 3 strikes, leaving 'Lamp' unrevealed, bank is 70 pts
    const session = initTeamGuessingSession('FEUD-S15A', {
      gameId: 'game-1',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      team1Players,
      team2Players,
      question: mockQuestion,
      initialRevealedAnswers: [
        { id: 'ans-1', answerText: 'Sofa / Couch', points: 42, rankOrder: 1 },
        { id: 'ans-2', answerText: 'Television', points: 28, rankOrder: 2 },
      ],
      initialBank: 70,
      stealSpokespersonId: 'p4',
      autoStartStealTimer: false,
    });
    session.phase = 'STEAL_PHASE';
    session.strikes = 3;

    const boardRevealPromise = waitForEvent<any>(hostSocket, 'board_reveal');
    const stealResolvedPromise = waitForEvent<StealResolvedPayload>(hostSocket, 'steal_resolved');
    const roundWinnerPromise = waitForEvent<RoundWinnerPayload>(hostSocket, 'round_winner');
    const scoreUpdatePromise = waitForEvent<ScoreboardUpdatePayload>(hostSocket, 'scoreboard_update');
    const statePromise = waitForEvent<any>(hostSocket, 'team_guessing_state');
    const remainingRevealPromise = waitForEvent<any>(hostSocket, 'remaining_answers_reveal');

    // David (p4, Team 2 spokesperson) submits valid unrevealed answer "Lamp"
    spokespersonSocket.emit('submit_steal_guess', {
      roomCode: 'FEUD-S15A',
      playerId: 'p4',
      rawAnswer: 'Lamp',
    });

    const boardReveal = await boardRevealPromise;
    expect(boardReveal.answerText).toBe('Lamp');
    expect(boardReveal.points).toBe(12);
    expect(boardReveal.rankOrder).toBe(4);
    expect(boardReveal.isStealMatch).toBe(true);
    expect(boardReveal.playerTeam).toBe('TEAM_2');

    const stealResolved = await stealResolvedPromise;
    expect(stealResolved.success).toBe(true);
    expect(stealResolved.outcome).toBe('STEAL_SUCCESS');
    expect(stealResolved.winningTeam).toBe('TEAM_2');
    expect(stealResolved.pointsAwarded).toBe(70);
    expect(stealResolved.stealingPlayer.id).toBe('p4');
    expect(stealResolved.matchedAnswer?.answerText).toBe('Lamp');
    expect(stealResolved.remainingAnswers).toHaveLength(1);
    expect(stealResolved.remainingAnswers[0].answerText).toBe('Coffee Table');

    const remainingReveal = await remainingRevealPromise;
    expect(remainingReveal.remainingAnswers).toHaveLength(1);
    expect(remainingReveal.remainingAnswers[0].answerText).toBe('Coffee Table');

    const roundWinner = await roundWinnerPromise;
    expect(roundWinner.winningTeam).toBe('TEAM_2');
    expect(roundWinner.pointsAwarded).toBe(70);

    const scoreUpdate = await scoreUpdatePromise;
    expect(scoreUpdate.activeRoundBank).toBe(0);
    expect(scoreUpdate.winningTeam).toBe('TEAM_2');
    expect(scoreUpdate.pointsAwarded).toBe(70);

    const state = await statePromise;
    expect(state.phase).toBe('RESOLVED');
    expect(state.winningTeam).toBe('TEAM_2');
  });

  /* -------------------------------------------------------------
   * 2. Scenario 2: Failed Steal Retains Points for Original Team
   * ------------------------------------------------------------- */
  it('satisfies Scenario 2: Failed Steal sounds strike buzzer, awards points to original controlling team, and reveals remaining answers', async () => {
    const hostSocket = await connectClient(port);
    const spokespersonSocket = await connectClient(port);
    clientSockets.push(hostSocket, spokespersonSocket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S15B', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    spokespersonSocket.emit('join_room', {
      roomCode: 'FEUD-S15B',
      nickname: 'David',
      playerId: 'p4',
    });
    await waitForEvent(spokespersonSocket, 'room_state_update');

    const session = initTeamGuessingSession('FEUD-S15B', {
      gameId: 'game-1',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      team1Players,
      team2Players,
      question: mockQuestion,
      initialRevealedAnswers: [
        { id: 'ans-1', answerText: 'Sofa / Couch', points: 42, rankOrder: 1 },
      ],
      initialBank: 42,
      stealSpokespersonId: 'p4',
      autoStartStealTimer: false,
    });
    session.phase = 'STEAL_PHASE';
    session.strikes = 3;

    const strikePromise = waitForEvent<StrikeIssuedPayload>(hostSocket, 'strike_issued');
    const stealResolvedPromise = waitForEvent<StealResolvedPayload>(hostSocket, 'steal_resolved');
    const roundWinnerPromise = waitForEvent<RoundWinnerPayload>(hostSocket, 'round_winner');
    const scoreUpdatePromise = waitForEvent<ScoreboardUpdatePayload>(hostSocket, 'scoreboard_update');
    const remainingRevealPromise = waitForEvent<any>(hostSocket, 'remaining_answers_reveal');

    // David submits wrong answer "Saxophone"
    spokespersonSocket.emit('submit_steal_guess', {
      roomCode: 'FEUD-S15B',
      playerId: 'p4',
      rawAnswer: 'Saxophone',
    });

    const strike = await strikePromise;
    expect(strike.team).toBe('TEAM_2');
    expect(strike.player?.id).toBe('p4');
    expect(strike.rawAnswer).toBe('Saxophone');

    const stealResolved = await stealResolvedPromise;
    expect(stealResolved.success).toBe(false);
    expect(stealResolved.outcome).toBe('STEAL_FAILED');
    expect(stealResolved.winningTeam).toBe('TEAM_1');
    expect(stealResolved.pointsAwarded).toBe(42);
    expect(stealResolved.remainingAnswers).toHaveLength(3); // TV, Coffee Table, Lamp

    const remainingReveal = await remainingRevealPromise;
    expect(remainingReveal.remainingAnswers).toHaveLength(3);

    const roundWinner = await roundWinnerPromise;
    expect(roundWinner.winningTeam).toBe('TEAM_1');
    expect(roundWinner.pointsAwarded).toBe(42);

    const scoreUpdate = await scoreUpdatePromise;
    expect(scoreUpdate.activeRoundBank).toBe(0);
    expect(scoreUpdate.winningTeam).toBe('TEAM_1');
    expect(scoreUpdate.pointsAwarded).toBe(42);
  });

  /* -------------------------------------------------------------
   * 3. Scenario 2b: Duplicate Answer Fails Steal Immediately
   * ------------------------------------------------------------- */
  it('satisfies Scenario 2: Submitting an already revealed answer fails steal and retains bank for original team', async () => {
    const hostSocket = await connectClient(port);
    const spokespersonSocket = await connectClient(port);
    clientSockets.push(hostSocket, spokespersonSocket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S15C', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    spokespersonSocket.emit('join_room', {
      roomCode: 'FEUD-S15C',
      nickname: 'David',
      playerId: 'p4',
    });
    await waitForEvent(spokespersonSocket, 'room_state_update');

    const session = initTeamGuessingSession('FEUD-S15C', {
      gameId: 'game-1',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      team1Players,
      team2Players,
      question: mockQuestion,
      initialRevealedAnswers: [
        { id: 'ans-1', answerText: 'Sofa / Couch', points: 42, rankOrder: 1 },
      ],
      initialBank: 42,
      stealSpokespersonId: 'p4',
      autoStartStealTimer: false,
    });
    session.phase = 'STEAL_PHASE';
    session.strikes = 3;

    const stealResolvedPromise = waitForEvent<StealResolvedPayload>(hostSocket, 'steal_resolved');
    const roundWinnerPromise = waitForEvent<RoundWinnerPayload>(hostSocket, 'round_winner');

    // Submits "Sofa / Couch" which is already revealed
    spokespersonSocket.emit('submit_steal_guess', {
      roomCode: 'FEUD-S15C',
      playerId: 'p4',
      rawAnswer: 'Sofa / Couch',
    });

    const stealResolved = await stealResolvedPromise;
    expect(stealResolved.success).toBe(false);
    expect(stealResolved.outcome).toBe('STEAL_FAILED');
    expect(stealResolved.winningTeam).toBe('TEAM_1');

    const roundWinner = await roundWinnerPromise;
    expect(roundWinner.winningTeam).toBe('TEAM_1');
    expect(roundWinner.pointsAwarded).toBe(42);
  });

  /* -------------------------------------------------------------
   * 4. Scenario 2c: Steal Timeout Cascade (15s Expiration)
   * ------------------------------------------------------------- */
  it('satisfies Scenario 2: Steal phase 15s timeout awards bank to original team and flips remaining cards', async () => {
    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S15D', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    const session = initTeamGuessingSession('FEUD-S15D', {
      gameId: 'game-1',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      team1Players,
      team2Players,
      question: mockQuestion,
      initialRevealedAnswers: [
        { id: 'ans-1', answerText: 'Sofa / Couch', points: 42, rankOrder: 1 },
      ],
      initialBank: 42,
      stealSpokespersonId: 'p4',
      autoStartStealTimer: false,
    });
    session.phase = 'STEAL_PHASE';
    session.strikes = 3;

    const strikePromise = waitForEvent<StrikeIssuedPayload>(hostSocket, 'strike_issued');
    const stealResolvedPromise = waitForEvent<StealResolvedPayload>(hostSocket, 'steal_resolved');
    const roundWinnerPromise = waitForEvent<RoundWinnerPayload>(hostSocket, 'round_winner');
    const remainingRevealPromise = waitForEvent<any>(hostSocket, 'remaining_answers_reveal');

    // Simulate 15s timeout
    const timeoutResult = session.handleStealTimeout();
    handleStealResolvedBroadcast(testIo, 'FEUD-S15D', timeoutResult);

    const strike = await strikePromise;
    expect(strike.isTimeout).toBe(true);

    const stealResolved = await stealResolvedPromise;
    expect(stealResolved.success).toBe(false);
    expect(stealResolved.outcome).toBe('STEAL_TIMEOUT');
    expect(stealResolved.winningTeam).toBe('TEAM_1');
    expect(stealResolved.pointsAwarded).toBe(42);

    const remainingReveal = await remainingRevealPromise;
    expect(remainingReveal.remainingAnswers).toHaveLength(3);

    const roundWinner = await roundWinnerPromise;
    expect(roundWinner.winningTeam).toBe('TEAM_1');
  });

  /* -------------------------------------------------------------
   * 5. Scenario 4: Spokesperson Enforcement & Non-Spokesperson Rejection
   * ------------------------------------------------------------- */
  it('satisfies Scenario 4: Rejects steal guess from non-spokesperson teammate or controlling team member', async () => {
    const eveSocket = await connectClient(port);
    const aliceSocket = await connectClient(port);
    clientSockets.push(eveSocket, aliceSocket);

    eveSocket.emit('join_room', { roomCode: 'FEUD-S15E', nickname: 'Eve', playerId: 'p5' });
    await waitForEvent(eveSocket, 'room_state_update');

    aliceSocket.emit('join_room', { roomCode: 'FEUD-S15E', nickname: 'Alice', playerId: 'p1' });
    await waitForEvent(aliceSocket, 'room_state_update');

    const session = initTeamGuessingSession('FEUD-S15E', {
      gameId: 'game-1',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      team1Players,
      team2Players,
      question: mockQuestion,
      initialBank: 50,
      stealSpokespersonId: 'p4', // David is spokesperson
      autoStartStealTimer: false,
    });
    session.phase = 'STEAL_PHASE';
    session.strikes = 3;

    // Eve (p5, non-spokesperson on stealing team) attempts to submit
    const eveErrorPromise = waitForEvent<any>(eveSocket, 'steal_error');
    eveSocket.emit('submit_steal_guess', {
      roomCode: 'FEUD-S15E',
      playerId: 'p5',
      rawAnswer: 'Coffee Table',
    });

    const eveError = await eveErrorPromise;
    expect(eveError.code).toBe('NOT_SPOKESPERSON');
    expect(session.phase).toBe('STEAL_PHASE'); // Phase remains STEAL_PHASE

    // Alice (p1, member of controlling team) attempts to submit
    const aliceErrorPromise = waitForEvent<any>(aliceSocket, 'steal_error');
    aliceSocket.emit('submit_steal_guess', {
      roomCode: 'FEUD-S15E',
      playerId: 'p1',
      rawAnswer: 'Lamp',
    });

    const aliceError = await aliceErrorPromise;
    expect(aliceError.code).toBe('NOT_SPOKESPERSON');

    // Empty submission by spokesperson
    const spokespersonSocket = await connectClient(port);
    clientSockets.push(spokespersonSocket);
    spokespersonSocket.emit('join_room', {
      roomCode: 'FEUD-S15E',
      nickname: 'David',
      playerId: 'p4',
    });
    await waitForEvent(spokespersonSocket, 'room_state_update');

    const callbackPromise = new Promise<any>((resolve) => {
      spokespersonSocket.emit(
        'submit_steal_guess',
        { roomCode: 'FEUD-S15E', playerId: 'p4', rawAnswer: '   ' },
        (res: any) => resolve(res)
      );
    });

    const cbRes = await callbackPromise;
    expect(cbRes.success).toBe(false);
  });

  /* -------------------------------------------------------------
   * 6. Full Transition Flow: 3rd Strike -> Transition -> Steal Resolution
   * ------------------------------------------------------------- */
  it('satisfies end-to-end flow: 3rd strike triggers transition_steal_phase with spokesperson, state query, and successful steal', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    const p4Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket, p4Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S15F', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    p1Socket.emit('join_room', { roomCode: 'FEUD-S15F', nickname: 'Alice', playerId: 'p1' });
    await waitForEvent(p1Socket, 'room_state_update');

    p4Socket.emit('join_room', { roomCode: 'FEUD-S15F', nickname: 'David', playerId: 'p4' });
    await waitForEvent(p4Socket, 'room_state_update');

    const session = initTeamGuessingSession('FEUD-S15F', {
      gameId: 'game-1',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      team1Players,
      team2Players,
      question: mockQuestion,
      initialBank: 50,
      stealSpokespersonId: 'p4',
      startPlayerId: 'p1',
      autoStartStealTimer: false,
    });
    session.strikes = 2; // Team 1 is at 2 strikes

    const transitionPromise = waitForEvent<TransitionStealPhasePayload>(
      p4Socket,
      'transition_steal_phase'
    );

    // Alice misses -> 3rd strike
    p1Socket.emit('submit_team_guess', {
      roomCode: 'FEUD-S15F',
      playerId: 'p1',
      rawAnswer: 'Bicycle',
    });

    const transition = await transitionPromise;
    expect(transition.roomCode).toBe('FEUD-S15F');
    expect(transition.controllingTeam).toBe('TEAM_1');
    expect(transition.opposingTeam).toBe('TEAM_2');
    expect(transition.spokesperson?.id).toBe('p4');
    expect(transition.spokesperson?.nickname).toBe('David');
    expect(transition.duration).toBe(15);

    // David queries steal state
    const stateQueryPromise = new Promise<any>((resolve) => {
      p4Socket.emit('get_steal_state', { roomCode: 'FEUD-S15F' }, (res: any) => resolve(res));
    });

    const stateQuery = await stateQueryPromise;
    expect(stateQuery.success).toBe(true);
    expect(stateQuery.state.phase).toBe('STEAL_PHASE');
    expect(stateQuery.state.stealSpokesperson.id).toBe('p4');

    // David submits winning steal answer
    const stealWinPromise = waitForEvent<StealResolvedPayload>(hostSocket, 'steal_resolved');
    p4Socket.emit('submit_steal_guess', {
      roomCode: 'FEUD-S15F',
      playerId: 'p4',
      rawAnswer: 'Coffee Table',
    });

    const stealWin = await stealWinPromise;
    expect(stealWin.success).toBe(true);
    expect(stealWin.winningTeam).toBe('TEAM_2');
    expect(stealWin.pointsAwarded).toBe(50);
  });
});

