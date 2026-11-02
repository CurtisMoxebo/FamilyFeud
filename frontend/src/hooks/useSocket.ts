import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  RoomStateUpdate,
  RoomErrorPayload,
  GameStartedPayload,
  Player1StateSnapshot,
  Player2IsolationSnapshot,
  HostStateSnapshot,
  TimerTickPayload,
  TurnEndedPayload,
  BoardRevealPayload,
  DuplicateAnswerWarningPayload,
} from '../types';

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

  // Fast Money Speed Round States (US-07 & US-09)
  const [fastMoneyP1State, setFastMoneyP1State] = useState<Player1StateSnapshot | null>(null);
  const [fastMoneyP2State, setFastMoneyP2State] = useState<Player2IsolationSnapshot | null>(null);
  const [fastMoneyHostState, setFastMoneyHostState] = useState<HostStateSnapshot | null>(null);
  const [timerTick, setTimerTick] = useState<TimerTickPayload | null>(null);
  const [turnEnded, setTurnEnded] = useState<TurnEndedPayload | null>(null);
  const [p2TurnStarted, setP2TurnStarted] = useState<{
    roomCode: string;
    endsAt: number;
    duration: number;
    currentQuestionNumber: number;
    questionText: string;
  } | null>(null);
  const [p2TurnEnded, setP2TurnEnded] = useState<TurnEndedPayload | null>(null);

  // Fast Money Duplicate Answer Warning (US-09)
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateAnswerWarningPayload | null>(
    null
  );

  // Fast Money Reveal Sequence States (US-08)
  const [boardReveal, setBoardReveal] = useState<BoardRevealPayload | null>(null);
  const [p1RevealCompleted, setP1RevealCompleted] = useState<{
    roomCode: string;
    totalScore: number;
    phase: string;
  } | null>(null);

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

  const sendPlayerReady = useCallback((roomCode: string, playerId: string) => {
    setRoomError(null);
    if (socketRef.current) {
      socketRef.current.emit('player_ready', { roomCode, playerId });
    }
  }, []);

  const submitFastMoneyAnswer = useCallback(
    (roomCode: string, playerId: string, questionId: string, rawAnswer: string) => {
      setRoomError(null);
      if (socketRef.current) {
        socketRef.current.emit('submit_answer', {
          roomCode,
          playerId,
          questionId,
          rawAnswer,
        });
      }
    },
    []
  );

  const passFastMoneyQuestion = useCallback(
    (roomCode: string, playerId: string, questionId: string) => {
      setRoomError(null);
      if (socketRef.current) {
        socketRef.current.emit('pass_question', {
          roomCode,
          playerId,
          questionId,
        });
      }
    },
    []
  );

  const clearDuplicateWarning = useCallback(() => {
    setDuplicateWarning(null);
  }, []);

  // Fast Money Reveal Triggers (US-08)
  const startFastMoneyRevealPhase = useCallback((roomCode: string) => {
    setRoomError(null);
    if (socketRef.current) {
      socketRef.current.emit('start_reveal_phase', { roomCode, isHost: true });
    }
  }, []);

  const revealFastMoneyAnswer = useCallback((roomCode: string, slotNumber: number) => {
    setRoomError(null);
    if (socketRef.current) {
      socketRef.current.emit('reveal_answer', { roomCode, slotNumber, isHost: true });
    }
  }, []);

  const revealFastMoneyPoints = useCallback((roomCode: string, slotNumber: number) => {
    setRoomError(null);
    if (socketRef.current) {
      socketRef.current.emit('reveal_points', { roomCode, slotNumber, isHost: true });
    }
  }, []);

  const leaveRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('leave_room');
    }
    setRoomState(null);
    setRoomError(null);
    setGameStarted(null);
    setFastMoneyP1State(null);
    setFastMoneyP2State(null);
    setFastMoneyHostState(null);
    setTimerTick(null);
    setTurnEnded(null);
    setP2TurnStarted(null);
    setP2TurnEnded(null);
    setDuplicateWarning(null);
    setBoardReveal(null);
    setP1RevealCompleted(null);
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

    // Fast Money Speed Round Listeners (US-07 & US-09)
    socket.on('fast_money_p1_state', (state: Player1StateSnapshot) => {
      setFastMoneyP1State(state);
    });

    socket.on('fast_money_p2_state', (state: Player2IsolationSnapshot) => {
      setFastMoneyP2State(state);
    });

    socket.on('fast_money_host_state', (state: HostStateSnapshot) => {
      setFastMoneyHostState(state);
    });

    socket.on('timer_tick', (tick: TimerTickPayload) => {
      setTimerTick(tick);
    });

    socket.on('p1_turn_ended', (payload: TurnEndedPayload) => {
      setTurnEnded(payload);
    });

    socket.on(
      'p2_turn_started',
      (payload: {
        roomCode: string;
        endsAt: number;
        duration: number;
        currentQuestionNumber: number;
        questionText: string;
      }) => {
        setP2TurnStarted(payload);
      }
    );

    socket.on('p2_turn_ended', (payload: TurnEndedPayload) => {
      setTurnEnded(payload);
      setP2TurnEnded(payload);
    });

    // Fast Money Duplicate Answer Warning (US-09)
    socket.on('duplicate_answer_warning', (warning: DuplicateAnswerWarningPayload) => {
      setDuplicateWarning(warning);
    });

    // Fast Money Reveal Sequence Listeners (US-08)
    socket.on('board_reveal', (payload: BoardRevealPayload) => {
      setBoardReveal(payload);
    });

    socket.on(
      'p1_reveal_completed',
      (payload: { roomCode: string; totalScore: number; phase: string }) => {
        setP1RevealCompleted(payload);
      }
    );

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
    fastMoneyP1State,
    fastMoneyP2State,
    fastMoneyHostState,
    timerTick,
    turnEnded,
    p2TurnStarted,
    p2TurnEnded,
    duplicateWarning,
    boardReveal,
    p1RevealCompleted,
    joinRoom,
    startGame,
    sendPlayerReady,
    submitFastMoneyAnswer,
    passFastMoneyQuestion,
    clearDuplicateWarning,
    startFastMoneyRevealPhase,
    revealFastMoneyAnswer,
    revealFastMoneyPoints,
    leaveRoom,
    clearError,
  };
}
