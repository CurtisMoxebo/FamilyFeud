import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import confetti from 'canvas-confetti';
import { FastMoneyHostBoard, TypewriterAnswer } from '../src/components/FastMoneyHostBoard';
import { HostStateSnapshot, TimerTickPayload } from '../src/types';
import * as ttsModule from '../src/utils/tts';
import * as sfxModule from '../src/utils/soundEffects';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

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

    it('satisfies US-26: displays dual column boards at all times (both Player 1 and Player 2 boards visible during P1 speed round)', () => {
      render(
        <FastMoneyHostBoard
          snapshot={playingHostSnapshot}
          roomName="Family Feud Duel"
          roomCode="FEUD-9999"
          enableTTS={false}
        />
      );

      // Player 1 header and slots
      expect(screen.getByText('Player 1')).toBeInTheDocument();
      expect(screen.getByTestId('fast-money-slot-1')).toBeInTheDocument();

      // Player 2 header and waiting slots are also visible simultaneously
      expect(screen.getByText('Player 2')).toBeInTheDocument();
      for (let i = 1; i <= 5; i++) {
        expect(screen.getByTestId(`host-p2-slot-${i}`)).toBeInTheDocument();
      }
    });

    it('satisfies US-26: displays actual player names across boards and banners instead of generic Player 1 and Player 2', () => {
      render(
        <FastMoneyHostBoard
          snapshot={playingHostSnapshot}
          roomName="Family Feud Duel"
          roomCode="FEUD-9999"
          player1Name="Alice"
          player2Name="Bob"
          enableTTS={false}
        />
      );

      // Displays player nicknames as column titles
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();

      // Displays player name in question banner pill
      expect(screen.getByText(/Alice • Question #2/i)).toBeInTheDocument();

      // Does not render generic "Player 1" or "Player 2" when names are provided
      expect(screen.queryByText('Player 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Player 2')).not.toBeInTheDocument();
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
        'EN',
        expect.any(Function)
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
      const dingSpy = vi.spyOn(sfxModule, 'playCorrectDing').mockImplementation(() => {});

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
          defaultAutoPacing={false}
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

    it('satisfies US-17 Scenario 4: toggles audio on and off, persists in localStorage, and calls cancelSpeech', () => {
      const cancelSpy = vi.spyOn(ttsModule, 'cancelSpeech');
      localStorage.clear();

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
      expect(localStorage.getItem('family_feud_tts_muted')).toBe('true');
      expect(cancelSpy).toHaveBeenCalled();

      fireEvent.click(audioBtn);
      expect(audioBtn).toHaveAttribute('title', 'Mute Sounds & TTS');
      expect(localStorage.getItem('family_feud_tts_muted')).toBe('false');
    });

    it('satisfies US-17 Scenario 4: initializes in muted state when saved in localStorage', () => {
      localStorage.setItem('family_feud_tts_muted', 'true');
      render(
        <FastMoneyHostBoard
          snapshot={revealHostSnapshot}
          roomName="Family Feud Duel"
          enableTTS={true}
        />
      );

      const audioBtn = screen.getByTestId('host-audio-toggle');
      expect(audioBtn).toHaveAttribute('title', 'Unmute Sounds & TTS');
      localStorage.clear();
    });

    it('satisfies US-17 Scenario 2: cancels pending utterance on rapid question transition or pass', () => {
      const cancelSpy = vi.spyOn(ttsModule, 'cancelSpeech');
      const speakSpy = vi.spyOn(ttsModule, 'speakQuestion').mockImplementation(() => {});

      const { rerender } = render(
        <FastMoneyHostBoard
          snapshot={{
            ...readyHostSnapshot,
            phase: 'P1_PLAYING',
            currentQuestionText: 'Question 1: Name a fruit',
          }}
          roomName="Family Feud Duel"
          enableTTS={true}
        />
      );

      expect(speakSpy).toHaveBeenCalledWith('Question 1: Name a fruit', 'EN');

      // Rapid transition: player passes or answers, next question appears immediately
      rerender(
        <FastMoneyHostBoard
          snapshot={{
            ...readyHostSnapshot,
            phase: 'P1_PLAYING',
            currentQuestionText: 'Question 2: Name an animal',
          }}
          roomName="Family Feud Duel"
          enableTTS={true}
        />
      );

      expect(cancelSpy).toHaveBeenCalled();
      expect(speakSpy).toHaveBeenCalledWith('Question 2: Name an animal', 'EN');
    });

    it('toggles auto-pacing mode and executes automatic step progression with 1.5s delay', () => {
      vi.useFakeTimers();
      const onRevealPointsMock = vi.fn();

      render(
        <FastMoneyHostBoard
          snapshot={revealHostSnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
          defaultAutoPacing={false}
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

    it('satisfies US-26 Scenario 6: resolves questionText from p1RevealSlots over stripped p1Slots and never speaks undefined via TTS', () => {
      const speakSpy = vi.spyOn(ttsModule, 'speakQuestion');

      // Emulate backend snapshot where p1Slots contains stripped indicator objects without questionText
      const backendSnapshotWithStrippedP1Slots: HostStateSnapshot = {
        ...revealHostSnapshot,
        phase: 'P1_REVEAL',
        activeRevealSlotNumber: 1,
        // Stripped indicator objects sent by backend:
        p1Slots: [
          { slotNumber: 1, isFilled: true } as any,
          { slotNumber: 2, isFilled: true } as any,
        ],
        // Fully populated reveal slots:
        p1RevealSlots: [
          {
            slotNumber: 1,
            questionId: 'q-1',
            questionText: 'Name something you find in a garage',
            rawAnswer: 'Toolbox',
            pointsAwarded: 35,
            isAnswerRevealed: false,
            isPointsRevealed: false,
            isMatched: true,
          },
        ],
      };

      render(
        <FastMoneyHostBoard
          snapshot={backendSnapshotWithStrippedP1Slots}
          roomName="Family Feud Duel"
          enableTTS={true}
          language="EN"
        />
      );

      expect(speakSpy).toHaveBeenCalledWith(
        'Question 1: Name something you find in a garage',
        'EN',
        expect.any(Function)
      );
      // Assert speech never contained the literal string 'undefined'
      const spokenTexts = speakSpy.mock.calls.map((call) => call[0]);
      expect(spokenTexts.some((text) => text.includes('undefined'))).toBe(false);
    });

    it('satisfies US-26 Scenario 7: defaults auto-pacing to true and initiates automated answer reveal without requiring clicks', () => {
      vi.useFakeTimers();
      const onRevealAnswerMock = vi.fn();

      const unrevealedSlotSnapshot: HostStateSnapshot = {
        ...revealHostSnapshot,
        phase: 'P1_REVEAL',
        activeRevealSlotNumber: 1,
        p1RevealSlots: [
          {
            slotNumber: 1,
            questionId: 'q-1',
            questionText: 'Name an animal',
            rawAnswer: 'Dog',
            pointsAwarded: 40,
            isAnswerRevealed: false,
            isPointsRevealed: false,
            isMatched: true,
          },
        ],
      };

      render(
        <FastMoneyHostBoard
          snapshot={unrevealedSlotSnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
          onRevealAnswer={onRevealAnswerMock}
        />
      );

      // Verify Auto Pacing is active by default
      const autoPacingBtn = screen.getByTestId('host-auto-pacing-btn');
      expect(autoPacingBtn).toHaveTextContent('Auto Pacing');

      // Fast-forward 1.2s -> answer should automatically reveal without any button clicks
      act(() => {
        vi.advanceTimersByTime(1200);
      });

      expect(onRevealAnswerMock).toHaveBeenCalledWith(1);
      vi.useRealTimers();
    });

    it('does not render green completion banner under the boards in P2_READY', () => {
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

      expect(screen.queryByTestId('host-reveal-complete-banner')).not.toBeInTheDocument();
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
      const sfxSpy = vi.spyOn(sfxModule, 'playDuplicateAlarm').mockImplementation(() => {});
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

  describe('US-10: Player 2 Reveal, Dynamic Victory & Replay Flow', () => {
    const p2FinishedSnapshot: HostStateSnapshot = {
      phase: 'P2_FINISHED',
      activeQuestionNumber: null,
      totalQuestions: 5,
      answeredCount: 5,
      remainingSeconds: 0,
      isTimerRunning: false,
      currentQuestionText: null,
      totalScore: 120,
      p1TotalScore: 120,
      p2TotalScore: 0,
      grandTotal: 120,
      slots: [
        { slotNumber: 1, isFilled: true },
        { slotNumber: 2, isFilled: true },
        { slotNumber: 3, isFilled: true },
        { slotNumber: 4, isFilled: true },
        { slotNumber: 5, isFilled: true },
      ],
      p1Slots: [
        { slotNumber: 1, questionId: 'q-1', questionText: 'Q1', rawAnswer: 'Eggs', pointsAwarded: 35, isAnswerRevealed: true, isPointsRevealed: true, isMatched: true },
        { slotNumber: 2, questionId: 'q-2', questionText: 'Q2', rawAnswer: 'Couch', pointsAwarded: 40, isAnswerRevealed: true, isPointsRevealed: true, isMatched: true },
        { slotNumber: 3, questionId: 'q-3', questionText: 'Q3', rawAnswer: 'Lion', pointsAwarded: 25, isAnswerRevealed: true, isPointsRevealed: true, isMatched: true },
        { slotNumber: 4, questionId: 'q-4', questionText: 'Q4', rawAnswer: 'Friday', pointsAwarded: 20, isAnswerRevealed: true, isPointsRevealed: true, isMatched: true },
        { slotNumber: 5, questionId: 'q-5', questionText: 'Q5', rawAnswer: '', pointsAwarded: 0, isAnswerRevealed: true, isPointsRevealed: true, isMatched: false },
      ],
      p2Slots: [
        { slotNumber: 1, questionId: 'q-1', questionText: 'Q1', rawAnswer: 'Pancakes', pointsAwarded: 25, isAnswerRevealed: false, isPointsRevealed: false, isMatched: false },
        { slotNumber: 2, questionId: 'q-2', questionText: 'Q2', rawAnswer: 'Chair', pointsAwarded: 30, isAnswerRevealed: false, isPointsRevealed: false, isMatched: false },
        { slotNumber: 3, questionId: 'q-3', questionText: 'Q3', rawAnswer: 'Tiger', pointsAwarded: 20, isAnswerRevealed: false, isPointsRevealed: false, isMatched: false },
        { slotNumber: 4, questionId: 'q-4', questionText: 'Q4', rawAnswer: 'Saturday', pointsAwarded: 25, isAnswerRevealed: false, isPointsRevealed: false, isMatched: false },
        { slotNumber: 5, questionId: 'q-5', questionText: 'Q5', rawAnswer: 'Soda', pointsAwarded: 20, isAnswerRevealed: false, isPointsRevealed: false, isMatched: false },
      ],
    };

    it('renders "Start Player 2 Reveal" button on P2_FINISHED and handles click', () => {
      const startP2Spy = vi.fn();

      render(
        <FastMoneyHostBoard
          snapshot={p2FinishedSnapshot}
          language="EN"
          roomName="Family Feud Duel"
          onStartP2Reveal={startP2Spy}
        />
      );

      const startBtn = screen.getByTestId('host-start-p2-reveal-btn');
      expect(startBtn).toBeInTheDocument();
      expect(startBtn).toHaveTextContent(/start player 2 reveal/i);

      fireEvent.click(startBtn);
      expect(startP2Spy).toHaveBeenCalledTimes(1);
    });

    it('automatically triggers onStartP2Reveal when Player 2 finishes their turn (P2_FINISHED)', () => {
      vi.useFakeTimers();
      const startP2Spy = vi.fn();

      render(
        <FastMoneyHostBoard
          snapshot={p2FinishedSnapshot}
          language="EN"
          roomName="Family Feud Duel"
          onStartP2Reveal={startP2Spy}
        />
      );

      expect(startP2Spy).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(startP2Spy).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('satisfies Scenario 1: renders dual columns in P2_REVEAL, speaks question via TTS, and reveals answers and points', () => {
      const speakSpy = vi.spyOn(ttsModule, 'speakQuestion').mockImplementation(() => {});
      const onRevealAnswerSpy = vi.fn();
      const onRevealPointsSpy = vi.fn();

      const p2RevealSnapshot: HostStateSnapshot = {
        ...p2FinishedSnapshot,
        phase: 'P2_REVEAL',
        activeRevealSlotNumber: 1,
      };

      const { rerender } = render(
        <FastMoneyHostBoard
          snapshot={p2RevealSnapshot}
          language="EN"
          roomName="Family Feud Duel"
          enableTTS={true}
          enableSFX={true}
          onRevealP2Answer={onRevealAnswerSpy}
          onRevealP2Points={onRevealPointsSpy}
        />
      );

      // Question spoken via TTS
      expect(speakSpy).toHaveBeenCalledWith('Question 1: Q1', 'EN', expect.any(Function));

      // Reveal answer button visible
      const revealAnswerBtn = screen.getByTestId('host-reveal-p2-answer-btn');
      expect(revealAnswerBtn).toBeInTheDocument();
      expect(revealAnswerBtn).toHaveTextContent(/reveal answer #1/i);

      fireEvent.click(revealAnswerBtn);
      expect(onRevealAnswerSpy).toHaveBeenCalledWith(1);

      // Rerender with Slot 1 answer revealed
      const slot1AnswerRevealed: HostStateSnapshot = {
        ...p2RevealSnapshot,
        p2Slots: [
          { ...p2FinishedSnapshot.p2Slots![0], isAnswerRevealed: true },
          ...p2FinishedSnapshot.p2Slots!.slice(1),
        ],
      };

      rerender(
        <FastMoneyHostBoard
          snapshot={slot1AnswerRevealed}
          language="EN"
          roomName="Family Feud Duel"
          enableTTS={true}
          enableSFX={true}
          onRevealP2Answer={onRevealAnswerSpy}
          onRevealP2Points={onRevealPointsSpy}
        />
      );

      // Answer is now displayed
      expect(screen.getByTestId('revealed-answer-1')).toHaveTextContent('Pancakes');

      // Reveal points button visible
      const revealPointsBtn = screen.getByTestId('host-reveal-p2-points-btn');
      expect(revealPointsBtn).toBeInTheDocument();
      expect(revealPointsBtn).toHaveTextContent(/reveal points #1/i);

      fireEvent.click(revealPointsBtn);
      expect(onRevealPointsSpy).toHaveBeenCalledWith(1);
    });

    it('satisfies Scenario 1: auto-pacing triggers automated answer reveal and 1.5s suspense pause', () => {
      vi.useFakeTimers();
      const onRevealAnswerSpy = vi.fn();
      const onRevealPointsSpy = vi.fn();

      const p2RevealSnapshot: HostStateSnapshot = {
        ...p2FinishedSnapshot,
        phase: 'P2_REVEAL',
        activeRevealSlotNumber: 1,
      };

      const { rerender } = render(
        <FastMoneyHostBoard
          snapshot={p2RevealSnapshot}
          language="EN"
          roomName="Family Feud Duel"
          enableTTS={false}
          enableSFX={false}
          defaultAutoPacing={false}
          onRevealP2Answer={onRevealAnswerSpy}
          onRevealP2Points={onRevealPointsSpy}
        />
      );

      // Turn on Auto-Pacing
      const autoPacingBtn = screen.getByTestId('host-p2-auto-pacing-btn');
      fireEvent.click(autoPacingBtn);

      // Fast forward 1.2s -> reveals answer
      act(() => {
        vi.advanceTimersByTime(1200);
      });
      expect(onRevealAnswerSpy).toHaveBeenCalledWith(1);

      // Update to answer revealed (state remains auto-pacing: true)
      rerender(
        <FastMoneyHostBoard
          snapshot={{
            ...p2RevealSnapshot,
            p2Slots: [
              { ...p2FinishedSnapshot.p2Slots![0], isAnswerRevealed: true },
              ...p2FinishedSnapshot.p2Slots!.slice(1),
            ],
          }}
          language="EN"
          roomName="Family Feud Duel"
          enableTTS={false}
          enableSFX={false}
          onRevealP2Answer={onRevealAnswerSpy}
          onRevealP2Points={onRevealPointsSpy}
        />
      );

      // Fast forward 1.5s (suspense pause) -> reveals points
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(onRevealPointsSpy).toHaveBeenCalledWith(1);

      vi.useRealTimers();
    });

    it('satisfies Scenario 2: triggers immediate victory celebration, fanfare, confetti, and speech at >= 200 points', () => {
      const fanfareSpy = vi.spyOn(sfxModule, 'playVictoryFanfare').mockImplementation(() => {});
      const victoryTtsSpy = vi.spyOn(ttsModule, 'speakVictory').mockImplementation(() => {});

      const victorySnapshot: HostStateSnapshot = {
        ...p2FinishedSnapshot,
        phase: 'GAME_OVER',
        isVictory: true,
        p1TotalScore: 140,
        p2TotalScore: 65,
        grandTotal: 205,
      };

      render(
        <FastMoneyHostBoard
          snapshot={victorySnapshot}
          language="EN"
          roomName="Family Feud Duel"
          enableTTS={true}
          enableSFX={true}
          onReplay={vi.fn()}
        />
      );

      // Victory banner
      const victoryBanner = screen.getByTestId('host-victory-banner');
      expect(victoryBanner).toBeInTheDocument();
      expect(victoryBanner).toHaveTextContent(/200 POINTS! YOU WON FAST MONEY!/i);

      // Fanfare & TTS
      expect(fanfareSpy).toHaveBeenCalled();
      expect(victoryTtsSpy).toHaveBeenCalledWith('EN');

      // Confetti burst
      expect(confetti).toHaveBeenCalled();

      // Play Again button rendered
      expect(screen.getByTestId('host-replay-btn')).toBeInTheDocument();
    });

    it('satisfies Scenario 3: triggers defeat summary and defeat audio when under 200 points', () => {
      const defeatSpy = vi.spyOn(sfxModule, 'playDefeatSound').mockImplementation(() => {});
      const defeatTtsSpy = vi.spyOn(ttsModule, 'speakDefeat').mockImplementation(() => {});

      const defeatSnapshot: HostStateSnapshot = {
        ...p2FinishedSnapshot,
        phase: 'GAME_OVER',
        isVictory: false,
        p1TotalScore: 90,
        p2TotalScore: 85,
        grandTotal: 175,
      };

      render(
        <FastMoneyHostBoard
          snapshot={defeatSnapshot}
          language="EN"
          roomName="Family Feud Duel"
          enableTTS={true}
          enableSFX={true}
          onReplay={vi.fn()}
        />
      );

      // Defeat banner
      const defeatBanner = screen.getByTestId('host-defeat-banner');
      expect(defeatBanner).toBeInTheDocument();
      expect(defeatBanner).toHaveTextContent(/GAME OVER/i);
      expect(defeatBanner).toHaveTextContent(/175 \/ 200/i);

      // Audio & Speech
      expect(defeatSpy).toHaveBeenCalled();
      expect(defeatTtsSpy).toHaveBeenCalledWith('EN', 175);

      // Play Again button rendered
      expect(screen.getByTestId('host-replay-btn')).toBeInTheDocument();
    });

    it('satisfies Scenario 4: clicking Play Again triggers onReplay and displays loading state', () => {
      const replaySpy = vi.fn();

      const gameOverSnapshot: HostStateSnapshot = {
        ...p2FinishedSnapshot,
        phase: 'GAME_OVER',
        isVictory: true,
        grandTotal: 200,
      };

      render(
        <FastMoneyHostBoard
          snapshot={gameOverSnapshot}
          language="EN"
          roomName="Family Feud Duel"
          onReplay={replaySpy}
        />
      );

      const replayBtn = screen.getByTestId('host-replay-btn');
      expect(replayBtn).toBeInTheDocument();
      expect(replayBtn).toHaveTextContent(/play again/i);

      fireEvent.click(replayBtn);
      expect(replaySpy).toHaveBeenCalledTimes(1);

      // Enters loading / replaying state
      expect(screen.getByText(/starting new match\.\.\./i)).toBeInTheDocument();
      expect(replayBtn).toBeDisabled();
    });
  });

  describe('US-17: Multilingual Automated Host Speech (TTS) Full Scenario Suite', () => {
    let mockSpeak: any;
    let mockCancel: any;
    let mockGetVoices: any;

    beforeEach(() => {
      localStorage.clear();
      mockSpeak = vi.fn();
      mockCancel = vi.fn();

      if (typeof (globalThis as any).SpeechSynthesisUtterance === 'undefined') {
        (globalThis as any).SpeechSynthesisUtterance = class {
          text: string;
          lang: string = 'en-US';
          rate: number = 1.0;
          pitch: number = 1.0;
          voice: any = null;
          onend: any = null;
          onerror: any = null;
          constructor(text: string) {
            this.text = text;
          }
        };
      }
      mockGetVoices = vi.fn().mockReturnValue([
        { name: 'Google Français', lang: 'fr-FR' },
        { name: 'Google Español', lang: 'es-ES' },
        { name: 'Google US English', lang: 'en-US' },
      ]);

      Object.defineProperty(window, 'speechSynthesis', {
        value: {
          speak: mockSpeak,
          cancel: mockCancel,
          getVoices: mockGetVoices,
        },
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it('satisfies Scenario 1: vocalizes Question 1 in French with rate 1.05 and pitch 1.0', () => {
      render(
        <FastMoneyHostBoard
          snapshot={{
            ...readyHostSnapshot,
            phase: 'P1_PLAYING',
            currentQuestionText: "Nommez quelque chose que l'on trouve dans un salon",
          }}
          language="FR"
          roomName="Soirée Famille"
          enableTTS={true}
        />
      );

      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe("Nommez quelque chose que l'on trouve dans un salon");
      expect(utterance.lang).toBe('fr-FR');
      expect(utterance.rate).toBe(1.05);
      expect(utterance.pitch).toBe(1.0);
    });

    it('satisfies Scenario 1 (Spanish): vocalizes Question 1 in Spanish with Spanish voice', () => {
      render(
        <FastMoneyHostBoard
          snapshot={{
            ...readyHostSnapshot,
            phase: 'P1_PLAYING',
            currentQuestionText: 'Mencione algo que encuentra en la sala',
          }}
          language="ES"
          roomName="Noche Familiar"
          enableTTS={true}
        />
      );

      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Mencione algo que encuentra en la sala');
      expect(utterance.lang).toBe('es-ES');
      expect(utterance.rate).toBe(1.05);
      expect(utterance.pitch).toBe(1.0);
    });

    it('satisfies Scenario 2: cancels pending utterance when player passes or submits an answer quickly', () => {
      const { rerender } = render(
        <FastMoneyHostBoard
          snapshot={{
            ...readyHostSnapshot,
            phase: 'P1_PLAYING',
            currentQuestionText: 'Question 1: Name a fruit',
          }}
          language="EN"
          roomName="Fast Money"
          enableTTS={true}
        />
      );

      expect(mockCancel).toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledTimes(1);

      // Rapid pass / answer submission
      rerender(
        <FastMoneyHostBoard
          snapshot={{
            ...readyHostSnapshot,
            phase: 'P1_PLAYING',
            currentQuestionText: 'Question 2: Name an animal',
          }}
          language="EN"
          roomName="Fast Money"
          enableTTS={true}
        />
      );

      expect(mockCancel).toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledTimes(2);
      expect(mockSpeak.mock.calls[1][0].text).toBe('Question 2: Name an animal');
    });

    it('satisfies Scenario 3: degrades gracefully when window.speechSynthesis is not supported', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // @ts-ignore
      delete window.speechSynthesis;

      expect(() => {
        render(
          <FastMoneyHostBoard
            snapshot={{
              ...readyHostSnapshot,
              phase: 'P1_PLAYING',
              currentQuestionText: 'Test unsupported question',
            }}
            language="EN"
            roomName="Fast Money"
            enableTTS={true}
          />
        );
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HOST_TTS:WARN] Speech synthesis is not supported in this browser.')
      );
    });

    it('satisfies Scenario 4: mute button mutes TTS immediately and saves preference in localStorage', () => {
      render(
        <FastMoneyHostBoard
          snapshot={{
            ...readyHostSnapshot,
            phase: 'P1_PLAYING',
            currentQuestionText: 'Question to be muted',
          }}
          language="EN"
          roomName="Fast Money"
          enableTTS={true}
        />
      );

      const muteBtn = screen.getByTestId('host-audio-toggle');
      expect(muteBtn).toHaveAttribute('title', 'Mute Sounds & TTS');

      // Click to mute
      fireEvent.click(muteBtn);
      expect(localStorage.getItem('family_feud_tts_muted')).toBe('true');
      expect(mockCancel).toHaveBeenCalled();
      expect(muteBtn).toHaveAttribute('title', 'Unmute Sounds & TTS');

      // Subsequent question should not speak
      mockSpeak.mockClear();
      render(
        <FastMoneyHostBoard
          snapshot={{
            ...readyHostSnapshot,
            phase: 'P1_PLAYING',
            currentQuestionText: 'Should not speak while muted',
          }}
          language="EN"
          roomName="Fast Money"
          enableTTS={true}
        />
      );

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('displays repeat question alert banner and re-speaks question via TTS when contestant requests repeat', () => {
      mockSpeak.mockClear();

      render(
        <FastMoneyHostBoard
          snapshot={playingHostSnapshot}
          language="EN"
          roomName="Fast Money"
          player1Name="Alice"
          player2Name="Bob"
          enableTTS={true}
          repeatQuestionAlert={{
            roomCode: 'FEUD-TEST',
            playerId: 'player-1',
            questionId: 'q-2',
            timestamp: Date.now(),
          }}
        />
      );

      expect(screen.getByTestId('host-repeat-question-banner')).toBeInTheDocument();
      expect(screen.getByText(/Alice asked to repeat the question!/i)).toBeInTheDocument();
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Name something you find in the kitchen' })
      );
    });
  });

  describe('US-26: Fast Money Reveal Choreography & Typewriter Sequence', () => {
    it('TypewriterAnswer reveals text one letter at a time at <= 100ms interval', () => {
      vi.useFakeTimers();

      render(
        <TypewriterAnswer
          text="Pancakes"
          animate={true}
          speedMs={50}
          testId="test-typewriter"
        />
      );

      const el = screen.getByTestId('test-typewriter');
      // Initially, visible count is 0
      expect(el).toHaveAttribute('data-revealed-length', '0');

      // Advance by 50ms -> 1 char ("P")
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(el).toHaveAttribute('data-revealed-length', '1');

      // Advance by 150ms -> total 200ms -> 4 chars ("Panc")
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(el).toHaveAttribute('data-revealed-length', '4');

      // Advance by 200ms -> total 400ms -> full 8 chars ("Pancakes")
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(el).toHaveAttribute('data-revealed-length', '8');
      expect(el).toHaveTextContent('Pancakes');

      vi.useRealTimers();
    });

    it('executes full 5-step reveal sequence: Read question -> "You said" -> Read answer + reveal -> "Survey said" -> Reveal points', () => {
      const mockSpeak = vi.fn();
      const mockCancel = vi.fn();
      Object.defineProperty(window, 'speechSynthesis', {
        value: {
          speak: mockSpeak,
          cancel: mockCancel,
          getVoices: vi.fn().mockReturnValue([]),
        },
        writable: true,
        configurable: true,
      });

      const onRevealAnswerSpy = vi.fn();
      const onRevealPointsSpy = vi.fn();

      const revealSnapshot: HostStateSnapshot = {
        ...readyHostSnapshot,
        phase: 'P1_REVEAL',
        activeRevealSlotNumber: 1,
        p1Slots: [
          {
            slotNumber: 1,
            questionId: 'q-1',
            questionText: 'Name a yellow fruit',
            rawAnswer: 'Banana',
            pointsAwarded: 42,
            isAnswerRevealed: false,
            isPointsRevealed: false,
            isMatched: true,
          },
        ],
        p1RevealSlots: [
          {
            slotNumber: 1,
            questionId: 'q-1',
            questionText: 'Name a yellow fruit',
            rawAnswer: 'Banana',
            pointsAwarded: 42,
            isAnswerRevealed: false,
            isPointsRevealed: false,
            isMatched: true,
          },
        ],
      };

      const { rerender } = render(
        <FastMoneyHostBoard
          snapshot={revealSnapshot}
          language="EN"
          roomName="Fast Money Feud"
          player1Name="Alice"
          player2Name="Bob"
          enableTTS={true}
          enableSFX={true}
          defaultAutoPacing={false}
          onRevealAnswer={onRevealAnswerSpy}
          onRevealPoints={onRevealPointsSpy}
        />
      );

      // Step 1: Host reads question
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Question 1: Name a yellow fruit' })
      );

      // Step 2 & 3: Host triggers Reveal Answer -> says "You said", reads answer, triggers onRevealAnswer
      const revealAnswerBtn = screen.getByTestId('host-reveal-answer-btn');
      fireEvent.click(revealAnswerBtn);

      expect(onRevealAnswerSpy).toHaveBeenCalledWith(1);
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'You said' })
      );

      // Simulate completion of "You said" which triggers reading the answer "Banana"
      const youSaidUtterance = mockSpeak.mock.calls.find(
        (call) => call[0].text === 'You said'
      )?.[0];
      expect(youSaidUtterance).toBeDefined();
      act(() => {
        youSaidUtterance.onend?.();
      });

      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Banana' })
      );

      // Rerender with answer revealed
      rerender(
        <FastMoneyHostBoard
          snapshot={{
            ...revealSnapshot,
            p1Slots: [
              {
                ...revealSnapshot.p1Slots![0],
                isAnswerRevealed: true,
              },
            ],
            p1RevealSlots: [
              {
                ...revealSnapshot.p1RevealSlots![0],
                isAnswerRevealed: true,
              },
            ],
          }}
          language="EN"
          roomName="Fast Money Feud"
          player1Name="Alice"
          player2Name="Bob"
          enableTTS={true}
          enableSFX={true}
          defaultAutoPacing={false}
          onRevealAnswer={onRevealAnswerSpy}
          onRevealPoints={onRevealPointsSpy}
        />
      );

      // Step 4 & 5: Host triggers Reveal Points -> says "Survey said", triggers onRevealPoints
      const revealPointsBtn = screen.getByTestId('host-reveal-points-btn');
      fireEvent.click(revealPointsBtn);

      expect(onRevealPointsSpy).toHaveBeenCalledWith(1);
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Survey said' })
      );
    });

    it('vocalizes French phrases for reveal sequence ("Vous avez dit", "Le sondage dit")', () => {
      const mockSpeak = vi.fn();
      const mockCancel = vi.fn();
      Object.defineProperty(window, 'speechSynthesis', {
        value: {
          speak: mockSpeak,
          cancel: mockCancel,
          getVoices: vi.fn().mockReturnValue([]),
        },
        writable: true,
        configurable: true,
      });

      const onRevealAnswerSpy = vi.fn();
      const onRevealPointsSpy = vi.fn();

      const frenchSnapshot: HostStateSnapshot = {
        ...readyHostSnapshot,
        phase: 'P1_REVEAL',
        activeRevealSlotNumber: 1,
        p1Slots: [
          {
            slotNumber: 1,
            questionId: 'q-1',
            questionText: 'Nommez un fruit jaune',
            rawAnswer: 'Banane',
            pointsAwarded: 40,
            isAnswerRevealed: false,
            isPointsRevealed: false,
            isMatched: true,
          },
        ],
        p1RevealSlots: [
          {
            slotNumber: 1,
            questionId: 'q-1',
            questionText: 'Nommez un fruit jaune',
            rawAnswer: 'Banane',
            pointsAwarded: 40,
            isAnswerRevealed: false,
            isPointsRevealed: false,
            isMatched: true,
          },
        ],
      };

      const { rerender } = render(
        <FastMoneyHostBoard
          snapshot={frenchSnapshot}
          language="FR"
          roomName="Une Famille en Or"
          enableTTS={true}
          enableSFX={true}
          defaultAutoPacing={false}
          onRevealAnswer={onRevealAnswerSpy}
          onRevealPoints={onRevealPointsSpy}
        />
      );

      const revealAnswerBtn = screen.getByTestId('host-reveal-answer-btn');
      fireEvent.click(revealAnswerBtn);

      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Vous avez dit' })
      );

      // Simulate completion of "Vous avez dit"
      const youSaidUtterance = mockSpeak.mock.calls.find(
        (call) => call[0].text === 'Vous avez dit'
      )?.[0];
      act(() => {
        youSaidUtterance.onend?.();
      });

      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Banane' })
      );

      rerender(
        <FastMoneyHostBoard
          snapshot={{
            ...frenchSnapshot,
            p1Slots: [
              { ...frenchSnapshot.p1Slots![0], isAnswerRevealed: true },
            ],
            p1RevealSlots: [
              { ...frenchSnapshot.p1RevealSlots![0], isAnswerRevealed: true },
            ],
          }}
          language="FR"
          roomName="Une Famille en Or"
          enableTTS={true}
          enableSFX={true}
          defaultAutoPacing={false}
          onRevealAnswer={onRevealAnswerSpy}
          onRevealPoints={onRevealPointsSpy}
        />
      );

      const revealPointsBtn = screen.getByTestId('host-reveal-points-btn');
      fireEvent.click(revealPointsBtn);

      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Le sondage dit' })
      );
    });

    it('satisfies user requirement: choreographs reveal sequence via TTS event completion (Read question -> "You said" -> Reveal & Read answer -> "Survey said" -> Reveal points)', () => {
      const mockSpeak = vi.fn();
      const mockCancel = vi.fn();
      Object.defineProperty(window, 'speechSynthesis', {
        value: {
          speak: mockSpeak,
          cancel: mockCancel,
          getVoices: vi.fn().mockReturnValue([]),
        },
        writable: true,
        configurable: true,
      });

      const onRevealAnswerSpy = vi.fn();
      const onRevealPointsSpy = vi.fn();

      const revealSnapshot: HostStateSnapshot = {
        ...readyHostSnapshot,
        phase: 'P1_REVEAL',
        activeRevealSlotNumber: 1,
        p1Slots: [
          {
            slotNumber: 1,
            questionId: 'q-1',
            questionText: 'Name something you find in the refrigerator',
            rawAnswer: 'Milk',
            pointsAwarded: 45,
            isAnswerRevealed: false,
            isPointsRevealed: false,
            isMatched: true,
          },
        ],
        p1RevealSlots: [
          {
            slotNumber: 1,
            questionId: 'q-1',
            questionText: 'Name something you find in the refrigerator',
            rawAnswer: 'Milk',
            pointsAwarded: 45,
            isAnswerRevealed: false,
            isPointsRevealed: false,
            isMatched: true,
          },
        ],
      };

      render(
        <FastMoneyHostBoard
          snapshot={revealSnapshot}
          language="EN"
          roomName="Fast Money Feud"
          enableTTS={true}
          enableSFX={true}
          defaultAutoPacing={true}
          onRevealAnswer={onRevealAnswerSpy}
          onRevealPoints={onRevealPointsSpy}
        />
      );

      // Step 1: Host reads question first
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Question 1: Name something you find in the refrigerator' })
      );
      // Answer must NOT be revealed yet (waits for question TTS completion)
      expect(onRevealAnswerSpy).not.toHaveBeenCalled();

      // Simulate Question TTS finishing
      const questionUtterance = mockSpeak.mock.calls.find((call) =>
        call[0].text?.includes('Question 1: Name something you find in the refrigerator')
      )?.[0];
      expect(questionUtterance).toBeDefined();
      act(() => {
        questionUtterance.onend?.();
      });

      // Step 2: Host says "You said"
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'You said' })
      );
      // Answer must still NOT be revealed yet (waits for "You said" completion)
      expect(onRevealAnswerSpy).not.toHaveBeenCalled();

      // Simulate "You said" TTS finishing
      const youSaidUtterance = mockSpeak.mock.calls.find(
        (call) => call[0].text === 'You said'
      )?.[0];
      expect(youSaidUtterance).toBeDefined();
      act(() => {
        youSaidUtterance.onend?.();
      });

      // Step 3: Reveals answer in board AND reads answer out loud simultaneously
      expect(onRevealAnswerSpy).toHaveBeenCalledWith(1);
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Milk' })
      );
      // Points must NOT be revealed yet
      expect(onRevealPointsSpy).not.toHaveBeenCalled();

      // Simulate Answer TTS finishing
      const answerUtterance = mockSpeak.mock.calls.find(
        (call) => call[0].text === 'Milk'
      )?.[0];
      expect(answerUtterance).toBeDefined();
      act(() => {
        answerUtterance.onend?.();
      });

      // Step 4: Host says "Survey said"
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Survey said' })
      );
      // Points must still wait for "Survey said" completion
      expect(onRevealPointsSpy).not.toHaveBeenCalled();

      // Simulate "Survey said" TTS finishing
      const surveySaidUtterance = mockSpeak.mock.calls.find(
        (call) => call[0].text === 'Survey said'
      )?.[0];
      expect(surveySaidUtterance).toBeDefined();
      act(() => {
        surveySaidUtterance.onend?.();
      });

      // Step 5: Points are revealed on the board
      expect(onRevealPointsSpy).toHaveBeenCalledWith(1);
    });

    it('speaks actual player answer and never "no answer" when server snapshot resolves rawAnswer asynchronously', () => {
      const mockSpeak = vi.fn();
      const mockCancel = vi.fn();
      Object.defineProperty(window, 'speechSynthesis', {
        value: {
          speak: mockSpeak,
          cancel: mockCancel,
          getVoices: vi.fn().mockReturnValue([]),
        },
        writable: true,
        configurable: true,
      });

      const onRevealAnswerSpy = vi.fn();

      // Initially sanitized by server: rawAnswer is empty '' and isAnswerRevealed is false
      const initialSanitizedSnapshot: HostStateSnapshot = {
        ...readyHostSnapshot,
        phase: 'P1_REVEAL',
        activeRevealSlotNumber: 1,
        p1Slots: [
          {
            slotNumber: 1,
            questionId: 'q-1',
            questionText: 'Name something you eat with maple syrup',
            rawAnswer: '', // Sanitized
            pointsAwarded: 0,
            isAnswerRevealed: false,
            isPointsRevealed: false,
            isMatched: false,
          },
        ],
        p1RevealSlots: [
          {
            slotNumber: 1,
            questionId: 'q-1',
            questionText: 'Name something you eat with maple syrup',
            rawAnswer: '', // Sanitized
            pointsAwarded: 0,
            isAnswerRevealed: false,
            isPointsRevealed: false,
            isMatched: false,
          },
        ],
      };

      const { rerender } = render(
        <FastMoneyHostBoard
          snapshot={initialSanitizedSnapshot}
          language="EN"
          roomName="Fast Money Feud"
          enableTTS={true}
          enableSFX={true}
          defaultAutoPacing={false}
          onRevealAnswer={onRevealAnswerSpy}
        />
      );

      // Trigger reveal answer button
      const revealAnswerBtn = screen.getByTestId('host-reveal-answer-btn');
      fireEvent.click(revealAnswerBtn);

      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'You said' })
      );

      // Server responds with revealed answer "Pancakes" before or while "You said" finishes
      rerender(
        <FastMoneyHostBoard
          snapshot={{
            ...initialSanitizedSnapshot,
            p1Slots: [
              {
                ...initialSanitizedSnapshot.p1Slots![0],
                rawAnswer: 'Pancakes',
                isAnswerRevealed: true,
              },
            ],
            p1RevealSlots: [
              {
                ...initialSanitizedSnapshot.p1RevealSlots![0],
                rawAnswer: 'Pancakes',
                isAnswerRevealed: true,
              },
            ],
          }}
          language="EN"
          roomName="Fast Money Feud"
          enableTTS={true}
          enableSFX={true}
          defaultAutoPacing={false}
          onRevealAnswer={onRevealAnswerSpy}
        />
      );

      // Simulate "You said" finishing
      const youSaidUtterance = mockSpeak.mock.calls.find(
        (call) => call[0].text === 'You said'
      )?.[0];
      expect(youSaidUtterance).toBeDefined();
      act(() => {
        youSaidUtterance.onend?.();
      });

      // Must speak the actual revealed player answer ("Pancakes"), NEVER "No Answer"
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Pancakes' })
      );
      const spokenTexts = mockSpeak.mock.calls.map((call) => call[0].text);
      expect(spokenTexts).not.toContain('No Answer');
    });
  });
});