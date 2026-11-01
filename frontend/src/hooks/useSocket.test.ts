import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSocket } from './useSocket';
import { io } from 'socket.io-client';

vi.mock('socket.io-client', () => {
  return {
    io: vi.fn(),
  };
});

describe('Frontend Regression Suite: useSocket Hook', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, Function>;

  beforeEach(() => {
    eventHandlers = {};
    mockSocket = {
      id: 'mock-socket-123',
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      }),
      disconnect: vi.fn(),
    };
    (io as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSocket);
  });

  it('initializes socket connection and registers event listeners', () => {
    const { result } = renderHook(() => useSocket());

    expect(io).toHaveBeenCalled();
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
    expect(result.current.isConnected).toBe(false);
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
});

