import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initFaceOffSession,
  getFaceOffSession,
  removeFaceOffSession,
  clearAllFaceOffSessions,
  FaceOffQuestion,
  FaceOffPlayer,
} from '../src/services/faceOffService';

describe('US-12: Main Game Face-Off Service & Buzzer Arbiter (faceOffService)', () => {
  const mockQuestion: FaceOffQuestion = {
    id: 'q-faceoff-1',
    questionText: 'Name something you find in a glove compartment',
    orderIndex: 1,
    roundNumber: 1,
    answers: [
      { id: 'a1', answerText: 'Registration / Insurance', points: 38, rankOrder: 1 },
      { id: 'a2', answerText: 'Flashlight', points: 24, rankOrder: 2 },
      { id: 'a3', answerText: 'Napkins / Tissues', points: 16, rankOrder: 3 },
      { id: 'a4', answerText: 'Tire Pressure Gauge', points: 12, rankOrder: 4 },
      { id: 'a5', answerText: 'Sunglasses', points: 10, rankOrder: 5 },
    ],
  };

  const team1FourPlayers: FaceOffPlayer[] = [
    { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
    { id: 'p4', nickname: 'David', team: 'TEAM_1', battingOrder: 2 },
  ];

  const team2FourPlayers: FaceOffPlayer[] = [
    { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
    { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 2 },
  ];

  const team1TwoPlayers: FaceOffPlayer[] = [
    { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
  ];

  const team2TwoPlayers: FaceOffPlayer[] = [
    { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    clearAllFaceOffSessions();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    clearAllFaceOffSessions();
  });

  /* -------------------------------------------------------------
   * 1. Session Initialization & Contender Selection
   * ------------------------------------------------------------- */
  describe('Session Initialization', () => {
    it('initializes Face-Off session for Round 1 with batting order 1 contenders', () => {
      const session = initFaceOffSession('FEUD-FO01', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      expect(session.roomCode).toBe('FEUD-FO01');
      expect(session.phase).toBe('AWAITING_READY');
      expect(session.buzzerLocked).toBe(false);
      expect(session.remainingSeconds).toBe(15);

      // Round 1 Contenders: Batting order 1 (Alice & Bob)
      expect(session.team1Contender.id).toBe('p1');
      expect(session.team1Contender.nickname).toBe('Alice');
      expect(session.team1Contender.isReady).toBe(false);

      expect(session.team2Contender.id).toBe('p2');
      expect(session.team2Contender.nickname).toBe('Bob');
      expect(session.team2Contender.isReady).toBe(false);

      expect(getFaceOffSession('FEUD-FO01')).toBe(session);
    });

    it('initializes Face-Off session for Round 2 with batting order 2 contenders', () => {
      const session = initFaceOffSession('FEUD-FO02', {
        gameId: 'game-1',
        roundNumber: 2,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      // Round 2 Contenders: Batting order 2 (David & Charlie)
      expect(session.team1Contender.id).toBe('p4');
      expect(session.team1Contender.nickname).toBe('David');

      expect(session.team2Contender.id).toBe('p3');
      expect(session.team2Contender.nickname).toBe('Charlie');
    });

    it('cycles contender modulo team size when roundNumber exceeds player count', () => {
      const session = initFaceOffSession('FEUD-FO03', {
        gameId: 'game-1',
        roundNumber: 3, // In 2-player team, (3-1) % 2 = 0 -> back to player 1
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      expect(session.team1Contender.id).toBe('p1');
      expect(session.team2Contender.id).toBe('p2');
    });
  });

  /* -------------------------------------------------------------
   * 2. Scenario 1: Dual Contender Ready Phase
   * ------------------------------------------------------------- */
  describe('Scenario 1: Contender Readiness Flow', () => {
    it('marks Contender 1 ready and indicates waiting for Contender 2', () => {
      const session = initFaceOffSession('FEUD-FO04', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      const res = session.markContenderReady('p1');
      expect(res.success).toBe(true);
      expect(res.bothReady).toBe(false);
      expect(res.phase).toBe('AWAITING_READY');
      expect(res.waitingForPlayerId).toBe('p2');
      expect(res.waitingForNickname).toBe('Bob');
      expect(session.team1Contender.isReady).toBe(true);
      expect(session.team2Contender.isReady).toBe(false);
    });

    it('activates buzzers when both Contenders mark ready', () => {
      const session = initFaceOffSession('FEUD-FO05', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      const res2 = session.markContenderReady('p2');

      expect(res2.success).toBe(true);
      expect(res2.bothReady).toBe(true);
      expect(res2.phase).toBe('BUZZER_ACTIVE');
      expect(session.phase).toBe('BUZZER_ACTIVE');
      expect(session.team1Contender.isReady).toBe(true);
      expect(session.team2Contender.isReady).toBe(true);
    });

    it('rejects readiness from a non-contender player', () => {
      const session = initFaceOffSession('FEUD-FO06', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      // David (p4) is not contender in Round 1
      const res = session.markContenderReady('p4');
      expect(res.success).toBe(false);
      expect(res.bothReady).toBe(false);
      expect(res.error).toContain('Player is not one of the active face-off contenders');
    });

    it('rejects readiness once phase is no longer AWAITING_READY', () => {
      const session = initFaceOffSession('FEUD-FO07', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2'); // now BUZZER_ACTIVE

      const res = session.markContenderReady('p1');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Face-off is no longer in ready phase');
    });
  });

  /* -------------------------------------------------------------
   * 3. Scenario 2: First Buzzer Wins Lockout
   * ------------------------------------------------------------- */
  describe('Scenario 2: Buzzer Lockout Mechanics', () => {
    it('registers first buzzer press, locks out opponent, and starts 15s timer', () => {
      const session = initFaceOffSession('FEUD-FO08', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');

      const buzzRes = session.pressBuzzer('p1', 1700000000000);
      expect(buzzRes.accepted).toBe(true);
      expect(buzzRes.result?.winnerPlayerId).toBe('p1');
      expect(buzzRes.result?.winnerNickname).toBe('Alice');
      expect(buzzRes.result?.winnerTeam).toBe('TEAM_1');
      expect(buzzRes.result?.duration).toBe(15);
      expect(buzzRes.result?.endsAt).toBeGreaterThan(Date.now());

      expect(session.buzzerLocked).toBe(true);
      expect(session.activeRespondentId).toBe('p1');
      expect(session.phase).toBe('ANSWERING');
      expect(session.isTimerRunning).toBe(true);

      // Contender 2 presses buzzer 50ms later -> rejected
      const buzzRes2 = session.pressBuzzer('p2', 1700000000050);
      expect(buzzRes2.accepted).toBe(false);
      expect(buzzRes2.reason).toBe('BUZZER_LOCKED');
    });

    it('drops buzzer press before buzzers are active', () => {
      const session = initFaceOffSession('FEUD-FO09', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      // Still in AWAITING_READY
      const buzzRes = session.pressBuzzer('p1');
      expect(buzzRes.accepted).toBe(false);
      expect(buzzRes.reason).toBe('NOT_ACTIVE');
    });

    it('rejects buzzer press from non-contender teammate', () => {
      const session = initFaceOffSession('FEUD-FO10', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');

      // David (p4) attempts to buzz
      const buzzRes = session.pressBuzzer('p4');
      expect(buzzRes.accepted).toBe(false);
      expect(buzzRes.reason).toBe('NOT_A_CONTENDER');
    });
  });

  /* -------------------------------------------------------------
   * 4. 15-Second Authoritative Timer & Countdown Ticks
   * ------------------------------------------------------------- */
  describe('Authoritative 15-Second Timer Countdown', () => {
    it('ticks synchronously each second and fires onTick callback', () => {
      const tickSpy = vi.fn();

      const session = initFaceOffSession('FEUD-FO11', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
        onTick: tickSpy,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1');

      // Advance 1 second
      vi.advanceTimersByTime(1000);
      expect(tickSpy).toHaveBeenCalledWith(14, expect.any(Number));
      expect(session.remainingSeconds).toBe(14);

      // Advance 4 more seconds
      vi.advanceTimersByTime(4000);
      expect(tickSpy).toHaveBeenCalledWith(10, expect.any(Number));
      expect(session.remainingSeconds).toBe(10);
    });
  });

  /* -------------------------------------------------------------
   * 5. Scenario 3: 15-Second Timeout Cascades to Opponent
   * ------------------------------------------------------------- */
  describe('Scenario 3: Timeout Cascade to Opponent Contender', () => {
    it('automatically hands off floor to opponent with fresh 15s timer when first contender times out', () => {
      const timeoutSpy = vi.fn();

      const session = initFaceOffSession('FEUD-FO12', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
        onTimeout: timeoutSpy,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1'); // Alice wins buzzer

      // Alice fails to answer within 15 seconds
      vi.advanceTimersByTime(15000);

      expect(timeoutSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'HAND_OFF',
          timedOutPlayerId: 'p1',
          timedOutPlayerNickname: 'Alice',
          nextPlayerId: 'p2',
          nextPlayerNickname: 'Bob',
          nextPlayerTeam: 'TEAM_2',
          duration: 15,
        })
      );

      // Bob now has the floor with fresh 15s timer in OPPONENT_GUESS phase
      expect(session.activeRespondentId).toBe('p2');
      expect(session.phase).toBe('OPPONENT_GUESS');
      expect(session.remainingSeconds).toBe(15);
      expect(session.isTimerRunning).toBe(true);
      expect(session.attemptedPlayerIds).toContain('p1');
      expect(session.attemptedPlayerIds).toContain('p2');
    });
  });

  /* -------------------------------------------------------------
   * 6. Scenario 4: Strict 2-Contender Sequence on Dual Timeout (US-28)
   * ------------------------------------------------------------- */
  describe('Scenario 4: Strict 2-Contender Sequence on Dual Timeout (US-28)', () => {
    it('triggers DEADLOCK_RESET when both contenders time out without calling other teammates', () => {
      const timeoutSpy = vi.fn();

      const session = initFaceOffSession('FEUD-FO13', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
        onTimeout: timeoutSpy,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1'); // Alice

      // Alice times out (15s) -> hands off to Bob in OPPONENT_GUESS
      vi.advanceTimersByTime(15000);
      expect(session.activeRespondentId).toBe('p2');
      expect(session.phase).toBe('OPPONENT_GUESS');

      // Bob also times out (15s) -> strictly ends in DEADLOCK_RESET (never cascades to teammates or loops)
      vi.advanceTimersByTime(15000);

      expect(timeoutSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'DEADLOCK_RESET',
          timedOutPlayerId: 'p2',
          timedOutPlayerNickname: 'Bob',
          phase: 'DEADLOCK_RESET',
        })
      );

      expect(session.phase).toBe('DEADLOCK_RESET');
      expect(session.activeRespondentId).toBeNull();
      expect(session.isTimerRunning).toBe(false);
    });
  });

  /* -------------------------------------------------------------
   * 7. Scenario 5: Dual Timeout Resolution in 2-Player (1 vs 1) Match
   * ------------------------------------------------------------- */
  describe('Scenario 5: 1v1 Deadlock Resolution & Question Reset', () => {
    it('triggers DEADLOCK_RESET when both contenders fail in a 2-player match', () => {
      const timeoutSpy = vi.fn();

      const session = initFaceOffSession('FEUD-FO14', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1TwoPlayers,
        team2Players: team2TwoPlayers,
        question: mockQuestion,
        onTimeout: timeoutSpy,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1'); // Alice

      // Alice times out -> passes to Bob
      vi.advanceTimersByTime(15000);
      expect(session.activeRespondentId).toBe('p2');

      // Bob times out -> 1v1 match has no more teammates, triggers DEADLOCK_RESET
      vi.advanceTimersByTime(15000);

      expect(timeoutSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'DEADLOCK_RESET',
          timedOutPlayerId: 'p2',
          timedOutPlayerNickname: 'Bob',
          timedOutPlayerTeam: 'TEAM_2',
        })
      );
      expect(session.phase).toBe('DEADLOCK_RESET');
      expect(session.activeRespondentId).toBeNull();
      expect(session.isTimerRunning).toBe(false);
    });

    it('resets face-off with a replacement question following deadlock', () => {
      const session = initFaceOffSession('FEUD-FO15', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1TwoPlayers,
        team2Players: team2TwoPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1');
      vi.advanceTimersByTime(30000); // Both time out

      expect(session.phase).toBe('DEADLOCK_RESET');

      const replacementQuestion: FaceOffQuestion = {
        id: 'q-replacement',
        questionText: 'Name something people lose easily',
        orderIndex: 1,
        roundNumber: 1,
        answers: [
          { id: 'a10', answerText: 'Keys', points: 45, rankOrder: 1 },
          { id: 'a11', answerText: 'Phone', points: 30, rankOrder: 2 },
          { id: 'a12', answerText: 'Glasses', points: 25, rankOrder: 3 },
        ],
      };

      session.resetWithNewQuestion(replacementQuestion);

      expect(session.question.id).toBe('q-replacement');
      expect(session.phase).toBe('BUZZER_ACTIVE');
      expect(session.buzzerLocked).toBe(false);
      expect(session.buzzedPlayerId).toBeNull();
      expect(session.activeRespondentId).toBeNull();
      expect(session.remainingSeconds).toBe(15);
      expect(session.isTimerRunning).toBe(false);

      // Now Contender 2 can buzz in on the new question
      const buzzRes = session.pressBuzzer('p2');
      expect(buzzRes.accepted).toBe(true);
      expect(buzzRes.result?.winnerPlayerId).toBe('p2');
      expect(session.phase).toBe('ANSWERING');
    });
  });

  /* -------------------------------------------------------------
   * 8. Answer Submission
   * ------------------------------------------------------------- */
  describe('Answer Submission', () => {
    it('accepts answer submission from active respondent and halts timer', () => {
      const session = initFaceOffSession('FEUD-FO16', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1');

      const submitRes = session.submitAnswer('p1', 'Flashlight');
      expect(submitRes.success).toBe(true);
      expect(submitRes.rawAnswer).toBe('Flashlight');
      expect(session.phase).toBe('RESOLVED');
      expect(session.isTimerRunning).toBe(false);
    });

    it('rejects answer submission from non-active respondent', () => {
      const session = initFaceOffSession('FEUD-FO17', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1'); // Alice has the floor

      // Bob tries to answer
      const submitRes = session.submitAnswer('p2', 'Flashlight');
      expect(submitRes.success).toBe(false);
      expect(submitRes.error).toContain('Only the active respondent may submit an answer');
    });

    it('rejects answer submission when phase is not ANSWERING', () => {
      const session = initFaceOffSession('FEUD-FO18', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      const submitRes = session.submitAnswer('p1', 'Flashlight');
      expect(submitRes.success).toBe(false);
      expect(submitRes.error).toContain('Face-off is not in answering phase');
    });
  });

  /* -------------------------------------------------------------
   * 9. Registry & Cleanup
   * ------------------------------------------------------------- */
  describe('Registry & Cleanup', () => {
    it('handles removal of non-existent session safely', () => {
      expect(() => removeFaceOffSession('NON_EXISTENT')).not.toThrow();
    });

    it('cascades to same team if opponent team has no further unattempted players', () => {
      const team1ThreePlayers: FaceOffPlayer[] = [
        { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
        { id: 'p3', nickname: 'Charlie', team: 'TEAM_1', battingOrder: 2 },
        { id: 'p5', nickname: 'Emma', team: 'TEAM_1', battingOrder: 3 },
      ];
      const team2TwoPlayersList: FaceOffPlayer[] = [
        { id: 'p2', nickname: 'Bob', team: 'TEAM_2', battingOrder: 1 },
        { id: 'p4', nickname: 'David', team: 'TEAM_2', battingOrder: 2 },
      ];

      const session = initFaceOffSession('FEUD-FO-ASYM', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1ThreePlayers,
        team2Players: team2TwoPlayersList,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1'); // p1 (T1) buzzed

      vi.advanceTimersByTime(15000); // p1 (T1) times out -> p2 (T2 contender) in OPPONENT_GUESS
      expect(session.activeRespondentId).toBe('p2');
      expect(session.phase).toBe('OPPONENT_GUESS');

      vi.advanceTimersByTime(15000); // p2 (T2) times out -> DEADLOCK_RESET (strictly 2 attempts)
      expect(session.phase).toBe('DEADLOCK_RESET');
      expect(session.activeRespondentId).toBeNull();
    });

    it('stores and retrieves session in registry', () => {
      const session = initFaceOffSession('FEUD-FO19', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      expect(getFaceOffSession('feud-fo19')).toBe(session);

      removeFaceOffSession('FEUD-FO19');
      expect(getFaceOffSession('FEUD-FO19')).toBeUndefined();
    });

    it('destroys session cleanly and stops timer', () => {
      const session = initFaceOffSession('FEUD-FO20', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1');

      expect(session.isTimerRunning).toBe(true);
      session.destroy();
      expect(session.isTimerRunning).toBe(false);
    });

    it('serializes state correctly via getState()', () => {
      const session = initFaceOffSession('FEUD-FO21', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
        language: 'FR',
      });

      const state = session.getState();
      expect(state.roomCode).toBe('FEUD-FO21');
      expect(state.language).toBe('FR');
      expect(state.phase).toBe('AWAITING_READY');
      expect(state.team1Contender.nickname).toBe('Alice');
      expect(state.team2Contender.nickname).toBe('Bob');
    });
  });

  /* -------------------------------------------------------------
   * US-13: Face-Off Scoring & Pass or Play Choice
   * ------------------------------------------------------------- */
  describe('US-13: Face-Off Scoring & Pass or Play Choice', () => {
    /* Scenario 1: Immediate Win with the #1 Answer */
    it('satisfies Scenario 1: immediate win when Contender 1 guesses #1 answer, bypassing Contender 2', async () => {
      const session = initFaceOffSession('FEUD-US13-S1', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1'); // Alice (p1, Team 1) wins buzzer

      // Alice guesses the #1 answer ("Registration / Insurance", rank 1, 38 pts)
      const result = await session.evaluateContenderAnswer('p1', 'Registration / Insurance');

      expect(result.outcome).toBe('NUMBER_ONE_WIN');
      expect(result.guessResult.isMatched).toBe(true);
      expect(result.guessResult.rankOrder).toBe(1);
      expect(result.guessResult.points).toBe(38);
      expect(result.guessResult.isNumberOneAnswer).toBe(true);
      expect(result.winnerPlayerId).toBe('p1');
      expect(result.winnerNickname).toBe('Alice');
      expect(result.winnerTeam).toBe('TEAM_1');

      // Card #1 is in revealed answers
      expect(session.revealedAnswers).toHaveLength(1);
      expect(session.revealedAnswers[0].rankOrder).toBe(1);
      expect(session.revealedAnswers[0].points).toBe(38);
      expect(session.revealedAnswers[0].revealedByPlayerId).toBe('p1');

      // Contender 2 is bypassed -> phase is PASS_OR_PLAY immediately and timer stopped
      expect(session.phase).toBe('PASS_OR_PLAY');
      expect(session.isTimerRunning).toBe(false);
      expect(session.winnerPlayerId).toBe('p1');
    });

    /* Scenario 2: Opponent Opportunity when #1 Answer is Not Found */
    it('satisfies Scenario 2: Contender 1 guesses non-#1 answer, prompting Contender 2 with 15s timer', async () => {
      const session = initFaceOffSession('FEUD-US13-S2', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1'); // Alice wins buzzer

      // Alice guesses rank 4 ("Tire Pressure Gauge", 12 pts)
      const result = await session.evaluateContenderAnswer('p1', 'Tire Pressure Gauge');

      expect(result.outcome).toBe('OPPONENT_TURN');
      expect(result.guessResult.isMatched).toBe(true);
      expect(result.guessResult.rankOrder).toBe(4);
      expect(result.guessResult.points).toBe(12);
      expect(result.guessResult.isNumberOneAnswer).toBe(false);

      // Card #4 is revealed
      expect(session.revealedAnswers).toHaveLength(1);
      expect(session.revealedAnswers[0].rankOrder).toBe(4);

      // Opponent (Bob, p2, Team 2) gets floor with 15s timer
      expect(session.phase).toBe('OPPONENT_GUESS');
      expect(session.activeRespondentId).toBe('p2');
      expect(session.isTimerRunning).toBe(true);
      expect(session.remainingSeconds).toBe(15);
      expect(result.nextRespondentId).toBe('p2');
      expect(result.nextRespondentNickname).toBe('Bob');
    });

    /* Scenario 3: Opponent Beats Initial Guess */
    it('satisfies Scenario 3: Contender 2 submits higher-scoring answer and wins face-off', async () => {
      const session = initFaceOffSession('FEUD-US13-S3', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1');

      // Alice got 12 pts (rank 4)
      await session.evaluateContenderAnswer('p1', 'Tire Pressure Gauge');

      // Bob submits rank 2 ("Flashlight", 24 pts) -> beats 12 pts!
      const result = await session.evaluateContenderAnswer('p2', 'Flashlight');

      expect(result.outcome).toBe('OPPONENT_WON');
      expect(result.guessResult.points).toBe(24);
      expect(result.winnerPlayerId).toBe('p2');
      expect(result.winnerNickname).toBe('Bob');
      expect(result.winnerTeam).toBe('TEAM_2');
      expect(session.phase).toBe('PASS_OR_PLAY');
      expect(session.revealedAnswers).toHaveLength(2);
      expect(session.isTimerRunning).toBe(false);
    });

    it('satisfies Scenario 3: Contender 2 submits lower-scoring answer and Contender 1 wins face-off', async () => {
      const session = initFaceOffSession('FEUD-US13-S3-LOWER', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1');

      // Alice got 24 pts (rank 2, "Flashlight")
      await session.evaluateContenderAnswer('p1', 'Flashlight');

      // Bob submits rank 5 ("Sunglasses", 10 pts) -> fails to beat 24 pts!
      const result = await session.evaluateContenderAnswer('p2', 'Sunglasses');

      expect(result.outcome).toBe('INITIAL_WINNER_WON');
      expect(result.winnerPlayerId).toBe('p1');
      expect(result.winnerNickname).toBe('Alice');
      expect(result.winnerTeam).toBe('TEAM_1');
      expect(session.phase).toBe('PASS_OR_PLAY');
      expect(session.revealedAnswers).toHaveLength(2);
    });

    /* Scenario 4: Contender 1 Misses (0 Points) and Contender 2 Capitalizes */
    it('satisfies Scenario 4: Contender 1 misses (0 pts) and Contender 2 wins with any valid answer', async () => {
      const session = initFaceOffSession('FEUD-US13-S4', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1');

      // Alice misses completely ("Elephant", 0 pts)
      const r1 = await session.evaluateContenderAnswer('p1', 'Elephant');
      expect(r1.outcome).toBe('OPPONENT_TURN');
      expect(r1.guessResult.isMatched).toBe(false);
      expect(r1.guessResult.points).toBe(0);
      expect(session.revealedAnswers).toHaveLength(0);

      // Floor passed to Bob with 15s timer
      expect(session.phase).toBe('OPPONENT_GUESS');
      expect(session.activeRespondentId).toBe('p2');

      // Bob submits ANY valid answer on board (rank 5, "Sunglasses", 10 pts)
      const r2 = await session.evaluateContenderAnswer('p2', 'Sunglasses');
      expect(r2.outcome).toBe('OPPONENT_WON');
      expect(r2.winnerPlayerId).toBe('p2');
      expect(r2.winnerNickname).toBe('Bob');
      expect(r2.winnerTeam).toBe('TEAM_2');
      expect(session.phase).toBe('PASS_OR_PLAY');
      expect(session.revealedAnswers).toHaveLength(1);
    });

    /* Scenario 5: Both Contenders Guess Incorrectly (US-28) */
    it('satisfies Scenario 5: both contenders miss, immediately triggering deadlock reset without teammate cascade', async () => {
      const session = initFaceOffSession('FEUD-US13-S5', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers, // [Alice (p1), David (p4)]
        team2Players: team2FourPlayers, // [Bob (p2), Charlie (p3)]
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1');

      // Alice misses
      await session.evaluateContenderAnswer('p1', 'Elephant');

      // Bob also misses ("Giraffe") -> ends directly in DEADLOCK_RESET
      const r2 = await session.evaluateContenderAnswer('p2', 'Giraffe');

      expect(r2.outcome).toBe('DEADLOCK_RESET');
      expect(session.phase).toBe('DEADLOCK_RESET');
      expect(session.activeRespondentId).toBeNull();
    });

    it('satisfies Scenario 5: deadlock resets when all available players miss without answer', async () => {
      const session = initFaceOffSession('FEUD-US13-S5-DEADLOCK', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1TwoPlayers, // Only Alice (p1)
        team2Players: team2TwoPlayers, // Only Bob (p2)
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1');

      await session.evaluateContenderAnswer('p1', 'Wrong 1');
      const r2 = await session.evaluateContenderAnswer('p2', 'Wrong 2');

      expect(r2.outcome).toBe('DEADLOCK_RESET');
      expect(session.phase).toBe('DEADLOCK_RESET');
      expect(session.activeRespondentId).toBeNull();
    });

    /* Scenario 6: Choosing "Play" */
    it('satisfies Scenario 6: winner chooses PLAY, awarding control to winner team', () => {
      const session = initFaceOffSession('FEUD-US13-S6', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.phase = 'PASS_OR_PLAY';
      session.winnerPlayerId = 'p1';
      session.winnerNickname = 'Alice';
      session.winnerTeam = 'TEAM_1';

      const decisionRes = session.choosePlayOrPass('p1', 'play');

      expect(decisionRes.success).toBe(true);
      expect(decisionRes.decision).toBe('play');
      expect(decisionRes.controllingTeam).toBe('TEAM_1');
      expect(decisionRes.controllingTeamName).toBe('Team 1');

      expect(session.controllingTeam).toBe('TEAM_1');
      expect(session.passOrPlayDecision).toBe('play');
      expect(session.phase).toBe('ROUND_CONTROL_ASSIGNED');
    });

    /* Scenario 7: Choosing "Pass" */
    it('satisfies Scenario 7: winner chooses PASS, transferring control to opponent team', () => {
      const session = initFaceOffSession('FEUD-US13-S7', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.phase = 'PASS_OR_PLAY';
      session.winnerPlayerId = 'p1';
      session.winnerNickname = 'Alice';
      session.winnerTeam = 'TEAM_1';

      const decisionRes = session.choosePlayOrPass('p1', 'pass');

      expect(decisionRes.success).toBe(true);
      expect(decisionRes.decision).toBe('pass');
      expect(decisionRes.controllingTeam).toBe('TEAM_2'); // Passed to Team 2!
      expect(decisionRes.controllingTeamName).toBe('Team 2');

      expect(session.controllingTeam).toBe('TEAM_2');
      expect(session.passOrPlayDecision).toBe('pass');
      expect(session.phase).toBe('ROUND_CONTROL_ASSIGNED');
    });

    /* Edge Cases & Guard Validations */
    it('rejects play/pass choice from non-winning player', () => {
      const session = initFaceOffSession('FEUD-US13-EDGE-1', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.phase = 'PASS_OR_PLAY';
      session.winnerPlayerId = 'p1';

      const res = session.choosePlayOrPass('p2', 'play');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Only the winning contender may choose to play or pass');
    });

    it('rejects play/pass when phase is not PASS_OR_PLAY', () => {
      const session = initFaceOffSession('FEUD-US13-EDGE-2', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.phase = 'ANSWERING';
      session.winnerPlayerId = 'p1';

      const res = session.choosePlayOrPass('p1', 'play');
      expect(res.success).toBe(false);
      expect(res.error).toContain('not in pass or play phase');
    });

    it('rejects guessing an already revealed card as duplicate with 0 points', async () => {
      const session = initFaceOffSession('FEUD-US13-EDGE-3', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1');

      // Alice reveals "Flashlight"
      await session.evaluateContenderAnswer('p1', 'Flashlight');
      expect(session.revealedAnswers).toHaveLength(1);

      // Bob tries to guess "Flashlight" too
      const bRes = await session.evaluateContenderAnswer('p2', 'Flashlight');
      expect(bRes.guessResult.isDuplicate).toBe(true);
      expect(bRes.guessResult.isMatched).toBe(false);
      expect(bRes.guessResult.points).toBe(0);
      // Alice wins because Bob failed to beat her
      expect(bRes.outcome).toBe('INITIAL_WINNER_WON');
      expect(session.winnerPlayerId).toBe('p1');
    });

    it('awards win to Contender 1 when Contender 2 times out during OPPONENT_GUESS', () => {
      const timeoutSpy = vi.fn();
      const session = initFaceOffSession('FEUD-US13-EDGE-4', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
        onTimeout: timeoutSpy,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1');

      // Alice got 12 pts (rank 4)
      session.firstGuessResult = {
        playerId: 'p1',
        playerNickname: 'Alice',
        playerTeam: 'TEAM_1',
        rawAnswer: 'Tire Pressure Gauge',
        isMatched: true,
        points: 12,
        rankOrder: 4,
        isNumberOneAnswer: false,
      };
      session.phase = 'OPPONENT_GUESS';
      session.activeRespondentId = 'p2';

      // Bob times out
      const timeoutRes = session.handleTimeout();

      expect(timeoutRes.type).toBe('TIMEOUT_WINNER');
      expect(timeoutRes.winnerPlayerId).toBe('p1');
      expect(timeoutRes.winnerNickname).toBe('Alice');
      expect(session.phase).toBe('PASS_OR_PLAY');
      expect(session.winnerPlayerId).toBe('p1');
      expect(timeoutSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TIMEOUT_WINNER',
          winnerPlayerId: 'p1',
        })
      );
    });

    it('throws error when submitting answer from non-active respondent', async () => {
      const session = initFaceOffSession('FEUD-US13-EDGE-5', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      session.markContenderReady('p1');
      session.markContenderReady('p2');
      session.pressBuzzer('p1');

      await expect(session.evaluateContenderAnswer('p2', 'Flashlight')).rejects.toThrow(
        'Only the active respondent may submit an answer.'
      );
    });

    it('throws error when submitting answer outside of answering phase', async () => {
      const session = initFaceOffSession('FEUD-US13-EDGE-6', {
        gameId: 'game-13',
        roundNumber: 1,
        team1Players: team1FourPlayers,
        team2Players: team2FourPlayers,
        question: mockQuestion,
      });

      await expect(session.evaluateContenderAnswer('p1', 'Flashlight')).rejects.toThrow(
        'Face-off is not in an answering phase'
      );
    });
  });
});
