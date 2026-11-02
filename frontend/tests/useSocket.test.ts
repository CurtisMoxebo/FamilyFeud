import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSocket } from '../src/hooks/useSocket';
import { io } from 'socket.io-client';
import { RoomStateUpdate, RoomErrorPayload, GameStartedPayload, BoardRevealPayload } from '../src/types';

vi.mock('socket.io-client', () => {
  return {
    io: vi.fn(),
  };
});

describe('Frontend Regression Suite: useSocket Hook (US-04)', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, Function>;

  beforeEach(() => {
    eventHandlers = {};
    mockSocket = {
      id: 'mock-socket-123',
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
    (io as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSocket);
  });

  it('initializes socket connection and registers all event listeners', () => {
    const { result } = renderHook(() => useSocket());

    expect(io).toHaveBeenCalled();
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('room_state_update', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('room_error', expect.any(Function));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.roomState).toBeNull();
    expect(result.current.roomError).toBeNull();
  });

  it('updates state when connected', () => {
    const { result } = renderHook(() => useSocket());

    act(() => {
      eventHandlers['connect']();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.socketId).toBe('mock-socket-123');
  });

  it('updates state when disconnected', () => {
    const { result } = renderHook(() => useSocket());

    act(() => {
      eventHandlers['connect']();
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      eventHandlers['disconnect']('transport close');
    });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.socketId).toBeNull();
  });

  it('calls disconnect on unmount', () => {
    const { unmount } = renderHook(() => useSocket());
    unmount();
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('updates roomState when room_state_update event fires', () => {
    const { result } = renderHook(() => useSocket());

    const mockState: RoomStateUpdate = {
      roomCode: 'FEUD-8291',
      roomName: 'Family Game Night',
      language: 'EN',
      gameMode: 'FAST_MONEY',
      status: 'LOBBY',
      playerCount: 1,
      maxPlayers: 2,
      canStart: false,
      startDisabledReason: 'Waiting for 2 players (current: 1/2)',
      players: [
        {
          id: 'p-1',
          nickname: 'Sarah',
          team: 'NONE',
          isReady: true,
          isConnected: true,
        },
      ],
    };

    act(() => {
      eventHandlers['room_state_update'](mockState);
    });

    expect(result.current.roomState).toEqual(mockState);
    expect(result.current.roomError).toBeNull();
  });

  it('updates roomError when room_error event fires', () => {
    const { result } = renderHook(() => useSocket());

    const mockError: RoomErrorPayload = {
      code: 'ROOM_FULL',
      message: 'This Fast Money room is already full (2/2 players).',
    };

    act(() => {
      eventHandlers['room_error'](mockError);
    });

    expect(result.current.roomError).toEqual(mockError);

    // clearError clears roomError
    act(() => {
      result.current.clearError();
    });
    expect(result.current.roomError).toBeNull();
  });

  it('emits join_room when joinRoom is called', () => {
    const { result } = renderHook(() => useSocket());

    act(() => {
      result.current.joinRoom({ roomCode: 'FEUD-9999', nickname: 'Alex', isHost: false });
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', {
      roomCode: 'FEUD-9999',
      nickname: 'Alex',
      isHost: false,
    });
  });

  it('auto-joins room on connect when autoJoin is enabled', () => {
    renderHook(() =>
      useSocket({
        roomCode: 'FEUD-7777',
        isHost: true,
        autoJoin: true,
      })
    );

    act(() => {
      eventHandlers['connect']();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', {
      roomCode: 'FEUD-7777',
      nickname: undefined,
      isHost: true,
    });
  });

  it('emits leave_room and resets state when leaveRoom is called', () => {
    const { result } = renderHook(() => useSocket());

    act(() => {
      result.current.leaveRoom();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('leave_room');
    expect(result.current.roomState).toBeNull();
    expect(result.current.roomError).toBeNull();
    expect(result.current.gameStarted).toBeNull();
  });

  it('emits start_game when startGame is called', () => {
    const { result } = renderHook(() => useSocket({ roomCode: 'FEUD-7777' }));

    act(() => {
      result.current.startGame();
    });
    expect(mockSocket.emit).toHaveBeenCalledWith('start_game', { roomCode: 'FEUD-7777' });

    act(() => {
      result.current.startGame('FEUD-9999');
    });
    expect(mockSocket.emit).toHaveBeenCalledWith('start_game', { roomCode: 'FEUD-9999' });
  });

  it('updates gameStarted when game_started event fires', () => {
    const { result } = renderHook(() => useSocket());

    const mockGameStarted: GameStartedPayload = {
      gameId: 'game-123',
      roomCode: 'FEUD-7777',
      gameMode: 'FAST_MONEY',
      language: 'FR',
      currentRound: 1,
      status: 'IN_PROGRESS',
      questionCount: 5,
      firstQuestion: {
        id: 'q-1',
        questionText: 'Nommez un aliment dans le frigo',
        answerCount: 6,
      },
    };

    act(() => {
      eventHandlers['game_started'](mockGameStarted);
    });

    expect(result.current.gameStarted).toEqual(mockGameStarted);
  });

  describe('Fast Money Reveal Sequence Socket Methods (US-08 Step 2)', () => {
    it('emits start_reveal_phase, reveal_answer, and reveal_points', () => {
      const { result } = renderHook(() => useSocket());

      act(() => {
        result.current.startFastMoneyRevealPhase('FEUD-REV1');
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('start_reveal_phase', {
        roomCode: 'FEUD-REV1',
        isHost: true,
      });

      act(() => {
        result.current.revealFastMoneyAnswer('FEUD-REV1', 1);
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('reveal_answer', {
        roomCode: 'FEUD-REV1',
        slotNumber: 1,
        isHost: true,
      });

      act(() => {
        result.current.revealFastMoneyPoints('FEUD-REV1', 1);
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('reveal_points', {
        roomCode: 'FEUD-REV1',
        slotNumber: 1,
        isHost: true,
      });
    });

    it('updates boardReveal and p1RevealCompleted on incoming socket events', () => {
      const { result } = renderHook(() => useSocket());

      const mockReveal: BoardRevealPayload = {
        roomCode: 'FEUD-REV1',
        type: 'ANSWER',
        slotNumber: 1,
        slot: {
          slotNumber: 1,
          questionId: 'q-1',
          questionText: 'Name breakfast food',
          rawAnswer: 'Eggs',
          pointsAwarded: 0,
          isAnswerRevealed: true,
          isPointsRevealed: false,
          isMatched: false,
        },
        totalScore: 0,
        isAllRevealed: false,
        nextActiveSlotNumber: 1,
      };

      act(() => {
        eventHandlers['board_reveal'](mockReveal);
      });
      expect(result.current.boardReveal).toEqual(mockReveal);

      const mockCompleted = {
        roomCode: 'FEUD-REV1',
        totalScore: 120,
        phase: 'P2_READY',
      };

      act(() => {
        eventHandlers['p1_reveal_completed'](mockCompleted);
      });
      expect(result.current.p1RevealCompleted).toEqual(mockCompleted);

      // Verify leaveRoom clears reveal states
      act(() => {
        result.current.leaveRoom();
      });
      expect(result.current.boardReveal).toBeNull();
      expect(result.current.p1RevealCompleted).toBeNull();
    });
  });
});
