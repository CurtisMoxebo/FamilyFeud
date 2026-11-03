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
  GameOverPayload,
  TeamsAssignedPayload,
  FaceOffSessionState,
  BuzzerLockedPayload,
  BuzzerRejectedPayload,
  FaceOffTimeoutPayload,
  FaceOffResetPayload,
  FaceOffAnswerSubmittedPayload,
  PromptPassPlayPayload,
  RoundControlAssignedPayload,
  OpponentTurnPromptPayload,
  FaceOffBoardRevealPayload,
  TeamGuessingSessionState,
  StrikeIssuedPayload,
  RoundClearedPayload,
  TransitionStealPhasePayload,
  TeamTurnStartedPayload,
  TeamGuessResultPayload,
  MainGameBoardRevealPayload,
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
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);

  // Main Game Teams Assignment (US-11)
  const [teamsAssigned, setTeamsAssigned] = useState<TeamsAssignedPayload | null>(null);

  // Main Game Face-Off States (US-12)
  const [faceOffState, setFaceOffState] = useState<FaceOffSessionState | null>(null);
  const [buzzerLocked, setBuzzerLocked] = useState<BuzzerLockedPayload | null>(null);
  const [buzzerRejected, setBuzzerRejected] = useState<BuzzerRejectedPayload | null>(null);
  const [faceOffTimeout, setFaceOffTimeout] = useState<FaceOffTimeoutPayload | null>(null);
  const [faceOffReset, setFaceOffReset] = useState<FaceOffResetPayload | null>(null);
  const [faceOffAnswer, setFaceOffAnswer] = useState<FaceOffAnswerSubmittedPayload | null>(null);
  const [faceOffError, setFaceOffError] = useState<{ code: string; message: string } | null>(null);
  const [promptPassPlay, setPromptPassPlay] = useState<PromptPassPlayPayload | null>(null);
  const [roundControlAssigned, setRoundControlAssigned] = useState<RoundControlAssignedPayload | null>(null);
  const [opponentTurnPrompt, setOpponentTurnPrompt] = useState<OpponentTurnPromptPayload | null>(null);
  const [faceOffBoardReveal, setFaceOffBoardReveal] = useState<FaceOffBoardRevealPayload | null>(null);

  // Main Game Team Guessing & Strike Listeners (US-14)
  const [teamGuessingState, setTeamGuessingState] = useState<TeamGuessingSessionState | null>(null);
  const [strikeIssued, setStrikeIssued] = useState<StrikeIssuedPayload | null>(null);
  const [roundCleared, setRoundCleared] = useState<RoundClearedPayload | null>(null);
  const [transitionStealPhase, setTransitionStealPhase] = useState<TransitionStealPhasePayload | null>(null);
  const [teamTurnStarted, setTeamTurnStarted] = useState<TeamTurnStartedPayload | null>(null);
  const [teamGuessResult, setTeamGuessResult] = useState<TeamGuessResultPayload | null>(null);
  const [mainGameBoardReveal, setMainGameBoardReveal] = useState<MainGameBoardRevealPayload | null>(null);

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

  const startP2FastMoneyRevealPhase = useCallback((roomCode: string) => {
    socketRef.current?.emit('start_p2_reveal_phase', { roomCode, isHost: true });
  }, []);

  const revealP2FastMoneyAnswer = useCallback((roomCode: string, slotNumber: number) => {
    socketRef.current?.emit('reveal_p2_answer', { roomCode, slotNumber, isHost: true });
  }, []);

  const revealP2FastMoneyPoints = useCallback((roomCode: string, slotNumber: number) => {
    socketRef.current?.emit('reveal_p2_points', { roomCode, slotNumber, isHost: true });
  }, []);

  const requestReplay = useCallback((roomCode: string) => {
    socketRef.current?.emit('request_replay', { roomCode, isHost: true });
  }, []);

  const clearGameOver = useCallback(() => {
    setGameOver(null);
  }, []);

  const revealFastMoneyPoints = useCallback((roomCode: string, slotNumber: number) => {
    setRoomError(null);
    if (socketRef.current) {
      socketRef.current.emit('reveal_points', { roomCode, slotNumber, isHost: true });
    }
  }, []);

  // Main Game Face-Off Actions (US-12)
  const sendFaceOffReady = useCallback((roomCode: string, playerId: string) => {
    setFaceOffError(null);
    if (socketRef.current) {
      socketRef.current.emit('face_off_ready', { roomCode, playerId });
    }
  }, []);

  const pressBuzzer = useCallback(
    (roomCode: string, playerId: string, clientTimestamp?: number) => {
      setFaceOffError(null);
      if (socketRef.current) {
        socketRef.current.emit('press_buzzer', {
          roomCode,
          playerId,
          clientTimestamp: clientTimestamp || Date.now(),
        });
      }
    },
    []
  );

  const submitFaceOffAnswer = useCallback(
    (roomCode: string, playerId: string, questionId: string, rawAnswer: string) => {
      setFaceOffError(null);
      if (socketRef.current) {
        socketRef.current.emit('submit_face_off_answer', {
          roomCode,
          playerId,
          questionId,
          rawAnswer,
        });
      }
    },
    []
  );

  const choosePlayPass = useCallback(
    (roomCode: string, playerId: string, decision: 'play' | 'pass') => {
      setFaceOffError(null);
      if (socketRef.current) {
        socketRef.current.emit('choose_play_pass', {
          roomCode,
          playerId,
          decision,
        });
      }
    },
    []
  );

  const submitFaceOffGuess = useCallback(
    (roomCode: string, playerId: string, questionId: string, rawAnswer: string) => {
      setFaceOffError(null);
      if (socketRef.current) {
        socketRef.current.emit('submit_face_off_guess', {
          roomCode,
          playerId,
          questionId,
          rawAnswer,
        });
      }
    },
    []
  );

  const submitTeamGuess = useCallback(
    (roomCode: string, playerId: string, rawAnswer: string) => {
      setRoomError(null);
      if (socketRef.current) {
        socketRef.current.emit('submit_team_guess', {
          roomCode,
          playerId,
          rawAnswer,
        });
      }
    },
    []
  );

  const passTeamTurn = useCallback(
    (roomCode: string, playerId: string) => {
      setRoomError(null);
      if (socketRef.current) {
        socketRef.current.emit('pass_team_turn', {
          roomCode,
          playerId,
        });
      }
    },
    []
  );

  const getTeamGuessingState = useCallback(
    (roomCode: string) => {
      if (socketRef.current) {
        socketRef.current.emit('get_team_guessing_state', { roomCode });
      }
    },
    []
  );

  const clearFaceOffState = useCallback(() => {
    setFaceOffState(null);
    setBuzzerLocked(null);
    setBuzzerRejected(null);
    setFaceOffTimeout(null);
    setFaceOffReset(null);
    setFaceOffAnswer(null);
    setFaceOffError(null);
    setPromptPassPlay(null);
    setRoundControlAssigned(null);
    setOpponentTurnPrompt(null);
    setFaceOffBoardReveal(null);
    setPromptPassPlay(null);
    setRoundControlAssigned(null);
    setOpponentTurnPrompt(null);
    setFaceOffBoardReveal(null);
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
    setTeamsAssigned(null);
    setFaceOffState(null);
    setBuzzerLocked(null);
    setBuzzerRejected(null);
    setFaceOffTimeout(null);
    setFaceOffReset(null);
    setFaceOffAnswer(null);
    setFaceOffError(null);
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
      setGameOver(null);
      setP1RevealCompleted(null);
      setDuplicateWarning(null);
    });

    socket.on('game_replayed', () => {
      setGameOver(null);
      setP1RevealCompleted(null);
      setDuplicateWarning(null);
      setTeamsAssigned(null);
    });

    // Main Game Teams Assignment (US-11)
    socket.on('teams_assigned', (payload: TeamsAssignedPayload) => {
      setTeamsAssigned(payload);
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

    // Board Reveal Listeners (Fast Money US-08 & Main Game US-14)
    socket.on('board_reveal', (payload: BoardRevealPayload | MainGameBoardRevealPayload) => {
      if (payload && 'slot' in payload) {
        setBoardReveal(payload as BoardRevealPayload);
      } else if (payload && 'answerText' in payload) {
        setMainGameBoardReveal(payload as MainGameBoardRevealPayload);
      }
    });

    socket.on(
      'p1_reveal_completed',
      (payload: { roomCode: string; totalScore: number; phase: string }) => {
        setP1RevealCompleted(payload);
      }
    );

    // Fast Money Victory & Game Over (US-10)
    socket.on('game_over', (payload: GameOverPayload) => {
      setGameOver(payload);
    });

    // Main Game Face-Off Listeners (US-12)
    socket.on('face_off_state', (state: FaceOffSessionState) => {
      setFaceOffState(state);
    });

    socket.on('buzzer_locked', (payload: BuzzerLockedPayload) => {
      setBuzzerLocked(payload);
    });

    socket.on('buzzer_rejected', (payload: BuzzerRejectedPayload) => {
      setBuzzerRejected(payload);
    });

    socket.on('face_off_timeout', (payload: FaceOffTimeoutPayload) => {
      setFaceOffTimeout(payload);
    });

    socket.on('face_off_reset', (payload: FaceOffResetPayload) => {
      setFaceOffReset(payload);
    });

    socket.on('face_off_answer_submitted', (payload: FaceOffAnswerSubmittedPayload) => {
      setFaceOffAnswer(payload);
    });

    socket.on('face_off_error', (err: { code: string; message: string }) => {
      setFaceOffError(err);
    });

    socket.on('prompt_pass_play', (payload: PromptPassPlayPayload) => {
      setPromptPassPlay(payload);
    });

    socket.on('round_control_assigned', (payload: RoundControlAssignedPayload) => {
      setRoundControlAssigned(payload);
    });

    socket.on('opponent_turn_prompt', (payload: OpponentTurnPromptPayload) => {
      setOpponentTurnPrompt(payload);
    });

    socket.on('face_off_board_reveal', (payload: FaceOffBoardRevealPayload) => {
      setFaceOffBoardReveal(payload);
    });

    // Main Game Team Guessing Listeners (US-14)
    socket.on('team_guessing_state', (state: TeamGuessingSessionState) => {
      setTeamGuessingState(state);
    });

    socket.on('strike_issued', (payload: StrikeIssuedPayload) => {
      setStrikeIssued(payload);
    });

    socket.on('round_cleared', (payload: RoundClearedPayload) => {
      setRoundCleared(payload);
    });

    socket.on('transition_steal_phase', (payload: TransitionStealPhasePayload) => {
      setTransitionStealPhase(payload);
    });

    socket.on('team_turn_started', (payload: TeamTurnStartedPayload) => {
      setTeamTurnStarted(payload);
    });

    socket.on('team_guess_result', (payload: TeamGuessResultPayload) => {
      setTeamGuessResult(payload);
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
    teamsAssigned,
    faceOffState,
    buzzerLocked,
    buzzerRejected,
    faceOffTimeout,
    faceOffReset,
    faceOffAnswer,
    faceOffError,
    sendFaceOffReady,
    pressBuzzer,
    submitFaceOffAnswer,
    clearFaceOffState,
    promptPassPlay,
    roundControlAssigned,
    opponentTurnPrompt,
    faceOffBoardReveal,
    choosePlayPass,
    submitFaceOffGuess,
    teamGuessingState,
    strikeIssued,
    roundCleared,
    transitionStealPhase,
    teamTurnStarted,
    teamGuessResult,
    mainGameBoardReveal,
    submitTeamGuess,
    passTeamTurn,
    getTeamGuessingState,
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
    gameOver,
    clearGameOver,
    startP2FastMoneyRevealPhase,
    revealP2FastMoneyAnswer,
    revealP2FastMoneyPoints,
    requestReplay,
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
