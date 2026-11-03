import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { HostBoard } from '../src/pages/HostBoard';
import { PlayerJoin } from '../src/pages/PlayerJoin';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import {
  Room,
  RoomStateUpdate,
  HostStateSnapshot,
  Player1StateSnapshot,
  TeamGuessingSessionState,
  FaceOffSessionState,
} from '../src/types';
import * as socketHook from '../src/hooks/useSocket';
import * as sessionStorageModule from '../src/utils/sessionStorage';
import * as ttsModule from '../src/utils/tts';

describe('US-21 Step 3: Authoritative Pause / Resume, Spacebar Shortcut & Input Lockout', () => {
  const mockFastMoneyRoom: Room = {
    id: 'room-pause-fm',
    roomCode: 'FEUD-PAUS',
    roomName: 'Pause Fast Money Show',
    language: 'EN',
    gameMode: 'FAST_MONEY',
    status: 'IN_PROGRESS',
    createdAt: new Date().toISOString(),
  };

  const mockMainGameRoom: Room = {
    id: 'room-pause-mg',
    roomCode: 'FEUD-PAUS',
    roomName: 'Pause Main Game Show',
    language: 'EN',
    gameMode: 'MAIN_GAME',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const mockLobbyRoom: Room = {
    id: 'room-pause-lobby',
    roomCode: 'FEUD-PAUS',
    roomName: 'Pause Lobby Show',
    language: 'EN',
    gameMode: 'MAIN_GAME',
    status: 'LOBBY',
    createdAt: new Date().toISOString(),
  };

  const mockFastMoneyHostSnapshot: HostStateSnapshot = {
    phase: 'P1_PLAYING',
    activeQuestionNumber: 2,
    totalQuestions: 5,
    answeredCount: 1,
    remainingSeconds: 50,
    isTimerRunning: true,
    currentQuestionText: 'Name something people bring to the beach',
    slots: [
      { slotNumber: 1, isFilled: true },
      { slotNumber: 2, isFilled: false },
      { slotNumber: 3, isFilled: false },
      { slotNumber: 4, isFilled: false },
      { slotNumber: 5, isFilled: false },
    ],
  };

  const mockFastMoneyP1Snapshot: Player1StateSnapshot = {
    phase: 'P1_PLAYING',
    currentQuestion: {
      id: 'q-beach',
      questionText: 'Name something people bring to the beach',
      questionNumber: 2,
      totalQuestions: 5,
    },
    answeredCount: 1,
    passedCount: 0,
    totalQuestions: 5,
    remainingSeconds: 50,
    isTimerRunning: true,
    canSubmit: true,
    canPass: true,
  };

  const mockTeamGuessingSnapshot: TeamGuessingSessionState = {
    roomCode: 'FEUD-PAUS',
    gameId: 'game-mg-1',
    roundNumber: 1,
    language: 'EN',
    phase: 'TEAM_GUESSING',
    controllingTeam: 'TEAM_1',
    controllingTeamName: 'Team 1',
    opposingTeam: 'TEAM_2',
    opposingTeamName: 'Team 2',
    activePlayer: { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
    activePlayerIndex: 0,
    controllingTeamPlayers: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
    opposingTeamPlayers: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
    stealSpokesperson: { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
    stealSpokespersonId: 'p2',
    strikes: 1,
    roundBank: 40,
    revealedAnswers: [
      { id: 'a1', answerText: 'Towel', points: 40, rankOrder: 1 },
    ],
    totalAnswersCount: 4,
    revealedAnswersCount: 1,
    remainingAnswersCount: 3,
    remainingSeconds: 14,
    endsAt: Date.now() + 14000,
    isTimerRunning: true,
    question: {
      id: 'q-mg-1',
      questionText: 'Name something people bring to the beach',
      answerCount: 4,
    },
  };

  const mockFaceOffSnapshot: FaceOffSessionState = {
    roomCode: 'FEUD-PAUS',
    gameId: 'game-fo-1',
    roundNumber: 1,
    language: 'EN',
    phase: 'ANSWERING',
    question: {
      id: 'q-fo-1',
      questionText: 'Name a popular breakfast food',
      answers: [
        { id: 'a1', answerText: 'Eggs', points: 45, rankOrder: 1 },
        { id: 'a2', answerText: 'Bacon', points: 35, rankOrder: 2 },
      ],
    },
    team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
    team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
    team1Contender: { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1, isReady: true },
    team2Contender: { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1, isReady: true },
    buzzerLocked: true,
    buzzedPlayerId: 'p1',
    buzzedPlayerNickname: 'Alice',
    buzzedPlayerTeam: 'TEAM_1',
    buzzedAtTimestamp: Date.now(),
    activeRespondentId: 'p1',
    attemptedPlayerIds: [],
    initialBuzzerWinnerId: 'p1',
    timerDurationSeconds: 15,
    remainingSeconds: 12,
    endsAt: Date.now() + 12000,
    isTimerRunning: true,
  };

  const defaultSocketMock = {
    playerSession: null,
    hostSecret: 'mock-host-secret',
    reconnectHost: vi.fn(),
    reconnectSession: vi.fn(),
    socket: null,
    isConnected: true,
    socketId: 'socket-1',
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

  const renderWithProviders = (ui: React.ReactElement, initialPath = '/host/FEUD-PAUS') => {
    return render(
      <LanguageProvider>
        <RouterProvider initialPath={initialPath}>{ui}</RouterProvider>
      </LanguageProvider>
    );
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Host display renders Pause Timer button on active game boards and triggers pauseGame on click', () => {
    const mockPauseGame = vi.fn();
    const cancelSpeechSpy = vi.spyOn(ttsModule, 'cancelSpeech').mockImplementation(() => {});

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      fastMoneyHostState: mockFastMoneyHostSnapshot,
      timerTick: { secondsRemaining: 44, endsAt: Date.now() + 44000 },
      pauseGame: mockPauseGame,
    } as any);

    renderWithProviders(<HostBoard roomCode="FEUD-PAUS" initialRoom={mockFastMoneyRoom} />);

    expect(screen.getByTestId('host-admin-controls')).toBeInTheDocument();
    const pauseBtn = screen.getByTestId('host-pause-resume-btn');
    expect(pauseBtn).toHaveTextContent('Pause Timer');
    expect(pauseBtn).toHaveTextContent('Spacebar');
    expect(screen.queryByTestId('host-game-paused-banner')).not.toBeInTheDocument();

    fireEvent.click(pauseBtn);

    expect(cancelSpeechSpy).toHaveBeenCalled();
    expect(mockPauseGame).toHaveBeenCalledTimes(1);
  });

  it('2. Host display shows bold "GAME PAUSED" banner with frozen clock and triggers resumeGame when clicked', () => {
    const mockResumeGame = vi.fn();

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      fastMoneyHostState: mockFastMoneyHostSnapshot,
      timerTick: { secondsRemaining: 30, endsAt: Date.now() + 30000 }, // stale tick overridden by paused remainingTime
      gamePaused: { roomCode: 'FEUD-PAUS', remainingTime: 44, pausedByHost: true },
      resumeGame: mockResumeGame,
    } as any);

    renderWithProviders(<HostBoard roomCode="FEUD-PAUS" initialRoom={mockFastMoneyRoom} />);

    const banner = screen.getByTestId('host-game-paused-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('GAME PAUSED');
    expect(screen.getByTestId('host-paused-remaining-time')).toHaveTextContent('44s');
    expect(screen.getByTestId('fast-money-host-timer')).toHaveTextContent('44s');

    const bannerResumeBtn = screen.getByTestId('host-banner-resume-btn');
    fireEvent.click(bannerResumeBtn);

    expect(mockResumeGame).toHaveBeenCalledTimes(1);
  });

  it('3. Host Spacebar keyboard shortcut toggles pauseGame and resumeGame during active gameplay', () => {
    const mockPauseGame = vi.fn();
    const mockResumeGame = vi.fn();

    const useSocketSpy = vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      teamGuessingState: mockTeamGuessingSnapshot,
      pauseGame: mockPauseGame,
      resumeGame: mockResumeGame,
    } as any);

    const { rerender } = renderWithProviders(
      <HostBoard roomCode="FEUD-PAUS" initialRoom={mockMainGameRoom} />
    );

    // Press Spacebar -> pauses game
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(mockPauseGame).toHaveBeenCalledTimes(1);
    expect(mockResumeGame).not.toHaveBeenCalled();

    // Update state to paused and re-render
    useSocketSpy.mockReturnValue({
      ...defaultSocketMock,
      teamGuessingState: mockTeamGuessingSnapshot,
      gamePaused: { roomCode: 'FEUD-PAUS', remainingTime: 11, pausedByHost: true },
      pauseGame: mockPauseGame,
      resumeGame: mockResumeGame,
    } as any);

    rerender(
      <LanguageProvider>
        <RouterProvider initialPath="/host/FEUD-PAUS">
          <HostBoard roomCode="FEUD-PAUS" initialRoom={mockMainGameRoom} />
        </RouterProvider>
      </LanguageProvider>
    );

    // Press Spacebar while paused -> resumes game
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(mockResumeGame).toHaveBeenCalledTimes(1);
  });

  it('4. Spacebar shortcut ignores keystrokes inside <input>/<textarea> and ignores LOBBY stage', () => {
    const mockPauseGame = vi.fn();

    // Case A: Lobby stage (not active game)
    const useSocketSpy = vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      pauseGame: mockPauseGame,
    } as any);

    const { unmount } = renderWithProviders(
      <HostBoard roomCode="FEUD-PAUS" initialRoom={mockLobbyRoom} />
    );

    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(mockPauseGame).not.toHaveBeenCalled();
    unmount();

    // Case B: Active game stage, but keydown originates inside an <input> element
    useSocketSpy.mockReturnValue({
      ...defaultSocketMock,
      faceOffState: mockFaceOffSnapshot,
      pauseGame: mockPauseGame,
    } as any);

    const { container } = renderWithProviders(
      <div>
        <input data-testid="dummy-host-input" type="text" />
        <HostBoard roomCode="FEUD-PAUS" initialRoom={mockMainGameRoom} />
      </div>
    );

    const dummyInput = container.querySelector('[data-testid="dummy-host-input"]') as HTMLInputElement;
    fireEvent.keyDown(dummyInput, { code: 'Space', key: ' ', bubbles: true });
    expect(mockPauseGame).not.toHaveBeenCalled();
  });

  it('5. Fast Money Player controller shows "GAME PAUSED" banner, freezes 60s countdown, disables inputs, and re-enables on resume', () => {
    const mockSubmit = vi.fn();
    const mockPass = vi.fn();

    sessionStorageModule.savePlayerSession({
      roomCode: 'FEUD-PAUS',
      playerId: 'p1',
      sessionToken: 'tok-p1',
      nickname: 'Alice',
    });

    const mockRoomState: RoomStateUpdate = {
      roomCode: 'FEUD-PAUS',
      roomName: 'Pause Fast Money Show',
      language: 'EN',
      gameMode: 'FAST_MONEY',
      status: 'IN_PROGRESS',
      playerCount: 2,
      maxPlayers: 2,
      canStart: false,
      players: [
        { id: 'p1', nickname: 'Alice', team: 'NONE', isReady: true, isConnected: true },
        { id: 'p2', nickname: 'Bob', team: 'NONE', isReady: true, isConnected: true },
      ],
    };

    const useSocketSpy = vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: mockRoomState,
      fastMoneyP1State: mockFastMoneyP1Snapshot,
      timerTick: { secondsRemaining: 39, endsAt: 0 },
      gamePaused: { roomCode: 'FEUD-PAUS', remainingTime: 47, pausedByHost: true },
      submitFastMoneyAnswer: mockSubmit,
      passFastMoneyQuestion: mockPass,
    } as any);

    const { rerender } = renderWithProviders(
      <PlayerJoin roomCode="FEUD-PAUS" initialRoom={mockFastMoneyRoom} />,
      '/play/FEUD-PAUS'
    );

    // Banner & frozen clock
    expect(screen.getByTestId('player-game-paused-banner')).toHaveTextContent('GAME PAUSED');
    expect(screen.getByTestId('player-paused-remaining-time')).toHaveTextContent('47s');
    expect(screen.getByTestId('fast-money-timer')).toHaveTextContent('47');

    // Inputs disabled while paused
    const input = screen.getByTestId('fast-money-input') as HTMLInputElement;
    const passBtn = screen.getByTestId('fast-money-pass-btn') as HTMLButtonElement;
    const submitBtn = screen.getByTestId('fast-money-submit-btn') as HTMLButtonElement;

    expect(input).toBeDisabled();
    expect(passBtn).toBeDisabled();
    expect(submitBtn).toBeDisabled();

    fireEvent.click(passBtn);
    fireEvent.submit(input.closest('form')!);
    expect(mockPass).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();

    // Host clicks Resume -> gamePaused becomes null, countdown resumes from 47
    useSocketSpy.mockReturnValue({
      ...defaultSocketMock,
      roomState: mockRoomState,
      fastMoneyP1State: mockFastMoneyP1Snapshot,
      timerTick: { secondsRemaining: 47, endsAt: Date.now() + 47000 },
      gamePaused: null,
      submitFastMoneyAnswer: mockSubmit,
      passFastMoneyQuestion: mockPass,
    } as any);

    rerender(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-PAUS">
          <PlayerJoin roomCode="FEUD-PAUS" initialRoom={mockFastMoneyRoom} />
        </RouterProvider>
      </LanguageProvider>
    );

    expect(screen.queryByTestId('player-game-paused-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('fast-money-timer')).toHaveTextContent('47');
    expect(screen.getByTestId('fast-money-input')).not.toBeDisabled();
    expect(screen.getByTestId('fast-money-pass-btn')).not.toBeDisabled();

    fireEvent.change(screen.getByTestId('fast-money-input'), { target: { value: 'Sunscreen' } });
    fireEvent.click(screen.getByTestId('fast-money-submit-btn'));
    expect(mockSubmit).toHaveBeenCalledWith('FEUD-PAUS', 'p1', 'q-beach', 'Sunscreen');
  });

  it('6. Main Game Team Guessing & Steal Phase controllers freeze 15s countdown and lock inputs while paused', () => {
    const mockSubmitTeamGuess = vi.fn();
    const mockPassTurn = vi.fn();
    const mockSubmitSteal = vi.fn();

    sessionStorageModule.savePlayerSession({
      roomCode: 'FEUD-PAUS',
      playerId: 'p1',
      sessionToken: 'tok-p1',
      nickname: 'Alice',
    });

    const mockRoomState: RoomStateUpdate = {
      roomCode: 'FEUD-PAUS',
      roomName: 'Pause Main Game Show',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'ACTIVE',
      playerCount: 2,
      maxPlayers: 10,
      canStart: false,
      players: [
        { id: 'p1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
        { id: 'p2', nickname: 'Bob', team: 'TEAM_2', isReady: true, isConnected: true },
      ],
    };

    const useSocketSpy = vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: mockRoomState,
      teamGuessingState: mockTeamGuessingSnapshot,
      gamePaused: { roomCode: 'FEUD-PAUS', remainingTime: 11, pausedByHost: true },
      submitTeamGuess: mockSubmitTeamGuess,
      passTeamTurn: mockPassTurn,
      submitStealGuess: mockSubmitSteal,
    } as any);

    const { unmount } = renderWithProviders(
      <PlayerJoin roomCode="FEUD-PAUS" initialRoom={mockMainGameRoom} />,
      '/play/FEUD-PAUS'
    );

    expect(screen.getByTestId('player-game-paused-banner')).toHaveTextContent('GAME PAUSED');
    expect(screen.getByTestId('player-turn-timer')).toHaveTextContent('11s');
    expect(screen.getByTestId('player-guess-input')).toBeDisabled();
    expect(screen.getByTestId('player-submit-guess-btn')).toBeDisabled();
    expect(screen.getByTestId('player-pass-turn-btn')).toBeDisabled();

    fireEvent.click(screen.getByTestId('player-pass-turn-btn'));
    expect(mockPassTurn).not.toHaveBeenCalled();
    unmount();

    // Verify Steal Phase spokesperson lockout as Bob
    sessionStorage.clear();
    sessionStorageModule.savePlayerSession({
      roomCode: 'FEUD-PAUS',
      playerId: 'p2',
      sessionToken: 'tok-p2',
      nickname: 'Bob',
    });

    useSocketSpy.mockReturnValue({
      ...defaultSocketMock,
      roomState: mockRoomState,
      teamGuessingState: {
        ...mockTeamGuessingSnapshot,
        phase: 'STEAL_PHASE',
        strikes: 3,
      },
      gamePaused: { roomCode: 'FEUD-PAUS', remainingTime: 8, pausedByHost: true },
      submitStealGuess: mockSubmitSteal,
    } as any);

    renderWithProviders(
      <PlayerJoin roomCode="FEUD-PAUS" initialRoom={mockMainGameRoom} />,
      '/play/FEUD-PAUS'
    );

    expect(screen.getByTestId('player-game-paused-banner')).toHaveTextContent('GAME PAUSED');
    expect(screen.getByTestId('player-turn-timer')).toHaveTextContent('8s');
    expect(screen.getByTestId('spokesperson-steal-input')).toBeDisabled();
    expect(screen.getByTestId('spokesperson-submit-steal-btn')).toBeDisabled();
  });

  it('7. Main Game Face-Off controller locks out buzzer and answer submission while paused', () => {
    const mockBuzz = vi.fn();
    const mockSubmitFaceOff = vi.fn();

    sessionStorageModule.savePlayerSession({
      roomCode: 'FEUD-PAUS',
      playerId: 'p1',
      sessionToken: 'tok-p1',
      nickname: 'Alice',
    });

    const mockRoomState: RoomStateUpdate = {
      roomCode: 'FEUD-PAUS',
      roomName: 'Pause Main Game Show',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'ACTIVE',
      playerCount: 2,
      maxPlayers: 10,
      canStart: false,
      players: [
        { id: 'p1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
        { id: 'p2', nickname: 'Bob', team: 'TEAM_2', isReady: true, isConnected: true },
      ],
    };

    // Case A: Buzzer active while paused
    const useSocketSpy = vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: mockRoomState,
      faceOffState: {
        ...mockFaceOffSnapshot,
        phase: 'BUZZER_ACTIVE',
        buzzerLocked: false,
        buzzedPlayerId: null,
        activeRespondentId: null,
      },
      gamePaused: { roomCode: 'FEUD-PAUS', remainingTime: 0, pausedByHost: true },
      pressBuzzer: mockBuzz,
    } as any);

    const { rerender } = renderWithProviders(
      <PlayerJoin roomCode="FEUD-PAUS" initialRoom={mockMainGameRoom} />,
      '/play/FEUD-PAUS'
    );

    expect(screen.getByTestId('player-game-paused-banner')).toBeInTheDocument();
    const buzzerBtn = screen.getByTestId('face-off-buzzer-btn');
    expect(buzzerBtn).toBeDisabled();
    fireEvent.click(buzzerBtn);
    expect(mockBuzz).not.toHaveBeenCalled();

    // Case B: 15s Answering phase while paused
    useSocketSpy.mockReturnValue({
      ...defaultSocketMock,
      roomState: mockRoomState,
      faceOffState: mockFaceOffSnapshot,
      gamePaused: { roomCode: 'FEUD-PAUS', remainingTime: 9, pausedByHost: true },
      submitFaceOffGuess: mockSubmitFaceOff,
    } as any);

    rerender(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-PAUS">
          <PlayerJoin roomCode="FEUD-PAUS" initialRoom={mockMainGameRoom} />
        </RouterProvider>
      </LanguageProvider>
    );

    expect(screen.getByTestId('controller-seconds-remaining')).toHaveTextContent('9');
    expect(screen.getByTestId('face-off-answer-input')).toBeDisabled();
    expect(screen.getByTestId('face-off-submit-btn')).toBeDisabled();
  });
});

