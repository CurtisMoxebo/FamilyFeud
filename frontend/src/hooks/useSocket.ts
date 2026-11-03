import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  saveHostSecret,
  savePlayerSession,
  getHostSecret,
  getPlayerSession,
  clearPlayerSession,
  PlayerSessionCredentials,
} from '../utils/sessionStorage';
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
  StealResolvedPayload,
  RoundWinnerPayload,
  ScoreboardUpdatePayload,
  MatchOverPayload,
  SuddenDeathInitiatedPayload,
  NextRoundStartedPayload,
  ReconnectAcknowledgedPayload,
  PlayerLeftAlertPayload,
  PlayerKickedPayload,
  GamePausedPayload,
  GameResumedPayload,
  StrikeCancelledPayload,
  AdminErrorPayload,
  HostOverrideAnswerOption,
  HostOverrideOptionsPayload,
  AnswerOverridePayload,
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
  const [stealResolved, setStealResolved] = useState<StealResolvedPayload | null>(null);
  const [roundWinner, setRoundWinner] = useState<RoundWinnerPayload | null>(null);
  const [scoreboardState, setScoreboardState] = useState<ScoreboardUpdatePayload | null>(null);
  const [matchOver, setMatchOver] = useState<MatchOverPayload | null>(null);
  const [suddenDeathInitiated, setSuddenDeathInitiated] = useState<SuddenDeathInitiatedPayload | null>(null);
  const [nextRoundStarted, setNextRoundStarted] = useState<NextRoundStartedPayload | null>(null);
  const [playerSession, setPlayerSession] = useState<PlayerSessionCredentials | null>(() => {
    return getPlayerSession(options?.roomCode);
  });
  const [hostSecret, setHostSecret] = useState<string | null>(() => {
    return getHostSecret(options?.roomCode);
  });
  const [playerLeftAlert, setPlayerLeftAlert] = useState<PlayerLeftAlertPayload | null>(null);
  const [kickedInfo, setKickedInfo] = useState<PlayerKickedPayload | null>(null);
  const [gamePaused, setGamePaused] = useState<GamePausedPayload | null>(null);
  const [adminError, setAdminError] = useState<AdminErrorPayload | null>(null);
  const [hostOverrideOptions, setHostOverrideOptions] = useState<HostOverrideAnswerOption[]>([]);
  const [answerOverrideAck, setAnswerOverrideAck] = useState<AnswerOverridePayload | null>(null);


  const socketRef = useRef<Socket | null>(null);

  const reconnectHost = useCallback(
    (roomCode: string, secret?: string) => {
      const key = secret || getHostSecret(roomCode);
      if (socketRef.current && key) {
        socketRef.current.emit('reconnect_host', {
          roomCode,
          hostSecret: key,
        });
      }
    },
    []
  );

  const reconnectSession = useCallback(
    (roomCode: string, playerId: string, sessionToken: string) => {
      setRoomError(null);
      if (socketRef.current) {
        socketRef.current.emit('reconnect_session', {
          roomCode,
          playerId,
          sessionToken,
        });
      }
    },
    []
  );

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

  const submitStealGuess = useCallback(
    (
      roomCode: string,
      playerId: string,
      rawAnswer: string,
      callback?: (res: { success: boolean; outcome?: string; stealSuccess?: boolean; error?: string }) => void
    ) => {
      setRoomError(null);
      if (socketRef.current) {
        socketRef.current.emit(
          'submit_steal_guess',
          { roomCode, playerId, rawAnswer },
          callback
        );
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

  const advanceNextRound = useCallback((roomCode: string) => {
    setRoomError(null);
    if (socketRef.current) {
      socketRef.current.emit('advance_next_round', { roomCode });
    }
  }, []);

  const getScoreboardState = useCallback((roomCode: string) => {
    if (socketRef.current) {
      socketRef.current.emit('get_scoreboard_state', { roomCode });
    }
  }, []);

  const clearMatchOver = useCallback(() => {
    setMatchOver(null);
  }, []);

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
    setHostOverrideOptions([]);
    setAnswerOverrideAck(null);
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
        if (options.isHost) {
          const storedHostSecret = getHostSecret(options.roomCode);
          if (storedHostSecret) {
            socket.emit('reconnect_host', {
              roomCode: options.roomCode,
              hostSecret: storedHostSecret,
            });
            return;
          }
          socket.emit('join_room', {
            roomCode: options.roomCode,
            nickname: options.nickname,
            isHost: true,
          });
        } else {
          // Player reconnection flow (US-20 Scenario 2 & 3)
          const storedSession = getPlayerSession(options.roomCode);
          if (storedSession && storedSession.sessionToken && storedSession.playerId) {
            socket.emit('reconnect_session', {
              roomCode: options.roomCode,
              playerId: storedSession.playerId,
              sessionToken: storedSession.sessionToken,
            });
            return;
          }
          if (options.nickname) {
            socket.emit('join_room', {
              roomCode: options.roomCode,
              nickname: options.nickname,
              isHost: false,
            });
          }
        }
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
      setMatchOver(null);
      setSuddenDeathInitiated(null);
      setP1RevealCompleted(null);
      setDuplicateWarning(null);
      setHostOverrideOptions([]);
      setAnswerOverrideAck(null);
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
      if (state.phase === 'TEAM_GUESSING' && state.strikes < 3) {
        setTransitionStealPhase(null);
      }
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

    socket.on('steal_resolved', (payload: StealResolvedPayload) => {
      setStealResolved(payload);
    });

    socket.on('round_winner', (payload: RoundWinnerPayload) => {
      setRoundWinner(payload);
    });

    socket.on('scoreboard_update', (payload: ScoreboardUpdatePayload) => {
      setScoreboardState(payload);
    });

    socket.on('match_over', (payload: MatchOverPayload) => {
      setMatchOver(payload);
    });

    socket.on('sudden_death_initiated', (payload: SuddenDeathInitiatedPayload) => {
      setSuddenDeathInitiated(payload);
    });

    socket.on('next_round_started', (payload: NextRoundStartedPayload) => {
      setNextRoundStarted(payload);
      setHostOverrideOptions([]);
      setAnswerOverrideAck(null);
    });
    socket.on('session_granted', (payload: PlayerSessionCredentials) => {
      savePlayerSession(payload);
      setPlayerSession(payload);
    });

    socket.on('host_secret_granted', (payload: { roomCode: string; hostSecret: string }) => {
      saveHostSecret(payload.hostSecret, payload.roomCode);
      setHostSecret(payload.hostSecret);
    });

    socket.on('reconnect_acknowledged', (payload: ReconnectAcknowledgedPayload) => {
      if (payload.success && payload.gameState) {
        const gs = payload.gameState;
        if (gs.room) setRoomState(gs.room);
        if (gs.teamsAssigned) setTeamsAssigned(gs.teamsAssigned);
        if (gs.faceOffState) setFaceOffState(gs.faceOffState);
        if (gs.teamGuessingState) setTeamGuessingState(gs.teamGuessingState);
        if (gs.scoreboardState) setScoreboardState(gs.scoreboardState);
        if (gs.fastMoneyHostState) setFastMoneyHostState(gs.fastMoneyHostState);
        if (gs.timerTick) setTimerTick(gs.timerTick);

        if (payload.role === 'PLAYER' && payload.player) {
          const currentSession = getPlayerSession(payload.roomCode);
          const creds = {
            roomCode: payload.roomCode,
            playerId: payload.player.id,
            sessionToken: currentSession?.sessionToken || '',
            nickname: payload.player.nickname,
          };
          savePlayerSession(creds);
          setPlayerSession(creds);
        }
      }
    });

    socket.on('player_left_alert', (payload: PlayerLeftAlertPayload) => {
      setPlayerLeftAlert(payload);
    });

    socket.on('player_kicked', (payload: PlayerKickedPayload) => {
      setKickedInfo(payload);
      clearPlayerSession(payload.roomCode);
    });

    socket.on('game_paused', (payload: GamePausedPayload) => {
      setGamePaused(payload);
      if (typeof payload.remainingTime === 'number' && payload.remainingTime > 0) {
        setTimerTick({
          secondsRemaining: payload.remainingTime,
          endsAt: 0,
        });
      }
    });

    socket.on('game_resumed', (payload: GameResumedPayload) => {
      setGamePaused(null);
      if (payload && typeof payload.remainingTime === 'number' && payload.remainingTime > 0) {
        setTimerTick({
          secondsRemaining: payload.remainingTime,
          endsAt: Date.now() + payload.remainingTime * 1000,
        });
      }
    });

    socket.on('admin_error', (payload: AdminErrorPayload) => {
      setAdminError(payload);
    });

    socket.on('strike_cancelled', (payload: StrikeCancelledPayload) => {
      setStrikeIssued(null);
      if (payload.strikeCount < 3) {
        setTransitionStealPhase(null);
      }
      setTeamGuessingState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          strikes: payload.strikeCount,
          phase:
            prev.phase === 'STEAL_PHASE' && payload.strikeCount < 3
              ? 'TEAM_GUESSING'
              : prev.phase,
        };
      });
    });

    socket.on('host_override_options', (payload: HostOverrideOptionsPayload) => {
      if (payload && Array.isArray(payload.answers)) {
        setHostOverrideOptions(payload.answers);
      }
    });

    socket.on('answer_override_acknowledged', (payload: AnswerOverridePayload) => {
      setAnswerOverrideAck(payload);
    });


    return () => {
      socket.disconnect();
    };
  }, [options?.autoJoin, options?.roomCode, options?.nickname, options?.isHost]);

  const kickPlayer = useCallback(
    (playerId: string) => {
      const socket = socketRef.current;
      const code = options?.roomCode || roomState?.roomCode;
      if (!socket || !code || !playerId) return;
      const secret = getHostSecret(code);
      socket.emit('host_kick_player', {
        roomCode: code,
        playerId,
        hostSecret: secret || undefined,
      });
    },
    [options?.roomCode, roomState?.roomCode]
  );

  const pauseGame = useCallback(() => {
    const socket = socketRef.current;
    const code = options?.roomCode || roomState?.roomCode;
    if (!socket || !code) return;
    const secret = getHostSecret(code);
    socket.emit('host_pause_game', {
      roomCode: code,
      hostSecret: secret || undefined,
    });
  }, [options?.roomCode, roomState?.roomCode]);

  const resumeGame = useCallback(() => {
    const socket = socketRef.current;
    const code = options?.roomCode || roomState?.roomCode;
    if (!socket || !code) return;
    const secret = getHostSecret(code);
    socket.emit('host_resume_game', {
      roomCode: code,
      hostSecret: secret || undefined,
    });
  }, [options?.roomCode, roomState?.roomCode]);

  const overrideAnswer = useCallback(
    (rankOrder: number, points?: number, teamId?: 'TEAM_1' | 'TEAM_2') => {
      const socket = socketRef.current;
      const code = options?.roomCode || roomState?.roomCode;
      if (!socket || !code) return;
      const secret = getHostSecret(code);
      socket.emit('host_override_answer', {
        roomCode: code,
        rankOrder,
        points,
        teamId,
        hostSecret: secret || undefined,
      });
    },
    [options?.roomCode, roomState?.roomCode]
  );

  const requestOverrideOptions = useCallback(() => {
    const socket = socketRef.current;
    const code = options?.roomCode || roomState?.roomCode;
    if (!socket || !code) return;
    const secret = getHostSecret(code);
    socket.emit('host_get_override_answers', {
      roomCode: code,
      hostSecret: secret || undefined,
    });
  }, [options?.roomCode, roomState?.roomCode]);

  return {
    socket: socketRef.current,
    isConnected,
    playerSession,
    hostSecret,
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
    stealResolved,
    roundWinner,
    scoreboardState,
    matchOver,
    suddenDeathInitiated,
    nextRoundStarted,
    advanceNextRound,
    getScoreboardState,
    clearMatchOver,
    submitTeamGuess,
    passTeamTurn,
    submitStealGuess,
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
    reconnectHost,
    reconnectSession,
    playerLeftAlert,
    clearPlayerLeftAlert: () => setPlayerLeftAlert(null),
    kickedInfo,
    clearKickedInfo: () => setKickedInfo(null),
    gamePaused,
    adminError,
    clearAdminError: () => setAdminError(null),
    kickPlayer,
    pauseGame,
    resumeGame,
    overrideAnswer,
    hostOverrideOptions,
    answerOverrideAck,
    clearAnswerOverrideAck: () => setAnswerOverrideAck(null),
    requestOverrideOptions,
  };
}
