import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { HostBoard } from '../src/pages/HostBoard';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import { Room, RoomStateUpdate, TeamsAssignedPayload, FaceOffSessionState, TeamGuessingSessionState } from '../src/types';
import * as socketHook from '../src/hooks/useSocket';
import * as sfxModule from '../src/utils/soundEffects';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('Frontend Regression Suite: HostBoard Page & QR Code (US-02, US-03 & US-04)', () => {
  const mockRoom: Room = {
    id: 'room-abc',
    roomCode: 'FEUD-7890',
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
    repeatFastMoneyQuestion: vi.fn(),
    repeatQuestionAlert: null,
    clearRepeatQuestionAlert: vi.fn(),
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

    // Room Code
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
    expect(screen.queryByTestId('host-direct-link-copy-btn')).not.toBeInTheDocument();
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
        },
      }),
    } as Response);

    renderWithProviders(<HostBoard roomCode="FEUD-7890" />);

    // Shows loading initially
    expect(screen.getByText(/loading game show board/i)).toBeInTheDocument();

    // Resolves and displays Spanish Main Game details
    await waitFor(() => {
      expect(screen.getByTestId('host-room-code')).toHaveTextContent('FEUD-7890');
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

  it('allows host to leave lobby, emits leave_room to disconnect players, and returns to home page', async () => {
    const user = userEvent.setup();
    const leaveRoomSpy = vi.fn();
    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      leaveRoom: leaveRoomSpy,
    });
    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    const leaveBtn = screen.getByTestId('host-back-home-btn');
    expect(leaveBtn).toBeInTheDocument();
    await user.click(leaveBtn);
    expect(leaveRoomSpy).toHaveBeenCalledWith({ roomCode: 'FEUD-7890', isHost: true });
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

    // Fast Money Host Button disables and renders loading spinner
    expect(startBtn).toBeDisabled();
    expect(screen.getByTestId('host-start-game-spinner')).toBeInTheDocument();
  });

  it('satisfies US-04 Scenario 3: enforces even player count for Main Game mode', () => {
    const mainGameRoom: Room = {
      ...mockRoom,
      gameMode: 'MAIN_GAME',
    };

    const mockState: RoomStateUpdate = {
      roomCode: 'FEUD-7890',
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

    // Helper message explains odd count restriction (US-11 Scenario 2)
    expect(screen.getByTestId('host-start-disabled-reason')).toHaveTextContent(
      /impossible de commencer avec un nombre impair de joueurs \(3\)/i
    );
  });

  it('satisfies US-04 Scenario 4: renders disconnected badge when a player disconnects', () => {
    const mockState: RoomStateUpdate = {
      roomCode: 'FEUD-7890',
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

  it('satisfies US-10: wires Player 2 reveal and replay socket actions in HostBoard', () => {
    const startP2RevealSpy = vi.fn();
    const revealP2AnswerSpy = vi.fn();
    const revealP2PointsSpy = vi.fn();
    const requestReplaySpy = vi.fn();

    const mockHostSnapshot = {
      phase: 'P2_FINISHED',
      activeQuestionNumber: null,
      totalQuestions: 5,
      answeredCount: 5,
      remainingSeconds: 0,
      isTimerRunning: false,
      currentQuestionText: null,
      totalScore: 130,
      slots: [],
      p1Slots: [],
      p2Slots: [],
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      fastMoneyHostState: mockHostSnapshot,
      startP2FastMoneyRevealPhase: startP2RevealSpy,
      revealP2FastMoneyAnswer: revealP2AnswerSpy,
      revealP2FastMoneyPoints: revealP2PointsSpy,
      requestReplay: requestReplaySpy,
    } as any);

    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    // Start P2 Reveal button is rendered
    const startP2Btn = screen.getByTestId('host-start-p2-reveal-btn');
    expect(startP2Btn).toBeInTheDocument();
    fireEvent.click(startP2Btn);
    expect(startP2RevealSpy).toHaveBeenCalledWith('FEUD-7890');
  });

  /* -------------------------------------------------------------
   * US-11 Main Game Team Partitioning & Even-Player Validation Tests
   * ------------------------------------------------------------- */
  it('satisfies US-11 Scenario 2: disables Start Game button with exact odd-player warning when 5 players connected', () => {
    const mainGameRoomEN: Room = {
      id: 'room-us11',
      roomCode: 'FEUD-5555',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'LOBBY',
      createdAt: new Date().toISOString(),
    };

    const mockState5Players: RoomStateUpdate = {
      roomCode: 'FEUD-5555',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'LOBBY',
      playerCount: 5,
      maxPlayers: 10,
      canStart: false,
      startDisabledReason: 'Cannot start with an odd number of players (5). Connect 1 more player to reach 6.',
      players: [
        { id: 'p1', nickname: 'Alice', team: 'NONE', isReady: true, isConnected: true },
        { id: 'p2', nickname: 'Bob', team: 'NONE', isReady: true, isConnected: true },
        { id: 'p3', nickname: 'Charlie', team: 'NONE', isReady: true, isConnected: true },
        { id: 'p4', nickname: 'David', team: 'NONE', isReady: true, isConnected: true },
        { id: 'p5', nickname: 'Emma', team: 'NONE', isReady: true, isConnected: true },
      ],
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: mockState5Players,
    });

    renderWithProviders(<HostBoard roomCode="FEUD-5555" initialRoom={mainGameRoomEN} />, '/host/FEUD-5555');

    // Count is 5 / 10
    expect(screen.getByTestId('host-roster-count')).toHaveTextContent('5 / 10 Players');

    // Button is disabled
    const startBtn = screen.getByTestId('host-start-game-btn');
    expect(startBtn).toBeDisabled();

    // Exact warning message
    expect(screen.getByTestId('host-start-disabled-reason')).toHaveTextContent(
      'Cannot start with an odd number of players (5). Connect 1 more player to reach 6.'
    );
  });

  it('satisfies US-11 Scenario 1: displays dual-column team rosters with batting order numbers upon teams_assigned', () => {
    const mainGameRoomEN: Room = {
      id: 'room-us11',
      roomCode: 'FEUD-4444',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'LOBBY',
      createdAt: new Date().toISOString(),
    };

    const mockTeamsPayload: TeamsAssignedPayload = {
      roomCode: 'FEUD-4444',
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
      teamsAssigned: mockTeamsPayload,
    });

    renderWithProviders(<HostBoard roomCode="FEUD-4444" initialRoom={mainGameRoomEN} />, '/host/FEUD-4444');

    // Team partitioning stage is displayed
    expect(screen.getByTestId('main-game-teams-stage')).toBeInTheDocument();
    expect(screen.getByTestId('teams-assigned-title')).toHaveTextContent('Teams Assigned!');
    expect(screen.getByTestId('teams-assigned-subtitle')).toHaveTextContent(
      'Players have been randomly split into two balanced teams.'
    );

    // Dual columns: Team 1 (Blue) and Team 2 (Rose)
    expect(screen.getByTestId('team-1-column')).toBeInTheDocument();
    expect(screen.getByTestId('team-1-title')).toHaveTextContent('Team 1');
    expect(screen.getByTestId('team-1-player-p1')).toHaveTextContent('Player #1');
    expect(screen.getByTestId('team-1-player-p1')).toHaveTextContent('Alice');
    expect(screen.getByTestId('team-1-player-p4')).toHaveTextContent('Player #2');
    expect(screen.getByTestId('team-1-player-p4')).toHaveTextContent('David');

    // VS emblem
    expect(screen.getByTestId('versus-emblem')).toHaveTextContent('VS');

    // Team 2
    expect(screen.getByTestId('team-2-column')).toBeInTheDocument();
    expect(screen.getByTestId('team-2-title')).toHaveTextContent('Team 2');
    expect(screen.getByTestId('team-2-player-p2')).toHaveTextContent('Player #1');
    expect(screen.getByTestId('team-2-player-p2')).toHaveTextContent('Bob');
    expect(screen.getByTestId('team-2-player-p3')).toHaveTextContent('Player #2');
    expect(screen.getByTestId('team-2-player-p3')).toHaveTextContent('Charlie');

    // Footer banner
    expect(screen.getByTestId('face-off-banner')).toHaveTextContent('Get ready for the Face-Off!');
  });

  it('satisfies US-12: renders MainGameFaceOffBoard when faceOffState is active in Main Game room', () => {
    const mainGameRoomEN: Room = {
      id: 'room-main-fo',
      roomCode: 'FEUD-5555',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    const mockFaceOffState: FaceOffSessionState = {
      roomCode: 'FEUD-5555',
      gameId: 'game-fo55',
      roundNumber: 1,
      language: 'EN',
      phase: 'BUZZER_ACTIVE',
      question: {
        id: 'q-55',
        questionText: 'Name something you find in a garage',
        answers: [{ id: 'a1', answerText: 'CAR', points: 50, rankOrder: 1 }],
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
      faceOffState: mockFaceOffState,
    });

    renderWithProviders(<HostBoard roomCode="FEUD-5555" initialRoom={mainGameRoomEN} />, '/host/FEUD-5555');

    // Face-Off board rendered
    expect(screen.getByTestId('main-game-face-off-board')).toBeInTheDocument();
    expect(screen.getByTestId('face-off-question-text')).toHaveTextContent('Name something you find in a garage');
    expect(screen.getByTestId('c1-nickname')).toHaveTextContent('Alice');
    expect(screen.getByTestId('c2-nickname')).toHaveTextContent('Bob');
  });

  it('satisfies US-13: renders Pass or Play prompt and control assignment banner on HostBoard', () => {
    const mainGameRoomEN: Room = {
      id: 'room-passplay',
      roomCode: 'FEUD-6666',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    const mockPassPlayState: FaceOffSessionState = {
      roomCode: 'FEUD-6666',
      gameId: 'game-fo66',
      roundNumber: 1,
      language: 'EN',
      phase: 'PASS_OR_PLAY',
      question: {
        id: 'q-66',
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
      revealedAnswers: [
        {
          id: 'a1',
          answerText: 'CLOTHES',
          points: 60,
          rankOrder: 1,
          revealedByPlayerId: 'p1',
          revealedByNickname: 'Alice',
          revealedByTeam: 'TEAM_1',
        },
      ],
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      faceOffState: mockPassPlayState,
      promptPassPlay: {
        roomCode: 'FEUD-6666',
        winnerPlayerId: 'p1',
        winnerNickname: 'Alice',
        winnerTeam: 'TEAM_1',
        roundNumber: 1,
      },
    });

    renderWithProviders(<HostBoard roomCode="FEUD-6666" initialRoom={mainGameRoomEN} />, '/host/FEUD-6666');

    // Shows survey card revealed
    expect(screen.getByTestId('face-off-card-1')).toHaveTextContent('CLOTHES');
    expect(screen.getByTestId('number-one-badge')).toBeInTheDocument();

    // Shows Pass or Play banner
    expect(screen.getByTestId('face-off-pass-play-banner')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for Alice to choose Play or Pass/i)).toBeInTheDocument();
  });

  it('satisfies US-14: renders MainGameTeamGuessingBoard when teamGuessingState is active', () => {
    const mainGameRoomEN: Room = {
      id: 'room-tg-1',
      roomCode: 'FEUD-7777',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    const mockTeamGuessingState: TeamGuessingSessionState = {
      roomCode: 'FEUD-7777',
      gameId: 'game-tg1',
      roundNumber: 1,
      language: 'EN',
      phase: 'TEAM_GUESSING',
      question: {
        id: 'q-tg1',
        questionText: 'Name something in your refrigerator',
        answerCount: 4,
      },
      controllingTeam: 'TEAM_1',
      controllingTeamName: 'Team 1',
      opposingTeam: 'TEAM_2',
      opposingTeamName: 'Team 2',
      controllingTeamPlayers: [
        { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
        { id: 'p2', nickname: 'Charlie', team: 'TEAM_1', battingOrder: 2 },
      ],
      opposingTeamPlayers: [
        { id: 'p3', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
      ],
      activePlayerIndex: 1,
      activePlayer: { id: 'p2', nickname: 'Charlie', team: 'TEAM_1', battingOrder: 2 },
      strikes: 1,
      roundBank: 45,
      remainingSeconds: 12,
      endsAt: Date.now() + 12000,
      isTimerRunning: true,
      revealedAnswers: [
        {
          id: 'a1',
          answerText: 'MILK',
          points: 45,
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
      teamGuessingState: mockTeamGuessingState,
    });

        renderWithProviders(<HostBoard roomCode="FEUD-7777" initialRoom={mainGameRoomEN} />, '/host/FEUD-7777');

    expect(screen.getByTestId('main-game-team-guessing-board')).toBeInTheDocument();
    expect(screen.getByText(/"Name something in your refrigerator"/i)).toBeInTheDocument();
    expect(screen.getByTestId('round-bank-display')).toHaveTextContent('45');
    expect(screen.getByTestId('strike-box-1')).toHaveTextContent('X');
    expect(screen.getByTestId('team-board-card-1')).toHaveTextContent('MILK');
  });

  it('satisfies US-16 Scenario 1, 4 & 5: renders grand total scoreboard, victory modal on matchOver, and wires Play Again', async () => {
    const user = userEvent.setup();
    const requestReplayMock = vi.fn();
    const mockScoreboardState = {
      roomCode: 'FEUD-7777',
      team1GrandTotal: 310,
      team2GrandTotal: 190,
      activeRoundBank: 0,
      currentRoundNumber: 3,
      totalRounds: 3,
      phase: 'MATCH_OVER',
    };
    const mockMatchOver = {
      roomCode: 'FEUD-7777',
      winningTeam: 'TEAM_1' as const,
      team1GrandTotal: 310,
      team2GrandTotal: 190,
      totalRounds: 3,
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      scoreboardState: mockScoreboardState,
      matchOver: mockMatchOver,
      requestReplay: requestReplayMock,
      teamGuessingState: {
        roomCode: 'FEUD-7777',
        roundNumber: 3,
        gameId: 'game-1',
        language: 'EN',
        question: {
          id: 'q-3',
          questionText: 'Final Question',
          answerCount: 1,
        },
        phase: 'RESOLVED' as const,
        controllingTeam: 'TEAM_1' as const,
        controllingTeamName: 'Team 1',
        opposingTeam: 'TEAM_2' as const,
        opposingTeamName: 'Team 2',
        controllingTeamPlayers: [],
        opposingTeamPlayers: [],
        activePlayerIndex: 0,
        activePlayer: null,
        strikes: 0,
        roundBank: 0,
        remainingSeconds: 0,
        endsAt: 0,
        isTimerRunning: false,
        revealedAnswers: [],
        totalAnswersCount: 1,
        revealedAnswersCount: 0,
        remainingAnswersCount: 1,
        winningTeam: 'TEAM_1' as const,
      },
    });

        const testRoom: Room = {
      id: 'room-7777',
      roomCode: 'FEUD-7777',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
    };
    renderWithProviders(<HostBoard roomCode="FEUD-7777" initialRoom={testRoom} />, '/host/FEUD-7777');

    // Scoreboard header rendered with cumulative totals
    expect(screen.getByTestId('grand-total-header')).toBeInTheDocument();
    expect(screen.getByTestId('team1-grand-total')).toHaveTextContent('310');
    expect(screen.getByTestId('team2-grand-total')).toHaveTextContent('190');

    // Victory modal rendered
    expect(screen.getByTestId('match-over-modal')).toBeInTheDocument();
    expect(screen.getByTestId('match-winner-headline')).toHaveTextContent(/Team 1/i);

    // Host clicks Play Again
    const replayBtn = screen.getByTestId('play-again-btn');
    await user.click(replayBtn);
    expect(requestReplayMock).toHaveBeenCalledWith('FEUD-7777');
  });

  it('satisfies US-16 Scenario 3: allows Host to click Next Round to advance match to next face-off', async () => {
    const user = userEvent.setup();
    const advanceNextRoundMock = vi.fn();

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      scoreboardState: {
        roomCode: 'FEUD-7777',
        team1GrandTotal: 100,
        team2GrandTotal: 0,
        activeRoundBank: 0,
        currentRoundNumber: 1,
        totalRounds: 3,
        phase: 'ROUND_RESOLVED',
      },
      advanceNextRound: advanceNextRoundMock,
      teamGuessingState: {
        roomCode: 'FEUD-7777',
        roundNumber: 1,
        gameId: 'game-1',
        language: 'EN',
        question: {
          id: 'q-1',
          questionText: 'Round 1 Question',
          answerCount: 1,
        },
        phase: 'RESOLVED' as const,
        controllingTeam: 'TEAM_1' as const,
        controllingTeamName: 'Team 1',
        opposingTeam: 'TEAM_2' as const,
        opposingTeamName: 'Team 2',
        controllingTeamPlayers: [],
        opposingTeamPlayers: [],
        activePlayerIndex: 0,
        activePlayer: null,
        strikes: 0,
        roundBank: 100,
        remainingSeconds: 0,
        endsAt: 0,
        isTimerRunning: false,
        revealedAnswers: [],
        totalAnswersCount: 1,
        revealedAnswersCount: 0,
        remainingAnswersCount: 1,
        winningTeam: 'TEAM_1' as const,
      },
    });

    const testRoom: Room = {
      id: 'room-7777',
      roomCode: 'FEUD-7777',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
    };
    renderWithProviders(<HostBoard roomCode="FEUD-7777" initialRoom={testRoom} />, '/host/FEUD-7777');

    const nextRoundBtn = screen.getByTestId('next-round-btn');
    expect(nextRoundBtn).toBeInTheDocument();
    await user.click(nextRoundBtn);
    expect(advanceNextRoundMock).toHaveBeenCalledWith('FEUD-7777');
  });

  it('satisfies US-17 Scenario 4: renders host audio toggle button in lobby and toggles mute preference', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />, '/host/FEUD-7890');

    const audioToggle = screen.getByTestId('host-audio-toggle');
    expect(audioToggle).toBeInTheDocument();
    expect(audioToggle).toHaveAttribute('title', 'Mute Sounds & TTS');

    await user.click(audioToggle);
    expect(localStorage.getItem('family_feud_tts_muted')).toBe('true');
    expect(audioToggle).toHaveAttribute('title', 'Unmute Sounds & TTS');

    await user.click(audioToggle);
    expect(localStorage.getItem('family_feud_tts_muted')).toBe('false');
    expect(audioToggle).toHaveAttribute('title', 'Mute Sounds & TTS');
  });

  it('satisfies US-17 Scenario 4: preserves host mute preference when transitioning from lobby to FastMoneyHostBoard', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />, '/host/FEUD-7890');

    const audioToggle = screen.getByTestId('host-audio-toggle');
    expect(audioToggle).toHaveAttribute('title', 'Mute Sounds & TTS');

    // Mute in lobby
    await user.click(audioToggle);
    expect(localStorage.getItem('family_feud_tts_muted')).toBe('true');

    // Simulate transition to FastMoneyHostBoard
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

    cleanup();
    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    // FastMoneyHostBoard button should be in unmuted / muted state according to localStorage
    const gameAudioToggle = screen.getByTestId('host-audio-toggle');
    expect(gameAudioToggle).toHaveAttribute('title', 'Unmute Sounds & TTS');
  });

  it('satisfies US-18 Scenario 3: resumes audio context on host start game click and unmute', async () => {
    const resumeSpy = vi.spyOn(sfxModule, 'resumeAudioContext').mockResolvedValue(undefined);
    const user = userEvent.setup();

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: {
        roomCode: 'FEUD-7890',
        status: 'LOBBY',
        playerCount: 2,
        maxPlayers: 2,
        canStart: true,
        players: [
          { id: 'p1', nickname: 'Alice', isHost: false, role: 'PLAYER_1' },
          { id: 'p2', nickname: 'Bob', isHost: false, role: 'PLAYER_2' },
        ],
      },
    } as any);

    cleanup();
    renderWithProviders(<HostBoard roomCode="FEUD-7890" initialRoom={mockRoom} />);

    const startBtn = screen.getByTestId('host-start-game-btn');
    await user.click(startBtn);

    expect(resumeSpy).toHaveBeenCalled();
  });

  it('satisfies US-28: shows MainGameTeamsStage when teamsAssigned is received and advances to Face-Off when Proceed is clicked', async () => {
    const user = userEvent.setup();
    const mainGameRoomEN: Room = {
      id: 'room-main-showcase',
      roomCode: 'FEUD-9999',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    const mockTeamsPayload: TeamsAssignedPayload = {
      roomCode: 'FEUD-9999',
      team1: [
        { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
        { id: 'p2', nickname: 'Bob', team: 'TEAM_1', battingOrder: 2 },
      ],
      team2: [
        { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
        { id: 'p4', nickname: 'David', team: 'TEAM_2', battingOrder: 2 },
      ],
    };

    const mockFaceOffState: FaceOffSessionState = {
      roomCode: 'FEUD-9999',
      gameId: 'game-9999',
      roundNumber: 1,
      language: 'EN',
      phase: 'BUZZER_ACTIVE',
      question: {
        id: 'q-99',
        questionText: 'Name something in your fridge',
        answers: [{ id: 'a1', answerText: 'MILK', points: 40, rankOrder: 1 }],
      },
      team1Players: mockTeamsPayload.team1.map((p) => ({ ...p, nickname: p.nickname || '' })),
      team2Players: mockTeamsPayload.team2.map((p) => ({ ...p, nickname: p.nickname || '' })),
      team1Contender: {
        ...mockTeamsPayload.team1[0],
        nickname: mockTeamsPayload.team1[0].nickname || '',
        isReady: true,
      },
      team2Contender: {
        ...mockTeamsPayload.team2[0],
        nickname: mockTeamsPayload.team2[0].nickname || '',
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
      endsAt: null,
      isTimerRunning: false,
      firstGuessResult: null,
      secondGuessResult: null,
      winnerPlayerId: null,
      winnerNickname: null,
      winnerTeam: null,
      passOrPlayDecision: null,
      controllingTeam: null,
      revealedAnswers: [],
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      teamsAssigned: mockTeamsPayload,
      faceOffState: mockFaceOffState,
    } as any);

    cleanup();
    renderWithProviders(<HostBoard roomCode="FEUD-9999" initialRoom={mainGameRoomEN} />, '/host/FEUD-9999');

    // 1. Teams stage is displayed first
    expect(screen.getByTestId('main-game-teams-stage')).toBeInTheDocument();
    expect(screen.getByTestId('teams-assigned-title')).toBeInTheDocument();
    expect(screen.queryByTestId('main-game-face-off-board')).not.toBeInTheDocument();

    // 2. Click Start Face-Off button
    const startFaceOffBtn = screen.getByTestId('start-face-off-btn');
    expect(startFaceOffBtn).toBeInTheDocument();
    await user.click(startFaceOffBtn);

    // 3. Transitions to Face-Off board
    expect(screen.getByTestId('main-game-face-off-board')).toBeInTheDocument();
    expect(screen.queryByTestId('main-game-teams-stage')).not.toBeInTheDocument();
  });
});
