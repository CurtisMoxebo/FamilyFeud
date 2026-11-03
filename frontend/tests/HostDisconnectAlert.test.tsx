import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { HostBoard } from '../src/pages/HostBoard';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import {
  Room,
  PlayerLeftAlertPayload,
  FaceOffSessionState,
  TeamGuessingSessionState,
  HostStateSnapshot,
} from '../src/types';
import * as socketHook from '../src/hooks/useSocket';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('US-20 Step 4: Host Disconnect Alert Suite (Scenario 4)', () => {
  const baseRoom: Room = {
    id: 'room-alert-1',
    roomCode: 'FEUD-ALT1',
    roomName: 'Alert Test Room',
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
  };

  const renderWithProviders = (ui: React.ReactElement, initialPath = '/host/FEUD-ALT1') => {
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
    vi.useRealTimers();
  });

  it('1. Renders alert banner on Host display when player_left_alert is passed or emitted', () => {
    const alertPayload: PlayerLeftAlertPayload = {
      roomCode: 'FEUD-ALT1',
      playerId: 'p1',
      nickname: 'Bob',
      message: 'Bob has left the game',
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      playerLeftAlert: alertPayload,
    } as any);

    renderWithProviders(<HostBoard roomCode="FEUD-ALT1" initialRoom={baseRoom} />);

    const alertBanner = screen.getByTestId('host-player-left-alert');
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveTextContent('Bob has left the game');
  });

  it('2. Renders alert banner across Lobby view', () => {
    const lobbyRoom: Room = {
      ...baseRoom,
      status: 'LOBBY',
      players: [{ id: 'p2', roomId: 'r1', nickname: 'Alice', isConnected: true, isReady: true, team: 'NONE', socketId: 's1', totalScore: 0, createdAt: '' }],
    };

    const alertPayload: PlayerLeftAlertPayload = {
      roomCode: 'FEUD-ALT1',
      playerId: 'p2',
      nickname: 'Alice',
      message: 'Alice has left the game',
    };

    renderWithProviders(
      <HostBoard
        roomCode="FEUD-ALT1"
        initialRoom={lobbyRoom}
        initialPlayerLeftAlert={alertPayload}
      />
    );

    const alertBanner = screen.getByTestId('host-player-left-alert');
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveTextContent('Alice has left the game');
  });

  it('3. Renders alert banner across Main Game Face-Off view', () => {
    const mockFaceOffState: FaceOffSessionState = {
      roomCode: 'FEUD-ALT1',
      gameId: 'g1',
      roundNumber: 1,
      language: 'EN',
      phase: 'BUZZER_ACTIVE',
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
      endsAt: Date.now() + 15000,
      isTimerRunning: false,
      question: { id: 'q1', questionText: 'Face off question?', answers: [], roundNumber: 1, orderIndex: 1 },
    };

    const alertPayload: PlayerLeftAlertPayload = {
      roomCode: 'FEUD-ALT1',
      playerId: 'p1',
      nickname: 'Alice',
      message: 'Alice has left the game',
    };

    renderWithProviders(
      <HostBoard
        roomCode="FEUD-ALT1"
        initialRoom={baseRoom}
        initialFaceOffState={mockFaceOffState}
        initialPlayerLeftAlert={alertPayload}
      />
    );

    const alertBanner = screen.getByTestId('host-player-left-alert');
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveTextContent('Alice has left the game');
  });

  it('4. Renders alert banner across Main Game Team Guessing view', () => {
    const mockTeamGuessingState: TeamGuessingSessionState = {
      roomCode: 'FEUD-ALT1',
      gameId: 'g1',
      roundNumber: 1,
      language: 'EN',
      phase: 'TEAM_GUESSING',
      controllingTeam: 'TEAM_1',
      opposingTeam: 'TEAM_2',
      controllingTeamName: 'Team 1',
      opposingTeamName: 'Team 2',
      controllingTeamPlayers: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
      opposingTeamPlayers: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
      activePlayerIndex: 0,
      activePlayer: { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
      roundBank: 45,
      strikes: 2,
      revealedAnswers: [],
      totalAnswersCount: 4,
      revealedAnswersCount: 0,
      remainingAnswersCount: 4,
      remainingSeconds: 15,
      isTimerRunning: true,
      endsAt: Date.now() + 15000,
      stealSpokesperson: { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
      question: { id: 'q1', questionText: 'Team question?', answerCount: 4 },
    };

    const alertPayload: PlayerLeftAlertPayload = {
      roomCode: 'FEUD-ALT1',
      playerId: 'p1',
      nickname: 'Alice',
      message: 'Alice has left the game',
    };

    renderWithProviders(
      <HostBoard
        roomCode="FEUD-ALT1"
        initialRoom={baseRoom}
        initialTeamGuessingState={mockTeamGuessingState}
        initialPlayerLeftAlert={alertPayload}
      />
    );

    const alertBanner = screen.getByTestId('host-player-left-alert');
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveTextContent('Alice has left the game');
  });

  it('5. Renders alert banner across Fast Money Host view', () => {
    const fastMoneyRoom: Room = {
      ...baseRoom,
      gameMode: 'FAST_MONEY',
    };

    const mockFastMoneyHost: HostStateSnapshot = {
      phase: 'P1_PLAYING',
      p1TotalScore: 40,
      p2TotalScore: 0,
      grandTotal: 40,
      targetScore: 200,
      activeQuestionNumber: 1,
      totalQuestions: 5,
      answeredCount: 1,
      remainingSeconds: 45,
      isTimerRunning: true,
      currentQuestionText: 'Name something in a kitchen',
      slots: [],
    };

    const alertPayload: PlayerLeftAlertPayload = {
      roomCode: 'FEUD-ALT1',
      playerId: 'p1',
      nickname: 'Alice',
      message: 'Alice has left the game',
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      fastMoneyHostState: mockFastMoneyHost,
      playerLeftAlert: alertPayload,
    } as any);

    renderWithProviders(
      <HostBoard
        roomCode="FEUD-ALT1"
        initialRoom={fastMoneyRoom}
      />
    );

    const alertBanner = screen.getByTestId('host-player-left-alert');
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveTextContent('Alice has left the game');
  });

  it('6. Auto-dismisses alert banner after 8-second timer expires', () => {
    vi.useFakeTimers();

    const alertPayload: PlayerLeftAlertPayload = {
      roomCode: 'FEUD-ALT1',
      playerId: 'p1',
      nickname: 'Alice',
      message: 'Alice has left the game',
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
    } as any);

    renderWithProviders(
      <HostBoard
        roomCode="FEUD-ALT1"
        initialRoom={baseRoom}
        initialPlayerLeftAlert={alertPayload}
      />
    );

    expect(screen.getByTestId('host-player-left-alert')).toBeInTheDocument();
    expect(screen.getByTestId('host-player-left-alert')).toHaveTextContent('Alice has left the game');

    // Advance timers by 8000ms
    act(() => {
      vi.advanceTimersByTime(8100);
    });

    expect(screen.queryByTestId('host-player-left-alert')).toBeNull();
  });
});
