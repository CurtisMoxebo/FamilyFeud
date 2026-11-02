import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FastMoneyHostBoard } from '../src/components/FastMoneyHostBoard';
import { HostStateSnapshot, TimerTickPayload } from '../src/types';
import * as ttsModule from '../src/utils/tts';

describe('Frontend Component Suite: FastMoneyHostBoard (US-07 & DoD)', () => {
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

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('DoD Requirement: Answers remain hidden on the Host screen during the 60 seconds', () => {
    it('renders 5 answer slots and strictly conceals submitted answers and point values', () => {
      render(
        <FastMoneyHostBoard
          snapshot={playingHostSnapshot}
          roomName="Family Feud Duel"
          roomCode="FEUD-9999"
          enableTTS={false}
        />
      );

      // Verify all 5 slots are rendered
      for (let i = 1; i <= 5; i++) {
        expect(screen.getByTestId(`fast-money-slot-${i}`)).toBeInTheDocument();
      }

      // Slot 1 is filled: shows concealed tile '••••••••••••••••••••' and covered points '--'
      expect(screen.getByTestId('fast-money-slot-filled-1')).toBeInTheDocument();
      expect(screen.getByTestId('fast-money-slot-filled-1')).toHaveTextContent('••••••••••••••••••••');
      expect(screen.getByText('--')).toBeInTheDocument();

      // Ensure no raw contestant answers (e.g. 'Coffee', 'Soup') are rendered on the host TV screen
      expect(screen.queryByText('Coffee')).not.toBeInTheDocument();
      expect(screen.queryByText('Soup')).not.toBeInTheDocument();

      // Slot 2 is empty/unfilled: shows empty placeholder dashes
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
      expect(activeSlot).toHaveClass('border-feud-gold');
    });
  });

  describe('Scenario 1 & 2: Authoritative Countdown Timer & Active Question Banner', () => {
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

    it('displays active question text in the header banner', () => {
      render(
        <FastMoneyHostBoard
          snapshot={playingHostSnapshot}
          roomName="Family Feud Duel"
          enableTTS={false}
        />
      );

      expect(screen.getByTestId('fast-money-host-question')).toHaveTextContent(
        'Name something you find in the kitchen'
      );
    });

    it('invokes speakQuestion (Host TTS) when a question becomes active during P1_PLAYING', () => {
      const speakSpy = vi.spyOn(ttsModule, 'speakQuestion').mockImplementation(() => {});

      render(
        <FastMoneyHostBoard
          snapshot={playingHostSnapshot}
          language="EN"
          roomName="Family Feud Duel"
          enableTTS={true}
        />
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
});
