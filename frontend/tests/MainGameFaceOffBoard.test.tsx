import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MainGameFaceOffBoard } from '../src/components/MainGameFaceOffBoard';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { FaceOffSessionState } from '../src/types';
import * as ttsModule from '../src/utils/tts';
import * as soundModule from '../src/utils/soundEffects';

vi.mock('../src/utils/tts', () => ({
  speakQuestion: vi.fn(),
  cancelSpeech: vi.fn(),
}));

vi.mock('../src/utils/soundEffects', () => ({
  playFaceOffBuzzer: vi.fn(),
  sfx: {
    playFaceOffBuzzer: vi.fn(),
  },
}));

describe('US-12: Main Game Face-Off Host TV Stage & TTS Cutoff (MainGameFaceOffBoard)', () => {
  const baseSnapshot: FaceOffSessionState = {
    roomCode: 'FEUD-TEST',
    gameId: 'game-123',
    roundNumber: 1,
    language: 'EN',
    phase: 'AWAITING_READY',
    question: {
      id: 'q-1',
      questionText: 'Name something people often lose',
      roundNumber: 1,
      answers: [
        { id: 'a1', answerText: 'KEYS', points: 45, rankOrder: 1 },
        { id: 'a2', answerText: 'PHONE', points: 30, rankOrder: 2 },
        { id: 'a3', answerText: 'WALLET', points: 15, rankOrder: 3 },
      ],
    },
    team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
    team2Players: [{ id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 }],
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

  const renderBoard = (props: Partial<React.ComponentProps<typeof MainGameFaceOffBoard>> = {}) => {
    return render(
      <LanguageProvider initialLanguage="EN">
        <MainGameFaceOffBoard
          snapshot={baseSnapshot}
          roomName="Family Feud Championship"
          roomCode="FEUD-TEST"
          language="EN"
          {...props}
        />
      </LanguageProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('satisfies Scenario 1: displays contenders at podium in AWAITING_READY phase', () => {
    renderBoard();

    // Contender podiums
    expect(screen.getByTestId('c1-nickname')).toHaveTextContent('Alice');
    expect(screen.getByTestId('c2-nickname')).toHaveTextContent('Bob');

    // Awaiting banner
    expect(screen.getByTestId('face-off-awaiting-banner')).toBeInTheDocument();
    expect(screen.getByText(/Get ready for the Face-Off!/i)).toBeInTheDocument();

    // Round badge
    expect(screen.getByTestId('face-off-round-badge')).toHaveTextContent('Round 1');

    // TTS has not fired yet because phase is AWAITING_READY
    expect(ttsModule.speakQuestion).not.toHaveBeenCalled();
  });

  it('satisfies Scenario 1: displays survey question and initiates host TTS reading when BUZZER_ACTIVE', () => {
    const activeSnapshot: FaceOffSessionState = {
      ...baseSnapshot,
      phase: 'BUZZER_ACTIVE',
      team1Contender: { ...baseSnapshot.team1Contender, isReady: true },
      team2Contender: { ...baseSnapshot.team2Contender, isReady: true },
    };

    renderBoard({ snapshot: activeSnapshot });

    // Question text visible on board
    const questionEl = screen.getByTestId('face-off-question-text');
    expect(questionEl).toHaveTextContent('Name something people often lose');

    // Both contenders show ready badges
    expect(screen.getByTestId('c1-ready-badge')).toBeInTheDocument();
    expect(screen.getByTestId('c2-ready-badge')).toBeInTheDocument();

    // Armed cue visible
    expect(screen.getByTestId('buzzers-armed-cue')).toBeInTheDocument();

    // TTS initiated
    expect(ttsModule.speakQuestion).toHaveBeenCalledWith(
      'Name something people often lose',
      'EN'
    );
  });

  it('satisfies Scenario 2: cuts off host TTS immediately via cancelSpeech and plays buzzer cue when buzzer is locked', () => {
    const buzzerLockedSnapshot: FaceOffSessionState = {
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

    renderBoard({
      snapshot: buzzerLockedSnapshot,
      buzzerLocked: {
        roomCode: 'FEUD-TEST',
        winnerPlayerId: 'p1',
        winnerNickname: 'Alice',
        winnerTeam: 'TEAM_1',
        endsAt: Date.now() + 15000,
        duration: 15,
      },
    });

    // TTS CUTOFF: cancelSpeech called immediately
    expect(ttsModule.cancelSpeech).toHaveBeenCalled();

    // SOUND CUE: playFaceOffBuzzer played
    expect(soundModule.playFaceOffBuzzer).toHaveBeenCalled();

    // Winner highlighted
    expect(screen.getByTestId('c1-winner-badge')).toHaveTextContent('Alice buzzed first!');

    // Opponent locked out
    expect(screen.getByTestId('c2-lockout-badge')).toHaveTextContent('LOCKED OUT');

    // 15-second countdown timer ring displayed
    expect(screen.getByTestId('face-off-timer-ring')).toBeInTheDocument();
    expect(screen.getByTestId('face-off-seconds')).toHaveTextContent('15s');
  });

  it('satisfies Scenario 2: updates countdown timer dynamically from timerTick prop', () => {
    const answeringSnapshot: FaceOffSessionState = {
      ...baseSnapshot,
      phase: 'ANSWERING',
      buzzerLocked: true,
      buzzedPlayerId: 'p1',
      activeRespondentId: 'p1',
    };

    renderBoard({
      snapshot: answeringSnapshot,
      timerTick: {
        roomCode: 'FEUD-TEST',
        secondsRemaining: 4,
        endsAt: Date.now() + 4000,
      },
    });

    // Timer shows 4s with red warning text
    const secondsEl = screen.getByTestId('face-off-seconds');
    expect(secondsEl).toHaveTextContent('4s');
    expect(secondsEl.className).toContain('text-red-400');
  });

  it('satisfies Scenario 3: displays hand-off notice when timeout occurs', () => {
    renderBoard({
      timeoutResult: {
        roomCode: 'FEUD-TEST',
        type: 'HAND_OFF',
        timedOutPlayerId: 'p1',
        timedOutPlayerNickname: 'Alice',
        timedOutPlayerTeam: 'TEAM_1',
        nextPlayerId: 'p2',
        nextPlayerNickname: 'Bob',
        nextPlayerTeam: 'TEAM_2',
      },
    });

    const banner = screen.getByTestId('face-off-timeout-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("Time's up! Turn passed to Bob");
  });

  it('satisfies Scenario 5: displays deadlock reset alert and flips all survey answers open on the board', () => {
    const deadlockSnapshot: FaceOffSessionState = {
      ...baseSnapshot,
      phase: 'DEADLOCK_RESET',
    };

    renderBoard({
      snapshot: deadlockSnapshot,
      timeoutResult: {
        roomCode: 'FEUD-TEST',
        type: 'DEADLOCK_RESET',
        timedOutPlayerId: 'p2',
        timedOutPlayerNickname: 'Bob',
        timedOutPlayerTeam: 'TEAM_2',
        message: 'All contenders timed out without an answer. Generating replacement survey question.',
      },
    });

    // Deadlock banner
    const banner = screen.getByTestId('face-off-timeout-banner');
    expect(banner).toHaveTextContent('No answers given! Loading new question...');

    // Answers flipped open on board
    const answersBoard = screen.getByTestId('deadlock-answers-board');
    expect(answersBoard).toBeInTheDocument();
    expect(screen.getByTestId('deadlock-answer-1')).toHaveTextContent('KEYS');
    expect(screen.getByTestId('deadlock-answer-1')).toHaveTextContent('45 pts');
    expect(screen.getByTestId('deadlock-answer-2')).toHaveTextContent('PHONE');
    expect(screen.getByTestId('deadlock-answer-2')).toHaveTextContent('30 pts');
    expect(screen.getByTestId('deadlock-answer-3')).toHaveTextContent('WALLET');
    expect(screen.getByTestId('deadlock-answer-3')).toHaveTextContent('15 pts');
  });

  it('displays submitted answer card when respondent submits an answer', () => {
    const resolvedSnapshot: FaceOffSessionState = {
      ...baseSnapshot,
      phase: 'RESOLVED',
      buzzedPlayerNickname: 'Alice',
      submittedAnswer: 'Cell Phone',
    };

    renderBoard({ snapshot: resolvedSnapshot });

    const answerEl = screen.getByTestId('face-off-submitted-answer');
    expect(answerEl).toBeInTheDocument();
    expect(answerEl).toHaveTextContent('Cell Phone');
  });
});

