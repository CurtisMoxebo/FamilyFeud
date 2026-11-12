import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import { PlayerJoin } from '../src/pages/PlayerJoin';
import { MainGameFaceOffController } from '../src/components/MainGameFaceOffController';
import { MainGameTeamController } from '../src/components/MainGameTeamController';
import { FastMoneyController } from '../src/components/FastMoneyController';
import { FastMoneyIsolation } from '../src/components/FastMoneyIsolation';
import * as socketHook from '../src/hooks/useSocket';
import {
  Room,
  FaceOffSessionState,
  TeamGuessingSessionState,
  Player1StateSnapshot,
} from '../src/types';

describe('US-22 Step 3: Mobile Controller Ergonomics, >=48px Touch Targets & Haptic Feedback (Scenarios 2 & 3)', () => {
  const originalVibrateDescriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(navigator),
    'vibrate'
  );
  const originalOwnVibrateDescriptor = Object.getOwnPropertyDescriptor(navigator, 'vibrate');

  let vibrateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();

    vibrateMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as unknown as Record<string, unknown>).vibrate;
    if (originalOwnVibrateDescriptor) {
      Object.defineProperty(navigator, 'vibrate', originalOwnVibrateDescriptor);
    }
    if (originalVibrateDescriptor) {
      Object.defineProperty(
        Object.getPrototypeOf(navigator),
        'vibrate',
        originalVibrateDescriptor
      );
    }
  });

  const renderMobile = (ui: React.ReactElement, initialPath = '/play/FEUD-MOBI') =>
    render(
      <LanguageProvider>
        <RouterProvider initialPath={initialPath}>{ui}</RouterProvider>
      </LanguageProvider>
    );

  const baseFaceOffSnapshot: FaceOffSessionState = {
    roomCode: 'FEUD-MOBI',
    gameId: 'game-mobi-fo',
    roundNumber: 1,
    language: 'EN',
    phase: 'BUZZER_ACTIVE',
    question: {
      id: 'q-mobi-1',
      questionText: 'Name something people keep on their nightstand',
      answers: [
        { id: 'a1', answerText: 'Phone', points: 52, rankOrder: 1 },
        { id: 'a2', answerText: 'Lamp', points: 28, rankOrder: 2 },
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

  const baseTeamSnapshot: TeamGuessingSessionState = {
    roomCode: 'FEUD-MOBI',
    gameId: 'game-mobi-tg',
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
      id: 'q-mobi-1',
      questionText: 'Name something people keep on their nightstand',
      answerCount: 4,
    },
  };

  it('1. Scenario 2: Player mobile controllers prevent horizontal scroll, respect safe-area insets, and expand the Face-Off buzzer into the central thumb zone', () => {
    const mockRoom: Room = {
      id: 'room-mobi',
      roomCode: 'FEUD-MOBI',
      language: 'EN',
      gameMode: 'MAIN_GAME',
      status: 'LOBBY',
      createdAt: new Date().toISOString(),
    };

    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      isConnected: true,
      roomState: null,
      roomError: null,
      joinRoom: vi.fn(),
      clearKickedInfo: vi.fn(),
    } as any);

    const { unmount: unmountJoin } = renderMobile(
      <PlayerJoin roomCode="FEUD-MOBI" initialRoom={mockRoom} />
    );
    const joinShell = screen.getByTestId('player-controller-shell');
    expect(joinShell.className).toContain('overflow-x-hidden');
    expect(joinShell.className).toContain('pb-safe');
    unmountJoin();

    // Face-Off Buzzer Active screen
    const { unmount: unmountFo } = renderMobile(
      <MainGameFaceOffController
        snapshot={baseFaceOffSnapshot}
        currentNickname="Alice"
        currentPlayerId="p1"
        roomCode="FEUD-MOBI"
      />
    );
    const foRoot = screen.getByTestId('main-game-face-off-controller');
    expect(foRoot.className).toContain('overflow-x-hidden');
    expect(foRoot.className).toContain('pb-safe');

    const buzzerZone = screen.getByTestId('face-off-buzzer-zone');
    expect(buzzerZone.className).toContain('flex-1');
    expect(buzzerZone.className).toContain('min-h-[260px]');
    expect(buzzerZone.className).toContain('justify-center');

    const buzzerBtn = screen.getByTestId('face-off-buzzer-btn');
    expect(buzzerBtn.className).toContain('w-56');
    expect(buzzerBtn.className).toContain('h-56');
    expect(buzzerBtn.className).toContain('max-w-[75vw]');
    expect(buzzerBtn.className).toContain('touch-target');
    expect(buzzerBtn.className).toContain('touch-manipulation');
    unmountFo();

    // Fast Money Isolation screen
    renderMobile(<FastMoneyIsolation />);
    const isoScreen = screen.getByTestId('player2-isolation-screen');
    expect(isoScreen.className).toContain('overflow-x-hidden');
    expect(isoScreen.className).toContain('pb-safe');
  });

  it('2. Accessibility: All primary mobile inputs and buttons enforce >=48px touch targets (min-h-touch / touch-target) and >=16px input text', () => {
    // A. Face-Off Ready, Answering, and Pass/Play controls
    const { rerender, unmount: unmountFo } = renderMobile(
      <MainGameFaceOffController
        snapshot={{
          ...baseFaceOffSnapshot,
          phase: 'AWAITING_READY',
          team1Contender: { ...baseFaceOffSnapshot.team1Contender!, isReady: false },
        }}
        currentNickname="Alice"
        currentPlayerId="p1"
        roomCode="FEUD-MOBI"
      />
    );
    expect(screen.getByTestId('face-off-ready-btn').className).toContain('min-h-touch');

    rerender(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-MOBI">
          <MainGameFaceOffController
            snapshot={{
              ...baseFaceOffSnapshot,
              phase: 'ANSWERING',
              buzzerLocked: true,
              buzzedPlayerId: 'p1',
              buzzedPlayerNickname: 'Alice',
              activeRespondentId: 'p1',
            }}
            currentNickname="Alice"
            currentPlayerId="p1"
            roomCode="FEUD-MOBI"
          />
        </RouterProvider>
      </LanguageProvider>
    );
    expect(screen.getByTestId('face-off-answer-input').className).toContain('min-h-touch');
    expect(screen.getByTestId('face-off-answer-input').className).toContain('text-lg');
    expect(screen.getByTestId('face-off-submit-btn').className).toContain('min-h-touch');

    rerender(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-MOBI">
          <MainGameFaceOffController
            snapshot={{
              ...baseFaceOffSnapshot,
              phase: 'PASS_OR_PLAY',
              winnerPlayerId: 'p1',
              winnerNickname: 'Alice',
            }}
            currentNickname="Alice"
            currentPlayerId="p1"
            roomCode="FEUD-MOBI"
          />
        </RouterProvider>
      </LanguageProvider>
    );
    expect(screen.getByTestId('face-off-play-btn').className).toContain('min-h-touch');
    expect(screen.getByTestId('face-off-pass-btn').className).toContain('min-h-touch');
    unmountFo();

    // B. Team Guessing & Steal controls
    const { rerender: rerenderTeam, unmount: unmountTeam } = renderMobile(
      <MainGameTeamController
        snapshot={baseTeamSnapshot}
        currentNickname="Alice"
        currentPlayerId="p1"
        roomCode="FEUD-MOBI"
      />
    );
    expect(screen.getByTestId('player-guess-input').className).toContain('min-h-touch');
    expect(screen.getByTestId('player-guess-input').className).toContain('text-base');
    expect(screen.getByTestId('player-submit-guess-btn').className).toContain('min-h-touch');
    expect(screen.getByTestId('player-pass-turn-btn').className).toContain('min-h-touch');

    rerenderTeam(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-MOBI">
          <MainGameTeamController
            snapshot={{ ...baseTeamSnapshot, phase: 'STEAL_PHASE', strikes: 3 }}
            currentNickname="Bob"
            currentPlayerId="p2"
            roomCode="FEUD-MOBI"
          />
        </RouterProvider>
      </LanguageProvider>
    );
    expect(screen.getByTestId('spokesperson-steal-input').className).toContain('min-h-touch');
    expect(screen.getByTestId('spokesperson-submit-steal-btn').className).toContain(
      'min-h-touch'
    );
    unmountTeam();

    // C. Fast Money Ready & Playing controls
    const fmReadySnapshot: Player1StateSnapshot = {
      phase: 'P1_READY',
      currentQuestion: null,
      answeredCount: 0,
      passedCount: 0,
      totalQuestions: 5,
      remainingSeconds: 60,
      isTimerRunning: false,
      canSubmit: false,
      canPass: false,
    };
    const { rerender: rerenderFm } = renderMobile(
      <FastMoneyController
        snapshot={fmReadySnapshot}
        onReady={vi.fn()}
        onSubmitAnswer={vi.fn()}
        onPass={vi.fn()}
      />
    );
    expect(screen.getByTestId('p1-ready-btn').className).toContain('min-h-touch');

    rerenderFm(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-MOBI">
          <FastMoneyController
            snapshot={{
              ...fmReadySnapshot,
              phase: 'P1_PLAYING',
              currentQuestion: {
                id: 'q1',
                questionText: 'Name a color',
                questionNumber: 1,
                totalQuestions: 5,
              },
              isTimerRunning: true,
              canSubmit: true,
              canPass: true,
            }}
            onReady={vi.fn()}
            onSubmitAnswer={vi.fn()}
            onPass={vi.fn()}
          />
        </RouterProvider>
      </LanguageProvider>
    );
    expect(screen.getByTestId('fast-money-input').className).toContain('min-h-touch');
    expect(screen.getByTestId('fast-money-pass-btn').className).toContain('min-h-touch');
    expect(screen.getByTestId('fast-money-submit-btn').className).toContain('min-h-touch');
  });

  it('3. Scenario 3: Pressing the Face-Off buzzer executes navigator.vibrate(50) immediately on touch without double-vibrating on follow-up click', () => {
    const onBuzz = vi.fn();

    const { rerender } = renderMobile(
      <MainGameFaceOffController
        snapshot={baseFaceOffSnapshot}
        currentNickname="Alice"
        currentPlayerId="p1"
        roomCode="FEUD-MOBI"
        onBuzz={onBuzz}
      />
    );

    const buzzerBtn = screen.getByTestId('face-off-buzzer-btn');

    // Simulate real smartphone tap: touchStart fires immediately, followed by click
    fireEvent.touchStart(buzzerBtn);
    expect(vibrateMock).toHaveBeenCalledTimes(1);
    expect(vibrateMock).toHaveBeenLastCalledWith(50);

    fireEvent.click(buzzerBtn);
    // Deduped: still 1 vibration, while onBuzz fires once
    expect(vibrateMock).toHaveBeenCalledTimes(1);
    expect(onBuzz).toHaveBeenCalledTimes(1);

    // Simulate paused state: neither touchStart nor click vibrates or buzzes
    vibrateMock.mockClear();
    onBuzz.mockClear();
    rerender(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-MOBI">
          <MainGameFaceOffController
            snapshot={baseFaceOffSnapshot}
            isPaused={true}
            currentNickname="Alice"
            currentPlayerId="p1"
            roomCode="FEUD-MOBI"
            onBuzz={onBuzz}
          />
        </RouterProvider>
      </LanguageProvider>
    );
    const pausedBuzzerBtn = screen.getByTestId('face-off-buzzer-btn');
    fireEvent.touchStart(pausedBuzzerBtn);
    fireEvent.click(pausedBuzzerBtn);
    expect(vibrateMock).not.toHaveBeenCalled();
    expect(onBuzz).not.toHaveBeenCalled();

    // Simulate non-touch click after deduplication window (>400ms) -> still triggers vibrate(50)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);
    rerender(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-MOBI">
          <MainGameFaceOffController
            snapshot={baseFaceOffSnapshot}
            isPaused={false}
            currentNickname="Alice"
            currentPlayerId="p1"
            roomCode="FEUD-MOBI"
            onBuzz={onBuzz}
          />
        </RouterProvider>
      </LanguageProvider>
    );
    fireEvent.click(screen.getByTestId('face-off-buzzer-btn'));
    expect(vibrateMock).toHaveBeenCalledWith(50);
    expect(onBuzz).toHaveBeenCalledTimes(1);
  });

  it('4. Delivers [100, 50, 100] strike vibration and [50, 50, 150] celebratory vibration across Face-Off and Team Guessing events', () => {
    // A. Face-Off buzzerRejected -> strike ([100, 50, 100]), PASS_OR_PLAY winner -> success ([50, 50, 150])
    const { rerender: rerenderFo, unmount: unmountFo } = renderMobile(
      <MainGameFaceOffController
        snapshot={baseFaceOffSnapshot}
        buzzerRejected={{ roomCode: 'FEUD-MOBI', playerId: 'p1', reason: 'BUZZER_LOCKED' }}
        currentNickname="Alice"
        currentPlayerId="p1"
        roomCode="FEUD-MOBI"
      />
    );
    expect(vibrateMock).toHaveBeenCalledWith([100, 50, 100]);

    vibrateMock.mockClear();
    rerenderFo(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-MOBI">
          <MainGameFaceOffController
            snapshot={{
              ...baseFaceOffSnapshot,
              phase: 'PASS_OR_PLAY',
              winnerPlayerId: 'p1',
              winnerNickname: 'Alice',
            }}
            currentNickname="Alice"
            currentPlayerId="p1"
            roomCode="FEUD-MOBI"
          />
        </RouterProvider>
      </LanguageProvider>
    );
    expect(vibrateMock).toHaveBeenCalledWith([50, 50, 150]);
    unmountFo();

    // B. Team Guessing: strikeIssued -> [100, 50, 100]; revealed answer -> [50, 50, 150]; stealResolved -> [50, 50, 150] / [100, 50, 100]
    vibrateMock.mockClear();
    const { rerender: rerenderTeam } = renderMobile(
      <MainGameTeamController
        snapshot={baseTeamSnapshot}
        strikeIssued={{
          roomCode: 'FEUD-MOBI',
          team: 'TEAM_1',
          strikeCount: 1,
          maxStrikes: 3,
          player: { id: 'p1', nickname: 'Alice' },
          rawAnswer: 'Toaster',
        }}
        currentNickname="Alice"
        currentPlayerId="p1"
        roomCode="FEUD-MOBI"
      />
    );
    expect(vibrateMock).toHaveBeenCalledWith([100, 50, 100]);

    vibrateMock.mockClear();
    rerenderTeam(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-MOBI">
          <MainGameTeamController
            snapshot={{
              ...baseTeamSnapshot,
              roundBank: 52,
              revealedAnswersCount: 1,
              revealedAnswers: [{ id: 'a1', answerText: 'Phone', points: 52, rankOrder: 1 }],
            }}
            currentNickname="Alice"
            currentPlayerId="p1"
            roomCode="FEUD-MOBI"
          />
        </RouterProvider>
      </LanguageProvider>
    );
    expect(vibrateMock).toHaveBeenCalledWith([50, 50, 150]);

    // Steal succeeds against controlling team -> controlling team gets strike vibration
    vibrateMock.mockClear();
    rerenderTeam(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-MOBI">
          <MainGameTeamController
            snapshot={{ ...baseTeamSnapshot, phase: 'RESOLVED', winningTeam: 'TEAM_2' }}
            stealResolved={{
              roomCode: 'FEUD-MOBI',
              success: true,
              outcome: 'STEAL_SUCCESS',
              winningTeam: 'TEAM_2',
              pointsAwarded: 52,
              stealingPlayer: { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
              rawAnswer: 'Lamp',
              roundBank: 52,
              remainingAnswers: [],
              message: 'Team 2 steals!',
            }}
            currentNickname="Alice"
            currentPlayerId="p1"
            roomCode="FEUD-MOBI"
          />
        </RouterProvider>
      </LanguageProvider>
    );
    expect(vibrateMock).toHaveBeenCalledWith([100, 50, 100]);
  });
});
