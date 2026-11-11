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

  it('emits leave_room with payload when leaveRoom is called with host info', () => {
    const { result } = renderHook(() => useSocket());

    act(() => {
      result.current.leaveRoom({ roomCode: 'FEUD-TEST', isHost: true });
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('leave_room', { roomCode: 'FEUD-TEST', isHost: true });
    expect(result.current.roomState).toBeNull();
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
    it('handles Player 2 speed round and duplicate answer events (US-09)', () => {
      const { result } = renderHook(() => useSocket());

      // 1. p2_turn_started event
      const p2Started = {
        roomCode: 'FEUD-P201',
        endsAt: Date.now() + 75000,
        duration: 75,
        currentQuestionNumber: 1,
        questionText: 'Name a breakfast food',
      };
      act(() => {
        eventHandlers['p2_turn_started'](p2Started);
      });
      expect(result.current.p2TurnStarted).toEqual(p2Started);

      // 2. duplicate_answer_warning event
      const duplicateWarning = {
        roomCode: 'FEUD-P201',
        rawInput: 'Coffee',
        message: 'Answer already given by Player 1! Try again.',
        questionId: 'q-1',
        duplicateWithAnswer: 'Coffee',
        reason: 'EXACT_RAW' as const,
      };
      act(() => {
        eventHandlers['duplicate_answer_warning'](duplicateWarning);
      });
      expect(result.current.duplicateWarning).toEqual(duplicateWarning);

      // 3. clearDuplicateWarning
      act(() => {
        result.current.clearDuplicateWarning();
      });
      expect(result.current.duplicateWarning).toBeNull();

      // 4. p2_turn_ended event
      const p2Ended = {
        roomCode: 'FEUD-P201',
        reason: 'ALL_ANSWERED' as const,
        answeredCount: 5,
        totalQuestions: 5,
      };
      act(() => {
        eventHandlers['p2_turn_ended'](p2Ended);
      });
      expect(result.current.p2TurnEnded).toEqual(p2Ended);
      expect(result.current.turnEnded).toEqual(p2Ended);

      // 5. leaveRoom resets all Player 2 states
      act(() => {
        eventHandlers['duplicate_answer_warning'](duplicateWarning);
        eventHandlers['p2_turn_started'](p2Started);
      });
      expect(result.current.duplicateWarning).not.toBeNull();
      expect(result.current.p2TurnStarted).not.toBeNull();

      act(() => {
        result.current.leaveRoom();
      });
      expect(result.current.duplicateWarning).toBeNull();
      expect(result.current.p2TurnStarted).toBeNull();
      expect(result.current.p2TurnEnded).toBeNull();
    });
  });

  describe('US-13: Face-Off Scoring and Pass or Play Hook Events', () => {
    it('handles prompt_pass_play and choosePlayPass action', () => {
      const { result } = renderHook(() => useSocket());

      const promptPayload = {
        roomCode: 'FEUD-9999',
        winnerPlayerId: 'p-1',
        winnerNickname: 'Contender 1',
        winnerTeam: 'TEAM_1' as const,
        roundNumber: 1,
      };

      act(() => {
        eventHandlers['prompt_pass_play'](promptPayload);
      });
      expect(result.current.promptPassPlay).toEqual(promptPayload);

      // Emit choosePlayPass
      act(() => {
        result.current.choosePlayPass('FEUD-9999', 'p-1', 'play');
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('choose_play_pass', {
        roomCode: 'FEUD-9999',
        playerId: 'p-1',
        decision: 'play',
      });
    });

    it('handles round_control_assigned event', () => {
      const { result } = renderHook(() => useSocket());

      const controlPayload = {
        roomCode: 'FEUD-9999',
        winnerPlayerId: 'p-1',
        winnerTeam: 'TEAM_1' as const,
        decision: 'play' as const,
        controllingTeam: 'TEAM_1' as const,
        controllingTeamName: 'Team 1',
        message: 'Team 1 has chosen to PLAY!',
      };

      act(() => {
        eventHandlers['round_control_assigned'](controlPayload);
      });
      expect(result.current.roundControlAssigned).toEqual(controlPayload);
    });

    it('handles opponent_turn_prompt, face_off_board_reveal, and submitFaceOffGuess', () => {
      const { result } = renderHook(() => useSocket());

      const opponentPrompt = {
        roomCode: 'FEUD-9999',
        nextRespondentId: 'p-2',
        nextRespondentNickname: 'Contender 2',
        nextRespondentTeam: 'TEAM_2' as const,
        endsAt: Date.now() + 15000,
        duration: 15,
        initialPoints: 20,
        initialRawAnswer: 'CAR',
      };

      act(() => {
        eventHandlers['opponent_turn_prompt'](opponentPrompt);
      });
      expect(result.current.opponentTurnPrompt).toEqual(opponentPrompt);

      const boardRevealPayload = {
        roomCode: 'FEUD-9999',
        slotRank: 1,
        rankOrder: 1,
        answerText: 'KEYS',
        points: 45,
        playerId: 'p-1',
        playerNickname: 'Contender 1',
        playerTeam: 'TEAM_1' as const,
        isNumberOneAnswer: true,
      };

      act(() => {
        eventHandlers['face_off_board_reveal'](boardRevealPayload);
      });
      expect(result.current.faceOffBoardReveal).toEqual(boardRevealPayload);

      // Emit submitFaceOffGuess
      act(() => {
        result.current.submitFaceOffGuess('FEUD-9999', 'p-2', 'q-1', 'WALLET');
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('submit_face_off_guess', {
        roomCode: 'FEUD-9999',
        playerId: 'p-2',
        questionId: 'q-1',
        rawAnswer: 'WALLET',
      });

      // Clear state
      act(() => {
        result.current.clearFaceOffState();
      });
      expect(result.current.promptPassPlay).toBeNull();
      expect(result.current.roundControlAssigned).toBeNull();
      expect(result.current.opponentTurnPrompt).toBeNull();
      expect(result.current.faceOffBoardReveal).toBeNull();
    });

    it('satisfies US-16: handles scoreboard update, match over, sudden death, next round, and actions', () => {
      const { result } = renderHook(() => useSocket());

      const mockScoreboard = {
        roomCode: 'FEUD-9999',
        team1GrandTotal: 250,
        team2GrandTotal: 180,
        activeRoundBank: 35,
        currentRoundNumber: 2,
        totalRounds: 3,
        phase: 'ROUND_IN_PROGRESS',
      };

      act(() => {
        eventHandlers['scoreboard_update'](mockScoreboard);
      });
      expect(result.current.scoreboardState).toEqual(mockScoreboard);

      const mockMatchOver = {
        roomCode: 'FEUD-9999',
        winningTeam: 'TEAM_1' as const,
        team1GrandTotal: 340,
        team2GrandTotal: 210,
        totalRounds: 3,
      };

      act(() => {
        eventHandlers['match_over'](mockMatchOver);
      });
      expect(result.current.matchOver).toEqual(mockMatchOver);

      const mockSuddenDeath = {
        roomCode: 'FEUD-9999',
        team1GrandTotal: 200,
        team2GrandTotal: 200,
        roundNumber: 4,
        message: 'Sudden death!',
      };

      act(() => {
        eventHandlers['sudden_death_initiated'](mockSuddenDeath);
      });
      expect(result.current.suddenDeathInitiated).toEqual(mockSuddenDeath);

      const mockNextRound = {
        roomCode: 'FEUD-9999',
        roundNumber: 2,
        totalRounds: 3,
        team1Contender: { id: 'p1', nickname: 'Alice', team: 'TEAM_1' as const, battingOrder: 2 },
        team2Contender: { id: 'p2', nickname: 'Bob', team: 'TEAM_2' as const, battingOrder: 2 },
        question: { id: 'q2', questionText: 'Next Q', answerCount: 4 },
        isSuddenDeath: false,
        scoreboard: mockScoreboard as any,
      };

      act(() => {
        eventHandlers['buzzer_locked']({ roomCode: 'FEUD-9999', winnerPlayerId: 'p1', winnerNickname: 'Alice', winnerTeam: 'TEAM_1', endsAt: 100, duration: 15 });
        eventHandlers['next_round_started'](mockNextRound);
      });
      expect(result.current.nextRoundStarted).toEqual(mockNextRound);
      expect(result.current.buzzerLocked).toBeNull();

      // Advance next round emit
      act(() => {
        result.current.advanceNextRound('FEUD-9999');
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('advance_next_round', { roomCode: 'FEUD-9999' });

      // Get scoreboard state emit
      act(() => {
        result.current.getScoreboardState('FEUD-9999');
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('get_scoreboard_state', { roomCode: 'FEUD-9999' });

      // Clear match over
      act(() => {
        result.current.clearMatchOver();
      });
      expect(result.current.matchOver).toBeNull();

      // On game_replayed, clears matchOver and suddenDeathInitiated
      act(() => {
        eventHandlers['match_over'](mockMatchOver);
        eventHandlers['sudden_death_initiated'](mockSuddenDeath);
      });
      expect(result.current.matchOver).toEqual(mockMatchOver);

      act(() => {
        eventHandlers['game_replayed']();
      });
      expect(result.current.matchOver).toBeNull();
      expect(result.current.suddenDeathInitiated).toBeNull();
    });
  });

  describe('US-14, US-15, US-20 & US-21: Team Guessing, Reconnection & Host Admin Hook Coverage', () => {
    beforeEach(() => {
      sessionStorage.clear();
      localStorage.clear();
    });

    it('handles Fast Money, Face-Off, and Team Guessing action emitters & listeners', () => {
      const { result } = renderHook(() => useSocket({ roomCode: 'FEUD-1234' }));

      act(() => {
        result.current.sendPlayerReady('FEUD-1234', 'p1');
        result.current.submitFastMoneyAnswer('FEUD-1234', 'p1', 'q1', 'Bread');
        result.current.passFastMoneyQuestion('FEUD-1234', 'p1', 'q1');
        result.current.startP2FastMoneyRevealPhase('FEUD-1234');
        result.current.revealP2FastMoneyAnswer('FEUD-1234', 1);
        result.current.revealP2FastMoneyPoints('FEUD-1234', 1);
        result.current.requestReplay('FEUD-1234');
        result.current.sendFaceOffReady('FEUD-1234', 'p1');
        result.current.pressBuzzer('FEUD-1234', 'p1', 123456);
        result.current.submitFaceOffAnswer('FEUD-1234', 'p1', 'q1', 'Milk');
        result.current.submitTeamGuess('FEUD-1234', 'p1', 'Cheese');
        result.current.passTeamTurn('FEUD-1234', 'p1');
        result.current.submitStealGuess('FEUD-1234', 'p2', 'Butter');
        result.current.getTeamGuessingState('FEUD-1234');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('player_ready', { roomCode: 'FEUD-1234', playerId: 'p1' });
      expect(mockSocket.emit).toHaveBeenCalledWith('submit_answer', {
        roomCode: 'FEUD-1234',
        playerId: 'p1',
        questionId: 'q1',
        rawAnswer: 'Bread',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('pass_question', {
        roomCode: 'FEUD-1234',
        playerId: 'p1',
        questionId: 'q1',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('start_p2_reveal_phase', { roomCode: 'FEUD-1234', isHost: true });
      expect(mockSocket.emit).toHaveBeenCalledWith('reveal_p2_answer', {
        roomCode: 'FEUD-1234',
        slotNumber: 1,
        isHost: true,
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('reveal_p2_points', {
        roomCode: 'FEUD-1234',
        slotNumber: 1,
        isHost: true,
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('request_replay', { roomCode: 'FEUD-1234', isHost: true });
      expect(mockSocket.emit).toHaveBeenCalledWith('face_off_ready', { roomCode: 'FEUD-1234', playerId: 'p1' });
      expect(mockSocket.emit).toHaveBeenCalledWith('press_buzzer', {
        roomCode: 'FEUD-1234',
        playerId: 'p1',
        clientTimestamp: 123456,
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('submit_face_off_answer', {
        roomCode: 'FEUD-1234',
        playerId: 'p1',
        questionId: 'q1',
        rawAnswer: 'Milk',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('submit_team_guess', {
        roomCode: 'FEUD-1234',
        playerId: 'p1',
        rawAnswer: 'Cheese',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('pass_team_turn', { roomCode: 'FEUD-1234', playerId: 'p1' });
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'submit_steal_guess',
        { roomCode: 'FEUD-1234', playerId: 'p2', rawAnswer: 'Butter' },
        undefined
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('get_team_guessing_state', { roomCode: 'FEUD-1234' });

      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      act(() => {
        eventHandlers['teams_assigned']({ roomCode: 'FEUD-1234', team1: [], team2: [] });
        eventHandlers['fast_money_p1_state']({ phase: 'P1_PLAYING' });
        eventHandlers['fast_money_p2_state']({ phase: 'P1_PLAYING', isOffstage: true });
        eventHandlers['fast_money_host_state']({ phase: 'P1_PLAYING' });
        eventHandlers['timer_tick']({ secondsRemaining: 12, endsAt: Date.now() + 12000 });
        eventHandlers['p1_turn_ended']({ roomCode: 'FEUD-1234', reason: 'TIME_EXPIRED', answeredCount: 3, totalQuestions: 5 });
        eventHandlers['game_over']({ roomCode: 'FEUD-1234', isVictory: true, totalScore: 210 });
        eventHandlers['face_off_state']({ roomCode: 'FEUD-1234', phase: 'BUZZER_ACTIVE' });
        eventHandlers['buzzer_locked']({ roomCode: 'FEUD-1234', winnerPlayerId: 'p1', winnerNickname: 'Alice', winnerTeam: 'TEAM_1', endsAt: 100 });
        eventHandlers['buzzer_rejected']({ reason: 'LOCKED' });
        eventHandlers['face_off_timeout']({ type: 'FIRST_GUESS_TIMEOUT' });
        eventHandlers['face_off_reset']({ roundNumber: 1 });
        eventHandlers['face_off_answer_submitted']({ playerId: 'p1', rawAnswer: 'Milk' });
        eventHandlers['face_off_error']({ code: 'ERR', message: 'Invalid' });
        eventHandlers['board_reveal']({ roomCode: 'FEUD-1234', rankOrder: 1, answerText: 'Car', points: 45 });
        eventHandlers['round_cleared']({ roomCode: 'FEUD-1234', winningTeam: 'TEAM_1', totalRoundPoints: 100 });
        eventHandlers['team_turn_started']({ roomCode: 'FEUD-1234', activePlayer: null });
        eventHandlers['team_guess_result']({ roomCode: 'FEUD-1234', outcome: 'CORRECT_GUESS' });
        eventHandlers['steal_resolved']({ roomCode: 'FEUD-1234', success: true });
        eventHandlers['round_winner']({ roomCode: 'FEUD-1234', winningTeam: 'TEAM_1', pointsAwarded: 100, roundBank: 100 });
        eventHandlers['connect_error'](new Error('Mock transport error'));
      });
      errSpy.mockRestore();

      expect(result.current.teamsAssigned).toBeTruthy();
      expect(result.current.fastMoneyP1State).toBeTruthy();
      expect(result.current.fastMoneyP2State).toBeTruthy();
      expect(result.current.fastMoneyHostState).toBeTruthy();
      expect(result.current.timerTick?.secondsRemaining).toBe(12);
      expect(result.current.turnEnded?.answeredCount).toBe(3);
      expect(result.current.gameOver?.isVictory).toBe(true);
      expect(result.current.mainGameBoardReveal?.answerText).toBe('Car');
      expect(result.current.roundCleared?.totalRoundPoints).toBe(100);
      expect(result.current.stealResolved?.success).toBe(true);
      expect(result.current.roundWinner?.pointsAwarded).toBe(100);

      act(() => {
        result.current.clearGameOver();
      });
      expect(result.current.gameOver).toBeNull();
    });

    it('handles US-20 session credentials, reconnection flows, and player_left_alert', () => {
      const { result } = renderHook(() =>
        useSocket({ roomCode: 'FEUD-REC9', nickname: 'Alice', isHost: false, autoJoin: true })
      );

      act(() => {
        eventHandlers['connect']();
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('join_room', {
        roomCode: 'FEUD-REC9',
        nickname: 'Alice',
        isHost: false,
      });

      act(() => {
        eventHandlers['session_granted']({
          roomCode: 'FEUD-REC9',
          playerId: 'p-rec-1',
          sessionToken: 'tok-123',
          nickname: 'Alice',
        });
        eventHandlers['host_secret_granted']({
          roomCode: 'FEUD-REC9',
          hostSecret: 'hsec-999',
        });
      });

      expect(result.current.playerSession?.playerId).toBe('p-rec-1');
      expect(result.current.hostSecret).toBe('hsec-999');

      act(() => {
        eventHandlers['connect']();
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('reconnect_session', {
        roomCode: 'FEUD-REC9',
        playerId: 'p-rec-1',
        sessionToken: 'tok-123',
      });

      act(() => {
        result.current.reconnectHost('FEUD-REC9', 'hsec-999');
        result.current.reconnectSession('FEUD-REC9', 'p-rec-1', 'tok-123');
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('reconnect_host', {
        roomCode: 'FEUD-REC9',
        hostSecret: 'hsec-999',
      });

      act(() => {
        eventHandlers['reconnect_acknowledged']({
          success: true,
          role: 'PLAYER',
          roomCode: 'FEUD-REC9',
          player: { id: 'p-rec-1', nickname: 'Alice', team: 'TEAM_1' },
          gameState: {
            roomCode: 'FEUD-REC9',
            roomName: 'Recovery Room',
            language: 'EN',
            gameMode: 'MAIN_GAME',
            status: 'ACTIVE',
            room: {
              roomCode: 'FEUD-REC9',
              roomName: 'Recovery Room',
              language: 'EN',
              gameMode: 'MAIN_GAME',
              status: 'ACTIVE',
              playerCount: 2,
              maxPlayers: 10,
              canStart: true,
              players: [],
            },
            teamsAssigned: { roomCode: 'FEUD-REC9', team1: [], team2: [] },
            faceOffState: { roomCode: 'FEUD-REC9', phase: 'ANSWERING' } as any,
            teamGuessingState: { roomCode: 'FEUD-REC9', phase: 'TEAM_GUESSING', strikes: 1 } as any,
            scoreboardState: { roomCode: 'FEUD-REC9', team1GrandTotal: 40, team2GrandTotal: 0 } as any,
            fastMoneyHostState: { phase: 'P1_PLAYING' } as any,
            timerTick: { secondsRemaining: 10, endsAt: Date.now() + 10000 },
          },
        });
      });
      expect(result.current.roomState?.roomCode).toBe('FEUD-REC9');
      expect(result.current.scoreboardState?.team1GrandTotal).toBe(40);

      act(() => {
        eventHandlers['player_left_alert']({
          roomCode: 'FEUD-REC9',
          playerId: 'p2',
          nickname: 'Bob',
          message: 'Bob has left the game',
        });
      });
      expect(result.current.playerLeftAlert?.nickname).toBe('Bob');
      act(() => {
        result.current.clearPlayerLeftAlert();
      });
      expect(result.current.playerLeftAlert).toBeNull();

      renderHook(() => useSocket({ roomCode: 'FEUD-REC9', isHost: true, autoJoin: true }));
      act(() => {
        eventHandlers['connect']();
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('reconnect_host', {
        roomCode: 'FEUD-REC9',
        hostSecret: 'hsec-999',
      });
    });

    it('handles US-21 Host Administrative actions & events (pause, resume, kick, override, strike retraction)', () => {
      const { result } = renderHook(() => useSocket({ roomCode: 'FEUD-ADM9', isHost: true }));

      act(() => {
        eventHandlers['host_secret_granted']({ roomCode: 'FEUD-ADM9', hostSecret: 'adm-sec' });
      });

      act(() => {
        result.current.pauseGame();
        result.current.resumeGame();
        result.current.kickPlayer('p-afk');
        result.current.overrideAnswer(1, 45, 'TEAM_1');
        result.current.requestOverrideOptions();
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('host_pause_game', {
        roomCode: 'FEUD-ADM9',
        hostSecret: 'adm-sec',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('host_resume_game', {
        roomCode: 'FEUD-ADM9',
        hostSecret: 'adm-sec',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('host_kick_player', {
        roomCode: 'FEUD-ADM9',
        playerId: 'p-afk',
        hostSecret: 'adm-sec',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('host_override_answer', {
        roomCode: 'FEUD-ADM9',
        rankOrder: 1,
        points: 45,
        teamId: 'TEAM_1',
        hostSecret: 'adm-sec',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('host_get_override_answers', {
        roomCode: 'FEUD-ADM9',
        hostSecret: 'adm-sec',
      });

      act(() => {
        eventHandlers['game_paused']({ roomCode: 'FEUD-ADM9', remainingTime: 14, pausedByHost: true });
      });
      expect(result.current.gamePaused?.remainingTime).toBe(14);
      expect(result.current.timerTick?.secondsRemaining).toBe(14);

      act(() => {
        eventHandlers['game_resumed']({ roomCode: 'FEUD-ADM9', remainingTime: 14 });
      });
      expect(result.current.gamePaused).toBeNull();
      expect(result.current.timerTick?.secondsRemaining).toBe(14);

      act(() => {
        eventHandlers['team_guessing_state']({
          roomCode: 'FEUD-ADM9',
          phase: 'STEAL_PHASE',
          strikes: 3,
        });
        eventHandlers['strike_issued']({
          roomCode: 'FEUD-ADM9',
          team: 'TEAM_1',
          strikeCount: 3,
          maxStrikes: 3,
        });
        eventHandlers['transition_steal_phase']({
          roomCode: 'FEUD-ADM9',
          controllingTeam: 'TEAM_1',
          opposingTeam: 'TEAM_2',
          roundBank: 50,
        });
      });
      expect(result.current.strikeIssued?.strikeCount).toBe(3);
      expect(result.current.transitionStealPhase).not.toBeNull();

      act(() => {
        eventHandlers['strike_cancelled']({
          roomCode: 'FEUD-ADM9',
          controllingTeam: 'TEAM_1',
          strikeCount: 2,
        });
      });
      expect(result.current.strikeIssued).toBeNull();
      expect(result.current.transitionStealPhase).toBeNull();
      expect(result.current.teamGuessingState?.strikes).toBe(2);
      expect(result.current.teamGuessingState?.phase).toBe('TEAM_GUESSING');

      act(() => {
        eventHandlers['host_override_options']({
          roomCode: 'FEUD-ADM9',
          answers: [{ id: 'a1', rankOrder: 1, answerText: 'Car', points: 45, isRevealed: false }],
        });
        eventHandlers['answer_override_acknowledged']({
          roomCode: 'FEUD-ADM9',
          rankOrder: 1,
          answerText: 'Car',
          pointsAwarded: 45,
          strikeCount: 0,
          roundBank: 45,
          controllingTeam: 'TEAM_1',
          isBoardCleared: false,
        });
      });
      expect(result.current.hostOverrideOptions).toHaveLength(1);
      expect(result.current.answerOverrideAck?.answerText).toBe('Car');
      act(() => {
        result.current.clearAnswerOverrideAck();
      });
      expect(result.current.answerOverrideAck).toBeNull();

      act(() => {
        eventHandlers['player_kicked']({
          roomCode: 'FEUD-ADM9',
          playerId: 'p-afk',
          reason: 'Removed by host',
        });
        eventHandlers['admin_error']({
          code: 'UNAUTHORIZED',
          message: 'Not host',
        });
      });
      expect(result.current.kickedInfo?.playerId).toBe('p-afk');
      expect(result.current.adminError?.code).toBe('UNAUTHORIZED');

      act(() => {
        result.current.clearKickedInfo();
        result.current.clearAdminError();
      });
      expect(result.current.kickedInfo).toBeNull();
      expect(result.current.adminError).toBeNull();
    });
  });
});
