import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
          roomName="Family Feud Duel"
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

    // Winner banner
    expect(screen.getByTestId('controller-winner-banner')).toHaveTextContent('Alice buzzed first!');

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

    // Answer input is not available for locked out opponent
    expect(screen.queryByTestId('face-off-answer-input')).not.toBeInTheDocument();
  });

  it('satisfies Scenario 3: hand-off notice displayed and floor cascades to opponent on timeout', () => {
    const handoffSnapshot: FaceOffSessionState = {
      ...baseSnapshot,
      phase: 'ANSWERING',
      buzzerLocked: true,
      buzzedPlayerId: 'p1',
      activeRespondentId: 'p2', // Cascaded to Bob
      remainingSeconds: 15,
    };

    // Render as Bob (cascaded respondent)
    renderController({
      snapshot: handoffSnapshot,
      currentNickname: 'Bob',
      currentPlayerId: 'p2',
      timeoutResult: {
        roomCode: 'FEUD-CTRL',
        type: 'HAND_OFF',
        timedOutPlayerId: 'p1',
        timedOutPlayerNickname: 'Alice',
        timedOutPlayerTeam: 'TEAM_1',
        nextPlayerId: 'p2',
        nextPlayerNickname: 'Bob',
        nextPlayerTeam: 'TEAM_2',
      },
    });

    // Timeout alert
    expect(screen.getByTestId('controller-timeout-alert')).toHaveTextContent(
      "Time's up! Turn passed to Bob"
    );

    // Bob now has the active answer form
    expect(screen.getByTestId('face-off-answer-input')).toBeInTheDocument();
    expect(screen.getByTestId('face-off-submit-btn')).toBeInTheDocument();
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
});

