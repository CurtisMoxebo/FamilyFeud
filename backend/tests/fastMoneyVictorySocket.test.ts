import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initFastMoneySession,
  registerFastMoneyHandlers,
  clearFastMoneyTimer,
  fastMoneySessions,
  fastMoneyTimers,
} from '../src/sockets/fastMoneyHandler';
import { FastMoneyQuestionItem } from '../src/services/fastMoneySession';

vi.mock('../src/services/questionService', () => ({
  generateAndSaveGameQuestions: vi.fn().mockResolvedValue([
    {
      id: 'q-new-1',
      questionText: 'Name a summer fruit',
      orderIndex: 0,
      answers: [{ id: 'ans-new-1', answerText: 'Watermelon', points: 45, rankOrder: 1 }],
    },
    {
      id: 'q-new-2',
      questionText: 'Name a musical instrument',
      orderIndex: 1,
      answers: [{ id: 'ans-new-2', answerText: 'Guitar', points: 40, rankOrder: 1 }],
    },
    {
      id: 'q-new-3',
      questionText: 'Name a pet animal',
      orderIndex: 2,
      answers: [{ id: 'ans-new-3', answerText: 'Dog', points: 50, rankOrder: 1 }],
    },
    {
      id: 'q-new-4',
      questionText: 'Name a hot beverage',
      orderIndex: 3,
      answers: [{ id: 'ans-new-4', answerText: 'Coffee', points: 55, rankOrder: 1 }],
    },
    {
      id: 'q-new-5',
      questionText: 'Name a school subject',
      orderIndex: 4,
      answers: [{ id: 'ans-new-5', answerText: 'Math', points: 30, rankOrder: 1 }],
    },
  ]),
}));

describe('Fast Money Victory & Replay WebSocket Handlers (US-10 Step 2)', () => {
  const mockQuestions: FastMoneyQuestionItem[] = [
    {
      id: 'q-1',
      questionText: 'Name a breakfast food',
      orderIndex: 1,
      answers: [
        { id: 'ans-1', answerText: 'Eggs', points: 35, rankOrder: 1 },
        { id: 'ans-2', answerText: 'Pancakes', points: 25, rankOrder: 2 },
      ],
    },
    {
      id: 'q-2',
      questionText: 'Name something in a living room',
      orderIndex: 2,
      answers: [
        { id: 'ans-3', answerText: 'Couch', points: 40, rankOrder: 1 },
        { id: 'ans-4', answerText: 'Television', points: 25, rankOrder: 2 },
      ],
    },
    {
      id: 'q-3',
      questionText: 'Name an animal in a zoo',
      orderIndex: 3,
      answers: [
        { id: 'ans-5', answerText: 'Lion', points: 30, rankOrder: 1 },
        { id: 'ans-6', answerText: 'Tiger', points: 20, rankOrder: 2 },
      ],
    },
    {
      id: 'q-4',
      questionText: 'Name a day of the week',
      orderIndex: 4,
      answers: [
        { id: 'ans-7', answerText: 'Friday', points: 50, rankOrder: 1 },
        { id: 'ans-8', answerText: 'Saturday', points: 30, rankOrder: 2 },
      ],
    },
    {
      id: 'q-5',
      questionText: 'Name a cold drink',
      orderIndex: 5,
      answers: [
        { id: 'ans-9', answerText: 'Soda', points: 20, rankOrder: 1 },
        { id: 'ans-10', answerText: 'Iced Tea', points: 15, rankOrder: 2 },
      ],
    },
  ];

  let mockIo: any;
  let mockHostSocket: any;
  let mockPlayerSocket: any;
  let mockDb: any;
  let emittedEvents: Array<{ event: string; room?: string; payload: any }> = [];
  let hostListeners: Record<string, Function> = {};
  let playerListeners: Record<string, Function> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    emittedEvents = [];
    hostListeners = {};
    playerListeners = {};

    mockIo = {
      to: vi.fn().mockImplementation((room: string) => ({
        emit: vi.fn().mockImplementation((event: string, payload: any) => {
          emittedEvents.push({ event, room, payload });
        }),
      })),
    };

    mockHostSocket = {
      id: 'socket-host',
      data: { roomCode: 'FEUD-VIC1', isHost: true },
      emit: vi.fn().mockImplementation((event: string, payload: any) => {
        emittedEvents.push({ event, payload });
      }),
      on: vi.fn().mockImplementation((event: string, handler: Function) => {
        hostListeners[event] = handler;
      }),
    };

    mockPlayerSocket = {
      id: 'socket-p1',
      data: { roomCode: 'FEUD-VIC1', isHost: false },
      emit: vi.fn().mockImplementation((event: string, payload: any) => {
        emittedEvents.push({ event, payload });
      }),
      on: vi.fn().mockImplementation((event: string, handler: Function) => {
        playerListeners[event] = handler;
      }),
    };

    mockDb = {
      game: {
        update: vi.fn().mockResolvedValue({ id: 'game-vic-01', status: 'COMPLETED' }),
        create: vi.fn().mockResolvedValue({ id: 'game-new-02', status: 'IN_PROGRESS' }),
      },
      room: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'room-vic-01',
          roomCode: 'FEUD-VIC1',
          gameMode: 'FAST_MONEY',
          language: 'EN',
          status: 'FINISHED',
          players: [
            { id: 'p1-uuid', nickname: 'Alice', isHost: false },
            { id: 'p2-uuid', nickname: 'Bob', isHost: false },
          ],
        }),
        update: vi.fn().mockResolvedValue({ id: 'room-vic-01', status: 'ACTIVE' }),
      },
    };

    fastMoneySessions.clear();
    for (const key of fastMoneyTimers.keys()) {
      clearFastMoneyTimer(key);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function setupCompletedP2TurnSession(p1Answers: string[], p2Answers: string[]) {
    const session = initFastMoneySession('FEUD-VIC1', {
      gameId: 'game-vic-01',
      player1Id: 'p1-uuid',
      player2Id: 'p2-uuid',
      questions: mockQuestions,
      timerDurationSeconds: 60,
    });

    // P1 Turn
    session.startPlayer1Turn('p1-uuid');
    p1Answers.forEach((ans, idx) => {
      const q = mockQuestions[idx];
      session.submitAnswer('p1-uuid', q.id, ans);
      const matched = q.answers.find((a) => a.answerText.toLowerCase() === ans.toLowerCase());
      session.recordEvaluation(q.id, matched ? matched.points : 0, !!matched, matched?.id, 1);
    });

    // P1 Reveal
    session.startRevealPhase();
    for (let slot = 1; slot <= 5; slot++) {
      session.revealAnswer(slot);
      session.revealPoints(slot);
    }

    // P2 Turn
    session.startPlayer2Turn('p2-uuid');
    p2Answers.forEach((ans, idx) => {
      const q = mockQuestions[idx];
      session.submitAnswer('p2-uuid', q.id, ans);
      const matched = q.answers.find((a) => a.answerText.toLowerCase() === ans.toLowerCase());
      session.recordEvaluation(q.id, matched ? matched.points : 0, !!matched, matched?.id, 2);
    });

    registerFastMoneyHandlers(mockIo, mockHostSocket, mockDb);
    registerFastMoneyHandlers(mockIo, mockPlayerSocket, mockDb);

    return session;
  }

  describe('start_p2_reveal_phase handler', () => {
    it('allows host to start P2 reveal phase and broadcasts state', () => {
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'], // 35+40+30+50+20 = 175
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );

      expect(session.getPhase()).toBe('P2_FINISHED');

      const callback = vi.fn();
      hostListeners['start_p2_reveal_phase']({ roomCode: 'FEUD-VIC1' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true, phase: 'P2_REVEAL' });
      expect(session.getPhase()).toBe('P2_REVEAL');

      const hostBroadcast = emittedEvents.find((e) => e.event === 'fast_money_host_state');
      expect(hostBroadcast).toBeDefined();
    });

    it('rejects non-host attempt with UNAUTHORIZED error', () => {
      setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );

      const callback = vi.fn();
      playerListeners['start_p2_reveal_phase']({ roomCode: 'FEUD-VIC1' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('Only the host') })
      );
      const errorEvent = emittedEvents.find(
        (e) => e.event === 'room_error' && e.payload.code === 'UNAUTHORIZED'
      );
      expect(errorEvent).toBeDefined();
    });

    it('rejects when room is not found', () => {
      registerFastMoneyHandlers(mockIo, mockHostSocket, mockDb);

      const callback = vi.fn();
      hostListeners['start_p2_reveal_phase']({ roomCode: 'UNKNOWN-ROOM' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('No active') })
      );
    });

    it('handles unexpected session errors gracefully', () => {
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );
      vi.spyOn(session, 'startP2RevealPhase').mockImplementationOnce(() => {
        throw new Error('Internal state error');
      });

      const callback = vi.fn();
      hostListeners['start_p2_reveal_phase']({ roomCode: 'FEUD-VIC1' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.any(String) })
      );
      const serverErr = emittedEvents.find(
        (e) => e.event === 'room_error' && e.payload.code === 'SERVER_ERROR'
      );
      expect(serverErr).toBeDefined();
    });
  });

  describe('reveal_p2_answer handler', () => {
    it('reveals Player 2 answer with column: 2 and concealed points', () => {
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );
      session.startP2RevealPhase();

      const callback = vi.fn();
      hostListeners['reveal_p2_answer']({ roomCode: 'FEUD-VIC1', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: true,
        slot: expect.objectContaining({
          slotNumber: 1,
          rawAnswer: 'Pancakes',
          isAnswerRevealed: true,
          isPointsRevealed: false,
          pointsAwarded: 0, // Concealed during answer reveal
        }),
      });

      const revealEvent = emittedEvents.find(
        (e) => e.event === 'board_reveal' && e.payload.type === 'ANSWER'
      );
      expect(revealEvent).toBeDefined();
      expect(revealEvent?.payload.column).toBe(2);
      expect(revealEvent?.payload.slotNumber).toBe(1);
    });

    it('rejects non-host player with UNAUTHORIZED', () => {
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );
      session.startP2RevealPhase();

      const callback = vi.fn();
      playerListeners['reveal_p2_answer']({ roomCode: 'FEUD-VIC1', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('Only the host') })
      );
    });

    it('rejects invalid payload without slotNumber', () => {
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );
      session.startP2RevealPhase();

      const callback = vi.fn();
      hostListeners['reveal_p2_answer']({ roomCode: 'FEUD-VIC1' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('numeric slotNumber') })
      );
    });

    it('rejects when room is not found for reveal_p2_answer', () => {
      registerFastMoneyHandlers(mockIo, mockHostSocket, mockDb);

      const callback = vi.fn();
      hostListeners['reveal_p2_answer']({ roomCode: 'UNKNOWN', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('No active Fast Money session') })
      );
    });

    it('handles error when revealP2Answer throws', () => {
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );
      // Not yet in P2_REVEAL phase, calling reveal_p2_answer will cause session to throw

      const callback = vi.fn();
      hostListeners['reveal_p2_answer']({ roomCode: 'FEUD-VIC1', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.any(String) })
      );
      const serverErr = emittedEvents.find(
        (e) => e.event === 'room_error' && e.payload.code === 'SERVER_ERROR'
      );
      expect(serverErr).toBeDefined();
    });
  });

  describe('reveal_p2_points handler & Dynamic Mid-Reveal Victory (Scenario 2)', () => {
    it('reveals points and does not trigger victory if grand total < 200', async () => {
      // P1: Eggs(35) + Couch(40) = 75 pts (rest unmatched)
      // P2: Pancakes(25) -> Grand total after slot 1 = 100
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'None1', 'None2', 'None3'],
        ['Pancakes', 'None4', 'None5', 'None6', 'None7']
      );
      session.startP2RevealPhase();
      session.revealP2Answer(1);

      const callback = vi.fn();
      await hostListeners['reveal_p2_points']({ roomCode: 'FEUD-VIC1', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: true,
        slot: expect.objectContaining({
          slotNumber: 1,
          rawAnswer: 'Pancakes',
          isPointsRevealed: true,
          pointsAwarded: 25,
        }),
        totalScore: 100,
        p1TotalScore: 75,
        p2TotalScore: 25,
        isVictory: false,
        isGameOver: false,
      });

      const gameOverEvent = emittedEvents.find((e) => e.event === 'game_over');
      expect(gameOverEvent).toBeUndefined();
      expect(mockDb.game.update).not.toHaveBeenCalled();
    });

    it('triggers immediate victory at >= 200 points on slot 2, emits game_over, updates DB Game to COMPLETED', async () => {
      // P1: Eggs(35) + Couch(40) + Lion(30) + Friday(50) + Soda(20) = 175 pts
      // P2 Slot 1: Pancakes(25) -> Grand total = 200 (VICTORY!)
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'], // 175
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );
      session.startP2RevealPhase();
      session.revealP2Answer(1);

      const callback = vi.fn();
      await hostListeners['reveal_p2_points']({ roomCode: 'FEUD-VIC1', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          totalScore: 200,
          isVictory: true,
          isGameOver: true,
        })
      );

      // Verify game_over broadcast
      const gameOverEvent = emittedEvents.find((e) => e.event === 'game_over');
      expect(gameOverEvent).toBeDefined();
      expect(gameOverEvent?.payload).toEqual({
        roomCode: 'FEUD-VIC1',
        isVictory: true,
        p1TotalScore: 175,
        p2TotalScore: 25,
        grandTotal: 200,
        targetScore: 200,
      });

      // Verify DB persistence
      expect(mockDb.game.update).toHaveBeenCalledWith({
        where: { id: 'game-vic-01' },
        data: {
          status: 'COMPLETED',
          totalPointsAccumulated: 200,
        },
      });
      expect(mockDb.room.update).toHaveBeenCalledWith({
        where: { roomCode: 'FEUD-VIC1' },
        data: { status: 'FINISHED' },
      });

      // Phase is now GAME_OVER
      expect(session.getPhase()).toBe('GAME_OVER');
    });

    it('rejects non-host attempt to reveal points with UNAUTHORIZED', async () => {
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );
      session.startP2RevealPhase();
      session.revealP2Answer(1);

      const callback = vi.fn();
      await playerListeners['reveal_p2_points']({ roomCode: 'FEUD-VIC1', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('Only the host') })
      );
    });

    it('rejects reveal_p2_points with invalid payload or missing session', async () => {
      registerFastMoneyHandlers(mockIo, mockHostSocket, mockDb);

      const cb1 = vi.fn();
      await hostListeners['reveal_p2_points']({ roomCode: '' }, cb1);
      expect(cb1).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('numeric slotNumber') })
      );

      const cb2 = vi.fn();
      await hostListeners['reveal_p2_points']({ roomCode: 'FEUD-NO-SES', slotNumber: 1 }, cb2);
      expect(cb2).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('No active Fast Money session') })
      );
    });

    it('handles database error when persisting completed game without crashing', async () => {
      mockDb.game.update.mockRejectedValueOnce(new Error('DB Timeout'));
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );
      session.startP2RevealPhase();
      session.revealP2Answer(1);

      const callback = vi.fn();
      await hostListeners['reveal_p2_points']({ roomCode: 'FEUD-VIC1', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isVictory: true, isGameOver: true })
      );
    });

    it('handles unexpected session errors during reveal_p2_points', async () => {
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );
      // Not yet in P2_REVEAL, so revealP2Points throws

      const callback = vi.fn();
      await hostListeners['reveal_p2_points']({ roomCode: 'FEUD-VIC1', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.any(String) })
      );
    });
  });

  describe('Defeat Scenario (< 200 Points across all 5 slots) (Scenario 3)', () => {
    it('triggers game_over with isVictory: false after all 5 questions revealed with sum < 200', async () => {
      // P1: Eggs(35) + 0 + 0 + 0 + 0 = 35
      // P2: Pancakes(25) + 0 + 0 + 0 + 0 = 25 -> Total = 60 (< 200)
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Unmatched1', 'Unmatched2', 'Unmatched3', 'Unmatched4'],
        ['Pancakes', 'Unmatched5', 'Unmatched6', 'Unmatched7', 'Unmatched8']
      );
      session.startP2RevealPhase();

      for (let slot = 1; slot <= 4; slot++) {
        session.revealP2Answer(slot);
        session.revealP2Points(slot);
      }

      session.revealP2Answer(5);

      const callback = vi.fn();
      await hostListeners['reveal_p2_points']({ roomCode: 'FEUD-VIC1', slotNumber: 5 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          totalScore: 60,
          isVictory: false,
          isGameOver: true,
        })
      );

      const gameOverEvent = emittedEvents.find((e) => e.event === 'game_over');
      expect(gameOverEvent).toBeDefined();
      expect(gameOverEvent?.payload).toEqual({
        roomCode: 'FEUD-VIC1',
        isVictory: false,
        p1TotalScore: 35,
        p2TotalScore: 25,
        grandTotal: 60,
        targetScore: 200,
      });

      expect(mockDb.game.update).toHaveBeenCalledWith({
        where: { id: 'game-vic-01' },
        data: {
          status: 'COMPLETED',
          totalPointsAccumulated: 60,
        },
      });
      expect(mockDb.room.update).toHaveBeenCalledWith({
        where: { roomCode: 'FEUD-VIC1' },
        data: { status: 'FINISHED' },
      });
      expect(session.getPhase()).toBe('GAME_OVER');
    });
  });

  describe('request_replay handler (Scenario 4: Play Again in the Same Room)', () => {
    it('creates new game, generates 5 fresh questions, resets session to P1_READY, and emits game_started and game_replayed', async () => {
      const session = setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );
      session.startP2RevealPhase();
      session.revealP2Answer(1);
      session.revealP2Points(1); // 200 pts -> GAME_OVER

      expect(session.getPhase()).toBe('GAME_OVER');

      const callback = vi.fn();
      await hostListeners['request_replay']({ roomCode: 'FEUD-VIC1' }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: true,
        gameId: 'game-new-02',
      });

      // Verify DB creation
      expect(mockDb.game.create).toHaveBeenCalledWith({
        data: {
          roomId: 'room-vic-01',
          mode: 'FAST_MONEY',
          status: 'IN_PROGRESS',
          currentRound: 1,
        },
      });

      // Verify room status updated to ACTIVE
      expect(mockDb.room.update).toHaveBeenCalledWith({
        where: { id: 'room-vic-01' },
        data: { status: 'ACTIVE' },
        include: { players: true },
      });

      // Verify session reset
      expect(session.getPhase()).toBe('P1_READY');
      expect(session.gameId).toBe('game-new-02');
      expect(session.questions[0].id).toBe('q-new-1');

      // Verify game_started and game_replayed emitted
      const gameStartedEvent = emittedEvents.find((e) => e.event === 'game_started');
      expect(gameStartedEvent).toBeDefined();
      expect(gameStartedEvent?.payload.gameId).toBe('game-new-02');
      expect(gameStartedEvent?.payload.firstQuestion.id).toBe('q-new-1');

      const gameReplayedEvent = emittedEvents.find((e) => e.event === 'game_replayed');
      expect(gameReplayedEvent).toBeDefined();
      expect(gameReplayedEvent?.payload).toEqual({
        roomCode: 'FEUD-VIC1',
        gameId: 'game-new-02',
      });
    });

    it('rejects non-host attempt with UNAUTHORIZED', async () => {
      setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );

      const callback = vi.fn();
      await playerListeners['request_replay']({ roomCode: 'FEUD-VIC1' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('Only the host') })
      );
      const errorEvent = emittedEvents.find(
        (e) => e.event === 'room_error' && e.payload.code === 'UNAUTHORIZED'
      );
      expect(errorEvent).toBeDefined();
    });

    it('rejects when room is missing from DB', async () => {
      mockDb.room.findUnique.mockResolvedValueOnce(null);
      setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );

      const callback = vi.fn();
      await hostListeners['request_replay']({ roomCode: 'FEUD-VIC1' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('Room not found') })
      );
    });

    it('rejects request_replay when roomCode is missing or session does not exist', async () => {
      registerFastMoneyHandlers(mockIo, mockHostSocket, mockDb);

      const cb1 = vi.fn();
      await hostListeners['request_replay']({ roomCode: '' }, cb1);
      expect(cb1).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('roomCode is required') })
      );

      const cb2 = vi.fn();
      await hostListeners['request_replay']({ roomCode: 'NO-SES' }, cb2);
      expect(cb2).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('No active Fast Money session') })
      );
    });

    it('handles database errors during replay creation', async () => {
      mockDb.game.create.mockRejectedValueOnce(new Error('Deadlock detected'));
      setupCompletedP2TurnSession(
        ['Eggs', 'Couch', 'Lion', 'Friday', 'Soda'],
        ['Pancakes', 'Television', 'Tiger', 'Saturday', 'Iced Tea']
      );

      const callback = vi.fn();
      await hostListeners['request_replay']({ roomCode: 'FEUD-VIC1' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('Deadlock detected') })
      );
    });
  });
});
