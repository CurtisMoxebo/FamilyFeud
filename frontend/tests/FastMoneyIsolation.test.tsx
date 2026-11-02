import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FastMoneyIsolation } from '../src/components/FastMoneyIsolation';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { Player2IsolationSnapshot, TimerTickPayload } from '../src/types';

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
});
