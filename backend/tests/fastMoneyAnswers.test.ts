import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initFastMoneySession,
  registerFastMoneyHandlers,
  clearFastMoneyTimer,
  fastMoneySessions,
  fastMoneyTimers,
} from '../src/sockets/fastMoneyHandler';
import { FastMoneyQuestionItem } from '../src/services/fastMoneySession';
import * as validationService from '../src/services/answerValidationService';

describe('Fast Money Answer Submission & Pass Handlers (US-07 Step 3)', () => {
  const mockQuestions: FastMoneyQuestionItem[] = [
    {
      id: 'q-1',
      questionText: 'Name a breakfast food',
      orderIndex: 1,
      answers: [
        { id: 'ans-1', answerText: 'Eggs', points: 40, rankOrder: 1 },
        { id: 'ans-2', answerText: 'Pancakes', points: 30, rankOrder: 2 },
      ],
    },
    {
      id: 'q-2',
      questionText: 'Name something in the sky',
      orderIndex: 2,
      answers: [{ id: 'ans-3', answerText: 'Sun', points: 50, rankOrder: 1 }],
    },
    {
      id: 'q-3',
      questionText: 'Name an animal in a zoo',
      orderIndex: 3,
      answers: [{ id: 'ans-4', answerText: 'Lion', points: 60, rankOrder: 1 }],
    },
    {
      id: 'q-4',
      questionText: 'Name a day of the week',
      orderIndex: 4,
      answers: [{ id: 'ans-5', answerText: 'Friday', points: 45, rankOrder: 1 }],
    },
    {
      id: 'q-5',
      questionText: 'Name a cold drink',
      orderIndex: 5,
      answers: [{ id: 'ans-6', answerText: 'Iced Tea', points: 35, rankOrder: 1 }],
    },
  ];

  let mockIo: any;
  let mockSocket: any;
  let emittedEvents: Array<{ event: string; room?: string; payload: any }> = [];
  let socketListeners: Record<string, Function> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    emittedEvents = [];
    socketListeners = {};

    mockIo = {
      to: vi.fn().mockImplementation((room: string) => ({
        emit: vi.fn().mockImplementation((event: string, payload: any) => {
          emittedEvents.push({ event, room, payload });
        }),
      })),
    };

    mockSocket = {
      id: 'socket-p1',
      emit: vi.fn().mockImplementation((event: string, payload: any) => {
        emittedEvents.push({ event, payload });
      }),
      on: vi.fn().mockImplementation((event: string, handler: Function) => {
        socketListeners[event] = handler;
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

  describe('submit_answer (Scenario 2: Non-Blocking Immediate Advancement)', () => {
    it('records submission, immediately advances to Question 2, and triggers US-06 in background', async () => {
      const evaluateSpy = vi
        .spyOn(validationService, 'evaluatePlayerAnswer')
        .mockResolvedValueOnce({
          isMatched: true,
          matchedIndex: 0,
          matchedAnswer: mockQuestions[0].answers![0],
          pointsAwarded: 40,
          reasoning: 'Exact match',
          tier: 'TIER_1_LOCAL',
          responseTimeSeconds: 0.01,
        });

      const session = initFastMoneySession('FEUD-FM01', {
        gameId: 'game-1',
        player1Id: 'p1-id',
        player2Id: 'p2-id',
        questions: mockQuestions,
        language: 'EN',
      });
      session.startPlayer1Turn('p1-id');

      registerFastMoneyHandlers(mockIo, mockSocket);

      const callbackSpy = vi.fn();
      await socketListeners['submit_answer'](
        {
          roomCode: 'FEUD-FM01',
          playerId: 'p1-id',
          questionId: 'q-1',
          rawAnswer: 'Eggs',
        },
        callbackSpy
      );

      // 1. Immediate response via callback
      expect(callbackSpy).toHaveBeenCalledWith({
        success: true,
        isFinished: false,
      });

      // 2. Queue advanced to Q2 immediately
      expect(session.getCurrentQuestion()?.id).toBe('q-2');
      expect(session.getAnsweredCount()).toBe(1);

      // 3. Broadcasts updated state to Host and Player 1
      const p1State = emittedEvents.find(
        (e) => e.event === 'fast_money_p1_state' && e.payload.currentQuestion?.id === 'q-2'
      );
      expect(p1State).toBeDefined();

      // Host board shows Slot 1 filled, but strictly hides the answer text/points
      const hostState = emittedEvents.find((e) => e.event === 'fast_money_host_state');
      expect(hostState?.payload.slots[0]).toEqual({ slotNumber: 1, isFilled: true });
      expect((hostState?.payload as any).rawAnswers).toBeUndefined();

      // 4. Background validation was invoked
      expect(evaluateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          questionId: 'q-1',
          playerId: 'p1-id',
          rawInput: 'Eggs',
          language: 'EN',
          persistAudit: true,
        })
      );
    });

    it('terminates turn and broadcasts p1_turn_ended with ALL_ANSWERED when question 5 is answered', async () => {
      vi.spyOn(validationService, 'evaluatePlayerAnswer').mockResolvedValue({
        isMatched: true,
        matchedIndex: 0,
        matchedAnswer: null,
        pointsAwarded: 10,
        reasoning: 'Match',
        tier: 'TIER_1_LOCAL',
        responseTimeSeconds: 0.01,
      });

      const session = initFastMoneySession('FEUD-FM01', {
        gameId: 'game-1',
        player1Id: 'p1-id',
        player2Id: 'p2-id',
        questions: mockQuestions,
      });
      session.startPlayer1Turn('p1-id');

      registerFastMoneyHandlers(mockIo, mockSocket);

      // Submit all 5 questions sequentially
      for (let i = 1; i <= 5; i++) {
        await socketListeners['submit_answer']({
          roomCode: 'FEUD-FM01',
          playerId: 'p1-id',
          questionId: `q-${i}`,
          rawAnswer: `Answer ${i}`,
        });
      }

      expect(session.isAllAnswered()).toBe(true);
      expect(session.isTurnFinished()).toBe(true);
      expect(session.getPhase()).toBe('P1_REVEAL');

      const turnEnded = emittedEvents.find((e) => e.event === 'p1_turn_ended');
      expect(turnEnded).toBeDefined();
      expect(turnEnded?.payload.reason).toBe('ALL_ANSWERED');
      expect(turnEnded?.payload.answeredCount).toBe(5);
    });

    it('rejects submission if questionId does not match active question', async () => {
      const session = initFastMoneySession('FEUD-FM01', {
        gameId: 'game-1',
        player1Id: 'p1-id',
        player2Id: 'p2-id',
        questions: mockQuestions,
      });
      session.startPlayer1Turn('p1-id');

      registerFastMoneyHandlers(mockIo, mockSocket);

      const callbackSpy = vi.fn();
      await socketListeners['submit_answer'](
        {
          roomCode: 'FEUD-FM01',
          playerId: 'p1-id',
          questionId: 'q-4', // Active is q-1!
          rawAnswer: 'Friday',
        },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Submitted questionId does not match current active question',
      });
      expect(emittedEvents.some((e) => e.event === 'room_error')).toBe(true);
    });
  });

  describe('pass_question (Scenario 3: Pass & Question Recycling)', () => {
    it('moves passed question to passedQueue and advances to next question', () => {
      const session = initFastMoneySession('FEUD-FM01', {
        gameId: 'game-1',
        player1Id: 'p1-id',
        player2Id: 'p2-id',
        questions: mockQuestions,
      });
      session.startPlayer1Turn('p1-id');

      registerFastMoneyHandlers(mockIo, mockSocket);

      const callbackSpy = vi.fn();
      socketListeners['pass_question'](
        {
          roomCode: 'FEUD-FM01',
          playerId: 'p1-id',
          questionId: 'q-1',
        },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({
        success: true,
        nextQuestionId: 'q-2',
        passedCount: 1,
      });

      expect(session.getCurrentQuestion()?.id).toBe('q-2');
      expect(session.getPassedCount()).toBe(1);

      // Broadcasts updated state
      const p1State = emittedEvents.find(
        (e) => e.event === 'fast_money_p1_state' && e.payload.currentQuestion?.id === 'q-2'
      );
      expect(p1State).toBeDefined();
    });

    it('returns error if missing required parameters', () => {
      initFastMoneySession('FEUD-FM01', {
        gameId: 'game-1',
        player1Id: 'p1-id',
        player2Id: 'p2-id',
        questions: mockQuestions,
      });

      registerFastMoneyHandlers(mockIo, mockSocket);

      const callbackSpy = vi.fn();
      socketListeners['pass_question'](
        {
          roomCode: 'FEUD-FM01',
          playerId: 'p1-id',
          // missing questionId
        },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({
        success: false,
        error: 'roomCode, playerId, and questionId are required',
      });
    });
  });
});

