import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { PlayerJoin } from '../src/pages/PlayerJoin';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import { Room, RoomStateUpdate } from '../src/types';
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
    socket: null,
    isConnected: true,
    socketId: 'mock-player-socket',
    roomState: null,
    roomError: null,
    gameStarted: null,
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
  });