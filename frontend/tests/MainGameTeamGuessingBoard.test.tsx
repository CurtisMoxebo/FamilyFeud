import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));
import React from 'react';
import { MainGameTeamGuessingBoard } from '../src/components/MainGameTeamGuessingBoard';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { TeamGuessingSessionState } from '../src/types';
import * as soundEffects from '../src/utils/soundEffects';
import * as tts from '../src/utils/tts';

// Mock audio and tts
vi.mock('../src/utils/soundEffects', () => ({
  playDing: vi.fn(),
  playPointsChime: vi.fn(),
  playStrikeBuzzer: vi.fn(),
  playVictoryFanfare: vi.fn(),
}));

vi.mock('../src/utils/tts', () => ({
  speakBoardCleared: vi.fn(),
  speakStealPhase: vi.fn(),
  speakStealSuccess: vi.fn(),
  speakStealFailed: vi.fn(),
  cancelSpeech: vi.fn(),
  isTtsMuted: vi.fn(() => false),
  setTtsMuted: vi.fn(),
}));

describe('US-14 & US-15 MainGameTeamGuessingBoard Component Tests', () => {
  const baseSnapshot: TeamGuessingSessionState = {
    roomCode: 'FEUD-9999',
    gameId: 'game-99',
    roundNumber: 2,
    language: 'EN',
    phase: 'TEAM_GUESSING',
    question: {
      id: 'q-99',
      questionText: 'Name something people often lose',
      answerCount: 4,
    },
    controllingTeam: 'TEAM_1',
    controllingTeamName: 'Team 1',
    opposingTeam: 'TEAM_2',
    opposingTeamName: 'Team 2',
    controllingTeamPlayers: [
      { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
      { id: 'p2', nickname: 'Bob', team: 'TEAM_1', battingOrder: 2 },
    ],
    opposingTeamPlayers: [
      { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
    ],
    stealSpokesperson: { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
    stealSpokespersonId: 'p3',
    activePlayerIndex: 0,
    activePlayer: { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
    strikes: 1,
    roundBank: 55,
    remainingSeconds: 14,
    endsAt: Date.now() + 14000,
    isTimerRunning: true,
    revealedAnswers: [
      {
        id: 'a1',
        answerText: 'KEYS',
        points: 40,
        rankOrder: 1,
        revealedByPlayerId: 'p1',
        revealedByNickname: 'Alice',
        revealedByTeam: 'TEAM_1',
      },
    ],
    totalAnswersCount: 4,
    revealedAnswersCount: 1,
    remainingAnswersCount: 3,
    winningTeam: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  const renderComponent = (props: Partial<React.ComponentProps<typeof MainGameTeamGuessingBoard>> = {}) => {
    return render(
      <LanguageProvider>
        <MainGameTeamGuessingBoard
          snapshot={baseSnapshot}
          roomName="Championship Feud"
          roomCode="FEUD-9999"
          {...props}
        />
      </LanguageProvider>
    );
  };

  it('renders Scenario 1: survey question, round bank, active teammate, and revealed cards', () => {
    renderComponent();

    // Survey question
    expect(screen.getByText(/"Name something people often lose"/i)).toBeInTheDocument();

    // Round Bank
    expect(screen.getByTestId('round-bank-display')).toHaveTextContent('55');

    // Active guesser & countdown
    expect(screen.getByText(/Alice's turn to answer/i)).toBeInTheDocument();
    expect(screen.getByText(/14s/i)).toBeInTheDocument();

    // Strike indicator: 1 strike active
    expect(screen.getByTestId('strike-box-1')).toHaveTextContent('X');
    expect(screen.getByTestId('strike-box-2')).toHaveTextContent('2');
    expect(screen.getByTestId('strike-box-3')).toHaveTextContent('3');

    // Answer cards: card 1 revealed, cards 2-4 unrevealed
    expect(screen.getByTestId('team-board-card-1')).toHaveTextContent('KEYS');
    expect(screen.getByTestId('team-board-card-1')).toHaveTextContent('40');
    expect(screen.getByTestId('team-board-card-2')).toBeInTheDocument();
  });

  it('triggers ding and chime audio when new cards are revealed', () => {
    const { rerender } = renderComponent();

    const updatedSnapshot: TeamGuessingSessionState = {
      ...baseSnapshot,
      roundBank: 80,
      revealedAnswers: [
        ...baseSnapshot.revealedAnswers,
        {
          id: 'a2',
          answerText: 'WALLET',
          points: 25,
          rankOrder: 2,
          revealedByPlayerId: 'p2',
          revealedByNickname: 'Bob',
          revealedByTeam: 'TEAM_1',
        },
      ],
    };

    rerender(
      <LanguageProvider>
        <MainGameTeamGuessingBoard
          snapshot={updatedSnapshot}
          roomName="Championship Feud"
          roomCode="FEUD-9999"
        />
      </LanguageProvider>
    );

    expect(soundEffects.playDing).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(soundEffects.playPointsChime).toHaveBeenCalled();
  });

  it('satisfies Scenario 2: displays giant strike overlay and plays buzzer on strikeIssued', () => {
    const { rerender } = renderComponent();

    rerender(
      <LanguageProvider>
        <MainGameTeamGuessingBoard
          snapshot={{ ...baseSnapshot, strikes: 2 }}
          roomName="Championship Feud"
          roomCode="FEUD-9999"
          strikeIssued={{
            roomCode: 'FEUD-9999',
            team: 'TEAM_1',
            strikeCount: 2,
            maxStrikes: 3,
            isDuplicate: false,
            isTimeout: false,
            player: {
              id: 'p1',
              nickname: 'Alice',
            },
          }}
        />
      </LanguageProvider>
    );

    expect(soundEffects.playStrikeBuzzer).toHaveBeenCalledWith(2);
    expect(screen.getByTestId('giant-strike-overlay')).toBeInTheDocument();

    // After timer expires, overlay is removed
    act(() => {
      vi.advanceTimersByTime(2300);
    });
    expect(screen.queryByTestId('giant-strike-overlay')).not.toBeInTheDocument();
  });

  it('displays duplicate answer warning when duplicate answer strike is issued', () => {
    renderComponent({
      strikeIssued: {
        roomCode: 'FEUD-9999',
        team: 'TEAM_1',
        strikeCount: 2,
        maxStrikes: 3,
        isDuplicate: true,
        isTimeout: false,
        player: {
          id: 'p1',
          nickname: 'Alice',
        },
      },
    });

    expect(screen.getByTestId('giant-strike-overlay')).toBeInTheDocument();
    expect(screen.getByText(/Duplicate! That answer is already on the board!/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2300);
    });
  });

  it('satisfies Scenario 3: displays victory celebration banner and announces TTS on board cleared', () => {
    const clearedSnapshot: TeamGuessingSessionState = {
      ...baseSnapshot,
      phase: 'ROUND_CLEARED',
      strikes: 1,
      roundBank: 100,
    };

    renderComponent({
      snapshot: clearedSnapshot,
      roundCleared: {
        roomCode: 'FEUD-9999',
        winningTeam: 'TEAM_1',
        totalRoundPoints: 100,
      },
    });

    expect(screen.getByTestId('round-cleared-banner')).toBeInTheDocument();
    expect(screen.getByText(/Board Cleared!/i)).toBeInTheDocument();
    expect(screen.getByText(/\+100 POINTS/i)).toBeInTheDocument();
    expect(soundEffects.playVictoryFanfare).toHaveBeenCalled();
    expect(tts.speakBoardCleared).toHaveBeenCalledWith('Team 1', 'EN');
  });

  it('satisfies Scenario 4: displays steal phase handoff banner, designated spokesperson, and announces TTS on 3 strikes', () => {
    const stealSnapshot: TeamGuessingSessionState = {
      ...baseSnapshot,
      phase: 'STEAL_PHASE',
      strikes: 3,
      roundBank: 75,
    };

    renderComponent({
      snapshot: stealSnapshot,
      transitionStealPhase: {
        roomCode: 'FEUD-9999',
        controllingTeam: 'TEAM_1',
        opposingTeam: 'TEAM_2',
        roundBank: 75,
        spokesperson: { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
        duration: 15,
      },
    });

    expect(screen.getByTestId('steal-phase-banner')).toBeInTheDocument();
    expect(screen.getByText(/Three Strikes!/i)).toBeInTheDocument();
    expect(screen.getByText(/Team 2 has a chance to STEAL!/i)).toBeInTheDocument();
    expect(screen.getByText(/Charlie has the floor to submit your team's steal answer/i)).toBeInTheDocument();
    expect(screen.getByTestId('active-player-display')).toHaveTextContent('Charlie (Team 2)');
    expect(tts.speakStealPhase).toHaveBeenCalledWith('Team 2', 'EN');
  });

  /* -------------------------------------------------------------
   * US-15 Steal Phase & Round Resolution Specific Tests
   * ------------------------------------------------------------- */
  it('satisfies US-15 Scenario 1: Successful Steal displays celebration banner, plays fanfare, and speaks TTS', () => {
    const stealSnapshot: TeamGuessingSessionState = {
      ...baseSnapshot,
      phase: 'STEAL_PHASE',
      strikes: 3,
      roundBank: 65,
    };

    renderComponent({
      snapshot: stealSnapshot,
      stealResolved: {
        roomCode: 'FEUD-9999',
        success: true,
        outcome: 'STEAL_SUCCESS',
        winningTeam: 'TEAM_2',
        pointsAwarded: 65,
        roundBank: 65,
        stealingPlayer: { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
        matchedAnswer: { id: 'a2', answerText: 'GLASSES', points: 25, rankOrder: 2 },
        remainingAnswers: [
          { id: 'a3', answerText: 'PHONE', points: 20, rankOrder: 3 },
          { id: 'a4', answerText: 'REMOTE', points: 15, rankOrder: 4 },
        ],
        message: 'Steal successful!',
      },
    });

    expect(screen.getByTestId('steal-resolved-banner')).toBeInTheDocument();
    expect(screen.getByTestId('steal-announcement-text')).toHaveTextContent(
      'Steal Successful! Team 2 stole 65 points!'
    );
    expect(screen.getByText(/\+65 POINTS/i)).toBeInTheDocument();
    expect(soundEffects.playVictoryFanfare).toHaveBeenCalled();
    expect(tts.speakStealSuccess).toHaveBeenCalledWith('Team 2', 65, 'EN');

    // Matched answer highlighted on the board
    expect(screen.getByTestId('team-board-card-2')).toHaveTextContent('GLASSES');
    expect(screen.getByTestId('team-board-card-2')).toHaveTextContent('25');
  });

  it('satisfies US-15 Scenario 2: Failed Steal displays failure banner, sounds strike buzzer, and retains bank for original team', () => {
    const stealSnapshot: TeamGuessingSessionState = {
      ...baseSnapshot,
      phase: 'STEAL_PHASE',
      strikes: 3,
      roundBank: 65,
    };

    renderComponent({
      snapshot: stealSnapshot,
      stealResolved: {
        roomCode: 'FEUD-9999',
        success: false,
        outcome: 'STEAL_FAILED',
        winningTeam: 'TEAM_1',
        pointsAwarded: 65,
        roundBank: 65,
        stealingPlayer: { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
        rawAnswer: 'ELEPHANT',
        remainingAnswers: [
          { id: 'a2', answerText: 'GLASSES', points: 25, rankOrder: 2 },
          { id: 'a3', answerText: 'PHONE', points: 20, rankOrder: 3 },
          { id: 'a4', answerText: 'REMOTE', points: 15, rankOrder: 4 },
        ],
        message: 'Steal failed!',
      },
    });

    expect(screen.getByTestId('steal-resolved-banner')).toBeInTheDocument();
    expect(screen.getByTestId('steal-announcement-text')).toHaveTextContent(
      'Steal Failed! Team 1 retains 65 points!'
    );
    expect(soundEffects.playStrikeBuzzer).toHaveBeenCalledWith(1);
    expect(tts.speakStealFailed).toHaveBeenCalledWith('Team 1', 65, 'EN');
  });

  it('satisfies US-15 Scenario 3: Flips open all remaining unrevealed cards on round resolution', () => {
    const stealSnapshot: TeamGuessingSessionState = {
      ...baseSnapshot,
      phase: 'STEAL_PHASE',
      strikes: 3,
      roundBank: 55,
    };

    renderComponent({
      snapshot: stealSnapshot,
      stealResolved: {
        roomCode: 'FEUD-9999',
        success: false,
        outcome: 'STEAL_TIMEOUT',
        winningTeam: 'TEAM_1',
        pointsAwarded: 55,
        roundBank: 55,
        stealingPlayer: { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
        remainingAnswers: [
          { id: 'a2', answerText: 'GLASSES', points: 25, rankOrder: 2 },
          { id: 'a3', answerText: 'PHONE', points: 20, rankOrder: 3 },
          { id: 'a4', answerText: 'REMOTE', points: 15, rankOrder: 4 },
        ],
        message: 'Steal timed out!',
      },
    });

    // All slots 1, 2, 3, 4 should now be revealed with text and points
    expect(screen.getByTestId('team-board-card-1')).toHaveTextContent('KEYS');
    expect(screen.getByTestId('team-board-card-2')).toHaveTextContent('GLASSES');
    expect(screen.getByTestId('team-board-card-2')).toHaveTextContent('25');
    expect(screen.getByTestId('team-board-card-3')).toHaveTextContent('PHONE');
    expect(screen.getByTestId('team-board-card-3')).toHaveTextContent('20');
    expect(screen.getByTestId('team-board-card-4')).toHaveTextContent('REMOTE');
    expect(screen.getByTestId('team-board-card-4')).toHaveTextContent('15');
  });

  it('invokes onLeave and cancelSpeech when leave button is clicked', () => {
    const onLeave = vi.fn();
    renderComponent({ onLeave });

    const leaveBtn = screen.getByTitle('Leave Room');
    fireEvent.click(leaveBtn);

    expect(tts.cancelSpeech).toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalled();
  });

  describe('US-16: Grand Total Scoreboard, Victory Screen & Match Replay', () => {
    it('satisfies Scenario 1 & 2: renders persistent grand total scoreboard header with dual-tally distinction', () => {
      renderComponent({
        scoreboardState: {
          roomCode: 'FEUD-9999',
          team1GrandTotal: 120,
          team2GrandTotal: 85,
          activeRoundBank: 55,
          currentRoundNumber: 2,
          totalRounds: 3,
          phase: 'ROUND_IN_PROGRESS',
        },
      });

      expect(screen.getByTestId('grand-total-header')).toBeInTheDocument();
      expect(screen.getByTestId('team1-grand-total')).toHaveTextContent('120');
      expect(screen.getByTestId('team2-grand-total')).toHaveTextContent('85');
      expect(screen.getByTestId('round-progress-indicator')).toHaveTextContent('Round 2 of 3');
      // Round bank distinct in center
      expect(screen.getByTestId('round-bank-display')).toHaveTextContent('55');
      expect(screen.getByTestId('header-round-bank')).toHaveTextContent('55 PTS');
    });

    it('satisfies Scenario 3: renders Next Round button upon round completion and invokes onNextRound', () => {
      const onNextRound = vi.fn();
      renderComponent({
        onNextRound,
        roundCleared: {
          roomCode: 'FEUD-9999',
          winningTeam: 'TEAM_1',
          totalRoundPoints: 55,
        },
        scoreboardState: {
          roomCode: 'FEUD-9999',
          team1GrandTotal: 175,
          team2GrandTotal: 85,
          activeRoundBank: 0,
          currentRoundNumber: 2,
          totalRounds: 3,
          phase: 'ROUND_RESOLVED',
        },
      });

      const nextRoundBtn = screen.getByTestId('next-round-btn');
      expect(nextRoundBtn).toBeInTheDocument();
      expect(nextRoundBtn).toHaveTextContent('Next Round');

      fireEvent.click(nextRoundBtn);
      expect(onNextRound).toHaveBeenCalledTimes(1);
    });

    it('satisfies Scenario 4: renders Final Winner announcement modal with fanfare and scores', () => {
      renderComponent({
        matchOver: {
          roomCode: 'FEUD-9999',
          winningTeam: 'TEAM_1',
          team1GrandTotal: 245,
          team2GrandTotal: 180,
          totalRounds: 3,
          message: '🏆 TEAM 1 WINS THE GAME! (245 vs 180)',
        },
      });

      expect(screen.getByTestId('match-over-modal')).toBeInTheDocument();
      expect(screen.getByTestId('match-winner-headline')).toHaveTextContent(
        '🏆 TEAM 1 WINS THE GAME! (245 vs 180)'
      );
      expect(soundEffects.playVictoryFanfare).toHaveBeenCalled();
    });

    it('satisfies Scenario 5: provides Play Again and Exit Room buttons in victory modal', () => {
      const onReplay = vi.fn();
      const onLeave = vi.fn();

      renderComponent({
        onReplay,
        onLeave,
        matchOver: {
          roomCode: 'FEUD-9999',
          winningTeam: 'TEAM_2',
          team1GrandTotal: 180,
          team2GrandTotal: 250,
          totalRounds: 3,
          message: '🏆 TEAM 2 WINS THE GAME! (180 vs 250)',
        },
      });

      const playAgainBtn = screen.getByTestId('play-again-btn');
      const exitRoomBtn = screen.getByTestId('exit-room-btn');

      expect(playAgainBtn).toBeInTheDocument();
      expect(exitRoomBtn).toBeInTheDocument();

      fireEvent.click(playAgainBtn);
      expect(onReplay).toHaveBeenCalledTimes(1);

      fireEvent.click(exitRoomBtn);
      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it('satisfies Scenario 6: displays Sudden Death tie-breaker banner on exact tie', () => {
      const onNextRound = vi.fn();

      renderComponent({
        onNextRound,
        suddenDeathInitiated: {
          roomCode: 'FEUD-9999',
          team1GrandTotal: 150,
          team2GrandTotal: 150,
          roundNumber: 4,
          message: 'Sudden Death Tie-Breaker Initiated!',
        },
        scoreboardState: {
          roomCode: 'FEUD-9999',
          team1GrandTotal: 150,
          team2GrandTotal: 150,
          activeRoundBank: 0,
          currentRoundNumber: 3,
          totalRounds: 3,
          phase: 'SUDDEN_DEATH',
          isSuddenDeath: true,
        },
      });

      expect(screen.getByTestId('sudden-death-banner')).toBeInTheDocument();
      expect(screen.getAllByText('Sudden Death Tie-Breaker!').length).toBeGreaterThanOrEqual(1);

      const startSuddenDeathBtn = screen.getByTestId('start-sudden-death-btn');
      fireEvent.click(startSuddenDeathBtn);
      expect(onNextRound).toHaveBeenCalledTimes(1);
    });
  });

  it('satisfies US-17 Scenario 4: renders host audio toggle button and toggles mute state with cancelSpeech', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(
      <LanguageProvider>
        <MainGameTeamGuessingBoard
          snapshot={baseSnapshot}
          timerTick={null}
          strikeIssued={null}
          roundCleared={null}
          transitionStealPhase={null}
          boardReveal={null}
          stealResolved={null}
          roundWinner={null}
          language="EN"
          roomName="Test Room"
          roomCode="FEUD-9999"
        />
      </LanguageProvider>
    );

    const toggleBtn = screen.getByTestId('host-audio-toggle');
    expect(toggleBtn).toHaveAttribute('title', 'Mute Sounds & TTS');

    // Click to mute
    fireEvent.click(toggleBtn);
    expect(tts.setTtsMuted).toHaveBeenCalledWith(true);
    expect(tts.cancelSpeech).toHaveBeenCalled();
    expect(toggleBtn).toHaveAttribute('title', 'Unmute Sounds & TTS');

    // Click to unmute
    fireEvent.click(toggleBtn);
    expect(tts.setTtsMuted).toHaveBeenCalledWith(false);
    expect(toggleBtn).toHaveAttribute('title', 'Mute Sounds & TTS');
  });
});
