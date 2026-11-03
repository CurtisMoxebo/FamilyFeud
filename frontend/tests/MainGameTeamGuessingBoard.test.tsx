import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
  cancelSpeech: vi.fn(),
}));

describe('US-14 MainGameTeamGuessingBoard Component Tests', () => {
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

  it('satisfies Scenario 4: displays steal phase handoff banner and announces TTS on 3 strikes', () => {
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
      },
    });

    expect(screen.getByTestId('steal-phase-banner')).toBeInTheDocument();
    expect(screen.getByText(/Three Strikes!/i)).toBeInTheDocument();
    expect(screen.getByText(/Team 2 has a chance to STEAL!/i)).toBeInTheDocument();
    expect(tts.speakStealPhase).toHaveBeenCalledWith('Team 2', 'EN');
  });

  it('invokes onLeave and cancelSpeech when leave button is clicked', () => {
    const onLeave = vi.fn();
    renderComponent({ onLeave });

    const leaveBtn = screen.getByTitle('Leave Room');
    fireEvent.click(leaveBtn);

    expect(tts.cancelSpeech).toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalled();
  });
});
