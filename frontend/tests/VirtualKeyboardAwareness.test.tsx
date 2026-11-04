import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { AppContent } from '../src/App';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { RouterProvider } from '../src/router/router';
import { useVirtualKeyboard } from '../src/hooks/useVirtualKeyboard';
import { FastMoneyController } from '../src/components/FastMoneyController';
import { MainGameFaceOffController } from '../src/components/MainGameFaceOffController';
import { MainGameTeamController } from '../src/components/MainGameTeamController';
import { PlayerJoin } from '../src/pages/PlayerJoin';
import * as socketHook from '../src/hooks/useSocket';
import {
  Room,
  Player1StateSnapshot,
  FaceOffSessionState,
  TeamGuessingSessionState,
} from '../src/types';

interface MockVisualViewport {
  height: number;
  width: number;
  offsetTop: number;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  dispatchResize: (nextHeight: number, nextOffsetTop?: number) => void;
}

function createMockVisualViewport(initialWidth = 390, initialHeight = 844): MockVisualViewport {
  const listeners: Record<string, Set<EventListener>> = {
    resize: new Set(),
    scroll: new Set(),
  };

  const mockVv: MockVisualViewport = {
    width: initialWidth,
    height: initialHeight,
    offsetTop: 0,
    addEventListener(type: string, listener: EventListener) {
      if (!listeners[type]) listeners[type] = new Set();
      listeners[type].add(listener);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners[type]?.delete(listener);
    },
    dispatchResize(nextHeight: number, nextOffsetTop = 0) {
      mockVv.height = nextHeight;
      mockVv.offsetTop = nextOffsetTop;
      const evt = new Event('resize');
      listeners.resize.forEach((fn) => fn(evt));
    },
  };

  return mockVv;
}

describe('US-22 Step 4: Virtual Soft-Keyboard Awareness on Mobile Inputs (Scenario 4)', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;
  const originalVisualViewport = window.visualViewport;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 844,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      writable: true,
      value: originalVisualViewport,
    });
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  const renderMobile = (ui: React.ReactElement, initialPath = '/play/FEUD-KB01') =>
    render(
      <LanguageProvider>
        <RouterProvider initialPath={initialPath}>{ui}</RouterProvider>
      </LanguageProvider>
    );

  it('1. useVirtualKeyboard tracks iOS visualViewport insets, Android layout shrinks, CSS vars, and safe scrollIntoView fallbacks without desktop false positives', async () => {
    const mockVv = createMockVisualViewport(390, 844);
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      writable: true,
      value: mockVv,
    });

    const { result, unmount } = renderHook(() => useVirtualKeyboard());

    expect(result.current.isKeyboardOpen).toBe(false);
    expect(result.current.keyboardHeight).toBe(0);
    expect(result.current.viewportHeight).toBe(844);

    // Simulate iOS Safari soft keyboard sliding open (844 -> 490 = 354px inset)
    act(() => {
      mockVv.dispatchResize(490);
    });

    expect(result.current.isKeyboardOpen).toBe(true);
    expect(result.current.keyboardHeight).toBe(354);
    expect(result.current.viewportHeight).toBe(490);
    expect(
      document.documentElement.style.getPropertyValue('--visual-viewport-height')
    ).toBe('490px');
    expect(
      document.documentElement.style.getPropertyValue('--keyboard-inset-height')
    ).toBe('354px');

    // Simulate soft keyboard closing (490 -> 844)
    act(() => {
      mockVv.dispatchResize(844);
    });
    expect(result.current.isKeyboardOpen).toBe(false);
    expect(result.current.keyboardHeight).toBe(0);

    // Verify keepElementVisible handles standard and legacy scrollIntoView safely
    const dummyDiv = document.createElement('div');
    const scrollSpy = vi.fn();
    dummyDiv.scrollIntoView = scrollSpy;
    act(() => {
      result.current.keepElementVisible(dummyDiv);
    });
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });

    const legacyScrollSpy = vi.fn().mockImplementationOnce(() => {
      throw new TypeError('Options object unsupported');
    });
    dummyDiv.scrollIntoView = legacyScrollSpy;
    act(() => {
      result.current.keepElementVisible(dummyDiv);
    });
    expect(legacyScrollSpy).toHaveBeenLastCalledWith(false);
    unmount();

    // Simulate Android resizes-content mode (no visualViewport, innerHeight shrinks on input focus)
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    window.innerWidth = 360;
    window.innerHeight = 800;

    const textInput = document.createElement('input');
    textInput.type = 'text';
    const checkboxInput = document.createElement('input');
    checkboxInput.type = 'checkbox';
    document.body.appendChild(textInput);
    document.body.appendChild(checkboxInput);

    const { result: androidResult, unmount: unmountAndroid } = renderHook(() =>
      useVirtualKeyboard()
    );
    expect(androidResult.current.isKeyboardOpen).toBe(false);

    // Focusing a checkbox does not trigger soft keyboard state
    act(() => {
      checkboxInput.focus();
      fireEvent.focusIn(checkboxInput);
    });
    expect(androidResult.current.isKeyboardOpen).toBe(false);

    // Focusing text input + Android resizing innerHeight (800 -> 440) triggers keyboard open
    act(() => {
      textInput.focus();
      fireEvent.focusIn(textInput);
      window.innerHeight = 440;
      window.dispatchEvent(new Event('resize'));
    });
    expect(androidResult.current.isKeyboardOpen).toBe(true);
    expect(androidResult.current.keyboardHeight).toBe(360);
    expect(androidResult.current.viewportHeight).toBe(440);

    // Blurring input and restoring height closes keyboard state
    act(() => {
      textInput.blur();
      fireEvent.focusOut(textInput);
      window.innerHeight = 800;
      window.dispatchEvent(new Event('resize'));
    });
    await waitFor(() => {
      expect(androidResult.current.isKeyboardOpen).toBe(false);
    });

    document.body.removeChild(textInput);
    document.body.removeChild(checkboxInput);
    unmountAndroid();

    // Desktop viewport (1440 x 900) focusing text input does NOT falsely trigger soft keyboard
    window.innerWidth = 1440;
    window.innerHeight = 900;
    const desktopInput = document.createElement('input');
    desktopInput.type = 'text';
    document.body.appendChild(desktopInput);
    const { result: desktopResult } = renderHook(() => useVirtualKeyboard());
    act(() => {
      desktopInput.focus();
      fireEvent.focusIn(desktopInput);
    });
    expect(desktopResult.current.isKeyboardOpen).toBe(false);
    document.body.removeChild(desktopInput);
  });

  it('2. Scenario 4: Fast Money mobile input keeps active question text, input box, Pass button, and Submit button visible above the soft keyboard', async () => {
    const mockVv = createMockVisualViewport(390, 844);
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      writable: true,
      value: mockVv,
    });

    const scrollSpy = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollSpy;

    const onSubmitAnswer = vi.fn();
    const onPass = vi.fn();

    const fmPlayingSnapshot: Player1StateSnapshot = {
      phase: 'P1_PLAYING',
      currentQuestion: {
        id: 'q-fm-kb',
        questionText: 'Name something people forget when packing for vacation',
        questionNumber: 2,
        totalQuestions: 5,
      },
      answeredCount: 1,
      passedCount: 0,
      totalQuestions: 5,
      remainingSeconds: 48,
      isTimerRunning: true,
      canSubmit: true,
      canPass: true,
    };

    const { unmount } = renderMobile(
      <FastMoneyController
        snapshot={fmPlayingSnapshot}
        onReady={vi.fn()}
        onSubmitAnswer={onSubmitAnswer}
        onPass={onPass}
      />
    );

    const playingScreen = screen.getByTestId('fast-money-playing-screen');
    expect(playingScreen).toHaveAttribute('data-keyboard-open', 'false');

    // Player taps Fast Money text input and mobile soft keyboard slides open (844 -> 460)
    const input = screen.getByTestId('fast-money-input');
    act(() => {
      input.focus();
      fireEvent.focus(input);
      mockVv.dispatchResize(460);
    });

    expect(playingScreen).toHaveAttribute('data-keyboard-open', 'true');
    expect(playingScreen.className).toContain('gap-2');
    expect(scrollSpy).toHaveBeenCalled();

    // Active question text, input box, Pass button, and Submit button all remain visible & usable
    const questionText = screen.getByTestId('fast-money-question-text');
    const answerForm = screen.getByTestId('fast-money-answer-form');
    const passBtn = screen.getByTestId('fast-money-pass-btn');
    const submitBtn = screen.getByTestId('fast-money-submit-btn');

    expect(questionText).toBeVisible();
    expect(questionText).toHaveTextContent(
      'Name something people forget when packing for vacation'
    );
    expect(answerForm.className).toContain('sticky');
    expect(answerForm.className).toContain('bottom-0');
    expect(input).toBeVisible();
    expect(passBtn).toBeVisible();
    expect(submitBtn).toBeVisible();

    // Player types and submits while soft keyboard is open
    fireEvent.change(input, { target: { value: 'Toothbrush' } });
    fireEvent.click(submitBtn);
    expect(onSubmitAnswer).toHaveBeenCalledWith('q-fm-kb', 'Toothbrush');

    fireEvent.click(passBtn);
    expect(onPass).toHaveBeenCalledWith('q-fm-kb');
    unmount();

    // Verify AppContent outer shell switches from justify-center to justify-start + visualViewport minHeight
    const mockFastMoneyRoom: Room = {
      id: 'room-fm-kb',
      roomCode: 'FEUD-KB01',
      roomName: 'Keyboard Fast Money',
      language: 'EN',
      gameMode: 'FAST_MONEY',
      status: 'LOBBY',
      createdAt: new Date().toISOString(),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, room: mockFastMoneyRoom }),
    } as Response);

    mockVv.height = 844;
    renderMobile(<AppContent />, '/play/FEUD-KB01');
    const appShell = screen.getByTestId('app-display-shell');
    expect(appShell).toHaveAttribute('data-keyboard-open', 'false');
    expect(appShell.className).toContain('justify-center');

    await waitFor(() => {
      expect(screen.getByTestId('player-nickname-input')).toBeInTheDocument();
    });

    act(() => {
      mockVv.dispatchResize(450);
    });

    expect(appShell).toHaveAttribute('data-keyboard-open', 'true');
    expect(appShell.className).toContain('justify-start');
    expect(appShell.style.minHeight).toBe('450px');
  });

  it('3. Main Game Face-Off, Team Guessing, Steal, and Join controllers compact chrome and anchor inputs above the soft keyboard', () => {
    const mockVv = createMockVisualViewport(390, 844);
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      writable: true,
      value: mockVv,
    });
    HTMLElement.prototype.scrollIntoView = vi.fn();

    // A. Face-Off Answering Controller
    const faceOffAnswering: FaceOffSessionState = {
      roomCode: 'FEUD-KB01',
      gameId: 'game-fo-kb',
      roundNumber: 1,
      language: 'EN',
      phase: 'ANSWERING',
      question: {
        id: 'q1',
        questionText: 'Name a late-night snack',
        answers: [{ id: 'a1', answerText: 'Pizza', points: 45, rankOrder: 1 }],
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

    const { unmount: unmountFo } = renderMobile(
      <MainGameFaceOffController
        snapshot={faceOffAnswering}
        currentNickname="Alice"
        currentPlayerId="p1"
        roomCode="FEUD-KB01"
        roomName="Keyboard Room"
      />
    );

    act(() => {
      fireEvent.focus(screen.getByTestId('face-off-answer-input'));
      mockVv.dispatchResize(440);
    });

    expect(screen.getByTestId('main-game-face-off-controller')).toHaveAttribute(
      'data-keyboard-open',
      'true'
    );
    expect(screen.getByTestId('controller-timer-ring').className).toContain('w-14');
    expect(screen.getByTestId('face-off-answer-form').className).toContain('sticky');
    expect(screen.getByTestId('controller-question-text')).toBeVisible();
    expect(screen.getByTestId('face-off-answer-input')).toBeVisible();
    expect(screen.getByTestId('face-off-submit-btn')).toBeVisible();
    unmountFo();

    // B. Team Guessing & Steal Controller
    mockVv.height = 844;
    const teamSnapshot: TeamGuessingSessionState = {
      roomCode: 'FEUD-KB01',
      gameId: 'game-tg-kb',
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
      strikes: 1,
      roundBank: 45,
      revealedAnswers: [{ id: 'a1', answerText: 'Pizza', points: 45, rankOrder: 1 }],
      totalAnswersCount: 6,
      revealedAnswersCount: 1,
      remainingAnswersCount: 5,
      remainingSeconds: 14,
      endsAt: Date.now() + 14000,
      isTimerRunning: true,
      question: {
        id: 'q1',
        questionText: 'Name a late-night snack',
        answerCount: 6,
      },
    };

    const { rerender: rerenderTeam, unmount: unmountTeam } = renderMobile(
      <MainGameTeamController
        snapshot={teamSnapshot}
        currentNickname="Alice"
        currentPlayerId="p1"
        roomCode="FEUD-KB01"
        roomName="Keyboard Room"
      />
    );

    act(() => {
      fireEvent.focus(screen.getByTestId('player-guess-input'));
      mockVv.dispatchResize(440);
    });

    const teamRoot = screen.getByTestId('main-game-team-controller');
    expect(teamRoot).toHaveAttribute('data-keyboard-open', 'true');
    expect(teamRoot.className).toContain('min-h-0');
    expect(screen.getByTestId('mobile-survey-board-summary').className).toContain('max-h-24');
    expect(screen.getByTestId('player-guess-form').className).toContain('sticky');
    expect(screen.getByTestId('player-guess-input')).toBeVisible();
    expect(screen.getByTestId('player-submit-guess-btn')).toBeVisible();
    expect(screen.getByTestId('player-pass-turn-btn')).toBeVisible();

    // Switch to Steal Phase with keyboard open
    rerenderTeam(
      <LanguageProvider>
        <RouterProvider initialPath="/play/FEUD-KB01">
          <MainGameTeamController
            snapshot={{ ...teamSnapshot, phase: 'STEAL_PHASE', strikes: 3 }}
            currentNickname="Bob"
            currentPlayerId="p2"
            roomCode="FEUD-KB01"
            roomName="Keyboard Room"
          />
        </RouterProvider>
      </LanguageProvider>
    );
    expect(screen.getByTestId('spokesperson-steal-form').className).toContain('sticky');
    expect(screen.getByTestId('spokesperson-steal-input')).toBeVisible();
    expect(screen.getByTestId('spokesperson-submit-steal-btn')).toBeVisible();
    unmountTeam();

    // C. PlayerJoin Nickname Input
    vi.spyOn(socketHook, 'useSocket').mockReturnValue({
      isConnected: true,
      roomState: null,
      roomError: null,
      joinRoom: vi.fn(),
      clearKickedInfo: vi.fn(),
    } as any);

    renderMobile(
      <PlayerJoin
        roomCode="FEUD-KB01"
        initialRoom={{
          id: 'room-kb',
          roomCode: 'FEUD-KB01',
          roomName: 'Keyboard Join Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
          createdAt: new Date().toISOString(),
        }}
      />
    );
    expect(screen.getByTestId('player-controller-shell')).toHaveAttribute(
      'data-keyboard-open',
      'true'
    );
    expect(screen.getByTestId('player-room-name')).toBeVisible();
    expect(screen.getByTestId('player-nickname-input')).toBeVisible();
    expect(screen.getByTestId('player-join-submit-btn')).toBeVisible();
  });
});

