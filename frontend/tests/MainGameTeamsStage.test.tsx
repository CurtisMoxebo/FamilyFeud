import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MainGameTeamsStage } from '../src/components/MainGameTeamsStage';
import { MainGamePlayerView } from '../src/components/MainGamePlayerView';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { AssignedTeamPlayer } from '../src/types';

const mockTeam1: AssignedTeamPlayer[] = [
  { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
  { id: 'p2', team: 'TEAM_1', battingOrder: 2 }, // tests nickname fallback to id
];

const mockTeam2: AssignedTeamPlayer[] = [
  { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
  { id: 'p4', team: 'TEAM_2', battingOrder: 2 }, // tests nickname fallback to id
];

describe('Frontend Component Suite: MainGameTeamsStage & MainGamePlayerView (US-11, US-28 & US-29)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('MainGameTeamsStage (Host TV Showcase)', () => {
    it('renders room code badge, both team columns, VS emblem, and fallback player IDs when nickname is omitted', () => {
      render(
        <LanguageProvider>
          <MainGameTeamsStage
            roomCode="FEUD-TEAM"
            team1={mockTeam1}
            team2={mockTeam2}
          />
        </LanguageProvider>
      );

      expect(screen.getByTestId('main-game-teams-stage')).toBeInTheDocument();
      expect(screen.getByTestId('teams-stage-room-code')).toHaveTextContent('FEUD-TEAM');
      expect(screen.getByTestId('teams-assigned-title')).toHaveTextContent('Teams Assigned!');
      expect(screen.getByTestId('versus-emblem')).toHaveTextContent('VS');

      // Team 1 players (including fallback id 'p2')
      expect(screen.getByTestId('team-1-player-p1')).toHaveTextContent('Alice');
      expect(screen.getByTestId('team-1-player-p2')).toHaveTextContent('p2');

      // Team 2 players (including fallback id 'p4')
      expect(screen.getByTestId('team-2-player-p3')).toHaveTextContent('Charlie');
      expect(screen.getByTestId('team-2-player-p4')).toHaveTextContent('p4');

      // Optional buttons are hidden when callbacks are omitted
      expect(screen.queryByTestId('teams-stage-back-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('start-face-off-btn')).not.toBeInTheDocument();
    });

    it('invokes onLeave when the Leave Lobby button is clicked', () => {
      const onLeave = vi.fn();

      render(
        <LanguageProvider>
          <MainGameTeamsStage
            roomCode="FEUD-TEAM"
            team1={mockTeam1}
            team2={mockTeam2}
            onLeave={onLeave}
          />
        </LanguageProvider>
      );

      const leaveBtn = screen.getByTestId('teams-stage-back-btn');
      fireEvent.click(leaveBtn);
      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it('allows host to click Start Face-Off button immediately before countdown expires', () => {
      const onProceedToFaceOff = vi.fn();

      render(
        <LanguageProvider>
          <MainGameTeamsStage
            roomCode="FEUD-TEAM"
            team1={mockTeam1}
            team2={mockTeam2}
            onProceedToFaceOff={onProceedToFaceOff}
          />
        </LanguageProvider>
      );

      const startBtn = screen.getByTestId('start-face-off-btn');
      expect(startBtn).toHaveTextContent('Start Face-Off (10s)');

      fireEvent.click(startBtn);
      expect(onProceedToFaceOff).toHaveBeenCalledTimes(1);
    });

    it('counts down from 10s to 0s and automatically calls onProceedToFaceOff', () => {
      const onProceedToFaceOff = vi.fn();

      render(
        <LanguageProvider>
          <MainGameTeamsStage
            roomCode="FEUD-TEAM"
            team1={mockTeam1}
            team2={mockTeam2}
            onProceedToFaceOff={onProceedToFaceOff}
          />
        </LanguageProvider>
      );

      const startBtn = screen.getByTestId('start-face-off-btn');
      expect(startBtn).toHaveTextContent('Start Face-Off (10s)');

      // Advance 5 seconds -> 5s remaining
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(startBtn).toHaveTextContent('Start Face-Off (5s)');
      expect(onProceedToFaceOff).not.toHaveBeenCalled();

      // Advance remaining 5 seconds -> triggers onProceedToFaceOff at 0s
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(onProceedToFaceOff).toHaveBeenCalledTimes(1);
    });
  });

  describe('MainGamePlayerView (Mobile Team Assignment View)', () => {
    it('renders room code badge, teammate/opponent fallback IDs, and invokes onLeave when clicked', () => {
      const onLeave = vi.fn();

      render(
        <LanguageProvider>
          <MainGamePlayerView
            roomCode="FEUD-TEAM"
            playerNickname="Alice"
            assignedPlayer={mockTeam1[0]}
            myTeam={mockTeam1}
            opponentTeam={mockTeam2}
            teamNumber={1}
            onLeave={onLeave}
          />
        </LanguageProvider>
      );

      expect(screen.getByTestId('player-main-game-team-screen')).toHaveTextContent('FEUD-TEAM');
      expect(screen.getByTestId('player-team-badge')).toHaveTextContent('You are on Team 1!');
      expect(screen.getByTestId('teammate-item-p2')).toHaveTextContent('p2');
      expect(screen.getByTestId('opponent-item-p4')).toHaveTextContent('p4');

      const leaveBtn = screen.getByTestId('player-leave-btn');
      fireEvent.click(leaveBtn);
      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });
});
