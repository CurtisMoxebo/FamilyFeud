import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../src/services/db';
import { setupSocketServer } from '../src/sockets/lobbyHandler';
import {
  initFaceOffSession,
  clearAllFaceOffSessions,
  FaceOffQuestion,
  FaceOffPlayer,
} from '../src/services/faceOffService';
import {
  initTeamGuessingSession,
  getTeamGuessingSession,
  clearAllTeamGuessingSessions,
  TeamGuessingQuestion,
  TeamGuessingPlayer,
} from '../src/services/teamGuessingService';
import {
  handleTeamGuessingTimeoutBroadcast,
  broadcastTeamGuessingState,
  SubmitTeamGuessPayload,
  PassTeamTurnPayload,
  StrikeIssuedPayload,
  RoundClearedPayload,
  TransitionStealPhasePayload,
  TeamTurnStartedPayload,
} from '../src/sockets/mainGameHandler';

describe('US-14: Main Game Team Guessing Turn, Board Flips & 3-Strike System WebSocket Integration', () => {
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

  beforeAll(async () => {
    await prisma.room.createMany({
      data: [
        {
          roomCode: 'FEUD-S14A',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-S14B',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-S14C',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-S14D',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-S14E',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
      ],
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
        roomCode: {
          in: ['FEUD-S14A', 'FEUD-S14B', 'FEUD-S14C', 'FEUD-S14D', 'FEUD-S14E'],
        },
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
   * 1. Handoff from Face-Off Pass/Play into Team Guessing
   * ------------------------------------------------------------- */
  it('initializes TeamGuessingSession upon choose_play_pass and starts Player 2 turn', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S14A', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    p1Socket.emit('join_room', { roomCode: 'FEUD-S14A', nickname: 'Alice', playerId: 'p1' });
    await waitForEvent(p1Socket, 'room_state_update');

    // Setup Face-Off Session in PASS_OR_PLAY phase with card 1 revealed
    const foSession = initFaceOffSession('FEUD-S14A', {
      gameId: 'game-1',
      roundNumber: 1,
      team1Players,
      team2Players,
      question: mockQuestion,
    });
    foSession.phase = 'PASS_OR_PLAY';
    foSession['winnerPlayerId'] = 'p1';
    foSession['winnerNickname'] = 'Alice';
    foSession['winnerTeam'] = 'TEAM_1';
    foSession.revealedAnswers = [
      {
        id: 'ans-1',
        answerText: 'Sofa / Couch',
        points: 42,
        rankOrder: 1,
        revealedByPlayerId: 'p1',
        revealedByNickname: 'Alice',
        revealedByTeam: 'TEAM_1',
      },
    ];

    const turnStartedPromise = waitForEvent<TeamTurnStartedPayload>(hostSocket, 'team_turn_started');
    const teamStatePromise = waitForEvent<any>(hostSocket, 'team_guessing_state');

    // Alice chooses PLAY
    p1Socket.emit('choose_play_pass', {
      roomCode: 'FEUD-S14A',
      playerId: 'p1',
      decision: 'play',
    });

    const turnStarted = await turnStartedPromise;
    expect(turnStarted.roomCode).toBe('FEUD-S14A');
    expect(turnStarted.activePlayer?.id).toBe('p2'); // Player 2 (Bob) starts
    expect(turnStarted.activePlayer?.nickname).toBe('Bob');
    expect(turnStarted.duration).toBe(15);

    const teamState = await teamStatePromise;
    expect(teamState.phase).toBe('TEAM_GUESSING');
    expect(teamState.controllingTeam).toBe('TEAM_1');
    expect(teamState.roundBank).toBe(42);
    expect(teamState.revealedAnswers).toHaveLength(1);
    expect(teamState.activePlayer.id).toBe('p2');

    const createdSession = getTeamGuessingSession('FEUD-S14A');
    expect(createdSession).toBeDefined();
    expect(createdSession?.activePlayer.id).toBe('p2');
  });

  /* -------------------------------------------------------------
   * 2. Scenario 1: Correct Guess Flips Card and Increments Bank
   * ------------------------------------------------------------- */
  it('satisfies Scenario 1: Correct Guess emits board_reveal, increments bank, and advances to next teammate', async () => {
    const hostSocket = await connectClient(port);
    const p2Socket = await connectClient(port);
    clientSockets.push(hostSocket, p2Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S14B', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    p2Socket.emit('join_room', { roomCode: 'FEUD-S14B', nickname: 'Bob', playerId: 'p2' });
    await waitForEvent(p2Socket, 'room_state_update');

    // Initialize team guessing directly
    initTeamGuessingSession('FEUD-S14B', {
      gameId: 'game-1',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      team1Players,
      team2Players,
      question: mockQuestion,
      startPlayerId: 'p2',
    });

    const boardRevealPromise = waitForEvent<any>(hostSocket, 'board_reveal');
    const scoreUpdatePromise = waitForEvent<any>(hostSocket, 'scoreboard_update');
    const guessResultPromise = waitForEvent<any>(hostSocket, 'team_guess_result');
    const turnStartedPromise = waitForEvent<any>(hostSocket, 'team_turn_started');

    // Bob submits "Coffee Table" (18 pts, rank 3)
    p2Socket.emit('submit_team_guess', {
      roomCode: 'FEUD-S14B',
      playerId: 'p2',
      rawAnswer: 'Coffee Table',
    });

    const boardReveal = await boardRevealPromise;
    expect(boardReveal.rankOrder).toBe(3);
    expect(boardReveal.answerText).toBe('Coffee Table');
    expect(boardReveal.points).toBe(18);
    expect(boardReveal.roundBank).toBe(18);

    const scoreUpdate = await scoreUpdatePromise;
    expect(scoreUpdate.activeRoundBank).toBe(18);

    const guessResult = await guessResultPromise;
    expect(guessResult.outcome).toBe('CORRECT_GUESS');
    expect(guessResult.roundBank).toBe(18);
    expect(guessResult.isStrike).toBe(false);

    const nextTurn = await turnStartedPromise;
    expect(nextTurn.activePlayer.id).toBe('p3'); // Rotates to Charlie
    expect(nextTurn.activePlayer.nickname).toBe('Charlie');
  });

  /* -------------------------------------------------------------
   * 3. Scenario 2: Incorrect Guess Triggers Strike
   * ------------------------------------------------------------- */
  it('satisfies Scenario 2: Incorrect guess emits strike_issued and advances turn', async () => {
    const hostSocket = await connectClient(port);
    const p2Socket = await connectClient(port);
    clientSockets.push(hostSocket, p2Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S14C', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    p2Socket.emit('join_room', { roomCode: 'FEUD-S14C', nickname: 'Bob', playerId: 'p2' });
    await waitForEvent(p2Socket, 'room_state_update');

    initTeamGuessingSession('FEUD-S14C', {
      gameId: 'game-1',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      team1Players,
      team2Players,
      question: mockQuestion,
      startPlayerId: 'p2',
    });

    const strikePromise = waitForEvent<StrikeIssuedPayload>(hostSocket, 'strike_issued');
    const guessResultPromise = waitForEvent<any>(hostSocket, 'team_guess_result');
    const turnStartedPromise = waitForEvent<any>(hostSocket, 'team_turn_started');

    // Bob submits incorrect answer "Elephant"
    p2Socket.emit('submit_team_guess', {
      roomCode: 'FEUD-S14C',
      playerId: 'p2',
      rawAnswer: 'Elephant',
    });

    const strikeData = await strikePromise;
    expect(strikeData.team).toBe('TEAM_1');
    expect(strikeData.strikeCount).toBe(1);
    expect(strikeData.maxStrikes).toBe(3);
    expect(strikeData.rawAnswer).toBe('Elephant');

    const guessResult = await guessResultPromise;
    expect(guessResult.outcome).toBe('STRIKE');
    expect(guessResult.strikeCount).toBe(1);

    const nextTurn = await turnStartedPromise;
    expect(nextTurn.activePlayer.id).toBe('p3'); // Rotates to Charlie
  });

  /* -------------------------------------------------------------
   * 4. Scenario 3: Clearing the Entire Board Wins the Round (100 Points)
   * ------------------------------------------------------------- */
  it('satisfies Scenario 3: Clearing the entire board emits round_cleared immediately', async () => {
    const hostSocket = await connectClient(port);
    const p2Socket = await connectClient(port);
    clientSockets.push(hostSocket, p2Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S14D', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    p2Socket.emit('join_room', { roomCode: 'FEUD-S14D', nickname: 'Bob', playerId: 'p2' });
    await waitForEvent(p2Socket, 'room_state_update');

    // 3 of 4 answers already revealed (88 points in bank)
    initTeamGuessingSession('FEUD-S14D', {
      gameId: 'game-1',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      team1Players,
      team2Players,
      question: mockQuestion,
      startPlayerId: 'p2',
      initialRevealedAnswers: [
        { id: 'ans-1', answerText: 'Sofa / Couch', points: 42, rankOrder: 1 },
        { id: 'ans-2', answerText: 'Television', points: 28, rankOrder: 2 },
        { id: 'ans-3', answerText: 'Coffee Table', points: 18, rankOrder: 3 },
      ],
      initialBank: 88,
    });

    const boardRevealPromise = waitForEvent<any>(hostSocket, 'board_reveal');
    const roundClearedPromise = waitForEvent<RoundClearedPayload>(hostSocket, 'round_cleared');
    const guessResultPromise = waitForEvent<any>(hostSocket, 'team_guess_result');

    // Bob guesses the final card "Lamp" (12 pts)
    p2Socket.emit('submit_team_guess', {
      roomCode: 'FEUD-S14D',
      playerId: 'p2',
      rawAnswer: 'Lamp',
    });

    const boardReveal = await boardRevealPromise;
    expect(boardReveal.answerText).toBe('Lamp');
    expect(boardReveal.isAllRevealed).toBe(true);

    const roundCleared = await roundClearedPromise;
    expect(roundCleared.winningTeam).toBe('TEAM_1');
    expect(roundCleared.totalRoundPoints).toBe(100);

    const guessResult = await guessResultPromise;
    expect(guessResult.outcome).toBe('ROUND_CLEARED');
  });

  /* -------------------------------------------------------------
   * 5. Scenario 4: Accumulating 3 Strikes Triggers Steal Phase
   * ------------------------------------------------------------- */
  it('satisfies Scenario 4: 3 strikes transitions state to transition_steal_phase', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S14E', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    p1Socket.emit('join_room', { roomCode: 'FEUD-S14E', nickname: 'Alice', playerId: 'p1' });
    await waitForEvent(p1Socket, 'room_state_update');

    const session = initTeamGuessingSession('FEUD-S14E', {
      gameId: 'game-1',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      team1Players,
      team2Players,
      question: mockQuestion,
      startPlayerId: 'p1',
      initialBank: 42,
    });

    // Manually set 2 strikes
    session.strikes = 2;

    const strikePromise = waitForEvent<StrikeIssuedPayload>(hostSocket, 'strike_issued');
    const stealPhasePromise = waitForEvent<TransitionStealPhasePayload>(hostSocket, 'transition_steal_phase');
    const guessResultPromise = waitForEvent<any>(hostSocket, 'team_guess_result');

    // Alice submits 3rd wrong answer
    p1Socket.emit('submit_team_guess', {
      roomCode: 'FEUD-S14E',
      playerId: 'p1',
      rawAnswer: 'Wrong Answer 3',
    });

    const strikeData = await strikePromise;
    expect(strikeData.strikeCount).toBe(3);

    const stealData = await stealPhasePromise;
    expect(stealData.controllingTeam).toBe('TEAM_1');
    expect(stealData.opposingTeam).toBe('TEAM_2');
    expect(stealData.roundBank).toBe(42);
    expect(stealData.reason).toBe('THREE_STRIKES');

    const guessResult = await guessResultPromise;
    expect(guessResult.outcome).toBe('STEAL_PHASE_TRIGGERED');
    expect(session.phase).toBe('STEAL_PHASE');
  });

  /* -------------------------------------------------------------
   * 6. Voluntary Pass, State Snapshots & Error Guards
   * ------------------------------------------------------------- */
  it('handles voluntary pass, get_team_guessing_state, and error conditions', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S14A', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    p1Socket.emit('join_room', { roomCode: 'FEUD-S14A', nickname: 'Alice', playerId: 'p1' });
    await waitForEvent(p1Socket, 'room_state_update');

    const session = initTeamGuessingSession('FEUD-S14A', {
      gameId: 'game-1',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      team1Players,
      team2Players,
      question: mockQuestion,
      startPlayerId: 'p1',
    });

    // 1. Fetch state via get_team_guessing_state
    const statePromise = new Promise<any>((resolve) => {
      hostSocket.emit('get_team_guessing_state', { roomCode: 'FEUD-S14A' }, (res: any) => resolve(res));
    });
    const stateRes = await statePromise;
    expect(stateRes.success).toBe(true);
    expect(stateRes.state.controllingTeam).toBe('TEAM_1');
    expect(stateRes.state.activePlayer.id).toBe('p1');

    // 2. Pass turn voluntarily
    const strikePromise = waitForEvent<StrikeIssuedPayload>(hostSocket, 'strike_issued');
    const passPromise = new Promise<any>((resolve) => {
      p1Socket.emit('pass_team_turn', { roomCode: 'FEUD-S14A', playerId: 'p1' }, (res: any) => resolve(res));
    });

    const passRes = await passPromise;
    expect(passRes.success).toBe(true);
    expect(passRes.outcome).toBe('STRIKE');

    const strikeData = await strikePromise;
    expect(strikeData.strikeCount).toBe(1);
    expect(strikeData.isPass).toBe(true);
    expect(session.activePlayer.id).toBe('p2'); // Advanced to Bob

    // 3. Error guard: non-active player attempts to guess
    const errorPromise = waitForEvent<any>(p1Socket, 'team_guess_error');
    const invalidGuessPromise = new Promise<any>((resolve) => {
      p1Socket.emit('submit_team_guess', { roomCode: 'FEUD-S14A', playerId: 'p1', rawAnswer: 'Sofa' }, (res: any) => resolve(res));
    });
    const invalidGuessRes = await invalidGuessPromise;
    expect(invalidGuessRes.success).toBe(false);
    expect(invalidGuessRes.error).toContain('not your turn');

    const errEvent = await errorPromise;
    expect(errEvent.code).toBe('GUESS_ERROR');

    // 4. Timeout broadcast helper test
    handleTeamGuessingTimeoutBroadcast(testIo, 'FEUD-S14A', {
      type: 'STRIKE_TIMEOUT',
      strikeCount: 2,
      timedOutPlayer: session.activePlayer,
      nextPlayer: team1Players[2], // Charlie
      phase: 'TEAM_GUESSING',
      message: 'Time expired',
      endsAt: Date.now() + 15000,
      duration: 15,
    });

    expect(session.strikes).toBe(1); // Helper broadcasts to room
  });
});

