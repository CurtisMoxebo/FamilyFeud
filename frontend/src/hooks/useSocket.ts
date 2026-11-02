import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { RoomStateUpdate, RoomErrorPayload, GameStartedPayload } from '../types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export interface UseSocketOptions {
  roomCode?: string;
  nickname?: string;
  isHost?: boolean;
  autoJoin?: boolean;
}

export function useSocket(options?: UseSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomStateUpdate | null>(null);
  const [roomError, setRoomError] = useState<RoomErrorPayload | null>(null);
  const [gameStarted, setGameStarted] = useState<GameStartedPayload | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const joinRoom = useCallback(
    (payload: { roomCode: string; nickname?: string; isHost?: boolean }) => {
      setRoomError(null);
      if (socketRef.current) {
        socketRef.current.emit('join_room', payload);
      }
    },
    []
  );

  const startGame = useCallback(
    (code?: string) => {
      setRoomError(null);
      if (socketRef.current) {
        socketRef.current.emit('start_game', { roomCode: code || options?.roomCode });
      }
    },
    [options?.roomCode]
  );

  const leaveRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('leave_room');
    }
    setRoomState(null);
    setRoomError(null);
    setGameStarted(null);
  }, []);

  const clearError = useCallback(() => {
    setRoomError(null);
  }, []);

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setSocketId(socket.id ?? null);

      if (options?.autoJoin && options.roomCode) {
        socket.emit('join_room', {
          roomCode: options.roomCode,
          nickname: options.nickname,
          isHost: options.isHost,
        });
      }
    });

    socket.on('disconnect', (_reason) => {
      setIsConnected(false);
      setSocketId(null);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    socket.on('room_state_update', (state: RoomStateUpdate) => {
      setRoomState(state);
      setRoomError(null);
    });

    socket.on('room_error', (err: RoomErrorPayload) => {
      setRoomError(err);
    });

    socket.on('game_started', (payload: GameStartedPayload) => {
      setGameStarted(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, [options?.autoJoin, options?.roomCode, options?.nickname, options?.isHost]);

  return {
    socket: socketRef.current,
    isConnected,
    socketId,
    roomState,
    roomError,
    gameStarted,
    joinRoom,
    startGame,
    leaveRoom,
    clearError,
  };
}
