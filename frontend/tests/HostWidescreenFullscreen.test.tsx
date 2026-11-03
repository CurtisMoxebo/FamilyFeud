import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import React from 'react';
import { AppContent } from '../src/App';
import { HostBoard } from '../src/pages/HostBoard';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import { useFullscreen } from '../src/hooks/useFullscreen';
import * as socketHook from '../src/hooks/useSocket';
import {
  Room,
  HostStateSnapshot,
  FaceOffSessionState,
  TeamGuessingSessionState,
  TeamsAssignedPayload,
} from '../src/types';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('US-22 Step 2: Host TV 16:9 Widescreen Optimization & Fullscreen Toggle (Scenario 1)', () => {
  const defaultSocketMock = {
    playerSession: null,
    hostSecret: null,
    reconnectHost: vi.fn(),
    reconnectSession: vi.fn(),
    socket: null,
    isConnected: true,
    socketId: 'host-socket',
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
    choosePlayPass: vi.fn(),
    submitFaceOffGuess: vi.fn(),
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
    kickedInfo: null,
    clearKickedInfo: vi.fn(),
    gamePaused: null,
    adminError: null,
    clearAdminError: vi.fn(),
    kickPlayer: vi.fn(),
    pauseGame: vi.fn(),
    resumeGame: vi.fn(),
    overrideAnswer: vi.fn(),
    hostOverrideOptions: [],
    answerOverrideAck: null,
    clearAnswerOverrideAck: vi.fn(),
    requestOverrideOptions: vi.fn(),
  };

  const mockMainGameRoom: Room = {
    id: 'room-tv-1',
    roomCode: 'FEUD-4KTV',
    roomName: 'Living Room 4K Broadcast',
    language: 'EN',
    gameMode: 'MAIN_GAME',
    status: 'LOBBY',
    createdAt: new Date().toISOString(),
  };

  const mockFastMoneyRoom: Room = {
    ...mockMainGameRoom,
    id: 'room-fm-tv',
    gameMode: 'FAST_MONEY',
    status: 'IN_PROGRESS',
  };

  let originalRequestFullscreen: typeof document.documentElement.requestFullscreen | undefined;
  let originalExitFullscreen: typeof document.exitFullscreen | undefined;
  let fullscreenElementValue: Element | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();

    fullscreenElementValue = null;
    originalRequestFullscreen = document.documentElement.requestFullscreen;
    originalExitFullscreen = document.exitFullscreen;

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElementValue,
    });
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalRequestFullscreen) {
      document.documentElement.requestFullscreen = originalRequestFullscreen;
    } else {
      delete (document.documentElement as Partial<HTMLElement>).requestFullscreen;
    }
    if (originalExitFullscreen) {
      document.exitFullscreen = originalExitFullscreen;
    } else {
      delete (document as Partial<Document>).exitFullscreen;
    }
    delete (document.documentElement as unknown as Record<string, unknown>).webkitRequestFullscreen;
    delete (document as unknown as Record<string, unknown>).webkitExitFullscreen;
    delete (document as unknown as Record<string, unknown>).webkitFullscreenElement;
  });

  const renderHostWithProviders = (
    ui: React.ReactElement,
    initialPath = '/host/FEUD-4KTV'
  ) =>
    render(
      <LanguageProvider>
        <RouterProvider initialPath={initialPath}>{ui}</RouterProvider>
      </LanguageProvider>
    );

  it('1. useFullscreen enters, exits, syncs on fullscreenchange, and supports WebKit & graceful error fallbacks', async () => {
    const requestMock = vi.fn().mockImplementation(async () => {
      fullscreenElementValue = document.documentElement;
    });
    const exitMock = vi.fn().mockImplementation(async () => {
      fullscreenElementValue = null;
    });
    document.documentElement.requestFullscreen = requestMock;
    document.exitFullscreen = exitMock;

    const { result } = renderHook(() => useFullscreen({ enableShortcut: true }));
    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.isFullscreenSupported).toBe(true);

    // Toggle ON
    await act(async () => {
      const ok = await result.current.toggleFullscreen();
      expect(ok).toBe(true);
    });
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(result.current.isFullscreen).toBe(true);

    // Simulate external exit (e.g., user presses Escape in browser)
    act(() => {
      fullscreenElementValue = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.isFullscreen).toBe(false);

    // WebKit fallback support
    delete (document.documentElement as Partial<HTMLElement>).requestFullscreen;
    delete (document as Partial<Document>).exitFullscreen;
    const webkitReq = vi.fn().mockResolvedValue(undefined);
    const webkitExit = vi.fn().mockResolvedValue(undefined);
    (document.documentElement as unknown as Record<string, unknown>).webkitRequestFullscreen =
      webkitReq;
    (document as unknown as Record<string, unknown>).webkitExitFullscreen = webkitExit;

    await act(async () => {
      const ok = await result.current.enterFullscreen();
      expect(ok).toBe(true);
    });
    expect(webkitReq).toHaveBeenCalledTimes(1);
    expect(result.current.isFullscreen).toBe(true);

    await act(async () => {
      const ok = await result.current.exitFullscreen();
      expect(ok).toBe(true);
    });
    expect(webkitExit).toHaveBeenCalledTimes(1);
    expect(result.current.isFullscreen).toBe(false);

    // Graceful failure if API rejects
    const rejectingReq = vi.fn().mockRejectedValue(new Error('Permissions check failed'));
    document.documentElement.requestFullscreen = rejectingReq;
    await act(async () => {
      const ok = await result.current.enterFullscreen();
      expect(ok).toBe(false);
    });
    expect(result.current.isFullscreen).toBe(false);
  });

  it('2. Host Display header renders localized Fullscreen button and toggles Fullscreen on click & F11 keydown', async () => {
    const requestMock = vi.fn().mockImplementation(async () => {
      fullscreenElementValue = document.documentElement;
    });
    const exitMock = vi.fn().mockImplementation(async () => {
      fullscreenElementValue = null;
    });
    document.documentElement.requestFullscreen = requestMock;
    document.exitFullscreen = exitMock;

    vi.spyOn(socketHook, 'useSocket').mockReturnValue(defaultSocketMock as any);

    const { unmount } = renderHostWithProviders(
      <HostBoard roomCode="FEUD-4KTV" initialRoom={mockMainGameRoom} />
    );

    const fsBtn = screen.getByTestId('host-fullscreen-toggle');
    expect(fsBtn).toBeInTheDocument();
    expect(fsBtn).toHaveAttribute('aria-pressed', 'false');
    expect(fsBtn).toHaveTextContent('Full Screen');
    expect(fsBtn).toHaveTextContent('F11');

    // Click button -> enters Fullscreen
    fireEvent.click(fsBtn);
    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(fsBtn).toHaveAttribute('aria-pressed', 'true');
      expect(fsBtn).toHaveTextContent('Exit Full Screen');
    });

    // Press F11 keydown -> exits Fullscreen
    fireEvent.keyDown(window, { key: 'F11', code: 'F11' });
    await waitFor(() => {
      expect(exitMock).toHaveBeenCalledTimes(1);
      expect(fsBtn).toHaveAttribute('aria-pressed', 'false');
      expect(fsBtn).toHaveTextContent('Full Screen');
    });

    // Repeated keydown or keydown inside an <input> is ignored
    fireEvent.keyDown(window, { key: 'F11', code: 'F11', repeat: true });
    expect(requestMock).toHaveBeenCalledTimes(1);

    const dummyInput = document.createElement('input');
    document.body.appendChild(dummyInput);
    fireEvent.keyDown(dummyInput, { key: 'F11', code: 'F11' });
    expect(requestMock).toHaveBeenCalledTimes(1);
    document.body.removeChild(dummyInput);

    unmount();

    // Verify French & Spanish localization on Host Fullscreen button
    const frRoom: Room = { ...mockMainGameRoom, language: 'FR' };
    const { unmount: unmountFr } = renderHostWithProviders(
      <HostBoard roomCode="FEUD-4KTV" initialRoom={frRoom} />
    );
    expect(screen.getByTestId('host-fullscreen-toggle')).toHaveTextContent('Plein écran');
    unmountFr();

    const esRoom: Room = { ...mockMainGameRoom, language: 'ES' };
    renderHostWithProviders(<HostBoard roomCode="FEUD-4KTV" initialRoom={esRoom} />);
    expect(screen.getByTestId('host-fullscreen-toggle')).toHaveTextContent('Pantalla completa');
  });

  it('3. Dual-Display App shell applies distinct form-factor styles for Host TV (/host/:roomCode) vs Mobile Player (/play/:roomCode)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        ({
          ok: true,
          json: async () => ({
            success: true,
            room: mockMainGameRoom,
          }),
        }) as Response
    );

    const { unmount } = renderHostWithProviders(<AppContent />, '/host/FEUD-4KTV');
    const hostShell = screen.getByTestId('app-display-shell');
    expect(hostShell).toHaveAttribute('data-display-mode', 'host');
    expect(hostShell.className).toContain('2xl:px-14');
    expect(hostShell.className).toContain('3xl:px-20');
    await waitFor(() => {
      expect(screen.getByTestId('host-widescreen-container')).toBeInTheDocument();
    });
    unmount();

    renderHostWithProviders(<AppContent />, '/play/FEUD-4KTV');
    const playerShell = screen.getByTestId('app-display-shell');
    expect(playerShell).toHaveAttribute('data-display-mode', 'player');
    expect(playerShell.className).toContain('pt-safe');
    expect(playerShell.className).toContain('pb-safe');
    expect(playerShell.className).toContain('px-safe');
    expect(playerShell.className).toContain('max-w-[100vw]');
    await waitFor(() => {
      expect(screen.getByTestId('player-room-name')).toHaveTextContent(
        'Living Room 4K Broadcast'
      );
    });
  });

  it('4. Scenario 1: Host screens scale to 16:9 widescreen (1080p/4K), enable audio/TTS by default, and render zero contestant inputs or buzzers across all stages', () => {
    // Stage A: Lobby
    const socketSpy = vi
      .spyOn(socketHook, 'useSocket')
      .mockReturnValue(defaultSocketMock as any);

    const { unmount: unmountLobby } = renderHostWithProviders(
      <HostBoard roomCode="FEUD-4KTV" initialRoom={mockMainGameRoom} />
    );

    const lobbyContainer = screen.getByTestId('host-widescreen-container');
    expect(lobbyContainer.className).toContain('2xl:max-w-7xl');
    expect(lobbyContainer.className).toContain('3xl:max-w-[1600px]');
    expect(lobbyContainer.className).toContain('4k:max-w-[2000px]');
    expect(screen.getByTestId('host-audio-toggle')).toHaveAttribute(
      'title',
      'Mute Sounds & TTS'
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    unmountLobby();

    // Stage B: Teams Assigned Stage
    const mockTeamsAssigned: TeamsAssignedPayload = {
      roomCode: 'FEUD-4KTV',
      team1: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
      team2: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
    };
    const { unmount: unmountTeams } = renderHostWithProviders(
      <HostBoard
        roomCode="FEUD-4KTV"
        initialRoom={{ ...mockMainGameRoom, status: 'ACTIVE' }}
        initialTeamsAssigned={mockTeamsAssigned}
      />
    );
    const teamsBoard = screen.getByTestId('main-game-teams-stage');
    expect(teamsBoard.className).toContain('3xl:max-w-[1600px]');
    expect(teamsBoard.className).toContain('4k:max-w-[2000px]');
    expect(screen.getByTestId('host-fullscreen-toggle')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    unmountTeams();

    // Stage C: Main Game Face-Off Board
    const mockFaceOff: FaceOffSessionState = {
      roomCode: 'FEUD-4KTV',
      gameId: 'game-fo-tv',
      roundNumber: 1,
      language: 'EN',
      phase: 'ANSWERING',
      question: {
        id: 'q1',
        questionText: 'Name something people bring to the beach',
        answers: [
          { id: 'a1', answerText: 'Towel', points: 45, rankOrder: 1 },
          { id: 'a2', answerText: 'Sunscreen', points: 30, rankOrder: 2 },
        ],
      },
      team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
      team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
      team1Contender: {
        id: 'p1',
        nickname: 'Alice',
        team: 'TEAM_1',
        battingOrder: 1,
        isReady: true,
      },
      team2Contender: {
        id: 'p2',
        nickname: 'Bob',
        team: 'TEAM_2',
        battingOrder: 1,
        isReady: true,
      },
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
      endsAt: Date.now() + 15000,
      isTimerRunning: true,
    };
    const { unmount: unmountFaceOff } = renderHostWithProviders(
      <HostBoard
        roomCode="FEUD-4KTV"
        initialRoom={{ ...mockMainGameRoom, status: 'ACTIVE' }}
        initialFaceOffState={mockFaceOff}
      />
    );
    const faceOffBoard = screen.getByTestId('main-game-face-off-board');
    expect(faceOffBoard.className).toContain('2xl:max-w-7xl');
    expect(faceOffBoard.className).toContain('3xl:max-w-[1600px]');
    expect(faceOffBoard.className).toContain('4k:max-w-[2000px]');
    expect(screen.getByTestId('host-fullscreen-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('face-off-buzzer-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('face-off-answer-input')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    unmountFaceOff();

    // Stage D: Main Game Team Guessing Board
    const mockTeamGuessing: TeamGuessingSessionState = {
      roomCode: 'FEUD-4KTV',
      gameId: 'game-tg-tv',
      roundNumber: 1,
      language: 'EN',
      phase: 'TEAM_GUESSING',
      controllingTeam: 'TEAM_1',
      controllingTeamName: 'Team 1',
      opposingTeam: 'TEAM_2',
      opposingTeamName: 'Team 2',
      activePlayer: { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
      activePlayerIndex: 0,
      controllingTeamPlayers: [
        { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
      ],
      opposingTeamPlayers: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
      stealSpokesperson: { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
      stealSpokespersonId: 'p2',
      strikes: 0,
      roundBank: 0,
      revealedAnswers: [],
      totalAnswersCount: 4,
      revealedAnswersCount: 0,
      remainingAnswersCount: 4,
      remainingSeconds: 15,
      endsAt: Date.now() + 15000,
      isTimerRunning: true,
      question: {
        id: 'q1',
        questionText: 'Name something people bring to the beach',
        answerCount: 4,
      },
    };
    const { unmount: unmountGuessing } = renderHostWithProviders(
      <HostBoard
        roomCode="FEUD-4KTV"
        initialRoom={{ ...mockMainGameRoom, status: 'ACTIVE' }}
        initialTeamGuessingState={mockTeamGuessing}
      />
    );
    const guessingBoard = screen.getByTestId('main-game-team-guessing-board');
    expect(guessingBoard.className).toContain('w-full');
    expect(guessingBoard.className).toContain('2xl:px-10');
    expect(screen.getByTestId('host-fullscreen-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('team-guess-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('steal-answer-input')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    unmountGuessing();

    // Stage E: Fast Money Host Board
    const mockFmSnapshot: HostStateSnapshot = {
      phase: 'P1_PLAYING',
      activeQuestionNumber: 1,
      totalQuestions: 5,
      answeredCount: 0,
      remainingSeconds: 45,
      isTimerRunning: true,
      currentQuestionText: 'Name a popular fruit',
      slots: [
        { slotNumber: 1, isFilled: false },
        { slotNumber: 2, isFilled: false },
        { slotNumber: 3, isFilled: false },
        { slotNumber: 4, isFilled: false },
        { slotNumber: 5, isFilled: false },
      ],
    };
    socketSpy.mockReturnValue({
      ...defaultSocketMock,
      fastMoneyHostState: mockFmSnapshot,
    } as any);

    renderHostWithProviders(
      <HostBoard roomCode="FEUD-4KTV" initialRoom={mockFastMoneyRoom} />
    );
    const fmBoard = screen.getByTestId('fast-money-host-board');
    expect(fmBoard.className).toContain('2xl:max-w-7xl');
    expect(fmBoard.className).toContain('3xl:max-w-[1600px]');
    expect(fmBoard.className).toContain('4k:max-w-[2000px]');
    expect(screen.getByTestId('host-fullscreen-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('fast-money-answer-input')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
