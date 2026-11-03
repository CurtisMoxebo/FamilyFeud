import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MainGameVictoryModal } from '../src/components/MainGameVictoryModal';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import * as soundModule from '../src/utils/soundEffects';

vi.mock('../src/utils/soundEffects', () => ({
  playVictoryFanfare: vi.fn(),
  playDing: vi.fn(),
  playPointsChime: vi.fn(),
  playStrikeBuzzer: vi.fn(),
}));

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('US-16 Scenario 4 & 5: MainGameVictoryModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockMatchOver = {
    roomCode: 'FEUD-9999',
    winningTeam: 'TEAM_1' as const,
    team1GrandTotal: 340,
    team2GrandTotal: 210,
    totalRounds: 3,
  };

  const renderWithLanguage = (ui: React.ReactElement) => {
    return render(<LanguageProvider>{ui}</LanguageProvider>);
  };

  it('renders champion headline, scores, and triggers victory fanfare (Scenario 4)', () => {
    renderWithLanguage(<MainGameVictoryModal matchOver={mockMatchOver} />);

    expect(screen.getByTestId('match-over-modal')).toBeInTheDocument();
    expect(screen.getByTestId('match-winner-headline')).toHaveTextContent(/Team 1/i);
    expect(screen.getByTestId('match-winner-headline')).toHaveTextContent('340');
    expect(screen.getByTestId('match-winner-headline')).toHaveTextContent('210');
    expect(soundModule.playVictoryFanfare).toHaveBeenCalledTimes(1);
  });

  it('allows Host to trigger Play Again (Scenario 5)', async () => {
    const user = userEvent.setup();
    const onReplay = vi.fn();

    renderWithLanguage(
      <MainGameVictoryModal matchOver={mockMatchOver} onReplay={onReplay} isHost={true} />
    );

    const replayBtn = screen.getByTestId('play-again-btn');
    expect(replayBtn).toBeInTheDocument();
    await user.click(replayBtn);
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it('allows player/host to trigger Leave Room (Scenario 5)', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();

    renderWithLanguage(
      <MainGameVictoryModal matchOver={mockMatchOver} onLeave={onLeave} isHost={false} />
    );

    const leaveBtn = screen.getByTestId('exit-room-btn');
    expect(leaveBtn).toBeInTheDocument();
    await user.click(leaveBtn);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
