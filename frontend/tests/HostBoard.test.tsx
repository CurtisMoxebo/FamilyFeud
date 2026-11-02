import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { HostBoard } from '../src/pages/HostBoard';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import { Room, RoomStateUpdate } from '../src/types';
import * as socketHook from '../src/hooks/useSocket';

describe('Frontend Regression Suite: HostBoard Page & QR Code (US-02, US-03 & US-04)', () => {
  const mockRoom: Room = {
    id: 'room-abc',
    roomCode: 'FEUD-7890',
    roomName: 'Soirée Famille',
    language: 'FR',
    gameMode: 'FAST_MONEY',
    status: 'LOBBY',
    createdAt: new Date().toISOString(),
  };

  const defaultSocketMock = {
    socket: null,
    isConnected: true,
    socketId: 'host-socket',
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
  };

  const renderWithProviders = (ui: React.ReactElement, initialPath = '/host/FEUD-7890') => {
    return render(
      <LanguageProvider>
        <RouterProvider initialPath={initialPath}>{ui}</RouterProvider>
      </LanguageProvider>
    );
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('satisfies Scenario 3: Language and Mode Persistence with initialRoom prop', () => {
    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    // Room Name and Code
    expect(screen.getByText('Soirée Famille')).toBeInTheDocument();
    expect(screen.getByTestId('host-room-code')).toHaveTextContent('FEUD-7890');

    // Language reflects French
    expect(screen.getByTestId('host-room-language')).toHaveTextContent('Français (FR)');

    // Mode reflects Fast Money (Face-à-Face Rapide in French)
    expect(screen.getByTestId('host-room-mode')).toHaveTextContent(/Face-à-Face Rapide/i);

    // Status is LOBBY
    expect(screen.getByText('LOBBY')).toBeInTheDocument();
  });

  it('satisfies US-03 Scenario 1: renders high-contrast QR code and mobile scan instructions', () => {
    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    // Check QR Code SVG is rendered
    const qrCode = screen.getByTestId('host-qr-code');
    expect(qrCode).toBeInTheDocument();
    expect(qrCode.tagName.toLowerCase()).toBe('svg');

    // Check scan instruction in French
    const scanInstruction = screen.getByTestId('host-scan-instruction');
    expect(scanInstruction).toBeInTheDocument();
    expect(scanInstruction).toHaveTextContent(/scannez avec votre téléphone/i);

    // Check direct link URL is displayed
    expect(screen.getByText(new RegExp('/play/FEUD-7890'))).toBeInTheDocument();
  });

  it('satisfies US-03 Scenario 2: copies the join URL when Copy Link is clicked', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    const copyBtn = screen.getByTestId('host-copy-link-btn');
    await user.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('/play/FEUD-7890'));
    expect(screen.getByText(/copié/i)).toBeInTheDocument();

    // Secondary link copy button also works
    const directCopyBtn = screen.getByTestId('host-direct-link-copy-btn');
    await user.click(directCopyBtn);
    expect(writeTextMock).toHaveBeenCalledTimes(2);
  });

  it('fetches room details via REST API when loaded without initialRoom', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        room: {
          ...mockRoom,
          language: 'ES',
          gameMode: 'MAIN_GAME',
          roomName: 'Noche en Familia',
        },
      }),
    } as Response);

    renderWithProviders(<HostBoard roomCode="FEUD-7890" />);

    // Shows loading initially
    expect(screen.getByText(/loading game show board/i)).toBeInTheDocument();

    // Resolves and displays Spanish Main Game details
    await waitFor(() => {
      expect(screen.getByText('Noche en Familia')).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/rooms/FEUD-7890'));
    expect(screen.getByTestId('host-room-language')).toHaveTextContent('Español (ES)');
    expect(screen.getByTestId('host-room-mode')).toHaveTextContent(/Juego Principal/i);
    expect(screen.getByTestId('host-qr-code')).toBeInTheDocument();
  });

  it('displays error state when room cannot be found (404) and allows returning home', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        success: false,
        error: 'Room not found',
      }),
    } as Response);

    renderWithProviders(<HostBoard roomCode="FEUD-NONEXISTENT" />);

    await waitFor(() => {
      expect(screen.getByText(/room unavailable/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/room not found/i)).toBeInTheDocument();
    const backBtn = screen.getByRole('button', { name: /back to home/i });
    expect(backBtn).toBeInTheDocument();

    await user.click(backBtn);
  });

  it('allows host to leave lobby and return to home page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    const leaveBtn = screen.getByTestId('host-back-home-btn');
    expect(leaveBtn).toBeInTheDocument();
    await user.click(leaveBtn);
  });

  /* -------------------------------------------------------------
   * US-04 Specific Tests: Roster, Capacity, Dynamic Start Game
   * ------------------------------------------------------------- */
  it('satisfies US-04 Scenario 1: displays empty roster initially and disables Start button', () => {
    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    // Empty roster state
    expect(screen.getByTestId('host-empty-roster')).toBeInTheDocument();
    expect(screen.getByTestId('host-roster-count')).toHaveTextContent('0 / 2 Players');

    // Start Game button is disabled with Fast Money waiting message
    const startBtn = screen.getByTestId('host-start-game-btn');
    expect(startBtn).toBeDisabled();
    expect(screen.getByTestId('host-start-disabled-reason')).toHaveTextContent(
      /en attente de 2 joueurs \(actuel : 0\/2\)/i
    );
  });

  it('satisfies US-04 Scenario 1 & 3: renders live roster and enables Start Game button when Fast Money reaches 2 players', async () => {
    const user = userEvent.setup();
    const onStartGameMock = vi.fn();

    const mockState: RoomStateUpdate = {
      roomCode: 'FEUD-7890',
      roomName: 'Soirée Famille',
      language: 'FR',
      gameMode: 'FAST_MONEY',
      status: 'LOBBY',
      playerCount: 2,
      maxPlayers: 2,
      canStart: true,
      players: [
        { id: 'p1', nickname: 'Sarah', team: 'NONE', isReady: true, isConnected: true },
        { id: 'p2', nickname: 'Michael', team: 'NONE', isReady: true, isConnected: true },
      ],
    };

    const startGameMock = vi.fn();
    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: mockState,
      startGame: startGameMock,
    });

    renderWithProviders(
      <HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} onStartGame={onStartGameMock} />
    );

    // Player roster rendering
    expect(screen.getByTestId('host-roster-count')).toHaveTextContent('2 / 2 Players');
    expect(screen.getByTestId('host-player-card-Sarah')).toBeInTheDocument();
    expect(screen.getByTestId('host-player-card-Michael')).toBeInTheDocument();

    // Start Game button is enabled with player count
    const startBtn = screen.getByTestId('host-start-game-btn');
    expect(startBtn).toBeEnabled();
    expect(startBtn).toHaveTextContent(/lancer la partie \(2 joueurs\)/i);

    // Clicking fires onStartGame and startGame socket emitter
    await user.click(startBtn);
    expect(startGameMock).toHaveBeenCalledWith('FEUD-7890');
    expect(onStartGameMock).toHaveBeenCalledTimes(1);
  });

  it('satisfies US-04 Scenario 3: enforces even player count for Main Game mode', () => {
    const mainGameRoom: Room = {
      ...mockRoom,
      gameMode: 'MAIN_GAME',
    };

    const mockState: RoomStateUpdate = {
      roomCode: 'FEUD-7890',
      roomName: 'Soirée Famille',
      language: 'FR',
      gameMode: 'MAIN_GAME',
      status: 'LOBBY',
      playerCount: 3,
      maxPlayers: 10,
      canStart: false,
      startDisabledReason: 'Waiting for an even number of players (current: 3)',
      players: [
        { id: 'p1', nickname: 'Sarah', team: 'NONE', isReady: true, isConnected: true },
        { id: 'p2', nickname: 'Michael', team: 'NONE', isReady: true, isConnected: true },
        { id: 'p3', nickname: 'Lucas', team: 'NONE', isReady: true, isConnected: true },
      ],
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: mockState,
    });

    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mainGameRoom} />);

    expect(screen.getByTestId('host-roster-count')).toHaveTextContent('3 / 10 Players');
    const startBtn = screen.getByTestId('host-start-game-btn');
    expect(startBtn).toBeDisabled();

    // Helper message explains odd count restriction
    expect(screen.getByTestId('host-start-disabled-reason')).toHaveTextContent(
      /en attente d’un nombre pair de joueurs \(actuel : 3\)/i
    );
  });

  it('satisfies US-04 Scenario 4: renders disconnected badge when a player disconnects', () => {
    const mockState: RoomStateUpdate = {
      roomCode: 'FEUD-7890',
      roomName: 'Soirée Famille',
      language: 'FR',
      gameMode: 'FAST_MONEY',
      status: 'LOBBY',
      playerCount: 1,
      maxPlayers: 2,
      canStart: false,
      players: [
        { id: 'p1', nickname: 'Sarah', team: 'NONE', isReady: true, isConnected: true },
        { id: 'p2', nickname: 'Michael', team: 'NONE', isReady: true, isConnected: false },
      ],
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: mockState,
    });

    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    // Count is 1 / 2
    expect(screen.getByTestId('host-roster-count')).toHaveTextContent('1 / 2 Players');

    // Michael has disconnected badge
    const michaelCard = screen.getByTestId('host-player-card-Michael');
    expect(michaelCard).toHaveTextContent(/déconnecté/i);

    // Start button is disabled
    expect(screen.getByTestId('host-start-game-btn')).toBeDisabled();
  });

  it('satisfies US-07 Scenario 1 & 2: transitions from lobby to FastMoneyHostBoard upon receiving fastMoneyHostState', () => {
    const mockHostSnapshot = {
      phase: 'P1_PLAYING',
      activeQuestionNumber: 1,
      totalQuestions: 5,
      answeredCount: 0,
      remainingSeconds: 60,
      isTimerRunning: true,
      currentQuestionText: 'Nommez un aliment pour le petit déjeuner',
      slots: [
        { slotNumber: 1, isFilled: false },
        { slotNumber: 2, isFilled: false },
        { slotNumber: 3, isFilled: false },
        { slotNumber: 4, isFilled: false },
        { slotNumber: 5, isFilled: false },
      ],
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: {
        roomCode: 'FEUD-7890',
        status: 'PLAYING',
        playerCount: 2,
        maxPlayers: 2,
        players: [],
      },
      fastMoneyHostState: mockHostSnapshot,
    } as any);

    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    expect(screen.getByTestId('fast-money-host-board')).toBeInTheDocument();
    expect(screen.getByTestId('fast-money-host-timer')).toHaveTextContent('60s');
    expect(screen.getByTestId('fast-money-host-question')).toHaveTextContent(
      'Nommez un aliment pour le petit déjeuner'
    );
    expect(screen.getByTestId('fast-money-slot-1')).toBeInTheDocument();
  });
});
