import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HostBoard } from '../src/pages/HostBoard';
import { MainGameTeamController } from '../src/components/MainGameTeamController';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import * as socketHook from '../src/hooks/useSocket';
import {
  Room,
  TeamGuessingSessionState,
  HostOverrideAnswerOption,
  AnswerOverridePayload,
} from '../src/types';

describe('US-21 Step 4: Judge Manual Answer Override & Strike Retraction (Scenario 2)', () => {
  const mockMainGameRoom: Room = {
    id: 'room-ovr-1',
    roomCode: 'FEUD-OVR1',
    roomName: 'Family Game Night',
    language: 'EN',
    gameMode: 'MAIN_GAME',
    status: 'ACTIVE',
    players: [
      {
        id: 'p1',
        roomId: 'room-ovr-1',
        nickname: 'Alice',
        team: 'TEAM_1',
        socketId: 'sock-1',
        isReady: true,
        isConnected: true,
        totalScore: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'p2',
        roomId: 'room-ovr-1',
        nickname: 'Bob',
        team: 'TEAM_2',
        socketId: 'sock-2',
        isReady: true,
        isConnected: true,
        totalScore: 0,
        createdAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
  };

  const mockOverrideOptions: HostOverrideAnswerOption[] = [
    { id: 'a1', rankOrder: 1, answerText: 'Car', points: 45, isRevealed: false },
    { id: 'a2', rankOrder: 2, answerText: 'Bus', points: 25, isRevealed: true },
    { id: 'a3', rankOrder: 3, answerText: 'Train', points: 20, isRevealed: false },
    { id: 'a4', rankOrder: 4, answerText: 'Bicycle', points: 10, isRevealed: false },
  ];

  const mockInitialSnapshotWithStrike: TeamGuessingSessionState = {
    roomCode: 'FEUD-OVR1',
    gameId: 'game-ovr-1',
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
    strikes: 1, // Strike issued after Player 1 submitted "Automobile"
    roundBank: 25,
    revealedAnswers: [
      { id: 'a2', answerText: 'Bus', points: 25, rankOrder: 2 },
    ],
    totalAnswersCount: 4,
    revealedAnswersCount: 1,
    remainingAnswersCount: 3,
    remainingSeconds: 14,
    endsAt: Date.now() + 14000,
    isTimerRunning: true,
    question: {
      id: 'q-commute',
      questionText: 'Name a way people commute to work',
      answerCount: 4,
    },
  };

  const defaultSocketMock: ReturnType<typeof socketHook.useSocket> = {
    socket: null,
    isConnected: true,
    socketId: 'host-sock-ovr',
    playerSession: null,
    hostSecret: 'secret-ovr',
    reconnectHost: vi.fn(),
    reconnectSession: vi.fn(),
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

  const renderWithProviders = (ui: React.ReactElement, initialPath = '/host/FEUD-OVR1') => {
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

  it('1. Scenario 2: Host clicks "Manual Override" and selects Card slot #1 ("Car") -> emits overrideAnswer and closes panel', () => {
    const overrideAnswerSpy = vi.fn();
    const requestOverrideOptionsSpy = vi.fn();

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      teamGuessingState: mockInitialSnapshotWithStrike,
      hostOverrideOptions: mockOverrideOptions,
      overrideAnswer: overrideAnswerSpy,
      requestOverrideOptions: requestOverrideOptionsSpy,
    });

    renderWithProviders(<HostBoard roomCode="FEUD-OVR1" initialRoom={mockMainGameRoom} />);

    // Verify strike #1 is initially active
    expect(screen.getByTestId('strike-box-1')).toHaveTextContent('X');
    expect(screen.getByTestId('round-bank-display')).toHaveTextContent('25');

    // Manual override panel is initially closed (unrevealed answers hidden from TV viewers)
    expect(screen.queryByTestId('host-manual-override-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('host-override-slot-btn-1')).not.toBeInTheDocument();

    // Host clicks "Manual Override"
    const overrideToggle = screen.getByTestId('host-manual-override-toggle');
    expect(overrideToggle).toHaveTextContent(/Manual Override/i);
    fireEvent.click(overrideToggle);

    expect(requestOverrideOptionsSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('host-manual-override-panel')).toBeInTheDocument();

    // Unrevealed slot #1 displays "Car" (45 PTS) and an "Override & Accept" button
    expect(screen.getByTestId('host-override-slot-label-1')).toHaveTextContent('"Car"');
    expect(screen.getByTestId('host-override-slot-label-1')).toHaveTextContent('45 PTS');
    expect(screen.getByTestId('host-override-slot-btn-1')).toHaveTextContent(/Override & Accept/i);

    // Already revealed slot #2 ("Bus") does NOT render an Override & Accept button
    expect(screen.queryByTestId('host-override-slot-btn-2')).not.toBeInTheDocument();

    // Host selects Card slot #1 ("Car")
    fireEvent.click(screen.getByTestId('host-override-slot-btn-1'));

    expect(overrideAnswerSpy).toHaveBeenCalledWith(1, 45, 'TEAM_1');
    // Override panel closes automatically after accepting slot
    expect(screen.queryByTestId('host-manual-override-panel')).not.toBeInTheDocument();
  });

  it('2. Allows Host to switch credited team before clicking "Override & Accept"', () => {
    const overrideAnswerSpy = vi.fn();

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      teamGuessingState: mockInitialSnapshotWithStrike,
      hostOverrideOptions: mockOverrideOptions,
      overrideAnswer: overrideAnswerSpy,
    });

    renderWithProviders(<HostBoard roomCode="FEUD-OVR1" initialRoom={mockMainGameRoom} />);

    fireEvent.click(screen.getByTestId('host-manual-override-toggle'));
    fireEvent.click(screen.getByTestId('host-override-team-2'));
    fireEvent.click(screen.getByTestId('host-override-slot-btn-3'));

    expect(overrideAnswerSpy).toHaveBeenCalledWith(3, 20, 'TEAM_2');
  });

  it('3. Flips Card #1 ("Car"), awards +45 points to Round Bank, cancels strike, dismisses strike overlay, and displays confirmation toast', () => {
    const mockStateRef = {
      ...defaultSocketMock,
      teamGuessingState: mockInitialSnapshotWithStrike,
      hostOverrideOptions: mockOverrideOptions,
      strikeIssued: {
        roomCode: 'FEUD-OVR1',
        team: 'TEAM_1' as const,
        strikeCount: 1,
        maxStrikes: 3,
        rawAnswer: 'Automobile',
      },
      answerOverrideAck: null as AnswerOverridePayload | null,
    };

    const useSocketSpy = vi.spyOn(socketHook, 'useSocket').mockImplementation(() => mockStateRef);

    const { rerender } = renderWithProviders(
      <HostBoard roomCode="FEUD-OVR1" initialRoom={mockMainGameRoom} />
    );

    // Initially Giant Strike Overlay is visible and Strike 1 is 'X'
    expect(screen.getByTestId('giant-strike-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('strike-box-1')).toHaveTextContent('X');

    // Simulate server accepting override: Card #1 ("Car", 45 pts) revealed, strike retracted to 0, bank = 70
    mockStateRef.teamGuessingState = {
      ...mockInitialSnapshotWithStrike,
      strikes: 0,
      roundBank: 70,
      revealedAnswers: [
        { id: 'a1', answerText: 'Car', points: 45, rankOrder: 1, revealedByNickname: 'Host Override' },
        { id: 'a2', answerText: 'Bus', points: 25, rankOrder: 2 },
      ],
      revealedAnswersCount: 2,
      remainingAnswersCount: 2,
    };
    mockStateRef.strikeIssued = null as any;
    mockStateRef.answerOverrideAck = {
      roomCode: 'FEUD-OVR1',
      rankOrder: 1,
      answerText: 'Car',
      pointsAwarded: 45,
      strikeCount: 0,
      roundBank: 70,
      controllingTeam: 'TEAM_1',
      isBoardCleared: false,
    };
    useSocketSpy.mockImplementation(() => ({ ...mockStateRef }));

    rerender(
      <LanguageProvider>
        <RouterProvider initialPath="/host/FEUD-OVR1">
          <HostBoard roomCode="FEUD-OVR1" initialRoom={mockMainGameRoom} />
        </RouterProvider>
      </LanguageProvider>
    );

    // Card #1 flipped open with "Car" and 45 pts
    expect(screen.getByTestId('team-board-card-1')).toHaveTextContent('Car');
    expect(screen.getByTestId('team-board-card-1')).toHaveTextContent('45');

    // Round Bank updated to 70 (25 + 45)
    expect(screen.getByTestId('round-bank-display')).toHaveTextContent('70');

    // Strike #1 retracted back to '1' and giant strike overlay dismissed
    expect(screen.getByTestId('strike-box-1')).toHaveTextContent('1');
    expect(screen.queryByTestId('giant-strike-overlay')).not.toBeInTheDocument();

    // Judge Override confirmation toast shown
    expect(screen.getByTestId('host-override-toast')).toHaveTextContent(
      /Card #1 \("Car"\) accepted \(\+45 pts\)/i
    );
  });

  it('4. Retracting 3rd strike during STEAL_PHASE seamlessly reverts Host Board back to TEAM_GUESSING', () => {
    const stealSnapshot: TeamGuessingSessionState = {
      ...mockInitialSnapshotWithStrike,
      phase: 'STEAL_PHASE',
      strikes: 3,
      activePlayer: null,
    };

    const mockStateRef = {
      ...defaultSocketMock,
      teamGuessingState: stealSnapshot,
      hostOverrideOptions: mockOverrideOptions,
    };

    const useSocketSpy = vi.spyOn(socketHook, 'useSocket').mockImplementation(() => mockStateRef);

    const { rerender } = renderWithProviders(
      <HostBoard roomCode="FEUD-OVR1" initialRoom={mockMainGameRoom} />
    );

    expect(screen.getByTestId('steal-phase-banner')).toBeInTheDocument();
    expect(screen.getByTestId('strike-box-3')).toHaveTextContent('X');
    expect(screen.getByTestId('host-manual-override-toggle')).toBeInTheDocument();

    // Server retracts 3rd strike -> back to 2 strikes and TEAM_GUESSING
    mockStateRef.teamGuessingState = {
      ...mockInitialSnapshotWithStrike,
      phase: 'TEAM_GUESSING',
      strikes: 2,
      roundBank: 70,
      revealedAnswers: [
        { id: 'a1', answerText: 'Car', points: 45, rankOrder: 1 },
        { id: 'a2', answerText: 'Bus', points: 25, rankOrder: 2 },
      ],
    };
    useSocketSpy.mockImplementation(() => ({ ...mockStateRef }));

    rerender(
      <LanguageProvider>
        <RouterProvider initialPath="/host/FEUD-OVR1">
          <HostBoard roomCode="FEUD-OVR1" initialRoom={mockMainGameRoom} />
        </RouterProvider>
      </LanguageProvider>
    );

    expect(screen.queryByTestId('steal-phase-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('strike-box-1')).toHaveTextContent('X');
    expect(screen.getByTestId('strike-box-2')).toHaveTextContent('X');
    expect(screen.getByTestId('strike-box-3')).toHaveTextContent('3');
  });

  it('5. Synchronizes Player Mobile Controller (flips Card #1, credits bank, retracts strike, dismisses strike alert, hides admin UI)', () => {
    const { rerender } = render(
      <LanguageProvider>
        <MainGameTeamController
          snapshot={mockInitialSnapshotWithStrike}
          strikeIssued={{
            roomCode: 'FEUD-OVR1',
            team: 'TEAM_1',
            strikeCount: 1,
            maxStrikes: 3,
            rawAnswer: 'Automobile',
          }}
          currentNickname="Alice"
          currentPlayerId="p1"
          roomCode="FEUD-OVR1"
          roomName="Family Game Night"
        />
      </LanguageProvider>
    );

    // Player never sees Host Manual Override controls or unrevealed answer text
    expect(screen.queryByTestId('host-manual-override-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('host-override-slot-btn-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-card-slot-1')).not.toHaveTextContent('Car');

    // Strike 1 & mobile strike alert initially shown
    expect(screen.getByTestId('player-strike-box-1')).toHaveTextContent('X');
    expect(screen.getByTestId('mobile-strike-alert')).toBeInTheDocument();

    // Rerender after Host Override reveals Card #1 ("Car", 45 pts) and retracts strike to 0
    const updatedSnapshot: TeamGuessingSessionState = {
      ...mockInitialSnapshotWithStrike,
      strikes: 0,
      roundBank: 70,
      revealedAnswers: [
        { id: 'a1', answerText: 'Car', points: 45, rankOrder: 1 },
        { id: 'a2', answerText: 'Bus', points: 25, rankOrder: 2 },
      ],
    };

    rerender(
      <LanguageProvider>
        <MainGameTeamController
          snapshot={updatedSnapshot}
          strikeIssued={null}
          currentNickname="Alice"
          currentPlayerId="p1"
          roomCode="FEUD-OVR1"
          roomName="Family Game Night"
        />
      </LanguageProvider>
    );

    expect(screen.getByTestId('player-card-slot-1')).toHaveTextContent('Car');
    expect(screen.getByTestId('player-card-slot-1')).toHaveTextContent('45');
    expect(screen.getByTestId('player-round-bank')).toHaveTextContent('70');
    expect(screen.getByTestId('player-strike-box-1')).toHaveTextContent('1');
    expect(screen.queryByTestId('mobile-strike-alert')).not.toBeInTheDocument();
  });
});

