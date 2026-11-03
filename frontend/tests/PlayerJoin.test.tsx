import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { PlayerJoin } from '../src/pages/PlayerJoin';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import { Room, RoomStateUpdate, TeamsAssignedPayload, FaceOffSessionState, TeamGuessingSessionState } from '../src/types';
import * as socketHook from '../src/hooks/useSocket';

describe('Frontend Regression Suite: PlayerJoin Page (US-03 & US-04)', () => {
  const mockRoom: Room = {
    id: 'room-123',
    roomCode: 'FEUD-8291',
    roomName: 'Soirée Famille',
    language: 'FR',
    gameMode: 'FAST_MONEY',
    status: 'LOBBY',
    createdAt: new Date().toISOString(),
  };

  const defaultSocketMock = {
    playerSession: null,
    hostSecret: null,
    reconnectHost: vi.fn(),
    reconnectSession: vi.fn(),
    socket: null,
    isConnected: true,
    socketId: 'mock-player-socket',
    roomState: null,
    roomError: null,
    gameStarted: null,
    teamsAssigned: null,
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    clearError: vi.fn(),
    fastMoneyP1State: null,
    fastMoneyP2State: null,
    fastMoneyHostState: null,
    timerTick: null,
    turnEnded: null,
    sendPlayerReady: vi.fn(),
    submitFastMoneyAnswer: vi.fn(),
    passFastMoneyQuestion: vi.fn(),
    startGame: vi.fn(),
    boardReveal: null,
    p1RevealCompleted: null,
    startFastMoneyRevealPhase: vi.fn(),
    revealFastMoneyAnswer: vi.fn(),
    revealFastMoneyPoints: vi.fn(),
    p2TurnStarted: null,
    p2TurnEnded: null,
    duplicateWarning: null,
    clearDuplicateWarning: vi.fn(),
    gameOver: null,
    clearGameOver: vi.fn(),
    startP2FastMoneyRevealPhase: vi.fn(),
    revealP2FastMoneyAnswer: vi.fn(),
    revealP2FastMoneyPoints: vi.fn(),
    requestReplay: vi.fn(),
    faceOffState: null,
    buzzerLocked: null,
    buzzerRejected: null,
    faceOffTimeout: null,
    faceOffReset: null,
    faceOffAnswer: null,
    faceOffError: null,
    sendFaceOffReady: vi.fn(),
    pressBuzzer: vi.fn(),
    submitFaceOffAnswer: vi.fn(),
    clearFaceOffState: vi.fn(),
    promptPassPlay: null,
    roundControlAssigned: null,
    opponentTurnPrompt: null,
    faceOffBoardReveal: null,
    submitFaceOffGuess: vi.fn(),
    choosePlayPass: vi.fn(),
    teamGuessingState: null,
    strikeIssued: null,
    roundCleared: null,
    transitionStealPhase: null,
    teamTurnStarted: null,
    teamGuessResult: null,
    mainGameBoardReveal: null,
    stealResolved: null,
    roundWinner: null,
    submitTeamGuess: vi.fn(),
    passTeamTurn: vi.fn(),
    submitStealGuess: vi.fn(),
    getTeamGuessingState: vi.fn(),
    scoreboardState: null,
    matchOver: null,
    suddenDeathInitiated: null,
    nextRoundStarted: null,
    advanceNextRound: vi.fn(),
    getScoreboardState: vi.fn(),
    clearMatchOver: vi.fn(),
    playerLeftAlert: null,
    clearPlayerLeftAlert: vi.fn(),
  };

  const renderWithProviders = (ui: React.ReactElement, initialPath = '/play/FEUD-8291') => {
    return render(
      <LanguageProvider>
        <RouterProvider initialPath={initialPath}>{ui}</RouterProvider>
      </LanguageProvider>
    );
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    vi.spyOn(socketHook, 'useSocket').mockReturnValue({ ...defaultSocketMock, joinRoom: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('satisfies Scenario 3: renders room metadata and nickname input on initial load', () => {
    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    // Room info
    expect(screen.getByTestId('player-room-name')).toHaveTextContent('Soirée Famille');
    expect(screen.getByText('FEUD-8291')).toBeInTheDocument();
    expect(screen.getByTestId('player-room-language')).toHaveTextContent('Français (FR)');
    expect(screen.getByTestId('player-room-mode')).toHaveTextContent(/Face-à-Face Rapide/i);

    // Form elements
    expect(screen.getByLabelText(/votre pseudo/i)).toBeInTheDocument();
    expect(screen.getByTestId('player-nickname-input')).toBeInTheDocument();
    expect(screen.getByTestId('player-join-submit-btn')).toHaveTextContent(/rejoindre le salon/i);
  });

  it('satisfies Scenario 3: blocks empty or whitespace-only nickname with validation error', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    const submitBtn = screen.getByTestId('player-join-submit-btn');

    // Click submit with empty input
    await user.click(submitBtn);

    const errorBanner = screen.getByTestId('player-validation-error');
    expect(errorBanner).toBeInTheDocument();
    expect(errorBanner).toHaveTextContent(/veuillez saisir un pseudo/i);

    // Type spaces only and submit
    const input = screen.getByTestId('player-nickname-input');
    await user.type(input, '   ');
    await user.click(submitBtn);

    expect(screen.getByTestId('player-validation-error')).toBeInTheDocument();
  });

  it('blocks nickname with fewer than 2 characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    const input = screen.getByTestId('player-nickname-input');
    await user.type(input, 'A');

    const submitBtn = screen.getByTestId('player-join-submit-btn');
    await user.click(submitBtn);

    expect(screen.getByTestId('player-validation-error')).toHaveTextContent(/veuillez saisir un pseudo/i);
  });

  it('satisfies Scenario 3: accepts valid nickname and calls onJoined callback', async () => {
    const user = userEvent.setup();
    const onJoinedMock = vi.fn();

    renderWithProviders(
      <PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} onJoined={onJoinedMock} />
    );

    const input = screen.getByTestId('player-nickname-input');
    await user.type(input, 'Sophie');

    const submitBtn = screen.getByTestId('player-join-submit-btn');
    await user.click(submitBtn);

    expect(onJoinedMock).toHaveBeenCalledWith({
      room: mockRoom,
      nickname: 'Sophie',
    });

    expect(sessionStorage.getItem('feud_nickname_FEUD-8291')).toBe('Sophie');

    // Shows welcome state
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome, sophie!/i })).toBeInTheDocument();
    });
  });

  it('fetches room details via API when rendered without initialRoom', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        room: {
          ...mockRoom,
          roomName: 'Noche en Familia',
          language: 'ES',
        },
      }),
    } as Response);

    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" />);

    expect(screen.getByText(/connecting to room/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('player-room-name')).toHaveTextContent('Noche en Familia');
    });

    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/rooms/FEUD-8291'));
    expect(screen.getByTestId('player-room-language')).toHaveTextContent('Español (ES)');
  });

  it('displays error state when room cannot be found (404) and allows returning home', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        success: false,
        error: 'Room not found or session has ended',
      }),
    } as Response);

    renderWithProviders(<PlayerJoin roomCode="FEUD-NOTFOUND" />);

    await waitFor(() => {
      expect(screen.getByText(/room unavailable/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/room not found or session has ended/i)).toBeInTheDocument();
    const backBtn = screen.getByRole('button', { name: /back to home/i });
    expect(backBtn).toBeInTheDocument();

    await user.click(backBtn);
  });

  /* -------------------------------------------------------------
   * US-04 Specific Tests: Socket Join, Waiting Lobby & Room Full
   * ------------------------------------------------------------- */
  it('satisfies US-04 Scenario 1: joins room via socket and displays waiting lobby with live roster', async () => {
    const user = userEvent.setup();
    const joinRoomMock = vi.fn();
    const mockState: RoomStateUpdate = {
      roomCode: 'FEUD-8291',
      roomName: 'Soirée Famille',
      language: 'FR',
      gameMode: 'FAST_MONEY',
      status: 'LOBBY',
      playerCount: 2,
      maxPlayers: 2,
      canStart: true,
      players: [
        { id: 'p1', nickname: 'Sophie', team: 'NONE', isReady: true, isConnected: true },
        { id: 'p2', nickname: 'Alex', team: 'NONE', isReady: true, isConnected: false },
      ],
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      socketId: 'player-socket-1',
      roomState: mockState,
      joinRoom: joinRoomMock,
    });

    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    const input = screen.getByTestId('player-nickname-input');
    await user.type(input, 'Sophie');
    const submitBtn = screen.getByTestId('player-join-submit-btn');
    await user.click(submitBtn);

    expect(joinRoomMock).toHaveBeenCalledWith({
      roomCode: 'FEUD-8291',
      nickname: 'Sophie',
      isHost: false,
    });

    await waitFor(() => {
      expect(screen.getByTestId('player-waiting-lobby')).toBeInTheDocument();
    });

    expect(screen.getByTestId('player-waiting-status')).toHaveTextContent(/en attente du lancement par l/i);
    expect(screen.getByTestId('player-roster-count')).toHaveTextContent('2 / 2');
    expect(screen.getByTestId('player-roster-item-Sophie')).toHaveTextContent('Prêt');
    expect(screen.getByTestId('player-roster-item-Alex')).toHaveTextContent('Déconnecté');
  });

  it('satisfies US-04 Scenario 2: displays room full rejection view when roomError is ROOM_FULL', async () => {
    const user = userEvent.setup();

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      socketId: 'player-socket-3',
      roomError: {
        code: 'ROOM_FULL',
        message: 'This Fast Money room is already full (2/2 players).',
      },
    });

    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    expect(screen.getByTestId('player-room-full-screen')).toBeInTheDocument();
    expect(screen.getByTestId('player-room-full-message')).toHaveTextContent(
      'This Fast Money room is already full (2/2 players).'
    );

    const backBtn = screen.getByTestId('player-room-full-back-btn');
    expect(backBtn).toBeInTheDocument();
    await user.click(backBtn);
  });

  it('satisfies US-04 Scenario 2: displays localized fallback when ROOM_FULL has no server message', () => {
    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      socketId: 'player-socket-3',
      roomError: {
        code: 'ROOM_FULL',
        message: '',
      },
    });

    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    expect(screen.getByTestId('player-room-full-screen')).toBeInTheDocument();
    expect(screen.getByTestId('player-room-full-message')).toHaveTextContent(
      /Ce salon Face-à-Face Rapide est déjà complet/i
    );
  });

  it('allows player to navigate back to home from waiting lobby', async () => {
    const user = userEvent.setup();

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      socketId: 'player-socket-1',
    });

    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    const input = screen.getByTestId('player-nickname-input');
    await user.type(input, 'Sophie');
    await user.click(screen.getByTestId('player-join-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('player-waiting-lobby')).toBeInTheDocument();
    });

    const backHomeBtn = screen.getByRole('button', { name: /retour/i });
    expect(backHomeBtn).toBeInTheDocument();
    await user.click(backHomeBtn);
  });

  it('satisfies US-07: transitions Player 1 from waiting lobby to FastMoneyController upon fastMoneyP1State', async () => {
    const user = userEvent.setup();

    const mockP1Snapshot = {
      phase: 'P1_READY',
      currentQuestion: {
        id: 'q-1',
        questionText: 'Nommez quelque chose que vous mangez avec une cuillère',
        questionNumber: 1,
        totalQuestions: 5,
      },
      answeredCount: 0,
      passedCount: 0,
      totalQuestions: 5,
      remainingSeconds: 60,
      isTimerRunning: false,
      canSubmit: false,
      canPass: false,
    };

    const sendPlayerReady = vi.fn();

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      socketId: 'player-socket-1',
      roomState: {
        roomCode: 'FEUD-8291',
        status: 'PLAYING',
        playerCount: 2,
        maxPlayers: 2,
        players: [
          { id: 'p1', nickname: 'Sophie', isConnected: true, isReady: true },
          { id: 'p2', nickname: 'Marc', isConnected: true, isReady: true },
        ],
      },
      fastMoneyP1State: mockP1Snapshot,
      sendPlayerReady,
    } as any);

    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    const input = screen.getByTestId('player-nickname-input');
    await user.type(input, 'Sophie');
    await user.click(screen.getByTestId('player-join-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('p1-ready-screen')).toBeInTheDocument();
      expect(screen.getByTestId('p1-ready-btn')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('p1-ready-btn'));
    expect(sendPlayerReady).toHaveBeenCalledWith('FEUD-8291', 'p1');
  });

  it('satisfies US-07 Scenario 5: transitions Player 2 to FastMoneyIsolation shield when Player 1 is playing', async () => {
    const user = userEvent.setup();

    const mockP2Isolation = {
      phase: 'P1_PLAYING',
      isOffstage: true,
      isolationMessage: 'Player 1 is playing',
      remainingSeconds: 52,
      isTimerRunning: true,
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      socketId: 'player-socket-2',
      roomState: {
        roomCode: 'FEUD-8291',
        status: 'PLAYING',
        playerCount: 2,
        maxPlayers: 2,
        players: [
          { id: 'p1', nickname: 'Sophie', isConnected: true, isReady: true },
          { id: 'p2', nickname: 'Marc', isConnected: true, isReady: true },
        ],
      },
      fastMoneyP2State: mockP2Isolation,
    } as any);

    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    const input = screen.getByTestId('player-nickname-input');
    await user.type(input, 'Marc');
    await user.click(screen.getByTestId('player-join-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('player2-isolation-screen')).toBeInTheDocument();
      expect(screen.getByTestId('player2-isolation-timer')).toHaveTextContent('52');
    });

    // Confidentiality check
    expect(screen.queryByTestId('fast-money-input')).not.toBeInTheDocument();
  });

  it('satisfies US-08 Scenario 4: transitions Player 2 to ready screen and allows clicking "I\'m Ready!" when phase is P2_READY', async () => {
    const user = userEvent.setup();
    const sendPlayerReady = vi.fn();

    const mockP2Ready = {
      phase: 'P2_READY',
      isOffstage: false,
      isolationMessage: "Player 1's reveal is complete! Get ready for your turn",
      remainingSeconds: 0,
      isTimerRunning: false,
      totalScore: 110,
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      socketId: 'player-socket-2',
      roomState: {
        roomCode: 'FEUD-8291',
        status: 'PLAYING',
        playerCount: 2,
        maxPlayers: 2,
        players: [
          { id: 'p1', nickname: 'Sophie', isConnected: true, isReady: true },
          { id: 'p2', nickname: 'Marc', isConnected: true, isReady: true },
        ],
      },
      fastMoneyP2State: mockP2Ready,
      sendPlayerReady,
    } as any);

    renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

    const input = screen.getByTestId('player-nickname-input');
    await user.type(input, 'Marc');
    await user.click(screen.getByTestId('player-join-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('player2-ready-screen')).toBeInTheDocument();
      expect(screen.getByTestId('p2-round1-total')).toHaveTextContent('110');
      expect(screen.getByTestId('p2-ready-btn')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('p2-ready-btn'));
    expect(sendPlayerReady).toHaveBeenCalledWith('FEUD-8291', 'p2');
  });

  it('satisfies US-09: transitions Player 2 to FastMoneyController upon P2_PLAYING and wires duplicate warning', async () => {
      const user = userEvent.setup();
      const submitFastMoneyAnswer = vi.fn();
      const clearDuplicateWarning = vi.fn();

      const mockP2Playing = {
        phase: 'P2_PLAYING',
        isOffstage: false,
        isolationMessage: '',
        remainingSeconds: 75,
        isTimerRunning: true,
        canSubmit: true,
        canPass: true,
        currentQuestion: {
          id: 'q-1',
          questionText: 'Name a hot beverage',
          questionNumber: 1,
          totalQuestions: 5,
        },
        answeredCount: 0,
        passedCount: 0,
        totalQuestions: 5,
      };

      const mockDuplicateWarning = {
        roomCode: 'FEUD-8291',
        rawInput: 'coffee',
        message: 'Duplicate answer! Enter another answer.',
        questionId: 'q-1',
        duplicateWithAnswer: 'Coffee',
        reason: 'EXACT_RAW' as const,
      };

      vi.spyOn(socketHook, 'useSocket').mockReturnValue({
        ...defaultSocketMock,
        socketId: 'player-socket-2',
        roomState: {
          roomCode: 'FEUD-8291',
          status: 'PLAYING',
          playerCount: 2,
          maxPlayers: 2,
          players: [
            { id: 'p1', nickname: 'Sophie', isConnected: true, isReady: true },
            { id: 'p2', nickname: 'Marc', isConnected: true, isReady: true },
          ],
        },
        fastMoneyP2State: mockP2Playing,
        duplicateWarning: mockDuplicateWarning,
        clearDuplicateWarning,
        submitFastMoneyAnswer,
      } as any);

      renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

      const input = screen.getByTestId('player-nickname-input');
      await user.type(input, 'Marc');
      await user.click(screen.getByTestId('player-join-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('fast-money-playing-screen')).toBeInTheDocument();
        expect(screen.getByTestId('fast-money-timer')).toHaveTextContent('75s');
        expect(screen.getByTestId('duplicate-warning-banner')).toBeInTheDocument();
        expect(screen.getByTestId('duplicate-warning-banner')).toHaveTextContent(
          'Duplicate answer! Enter another answer.'
        );
      });
    });

    it('satisfies US-10 Scenario 2: transitions joined player to victory screen upon receiving gameOver payload', async () => {
      const user = userEvent.setup();

      vi.spyOn(socketHook, 'useSocket').mockReturnValue({
        ...defaultSocketMock,
        socketId: 'player-socket-1',
        roomState: {
          roomCode: 'FEUD-8291',
          status: 'PLAYING',
          playerCount: 2,
          maxPlayers: 2,
          players: [
            { id: 'p1', nickname: 'Sophie', isConnected: true, isReady: true },
            { id: 'p2', nickname: 'Marc', isConnected: true, isReady: true },
          ],
        },
        fastMoneyP1State: {
          phase: 'GAME_OVER',
          grandTotal: 210,
          p1TotalScore: 125,
          p2TotalScore: 85,
          isVictory: true,
        },
        gameOver: {
          roomCode: 'FEUD-8291',
          isVictory: true,
          p1TotalScore: 125,
          p2TotalScore: 85,
          grandTotal: 210,
          targetScore: 200,
        },
      } as any);

      renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

      const input = screen.getByTestId('player-nickname-input');
      await user.type(input, 'Sophie');
      await user.click(screen.getByTestId('player-join-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('fast-money-game-over-screen')).toBeInTheDocument();
        expect(screen.getByTestId('player-victory-view')).toBeInTheDocument();
        expect(screen.getByTestId('player-final-score')).toHaveTextContent('210');
        expect(screen.getByTestId('player-waiting-replay-notice')).toBeInTheDocument();
      });
    });

    it('satisfies US-10 Scenario 3: transitions Player 2 to defeat screen when game completes under 200 points', async () => {
      const user = userEvent.setup();

      vi.spyOn(socketHook, 'useSocket').mockReturnValue({
        ...defaultSocketMock,
        socketId: 'player-socket-2',
        roomState: {
          roomCode: 'FEUD-8291',
          status: 'FINISHED',
          playerCount: 2,
          maxPlayers: 2,
          players: [
            { id: 'p1', nickname: 'Sophie', isConnected: true, isReady: true },
            { id: 'p2', nickname: 'Marc', isConnected: true, isReady: true },
          ],
        },
        fastMoneyP2State: {
          phase: 'GAME_OVER',
          isOffstage: false,
          isolationMessage: '',
          remainingSeconds: 0,
          isTimerRunning: false,
          canSubmit: false,
          canPass: false,
          grandTotal: 165,
          p1TotalScore: 95,
          p2TotalScore: 70,
          isVictory: false,
        },
        gameOver: {
          roomCode: 'FEUD-8291',
          isVictory: false,
          p1TotalScore: 95,
          p2TotalScore: 70,
          grandTotal: 165,
          targetScore: 200,
        },
      } as any);

      renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

      const input = screen.getByTestId('player-nickname-input');
      await user.type(input, 'Marc');
      await user.click(screen.getByTestId('player-join-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('fast-money-game-over-screen')).toBeInTheDocument();
        expect(screen.getByTestId('player-defeat-view')).toBeInTheDocument();
        expect(screen.getByTestId('player-final-score')).toHaveTextContent('165');
        expect(screen.getByTestId('player-waiting-replay-notice')).toBeInTheDocument();
      });
    });

    it('satisfies US-10 Scenario 4: resets Player 2 seamlessly to isolation when new match starts without disconnecting', async () => {
      const user = userEvent.setup();

      vi.spyOn(socketHook, 'useSocket').mockReturnValue({
        ...defaultSocketMock,
        socketId: 'player-socket-2',
        roomState: {
          roomCode: 'FEUD-8291',
          status: 'PLAYING',
          playerCount: 2,
          maxPlayers: 2,
          players: [
            { id: 'p1', nickname: 'Sophie', isConnected: true, isReady: true },
            { id: 'p2', nickname: 'Marc', isConnected: true, isReady: true },
          ],
        },
        fastMoneyP2State: {
          phase: 'P1_READY',
          isOffstage: true,
          isolationMessage: 'Offstage in isolation',
          remainingSeconds: 75,
          isTimerRunning: false,
          canSubmit: false,
          canPass: false,
        },
        gameOver: null,
      } as any);

      renderWithProviders(<PlayerJoin roomCode="FEUD-8291" initialRoom={mockRoom} />);

      const input = screen.getByTestId('player-nickname-input');
      await user.type(input, 'Marc');
      await user.click(screen.getByTestId('player-join-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('player2-isolation-screen')).toBeInTheDocument();
        expect(screen.getByText(/Offstage Isolation Shield/i)).toBeInTheDocument();
      });
    });

    /* -------------------------------------------------------------
     * US-11 Main Game Team Partitioning & Mobile Roster Tests
     * ------------------------------------------------------------- */
    it('satisfies US-11 Scenario 1: renders Team 1 badge, batting order, and teammate roster for Team 1 player', async () => {
      const user = userEvent.setup();
      const mainGameRoomEN: Room = {
        id: 'room-main-11',
        roomCode: 'FEUD-1111',
        roomName: 'Family Feud Night',
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'LOBBY',
        createdAt: new Date().toISOString(),
      };

      const mockTeamsPayload: TeamsAssignedPayload = {
        roomCode: 'FEUD-1111',
        team1: [
          { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
          { id: 'p4', nickname: 'David', team: 'TEAM_1', battingOrder: 2 },
        ],
        team2: [
          { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
          { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 2 },
        ],
      };

      vi.spyOn(socketHook, 'useSocket').mockReturnValue({
        ...defaultSocketMock,
        socketId: 'player-socket-alice',
        roomState: {
          roomCode: 'FEUD-1111',
          roomName: 'Family Feud Night',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'ACTIVE',
          playerCount: 4,
          maxPlayers: 10,
          canStart: true,
          players: [
            { id: 'p1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
            { id: 'p2', nickname: 'Bob', team: 'TEAM_2', isReady: true, isConnected: true },
            { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', isReady: true, isConnected: true },
            { id: 'p4', nickname: 'David', team: 'TEAM_1', isReady: true, isConnected: true },
          ],
        },
        teamsAssigned: mockTeamsPayload,
      } as any);

      renderWithProviders(<PlayerJoin roomCode="FEUD-1111" initialRoom={mainGameRoomEN} />);

      // Join as Alice
      const input = screen.getByTestId('player-nickname-input');
      await user.type(input, 'Alice');
      await user.click(screen.getByTestId('player-join-submit-btn'));

      // Transitions to Main Game mobile team screen
      await waitFor(() => {
        expect(screen.getByTestId('player-main-game-team-screen')).toBeInTheDocument();
      });

      // Team 1 Badge & Batting Order
      expect(screen.getByTestId('player-team-badge')).toHaveTextContent('You are on Team 1!');
      expect(screen.getByTestId('player-batting-order')).toHaveTextContent('Player #1');

      // Teammates Roster (Alice & David)
      expect(screen.getByTestId('teammates-header')).toHaveTextContent('Your Teammates');
      expect(screen.getByTestId('teammates-roster')).toBeInTheDocument();
      expect(screen.getByTestId('teammate-item-p1')).toHaveTextContent('Player #1');
      expect(screen.getByTestId('teammate-item-p1')).toHaveTextContent('Alice');
      expect(screen.getByTestId('teammate-item-p1')).toHaveTextContent('You');
      expect(screen.getByTestId('teammate-item-p4')).toHaveTextContent('Player #2');
      expect(screen.getByTestId('teammate-item-p4')).toHaveTextContent('David');

      // Opponents Roster (Bob & Charlie)
      expect(screen.getByTestId('opponents-roster')).toBeInTheDocument();
      expect(screen.getByTestId('opponent-item-p2')).toHaveTextContent('Bob');
      expect(screen.getByTestId('opponent-item-p3')).toHaveTextContent('Charlie');

      // Face-Off Announcement
      expect(screen.getByTestId('player-face-off-banner')).toHaveTextContent('Get ready for the Face-Off!');
    });

    it('satisfies US-11 Scenario 1: renders Team 2 badge and batting order for Team 2 player', async () => {
      const user = userEvent.setup();
      const mainGameRoomEN: Room = {
        id: 'room-main-11',
        roomCode: 'FEUD-1111',
        roomName: 'Family Feud Night',
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'LOBBY',
        createdAt: new Date().toISOString(),
      };

      const mockTeamsPayload: TeamsAssignedPayload = {
        roomCode: 'FEUD-1111',
        team1: [
          { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
          { id: 'p4', nickname: 'David', team: 'TEAM_1', battingOrder: 2 },
        ],
        team2: [
          { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
          { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 2 },
        ],
      };

      vi.spyOn(socketHook, 'useSocket').mockReturnValue({
        ...defaultSocketMock,
        socketId: 'player-socket-charlie',
        roomState: {
          roomCode: 'FEUD-1111',
          roomName: 'Family Feud Night',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'ACTIVE',
          playerCount: 4,
          maxPlayers: 10,
          canStart: true,
          players: [
            { id: 'p1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
            { id: 'p2', nickname: 'Bob', team: 'TEAM_2', isReady: true, isConnected: true },
            { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', isReady: true, isConnected: true },
            { id: 'p4', nickname: 'David', team: 'TEAM_1', isReady: true, isConnected: true },
          ],
        },
        teamsAssigned: mockTeamsPayload,
      } as any);

      renderWithProviders(<PlayerJoin roomCode="FEUD-1111" initialRoom={mainGameRoomEN} />);

      // Join as Charlie
      const input = screen.getByTestId('player-nickname-input');
      await user.type(input, 'Charlie');
      await user.click(screen.getByTestId('player-join-submit-btn'));

      // Transitions to Main Game mobile team screen
      await waitFor(() => {
        expect(screen.getByTestId('player-main-game-team-screen')).toBeInTheDocument();
      });

      // Team 2 Badge & Batting Order
      expect(screen.getByTestId('player-team-badge')).toHaveTextContent('You are on Team 2!');
      expect(screen.getByTestId('player-batting-order')).toHaveTextContent('Player #2');

      // Teammate is Bob
      expect(screen.getByTestId('teammate-item-p2')).toHaveTextContent('Bob');
      expect(screen.getByTestId('teammate-item-p3')).toHaveTextContent('Charlie');
      expect(screen.getByTestId('teammate-item-p3')).toHaveTextContent('You');

      // Opponents are Team 1 (Alice & David)
      expect(screen.getByTestId('opponent-item-p1')).toHaveTextContent('Alice');
      expect(screen.getByTestId('opponent-item-p4')).toHaveTextContent('David');

      // Back button allows leaving
      const leaveBtn = screen.getByTestId('player-leave-btn');
      expect(leaveBtn).toBeInTheDocument();
      await user.click(leaveBtn);
    });

    it('satisfies US-12: transitions joined contender to MainGameFaceOffController when faceOffState is active', async () => {
      const user = userEvent.setup();
      const mainGameRoomEN: Room = {
        id: 'room-main-fo',
        roomCode: 'FEUD-7777',
        roomName: 'Face-Off Controller Duel',
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      };

      const mockFaceOffState: FaceOffSessionState = {
        roomCode: 'FEUD-7777',
        gameId: 'game-fo77',
        roundNumber: 1,
        language: 'EN',
        phase: 'BUZZER_ACTIVE',
        question: {
          id: 'q-77',
          questionText: 'Name something you find in the refrigerator',
          answers: [{ id: 'a1', answerText: 'MILK', points: 40, rankOrder: 1 }],
        },
        team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
        team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
        team1Contender: { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1, isReady: true },
        team2Contender: { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1, isReady: true },
        buzzerLocked: false,
        buzzedPlayerId: null,
        buzzedPlayerNickname: null,
        buzzedPlayerTeam: null,
        buzzedAtTimestamp: null,
        activeRespondentId: null,
        attemptedPlayerIds: [],
        initialBuzzerWinnerId: null,
        timerDurationSeconds: 15,
        remainingSeconds: 15,
        endsAt: null,
        isTimerRunning: false,
      };

      vi.spyOn(socketHook, 'useSocket').mockReturnValue({
        ...defaultSocketMock,
        socketId: 'mock-socket-alice',
        roomState: {
          roomCode: 'FEUD-7777',
          roomName: 'Face-Off Controller Duel',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'ACTIVE',
          playerCount: 2,
          maxPlayers: 10,
          canStart: true,
          players: [
            { id: 'p1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
            { id: 'p2', nickname: 'Bob', team: 'TEAM_2', isReady: true, isConnected: true },
          ],
        },
        faceOffState: mockFaceOffState,
      } as any);

      renderWithProviders(<PlayerJoin roomCode="FEUD-7777" initialRoom={mainGameRoomEN} />);

      // Join as Alice (Contender 1)
      const input = screen.getByTestId('player-nickname-input');
      await user.type(input, 'Alice');
      await user.click(screen.getByTestId('player-join-submit-btn'));

      // Transitions to Face-Off controller
      await waitFor(() => {
        expect(screen.getByTestId('main-game-face-off-controller')).toBeInTheDocument();
      });

      // Contender role badge
      expect(screen.getByTestId('role-contender-badge')).toHaveTextContent('Contender');

      // Question text visible
      expect(screen.getByTestId('controller-question-text')).toHaveTextContent(
        'Name something you find in the refrigerator'
      );

      // Buzzer button rendered
      expect(screen.getByTestId('face-off-buzzer-btn')).toHaveTextContent('BUZZ!');
    });

    it('satisfies US-13: allows winning contender to click PLAY in Pass or Play modal to emit choosePlayPass', async () => {
      const user = userEvent.setup();
      const mockChoosePlayPass = vi.fn();

      const mainGameRoomEN: Room = {
        id: 'room-main-passplay',
        roomCode: 'FEUD-8888',
        roomName: 'Pass or Play Choice Duel',
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      };

      const mockPassPlayState: FaceOffSessionState = {
        roomCode: 'FEUD-8888',
        gameId: 'game-fo88',
        roundNumber: 1,
        language: 'EN',
        phase: 'PASS_OR_PLAY',
        question: {
          id: 'q-88',
          questionText: 'Name something you pack in a suitcase',
          answers: [{ id: 'a1', answerText: 'CLOTHES', points: 60, rankOrder: 1 }],
        },
        team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
        team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
        team1Contender: { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1, isReady: true },
        team2Contender: { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1, isReady: true },
        buzzerLocked: false,
        buzzedPlayerId: 'p1',
        buzzedPlayerNickname: 'Alice',
        buzzedPlayerTeam: 'TEAM_1',
        buzzedAtTimestamp: null,
        activeRespondentId: 'p1',
        attemptedPlayerIds: ['p1'],
        initialBuzzerWinnerId: 'p1',
        timerDurationSeconds: 15,
        remainingSeconds: 15,
        endsAt: null,
        isTimerRunning: false,
        winnerPlayerId: 'p1',
        winnerNickname: 'Alice',
        winnerTeam: 'TEAM_1',
      };

      vi.spyOn(socketHook, 'useSocket').mockReturnValue({
        ...defaultSocketMock,
        socketId: 'mock-socket-alice',
        roomState: {
          roomCode: 'FEUD-8888',
          roomName: 'Pass or Play Choice Duel',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'ACTIVE',
          playerCount: 2,
          maxPlayers: 10,
          canStart: true,
          players: [
            { id: 'p1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
            { id: 'p2', nickname: 'Bob', team: 'TEAM_2', isReady: true, isConnected: true },
          ],
        },
        faceOffState: mockPassPlayState,
        choosePlayPass: mockChoosePlayPass,
      } as any);

      renderWithProviders(<PlayerJoin roomCode="FEUD-8888" initialRoom={mainGameRoomEN} />);

      // Join as Alice (winning contender)
      const input = screen.getByTestId('player-nickname-input');
      await user.type(input, 'Alice');
      await user.click(screen.getByTestId('player-join-submit-btn'));

      // Pass or Play modal rendered
      await waitFor(() => {
        expect(screen.getByTestId('face-off-pass-play-modal')).toBeInTheDocument();
      });

      const playBtn = screen.getByTestId('face-off-play-btn');
      expect(playBtn).toBeInTheDocument();
      await user.click(playBtn);

      expect(mockChoosePlayPass).toHaveBeenCalledWith('FEUD-8888', 'p1', 'play');
    });

    it('satisfies US-14: transitions joined player to MainGameTeamController when teamGuessingState is active', async () => {
      const user = userEvent.setup();
      const mockSubmitTeamGuess = vi.fn();
      const mockPassTeamTurn = vi.fn();

      const mainGameRoomEN: Room = {
        id: 'room-main-tg',
        roomCode: 'FEUD-9999',
        roomName: 'Team Guessing Duel',
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      };

      const mockTeamGuessingState: TeamGuessingSessionState = {
        roomCode: 'FEUD-9999',
        gameId: 'game-tg-99',
        roundNumber: 1,
        language: 'EN',
        phase: 'TEAM_GUESSING',
        question: {
          id: 'q-tg-99',
          questionText: 'Name something in your refrigerator',
          answerCount: 4,
        },
        controllingTeam: 'TEAM_1',
        controllingTeamName: 'Team 1',
        opposingTeam: 'TEAM_2',
        opposingTeamName: 'Team 2',
        controllingTeamPlayers: [
          { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
          { id: 'p2', nickname: 'Bob', team: 'TEAM_1', battingOrder: 2 },
        ],
        opposingTeamPlayers: [
          { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
        ],
        activePlayerIndex: 0,
        activePlayer: { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
        strikes: 1,
        roundBank: 40,
        remainingSeconds: 15,
        endsAt: Date.now() + 15000,
        isTimerRunning: true,
        revealedAnswers: [
          {
            id: 'a1',
            answerText: 'MILK',
            points: 40,
            rankOrder: 1,
            revealedByPlayerId: 'p1',
            revealedByNickname: 'Alice',
            revealedByTeam: 'TEAM_1',
          },
        ],
        totalAnswersCount: 4,
        revealedAnswersCount: 1,
        remainingAnswersCount: 3,
        winningTeam: null,
      };

      vi.spyOn(socketHook, 'useSocket').mockReturnValue({
        ...defaultSocketMock,
        roomState: {
          roomCode: 'FEUD-9999',
          roomName: 'Team Guessing Duel',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'ACTIVE',
          playerCount: 2,
          maxPlayers: 10,
          canStart: true,
          players: [
            { id: 'p1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
            { id: 'p2', nickname: 'Bob', team: 'TEAM_1', isReady: true, isConnected: true },
          ],
        },
        teamGuessingState: mockTeamGuessingState,
        submitTeamGuess: mockSubmitTeamGuess,
        passTeamTurn: mockPassTeamTurn,
      } as any);

      renderWithProviders(<PlayerJoin roomCode="FEUD-9999" initialRoom={mainGameRoomEN} />);

      const input = screen.getByTestId('player-nickname-input');
      await user.type(input, 'Alice');
      await user.click(screen.getByTestId('player-join-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('main-game-team-controller')).toBeInTheDocument();
      });

      expect(screen.getByTestId('active-guesser-banner')).toBeInTheDocument();
      expect(screen.getByTestId('player-round-bank')).toHaveTextContent('40');

      const guessInput = screen.getByTestId('player-guess-input');
      await user.type(guessInput, 'CHEESE');
      await user.click(screen.getByTestId('player-submit-guess-btn'));

      expect(mockSubmitTeamGuess).toHaveBeenCalledWith('FEUD-9999', 'p1', 'CHEESE');
    });

    it('satisfies US-16 Scenario 4: transitions joined player to victory modal upon receiving matchOver', async () => {
      const user = userEvent.setup();
      const mockMatchOver = {
        roomCode: 'FEUD-9999',
        winningTeam: 'TEAM_1' as const,
        team1GrandTotal: 340,
        team2GrandTotal: 210,
        totalRounds: 3,
      };

      vi.spyOn(socketHook, 'useSocket').mockReturnValue({
        ...defaultSocketMock,
        roomState: {
          roomCode: 'FEUD-9999',
          roomName: 'Match Over Test',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'ACTIVE',
          playerCount: 2,
          maxPlayers: 10,
          canStart: true,
          players: [
            { id: 'p1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
            { id: 'p2', nickname: 'Bob', team: 'TEAM_2', isReady: true, isConnected: true },
          ],
        },
        matchOver: mockMatchOver,
      } as any);

      const testRoom: Room = {
        id: 'room-9999',
        roomCode: 'FEUD-9999',
        roomName: 'Match Over Test',
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      };
      renderWithProviders(<PlayerJoin roomCode="FEUD-9999" initialRoom={testRoom} />);

      const input = screen.getByTestId('player-nickname-input');
      await user.type(input, 'Alice');
      await user.click(screen.getByTestId('player-join-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('match-over-modal')).toBeInTheDocument();
      });

      expect(screen.getByTestId('match-winner-headline')).toHaveTextContent(/Team 1/i);
      expect(screen.getByText(/Waiting for the host to launch a replay/i)).toBeInTheDocument();
      expect(screen.getByTestId('exit-room-btn')).toBeInTheDocument();
    });

    it('satisfies US-16 Scenario 5: transitions player back to Face-Off when matchOver is cleared on replay', async () => {
      const user = userEvent.setup();
      const mockMatchOver = {
        roomCode: 'FEUD-9999',
        winningTeam: 'TEAM_1' as const,
        team1GrandTotal: 340,
        team2GrandTotal: 210,
        totalRounds: 3,
      };

      const socketMock = {
        ...defaultSocketMock,
        roomState: {
          roomCode: 'FEUD-9999',
          roomName: 'Replay Flow Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'ACTIVE',
          playerCount: 2,
          maxPlayers: 10,
          canStart: true,
          players: [
            { id: 'p1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
            { id: 'p2', nickname: 'Bob', team: 'TEAM_2', isReady: true, isConnected: true },
          ],
        },
        matchOver: mockMatchOver,
        faceOffState: {
          roomCode: 'FEUD-9999',
          gameId: 'game-replay-2',
          roundNumber: 1,
          language: 'EN',
          phase: 'AWAITING_READY',
          question: {
            id: 'q-rep1',
            questionText: 'Name something in your glove compartment',
            answers: [{ id: 'a1', answerText: 'REGISTRATION', points: 40, rankOrder: 1 }],
          },
          team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
          team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
          team1Contender: { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1, isReady: false },
          team2Contender: { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1, isReady: false },
          buzzerLocked: false,
          buzzedPlayerId: null,
          buzzedPlayerNickname: null,
          buzzedPlayerTeam: null,
          buzzedAtTimestamp: null,
          activeRespondentId: null,
          attemptedPlayerIds: [],
          initialBuzzerWinnerId: null,
          timerDurationSeconds: 15,
          remainingSeconds: 15,
          endsAt: null,
          isTimerRunning: false,
        },
      };

      const spy = vi.spyOn(socketHook, 'useSocket').mockReturnValue(socketMock as any);

      const testRoom: Room = {
        id: 'room-9999',
        roomCode: 'FEUD-9999',
        roomName: 'Match Over Test',
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      };

      const { rerender } = renderWithProviders(
        <PlayerJoin roomCode="FEUD-9999" initialRoom={testRoom} />
      );

      const input = screen.getByTestId('player-nickname-input');
      await user.type(input, 'Alice');
      await user.click(screen.getByTestId('player-join-submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('match-over-modal')).toBeInTheDocument();
      });

      // Host triggers replay -> matchOver is cleared, faceOffState is active
      spy.mockReturnValue({
        ...socketMock,
        matchOver: null,
      } as any);

      rerender(
        <LanguageProvider>
          <RouterProvider initialPath="/play/FEUD-9999">
            <PlayerJoin roomCode="FEUD-9999" initialRoom={testRoom} />
          </RouterProvider>
        </LanguageProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('main-game-face-off-controller')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('match-over-modal')).not.toBeInTheDocument();
    });
  });
