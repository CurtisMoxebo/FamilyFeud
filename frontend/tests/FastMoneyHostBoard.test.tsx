import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FastMoneyHostBoard } from '../src/components/FastMoneyHostBoard';
import { HostStateSnapshot, TimerTickPayload } from '../src/types';
import * as ttsModule from '../src/utils/tts';
import * as sfxModule from '../src/utils/soundEffects';

describe('Frontend Component Suite: FastMoneyHostBoard (US-07 & US-08)', () => {
  const readyHostSnapshot: HostStateSnapshot = {
    phase: 'P1_READY',
    activeQuestionNumber: 1,
    totalQuestions: 5,
    answeredCount: 0,
    remainingSeconds: 60,
    isTimerRunning: false,
    currentQuestionText: 'Name something you eat with a spoon',
    slots: [
      { slotNumber: 1, isFilled: false },
      { slotNumber: 2, isFilled: false },
      { slotNumber: 3, isFilled: false },
      { slotNumber: 4, isFilled: false },
      { slotNumber: 5, isFilled: false },
    ],
  };

  const playingHostSnapshot: HostStateSnapshot = {
    phase: 'P1_PLAYING',
    activeQuestionNumber: 2,
    totalQuestions: 5,
    answeredCount: 1,
    remainingSeconds: 45,
    isTimerRunning: true,
    currentQuestionText: 'Name something you find in the kitchen',
    slots: [
      { slotNumber: 1, isFilled: true },
      { slotNumber: 2, isFilled: false },
      { slotNumber: 3, isFilled: false },
      { slotNumber: 4, isFilled: false },
      { slotNumber: 5, isFilled: false },
    ],
  };

  const revealHostSnapshot: HostStateSnapshot = {
    phase: 'P1_REVEAL',
    activeQuestionNumber: null,
    totalQuestions: 5,
    answeredCount: 5,
    remainingSeconds: 0,
    isTimerRunning: false,
    currentQuestionText: null,
    totalScore: 35,
    activeRevealSlotNumber: 2,
    slots: [
      { slotNumber: 1, isFilled: true },
      { slotNumber: 2, isFilled: true },
      { slotNumber: 3, isFilled: true },
      { slotNumber: 4, isFilled: true },
      { slotNumber: 5, isFilled: true },
    ],
    revealSlots: [
      {
        slotNumber: 1,
        questionId: 'q-1',
        questionText: 'Name a breakfast food',
        rawAnswer: 'Eggs',
        pointsAwarded: 35,
        isAnswerRevealed: true,
        isPointsRevealed: true,
        isMatched: true,
      },
      {
        slotNumber: 2,
        questionId: 'q-2',
        questionText: 'Name something in the living room',
        rawAnswer: 'Banana',
        pointsAwarded: 0,
        isAnswerRevealed: true,
        isPointsRevealed: false,
        isMatched: false,
      },
      {
        slotNumber: 3,
        questionId: 'q-3',
        questionText: 'Name an animal in a zoo',
        rawAnswer: '',
        pointsAwarded: 0,
        isAnswerRevealed: false,
        isPointsRevealed: false,
        isMatched: false,
      },
      {
        slotNumber: 4,
        questionId: 'q-4',
        questionText: 'Name a day of the week',
        rawAnswer: '',
        pointsAwarded: 0,
        isAnswerRevealed: false,
        isPointsRevealed: false,
        isMatched: false,
      },
      {
        slotNumber: 5,
        questionId: 'q-5',
        questionText: 'Name a cold drink',
        rawAnswer: '',
        pointsAwarded: 0,
        isAnswerRevealed: false,
        isPointsRevealed: false,
        isMatched: false,
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('US-07 Regression: Concealed Slots during Speed Round', () => {
    it('renders 5 answer slots and strictly conceals submitted answers and point values', () => {
      render(
        <FastMoneyHostBoard
          snapshot={playingHostSnapshot}
          roomName="Family Feud Duel"
          roomCode="FEUD-9999"
          enableTTS={false}
        />
      );

      for (let i = 1; i <= 5; i++) {
        expect(screen.getByTestId(`fast-money-slot-${i}`)).toBeInTheDocument();
      }

      expect(screen.getByTestId('fast-money-slot-filled-1')).toBeInTheDocument();
      expect(screen.getByTestId('fast-money-slot-filled-1')).toHaveTextContent('••••••••••••••••••••');
      expect(screen.getByText('--')).toBeInTheDocument();
      expect(screen.queryByText('Coffee')).not.toBeInTheDocument();

      expect(screen.getByTestId('fast-money-slot-empty-2')).toBeInTheDocument();
      expect(screen.getByTestId('fast-money-slot-empty-2')).toHaveTextContent('— — — — — — — — — —');
    });

    it('highlights the currently active question slot on the host TV board', () => {
      render(
        <FastMoneyHostBoard
          snapshot={playingHostSnapshot}
          roomName="Family Feud Duel"
          roomCode="FEUD-9999"
          enableTTS={false}
        />
      );

      const activeSlot = screen.getByTestId('fast-money-slot-2');
      expect(activeSlot).toHaveClass('border-blue-400');
    });

    it('displays authoritative countdown timer synchronized with timerTick', () => {
      const tick: TimerTickPayload = {
        secondsRemaining: 24,
        endsAt: Date.now() + 24000,
      };

      render(
        <FastMoneyHostBoard
          snapshot={playingHostSnapshot}
          timerTick={tick}
          roomName="Family Feud Duel"
          enableTTS={false}
        />
      );

      const timerEl = screen.getByTestId('fast-money-host-timer');
      expect(timerEl).toHaveTextContent('24s');
    });

    it('displays urgent pulsing red style when timer is under 10 seconds', () => {
      const lowTick: TimerTickPayload = {
        secondsRemaining: 8,
        endsAt: Date.now() + 8000,
      };

      render(
        <FastMoneyHostBoard
          snapshot={playingHostSnapshot}
          timerTick={lowTick}
          roomName="Family Feud Duel"
          enableTTS={false}
        />
      );

      const timerEl = screen.getByTestId('fast-money-host-timer');
      expect(timerEl).toHaveClass('animate-pulse');
      expect(timerEl).toHaveClass('text-feud-red');
    });

    it('displays active question text and invokes speakQuestion during P1_PLAYING', () => {
      const speakSpy = vi.spyOn(ttsModule, 'speakQuestion').mockImplementation(() => {});

      render(
        <FastMoneyHostBoard
          snapshot={playingHostSnapshot}
          language="EN"
          roomName="Family Feud Duel"
          enableTTS={true}
        />
      );

      expect(screen.getByTestId('fast-money-host-question')).toHaveTextContent(
        'Name something you find in the kitchen'
      );
      expect(speakSpy).toHaveBeenCalledWith('Name something you find in the kitchen', 'EN');
    });

    it('displays waiting banner when phase is P1_READY', () => {
      render(
        <FastMoneyHostBoard
          snapshot={readyHostSnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
        />
      );

      expect(screen.getByTestId('fast-money-host-question')).toHaveTextContent(
        "Waiting for Player 1 to press 'I'm Ready!'..."
      );
      expect(screen.getByTestId('host-phase-badge')).toHaveTextContent('P1_READY');
    });
  });

  describe('US-08 Scenario 1: Step-by-Step Question Reveal & Audio Ding', () => {
    it('displays active reveal question in banner and speaks Question N via TTS', () => {
      const speakSpy = vi.spyOn(ttsModule, 'speakQuestion').mockImplementation(() => {});

      render(
        <FastMoneyHostBoard
          snapshot={revealHostSnapshot}
          language="EN"
          roomName="Family Feud Duel"
          enableTTS={true}
        />
      );

      // Slot 2 is active reveal slot
      expect(screen.getByTestId('fast-money-host-question')).toHaveTextContent(
        'Name something in the living room'
      );
      expect(speakSpy).toHaveBeenCalledWith(
        'Question 2: Name something in the living room',
        'EN'
      );
    });

    it('renders revealed answer text on slot 1 while slot 3 remains unrevealed', () => {
      render(
        <FastMoneyHostBoard
          snapshot={revealHostSnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
        />
      );

      // Slot 1 is revealed: shows "Eggs" and "35"
      expect(screen.getByTestId('revealed-answer-1')).toHaveTextContent('Eggs');
      expect(screen.getByTestId('points-val-1')).toHaveTextContent('35');

      // Slot 3 is unrevealed: shows placeholder dashes
      expect(screen.getByTestId('unrevealed-answer-3')).toBeInTheDocument();
    });

    it('plays playDing when an answer flips open', () => {
      const dingSpy = vi.spyOn(sfxModule, 'playDing').mockImplementation(() => {});

      // Initial state with unrevealed slot 1
      const initialSnapshot: HostStateSnapshot = {
        ...revealHostSnapshot,
        revealSlots: revealHostSnapshot.revealSlots!.map((s) => ({
          ...s,
          isAnswerRevealed: false,
          isPointsRevealed: false,
        })),
      };

      const { rerender } = render(
        <FastMoneyHostBoard
          snapshot={initialSnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
          enableSFX={true}
        />
      );

      expect(dingSpy).not.toHaveBeenCalled();

      // Rerender with slot 1 answer revealed
      rerender(
        <FastMoneyHostBoard
          snapshot={revealHostSnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
          enableSFX={true}
        />
      );

      expect(dingSpy).toHaveBeenCalled();
    });
  });

  describe('US-08 Scenario 2: Zero Points for Unmatched Answer & Buzzer Sound', () => {
    it('plays playBuzzerBlip when 0 points is revealed for unmatched answer', () => {
      const buzzerSpy = vi.spyOn(sfxModule, 'playBuzzerBlip').mockImplementation(() => {});

      // Slot 2 has isAnswerRevealed=true, isPointsRevealed=false
      const { rerender } = render(
        <FastMoneyHostBoard
          snapshot={revealHostSnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
          enableSFX={true}
        />
      );

      expect(buzzerSpy).not.toHaveBeenCalled();

      // Now reveal slot 2 points (0 pts)
      const afterSlot2Points: HostStateSnapshot = {
        ...revealHostSnapshot,
        revealSlots: revealHostSnapshot.revealSlots!.map((s) =>
          s.slotNumber === 2 ? { ...s, isPointsRevealed: true, pointsAwarded: 0 } : s
        ),
      };

      rerender(
        <FastMoneyHostBoard
          snapshot={afterSlot2Points}
          roomName="Family Feud Duel"
          enableTTS={false}
          enableSFX={true}
        />
      );

      expect(buzzerSpy).toHaveBeenCalled();
    });
  });

  describe('US-08 Scenario 3: Real-Time Cumulative Score Display', () => {
    it('displays cumulative total score badge instead of timer during reveal phase', () => {
      render(
        <FastMoneyHostBoard
          snapshot={revealHostSnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
        />
      );

      expect(screen.getByTestId('fast-money-total-score')).toBeInTheDocument();
      expect(screen.getByTestId('host-total-score-digits')).toHaveTextContent('35');
      expect(screen.queryByTestId('fast-money-host-timer')).not.toBeInTheDocument();
    });
  });

  describe('US-08 Scenario 4 & 5: Host Pacing Controls & Auto-Pacing Mode', () => {
    it('provides Reveal Points button when active slot answer is revealed but points are hidden', () => {
      const onRevealPointsMock = vi.fn();

      render(
        <FastMoneyHostBoard
          snapshot={revealHostSnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
          onRevealPoints={onRevealPointsMock}
        />
      );

      // Slot 2 answer is revealed, points are hidden -> Shows "Reveal Points #2"
      const revealPointsBtn = screen.getByTestId('host-reveal-points-btn');
      expect(revealPointsBtn).toHaveTextContent('Reveal Points #2');

      fireEvent.click(revealPointsBtn);
      expect(onRevealPointsMock).toHaveBeenCalledWith(2);
    });

    it('provides Reveal Answer button when active slot answer is hidden', () => {
      const onRevealAnswerMock = vi.fn();

      const snapshotSlot3Active: HostStateSnapshot = {
        ...revealHostSnapshot,
        activeRevealSlotNumber: 3,
        revealSlots: revealHostSnapshot.revealSlots!.map((s) =>
          s.slotNumber === 2 ? { ...s, isPointsRevealed: true } : s
        ),
      };

      render(
        <FastMoneyHostBoard
          snapshot={snapshotSlot3Active}
          roomName="Family Feud Duel"
          enableTTS={false}
          onRevealAnswer={onRevealAnswerMock}
        />
      );

      const revealAnswerBtn = screen.getByTestId('host-reveal-answer-btn');
      expect(revealAnswerBtn).toHaveTextContent('Reveal Answer #3');

      fireEvent.click(revealAnswerBtn);
      expect(onRevealAnswerMock).toHaveBeenCalledWith(3);
    });

    it('toggles audio on and off with audio toggle button', () => {
      render(
        <FastMoneyHostBoard
          snapshot={revealHostSnapshot}
          roomName="Family Feud Duel"
          enableTTS={true}
        />
      );

      const audioBtn = screen.getByTestId('host-audio-toggle');
      expect(audioBtn).toHaveAttribute('title', 'Mute Sounds & TTS');

      fireEvent.click(audioBtn);
      expect(audioBtn).toHaveAttribute('title', 'Unmute Sounds & TTS');
    });

    it('toggles auto-pacing mode and executes automatic step progression with 1.5s delay', () => {
      vi.useFakeTimers();
      const onRevealPointsMock = vi.fn();

      render(
        <FastMoneyHostBoard
          snapshot={revealHostSnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
          onRevealPoints={onRevealPointsMock}
        />
      );

      const autoPacingBtn = screen.getByTestId('host-auto-pacing-btn');
      expect(autoPacingBtn).toHaveTextContent('Manual Control');

      // Click to enable auto-pacing
      fireEvent.click(autoPacingBtn);
      expect(autoPacingBtn).toHaveTextContent('Auto Pacing');

      // Fast forward 1.5s suspense pause
      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(onRevealPointsMock).toHaveBeenCalledWith(2);
      vi.useRealTimers();
    });

    it('renders completion banner when all slots are revealed (P2_READY)', () => {
      const p2ReadySnapshot: HostStateSnapshot = {
        ...revealHostSnapshot,
        phase: 'P2_READY',
        activeRevealSlotNumber: null,
        totalScore: 120,
      };

      render(
        <FastMoneyHostBoard
          snapshot={p2ReadySnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
        />
      );

      expect(screen.getByTestId('host-reveal-complete-banner')).toBeInTheDocument();
      expect(screen.getByTestId('host-reveal-complete-banner')).toHaveTextContent('120 PTS');
    });

    it('renders Start Reveal button when phase is P1_FINISHED', () => {
      const onStartRevealMock = vi.fn();
      const finishedSnapshot: HostStateSnapshot = {
        ...readyHostSnapshot,
        phase: 'P1_FINISHED',
      };

      render(
        <FastMoneyHostBoard
          snapshot={finishedSnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
          onStartReveal={onStartRevealMock}
        />
      );

      const startRevealBtn = screen.getByTestId('host-start-reveal-btn');
      expect(startRevealBtn).toBeInTheDocument();

      fireEvent.click(startRevealBtn);
      expect(onStartRevealMock).toHaveBeenCalled();
    });
  });
  describe('US-09: Player 2 Speed Round & Duplicate Answer Alert on Host Board', () => {
    const p2PlayingSnapshot: HostStateSnapshot = {
      phase: 'P2_PLAYING',
      activeQuestionNumber: 1,
      totalQuestions: 5,
      answeredCount: 0,
      remainingSeconds: 75,
      isTimerRunning: true,
      currentQuestionText: 'Name a caffeinated beverage',
      totalScore: 120,
      p1TotalScore: 120,
      slots: [
        { slotNumber: 1, isFilled: false },
        { slotNumber: 2, isFilled: false },
        { slotNumber: 3, isFilled: false },
        { slotNumber: 4, isFilled: false },
        { slotNumber: 5, isFilled: false },
      ],
      p1Slots: [
        { slotNumber: 1, questionId: 'q-1', questionText: 'Q1', rawAnswer: 'Coffee', pointsAwarded: 40, isAnswerRevealed: true, isPointsRevealed: true, isMatched: true },
        { slotNumber: 2, questionId: 'q-2', questionText: 'Q2', rawAnswer: 'Sun', pointsAwarded: 50, isAnswerRevealed: true, isPointsRevealed: true, isMatched: true },
        { slotNumber: 3, questionId: 'q-3', questionText: 'Q3', rawAnswer: 'Lion', pointsAwarded: 30, isAnswerRevealed: true, isPointsRevealed: true, isMatched: true },
        { slotNumber: 4, questionId: 'q-4', questionText: 'Q4', rawAnswer: '', pointsAwarded: 0, isAnswerRevealed: true, isPointsRevealed: true, isMatched: false },
        { slotNumber: 5, questionId: 'q-5', questionText: 'Q5', rawAnswer: '', pointsAwarded: 0, isAnswerRevealed: true, isPointsRevealed: true, isMatched: false },
      ],
    };

    it('satisfies Scenario 1: initializes 75-second countdown, renders dual columns, and speaks Question 1 via TTS during P2_PLAYING', () => {
      const speakSpy = vi.spyOn(ttsModule, 'speakQuestion').mockImplementation(() => {});

      render(
        <FastMoneyHostBoard
          snapshot={p2PlayingSnapshot}
          language="EN"
          roomName="Family Feud Duel"
          enableTTS={true}
        />
      );

      // 75-second authoritative timer
      const timerEl = screen.getByTestId('fast-money-host-timer');
      expect(timerEl).toHaveTextContent('75s');

      // Question 1 text in banner and spoken via TTS
      expect(screen.getByTestId('fast-money-host-question')).toHaveTextContent(
        'Name a caffeinated beverage'
      );
      expect(speakSpy).toHaveBeenCalledWith('Name a caffeinated beverage', 'EN');

      // Dual columns: Player 1 revealed slots on left
      expect(screen.getByTestId('host-p1-slot-1')).toHaveTextContent('Coffee');
      expect(screen.getByTestId('host-p1-slot-1')).toHaveTextContent('40');

      // Player 2 concealed slots on right
      expect(screen.getByTestId('fast-money-slot-1')).toHaveClass('border-blue-400');
      expect(screen.getByTestId('fast-money-slot-empty-1')).toBeInTheDocument();
    });

    it('satisfies Scenario 2: displays duplicate alert banner, plays duplicate warning alarm, and speaks TTS', () => {
      const sfxSpy = vi.spyOn(sfxModule, 'playDuplicateWarning').mockImplementation(() => {});
      const ttsSpy = vi.spyOn(ttsModule, 'speakDuplicateAlert').mockImplementation(() => {});

      const duplicateWarning = {
        roomCode: 'FEUD-P201',
        rawInput: 'coffee',
        message: 'Answer already given by Player 1! Try again.',
        questionId: 'q-1',
        duplicateWithAnswer: 'Coffee',
        reason: 'EXACT_RAW' as const,
      };

      render(
        <FastMoneyHostBoard
          snapshot={p2PlayingSnapshot}
          duplicateWarning={duplicateWarning}
          language="EN"
          roomName="Family Feud Duel"
          enableTTS={true}
          enableSFX={true}
        />
      );

      // Warning visual banner
      const banner = screen.getByTestId('host-duplicate-warning-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Answer already given by Player 1! Try again.');
      expect(banner).toHaveTextContent('Player 1 already answered: "Coffee"');

      // Audio alarm and speech alert triggered
      expect(sfxSpy).toHaveBeenCalled();
      expect(ttsSpy).toHaveBeenCalledWith('EN');
    });

    it('updates Player 2 slots as answers are submitted during P2_PLAYING', () => {
      const advancedSnapshot: HostStateSnapshot = {
        ...p2PlayingSnapshot,
        activeQuestionNumber: 2,
        answeredCount: 1,
        slots: [
          { slotNumber: 1, isFilled: true },
          { slotNumber: 2, isFilled: false },
          { slotNumber: 3, isFilled: false },
          { slotNumber: 4, isFilled: false },
          { slotNumber: 5, isFilled: false },
        ],
      };

      render(
        <FastMoneyHostBoard
          snapshot={advancedSnapshot}
          language="EN"
          roomName="Family Feud Duel"
          enableTTS={false}
        />
      );

      // Slot 1 filled
      expect(screen.getByTestId('fast-money-slot-filled-1')).toBeInTheDocument();

      // Slot 2 active
      expect(screen.getByTestId('fast-money-slot-2')).toHaveClass('border-blue-400');
    });
  });
});