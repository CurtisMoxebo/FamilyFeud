import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { FastMoneyController } from '../src/components/FastMoneyController';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { FastMoneyRevealSlot, Player1StateSnapshot, TimerTickPayload } from '../src/types';

describe('Frontend Component Suite: FastMoneyController (US-07)', () => {
  const readySnapshot: Player1StateSnapshot = {
    phase: 'P1_READY',
    currentQuestion: {
      id: 'q-1',
      questionText: 'Name something you eat with a spoon',
      questionNumber: 1,
      totalQuestions: 5,
    },
    answeredCount: 0,
    passedCount: 0,
    totalQuestions: 5,
    remainingSeconds: 60,
    isTimerRunning: false,
    canSubmit: false,
    canPass: false,
  };

  const playingSnapshot: Player1StateSnapshot = {
    phase: 'P1_PLAYING',
    currentQuestion: {
      id: 'q-1',
      questionText: 'Name something you eat with a spoon',
      questionNumber: 1,
      totalQuestions: 5,
    },
    answeredCount: 0,
    passedCount: 0,
    totalQuestions: 5,
    remainingSeconds: 60,
    isTimerRunning: true,
    canSubmit: true,
    canPass: true,
  };

  const finishedSnapshot: Player1StateSnapshot = {
    phase: 'P1_FINISHED',
    currentQuestion: null,
    answeredCount: 4,
    passedCount: 1,
    totalQuestions: 5,
    remainingSeconds: 0,
    isTimerRunning: false,
    canSubmit: false,
    canPass: false,
  };

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(<LanguageProvider initialLanguage="EN">{ui}</LanguageProvider>);
  };

  describe('Scenario 1: Ready Button Starts 60-Second Timer', () => {
    it('renders "I\'m Ready!" screen with prominent button when phase is P1_READY', () => {
      const onReady = vi.fn();
      renderWithProviders(
        <FastMoneyController
          snapshot={readySnapshot}
          onReady={onReady}
          onSubmitAnswer={vi.fn()}
          onPass={vi.fn()}
        />
      );

      expect(screen.getByTestId('p1-ready-screen')).toBeInTheDocument();
      expect(screen.getByTestId('p1-ready-btn')).toBeInTheDocument();
      expect(screen.getByText(/Fast Money - Player 1/i)).toBeInTheDocument();
      expect(screen.getByText(/60 Seconds on the Clock/i)).toBeInTheDocument();
    });

    it('triggers onReady callback when Player 1 clicks "I\'m Ready!"', async () => {
      const user = userEvent.setup();
      const onReady = vi.fn();
      renderWithProviders(
        <FastMoneyController
          snapshot={readySnapshot}
          onReady={onReady}
          onSubmitAnswer={vi.fn()}
          onPass={vi.fn()}
        />
      );

      const readyBtn = screen.getByTestId('p1-ready-btn');
      await user.click(readyBtn);

      expect(onReady).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scenario 2: Active Playing State, Auto-Focus & Zero-Latency Submission', () => {
    it('renders question text, question counter, and authoritative timer', () => {
      renderWithProviders(
        <FastMoneyController
          snapshot={playingSnapshot}
          onReady={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onPass={vi.fn()}
        />
      );

      expect(screen.getByTestId('fast-money-playing-screen')).toBeInTheDocument();
      expect(screen.getByTestId('fast-money-question-text')).toHaveTextContent(
        'Name something you eat with a spoon'
      );
      expect(screen.getByTestId('fast-money-question-counter')).toHaveTextContent(
        'Question 1 of 5'
      );
      expect(screen.getByTestId('fast-money-timer')).toHaveTextContent('60');
    });

    it('satisfies DoD requirement: mobile input field auto-focuses on render and question change', async () => {
      const { rerender } = renderWithProviders(
        <FastMoneyController
          snapshot={playingSnapshot}
          onReady={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onPass={vi.fn()}
        />
      );

      const input = screen.getByTestId('fast-money-input');
      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });

      // Question 2 advances
      const q2Snapshot: Player1StateSnapshot = {
        ...playingSnapshot,
        currentQuestion: {
          id: 'q-2',
          questionText: 'Name something you find in the kitchen',
          questionNumber: 2,
          totalQuestions: 5,
        },
        answeredCount: 1,
      };

      rerender(
        <LanguageProvider initialLanguage="EN">
          <FastMoneyController
            snapshot={q2Snapshot}
            onReady={vi.fn()}
            onSubmitAnswer={vi.fn()}
            onPass={vi.fn()}
          />
        </LanguageProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('fast-money-question-text')).toHaveTextContent(
          'Name something you find in the kitchen'
        );
        expect(document.activeElement).toBe(screen.getByTestId('fast-money-input'));
      });
    });

    it('submits answer on button click and clears input field', async () => {
      const user = userEvent.setup();
      const onSubmitAnswer = vi.fn();
      renderWithProviders(
        <FastMoneyController
          snapshot={playingSnapshot}
          onReady={vi.fn()}
          onSubmitAnswer={onSubmitAnswer}
          onPass={vi.fn()}
        />
      );

      const input = screen.getByTestId('fast-money-input');
      await user.type(input, 'Soup');

      const submitBtn = screen.getByTestId('fast-money-submit-btn');
      expect(submitBtn).not.toBeDisabled();
      await user.click(submitBtn);

      expect(onSubmitAnswer).toHaveBeenCalledWith('q-1', 'Soup');
      expect(input).toHaveValue('');
    });

    it('submits answer on Enter key press', async () => {
      const user = userEvent.setup();
      const onSubmitAnswer = vi.fn();
      renderWithProviders(
        <FastMoneyController
          snapshot={playingSnapshot}
          onReady={vi.fn()}
          onSubmitAnswer={onSubmitAnswer}
          onPass={vi.fn()}
        />
      );

      const input = screen.getByTestId('fast-money-input');
      await user.type(input, 'Yogurt{enter}');

      expect(onSubmitAnswer).toHaveBeenCalledWith('q-1', 'Yogurt');
      expect(input).toHaveValue('');
    });

    it('prevents submission when input is empty or whitespace only', async () => {
      const user = userEvent.setup();
      const onSubmitAnswer = vi.fn();
      renderWithProviders(
        <FastMoneyController
          snapshot={playingSnapshot}
          onReady={vi.fn()}
          onSubmitAnswer={onSubmitAnswer}
          onPass={vi.fn()}
        />
      );

      const submitBtn = screen.getByTestId('fast-money-submit-btn');
      expect(submitBtn).toBeDisabled();

      const input = screen.getByTestId('fast-money-input');
      await user.type(input, '   {enter}');

      expect(onSubmitAnswer).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 3: Pass Button and Recycled Queue Badge', () => {
    it('triggers onPass callback when Player 1 clicks yellow "Pass" button', async () => {
      const user = userEvent.setup();
      const onPass = vi.fn();
      renderWithProviders(
        <FastMoneyController
          snapshot={playingSnapshot}
          onReady={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onPass={onPass}
        />
      );

      const passBtn = screen.getByTestId('fast-money-pass-btn');
      expect(passBtn).toHaveClass('bg-amber-500'); // Yellow pass button styling
      await user.click(passBtn);

      expect(onPass).toHaveBeenCalledWith('q-1');
    });

    it('displays passed question counter badge when passedCount > 0', () => {
      const passedSnapshot: Player1StateSnapshot = {
        ...playingSnapshot,
        passedCount: 2,
      };

      renderWithProviders(
        <FastMoneyController
          snapshot={passedSnapshot}
          onReady={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onPass={vi.fn()}
        />
      );

      const passedCounter = screen.getByTestId('fast-money-passed-counter');
      expect(passedCounter).toHaveTextContent('(Passed: 2)');
    });
  });

  describe('Scenario 4: Authoritative Timer Sync & Turn Expiration', () => {
    it('prioritizes authoritative timerTick payload over snapshot remainingSeconds', () => {
      const tick: TimerTickPayload = {
        secondsRemaining: 42,
        endsAt: Date.now() + 42000,
      };

      renderWithProviders(
        <FastMoneyController
          snapshot={playingSnapshot}
          timerTick={tick}
          onReady={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onPass={vi.fn()}
        />
      );

      expect(screen.getByTestId('fast-money-timer')).toHaveTextContent('42');
    });

    it('applies pulsing red styling when timer is under 10 seconds', () => {
      const lowTick: TimerTickPayload = {
        secondsRemaining: 7,
        endsAt: Date.now() + 7000,
      };

      renderWithProviders(
        <FastMoneyController
          snapshot={playingSnapshot}
          timerTick={lowTick}
          onReady={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onPass={vi.fn()}
        />
      );

      const timerEl = screen.getByTestId('fast-money-timer');
      expect(timerEl).toHaveClass('animate-pulse');
      expect(timerEl).toHaveClass('text-feud-red');
    });

    it('renders turn complete screen and locks input on P1_FINISHED or P1_REVEAL', () => {
      renderWithProviders(
        <FastMoneyController
          snapshot={finishedSnapshot}
          onReady={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onPass={vi.fn()}
        />
      );

      expect(screen.getByTestId('fast-money-turn-complete')).toBeInTheDocument();
      expect(screen.getByTestId('fast-money-locked-notice')).toBeInTheDocument();
      expect(screen.queryByTestId('fast-money-input')).not.toBeInTheDocument();
      expect(screen.getByText('4 / 5')).toBeInTheDocument();
    });
  });

  describe('US-08: Reveal Sequence and P2 Ready Synchronization', () => {
    const mockSlots: FastMoneyRevealSlot[] = [
      {
        slotNumber: 1,
        questionId: 'q-1',
        questionText: 'Name something you eat with a spoon',
        rawAnswer: 'SOUP',
        pointsAwarded: 45,
        isAnswerRevealed: true,
        isPointsRevealed: true,
        isMatched: true,
      },
      {
        slotNumber: 2,
        questionId: 'q-2',
        questionText: 'Name a yellow fruit',
        rawAnswer: 'BANANA',
        pointsAwarded: 30,
        isAnswerRevealed: true,
        isPointsRevealed: false,
        isMatched: true,
      },
      {
        slotNumber: 3,
        questionId: 'q-3',
        questionText: 'Name something you wear on your head',
        rawAnswer: 'HAT',
        pointsAwarded: 0,
        isAnswerRevealed: false,
        isPointsRevealed: false,
        isMatched: false,
      },
      {
        slotNumber: 4,
        questionId: 'q-4',
        questionText: 'Name a day of the week',
        rawAnswer: 'FRIDAY',
        pointsAwarded: 25,
        isAnswerRevealed: false,
        isPointsRevealed: false,
        isMatched: true,
      },
      {
        slotNumber: 5,
        questionId: 'q-5',
        questionText: 'Name an animal with stripes',
        rawAnswer: 'ZEBRA',
        pointsAwarded: 40,
        isAnswerRevealed: false,
        isPointsRevealed: false,
        isMatched: true,
      },
    ];

    it('renders p1-reveal-screen with live cumulative score and synchronized card flips', () => {
      const revealSnapshot: Player1StateSnapshot = {
        phase: 'P1_REVEAL',
        currentQuestion: null,
        answeredCount: 5,
        passedCount: 0,
        totalQuestions: 5,
        remainingSeconds: 0,
        isTimerRunning: false,
        canSubmit: false,
        canPass: false,
        totalScore: 45,
        revealSlots: mockSlots,
        activeRevealSlotNumber: 2,
      };

      renderWithProviders(
        <FastMoneyController
          snapshot={revealSnapshot}
          onReady={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onPass={vi.fn()}
        />
      );

      expect(screen.getByTestId('p1-reveal-screen')).toBeInTheDocument();
      expect(screen.getByTestId('p1-reveal-total-score')).toHaveTextContent('45');

      // Slot 1: Answer and points revealed
      expect(screen.getByTestId('p1-reveal-answer-1')).toHaveTextContent('SOUP');
      expect(screen.getByTestId('p1-reveal-points-1')).toHaveTextContent('45');

      // Slot 2: Answer revealed, points concealed
      expect(screen.getByTestId('p1-reveal-answer-2')).toHaveTextContent('BANANA');
      expect(screen.getByTestId('p1-reveal-points-2')).toHaveTextContent('--');

      // Slot 3: Both concealed
      expect(screen.getByTestId('p1-concealed-answer-3')).toHaveTextContent('••••••••');
      expect(screen.getByTestId('p1-reveal-points-3')).toHaveTextContent('--');

      // Input locked notice
      expect(screen.getByTestId('fast-money-locked-notice')).toBeInTheDocument();
      expect(screen.queryByTestId('fast-money-input')).not.toBeInTheDocument();
    });

    it('displays completion banner and final total score when transitioning to P2_READY', () => {
      const readySnapshot2: Player1StateSnapshot = {
        phase: 'P2_READY',
        currentQuestion: null,
        answeredCount: 5,
        passedCount: 0,
        totalQuestions: 5,
        remainingSeconds: 0,
        isTimerRunning: false,
        canSubmit: false,
        canPass: false,
        totalScore: 140,
        revealSlots: mockSlots.map((s) => ({ ...s, isAnswerRevealed: true, isPointsRevealed: true })),
        activeRevealSlotNumber: null,
      };

      renderWithProviders(
        <FastMoneyController
          snapshot={readySnapshot2}
          onReady={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onPass={vi.fn()}
        />
      );

      expect(screen.getByTestId('p1-reveal-screen')).toBeInTheDocument();
      expect(screen.getByTestId('p1-reveal-total-score')).toHaveTextContent('140');
      expect(screen.getByTestId('p1-reveal-complete-banner')).toBeInTheDocument();
      expect(screen.getByText(/Player 1 Reveal Complete!/i)).toBeInTheDocument();
    });
  });
  describe('US-09: Player 2 Speed Round, Duplicate Warning & Haptic Feedback', () => {
    const p2PlayingSnapshot: any = {
      phase: 'P2_PLAYING',
      currentQuestion: {
        id: 'q-1',
        questionText: 'Name a caffeinated beverage',
        questionNumber: 1,
        totalQuestions: 5,
      },
      answeredCount: 0,
      passedCount: 0,
      totalQuestions: 5,
      remainingSeconds: 75,
      isTimerRunning: true,
      canSubmit: true,
      canPass: true,
    };

    it('satisfies Scenario 1: mounts FastMoneyController for Player 2 with 75-second countdown', () => {
      renderWithProviders(
        <FastMoneyController
          snapshot={p2PlayingSnapshot}
          playerNumber={2}
          onReady={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onPass={vi.fn()}
        />
      );

      expect(screen.getByTestId('fast-money-playing-screen')).toBeInTheDocument();
      expect(screen.getByTestId('fast-money-timer')).toHaveTextContent('75s');
      expect(screen.getByTestId('fast-money-question-text')).toHaveTextContent(
        'Name a caffeinated beverage'
      );
      expect(screen.getByText(/Player 2 • Question #1/i)).toBeInTheDocument();
    });

    it('satisfies Scenario 2: clears input, triggers shake animation and haptic feedback on duplicate answer warning', () => {
      const vibrateMock = vi.fn();
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrateMock,
        writable: true,
        configurable: true,
      });

      const duplicateWarning = {
        roomCode: 'FEUD-P201',
        rawInput: 'coffee',
        message: 'Duplicate answer! Enter another answer.',
        questionId: 'q-1',
        duplicateWithAnswer: 'Coffee',
        reason: 'EXACT_RAW' as const,
      };

      renderWithProviders(
        <FastMoneyController
          snapshot={p2PlayingSnapshot}
          duplicateWarning={duplicateWarning}
          playerNumber={2}
          onReady={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onPass={vi.fn()}
        />
      );

      // Warning Banner
      const banner = screen.getByTestId('duplicate-warning-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Duplicate answer! Enter another answer.');
      expect(banner).toHaveTextContent('Player 1 answered: "Coffee"');

      // Input cleared
      const input = screen.getByTestId('fast-money-input') as HTMLInputElement;
      expect(input.value).toBe('');

      // Haptic feedback invoked
      expect(vibrateMock).toHaveBeenCalledWith([100, 50, 100]);
    });

    it('satisfies Scenario 3: typing alternative answer clears duplicate warning and submits successfully', async () => {
      const user = userEvent.setup();
      const onSubmitAnswer = vi.fn();
      const onClearDuplicateWarning = vi.fn();

      const duplicateWarning = {
        roomCode: 'FEUD-P201',
        rawInput: 'coffee',
        message: 'Duplicate answer! Enter another answer.',
        questionId: 'q-1',
        duplicateWithAnswer: 'Coffee',
        reason: 'EXACT_RAW' as const,
      };

      renderWithProviders(
        <FastMoneyController
          snapshot={p2PlayingSnapshot}
          duplicateWarning={duplicateWarning}
          onClearDuplicateWarning={onClearDuplicateWarning}
          playerNumber={2}
          onReady={vi.fn()}
          onSubmitAnswer={onSubmitAnswer}
          onPass={vi.fn()}
        />
      );

      const input = screen.getByTestId('fast-money-input');
      await user.type(input, 'Tea');

      expect(onClearDuplicateWarning).toHaveBeenCalled();

      const submitBtn = screen.getByTestId('fast-money-submit-btn');
      await user.click(submitBtn);

      expect(onSubmitAnswer).toHaveBeenCalledWith('q-1', 'Tea');
    });

    it('satisfies Scenario 4: clicking Pass advances question and clears duplicate warning', async () => {
      const user = userEvent.setup();
      const onPass = vi.fn();
      const onClearDuplicateWarning = vi.fn();

      const duplicateWarning = {
        roomCode: 'FEUD-P201',
        rawInput: 'coffee',
        message: 'Duplicate answer! Enter another answer.',
        questionId: 'q-1',
        duplicateWithAnswer: 'Coffee',
        reason: 'EXACT_RAW' as const,
      };

      renderWithProviders(
        <FastMoneyController
          snapshot={p2PlayingSnapshot}
          duplicateWarning={duplicateWarning}
          onClearDuplicateWarning={onClearDuplicateWarning}
          playerNumber={2}
          onReady={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onPass={onPass}
        />
      );

      const passBtn = screen.getByTestId('fast-money-pass-btn');
      await user.click(passBtn);

      expect(onPass).toHaveBeenCalledWith('q-1');
      expect(onClearDuplicateWarning).toHaveBeenCalled();
    });
  });
});