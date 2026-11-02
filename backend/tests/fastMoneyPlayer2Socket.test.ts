import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initFastMoneySession,
  registerFastMoneyHandlers,
  clearFastMoneyTimer,
  fastMoneySessions,
  fastMoneyTimers,
  DuplicateAnswerWarningPayload,
  TurnEndedPayload,
} from '../src/sockets/fastMoneyHandler';
import { FastMoneyQuestionItem } from '../src/services/fastMoneySession';
import * as validationService from '../src/services/answerValidationService';

describe('Fast Money Player 2 Turn & Duplicate Check WebSocket Handlers (US-09 Step 2)', () => {
  const mockQuestions: FastMoneyQuestionItem[] = [
    {
      id: 'q-1',
      questionText: 'Name a caffeinated beverage',
      orderIndex: 1,
      answers: [
        { id: 'ans-1', answerText: 'Coffee', points: 40, rankOrder: 1 },
        { id: 'ans-2', answerText: 'Tea', points: 30, rankOrder: 2 },
        { id: 'ans-3', answerText: 'Energy Drink', points: 15, rankOrder: 3 },
      ],
    },
    {
      id: 'q-2',
      questionText: 'Name something in the sky',
      orderIndex: 2,
      answers: [{ id: 'ans-4', answerText: 'Sun', points: 50, rankOrder: 1 }],
    },
    {
      id: 'q-3',
      questionText: 'Name an animal in a zoo',
      orderIndex: 3,
      answers: [{ id: 'ans-5', answerText: 'Lion', points: 60, rankOrder: 1 }],
    },
    {
      id: 'q-4',
      questionText: 'Name a day of the week',
      orderIndex: 4,
      answers: [{ id: 'ans-6', answerText: 'Friday', points: 45, rankOrder: 1 }],
    },
    {
      id: 'q-5',
      questionText: 'Name a cold drink',
      orderIndex: 5,
      answers: [{ id: 'ans-7', answerText: 'Iced Water', points: 35, rankOrder: 1 }],
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
      id: 'socket-p2',
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

  function setupReadyForPlayer2Session() {
    const session = initFastMoneySession('FEUD-P201', {
      gameId: 'game-p2',
      player1Id: 'p1-id',
      player2Id: 'p2-id',
      questions: mockQuestions,
      timerDurationSeconds: 60,
      p2TimerDurationSeconds: 75,
      language: 'EN',
    });

    // Simulate Player 1 playing and completing
    session.startPlayer1Turn('p1-id');
    session.submitAnswer('p1-id', 'q-1', 'Coffee'); // matches ans-1
    session.recordEvaluation('q-1', 40, true, 'ans-1', 1);

    session.submitAnswer('p1-id', 'q-2', 'Sun');
    session.recordEvaluation('q-2', 50, true, 'ans-4', 1);

    session.submitAnswer('p1-id', 'q-3', 'Lion');
    session.recordEvaluation('q-3', 60, true, 'ans-5', 1);

    session.submitAnswer('p1-id', 'q-4', 'Friday');
    session.recordEvaluation('q-4', 45, true, 'ans-6', 1);

    session.submitAnswer('p1-id', 'q-5', 'Iced Water');
    session.recordEvaluation('q-5', 35, true, 'ans-7', 1);

    // Transition to reveal, then complete reveal to reach P2_READY
    session.startRevealPhase();
    for (let slot = 1; slot <= 5; slot++) {
      session.revealAnswer(slot);
      session.revealPoints(slot);
    }

    expect(session.getPhase()).toBe('P2_READY');
    registerFastMoneyHandlers(mockIo, mockSocket);

    return session;
  }

  describe('Scenario 1: 75-Second Countdown Initialization (player_ready)', () => {
    it('transitions to P2_PLAYING and starts 75s countdown when Player 2 clicks Ready', () => {
      const session = setupReadyForPlayer2Session();
      const callbackSpy = vi.fn();

      socketListeners['player_ready'](
        {
          roomCode: 'FEUD-P201',
          playerId: 'p2-id',
        },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({ success: true });
      expect(session.getPhase()).toBe('P2_PLAYING');
      expect(session.getCurrentQuestion()?.id).toBe('q-1');

      // Check p2_turn_started event
      const turnStarted = emittedEvents.find(
        (e) => e.event === 'p2_turn_started' && e.room === 'room:FEUD-P201'
      );
      expect(turnStarted).toBeDefined();
      expect(turnStarted?.payload).toMatchObject({
        roomCode: 'FEUD-P201',
        duration: 75,
        currentQuestionNumber: 1,
        questionText: 'Name a caffeinated beverage',
      });

      // Check timer_tick initial event
      const initialTick = emittedEvents.find(
        (e) => e.event === 'timer_tick' && e.room === 'room:FEUD-P201'
      );
      expect(initialTick).toBeDefined();
      expect(initialTick?.payload.secondsRemaining).toBe(75);

      // Verify state broadcast
      const p2State = emittedEvents.find(
        (e) => e.event === 'fast_money_p2_state' && e.room === 'player:p2-id'
      );
      expect(p2State).toBeDefined();
      expect(p2State?.payload.phase).toBe('P2_PLAYING');
      expect(p2State?.payload.canSubmit).toBe(true);
      expect(p2State?.payload.canPass).toBe(true);
    });

    it('rejects player_ready when called by someone other than Player 2 in P2_READY', () => {
      const session = setupReadyForPlayer2Session();
      const callbackSpy = vi.fn();

      socketListeners['player_ready'](
        {
          roomCode: 'FEUD-P201',
          playerId: 'p1-id', // Imposter or Player 1
        },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Only Player 2 can start their Fast Money turn',
      });
      expect(session.getPhase()).toBe('P2_READY');
    });

    it('rejects player_ready when phase is neither P1_READY nor P2_READY', () => {
      const session = setupReadyForPlayer2Session();
      session.setPhase('P2_PLAYING');
      const callbackSpy = vi.fn();

      socketListeners['player_ready'](
        {
          roomCode: 'FEUD-P201',
          playerId: 'p2-id',
        },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot start turn from phase P2_PLAYING',
      });
    });

    it('emits room_error when roomCode or playerId is missing', () => {
      setupReadyForPlayer2Session();
      const callbackSpy = vi.fn();

      socketListeners['player_ready']({}, callbackSpy);

      expect(callbackSpy).toHaveBeenCalledWith({
        success: false,
        error: 'roomCode and playerId are required',
      });
    });
  });

  describe('Scenario 2: Duplicate Answer Detection & Warning (submit_answer)', () => {
    it('detects direct duplicate when Player 2 submits same raw text as Player 1', async () => {
      const session = setupReadyForPlayer2Session();
      session.startPlayer2Turn('p2-id');

      const callbackSpy = vi.fn();
      await socketListeners['submit_answer'](
        {
          roomCode: 'FEUD-P201',
          playerId: 'p2-id',
          questionId: 'q-1',
          rawAnswer: 'coffee', // Player 1 gave "Coffee"
        },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('already given'),
        isFinished: false,
      });

      // Warning emitted to room and player
      const warningEvent = emittedEvents.find((e) => e.event === 'duplicate_answer_warning');
      expect(warningEvent).toBeDefined();
      const warning: DuplicateAnswerWarningPayload = warningEvent?.payload;
      expect(warning.rawInput).toBe('coffee');
      expect(warning.questionId).toBe('q-1');
      expect(warning.reason).toBe('EXACT_RAW');
      expect(warning.duplicateWithAnswer).toBe('Coffee');

      // Question DOES NOT advance
      expect(session.getCurrentQuestion()?.id).toBe('q-1');
      expect(session.getPlayer2AnsweredCount()).toBe(0);
    });

    it('detects semantic duplicate when Player 2 submits synonym matching same survey answer', async () => {
      const session = setupReadyForPlayer2Session();
      session.startPlayer2Turn('p2-id');

      // Mock US-06 validation resolving to ans-1 ("Coffee")
      vi.spyOn(validationService, 'evaluatePlayerAnswer').mockResolvedValueOnce({
        isMatched: true,
        matchedIndex: 0,
        matchedAnswer: mockQuestions[0].answers![0], // ans-1 Coffee
        pointsAwarded: 40,
        reasoning: 'Espresso is a type of coffee',
        tier: 'TIER_2_GEMINI',
        responseTimeSeconds: 0.15,
      });

      const callbackSpy = vi.fn();
      await socketListeners['submit_answer'](
        {
          roomCode: 'FEUD-P201',
          playerId: 'p2-id',
          questionId: 'q-1',
          rawAnswer: 'espresso',
        },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('already given'),
        isFinished: false,
      });

      const warningEvent = emittedEvents.find((e) => e.event === 'duplicate_answer_warning');
      expect(warningEvent).toBeDefined();
      const warning: DuplicateAnswerWarningPayload = warningEvent?.payload;
      expect(warning.rawInput).toBe('espresso');
      expect(warning.reason).toBe('SEMANTIC_MATCH');

      // Question DOES NOT advance
      expect(session.getCurrentQuestion()?.id).toBe('q-1');
      expect(session.getPlayer2AnsweredCount()).toBe(0);
    });

    it('rejects empty answer submission', async () => {
      const session = setupReadyForPlayer2Session();
      session.startPlayer2Turn('p2-id');

      const callbackSpy = vi.fn();
      await socketListeners['submit_answer'](
        {
          roomCode: 'FEUD-P201',
          playerId: 'p2-id',
          questionId: 'q-1',
          rawAnswer: '   ',
        },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot submit an empty answer',
      });
    });

    it('rejects submission from unauthorized player during Player 2 turn', async () => {
      const session = setupReadyForPlayer2Session();
      session.startPlayer2Turn('p2-id');

      const callbackSpy = vi.fn();
      await socketListeners['submit_answer'](
        {
          roomCode: 'FEUD-P201',
          playerId: 'p1-id',
          questionId: 'q-1',
          rawAnswer: 'Tea',
        },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized player for Player 2 turn',
      });
    });
  });

  describe('Scenario 3: Valid Alternate Answer Advances Queue', () => {
    it('accepts distinct answer, records evaluation, and advances to Question 2', async () => {
      const session = setupReadyForPlayer2Session();
      session.startPlayer2Turn('p2-id');

      vi.spyOn(validationService, 'evaluatePlayerAnswer').mockResolvedValueOnce({
        isMatched: true,
        matchedIndex: 1,
        matchedAnswer: mockQuestions[0].answers![1], // ans-2 Tea
        pointsAwarded: 30,
        reasoning: 'Exact match for Tea',
        tier: 'TIER_1_LOCAL',
        responseTimeSeconds: 0.01,
      });

      const callbackSpy = vi.fn();
      await socketListeners['submit_answer'](
        {
          roomCode: 'FEUD-P201',
          playerId: 'p2-id',
          questionId: 'q-1',
          rawAnswer: 'Tea',
        },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({ success: true, isFinished: false });

      // Advances to Question 2
      expect(session.getCurrentQuestion()?.id).toBe('q-2');
      expect(session.getPlayer2AnsweredCount()).toBe(1);

      // Verify evaluation recorded
      const evalRecord = session.getEvaluation('q-1', 2);
      expect(evalRecord?.pointsAwarded).toBe(30);
      expect(evalRecord?.isMatched).toBe(true);
      expect(evalRecord?.matchedAnswerId).toBe('ans-2');
    });

    it('completes turn when all 5 questions are answered by Player 2', async () => {
      const session = setupReadyForPlayer2Session();
      session.startPlayer2Turn('p2-id');

      vi.spyOn(validationService, 'evaluatePlayerAnswer').mockImplementation(async (req) => {
        return {
          isMatched: true,
          matchedIndex: 0,
          matchedAnswer: { id: `p2-distinct-${req.questionId}`, answerText: req.rawInput, points: 10, rankOrder: 1 },
          pointsAwarded: 10,
          reasoning: 'Distinct match',
          tier: 'TIER_1_LOCAL',
          responseTimeSeconds: 0.01,
        };
      });

      // Submit answers for all 5 questions
      await socketListeners['submit_answer']({
        roomCode: 'FEUD-P201',
        playerId: 'p2-id',
        questionId: 'q-1',
        rawAnswer: 'Tea',
      });
      await socketListeners['submit_answer']({
        roomCode: 'FEUD-P201',
        playerId: 'p2-id',
        questionId: 'q-2',
        rawAnswer: 'Cloud',
      });
      await socketListeners['submit_answer']({
        roomCode: 'FEUD-P201',
        playerId: 'p2-id',
        questionId: 'q-3',
        rawAnswer: 'Tiger',
      });
      await socketListeners['submit_answer']({
        roomCode: 'FEUD-P201',
        playerId: 'p2-id',
        questionId: 'q-4',
        rawAnswer: 'Monday',
      });

      const finalCallback = vi.fn();
      await socketListeners['submit_answer'](
        {
          roomCode: 'FEUD-P201',
          playerId: 'p2-id',
          questionId: 'q-5',
          rawAnswer: 'Lemonade',
        },
        finalCallback
      );

      expect(finalCallback).toHaveBeenCalledWith({ success: true, isFinished: true });
      expect(session.getPhase()).toBe('P2_FINISHED');
      expect(session.getPlayer2AnsweredCount()).toBe(5);

      const turnEndedEvent = emittedEvents.find(
        (e) => e.event === 'p2_turn_ended' && e.room === 'room:FEUD-P201'
      );
      expect(turnEndedEvent).toBeDefined();
      const payload: TurnEndedPayload = turnEndedEvent?.payload;
      expect(payload.reason).toBe('ALL_ANSWERED');
      expect(payload.answeredCount).toBe(5);
    });
  });

  describe('Scenario 4: Player 2 Passing and Returning (pass_question)', () => {
    it('moves passed question to end of queue and returns next active question', () => {
      const session = setupReadyForPlayer2Session();
      session.startPlayer2Turn('p2-id');

      const callbackSpy = vi.fn();
      socketListeners['pass_question'](
        {
          roomCode: 'FEUD-P201',
          playerId: 'p2-id',
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
      expect(session.getPassedCount('p2-id')).toBe(1);
    });

    it('rejects pass_question from non-Player 2 during P2_PLAYING', () => {
      const session = setupReadyForPlayer2Session();
      session.startPlayer2Turn('p2-id');

      const callbackSpy = vi.fn();
      socketListeners['pass_question'](
        {
          roomCode: 'FEUD-P201',
          playerId: 'p1-id',
          questionId: 'q-1',
        },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Cannot pass question'),
      });
    });
  });

  describe('Scenario 5: Authoritative 75-Second Timer Expiration', () => {
    it('emits ticks and terminates Player 2 turn when 75 seconds elapse', () => {
      const session = setupReadyForPlayer2Session();

      socketListeners['player_ready']({
        roomCode: 'FEUD-P201',
        playerId: 'p2-id',
      });

      expect(session.getPhase()).toBe('P2_PLAYING');

      // Advance by 74 seconds
      vi.advanceTimersByTime(74000);
      expect(session.getPhase()).toBe('P2_PLAYING');

      // Advance by 2 more seconds (completes 75s)
      vi.advanceTimersByTime(2000);

      expect(session.getPhase()).toBe('P2_FINISHED');
      const turnEnded = emittedEvents.find(
        (e) => e.event === 'p2_turn_ended' && e.room === 'room:FEUD-P201'
      );
      expect(turnEnded).toBeDefined();
      expect(turnEnded?.payload.reason).toBe('TIME_EXPIRED');
    });
  });
});
