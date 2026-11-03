import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { HostBoard } from '../src/pages/HostBoard';
import { PlayerJoin } from '../src/pages/PlayerJoin';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import { Room, RoomStateUpdate } from '../src/types';
import * as socketHook from '../src/hooks/useSocket';
import * as sessionStorageModule from '../src/utils/sessionStorage';

describe('US-21 Step 2: Lobby Kick & Moderation Flow', () => {
  const mockRoom: Room = {
    id: 'room-kick-1',
    roomCode: 'FEUD-KICK',
    roomName: 'Feud Admin Lobby',
    language: 'EN',
    gameMode: 'MAIN_GAME',
    status: 'LOBBY',
    createdAt: new Date().toISOString(),
  };

  const defaultSocketMock = {
    playerSession: null,
    hostSecret: 'mock-host-secret',
    reconnectHost: vi.fn(),
    reconnectSession: vi.fn(),
    socket: null,
    isConnected: true,
    socketId: 'host-socket-1',
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

  const renderWithProviders = (ui: React.ReactElement, initialPath = '/host/FEUD-KICK') => {
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

  it('1. Host lobby renders "Remove" button next to each joined player', () => {
    const mockRoomState: RoomStateUpdate = {
      roomCode: 'FEUD-KICK',
      gameMode: 'MAIN_GAME',
      status: 'LOBBY',
      players: [
        { id: 'player-1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
        { id: 'player-2', nickname: 'Bob', team: 'TEAM_2', isReady: true, isConnected: true },
      ],
      playerCount: 2,
      maxPlayers: 10,
      canStart: true,
      roomName: 'Feud Admin Lobby',
      language: 'EN',
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: mockRoomState,
    } as any);

    renderWithProviders(<HostBoard roomCode="FEUD-KICK" initialRoom={mockRoom} />);

    // Assert that kick buttons exist for both Alice and Bob
    const kickAliceBtn = screen.getByTestId('host-kick-player-btn-Alice');
    const kickBobBtn = screen.getByTestId('host-kick-player-btn-Bob');

    expect(kickAliceBtn).toBeInTheDocument();
    expect(kickBobBtn).toBeInTheDocument();
    expect(kickAliceBtn).toHaveAttribute('title', 'Remove');
  });

  it('2. Clicking "Remove" calls kickPlayer socket action with target player id', () => {
    const mockKickPlayer = vi.fn();
    const mockRoomState: RoomStateUpdate = {
      roomCode: 'FEUD-KICK',
      gameMode: 'MAIN_GAME',
      status: 'LOBBY',
      players: [
        { id: 'player-1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
        { id: 'player-2', nickname: 'Bob', team: 'TEAM_2', isReady: true, isConnected: true },
      ],
      playerCount: 2,
      maxPlayers: 10,
      canStart: true,
      roomName: 'Feud Admin Lobby',
      language: 'EN',
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: mockRoomState,
      kickPlayer: mockKickPlayer,
    } as any);

    renderWithProviders(<HostBoard roomCode="FEUD-KICK" initialRoom={mockRoom} />);

    const kickBobBtn = screen.getByTestId('host-kick-player-btn-Bob');
    fireEvent.click(kickBobBtn);

    expect(mockKickPlayer).toHaveBeenCalledTimes(1);
    expect(mockKickPlayer).toHaveBeenCalledWith('player-2');
  });

  it('3. Player client handles player_kicked event: clears session, resets state, and shows kick notification', async () => {
    const clearSessionSpy = vi.spyOn(sessionStorageModule, 'clearPlayerSession');
    const mockClearKickedInfo = vi.fn();

    // Pre-populate session storage as if player was joined
    sessionStorageModule.savePlayerSession({
      roomCode: 'FEUD-KICK',
      playerId: 'player-2',
      sessionToken: 'token-bob',
      nickname: 'Bob',
    });

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      kickedInfo: {
        roomCode: 'FEUD-KICK',
        playerId: 'player-2',
        reason: 'Host removed you for being inactive.',
      },
      clearKickedInfo: mockClearKickedInfo,
    } as any);

    renderWithProviders(<PlayerJoin roomCode="FEUD-KICK" initialRoom={mockRoom} />, '/play/FEUD-KICK');

    await waitFor(() => {
      expect(screen.getByTestId('player-kicked-screen')).toBeInTheDocument();
    });

    expect(screen.getByTestId('player-kicked-title')).toHaveTextContent('Removed from Game');
    expect(screen.getByTestId('player-kicked-message')).toHaveTextContent(
      'Host removed you for being inactive.'
    );
    expect(clearSessionSpy).toHaveBeenCalledWith('FEUD-KICK');
    expect(mockClearKickedInfo).toHaveBeenCalled();

    // Clicking "Back to Home" navigates and dismisses screen
    const backBtn = screen.getByTestId('player-kicked-back-home');
    fireEvent.click(backBtn);
    expect(screen.queryByTestId('player-kicked-screen')).not.toBeInTheDocument();
  });

  it('4. Player client does not render kick buttons in lobby roster', () => {
    const mockRoomState: RoomStateUpdate = {
      roomCode: 'FEUD-KICK',
      gameMode: 'MAIN_GAME',
      status: 'LOBBY',
      players: [
        { id: 'player-1', nickname: 'Alice', team: 'TEAM_1', isReady: true, isConnected: true },
        { id: 'player-2', nickname: 'Bob', team: 'TEAM_2', isReady: true, isConnected: true },
      ],
      playerCount: 2,
      maxPlayers: 10,
      canStart: true,
      roomName: 'Feud Admin Lobby',
      language: 'EN',
    };

    // Pretend player is joined
    sessionStorageModule.savePlayerSession({
      roomCode: 'FEUD-KICK',
      playerId: 'player-1',
      sessionToken: 'token-alice',
      nickname: 'Alice',
    });

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      ...defaultSocketMock,
      roomState: mockRoomState,
    } as any);

    renderWithProviders(<PlayerJoin roomCode="FEUD-KICK" initialRoom={mockRoom} />, '/play/FEUD-KICK');

    // Alice is joined and sees roster
    expect(screen.getByTestId('player-roster-item-Alice')).toBeInTheDocument();
    expect(screen.getByTestId('player-roster-item-Bob')).toBeInTheDocument();

    // Kick buttons MUST NOT be visible on player controller
    expect(screen.queryByTestId('host-kick-player-btn-Alice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('host-kick-player-btn-Bob')).not.toBeInTheDocument();
  });
});

