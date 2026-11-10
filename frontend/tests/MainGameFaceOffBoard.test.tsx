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
  speakPlayOrPassDecision: vi.fn(),
  getPlayOrPassPhrase: vi.fn(),
  isTtsMuted: vi.fn(() => false),
  setTtsMuted: vi.fn(),
  speakPlayerAnswerSurveySaid: vi.fn((_p, _a, _l, cb) => cb?.()),
}));

vi.mock('../src/utils/soundEffects', () => ({
  playBuzzerHit: vi.fn(),
  playFaceOffBuzzer: vi.fn(),
  playCorrectDing: vi.fn(),
  playDing: vi.fn(),
  playPointsChime: vi.fn(),
  sfx: {
    playBuzzerHit: vi.fn(),
  playFaceOffBuzzer: vi.fn(),
  playCorrectDing: vi.fn(),
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

    // Layout hierarchy: controls on top, grand total scores directly underneath, pending players in remaining space
    const board = screen.getByTestId('main-game-face-off-board');
    const children = Array.from(board.children);
    const controlsIndex = children.findIndex((el) => el.querySelector('[data-testid="face-off-round-badge"]'));
    const scoresIndex = children.findIndex((el) => el.querySelector('[data-testid="grand-total-header"]'));
    const pendingPlayersIndex = children.findIndex((el) => el.getAttribute('data-testid') === 'face-off-pending-players-section');

    expect(controlsIndex).toBe(0);
    expect(scoresIndex).toBe(1);
    expect(pendingPlayersIndex).toBe(2);
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

    // TTS initiated with Top N answers announcement (US-28)
    expect(ttsModule.speakQuestion).toHaveBeenCalledWith(
      'Top 3 answers on the board. Name something people often lose',
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
    expect(soundModule.playBuzzerHit).toHaveBeenCalled();

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

  describe('US-13: Face-Off Scoring, Card Flip-Board, and Pass or Play Decision', () => {
    it('satisfies Scenario 1: reveals #1 card with gold badge, triggers playDing, and shows Pass or Play prompt', () => {
      const p1WinSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'PASS_OR_PLAY',
        winnerPlayerId: 'p1',
        winnerNickname: 'Alice',
        winnerTeam: 'TEAM_1',
        revealedAnswers: [
          {
            id: 'a1',
            answerText: 'KEYS',
            points: 45,
            rankOrder: 1,
            revealedByPlayerId: 'p1',
            revealedByNickname: 'Alice',
            revealedByTeam: 'TEAM_1',
          },
        ],
        firstGuessResult: {
          playerId: 'p1',
          playerNickname: 'Alice',
          playerTeam: 'TEAM_1',
          rawAnswer: 'keys',
          isMatched: true,
          points: 45,
          rankOrder: 1,
          isNumberOneAnswer: true,
        },
      };

      renderBoard({ snapshot: p1WinSnapshot });

      // Survey board shows revealed card 1 and concealed cards 2 and 3
      const card1 = screen.getByTestId('face-off-card-1');
      expect(card1).toBeInTheDocument();
      expect(card1).toHaveTextContent('KEYS');
      expect(screen.getByTestId('face-off-points-1')).toHaveTextContent('45 pts');
      expect(screen.getByTestId('number-one-badge')).toHaveTextContent('#1 ANSWER');

      expect(screen.getByTestId('face-off-card-concealed-2')).toBeInTheDocument();
      expect(screen.getByTestId('face-off-card-concealed-3')).toBeInTheDocument();

      // Sound cue ding triggered
      expect(soundModule.playCorrectDing).toHaveBeenCalled();

      // Pass or Play banner
      const banner = screen.getByTestId('face-off-pass-play-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Waiting for Alice to choose Play or Pass...');
    });

    it('satisfies Scenario 2: displays opponent challenge banner when contender 1 does not find #1', () => {
      const oppTurnSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'OPPONENT_GUESS',
        activeRespondentId: 'p2',
        revealedAnswers: [
          {
            id: 'a2',
            answerText: 'PHONE',
            points: 30,
            rankOrder: 2,
            revealedByPlayerId: 'p1',
            revealedByNickname: 'Alice',
            revealedByTeam: 'TEAM_1',
          },
        ],
        firstGuessResult: {
          playerId: 'p1',
          playerNickname: 'Alice',
          playerTeam: 'TEAM_1',
          rawAnswer: 'phone',
          isMatched: true,
          points: 30,
          rankOrder: 2,
          isNumberOneAnswer: false,
        },
      };

      renderBoard({ snapshot: oppTurnSnapshot });

      // Card 2 is revealed
      expect(screen.getByTestId('face-off-card-2')).toHaveTextContent('PHONE');
      expect(screen.getByTestId('face-off-points-2')).toHaveTextContent('30 pts');

      // Opponent Challenge Banner displayed
      const challengeBanner = screen.getByTestId('face-off-opponent-challenge-banner');
      expect(challengeBanner).toBeInTheDocument();
      expect(challengeBanner).toHaveTextContent('Can you beat phone (30 pts)?');
    });

    it('satisfies Scenario 4: displays opponent steal chance banner when contender 1 misses', () => {
      const oppMissSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'OPPONENT_GUESS',
        activeRespondentId: 'p2',
        firstGuessResult: {
          playerId: 'p1',
          playerNickname: 'Alice',
          playerTeam: 'TEAM_1',
          rawAnswer: 'elephant',
          isMatched: false,
          points: 0,
          isNumberOneAnswer: false,
        },
      };

      renderBoard({ snapshot: oppMissSnapshot });

      const challengeBanner = screen.getByTestId('face-off-opponent-challenge-banner');
      expect(challengeBanner).toBeInTheDocument();
      expect(challengeBanner).toHaveTextContent(
        'Alice missed! Any valid answer on the board wins the Face-Off!'
      );
    });

    it('satisfies Scenario 6: displays Team 1 will play, triggers points chime and speech on PLAY', () => {
      const playSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'ROUND_CONTROL_ASSIGNED',
        winnerPlayerId: 'p1',
        winnerNickname: 'Alice',
        winnerTeam: 'TEAM_1',
        controllingTeam: 'TEAM_1',
        passOrPlayDecision: 'play',
      };

      renderBoard({
        snapshot: playSnapshot,
        roundControlAssigned: {
          roomCode: 'FEUD-TEST',
          winnerPlayerId: 'p1',
          winnerTeam: 'TEAM_1',
          decision: 'play',
          controllingTeam: 'TEAM_1',
          controllingTeamName: 'Team 1',
          message: 'Team 1 has chosen to PLAY!',
        },
      });

      const controlBanner = screen.getByTestId('face-off-control-assigned-banner');
      expect(controlBanner).toBeInTheDocument();
      expect(controlBanner).toHaveTextContent('Team 1 has chosen to PLAY!');

      // Audio & TTS cues
      expect(soundModule.playPointsChime).toHaveBeenCalled();
      expect(ttsModule.speakPlayOrPassDecision).toHaveBeenCalledWith('Team 1', 'play', 'EN');
    });

    it('satisfies Scenario 7: displays Control passes to Team 2, triggers chime and speech on PASS', () => {
      const passSnapshot: FaceOffSessionState = {
        ...baseSnapshot,
        phase: 'ROUND_CONTROL_ASSIGNED',
        winnerPlayerId: 'p1',
        winnerNickname: 'Alice',
        winnerTeam: 'TEAM_1',
        controllingTeam: 'TEAM_2',
        passOrPlayDecision: 'pass',
      };

      renderBoard({
        snapshot: passSnapshot,
        roundControlAssigned: {
          roomCode: 'FEUD-TEST',
          winnerPlayerId: 'p1',
          winnerTeam: 'TEAM_1',
          decision: 'pass',
          controllingTeam: 'TEAM_2',
          controllingTeamName: 'Team 2',
          message: 'Team 1 has PASSED to Team 2!',
        },
      });

      const controlBanner = screen.getByTestId('face-off-control-assigned-banner');
      expect(controlBanner).toBeInTheDocument();
      expect(controlBanner).toHaveTextContent('Control passes to Team 2!');

      expect(soundModule.playPointsChime).toHaveBeenCalled();
      expect(ttsModule.speakPlayOrPassDecision).toHaveBeenCalledWith('Team 2', 'pass', 'EN');
    });
  });

  it('satisfies US-17 Scenario 4: renders host audio toggle button and toggles mute state with cancelSpeech', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(
      <MainGameFaceOffBoard
        snapshot={baseSnapshot}
        language="EN"
        roomName="Test Room"
        roomCode="FEUD-01"
      />
    );

    const toggleBtn = screen.getByTestId('host-audio-toggle');
    expect(toggleBtn).toHaveAttribute('title', 'Mute Sounds & TTS');

    // Click to mute
    fireEvent.click(toggleBtn);
    expect(ttsModule.setTtsMuted).toHaveBeenCalledWith(true);
    expect(ttsModule.cancelSpeech).toHaveBeenCalled();
    expect(toggleBtn).toHaveAttribute('title', 'Unmute Sounds & TTS');

    // Click to unmute
    fireEvent.click(toggleBtn);
    expect(ttsModule.setTtsMuted).toHaveBeenCalledWith(false);
    expect(toggleBtn).toHaveAttribute('title', 'Mute Sounds & TTS');
  });

  it('satisfies US-28: reads question once when buzzers activate, but does NOT repeat the question after a player presses the buzzer', async () => {
    vi.useFakeTimers();

    const { rerender } = renderBoard({
      snapshot: {
        ...baseSnapshot,
        phase: 'BUZZER_ACTIVE',
      },
    });

    // Spoken once on BUZZER_ACTIVE
    expect(ttsModule.speakQuestion).toHaveBeenCalledTimes(1);
    expect(ttsModule.speakQuestion).toHaveBeenCalledWith(
      expect.stringContaining('Name something people often lose'),
      'EN'
    );

    // Contender 1 presses buzzer -> ANSWERING phase
    rerender(
      <LanguageProvider>
        <MainGameFaceOffBoard
          snapshot={{
            ...baseSnapshot,
            phase: 'ANSWERING',
            buzzerLocked: true,
            buzzedPlayerId: 'p1',
            activeRespondentId: 'p1',
          }}
          roomName="Family Feud Duel"
          roomCode="FEUD-CTRL"
        />
      </LanguageProvider>
    );
    vi.advanceTimersByTime(200);

    // Question is NOT repeated
    expect(ttsModule.speakQuestion).toHaveBeenCalledTimes(1);

    // Moves to OPPONENT_GUESS phase
    rerender(
      <LanguageProvider>
        <MainGameFaceOffBoard
          snapshot={{
            ...baseSnapshot,
            phase: 'OPPONENT_GUESS',
            buzzerLocked: true,
            activeRespondentId: 'p2',
          }}
          roomName="Family Feud Duel"
          roomCode="FEUD-CTRL"
        />
      </LanguageProvider>
    );
    vi.advanceTimersByTime(200);

    // Question is still NOT repeated
    expect(ttsModule.speakQuestion).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
