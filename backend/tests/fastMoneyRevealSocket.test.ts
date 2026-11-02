import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initFastMoneySession,
  registerFastMoneyHandlers,
  clearFastMoneyTimer,
  fastMoneySessions,
  fastMoneyTimers,
  BoardRevealPayload,
} from '../src/sockets/fastMoneyHandler';
import { FastMoneyQuestionItem } from '../src/services/fastMoneySession';

describe('Fast Money Reveal WebSocket Handlers (US-08 Step 2)', () => {
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
      answers: [{ id: 'ans-5', answerText: 'Lion', points: 30, rankOrder: 1 }],
    },
    {
      id: 'q-4',
      questionText: 'Name a day of the week',
      orderIndex: 4,
      answers: [{ id: 'ans-6', answerText: 'Friday', points: 50, rankOrder: 1 }],
    },
    {
      id: 'q-5',
      questionText: 'Name a cold drink',
      orderIndex: 5,
      answers: [{ id: 'ans-7', answerText: 'Soda', points: 20, rankOrder: 1 }],
    },
  ];

  let mockIo: any;
  let mockHostSocket: any;
  let mockPlayerSocket: any;
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
      data: { roomCode: 'FEUD-REV2', isHost: true },
      emit: vi.fn().mockImplementation((event: string, payload: any) => {
        emittedEvents.push({ event, payload });
      }),
      on: vi.fn().mockImplementation((event: string, handler: Function) => {
        hostListeners[event] = handler;
      }),
    };

    mockPlayerSocket = {
      id: 'socket-p1',
      data: { roomCode: 'FEUD-REV2', isHost: false },
      emit: vi.fn().mockImplementation((event: string, payload: any) => {
        emittedEvents.push({ event, payload });
      }),
      on: vi.fn().mockImplementation((event: string, handler: Function) => {
        playerListeners[event] = handler;
      }),
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

  function setupSessionWithAnswers(): any {
    const session = initFastMoneySession('FEUD-REV2', {
      gameId: 'game-rev-02',
      player1Id: 'p1-uuid',
      player2Id: 'p2-uuid',
      questions: mockQuestions,
      timerDurationSeconds: 60,
    });

    session.startPlayer1Turn('p1-uuid');
    session.submitAnswer('p1-uuid', 'q-1', 'Eggs'); // 35 pts
    session.submitAnswer('p1-uuid', 'q-2', 'Banana'); // 0 pts (unmatched)
    session.recordEvaluation('q-2', 0, false);
    session.submitAnswer('p1-uuid', 'q-3', 'Lion'); // 30 pts
    session.submitAnswer('p1-uuid', 'q-4', 'Friday'); // 50 pts
    session.submitAnswer('p1-uuid', 'q-5', 'Soda'); // 20 pts
    session.startRevealPhase();

    registerFastMoneyHandlers(mockIo, mockHostSocket);
    registerFastMoneyHandlers(mockIo, mockPlayerSocket);

    return session;
  }

  describe('start_reveal_phase handler', () => {
    it('allows host to start reveal phase and broadcasts state', () => {
      const session = initFastMoneySession('FEUD-REV2', {
        gameId: 'game-rev-02',
        player1Id: 'p1-uuid',
        player2Id: 'p2-uuid',
        questions: mockQuestions,
      });

      registerFastMoneyHandlers(mockIo, mockHostSocket);

      const callback = vi.fn();
      hostListeners['start_reveal_phase']({ roomCode: 'FEUD-REV2' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true, phase: 'P1_REVEAL' });
      expect(session.getPhase()).toBe('P1_REVEAL');

      const broadcast = emittedEvents.find((e) => e.event === 'fast_money_host_state');
      expect(broadcast).toBeDefined();
    });

    it('rejects unauthorized non-host player with UNAUTHORIZED error', () => {
      initFastMoneySession('FEUD-REV2', {
        gameId: 'game-rev-02',
        player1Id: 'p1-uuid',
        player2Id: 'p2-uuid',
        questions: mockQuestions,
      });

      registerFastMoneyHandlers(mockIo, mockPlayerSocket);

      const callback = vi.fn();
      playerListeners['start_reveal_phase']({ roomCode: 'FEUD-REV2' }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Only the host display can start the reveal phase',
      });
      const roomErr = emittedEvents.find((e) => e.event === 'room_error');
      expect(roomErr?.payload.code).toBe('UNAUTHORIZED');
    });

    it('rejects if room does not exist', () => {
      registerFastMoneyHandlers(mockIo, mockHostSocket);

      const callback = vi.fn();
      hostListeners['start_reveal_phase']({ roomCode: 'NON_EXISTENT' }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'No active Fast Money session found for this room',
      });
    });
  });

  describe('reveal_answer (Scenario 1: Host Triggers Question Answer Reveal)', () => {
    it('flips slot 1 answer, broadcasts board_reveal, and updates host/player states', () => {
      const session = setupSessionWithAnswers();
      const callback = vi.fn();

      hostListeners['reveal_answer']({ roomCode: 'FEUD-REV2', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          slot: expect.objectContaining({
            slotNumber: 1,
            rawAnswer: 'Eggs',
            isAnswerRevealed: true,
            isPointsRevealed: false,
            pointsAwarded: 0, // Points still concealed in sanitized view
          }),
          totalScore: 0,
        })
      );

      // Verify board_reveal event broadcasted to room:FEUD-REV2
      const boardRevealEvent = emittedEvents.find(
        (e) => e.event === 'board_reveal' && e.payload.type === 'ANSWER'
      );
      expect(boardRevealEvent).toBeDefined();
      expect(boardRevealEvent?.room).toBe('room:FEUD-REV2');
      const payload: BoardRevealPayload = boardRevealEvent?.payload;
      expect(payload.slotNumber).toBe(1);
      expect(payload.slot.rawAnswer).toBe('Eggs');
      expect(payload.slot.isAnswerRevealed).toBe(true);
      expect(payload.slot.isPointsRevealed).toBe(false);
      expect(payload.totalScore).toBe(0);

      // Verify sanitized host and player state broadcasts
      const hostStateEvent = emittedEvents.find((e) => e.event === 'fast_money_host_state');
      expect(hostStateEvent?.payload.revealSlots[0].rawAnswer).toBe('Eggs');
    });

    it('rejects if triggered by non-host player socket', () => {
      setupSessionWithAnswers();
      const callback = vi.fn();

      playerListeners['reveal_answer']({ roomCode: 'FEUD-REV2', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Only the host display can trigger answer reveal',
      });
      const roomErr = emittedEvents.find((e) => e.event === 'room_error');
      expect(roomErr?.payload.code).toBe('UNAUTHORIZED');
    });

    it('rejects if invalid slotNumber or missing roomCode', () => {
      setupSessionWithAnswers();
      const callback = vi.fn();

      hostListeners['reveal_answer']({ roomCode: '', slotNumber: 1 }, callback);
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'roomCode and valid numeric slotNumber are required',
      });
    });

    it('returns error if revealing slot out of sequential order', () => {
      setupSessionWithAnswers();
      const callback = vi.fn();

      // Attempt to reveal slot 2 before slot 1
      hostListeners['reveal_answer']({ roomCode: 'FEUD-REV2', slotNumber: 2 }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('before completing reveal for slot 1'),
      });
    });
  });

  describe('reveal_points (Scenario 2 & 3: Point Values & Cumulative Scoring)', () => {
    it('flips slot 1 points, broadcasts board_reveal, and increments total score', () => {
      setupSessionWithAnswers();

      // First reveal answer
      hostListeners['reveal_answer']({ roomCode: 'FEUD-REV2', slotNumber: 1 });

      const callback = vi.fn();
      hostListeners['reveal_points']({ roomCode: 'FEUD-REV2', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          slot: expect.objectContaining({
            slotNumber: 1,
            pointsAwarded: 35,
            isPointsRevealed: true,
            isMatched: true,
          }),
          totalScore: 35,
        })
      );

      const pointsRevealEvent = emittedEvents.find(
        (e) => e.event === 'board_reveal' && e.payload.type === 'POINTS'
      );
      expect(pointsRevealEvent?.payload.totalScore).toBe(35);
      expect(pointsRevealEvent?.payload.slot.pointsAwarded).toBe(35);
    });

    it('satisfies Scenario 2: handles 0 points for unmatched answer without incrementing total score', () => {
      setupSessionWithAnswers();

      // Complete slot 1
      hostListeners['reveal_answer']({ roomCode: 'FEUD-REV2', slotNumber: 1 });
      hostListeners['reveal_points']({ roomCode: 'FEUD-REV2', slotNumber: 1 });

      // Slot 2: "Banana" (unmatched, 0 pts)
      hostListeners['reveal_answer']({ roomCode: 'FEUD-REV2', slotNumber: 2 });

      const callback = vi.fn();
      hostListeners['reveal_points']({ roomCode: 'FEUD-REV2', slotNumber: 2 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          slot: expect.objectContaining({
            slotNumber: 2,
            pointsAwarded: 0,
            isPointsRevealed: true,
            isMatched: false,
          }),
          totalScore: 35, // Score unchanged
        })
      );
    });

    it('satisfies Scenario 3: accumulates score cleanly across questions', () => {
      setupSessionWithAnswers();

      // Slot 1: 35 pts
      hostListeners['reveal_answer']({ roomCode: 'FEUD-REV2', slotNumber: 1 });
      hostListeners['reveal_points']({ roomCode: 'FEUD-REV2', slotNumber: 1 });

      // Slot 2: 0 pts
      hostListeners['reveal_answer']({ roomCode: 'FEUD-REV2', slotNumber: 2 });
      hostListeners['reveal_points']({ roomCode: 'FEUD-REV2', slotNumber: 2 });

      // Slot 3: Lion (30 pts)
      hostListeners['reveal_answer']({ roomCode: 'FEUD-REV2', slotNumber: 3 });
      const callback = vi.fn();
      hostListeners['reveal_points']({ roomCode: 'FEUD-REV2', slotNumber: 3 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          totalScore: 65, // 35 + 0 + 30
        })
      );
    });

    it('rejects revealing points if answer has not been revealed yet', () => {
      setupSessionWithAnswers();
      const callback = vi.fn();

      hostListeners['reveal_points']({ roomCode: 'FEUD-REV2', slotNumber: 1 }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('before revealing answer'),
      });
    });
  });

  describe('Scenario 4: Completion of Player 1 Reveal & State Transition to P2_READY', () => {
    it('notifies room with p1_reveal_completed and advances phase to P2_READY upon revealing slot 5 points', () => {
      const session = setupSessionWithAnswers();

      // Reveal slots 1 to 4
      for (let i = 1; i <= 4; i++) {
        hostListeners['reveal_answer']({ roomCode: 'FEUD-REV2', slotNumber: i });
        hostListeners['reveal_points']({ roomCode: 'FEUD-REV2', slotNumber: i });
      }

      // Reveal slot 5 answer
      hostListeners['reveal_answer']({ roomCode: 'FEUD-REV2', slotNumber: 5 });
      expect(session.getPhase()).toBe('P1_REVEAL');

      // Reveal slot 5 points
      const callback = vi.fn();
      hostListeners['reveal_points']({ roomCode: 'FEUD-REV2', slotNumber: 5 }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          isAllRevealed: true,
          totalScore: 35 + 0 + 30 + 50 + 20, // 135 pts
        })
      );

      // Verify phase transitioned to P2_READY
      expect(session.getPhase()).toBe('P2_READY');

      // Verify p1_reveal_completed event emitted to room
      const completeEvent = emittedEvents.find((e) => e.event === 'p1_reveal_completed');
      expect(completeEvent).toBeDefined();
      expect(completeEvent?.room).toBe('room:FEUD-REV2');
      expect(completeEvent?.payload.phase).toBe('P2_READY');
      expect(completeEvent?.payload.totalScore).toBe(135);

      // Verify Player 2 snapshot has isOffstage: false
      const p2SnapshotEvent = emittedEvents
        .filter((e) => e.event === 'fast_money_p2_state')
        .pop();
      expect(p2SnapshotEvent?.payload.phase).toBe('P2_READY');
      expect(p2SnapshotEvent?.payload.isOffstage).toBe(false);
    });
  });
});

