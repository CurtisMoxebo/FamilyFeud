import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../src/services/db';
import { setupSocketServer } from '../src/sockets/lobbyHandler';
import {
  initFaceOffSession,
  getFaceOffSession,
  clearAllFaceOffSessions,
  FaceOffQuestion,
  FaceOffPlayer,
} from '../src/services/faceOffService';
import {
  handleFaceOffTimeoutBroadcast,
  FaceOffBoardRevealPayload,
  PromptPassPlayPayload,
  RoundControlAssignedPayload,
} from '../src/sockets/mainGameHandler';

describe('US-13: Face-Off Scoring & Pass or Play WebSocket Integration', () => {
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

  const mockQuestion: FaceOffQuestion = {
    id: 'q-beach-pack',
    questionText: 'Name something you pack for the beach',
    orderIndex: 1,
    roundNumber: 1,
    answers: [
      { id: 'ans-1', answerText: 'Sunscreen / Suntan Lotion', points: 35, rankOrder: 1 },
      { id: 'ans-2', answerText: 'Towel', points: 28, rankOrder: 2 },
      { id: 'ans-3', answerText: 'Swimsuit', points: 18, rankOrder: 3 },
      { id: 'ans-4', answerText: 'Umbrella', points: 11, rankOrder: 4 },
      { id: 'ans-5', answerText: 'Sunglasses', points: 8, rankOrder: 5 },
    ],
  };

  const team1FourPlayers: FaceOffPlayer[] = [
    { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
    { id: 'p4', nickname: 'David', team: 'TEAM_1', battingOrder: 2 },
  ];

  const team2FourPlayers: FaceOffPlayer[] = [
    { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
    { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 2 },
  ];

  beforeAll(async () => {
    await prisma.room.createMany({
      data: [
        {
          roomCode: 'FEUD-S13A',
          roomName: 'Face-Off US-13 Room A',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-S13B',
          roomName: 'Face-Off US-13 Room B',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-S13C',
          roomName: 'Face-Off US-13 Room C',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-S13D',
          roomName: 'Face-Off US-13 Room D',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-S13E',
          roomName: 'Face-Off US-13 Room E',
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
        const addr = testServer.address() as AddressInfo;
        port = addr.port;
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

    clearAllFaceOffSessions();
  });

  beforeEach(() => {
    for (const socket of clientSockets) {
      if (socket.connected) socket.disconnect();
    }
    clientSockets = [];
    clearAllFaceOffSessions();
  });

  /* -------------------------------------------------------------
   * Scenario 1: Immediate Win with #1 Answer & Scenario 6: Choose PLAY
   * ------------------------------------------------------------- */
  it('satisfies Scenario 1 & 6: Immediate Win on #1 Answer reveals Card #1, prompts PASS_OR_PLAY, and winner choosing PLAY awards control', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    const p2Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket, p2Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S13A', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');
    p1Socket.emit('join_room', { roomCode: 'FEUD-S13A', nickname: 'Alice', isHost: false });
    await waitForEvent(p1Socket, 'room_state_update');
    p2Socket.emit('join_room', { roomCode: 'FEUD-S13A', nickname: 'Bob', isHost: false });
    await waitForEvent(p2Socket, 'room_state_update');

    // Init Face-Off session
    const session = initFaceOffSession('FEUD-S13A', {
      gameId: 'game-s13a',
      roundNumber: 1,
      team1Players: team1FourPlayers,
      team2Players: team2FourPlayers,
      question: mockQuestion,
    });

    session.markContenderReady('p1');
    session.markContenderReady('p2');
    session.pressBuzzer('p1'); // Alice buzzed

    // Alice submits #1 answer: "Sunscreen / Suntan Lotion" (rank 1, 35 pts)
    const boardRevealPromise = waitForEvent<FaceOffBoardRevealPayload>(hostSocket, 'board_reveal');
    const promptPassPlayPromise = waitForEvent<PromptPassPlayPayload>(p1Socket, 'prompt_pass_play');
    const guessResultPromise = waitForEvent<any>(hostSocket, 'face_off_guess_result');

    p1Socket.emit('submit_face_off_guess', {
      roomCode: 'FEUD-S13A',
      playerId: 'p1',
      rawAnswer: 'Sunscreen / Suntan Lotion',
    });

    const boardReveal = await boardRevealPromise;
    expect(boardReveal.rankOrder).toBe(1);
    expect(boardReveal.points).toBe(35);
    expect(boardReveal.isNumberOneAnswer).toBe(true);
    expect(boardReveal.answerText).toBe('Sunscreen / Suntan Lotion');

    const guessResult = await guessResultPromise;
    expect(guessResult.outcome).toBe('NUMBER_ONE_WIN');

    const promptPassPlay = await promptPassPlayPromise;
    expect(promptPassPlay.winnerPlayerId).toBe('p1');
    expect(promptPassPlay.winnerNickname).toBe('Alice');
    expect(promptPassPlay.winnerTeam).toBe('TEAM_1');

    // Scenario 6: Alice clicks "PLAY"
    const roundControlPromise = waitForEvent<RoundControlAssignedPayload>(hostSocket, 'round_control_assigned');
    p1Socket.emit('choose_play_pass', {
      roomCode: 'FEUD-S13A',
      playerId: 'p1',
      decision: 'play',
    });

    const roundControl = await roundControlPromise;
    expect(roundControl.winnerPlayerId).toBe('p1');
    expect(roundControl.decision).toBe('play');
    expect(roundControl.controllingTeam).toBe('TEAM_1');
    expect(roundControl.controllingTeamName).toBe('Team 1');
    expect(session.phase).toBe('ROUND_CONTROL_ASSIGNED');
  });

  /* -------------------------------------------------------------
   * Scenario 2 & 3: Opponent Beats Initial Guess & Scenario 7: Choose PASS
   * ------------------------------------------------------------- */
  it('satisfies Scenario 2, 3 & 7: Contender 1 guesses rank 4, prompting opponent, Contender 2 beats with rank 2, and PASS transfers control', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    const p2Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket, p2Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S13B', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');
    p1Socket.emit('join_room', { roomCode: 'FEUD-S13B', nickname: 'Alice', isHost: false });
    await waitForEvent(p1Socket, 'room_state_update');
    p2Socket.emit('join_room', { roomCode: 'FEUD-S13B', nickname: 'Bob', isHost: false });
    await waitForEvent(p2Socket, 'room_state_update');

    const session = initFaceOffSession('FEUD-S13B', {
      gameId: 'game-s13b',
      roundNumber: 1,
      team1Players: team1FourPlayers,
      team2Players: team2FourPlayers,
      question: mockQuestion,
    });

    session.markContenderReady('p1');
    session.markContenderReady('p2');
    session.pressBuzzer('p1');

    // Scenario 2: Alice submits non-#1 answer: "Umbrella" (rank 4, 11 pts)
    const card4RevealPromise = waitForEvent<FaceOffBoardRevealPayload>(hostSocket, 'board_reveal');
    const opponentPromptPromise = waitForEvent<any>(p2Socket, 'opponent_turn_prompt');

    p1Socket.emit('submit_face_off_guess', {
      roomCode: 'FEUD-S13B',
      playerId: 'p1',
      rawAnswer: 'Umbrella',
    });

    const card4Reveal = await card4RevealPromise;
    expect(card4Reveal.rankOrder).toBe(4);
    expect(card4Reveal.points).toBe(11);

    const opponentPrompt = await opponentPromptPromise;
    expect(opponentPrompt.nextRespondentId).toBe('p2');
    expect(opponentPrompt.nextRespondentNickname).toBe('Bob');
    expect(opponentPrompt.initialPoints).toBe(11);
    expect(opponentPrompt.duration).toBe(15);

    // Scenario 3: Bob submits higher-scoring answer: "Towel" (rank 2, 28 pts)
    const card2RevealPromise = waitForEvent<FaceOffBoardRevealPayload>(hostSocket, 'board_reveal');
    const bobPromptPromise = waitForEvent<PromptPassPlayPayload>(p2Socket, 'prompt_pass_play');

    p2Socket.emit('submit_face_off_guess', {
      roomCode: 'FEUD-S13B',
      playerId: 'p2',
      rawAnswer: 'Towel',
    });

    const card2Reveal = await card2RevealPromise;
    expect(card2Reveal.rankOrder).toBe(2);
    expect(card2Reveal.points).toBe(28);

    const bobPrompt = await bobPromptPromise;
    expect(bobPrompt.winnerPlayerId).toBe('p2');
    expect(bobPrompt.winnerNickname).toBe('Bob');
    expect(bobPrompt.winnerTeam).toBe('TEAM_2');

    // Scenario 7: Bob chooses "PASS" -> control transfers to Team 1!
    const roundControlPromise = waitForEvent<RoundControlAssignedPayload>(hostSocket, 'round_control_assigned');
    p2Socket.emit('choose_play_pass', {
      roomCode: 'FEUD-S13B',
      playerId: 'p2',
      decision: 'pass',
    });

    const roundControl = await roundControlPromise;
    expect(roundControl.decision).toBe('pass');
    expect(roundControl.winnerPlayerId).toBe('p2');
    expect(roundControl.winnerTeam).toBe('TEAM_2');
    expect(roundControl.controllingTeam).toBe('TEAM_1'); // Passed to Team 1!
    expect(roundControl.controllingTeamName).toBe('Team 1');
  });

  /* -------------------------------------------------------------
   * Scenario 4: Contender 1 Misses (0 Pts) & Contender 2 Capitalizes
   * ------------------------------------------------------------- */
  it('satisfies Scenario 4: Contender 1 misses (0 pts), Contender 2 lands any valid board answer and wins face-off', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    const p2Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket, p2Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S13C', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');
    p1Socket.emit('join_room', { roomCode: 'FEUD-S13C', nickname: 'Alice', isHost: false });
    await waitForEvent(p1Socket, 'room_state_update');
    p2Socket.emit('join_room', { roomCode: 'FEUD-S13C', nickname: 'Bob', isHost: false });
    await waitForEvent(p2Socket, 'room_state_update');

    initFaceOffSession('FEUD-S13C', {
      gameId: 'game-s13c',
      roundNumber: 1,
      team1Players: team1FourPlayers,
      team2Players: team2FourPlayers,
      question: mockQuestion,
    });

    const session = getFaceOffSession('FEUD-S13C')!;
    session.markContenderReady('p1');
    session.markContenderReady('p2');
    session.pressBuzzer('p1');

    // Alice misses completely ("Snowboard")
    const opponentPromptPromise = waitForEvent<any>(p2Socket, 'opponent_turn_prompt');
    p1Socket.emit('submit_face_off_guess', {
      roomCode: 'FEUD-S13C',
      playerId: 'p1',
      rawAnswer: 'Snowboard',
    });

    const oppPrompt = await opponentPromptPromise;
    expect(oppPrompt.nextRespondentId).toBe('p2');
    expect(oppPrompt.initialPoints).toBe(0);

    // Bob capitalizes with any valid answer (rank 5, "Sunglasses", 8 pts)
    const card5RevealPromise = waitForEvent<FaceOffBoardRevealPayload>(hostSocket, 'board_reveal');
    const bobPromptPromise = waitForEvent<PromptPassPlayPayload>(p2Socket, 'prompt_pass_play');

    p2Socket.emit('submit_face_off_guess', {
      roomCode: 'FEUD-S13C',
      playerId: 'p2',
      rawAnswer: 'Sunglasses',
    });

    const card5Reveal = await card5RevealPromise;
    expect(card5Reveal.rankOrder).toBe(5);
    expect(card5Reveal.points).toBe(8);

    const bobPrompt = await bobPromptPromise;
    expect(bobPrompt.winnerPlayerId).toBe('p2');
    expect(bobPrompt.winnerTeam).toBe('TEAM_2');
    expect(session.phase).toBe('PASS_OR_PLAY');
  });

  /* -------------------------------------------------------------
   * Scenario 5: Both Contenders Miss -> Deadlock Reset (US-28)
   * ------------------------------------------------------------- */
  it('satisfies Scenario 5: both contenders miss, triggering deadlock resolution without teammate cascade (US-28)', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    const p2Socket = await connectClient(port);
    const p4Socket = await connectClient(port); // David (Team 1 teammate)
    clientSockets.push(hostSocket, p1Socket, p2Socket, p4Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S13D', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');
    p1Socket.emit('join_room', { roomCode: 'FEUD-S13D', nickname: 'Alice', isHost: false });
    await waitForEvent(p1Socket, 'room_state_update');
    p2Socket.emit('join_room', { roomCode: 'FEUD-S13D', nickname: 'Bob', isHost: false });
    await waitForEvent(p2Socket, 'room_state_update');
    p4Socket.emit('join_room', { roomCode: 'FEUD-S13D', nickname: 'David', isHost: false });
    await waitForEvent(p4Socket, 'room_state_update');

    initFaceOffSession('FEUD-S13D', {
      gameId: 'game-s13d',
      roundNumber: 1,
      team1Players: team1FourPlayers,
      team2Players: team2FourPlayers,
      question: mockQuestion,
    });

    const session = getFaceOffSession('FEUD-S13D')!;
    session.markContenderReady('p1');
    session.markContenderReady('p2');
    session.pressBuzzer('p1');

    // Alice misses
    const oppPromptPromise = waitForEvent<any>(p2Socket, 'opponent_turn_prompt');
    p1Socket.emit('submit_face_off_guess', {
      roomCode: 'FEUD-S13D',
      playerId: 'p1',
      rawAnswer: 'Elephant',
    });
    await oppPromptPromise;

    // Bob misses too -> strictly triggers DEADLOCK_RESET (never cascades to David)
    const deadlockPromise = waitForEvent<any>(hostSocket, 'face_off_timeout');
    p2Socket.emit('submit_face_off_guess', {
      roomCode: 'FEUD-S13D',
      playerId: 'p2',
      rawAnswer: 'Giraffe',
    });

    const deadlockData = await deadlockPromise;
    expect(deadlockData.type).toBe('DEADLOCK_RESET');
    expect(session.phase).toBe('DEADLOCK_RESET');
  });

  /* -------------------------------------------------------------
   * Edge Cases, Validation, and Timeout Broadcast
   * ------------------------------------------------------------- */
  it('validates edge cases: non-active submission, invalid decision, duplicate answer, and opponent timeout', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    const p2Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket, p2Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S13E', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');
    p1Socket.emit('join_room', { roomCode: 'FEUD-S13E', nickname: 'Alice', isHost: false });
    await waitForEvent(p1Socket, 'room_state_update');
    p2Socket.emit('join_room', { roomCode: 'FEUD-S13E', nickname: 'Bob', isHost: false });
    await waitForEvent(p2Socket, 'room_state_update');

    const session = initFaceOffSession('FEUD-S13E', {
      gameId: 'game-s13e',
      roundNumber: 1,
      team1Players: team1FourPlayers,
      team2Players: team2FourPlayers,
      question: mockQuestion,
    });

    session.markContenderReady('p1');
    session.markContenderReady('p2');
    session.pressBuzzer('p1'); // Alice active respondent

    // 1. Bob (non-active) tries to submit guess -> rejected
    const errorPromise = waitForEvent<any>(p2Socket, 'face_off_error');
    p2Socket.emit('submit_face_off_guess', {
      roomCode: 'FEUD-S13E',
      playerId: 'p2',
      rawAnswer: 'Towel',
    });
    const err = await errorPromise;
    expect(err.code).toBe('INVALID_SUBMISSION');

    // 2. Alice submits "Towel"
    await session.evaluateContenderAnswer('p1', 'Towel');
    expect(session.phase).toBe('OPPONENT_GUESS');

    // 3. Bob tries to submit "Towel" too (duplicate) -> fails to beat, Alice wins
    const promptWinPromise = waitForEvent<PromptPassPlayPayload>(p1Socket, 'prompt_pass_play');
    p2Socket.emit('submit_face_off_guess', {
      roomCode: 'FEUD-S13E',
      playerId: 'p2',
      rawAnswer: 'Towel',
    });
    const promptWin = await promptWinPromise;
    expect(promptWin.winnerPlayerId).toBe('p1');
    expect(session.phase).toBe('PASS_OR_PLAY');

    // 4. Bob (non-winner) tries to choose PLAY -> rejected
    const decErrorPromise = waitForEvent<any>(p2Socket, 'face_off_error');
    p2Socket.emit('choose_play_pass', {
      roomCode: 'FEUD-S13E',
      playerId: 'p2',
      decision: 'play',
    });
    const decErr = await decErrorPromise;
    expect(decErr.code).toBe('INVALID_DECISION');

    // 5. Test TIMEOUT_WINNER broadcast helper
    const timeoutPromptPromise = waitForEvent<PromptPassPlayPayload>(p1Socket, 'prompt_pass_play');
    await handleFaceOffTimeoutBroadcast(testIo, 'FEUD-S13E', {
      type: 'TIMEOUT_WINNER',
      timedOutPlayerId: 'p2',
      timedOutPlayerNickname: 'Bob',
      timedOutPlayerTeam: 'TEAM_2',
      winnerPlayerId: 'p1',
      winnerNickname: 'Alice',
      winnerTeam: 'TEAM_1',
      phase: 'PASS_OR_PLAY',
      message: 'Bob timed out. Alice wins the Face-Off!',
    });
    const timeoutPrompt = await timeoutPromptPromise;
    expect(timeoutPrompt.winnerPlayerId).toBe('p1');

    // 6. submit_face_off_answer with evaluate=true delegates to guess evaluator
    session.phase = 'ANSWERING';
    session.activeRespondentId = 'p1';
    session.firstGuessResult = null;
    session.revealedAnswers = [];

    const ansWithEvalPromise = waitForEvent<PromptPassPlayPayload>(p1Socket, 'prompt_pass_play');
    p1Socket.emit('submit_face_off_answer', {
      roomCode: 'FEUD-S13E',
      playerId: 'p1',
      questionId: 'q-beach-pack',
      rawAnswer: 'Sunscreen / Suntan Lotion',
      evaluate: true,
    });
    const ansPrompt = await ansWithEvalPromise;
    expect(ansPrompt.winnerPlayerId).toBe('p1');
    // 7. choose_play_pass with callback and non-existent session
    const noSessionPromise = new Promise<any>((resolve) => {
      p1Socket.emit('choose_play_pass', { roomCode: 'NO-ROOM', playerId: 'p1', decision: 'play' }, (res: any) => resolve(res));
    });
    const noSessionRes = await noSessionPromise;
    expect(noSessionRes.success).toBe(false);
    expect(noSessionRes.error).toContain('No active face-off session found');

    // 8. choose_play_pass with invalid payload
    const invalidDecPromise = new Promise<any>((resolve) => {
      p1Socket.emit('choose_play_pass', { roomCode: 'FEUD-S13E', playerId: 'p1', decision: 'invalid' as any }, (res: any) => resolve(res));
    });
    const invalidDecRes = await invalidDecPromise;
    expect(invalidDecRes.success).toBe(false);
    expect(invalidDecRes.error).toBe('Invalid payload');

    // 9. choose_play_pass with callback on successful choice
    session.phase = 'PASS_OR_PLAY';
    session.winnerPlayerId = 'p1';
    session.winnerTeam = 'TEAM_1';
    const validChoicePromise = new Promise<any>((resolve) => {
      p1Socket.emit('choose_play_pass', { roomCode: 'FEUD-S13E', playerId: 'p1', decision: 'play' }, (res: any) => resolve(res));
    });
    const validChoiceRes = await validChoicePromise;
    expect(validChoiceRes.success).toBe(true);
    expect(validChoiceRes.decision).toBe('play');
    expect(validChoiceRes.controllingTeam).toBe('TEAM_1');

    // 10. submit_face_off_guess missing fields & non-existent session
    const submitNoRoomPromise = new Promise<any>((resolve) => {
      p1Socket.emit('submit_face_off_guess', { roomCode: 'NO-ROOM', playerId: 'p1', rawAnswer: 'Hi' }, (res: any) => resolve(res));
    });
    const submitNoRoomRes = await submitNoRoomPromise;
    expect(submitNoRoomRes.success).toBe(false);

    const submitMissingPromise = new Promise<any>((resolve) => {
      p1Socket.emit('submit_face_off_guess', { roomCode: 'FEUD-S13E', playerId: 'p1', rawAnswer: '' }, (res: any) => resolve(res));
    });
    const submitMissingRes = await submitMissingPromise;
    expect(submitMissingRes.success).toBe(false);

    // 11. submit_face_off_guess in invalid phase
    session.phase = 'AWAITING_READY';
    session.activeRespondentId = 'p1';
    const submitInvalidPhasePromise = new Promise<any>((resolve) => {
      p1Socket.emit('submit_face_off_guess', { roomCode: 'FEUD-S13E', playerId: 'p1', rawAnswer: 'Towel' }, (res: any) => resolve(res));
    });
    const submitInvalidPhaseRes = await submitInvalidPhasePromise;
    expect(submitInvalidPhaseRes.success).toBe(false);
    expect(submitInvalidPhaseRes.error).toContain('not in an answering phase');
  });

  it('satisfies Scenario 5: deadlock resolution in 1v1 match emits face_off_reset with replacement question', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    const p2Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket, p2Socket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-S13E', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    // Create valid game record in DB for deadlock question generation
    const roomRecord = await prisma.room.findUnique({ where: { roomCode: 'FEUD-S13E' } });
    const gameRecord = await prisma.game.create({
      data: {
        roomId: roomRecord!.id,
        mode: 'MAIN_GAME',
        currentRound: 1,
        totalPointsAccumulated: 0,
      },
    });

    // 1v1 session
    const session = initFaceOffSession('FEUD-S13E', {
      gameId: gameRecord.id,
      roundNumber: 1,
      team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
      team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
      question: mockQuestion,
    });

    session.markContenderReady('p1');
    session.markContenderReady('p2');
    session.pressBuzzer('p1');

    // Alice misses
    await session.evaluateContenderAnswer('p1', 'Miss 1');

    // Bob misses -> triggers DEADLOCK_RESET and replacement question via DB
    const resetPromise = waitForEvent<any>(hostSocket, 'face_off_reset');
    p2Socket.emit('submit_face_off_guess', {
      roomCode: 'FEUD-S13E',
      playerId: 'p2',
      rawAnswer: 'Miss 2',
    });

    const resetData = await resetPromise;
    expect(resetData.roomCode).toBe('FEUD-S13E');
    expect(resetData.newQuestion).toBeDefined();
    expect(session.phase).toBe('BUZZER_ACTIVE');
  });
});
