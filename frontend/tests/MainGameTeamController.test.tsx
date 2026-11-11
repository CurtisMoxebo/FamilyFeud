import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MainGameTeamController } from '../src/components/MainGameTeamController';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { TeamGuessingSessionState } from '../src/types';

describe('US-14 & US-15 MainGameTeamController Component Tests', () => {
  const baseSnapshot: TeamGuessingSessionState = {
    roomCode: 'FEUD-5555',
    gameId: 'game-55',
    roundNumber: 1,
    language: 'EN',
    phase: 'TEAM_GUESSING',
    question: {
      id: 'q-55',
      questionText: 'Name something found in a refrigerator',
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
      { id: 'p4', nickname: 'David', team: 'TEAM_2', battingOrder: 2 },
    ],
    stealSpokesperson: { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
    stealSpokespersonId: 'p3',
    activePlayerIndex: 0,
    activePlayer: { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
    strikes: 1,
    roundBank: 40,
    remainingSeconds: 15,
    endsAt: Date.now() + 15000,
    isTimerRunning: true,
    revealedAnswers: [
      {
        id: 'a1',
        answerText: 'MILK',
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

  const renderComponent = (props: Partial<React.ComponentProps<typeof MainGameTeamController>> = {}) => {
    return render(
      <LanguageProvider>
        <MainGameTeamController
          snapshot={baseSnapshot}
          currentNickname="Alice"
          currentPlayerId="p1"
          roomCode="FEUD-5555"
          roomName="Family Feud Championship"
          {...props}
        />
      </LanguageProvider>
    );
  };

  it('renders Active Guesser view with question, bank, timer, input field, and action buttons', () => {
    renderComponent();

    // Survey question
    expect(screen.getByText(/"Name something found in a refrigerator"/i)).toBeInTheDocument();

    // Round bank & strikes
    expect(screen.getByTestId('player-round-bank')).toHaveTextContent('40');
    expect(screen.getByTestId('player-strike-box-1')).toHaveTextContent('X');
    expect(screen.getByTestId('player-strike-box-2')).toHaveTextContent('2');
    expect(screen.getByTestId('player-strike-box-3')).toHaveTextContent('3');

    // Active guesser banner
    expect(screen.getByTestId('active-guesser-banner')).toBeInTheDocument();
    expect(screen.getByText(/It's your turn to guess!/i)).toBeInTheDocument();
    expect(screen.getByTestId('player-turn-timer')).toHaveTextContent('15s');

    // Input form & buttons
    expect(screen.getByTestId('player-guess-input')).toBeInTheDocument();
    expect(screen.getByTestId('player-submit-guess-btn')).toBeInTheDocument();
    expect(screen.getByTestId('player-pass-turn-btn')).toBeInTheDocument();
  });

  it('submits valid guess and clears input when form is submitted', () => {
    const onSubmitGuess = vi.fn();
    renderComponent({ onSubmitGuess });

    const input = screen.getByTestId('player-guess-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'CHEESE' } });
    expect(input.value).toBe('CHEESE');

    const submitBtn = screen.getByTestId('player-submit-guess-btn');
    fireEvent.click(submitBtn);

    expect(onSubmitGuess).toHaveBeenCalledWith('CHEESE');
    expect(input.value).toBe('');

    act(() => {
      vi.advanceTimersByTime(700);
    });
  });

  it('prevents submission when input is empty or only whitespace', () => {
    const onSubmitGuess = vi.fn();
    renderComponent({ onSubmitGuess });

    const input = screen.getByTestId('player-guess-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });

    const submitBtn = screen.getByTestId('player-submit-guess-btn');
    fireEvent.click(submitBtn);

    expect(onSubmitGuess).not.toHaveBeenCalled();
  });

  it('calls onPassTurn when Pass Turn button is clicked', () => {
    const onPassTurn = vi.fn();
    renderComponent({ onPassTurn });

    const passBtn = screen.getByTestId('player-pass-turn-btn');
    fireEvent.click(passBtn);

    expect(onPassTurn).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(700);
    });
  });

  it('renders Waiting Teammate view when player is on controlling team but not active guesser', () => {
    renderComponent({
      currentNickname: 'Bob',
      currentPlayerId: 'p2',
    });

    expect(screen.getByTestId('waiting-teammate-banner')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for Alice to guess.../i)).toBeInTheDocument();
    expect(screen.queryByTestId('player-guess-form')).not.toBeInTheDocument();
  });

  it('renders Opposing Team view when player is on opposing team', () => {
    renderComponent({
      currentNickname: 'Charlie',
      currentPlayerId: 'p3',
    });

    expect(screen.getByTestId('opposing-team-banner')).toBeInTheDocument();
    expect(screen.getByText(/Team 1 is playing this board!/i)).toBeInTheDocument();
    expect(screen.queryByTestId('player-guess-form')).not.toBeInTheDocument();
  });

  it('displays strike alert popup when strikeIssued arrives', () => {
    renderComponent({
      strikeIssued: {
        roomCode: 'FEUD-5555',
        team: 'TEAM_1',
        strikeCount: 2,
        maxStrikes: 3,
        isDuplicate: false,
        isTimeout: false,
        player: { id: 'p1', nickname: 'Alice' },
      },
    });

    expect(screen.getByTestId('mobile-strike-alert')).toBeInTheDocument();
    expect(screen.getByText(/2 Strike\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText(/That's not on the board!/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.queryByTestId('mobile-strike-alert')).not.toBeInTheDocument();
  });

  it('displays duplicate answer warning in strike alert when duplicate answer strike is issued', () => {
    renderComponent({
      strikeIssued: {
        roomCode: 'FEUD-5555',
        team: 'TEAM_1',
        strikeCount: 1,
        maxStrikes: 3,
        isDuplicate: true,
        isTimeout: false,
        player: { id: 'p1', nickname: 'Alice' },
      },
    });

    expect(screen.getByTestId('mobile-strike-alert')).toBeInTheDocument();
    expect(screen.getByText(/Duplicate! That answer is already on the board!/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2600);
    });
  });

  it('displays Round Cleared victory banner when phase is ROUND_CLEARED', () => {
    renderComponent({
      snapshot: {
        ...baseSnapshot,
        phase: 'ROUND_CLEARED',
        roundBank: 100,
      },
      roundCleared: {
        roomCode: 'FEUD-5555',
        winningTeam: 'TEAM_1',
        totalRoundPoints: 100,
      },
    });

    expect(screen.getByTestId('mobile-round-cleared-banner')).toBeInTheDocument();
    expect(screen.getByText(/Board Cleared!/i)).toBeInTheDocument();
    expect(screen.getByText(/Team 1 cleared the board and wins 100 points!/i)).toBeInTheDocument();
  });

  it('displays Steal Phase transition banner when phase is STEAL_PHASE', () => {
    renderComponent({
      snapshot: {
        ...baseSnapshot,
        phase: 'STEAL_PHASE',
        strikes: 3,
        roundBank: 75,
      },
      transitionStealPhase: {
        roomCode: 'FEUD-5555',
        controllingTeam: 'TEAM_1',
        opposingTeam: 'TEAM_2',
        roundBank: 75,
      },
    });

    expect(screen.getByTestId('mobile-steal-phase-banner')).toBeInTheDocument();
    expect(screen.getByText(/Three Strikes!/i)).toBeInTheDocument();
    expect(screen.getByText(/Team 2 has a chance to STEAL!/i)).toBeInTheDocument();
  });

  /* -------------------------------------------------------------
   * US-15 Scenario 4: Steal Phase Teammate Views & Spokesperson Arbiter
   * ------------------------------------------------------------- */
  it('satisfies Scenario 4: designated spokesperson has active steal input box and submit button', () => {
    const onSubmitStealGuess = vi.fn();
    const stealSnapshot: TeamGuessingSessionState = {
      ...baseSnapshot,
      phase: 'STEAL_PHASE',
      strikes: 3,
      roundBank: 65,
    };

    renderComponent({
      snapshot: stealSnapshot,
      currentNickname: 'Charlie',
      currentPlayerId: 'p3', // Spokesperson of Team 2
      onSubmitStealGuess,
    });

    // Header prompt
    expect(screen.getByTestId('spokesperson-steal-banner')).toBeInTheDocument();
    expect(screen.getByText(/CHANCE TO STEAL! You have 15 seconds to submit your team's answer/i)).toBeInTheDocument();

    // Active input box & submit button
    const stealInput = screen.getByTestId('spokesperson-steal-input') as HTMLInputElement;
    expect(stealInput).toBeInTheDocument();
    expect(stealInput.placeholder).toBe('Enter official steal answer...');

    const submitBtn = screen.getByTestId('spokesperson-submit-steal-btn');
    expect(submitBtn).toHaveTextContent('Submit Steal Answer');

    // Submit valid steal answer
    fireEvent.change(stealInput, { target: { value: 'BUTTER' } });
    fireEvent.click(submitBtn);

    expect(onSubmitStealGuess).toHaveBeenCalledWith('BUTTER');
    expect(stealInput.value).toBe('');

    act(() => {
      vi.advanceTimersByTime(700);
    });
  });

  it('satisfies Scenario 4: non-spokesperson stealing teammate sees consult prompt without active input', () => {
    const stealSnapshot: TeamGuessingSessionState = {
      ...baseSnapshot,
      phase: 'STEAL_PHASE',
      strikes: 3,
      roundBank: 65,
    };

    renderComponent({
      snapshot: stealSnapshot,
      currentNickname: 'David',
      currentPlayerId: 'p4', // Teammate on Team 2, but Charlie is spokesperson
    });

    expect(screen.getByTestId('teammate-consult-banner')).toBeInTheDocument();
    expect(
      screen.getByText(/Consult together! Charlie has the floor to submit your team's steal answer/i)
    ).toBeInTheDocument();

    // No input forms
    expect(screen.queryByTestId('spokesperson-steal-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('player-guess-form')).not.toBeInTheDocument();
  });

  it('satisfies Scenario 4: defending team players see fingers crossed prompt without active input', () => {
    const stealSnapshot: TeamGuessingSessionState = {
      ...baseSnapshot,
      phase: 'STEAL_PHASE',
      strikes: 3,
      roundBank: 65,
    };

    renderComponent({
      snapshot: stealSnapshot,
      currentNickname: 'Alice',
      currentPlayerId: 'p1', // Team 1 player (at 3 strikes)
    });

    expect(screen.getByTestId('defending-team-banner')).toBeInTheDocument();
    expect(
      screen.getByText(/Fingers crossed! Waiting to see if the opposing team steals your points.../i)
    ).toBeInTheDocument();

    expect(screen.queryByTestId('spokesperson-steal-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('player-guess-form')).not.toBeInTheDocument();
  });

  it('satisfies Scenarios 1 & 2: displays mobile steal resolution banner on stealResolved', () => {
    const stealSnapshot: TeamGuessingSessionState = {
      ...baseSnapshot,
      phase: 'RESOLVED',
      winningTeam: 'TEAM_2',
      roundBank: 65,
    };

    const { rerender } = renderComponent({
      snapshot: stealSnapshot,
      currentNickname: 'Charlie',
      currentPlayerId: 'p3',
      stealResolved: {
        roomCode: 'FEUD-5555',
        success: true,
        outcome: 'STEAL_SUCCESS',
        winningTeam: 'TEAM_2',
        pointsAwarded: 65,
        roundBank: 65,
        stealingPlayer: { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
        remainingAnswers: [],
        message: 'Steal successful!',
      },
    });

    expect(screen.getByTestId('mobile-steal-resolved-banner')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-steal-outcome-text')).toHaveTextContent(
      'Steal Successful! Team 2 stole 65 points!'
    );

    // Failed steal banner
    rerender(
      <LanguageProvider>
        <MainGameTeamController
          snapshot={stealSnapshot}
          currentNickname="Alice"
          currentPlayerId="p1"
          roomCode="FEUD-5555"
          roomName="Family Feud Championship"
          stealResolved={{
            roomCode: 'FEUD-5555',
            success: false,
            outcome: 'STEAL_FAILED',
            winningTeam: 'TEAM_1',
            pointsAwarded: 65,
            roundBank: 65,
            stealingPlayer: { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
            remainingAnswers: [],
            message: 'Steal failed!',
          }}
        />
      </LanguageProvider>
    );

    expect(screen.getByTestId('mobile-steal-outcome-text')).toHaveTextContent(
      'Steal Failed! Team 1 retains 65 points!'
    );
  });

  it('invokes onLeave when leave button is clicked', () => {
    const onLeave = vi.fn();
    renderComponent({ onLeave });

    const leaveBtn = screen.getByTitle('Leave Room');
    fireEvent.click(leaveBtn);

    expect(onLeave).toHaveBeenCalled();
  });
  it('satisfies US-16 Scenario 1 & 2: renders scoreboard header with active round bank, grand totals, and highlights player team', () => {
    renderComponent({
      scoreboardState: {
        roomCode: 'FEUD-5555',
        team1GrandTotal: 120,
        team2GrandTotal: 65,
        activeRoundBank: 45,
        currentRoundNumber: 2,
        totalRounds: 3,
        phase: 'ROUND_IN_PROGRESS',
      },
      currentNickname: 'Alice',
      currentPlayerId: 'p1',
    });

    expect(screen.getByTestId('grand-total-header')).toBeInTheDocument();
    expect(screen.getByTestId('team1-grand-total')).toHaveTextContent('120');
    expect(screen.getByTestId('team2-grand-total')).toHaveTextContent('65');
    expect(screen.getByTestId('header-round-bank')).toHaveTextContent('45');
    // Alice is on Team 1 (controlling team in baseSnapshot), so Team 1 is highlighted without badge in mobile
    expect(screen.queryByTestId('your-team-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('team1-grand-total-card')).toHaveClass('ring-blue-400/40');
  });

  it('satisfies US-28: renders only members of own team in 2 columns instead of the survey board', () => {
    renderComponent({
      currentNickname: 'Alice',
      currentPlayerId: 'p1',
    });

    // Survey board slots are not in document
    expect(screen.queryByTestId('mobile-survey-board-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('player-card-slot-1')).not.toBeInTheDocument();

    // Only own team roster is rendered (Team 1) in 2 columns
    expect(screen.getByTestId('mobile-my-team-roster')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-team-player-p1')).toHaveTextContent('Alice');
    expect(screen.getByTestId('mobile-team-player-p1')).toHaveTextContent('(You)');
    expect(screen.getByTestId('mobile-team-player-p2')).toHaveTextContent('Bob');

    // Opposing team players (Charlie) are NOT rendered in team roster
    expect(screen.queryByTestId('mobile-team-player-p3')).not.toBeInTheDocument();
  });

  it('satisfies US-28: displays suspense banner on guess submission and withholds strike alert until host finishes reading answer', () => {
    const { rerender } = renderComponent();

    // Alice submits guess "Dog"
    const input = screen.getByTestId('player-guess-input');
    fireEvent.change(input, { target: { value: 'Dog' } });
    const submitBtn = screen.getByTestId('player-submit-guess-btn');
    fireEvent.click(submitBtn);

    // Controller displays suspense banner
    expect(screen.getByTestId('controller-survey-said-banner')).toBeInTheDocument();
    expect(screen.getByTestId('controller-survey-said-banner')).toHaveTextContent('Alice said “Dog”');
    expect(screen.getByTestId('controller-survey-said-banner')).toHaveTextContent('Survey said...');

    // Server emits strike_issued, but announcement is still pending
    rerender(
      <LanguageProvider>
        <MainGameTeamController
          snapshot={baseSnapshot}
          currentNickname="Alice"
          currentPlayerId="p1"
          roomCode="FEUD-5555"
          roomName="Family Feud Championship"
          strikeIssued={{
            roomCode: 'FEUD-5555',
            team: 'TEAM_1',
            strikeCount: 2,
            maxStrikes: 3,
            player: { id: 'p1', nickname: 'Alice' },
            rawAnswer: 'Dog',
          }}
        />
      </LanguageProvider>
    );

    // Strike alert overlay is withheld while announcement is pending
    expect(screen.queryByTestId('mobile-strike-alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('controller-survey-said-banner')).toBeInTheDocument();

    // Host finishes reading: answerRevealCompleted arrives
    rerender(
      <LanguageProvider>
        <MainGameTeamController
          snapshot={baseSnapshot}
          currentNickname="Alice"
          currentPlayerId="p1"
          roomCode="FEUD-5555"
          roomName="Family Feud Championship"
          answerRevealCompleted={{ roomCode: 'FEUD-5555' }}
        />
      </LanguageProvider>
    );

    // Suspense banner clears and strike alert is now revealed!
    expect(screen.queryByTestId('controller-survey-said-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-strike-alert')).toBeInTheDocument();
  });

  it('satisfies US-28: strikes are withheld on mobile strike boxes and alert banner until host has read the answer', () => {
    // Controller is active during team turn with 0 strikes
    const { rerender } = renderComponent({
      snapshot: {
        ...baseSnapshot,
        strikes: 0,
      },
      currentNickname: 'David',
      currentPlayerId: 'p2',
    });

    // Teammate Alice answers wrong: server emits updated snapshot with strikes: 1, teamGuessSubmitted and strikeIssued
    rerender(
      <LanguageProvider>
        <MainGameTeamController
          snapshot={{
            ...baseSnapshot,
            strikes: 1,
          }}
          currentNickname="David"
          currentPlayerId="p2"
          roomCode="FEUD-5555"
          roomName="Family Feud Championship"
          teamGuessSubmitted={{
            roomCode: 'FEUD-5555',
            playerId: 'p1',
            playerNickname: 'Alice',
            rawAnswer: 'Airplane',
          }}
          strikeIssued={{
            roomCode: 'FEUD-5555',
            team: 'TEAM_1',
            strikeCount: 1,
            maxStrikes: 3,
            player: { id: 'p1', nickname: 'Alice' },
            rawAnswer: 'Airplane',
            isTimeout: false,
            isPass: false,
          }}
        />
      </LanguageProvider>
    );

    // 1. Strike boxes still show un-struck numbers before host finishes reading
    expect(screen.getByTestId('player-strike-box-1')).toHaveTextContent('1');
    expect(screen.getByTestId('player-strike-box-2')).toHaveTextContent('2');
    expect(screen.getByTestId('player-strike-box-3')).toHaveTextContent('3');

    // 2. Strike alert banner is withheld while host is reading
    expect(screen.queryByTestId('mobile-strike-alert')).not.toBeInTheDocument();

    // 3. Suspense banner is visible on mobile
    expect(screen.getByTestId('controller-survey-said-banner')).toBeInTheDocument();
    expect(screen.getByTestId('controller-survey-said-banner')).toHaveTextContent('Alice said “Airplane”');

    // 4. Host finishes reading answer: answerRevealCompleted is received
    rerender(
      <LanguageProvider>
        <MainGameTeamController
          snapshot={{
            ...baseSnapshot,
            strikes: 1,
          }}
          currentNickname="David"
          currentPlayerId="p2"
          roomCode="FEUD-5555"
          roomName="Family Feud Championship"
          answerRevealCompleted={{ roomCode: 'FEUD-5555' }}
        />
      </LanguageProvider>
    );

    // 5. Strike is now revealed on mobile at the exact same time as host!
    expect(screen.queryByTestId('controller-survey-said-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-strike-box-1')).toHaveTextContent('X');
    expect(screen.getByTestId('mobile-strike-alert')).toBeInTheDocument();
  });
});
