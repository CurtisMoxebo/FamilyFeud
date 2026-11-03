import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { HostBoard } from '../src/pages/HostBoard';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import {
  Room,
  RoomStateUpdate,
  TeamGuessingSessionState,
  FaceOffSessionState,
  HostStateSnapshot,
} from '../src/types';
import * as socketHook from '../src/hooks/useSocket';
import { saveHostSecret } from '../src/utils/sessionStorage';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('US-20 Step 2: HostBoard Reconnection & State Recovery Suite', () => {
  const activeMainGameRoom: Room = {
    id: 'room-rec-1',
    roomCode: 'FEUD-REC1',
    roomName: 'Main Game Reconnection Room',
    language: 'EN',
    gameMode: 'MAIN_GAME',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const defaultSocketMock = {
    playerSession: null,
    hostSecret: 'secret-123',
    reconnectHost: vi.fn(),
    reconnectSession: vi.fn(),
    socket: null,
    isConnected: true,
    socketId: 'host-socket-reconnected',
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
    hostOverrideOptions: [],
    answerOverrideAck: null,
    clearAnswerOverrideAck: vi.fn(),
    requestOverrideOptions: vi.fn(),
  };

  const renderWithProviders = (ui: React.ReactElement, initialPath = '/host/FEUD-REC1') => {
    return render(
      <LanguageProvider>
        <RouterProvider initialPath={initialPath}>{ui}</RouterProvider>
      </LanguageProvider>
    );
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('satisfies Scenario 1: Accidental Host Browser Refresh re-hydrates full board, strikes, bank without resetting', () => {
    saveHostSecret('mock-secret-rec1', 'FEUD-REC1');

    const mockTeamGuessingState: TeamGuessingSessionState = {
      roomCode: 'FEUD-REC1',
      gameId: 'game-1',
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
      opposingTeamPlayers: [
        { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
      ],
      strikes: 2,
      roundBank: 65,
      revealedAnswers: [
        { id: 'a1', answerText: 'PIZZA', points: 40, rankOrder: 1 },
        { id: 'a2', answerText: 'BURGER', points: 25, rankOrder: 2 },
      ],
      totalAnswersCount: 4,
      revealedAnswersCount: 2,
      remainingAnswersCount: 2,
      remainingSeconds: 12,
      endsAt: Date.now() + 12000,
      isTimerRunning: true,
      question: {
        id: 'q1',
        questionText: 'Name a popular junk food',
        answerCount: 4,
      },
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      teamGuessingState: mockTeamGuessingState,
    });

    renderWithProviders(
      <HostBoard roomCode="FEUD-REC1" initialRoom={activeMainGameRoom} />
    );

    // Verifies team guessing board is rendered
    expect(screen.getByTestId('main-game-team-guessing-board')).toBeInTheDocument();

    // Verifies the re-hydrated cards and bank
    expect(screen.getByTestId('team-board-card-1')).toHaveTextContent('PIZZA');
    expect(screen.getByTestId('team-board-card-2')).toHaveTextContent('BURGER');
    expect(screen.getByTestId('round-bank-display')).toHaveTextContent('65');
    expect(screen.getByTestId('active-player-display')).toHaveTextContent('Alice');

    // Verifies strikes indicator has 2 strikes active ('X') and 1 unassigned ('3')
    expect(screen.getByTestId('strike-box-1')).toHaveTextContent('X');
    expect(screen.getByTestId('strike-box-2')).toHaveTextContent('X');
    expect(screen.getByTestId('strike-box-3')).toHaveTextContent('3');

    // Verifies it did NOT reset to lobby
    expect(screen.queryByTestId('host-start-game-btn')).not.toBeInTheDocument();
  });

  it('restores Face-Off board screen when host reconnects during Face-Off', () => {
    saveHostSecret('mock-secret-rec2', 'FEUD-REC2');

    const mockFaceOffState: FaceOffSessionState = {
      roomCode: 'FEUD-REC2',
      gameId: 'game-2',
      roundNumber: 1,
      language: 'EN',
      phase: 'BUZZER_ACTIVE',
      question: {
        id: 'q-fo-1',
        questionText: 'Name something you pack in a suitcase',
        answers: [],
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
      controllingTeam: null,
      passOrPlayDecision: null,
      timerDurationSeconds: 15,
      remainingSeconds: 15,
      endsAt: null,
      isTimerRunning: false,
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      faceOffState: mockFaceOffState,
    });

    renderWithProviders(
      <HostBoard roomCode="FEUD-REC2" initialRoom={activeMainGameRoom} />
    );

    expect(screen.getByTestId('main-game-face-off-board')).toBeInTheDocument();
    expect(screen.getByTestId('face-off-question-text')).toHaveTextContent('Name something you pack in a suitcase');
  });

  it('restores Fast Money screen when host reconnects during Fast Money mode', () => {
    saveHostSecret('mock-secret-rec3', 'FEUD-REC3');

    const mockFastMoneySnapshot: HostStateSnapshot = {
      phase: 'P1_PLAYING',
      activeQuestionNumber: 1,
      totalQuestions: 5,
      answeredCount: 0,
      remainingSeconds: 20,
      isTimerRunning: true,
      currentQuestionText: 'Fast Money Q1',
      slots: [],
      totalScore: 75,
      targetScore: 200,
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      fastMoneyHostState: mockFastMoneySnapshot,
    });

    const fastMoneyRoom: Room = {
      ...activeMainGameRoom,
      gameMode: 'FAST_MONEY',
    };

    renderWithProviders(
      <HostBoard roomCode="FEUD-REC3" initialRoom={fastMoneyRoom} />
    );

    expect(screen.getByTestId('fast-money-host-board')).toBeInTheDocument();
    expect(screen.getByTestId('host-phase-badge')).toHaveTextContent('P1_PLAYING');
    expect(screen.getByTestId('fast-money-host-timer')).toBeInTheDocument();
  });

  it('fast-hydrates room state from socket reconnection when REST fetch is pending', async () => {
    saveHostSecret('mock-secret-rec1', 'FEUD-REC1');

    const mockRoomState: RoomStateUpdate = {
      roomCode: 'FEUD-REC1',
      roomName: 'Fast Hydrated Room',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'ACTIVE',
      playerCount: 4,
      maxPlayers: 10,
      canStart: true,
      players: [
        { id: 'p1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
      ],
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: mockRoomState,
    });

    // Render without initialRoom so fetch is triggered
    renderWithProviders(<HostBoard roomCode="FEUD-REC1" />);

    // Fast hydration should clear loader immediately using socket roomState
    await waitFor(() => {
      expect(screen.getByText('Fast Hydrated Room')).toBeInTheDocument();
    });
  });
});
