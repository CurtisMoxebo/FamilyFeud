import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { FastMoneyIsolation } from '../src/components/FastMoneyIsolation';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { FastMoneyRevealSlot, Player2IsolationSnapshot, TimerTickPayload } from '../src/types';

describe('Frontend Component Suite: FastMoneyIsolation (US-07 Scenario 5)', () => {
  const defaultIsolationSnapshot: Player2IsolationSnapshot = {
    phase: 'P1_PLAYING',
    isOffstage: true,
    isolationMessage: 'Player 1 is currently playing! Look away from the host screen',
    remainingSeconds: 48,
    isTimerRunning: true,
  };

  const renderWithProviders = (ui: React.ReactElement, lang: 'EN' | 'FR' | 'ES' = 'EN') => {
    return render(<LanguageProvider initialLanguage={lang}>{ui}</LanguageProvider>);
  };

  it('renders isolation shield and anti-cheating instructions for Player 2', () => {
    renderWithProviders(<FastMoneyIsolation snapshot={defaultIsolationSnapshot} />);

    expect(screen.getByTestId('player2-isolation-screen')).toBeInTheDocument();
    expect(screen.getByText(/Offstage Isolation Shield/i)).toBeInTheDocument();
    expect(screen.getByText(/🎧 Player 1 is currently playing!/i)).toBeInTheDocument();
    expect(screen.getByTestId('player2-isolation-message')).toHaveTextContent(
      /Please look away from the host TV screen and wait for your turn/i
    );
  });

  it('strictly hides all question texts, answer inputs, and contestant answers to preserve game integrity', () => {
    renderWithProviders(<FastMoneyIsolation snapshot={defaultIsolationSnapshot} />);

    // No input field or form allowed on Player 2's device
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fast-money-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fast-money-submit-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fast-money-pass-btn')).not.toBeInTheDocument();

    // Verifies security statement
    expect(
      screen.getByText(/Questions and answers remain strictly hidden until your turn/i)
    ).toBeInTheDocument();
  });

  it('displays synchronized countdown timer from authoritative timerTick', () => {
    const tick: TimerTickPayload = {
      secondsRemaining: 37,
      endsAt: Date.now() + 37000,
    };

    renderWithProviders(
      <FastMoneyIsolation snapshot={defaultIsolationSnapshot} timerTick={tick} />
    );

    const timer = screen.getByTestId('player2-isolation-timer');
    expect(timer).toHaveTextContent('37');
  });

  it('falls back to snapshot remainingSeconds when timerTick is not yet delivered', () => {
    renderWithProviders(<FastMoneyIsolation snapshot={defaultIsolationSnapshot} timerTick={null} />);

    const timer = screen.getByTestId('player2-isolation-timer');
    expect(timer).toHaveTextContent('48');
  });

  it('supports French language localization for Player 2 isolation screen', () => {
    renderWithProviders(<FastMoneyIsolation snapshot={defaultIsolationSnapshot} />, 'FR');

    expect(
      screen.getByText(/🎧 Le joueur 1 est en train de jouer !/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId('player2-isolation-message')).toHaveTextContent(
      /Veuillez détourner les yeux de l’écran principal et attendre votre tour/i
    );
  });

  describe('US-08: Player 2 Reveal Synchronization & Ready Transition', () => {
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
    ];

    it('satisfies Scenario 5: renders player2-reveal-screen in lockstep with Host during P1_REVEAL', () => {
      const revealSnapshot: Player2IsolationSnapshot = {
        phase: 'P1_REVEAL',
        isOffstage: false,
        isolationMessage: "Player 1's reveal sequence in progress...",
        remainingSeconds: 0,
        isTimerRunning: false,
        totalScore: 45,
        revealSlots: mockSlots,
        activeRevealSlotNumber: 2,
      };

      renderWithProviders(<FastMoneyIsolation snapshot={revealSnapshot} />);

      expect(screen.getByTestId('player2-reveal-screen')).toBeInTheDocument();
      expect(screen.getByTestId('player2-reveal-total-score')).toHaveTextContent('45');

      // Slot 1: Answer and points revealed
      expect(screen.getByTestId('player2-reveal-answer-1')).toHaveTextContent('SOUP');
      expect(screen.getByTestId('player2-reveal-points-1')).toHaveTextContent('45');

      // Slot 2: Answer revealed, points concealed
      expect(screen.getByTestId('player2-reveal-answer-2')).toHaveTextContent('BANANA');
      expect(screen.getByTestId('player2-reveal-points-2')).toHaveTextContent('--');

      // Slot 3: Both concealed
      expect(screen.getByTestId('player2-concealed-answer-3')).toHaveTextContent('••••••••');

      // Spectator notice
      expect(screen.getByText(/Player 1's reveal sequence in progress/i)).toBeInTheDocument();
    });

    it('satisfies Scenario 4: renders player2-ready-screen and triggers onReady on button click when P2_READY', async () => {
      const user = userEvent.setup();
      const onReady = vi.fn();

      const readySnapshot: Player2IsolationSnapshot = {
        phase: 'P2_READY',
        isOffstage: false,
        isolationMessage: "Player 1's reveal is complete! Get ready for your turn",
        remainingSeconds: 0,
        isTimerRunning: false,
        totalScore: 125,
      };

      renderWithProviders(<FastMoneyIsolation snapshot={readySnapshot} onReady={onReady} />);

      expect(screen.getByTestId('player2-ready-screen')).toBeInTheDocument();
      expect(screen.getByTestId('p2-round1-total')).toHaveTextContent('125');
      expect(screen.getByTestId('p2-ready-btn')).toBeInTheDocument();
      expect(screen.getByText(/Player 2, You're Up!/i)).toBeInTheDocument();

      await user.click(screen.getByTestId('p2-ready-btn'));
      expect(onReady).toHaveBeenCalledTimes(1);
    });

    it('supports French localization for Player 2 ready screen', () => {
      const readySnapshot: Player2IsolationSnapshot = {
        phase: 'P2_READY',
        isOffstage: false,
        isolationMessage: 'Révélation terminée',
        remainingSeconds: 0,
        isTimerRunning: false,
        totalScore: 90,
      };

      renderWithProviders(<FastMoneyIsolation snapshot={readySnapshot} onReady={vi.fn()} />, 'FR');

      expect(screen.getByText(/Joueur 2, à vous !/i)).toBeInTheDocument();
      expect(screen.getByText(/Le joueur 1 a marqué 90 points/i)).toBeInTheDocument();
      expect(screen.getByTestId('p2-round1-total')).toHaveTextContent('90');
    });
  });
});
