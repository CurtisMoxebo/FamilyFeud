import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initFastMoneySession,
  getFastMoneySession,
  clearFastMoneyTimer,
  startAuthoritativeTimer,
  broadcastFastMoneyState,
  registerFastMoneyHandlers,
  fastMoneySessions,
  fastMoneyTimers,
} from '../src/sockets/fastMoneyHandler';
import { FastMoneyQuestionItem } from '../src/services/fastMoneySession';

describe('Fast Money Authoritative 60s Timer & WebSocket Lifecycle (US-07 Step 2)', () => {
  const mockQuestions: FastMoneyQuestionItem[] = [
    { id: 'q-1', questionText: 'Name a breakfast food', orderIndex: 1 },
    { id: 'q-2', questionText: 'Name something in the sky', orderIndex: 2 },
    { id: 'q-3', questionText: 'Name an animal in a zoo', orderIndex: 3 },
    { id: 'q-4', questionText: 'Name a day of the week', orderIndex: 4 },
    { id: 'q-5', questionText: 'Name a cold drink', orderIndex: 5 },
  ];

  let mockIo: any;
  let mockSocket: any;
  let emittedEvents: Array<{ event: string; room?: string; payload: any }> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    emittedEvents = [];

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
      on: vi.fn(),
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

  describe('Session Registry & Initialization', () => {
    it('initializes and registers session in registry with normalized room code', () => {
      const session = initFastMoneySession('feud-fm01', {
        gameId: 'game-1',
        player1Id: 'p1',
        player2Id: 'p2',
        questions: mockQuestions,
      });

      expect(session).toBeDefined();
      expect(session.roomCode).toBe('FEUD-FM01');
      expect(getFastMoneySession('FEUD-FM01')).toBe(session);
      expect(getFastMoneySession('feud-fm01')).toBe(session);
    });

    it('clears previous timer when re-initializing session for the same room', () => {
      const session1 = initFastMoneySession('FEUD-FM01', {
        gameId: 'game-1',
        player1Id: 'p1',
        player2Id: 'p2',
        questions: mockQuestions,
      });

      session1.startPlayer1Turn('p1');
      startAuthoritativeTimer(mockIo, session1);
      expect(fastMoneyTimers.has('FEUD-FM01')).toBe(true);

      // Re-initialize
      initFastMoneySession('FEUD-FM01', {
        gameId: 'game-2',
        player1Id: 'p1',
        player2Id: 'p2',
        questions: mockQuestions,
      });

      expect(fastMoneyTimers.has('FEUD-FM01')).toBe(false);
    });
  });

  describe('startAuthoritativeTimer (DoD Requirement: 60s timer server-side & broadcasts every 1s)', () => {
    it('broadcasts p1_turn_started and initial timer_tick immediately upon start', () => {
      const session = initFastMoneySession('FEUD-FM01', {
        gameId: 'game-1',
        player1Id: 'p1',
        player2Id: 'p2',
        questions: mockQuestions,
      });
      session.startPlayer1Turn('p1');

      startAuthoritativeTimer(mockIo, session);

      const turnStarted = emittedEvents.find((e) => e.event === 'p1_turn_started');
      expect(turnStarted).toBeDefined();
      expect(turnStarted?.payload.duration).toBe(60);
      expect(turnStarted?.payload.currentQuestionNumber).toBe(1);

      const firstTick = emittedEvents.find((e) => e.event === 'timer_tick');
      expect(firstTick).toBeDefined();
      expect(firstTick?.payload.secondsRemaining).toBe(60);
    });

    it('emits synchronized timer_tick every 1000ms until countdown reaches 0', () => {
      const session = initFastMoneySession('FEUD-FM01', {
        gameId: 'game-1',
        player1Id: 'p1',
        player2Id: 'p2',
        questions: mockQuestions,
      });
      session.startPlayer1Turn('p1');

      startAuthoritativeTimer(mockIo, session);

      // Advance by 5 seconds
      vi.advanceTimersByTime(5000);

      const ticks = emittedEvents.filter((e) => e.event === 'timer_tick');
      expect(ticks.length).toBeGreaterThanOrEqual(5);

      const latestTick = ticks[ticks.length - 1];
      expect(latestTick.payload.secondsRemaining).toBe(55);
    });

    it('auto-terminates turn and emits p1_turn_ended with TIME_EXPIRED when 60s elapse', () => {
      const session = initFastMoneySession('FEUD-FM01', {
        gameId: 'game-1',
        player1Id: 'p1',
        player2Id: 'p2',
        questions: mockQuestions,
      });
      session.startPlayer1Turn('p1');

      const onTurnEndSpy = vi.fn();
      startAuthoritativeTimer(mockIo, session, onTurnEndSpy);

      // Advance clock past 60 seconds
      vi.advanceTimersByTime(61000);

      expect(fastMoneyTimers.has('FEUD-FM01')).toBe(false);
      expect(session.isTurnFinished()).toBe(true);
      expect(session.getPhase()).toBe('P1_REVEAL');

      const turnEnded = emittedEvents.find((e) => e.event === 'p1_turn_ended');
      expect(turnEnded).toBeDefined();
      expect(turnEnded?.payload.reason).toBe('TIME_EXPIRED');
      expect(onTurnEndSpy).toHaveBeenCalledWith('TIME_EXPIRED');
    });
  });

  describe('WebSocket Handlers: player_ready (Scenario 1)', () => {
    it('starts turn and 60-second timer when Player 1 sends player_ready', () => {
      const session = initFastMoneySession('FEUD-FM01', {
        gameId: 'game-1',
        player1Id: 'p1-id',
        player2Id: 'p2-id',
        questions: mockQuestions,
      });

      // Capture socket listener
      const socketListeners: Record<string, Function> = {};
      mockSocket.on.mockImplementation((event: string, handler: Function) => {
        socketListeners[event] = handler;
      });

      registerFastMoneyHandlers(mockIo, mockSocket);

      const callbackSpy = vi.fn();
      socketListeners['player_ready'](
        { roomCode: 'FEUD-FM01', playerId: 'p1-id' },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({ success: true });
      expect(session.getPhase()).toBe('P1_PLAYING');
      expect(fastMoneyTimers.has('FEUD-FM01')).toBe(true);

      // Verifies broadcast of role snapshots
      expect(emittedEvents.some((e) => e.event === 'fast_money_p1_state')).toBe(true);
      expect(emittedEvents.some((e) => e.event === 'fast_money_p2_state')).toBe(true);
      expect(emittedEvents.some((e) => e.event === 'fast_money_host_state')).toBe(true);
    });

    it('rejects player_ready if sender is not Player 1', () => {
      initFastMoneySession('FEUD-FM01', {
        gameId: 'game-1',
        player1Id: 'p1-id',
        player2Id: 'p2-id',
        questions: mockQuestions,
      });

      const socketListeners: Record<string, Function> = {};
      mockSocket.on.mockImplementation((event: string, handler: Function) => {
        socketListeners[event] = handler;
      });

      registerFastMoneyHandlers(mockIo, mockSocket);

      const callbackSpy = vi.fn();
      socketListeners['player_ready'](
        { roomCode: 'FEUD-FM01', playerId: 'p2-id' }, // Player 2 tries to start
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Only Player 1 can start their Fast Money turn',
      });
      expect(emittedEvents.some((e) => e.event === 'room_error')).toBe(true);
      expect(fastMoneyTimers.has('FEUD-FM01')).toBe(false);
    });

    it('rejects player_ready if room session does not exist', () => {
      const socketListeners: Record<string, Function> = {};
      mockSocket.on.mockImplementation((event: string, handler: Function) => {
        socketListeners[event] = handler;
      });

      registerFastMoneyHandlers(mockIo, mockSocket);

      const callbackSpy = vi.fn();
      socketListeners['player_ready'](
        { roomCode: 'FEUD-NONEXISTENT', playerId: 'p1-id' },
        callbackSpy
      );

      expect(callbackSpy).toHaveBeenCalledWith({
        success: false,
        error: 'No active Fast Money session found for this room',
      });
    });
  });

  describe('broadcastFastMoneyState Snapshot Verification', () => {
    it('broadcasts sanitized snapshots tailored to Player 1, Player 2, and Host', () => {
      const session = initFastMoneySession('FEUD-FM01', {
        gameId: 'game-1',
        player1Id: 'p1',
        player2Id: 'p2',
        questions: mockQuestions,
      });
      session.startPlayer1Turn('p1');

      broadcastFastMoneyState(mockIo, session);

      const p1Event = emittedEvents.find((e) => e.event === 'fast_money_p1_state');
      expect(p1Event?.payload.currentQuestion.questionText).toBe('Name a breakfast food');

      const p2Event = emittedEvents.find((e) => e.event === 'fast_money_p2_state');
      expect(p2Event?.payload.isOffstage).toBe(true);
      expect(p2Event?.payload.isolationMessage).toContain('Look away');

      const hostEvent = emittedEvents.find((e) => e.event === 'fast_money_host_state');
      expect(hostEvent?.payload.slots).toHaveLength(5);
    });
  });
});

