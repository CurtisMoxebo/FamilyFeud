import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { PlayerJoin } from '../src/pages/PlayerJoin';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import {
  Room,
  Player1StateSnapshot,
  TeamGuessingSessionState,
} from '../src/types';
import * as socketHook from '../src/hooks/useSocket';
import {
  savePlayerSession,
  getPlayerSession,
} from '../src/utils/sessionStorage';

describe('US-20 Step 3: Player Automatic Reconnection & State Recovery Suite', () => {
  const mockFastMoneyRoom: Room = {
    id: 'room-fm-1',
    roomCode: 'FEUD-8291',
    roomName: 'Fast Money Party',
    language: 'EN',
    gameMode: 'FAST_MONEY',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const mockMainGameRoom: Room = {
    id: 'room-mg-1',
    roomCode: 'FEUD-9999',
    roomName: 'Main Game Family',
    language: 'EN',
    gameMode: 'MAIN_GAME',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const defaultSocketMock = {
    playerSession: null,
    hostSecret: null,
    reconnectHost: vi.fn(),
    reconnectSession: vi.fn(),
    socket: null,
    isConnected: true,
    socketId: 'player-socket-recon',
    roomState: {
      roomCode: 'FEUD-8291',
      roomName: 'Fast Money Party',
      language: 'EN' as const,
      gameMode: 'FAST_MONEY' as const,
      status: 'ACTIVE' as const,
      playerCount: 2,
      maxPlayers: 2,
      canStart: true,
      players: [
        { id: 'player-p1', nickname: 'Alice', team: 'NONE' as const, isReady: true, isConnected: true },
        { id: 'player-p2', nickname: 'Bob', team: 'NONE' as const, isReady: true, isConnected: true },
      ],
    },
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
    promptPassPlay: null,
    roundControlAssigned: null,
    opponentTurnPrompt: null,
    faceOffBoardReveal: null,
    sendFaceOffReady: vi.fn(),
    pressBuzzer: vi.fn(),
    submitFaceOffAnswer: vi.fn(),
    choosePlayPass: vi.fn(),
    submitFaceOffGuess: vi.fn(),
    clearFaceOffState: vi.fn(),
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
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('satisfies Scenario 3: Accidental browser refresh reads session from localStorage and bypasses nickname entry screen', () => {
    // Seed localStorage with existing player credentials
    savePlayerSession({
      roomCode: 'FEUD-8291',
      playerId: 'player-p1',
      sessionToken: 'token-alice-123',
      nickname: 'Alice',
    });

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
    });

    renderWithProviders(
      <PlayerJoin roomCode="FEUD-8291" initialRoom={mockFastMoneyRoom} />
    );

    // Verify nickname form is bypassed
    expect(screen.queryByTestId('player-nickname-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('player-join-submit-btn')).not.toBeInTheDocument();

    // Verify user is in waiting lobby / active room view
    expect(screen.getByTestId('player-waiting-lobby')).toBeInTheDocument();
    expect(screen.getByTestId('player-roster-item-Alice')).toBeInTheDocument();
  });

  it('satisfies Scenario 2: Resumes Fast Money active question and timer upon player reconnection', () => {
    savePlayerSession({
      roomCode: 'FEUD-8291',
      playerId: 'player-p1',
      sessionToken: 'token-alice-123',
      nickname: 'Alice',
    });

    const mockP1Snapshot: Player1StateSnapshot = {
      phase: 'P1_PLAYING',
      currentQuestion: {
        id: 'q1',
        questionText: 'Name something in a refrigerator',
        questionNumber: 1,
        totalQuestions: 5,
      },
      answeredCount: 0,
      passedCount: 0,
      totalQuestions: 5,
      remainingSeconds: 48,
      isTimerRunning: true,
      canSubmit: true,
      canPass: true,
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      fastMoneyP1State: mockP1Snapshot,
    });

    renderWithProviders(
      <PlayerJoin roomCode="FEUD-8291" initialRoom={mockFastMoneyRoom} />
    );

    // Bypasses nickname form
    expect(screen.queryByTestId('player-nickname-input')).not.toBeInTheDocument();

    // Verifies FastMoneyController displays question and remaining timer
    expect(screen.getByText('Name something in a refrigerator')).toBeInTheDocument();
    expect(screen.getByText(/48/i)).toBeInTheDocument();
  });

  it('resumes Main Game Team Guessing view for player upon reconnection', () => {
    savePlayerSession({
      roomCode: 'FEUD-9999',
      playerId: 'player-mg-1',
      sessionToken: 'token-team-1',
      nickname: 'Charlie',
    });

    const mockTeamGuessingState: TeamGuessingSessionState = {
      roomCode: 'FEUD-9999',
      gameId: 'g1',
      roundNumber: 1,
      language: 'EN',
      phase: 'TEAM_GUESSING',
      controllingTeam: 'TEAM_1',
      controllingTeamName: 'Team 1',
      opposingTeam: 'TEAM_2',
      opposingTeamName: 'Team 2',
      activePlayer: { id: 'player-mg-1', nickname: 'Charlie', team: 'TEAM_1', battingOrder: 1 },
      activePlayerIndex: 0,
      controllingTeamPlayers: [
        { id: 'player-mg-1', nickname: 'Charlie', team: 'TEAM_1', battingOrder: 1 },
      ],
      opposingTeamPlayers: [],
      strikes: 1,
      roundBank: 30,
      revealedAnswers: [],
      totalAnswersCount: 4,
      revealedAnswersCount: 0,
      remainingAnswersCount: 4,
      remainingSeconds: 14,
      endsAt: Date.now() + 14000,
      isTimerRunning: true,
      question: {
        id: 'q1',
        questionText: 'Name something you bring on a plane',
        answerCount: 4,
      },
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: {
        ...defaultSocketMock.roomState,
        roomCode: 'FEUD-9999',
        gameMode: 'MAIN_GAME' as const,
        players: [
          { id: 'player-mg-1', nickname: 'Charlie', team: 'TEAM_1' as const, isReady: true, isConnected: true },
        ],
      },
      teamGuessingState: mockTeamGuessingState,
    });

    renderWithProviders(
      <PlayerJoin roomCode="FEUD-9999" initialRoom={mockMainGameRoom} />,
      '/play/FEUD-9999'
    );

    expect(screen.queryByTestId('player-nickname-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('main-game-team-controller')).toBeInTheDocument();
    expect(screen.getByTestId('your-team-badge')).toBeInTheDocument();
    expect(screen.getByTestId('player-round-bank')).toHaveTextContent('30');
  });

  it('gracefully clears stale session and resets to nickname prompt if session reconnection is rejected', async () => {
    savePlayerSession({
      roomCode: 'FEUD-8291',
      playerId: 'player-stale',
      sessionToken: 'invalid-token',
      nickname: 'OldPlayer',
    });

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomError: {
        code: 'INVALID_ROOM',
        message: 'Invalid or expired player session token.',
      },
    });

    renderWithProviders(
      <PlayerJoin roomCode="FEUD-8291" initialRoom={mockFastMoneyRoom} />
    );

    // Stale session should be cleared and nickname prompt restored
    await waitFor(() => {
      expect(screen.getByTestId('player-nickname-input')).toBeInTheDocument();
      expect(getPlayerSession('FEUD-8291')).toBeNull();
    });
  });
});

