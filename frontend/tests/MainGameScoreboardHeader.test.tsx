import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MainGameScoreboardHeader } from '../src/components/MainGameScoreboardHeader';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('US-16 Scenario 1 & 2: MainGameScoreboardHeader Component', () => {
  const renderWithLanguage = (ui: React.ReactElement) => {
    return render(<LanguageProvider>{ui}</LanguageProvider>);
  };

  it('renders persistent cumulative grand totals and active round bank (Scenario 1 & 2)', () => {
    renderWithLanguage(
      <MainGameScoreboardHeader
        team1GrandTotal={120}
        team2GrandTotal={85}
        activeRoundBank={45}
        currentRoundNumber={2}
        totalRounds={3}
      />
    );

    expect(screen.getByTestId('grand-total-header')).toBeInTheDocument();
    expect(screen.getByTestId('team1-grand-total')).toHaveTextContent('120');
    expect(screen.getByTestId('team2-grand-total')).toHaveTextContent('85');
    expect(screen.getByTestId('active-round-bank')).toHaveTextContent('45');
    expect(screen.getByTestId('round-progress-indicator')).toHaveTextContent(/2/);
  });

  it('highlights personal team when highlightTeam is provided (Scenario 1 mobile)', () => {
    const { rerender } = renderWithLanguage(
      <MainGameScoreboardHeader
        team1GrandTotal={50}
        team2GrandTotal={70}
        activeRoundBank={20}
        currentRoundNumber={1}
        totalRounds={3}
        highlightTeam="TEAM_1"
      />
    );

    expect(screen.getByTestId('your-team-badge')).toBeInTheDocument();
    expect(screen.getByTestId('team1-grand-total-card')).toHaveClass('ring-blue-400/40');

    rerender(
      <LanguageProvider>
        <MainGameScoreboardHeader
          team1GrandTotal={50}
          team2GrandTotal={70}
          activeRoundBank={20}
          currentRoundNumber={1}
          totalRounds={3}
          highlightTeam="TEAM_2"
        />
      </LanguageProvider>
    );

    expect(screen.getByTestId('your-team-badge')).toBeInTheDocument();
    expect(screen.getByTestId('team2-grand-total-card')).toHaveClass('ring-emerald-400/40');
  });

  it('renders Sudden Death indicator when isSuddenDeath is true (Scenario 6)', () => {
    renderWithLanguage(
      <MainGameScoreboardHeader
        team1GrandTotal={200}
        team2GrandTotal={200}
        activeRoundBank={0}
        currentRoundNumber={4}
        totalRounds={3}
        isSuddenDeath={true}
      />
    );

    expect(screen.getByTestId('round-progress-indicator')).toHaveTextContent(/Sudden Death/i);
  });

  it('supports compact rendering mode for player controller viewports', () => {
    renderWithLanguage(
      <MainGameScoreboardHeader
        team1GrandTotal={100}
        team2GrandTotal={90}
        activeRoundBank={15}
        currentRoundNumber={2}
        totalRounds={3}
        compact={true}
      />
    );

    expect(screen.getByTestId('grand-total-header')).toHaveClass('p-2.5');
  });
});

