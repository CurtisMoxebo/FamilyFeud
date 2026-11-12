import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MainGameFaceOffController } from '../src/components/MainGameFaceOffController';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { FaceOffSessionState } from '../src/types';

describe('US-12: Mobile Player Face-Off Controller & Buzzer (MainGameFaceOffController)', () => {
  const baseSnapshot: FaceOffSessionState = {
    roomCode: 'FEUD-CTRL',
    gameId: 'game-ctrl',
    roundNumber: 1,
    language: 'EN',
    phase: 'AWAITING_READY',
    question: {
      id: 'q-ctrl',
      questionText: 'Name a reason you might be late for work',
      answers: [
        { id: 'a1', answerText: 'TRAFFIC', points: 40, rankOrder: 1 },
        { id: 'a2', answerText: 'ALARM', points: 35, rankOrder: 2 },
      ],
    },
    team1Players: [
      { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
      { id: 'p3', nickname: 'Charlie', team: 'TEAM_1', battingOrder: 2 },
    ],
    team2Players: [
      { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
      { id: 'p4', nickname: 'Diana', team: 'TEAM_2', battingOrder: 2 },
    ],
    team1Contender: { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1, isReady: false },
    team2Contender: { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1, isReady: false },
    buzzerLocked: false,
    buzzedPlayerId: null,
    buzzedPlayerNickname: null,
    buzzedPlayerTeam: null,
    buzzedAtTimestamp: null,
    activeRespondentId: null,
    attemptedPlayerIds: [],
    initialBuzzerWinnerId: null,
    timerDurationSeconds: 15,
    remainingSeconds: 15,
    endsAt: null,
    isTimerRunning: false,
  };

  const renderController = (
    props: Partial<React.ComponentProps<typeof MainGameFaceOffController>> = {}
  ) => {
    return render(
      <LanguageProvider initialLanguage="EN">
        <MainGameFaceOffController
          snapshot={baseSnapshot}
          currentNickname="Alice"
          currentPlayerId="p1"
          roomCode="FEUD-CTRL"
          {...props}
        />
      </LanguageProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('satisfies Scenario 1: displays "I\'m Ready!" button for unconfirmed contender and triggers onReady callback', () => {
    const handleReady = vi.fn();
    renderController({ onReady: handleReady });

    expect(screen.getByTestId('role-contender-badge')).toBeInTheDocument();
    const readyBtn = screen.getByTestId('face-off-ready-btn');
    expect(readyBtn).toHaveTextContent("I'm Ready!");

    fireEvent.click(readyBtn);
    expect(handleReady).toHaveBeenCalledTimes(1);
  });

  it('satisfies Scenario 1: displays waiting state when contender confirms ready while waiting for opponent', () => {
    const readySnapshot: FaceOffSessionState = {
      ...baseSnapshot,
      team1Contender: { ...baseSnapshot.team1Contender, isReady: true },
    };

    renderController({ snapshot: readySnapshot });

    const waitingCard = screen.getByTestId('face-off-waiting-badge');
    expect(waitingCard).toBeInTheDocument();
    expect(waitingCard).toHaveTextContent('Waiting for Bob...');
  });

  it('satisfies Scenario 1: displays spectator view and cheer prompt for non-contender teammates', () => {
    renderController({
      currentNickname: 'Charlie',
      currentPlayerId: 'p3',
    });

    expect(screen.getByTestId('role-spectator-badge')).toBeInTheDocument();
    const spectatorCard = screen.getByTestId('face-off-spectator-badge');
    expect(spectatorCard).toHaveTextContent('Spectator — Cheer on your contender!');
    expect(screen.queryByTestId('face-off-ready-btn')).not.toBeInTheDocument();
  });

  it('satisfies Scenario 2: renders giant mobile tactile buzzer button when BUZZER_ACTIVE and handles click', () => {
    const handleBuzz = vi.fn();
    const activeSnapshot: FaceOffSessionState = {
      ...baseSnapshot,
      phase: 'BUZZER_ACTIVE',
      team1Contender: { ...baseSnapshot.team1Contender, isReady: true },
      team2Contender: { ...baseSnapshot.team2Contender, isReady: true },
    };

    renderController({
      snapshot: activeSnapshot,
      onBuzz: handleBuzz,
    });

    // Question visible
    expect(screen.getByTestId('controller-question-text')).toHaveTextContent(
      'Name a reason you might be late for work'
    );

    // Giant tactile buzzer button
    const buzzerBtn = screen.getByTestId('face-off-buzzer-btn');
    expect(buzzerBtn).toHaveTextContent('BUZZ!');

    fireEvent.click(buzzerBtn);
    expect(handleBuzz).toHaveBeenCalledTimes(1);
  });

  it('satisfies Scenario 2: winner receives 15-second timer ring and answer submission form', () => {
    const handleSubmitAnswer = vi.fn();
    const answeringSnapshot: FaceOffSessionState = {
      ...baseSnapshot,
      phase: 'ANSWERING',
      buzzerLocked: true,
      buzzedPlayerId: 'p1',
      buzzedPlayerNickname: 'Alice',
      buzzedPlayerTeam: 'TEAM_1',
      activeRespondentId: 'p1',
      isTimerRunning: true,
      remainingSeconds: 15,
    };

    renderController({
      snapshot: answeringSnapshot,
      onSubmitAnswer: handleSubmitAnswer,
    });

    // Winner banner shows personalized message for the player who buzzed first
    expect(screen.getByTestId('controller-winner-banner')).toHaveTextContent('You buzzed first!');

    // 15-second countdown timer ring
    expect(screen.getByTestId('controller-timer-ring')).toBeInTheDocument();
    expect(screen.getByTestId('controller-seconds-remaining')).toHaveTextContent('15');

    // Answer input field
    const input = screen.getByTestId('face-off-answer-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Type your answer...');

    // Type and submit answer
    fireEvent.change(input, { target: { value: 'Traffic jam' } });
    const submitBtn = screen.getByTestId('face-off-submit-btn');
    fireEvent.click(submitBtn);

    expect(handleSubmitAnswer).toHaveBeenCalledWith('Traffic jam');
    expect(screen.getByTestId('controller-submitted-card')).toHaveTextContent('Traffic jam');
    // Once player answers, {player name} buzzed first! is never shown again
    expect(screen.queryByTestId('controller-winner-banner')).not.toBeInTheDocument();
  });

  it('satisfies Scenario 2: opponent displays locked out card with red lockout badge', () => {
    const answeringSnapshot: FaceOffSessionState = {
      ...baseSnapshot,
      phase: 'ANSWERING',
      buzzerLocked: true,
      buzzedPlayerId: 'p1',
      buzzedPlayerNickname: 'Alice',
      buzzedPlayerTeam: 'TEAM_1',
      activeRespondentId: 'p1',
      isTimerRunning: true,
    };

    // Render as Bob (opponent on Team 2)
    renderController({
      snapshot: answeringSnapshot,
      currentNickname: 'Bob',
      currentPlayerId: 'p2',
    });

    // Lockout card
    const lockoutCard = screen.getByTestId('face-off-lockout-card');
    expect(lockoutCard).toBeInTheDocument();
    expect(lockoutCard).toHaveTextContent('LOCKED OUT');
    expect(lockoutCard).toHaveTextContent("Alice's turn to answer");
    expect(screen.getByTestId('controller-winner-banner')).toHaveTextContent('Alice buzzed first!');

    // Answer input is not available for locked out opponent
    expect(screen.queryByTestId('face-off-answer-input')).not.toBeInTheDocument();
  });

  it('satisfies Scenario 3: hand-off occurs without removed banner, Bob gets to type, and Alice receives mobile strike X overlay', () => {
    const handoffSnapshot: FaceOffSessionState = {
      ...baseSnapshot,
      phase: 'OPPONENT_GUESS',
      buzzerLocked: true,
      buzzedPlayerId: 'p1',
      activeRespondentId: 'p2', // Cascaded to Bob
      remainingSeconds: 15,
      firstGuessResult: {
        playerId: 'p1',
        playerNickname: 'Alice',
        playerTeam: 'TEAM_1',
        rawAnswer: '',
        isMatched: false,
        points: 0,
        rankOrder: undefined,
        isNumberOneAnswer: false,
      },
    };

    const timeoutPayload = {
      roomCode: 'FEUD-CTRL',
      type: 'HAND_OFF' as const,
      timedOutPlayerId: 'p1',
      timedOutPlayerNickname: 'Alice',
      timedOutPlayerTeam: 'TEAM_1' as const,
      nextPlayerId: 'p2',
      nextPlayerNickname: 'Bob',
      nextPlayerTeam: 'TEAM_2' as const,
    };

    // 1. Render as Bob (opponent who failed to buzz first, but now turn arrives)
    const { rerender } = renderController({
      snapshot: handoffSnapshot,
      currentNickname: 'Bob',
      currentPlayerId: 'p2',
      timeoutResult: timeoutPayload,
    });

    // Removed "Time's up! Turn passed to Bob" banner is NOT present
    expect(screen.queryByTestId('controller-timeout-alert')).not.toBeInTheDocument();

    // Bob does NOT see LOCKED OUT anymore, and gets to type!
    expect(screen.queryByTestId('face-off-lockout-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('face-off-answer-input')).toBeInTheDocument();
    expect(screen.getByTestId('face-off-submit-btn')).toBeInTheDocument();

    // 2. Render as Alice (the player who buzzed first and failed to answer in time)
    rerender(
      <LanguageProvider initialLanguage="EN">
        <MainGameFaceOffController
          snapshot={handoffSnapshot}
          currentNickname="Alice"
          currentPlayerId="p1"
          roomCode="FEUD-CTRL"
          timeoutResult={timeoutPayload}
        />
      </LanguageProvider>
    );

    // Alice receives giant strike X overlay on mobile
    const overlay = screen.getByTestId('mobile-strike-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveTextContent('X');
    expect(overlay).toHaveTextContent("TIME'S UP!");

    // Alice does NOT see LOCKED OUT (she buzzed first, only player who failed to buzz first sees locked out)
    expect(screen.queryByTestId('face-off-lockout-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('face-off-answer-input')).not.toBeInTheDocument();
  });

  it('guarantees strike X overlay auto-dismisses after 2000ms', () => {
    vi.useFakeTimers();

    renderController({
      currentNickname: 'Alice',
      currentPlayerId: 'p1',
      timeoutResult: {
        roomCode: 'FEUD-CTRL',
        type: 'HAND_OFF',
        timedOutPlayerId: 'p1',
        timedOutPlayerNickname: 'Alice',
        timedOutPlayerTeam: 'TEAM_1',
      },
    });

    // Overlay is active initially
    expect(screen.getByTestId('mobile-strike-overlay')).toBeInTheDocument();

    // Advance timer past 2000ms
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    // Overlay has disappeared cleanly
    expect(screen.queryByTestId('mobile-strike-overlay')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('satisfies Scenario 5: displays deadlock reset alert when both time out without answer', () => {
    renderController({
      timeoutResult: {
        roomCode: 'FEUD-CTRL',
        type: 'DEADLOCK_RESET',
        timedOutPlayerId: 'p2',
        timedOutPlayerNickname: 'Bob',
        timedOutPlayerTeam: 'TEAM_2',
        message: 'All contenders timed out without an answer. Generating replacement survey question.',
      },
    });

    expect(screen.getByTestId('controller-timeout-alert')).toHaveTextContent(
      'No answers given! Loading new question...'
    );
  });

  it('displays buzzer rejection alert when buzzer rejected payload arrives', () => {
    renderController({
      buzzerRejected: {
        roomCode: 'FEUD-CTRL',
        playerId: 'p1',
        reason: 'BUZZER_LOCKED',
      },
    });

    expect(screen.getByTestId('buzzer-rejected-alert')).toHaveTextContent(
      'Buzzer locked! Opponent buzz arrived first.'
    );
  });

  describe('US-13: Mobile Player Pass or Play Decision Modal & Opponent Guess Turn', () => {
    it('satisfies Scenario 1 & 6: winning contender receives Pass or Play modal, #1 badge, and clicking PLAY triggers onChoosePlayPass', () => {
      const handleChoosePlayPass = vi.fn();
      const passPlaySnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'PASS_OR_PLAY',
        winnerPlayerId: 'p1',
        winnerNickname: 'Alice',
        winnerTeam: 'TEAM_1',
        firstGuessResult: {
          playerId: 'p1',
          playerNickname: 'Alice',
          playerTeam: 'TEAM_1',
          rawAnswer: 'traffic',
          isMatched: true,
          points: 40,
          rankOrder: 1,
          isNumberOneAnswer: true,
        },
      };

      renderController({
        snapshot: passPlaySnapshot,
        onChoosePlayPass: handleChoosePlayPass,
      });

      // Pass or Play Modal
      const modal = screen.getByTestId('face-off-pass-play-modal');
      expect(modal).toBeInTheDocument();
      expect(screen.getByText('Play or Pass?')).toBeInTheDocument();
      expect(screen.getByTestId('number-one-badge')).toHaveTextContent('#1 ANSWER!');

      // Action buttons (horizontally aligned side-by-side)
      const playBtn = screen.getByTestId('face-off-play-btn');
      const passBtn = screen.getByTestId('face-off-pass-btn');
      expect(playBtn).toBeInTheDocument();
      expect(passBtn).toBeInTheDocument();
      expect(playBtn.parentElement).toHaveClass('grid-cols-2');

      // Click PLAY
      fireEvent.click(playBtn);
      expect(handleChoosePlayPass).toHaveBeenCalledWith('play');
    });

    it('satisfies Scenario 7: winning contender clicks PASS to transfer control to opponent', () => {
      const handleChoosePlayPass = vi.fn();
      const passPlaySnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'PASS_OR_PLAY',
        winnerPlayerId: 'p1',
        winnerNickname: 'Alice',
        winnerTeam: 'TEAM_1',
      };

      renderController({
        snapshot: passPlaySnapshot,
        onChoosePlayPass: handleChoosePlayPass,
      });

      const passBtn = screen.getByTestId('face-off-pass-btn');
      fireEvent.click(passBtn);
      expect(handleChoosePlayPass).toHaveBeenCalledWith('pass');
    });

    it('satisfies Scenario 1 & 3: opponent / spectator displays waiting banner during PASS_OR_PLAY phase', () => {
      const passPlaySnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'PASS_OR_PLAY',
        winnerPlayerId: 'p1',
        winnerNickname: 'Alice',
        winnerTeam: 'TEAM_1',
      };

      // Render as Bob (opponent on Team 2)
      renderController({
        snapshot: passPlaySnapshot,
        currentNickname: 'Bob',
        currentPlayerId: 'p2',
      });

      const spectatorCard = screen.getByTestId('face-off-pass-play-spectator');
      expect(spectatorCard).toBeInTheDocument();
      expect(spectatorCard).toHaveTextContent('Waiting for Alice to choose Play or Pass...');

      // Buttons are NOT rendered for opponent
      expect(screen.queryByTestId('face-off-play-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('face-off-pass-btn')).not.toBeInTheDocument();
    });

    it('satisfies Scenario 2 & 3: opponent receives challenge prompt and active input form in OPPONENT_GUESS phase', () => {
      const handleSubmitAnswer = vi.fn();
      const oppGuessSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'OPPONENT_GUESS',
        activeRespondentId: 'p2',
        firstGuessResult: {
          playerId: 'p1',
          playerNickname: 'Alice',
          playerTeam: 'TEAM_1',
          rawAnswer: 'alarm clock',
          isMatched: true,
          points: 35,
          rankOrder: 2,
          isNumberOneAnswer: false,
        },
      };

      // Render as Bob (Contender 2)
      renderController({
        snapshot: oppGuessSnapshot,
        currentNickname: 'Bob',
        currentPlayerId: 'p2',
        onSubmitAnswer: handleSubmitAnswer,
      });

      // Opponent Challenge Banner
      const challengeBanner = screen.getByTestId('controller-opponent-challenge-banner');
      expect(challengeBanner).toHaveTextContent('Can you beat alarm clock (35 pts)?');

      // Bob has the active input form
      const input = screen.getByTestId('face-off-answer-input');
      expect(input).toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'Traffic' } });
      const submitBtn = screen.getByTestId('face-off-submit-btn');
      fireEvent.click(submitBtn);

      expect(handleSubmitAnswer).toHaveBeenCalledWith('Traffic');
      expect(screen.getByTestId('controller-submitted-card')).toHaveTextContent('Traffic');
    });

    it('satisfies Scenario 4: displays steal challenge banner when Contender 1 misses', () => {
      const oppMissSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'OPPONENT_GUESS',
        activeRespondentId: 'p2',
        firstGuessResult: {
          playerId: 'p1',
          playerNickname: 'Alice',
          playerTeam: 'TEAM_1',
          rawAnswer: 'coffee spill',
          isMatched: false,
          points: 0,
          isNumberOneAnswer: false,
        },
      };

      // Render as Bob
      renderController({
        snapshot: oppMissSnapshot,
        currentNickname: 'Bob',
        currentPlayerId: 'p2',
      });

      const challengeBanner = screen.getByTestId('controller-opponent-challenge-banner');
      expect(challengeBanner).toHaveTextContent(
        'Alice missed! Any valid answer on the board wins the Face-Off!'
      );
    });

    it('displays "You missed! Any valid answer on the board wins the Face-Off!" on the screen of the player who missed', () => {
      const oppMissSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'OPPONENT_GUESS',
        activeRespondentId: 'p2',
        firstGuessResult: {
          playerId: 'p1',
          playerNickname: 'Alice',
          playerTeam: 'TEAM_1',
          rawAnswer: 'coffee spill',
          isMatched: false,
          points: 0,
          isNumberOneAnswer: false,
        },
      };

      // Render as Alice (the player who missed)
      renderController({
        snapshot: oppMissSnapshot,
        currentNickname: 'Alice',
        currentPlayerId: 'p1',
      });

      const challengeBanner = screen.getByTestId('controller-opponent-challenge-banner');
      expect(challengeBanner).toHaveTextContent(
        'You missed! Any valid answer on the board wins the Face-Off!'
      );
    });

    it('satisfies Scenario 2: non-active contender displays waiting card while opponent is answering', () => {
      const oppGuessSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'OPPONENT_GUESS',
        activeRespondentId: 'p2',
      };

      // Render as Alice (waiting for Bob)
      renderController({
        snapshot: oppGuessSnapshot,
        currentNickname: 'Alice',
        currentPlayerId: 'p1',
      });

      const waitingCard = screen.getByTestId('opponent-turn-waiting-card');
      expect(waitingCard).toBeInTheDocument();
      expect(waitingCard).toHaveTextContent('Bob (Team 2) is answering to steal control');
      expect(screen.queryByTestId('face-off-answer-input')).not.toBeInTheDocument();
    });

    it('satisfies Scenario 6 & 7: renders round control assigned announcement banner for PLAY and PASS decisions', () => {
      const controlAssignedSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'ROUND_CONTROL_ASSIGNED',
        winnerPlayerId: 'p1',
        winnerNickname: 'Alice',
        winnerTeam: 'TEAM_1',
        controllingTeam: 'TEAM_1',
        passOrPlayDecision: 'play',
      };

      const { rerender } = renderController({
        snapshot: controlAssignedSnapshot,
      });

      const banner = screen.getByTestId('controller-round-control-banner');
      expect(banner).toHaveTextContent('Team 1 has chosen to PLAY!');

      // Rerender with PASS decision
      const passControlSnapshot: FaceOffSessionState = {
        ...controlAssignedSnapshot,
        controllingTeam: 'TEAM_2',
        passOrPlayDecision: 'pass',
      };

      rerender(
        <LanguageProvider initialLanguage="EN">
          <MainGameFaceOffController
            snapshot={passControlSnapshot}
            currentNickname="Alice"
            currentPlayerId="p1"
            roomCode="FEUD-CTRL"
          />
        </LanguageProvider>
      );

      expect(screen.getByTestId('controller-round-control-banner')).toHaveTextContent(
        'Control passes to Team 2!'
      );
    });
    it('satisfies US-16 Scenario 1: renders persistent grand total header and highlights player personal team', () => {
      renderController({
        scoreboardState: {
          roomCode: 'FEUD-CTRL',
          team1GrandTotal: 150,
          team2GrandTotal: 85,
          activeRoundBank: 0,
          currentRoundNumber: 2,
          totalRounds: 3,
          phase: 'ROUND_IN_PROGRESS',
        },
        currentNickname: 'Alice',
        currentPlayerId: 'p1',
      });

      expect(screen.getByTestId('grand-total-header')).toBeInTheDocument();
      expect(screen.getByTestId('team1-grand-total')).toHaveTextContent('150');
      expect(screen.getByTestId('team2-grand-total')).toHaveTextContent('85');
      // Alice is on Team 1, so Team 1 is highlighted with ring glow (badge hidden on mobile)
      expect(screen.queryByTestId('your-team-badge')).not.toBeInTheDocument();
      expect(screen.getByTestId('team1-grand-total-card')).toHaveClass('ring-blue-400/40');
    });

    it('renders only members of own team in 2 columns during face-off', () => {
      renderController({
        currentNickname: 'Alice',
        currentPlayerId: 'p1',
      });

      expect(screen.getByTestId('face-off-my-team-roster')).toBeInTheDocument();

      // Team 1 players Alice and Charlie
      expect(screen.getByTestId('face-off-team-player-p1')).toHaveTextContent('Alice');
      expect(screen.getByTestId('face-off-team-player-p1')).toHaveTextContent('(You)');
      expect(screen.getByTestId('face-off-team-player-p1')).toHaveTextContent('Duel');
      expect(screen.getByTestId('face-off-team-player-p3')).toHaveTextContent('Charlie');

      // Team 2 players (Bob, Diana) are NOT in my team roster
      expect(screen.queryByTestId('face-off-team-player-p2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('face-off-team-player-p4')).not.toBeInTheDocument();
    });

    it('displays a 5-second countdown timer on the controller screen when both face-off contenders are ready before game starts', () => {
      renderController({
        snapshot: {
          ...baseSnapshot,
          team1Contender: { ...baseSnapshot.team1Contender, isReady: true },
          team2Contender: { ...baseSnapshot.team2Contender, isReady: true },
        },
        initialReadyCountdown: 5,
      });

      // 5-second countdown card displayed
      expect(screen.getByTestId('face-off-ready-countdown')).toBeInTheDocument();
      expect(screen.getByTestId('face-off-ready-seconds')).toHaveTextContent('5');
      expect(screen.getByText(/Game starts in 5s\.\.\./i)).toBeInTheDocument();

      // Buzzer button is not visible / armed during countdown
      expect(screen.queryByTestId('face-off-buzzer-btn')).not.toBeInTheDocument();
    });

    it('satisfies US-28: displays suspense banner and withholds Pass/Play modal until host finishes reading answer', () => {
      const answeringSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'ANSWERING',
        buzzerLocked: true,
        buzzedPlayerId: 'p1',
        buzzedPlayerNickname: 'Alice',
        activeRespondentId: 'p1',
      };

      const { rerender } = renderController({
        snapshot: answeringSnapshot,
      });

      // Submit an answer
      const input = screen.getByTestId('face-off-answer-input');
      fireEvent.change(input, { target: { value: 'Keys' } });
      const submitBtn = screen.getByTestId('face-off-submit-btn');
      fireEvent.click(submitBtn);

      // Controller immediately enters suspense state
      expect(screen.getByTestId('controller-survey-said-banner')).toBeInTheDocument();
      expect(screen.getByTestId('controller-survey-said-banner')).toHaveTextContent('Alice said “Keys”');
      expect(screen.getByTestId('controller-survey-said-banner')).toHaveTextContent('Survey said...');

      // Server transitions to PASS_OR_PLAY, but announcement is still pending
      const passPlaySnapshot: FaceOffSessionState = {
        ...answeringSnapshot,
        phase: 'PASS_OR_PLAY',
        winnerPlayerId: 'p1',
        winnerNickname: 'Alice',
        winnerTeam: 'TEAM_1',
      };

      rerender(
        <LanguageProvider initialLanguage="EN">
          <MainGameFaceOffController
            snapshot={passPlaySnapshot}
            currentNickname="Alice"
            currentPlayerId="p1"
            roomCode="FEUD-CTRL"
          />
        </LanguageProvider>
      );

      // Pass/Play modal is withheld while suspense banner is active
      expect(screen.queryByTestId('face-off-pass-play-modal')).not.toBeInTheDocument();
      expect(screen.getByTestId('controller-survey-said-banner')).toBeInTheDocument();

      // Host finishes reading: answerRevealCompleted arrives
      rerender(
        <LanguageProvider initialLanguage="EN">
          <MainGameFaceOffController
            snapshot={passPlaySnapshot}
            answerRevealCompleted={{ roomCode: 'FEUD-CTRL' }}
            currentNickname="Alice"
            currentPlayerId="p1"
            roomCode="FEUD-CTRL"
          />
        </LanguageProvider>
      );

      // Now suspense banner is cleared and Pass/Play modal is revealed!
      expect(screen.queryByTestId('controller-survey-said-banner')).not.toBeInTheDocument();
      expect(screen.getByTestId('face-off-pass-play-modal')).toBeInTheDocument();
    });

    it('satisfies next round face-off: contender and spectator mobile screens see only ready screen without answer input or lockout card despite stale props', () => {
      // Stale props from previous round
      const staleProps = {
        buzzerLocked: {
          roomCode: 'FEUD-CTRL',
          winnerPlayerId: 'p1',
          winnerNickname: 'Alice',
          winnerTeam: 'TEAM_1' as const,
          endsAt: Date.now() + 15000,
          duration: 15,
        },
        roundControlAssigned: {
          roomCode: 'FEUD-CTRL',
          winnerPlayerId: 'p1',
          winnerTeam: 'TEAM_1' as const,
          controllingTeam: 'TEAM_1' as const,
          controllingTeamName: 'Team 1',
          decision: 'play' as const,
          message: 'Team 1 plays!',
        },
        faceOffAnswerSubmitted: {
          roomCode: 'FEUD-CTRL',
          playerId: 'p1',
          playerNickname: 'Alice',
          rawAnswer: 'Previous Answer',
        },
      };

      // Round 2 face-off contenders are p3 (Charlie, Team 1) and p4 (Diana, Team 2)
      const round2Snapshot: FaceOffSessionState = {
        ...baseSnapshot,
        roundNumber: 2,
        phase: 'AWAITING_READY',
        buzzerLocked: false,
        team1Players: [
          { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
          { id: 'p3', nickname: 'Charlie', team: 'TEAM_1', battingOrder: 2 },
        ],
        team2Players: [
          { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
          { id: 'p4', nickname: 'Diana', team: 'TEAM_2', battingOrder: 2 },
        ],
        team1Contender: { id: 'p3', nickname: 'Charlie', team: 'TEAM_1', battingOrder: 2, isReady: false },
        team2Contender: { id: 'p4', nickname: 'Diana', team: 'TEAM_2', battingOrder: 2, isReady: false },
      };

      // 1. Render as Contender (Charlie, p3)
      const { rerender } = render(
        <LanguageProvider initialLanguage="EN">
          <MainGameFaceOffController
            snapshot={round2Snapshot}
            currentNickname="Charlie"
            currentPlayerId="p3"
            roomCode="FEUD-CTRL"
            {...staleProps}
          />
        </LanguageProvider>
      );

      // Contender sees "I'm Ready!" button
      expect(screen.getByTestId('face-off-ready-btn')).toBeInTheDocument();
      // NO extra elements: No answer form, no lockout card, no round control banner, no winner banner, no timer ring
      expect(screen.queryByTestId('face-off-answer-form')).not.toBeInTheDocument();
      expect(screen.queryByTestId('face-off-answer-input')).not.toBeInTheDocument();
      expect(screen.queryByTestId('face-off-lockout-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('controller-winner-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('controller-timer-ring')).not.toBeInTheDocument();
      expect(screen.queryByTestId('controller-round-control-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('controller-survey-said-banner')).not.toBeInTheDocument();

      // 2. Render as Spectator/Teammate (Alice, p1)
      rerender(
        <LanguageProvider initialLanguage="EN">
          <MainGameFaceOffController
            snapshot={round2Snapshot}
            currentNickname="Alice"
            currentPlayerId="p1"
            roomCode="FEUD-CTRL"
            {...staleProps}
          />
        </LanguageProvider>
      );

      // Spectator sees spectator badge with contenders listed
      const spectatorBadge = screen.getByTestId('face-off-spectator-badge');
      expect(spectatorBadge).toHaveTextContent(/Charlie/i);
      expect(spectatorBadge).toHaveTextContent(/Diana/i);
      // NO extra elements: No ready button, no answer form, no lockout card, no round control banner
      expect(screen.queryByTestId('face-off-ready-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('face-off-answer-form')).not.toBeInTheDocument();
      expect(screen.queryByTestId('face-off-lockout-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('controller-winner-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('controller-timer-ring')).not.toBeInTheDocument();
      expect(screen.queryByTestId('controller-round-control-banner')).not.toBeInTheDocument();
    });

    it('ensures timed-out contender cannot see or type into answer input and sees waiting/lockout status', () => {
      // Alice timed out (phase transitioned to OPPONENT_GUESS with Bob as respondent)
      const timedOutSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'OPPONENT_GUESS',
        buzzedPlayerId: 'p1',
        activeRespondentId: 'p2',
        buzzerLocked: true,
        remainingSeconds: 12,
        firstGuessResult: {
          playerId: 'p1',
          playerNickname: 'Alice',
          playerTeam: 'TEAM_1',
          rawAnswer: '',
          isMatched: false,
          points: 0,
          rankOrder: undefined,
          isNumberOneAnswer: false,
        },
      };

      const { rerender } = renderController({
        snapshot: timedOutSnapshot,
        currentNickname: 'Alice',
        currentPlayerId: 'p1',
      });

      // Alice CANNOT see or write in answer input
      expect(screen.queryByTestId('face-off-answer-input')).not.toBeInTheDocument();
      expect(screen.queryByTestId('face-off-answer-form')).not.toBeInTheDocument();

      // Alice sees opponent turn waiting card
      expect(screen.getByTestId('opponent-turn-waiting-card')).toBeInTheDocument();

      // In ANSWERING phase, opponent (Bob) sees lockout card and cannot see input
      const answeringSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'ANSWERING',
        buzzedPlayerId: 'p1',
        activeRespondentId: 'p1',
        buzzerLocked: true,
        remainingSeconds: 15,
      };

      rerender(
        <LanguageProvider initialLanguage="EN">
          <MainGameFaceOffController
            snapshot={answeringSnapshot}
            currentNickname="Bob"
            currentPlayerId="p2"
            roomCode="FEUD-CTRL"
          />
        </LanguageProvider>
      );

      expect(screen.queryByTestId('face-off-answer-input')).not.toBeInTheDocument();
      expect(screen.getByTestId('face-off-lockout-card')).toBeInTheDocument();
    });

    it('ensures only designated original contender gets Pass or Play buttons even if teammate gave winning answer', () => {
      // In cascading face-off, Team 1 wins, winningTeamContender is Alice (p1).
      // Charlie (p3) was the teammate who answered, but is NOT the designated round contender.
      const passPlaySnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'PASS_OR_PLAY',
        winnerPlayerId: 'p1', // strictly Alice
        winnerTeam: 'TEAM_1',
      };

      // 1. Designated Contender Alice (p1) views screen -> Sees Play and Pass buttons
      const { rerender } = renderController({
        snapshot: passPlaySnapshot,
        currentNickname: 'Alice',
        currentPlayerId: 'p1',
      });

      expect(screen.getByTestId('face-off-play-btn')).toBeInTheDocument();
      expect(screen.getByTestId('face-off-pass-btn')).toBeInTheDocument();
      expect(screen.queryByTestId('face-off-pass-play-spectator')).not.toBeInTheDocument();

      // 2. Teammate Charlie (p3) views screen -> Only sees spectator waiting card
      rerender(
        <LanguageProvider initialLanguage="EN">
          <MainGameFaceOffController
            snapshot={passPlaySnapshot}
            currentNickname="Charlie"
            currentPlayerId="p3"
            roomCode="FEUD-CTRL"
          />
        </LanguageProvider>
      );

      expect(screen.queryByTestId('face-off-play-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('face-off-pass-btn')).not.toBeInTheDocument();
      expect(screen.getByTestId('face-off-pass-play-spectator')).toBeInTheDocument();
    });

    it('guarantees {{player name} buzzed first!} / {You buzzed first!} section is never shown again after initial buzzer winner answers', () => {
      // Phase is OPPONENT_GUESS, first answer already submitted
      renderController({
        snapshot: {
          ...baseSnapshot,
          phase: 'OPPONENT_GUESS',
          buzzedPlayerId: 'p1',
          buzzerLocked: true,
          activeRespondentId: 'p2',
          firstGuessResult: {
            playerId: 'p1',
            playerNickname: 'Alice',
            playerTeam: 'TEAM_1',
            rawAnswer: 'Late bus',
            points: 15,
            isMatched: true,
            isNumberOneAnswer: false,
          },
        },
        currentNickname: 'Alice',
        currentPlayerId: 'p1',
      });

      expect(screen.queryByTestId('controller-winner-banner')).not.toBeInTheDocument();
    });
  });
});
