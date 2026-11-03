import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initTeamGuessingSession,
  clearAllTeamGuessingSessions,
  createTeamGuessingSessionFromFaceOff,
  TeamGuessingQuestion,
  TeamGuessingPlayer,
  TeamRevealedAnswer,
  StealEvaluationResult,
} from '../src/services/teamGuessingService';
import { initFaceOffSession, clearAllFaceOffSessions } from '../src/services/faceOffService';

describe('US-15: 3-Strike Steal Phase & Round Resolution (Domain Service)', () => {
  const mockQuestion: TeamGuessingQuestion = {
    id: 'q-steal-1',
    questionText: 'Name something found in a living room',
    orderIndex: 1,
    roundNumber: 1,
    answers: [
      { id: 'a1', answerText: 'Sofa / Couch', points: 42, rankOrder: 1 },
      { id: 'a2', answerText: 'Television', points: 28, rankOrder: 2 },
      { id: 'a3', answerText: 'Coffee Table', points: 18, rankOrder: 3 },
      { id: 'a4', answerText: 'Lamp', points: 12, rankOrder: 4 },
    ],
  };

  const team1Players: TeamGuessingPlayer[] = [
    { id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 },
    { id: 'p2', nickname: 'Bob', team: 'TEAM_1', battingOrder: 2 },
  ];

  const team2Players: TeamGuessingPlayer[] = [
    { id: 'p3', nickname: 'Charlie', team: 'TEAM_2', battingOrder: 1 },
    { id: 'p4', nickname: 'Diana', team: 'TEAM_2', battingOrder: 2 },
  ];

  const initialRevealed: TeamRevealedAnswer[] = [
    {
      id: 'a1',
      answerText: 'Sofa / Couch',
      points: 42,
      rankOrder: 1,
      revealedByPlayerId: 'p1',
      revealedByNickname: 'Alice',
      revealedByTeam: 'TEAM_1',
    },
    {
      id: 'a2',
      answerText: 'Television',
      points: 28,
      rankOrder: 2,
      revealedByPlayerId: 'p2',
      revealedByNickname: 'Bob',
      revealedByTeam: 'TEAM_1',
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    clearAllTeamGuessingSessions();
    clearAllFaceOffSessions();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    clearAllTeamGuessingSessions();
    clearAllFaceOffSessions();
  });

  const setupStealPhaseSession = (overrides = {}) => {
    const session = initTeamGuessingSession('FEUD-STL1', {
      gameId: 'game-101',
      roundNumber: 1,
      controllingTeam: 'TEAM_1',
      team1Players,
      team2Players,
      question: mockQuestion,
      initialRevealedAnswers: initialRevealed,
      initialBank: 70, // 42 + 28
      startPlayerIndex: 0,
      autoStartTimer: false,
      autoStartStealTimer: true,
      stealSpokespersonId: 'p3', // Charlie is spokesperson for Team 2
      ...overrides,
    });

    // Manually force into STEAL_PHASE for testing
    session.strikes = 3;
    session.phase = 'STEAL_PHASE';
    session.startStealTimer();

    return session;
  };

  /* -------------------------------------------------------------
   * 1. Spokesperson Identification & Permission Enforcement
   * ------------------------------------------------------------- */
  describe('Spokesperson Identification & Validation Constraints', () => {
    it('designates the opposing contender as spokesperson by default', () => {
      const session = setupStealPhaseSession();
      expect(session.stealSpokesperson).toBeDefined();
      expect(session.stealSpokesperson?.id).toBe('p3');
      expect(session.stealSpokesperson?.nickname).toBe('Charlie');
    });

    it('rejects steal submission from non-spokesperson teammate', async () => {
      const session = setupStealPhaseSession();

      // Diana (p4) is on Team 2, but NOT the spokesperson
      await expect(
        session.evaluateStealGuess('p4', 'Coffee Table')
      ).rejects.toThrow(/Only the designated spokesperson \(Charlie\) can submit/i);
    });

    it('rejects steal submission from original controlling team member', async () => {
      const session = setupStealPhaseSession();

      // Alice (p1) is on Team 1 (controlling team)
      await expect(
        session.evaluateStealGuess('p1', 'Coffee Table')
      ).rejects.toThrow(/Only the designated spokesperson \(Charlie\) can submit/i);
    });

    it('rejects empty or whitespace-only steal submission', async () => {
      const session = setupStealPhaseSession();

      await expect(
        session.evaluateStealGuess('p3', '   ')
      ).rejects.toThrow(/Steal answer cannot be empty/i);
    });

    it('throws if evaluateStealGuess is called when phase is not STEAL_PHASE', async () => {
      const session = initTeamGuessingSession('FEUD-NOTSTL', {
        gameId: 'game-102',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
        autoStartTimer: false,
      });

      expect(session.phase).toBe('TEAM_GUESSING');
      await expect(
        session.evaluateStealGuess('p3', 'Coffee Table')
      ).rejects.toThrow(/Steal phase is not active/i);
    });
  });

  /* -------------------------------------------------------------
   * 2. Scenario 1: Successful Steal Takes All Round Points
   * ------------------------------------------------------------- */
  describe('Scenario 1: Successful Steal', () => {
    it('awards all Round Bank points to opposing team when spokesperson finds an unrevealed answer', async () => {
      let resolvedResult: StealEvaluationResult | null = null;
      const session = setupStealPhaseSession({
        onStealResolved: (res: StealEvaluationResult) => {
          resolvedResult = res;
        },
      });

      // Bank has 70 points (42 + 28). Unrevealed answers are 'Coffee Table' (18) and 'Lamp' (12).
      const result = await session.evaluateStealGuess(
        'p3',
        'Coffee Table',
        async (_raw, candidates) => {
          const match = candidates.find((c) => c.id === 'a3');
          return {
            isMatched: Boolean(match),
            matchedAnswer: match,
            points: match?.points || 0,
            rankOrder: match?.rankOrder,
          };
        }
      );

      // Succeeded
      expect(result.success).toBe(true);
      expect(result.outcome).toBe('STEAL_SUCCESS');
      expect(result.winningTeam).toBe('TEAM_2');
      expect(result.pointsAwarded).toBe(70);
      expect(result.matchedAnswer?.answerText).toBe('Coffee Table');
      expect(result.stealingPlayer.nickname).toBe('Charlie');

      // State updated
      expect(session.winningTeam).toBe('TEAM_2');
      expect(session.phase).toBe('RESOLVED');

      // Callback invoked
      expect(resolvedResult).toEqual(result);

      // Scenario 3: Remaining answers reveal automatically
      // Card 'Lamp' (a4) was the only remaining unrevealed card
      expect(result.remainingAnswers.length).toBe(1);
      expect(result.remainingAnswers[0].answerText).toBe('Lamp');
      expect(session.revealedAnswers.length).toBe(4);
    });
  });

  /* -------------------------------------------------------------
   * 3. Scenario 2: Failed Steal Retains Points for Original Team
   * ------------------------------------------------------------- */
  describe('Scenario 2: Failed Steal (Incorrect Answer or Duplicate)', () => {
    it('awards Round Bank points to controlling team when spokesperson submits a wrong answer', async () => {
      let resolvedResult: StealEvaluationResult | null = null;
      const session = setupStealPhaseSession({
        onStealResolved: (res: StealEvaluationResult) => {
          resolvedResult = res;
        },
      });

      const result = await session.evaluateStealGuess(
        'p3',
        'Elephant',
        async () => ({
          isMatched: false,
          matchedAnswer: undefined,
          points: 0,
        })
      );

      // Failed
      expect(result.success).toBe(false);
      expect(result.outcome).toBe('STEAL_FAILED');
      expect(result.winningTeam).toBe('TEAM_1'); // Original controlling team retains
      expect(result.pointsAwarded).toBe(70);
      expect(result.stealingPlayer.nickname).toBe('Charlie');

      // State updated
      expect(session.winningTeam).toBe('TEAM_1');
      expect(session.phase).toBe('RESOLVED');
      expect(resolvedResult).toEqual(result);

      // Scenario 3: All remaining answers revealed
      expect(result.remainingAnswers.length).toBe(2); // 'Coffee Table' & 'Lamp'
      expect(session.revealedAnswers.length).toBe(4);
    });

    it('fails steal when spokesperson submits duplicate of an already revealed answer', async () => {
      const session = setupStealPhaseSession();

      // 'Sofa / Couch' is already revealed (initialRevealed)
      const result = await session.evaluateStealGuess('p3', 'Sofa');

      expect(result.success).toBe(false);
      expect(result.outcome).toBe('STEAL_FAILED');
      expect(result.winningTeam).toBe('TEAM_1');
      expect(session.winningTeam).toBe('TEAM_1');
      expect(session.phase).toBe('RESOLVED');
    });
  });

  /* -------------------------------------------------------------
   * 4. Scenario 2: Failed Steal via 15-Second Timeout
   * ------------------------------------------------------------- */
  describe('Scenario 2: Steal Phase 15-Second Timeout', () => {
    it('awards Round Bank points to controlling team when 15 seconds expire without submission', () => {
      let resolvedResult: StealEvaluationResult | null = null;
      const session = setupStealPhaseSession({
        onStealResolved: (res: StealEvaluationResult) => {
          resolvedResult = res;
        },
      });

      expect(session.phase).toBe('STEAL_PHASE');

      // Fast-forward 15 seconds
      vi.advanceTimersByTime(15000);

      expect(session.phase).toBe('RESOLVED');
      expect(session.winningTeam).toBe('TEAM_1');
      expect(resolvedResult).toBeDefined();
      expect(resolvedResult?.outcome).toBe('STEAL_TIMEOUT');
      expect(resolvedResult?.winningTeam).toBe('TEAM_1');
      expect(resolvedResult?.pointsAwarded).toBe(70);

      // Remaining answers revealed
      expect(session.revealedAnswers.length).toBe(4);
    });

    it('throws if handleStealTimeout is called when phase is not STEAL_PHASE', () => {
      const session = setupStealPhaseSession();
      session.phase = 'RESOLVED';

      expect(() => session.handleStealTimeout()).toThrow(
        /Cannot handle steal timeout when phase is RESOLVED/i
      );
    });
  });

  /* -------------------------------------------------------------
   * 5. Timer Mechanics & Tick Emission
   * ------------------------------------------------------------- */
  describe('Steal Timer Mechanics', () => {
    it('emits onTick updates during countdown', () => {
      const ticks: number[] = [];
      setupStealPhaseSession({
        onTick: (remaining: number) => {
          ticks.push(remaining);
        },
      });

      vi.advanceTimersByTime(3000);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
    });

    it('stopStealTimer halts timer execution', () => {
      const session = setupStealPhaseSession();
      session.stopStealTimer();

      vi.advanceTimersByTime(20000);
      expect(session.phase).toBe('STEAL_PHASE'); // did not time out
    });
  });

  /* -------------------------------------------------------------
   * 6. Factory Integration with FaceOffSession
   * ------------------------------------------------------------- */
  describe('createTeamGuessingSessionFromFaceOff Spokesperson Assignment', () => {
    it('automatically assigns opposing face-off contender as steal spokesperson', () => {
      const faceOffSession = initFaceOffSession('FEUD-FO-STEAL', {
        gameId: 'game-fo-s',
        roundNumber: 1,
        team1Players: [{ id: 'p1', nickname: 'Alice', team: 'TEAM_1', battingOrder: 1 }],
        team2Players: [{ id: 'p2', nickname: 'Diana', team: 'TEAM_2', battingOrder: 1 }],
        question: {
          id: 'q-fo',
          questionText: 'Name a fruit',
          orderIndex: 1,
          roundNumber: 1,
          answers: [{ id: 'fa1', answerText: 'Apple', points: 60, rankOrder: 1 }],
        },
      });

      // Team 1 won face-off and chooses to PLAY -> Team 1 is controlling team
      faceOffSession.controllingTeam = 'TEAM_1';
      faceOffSession.revealedAnswers = [
        {
          id: 'fa1',
          answerText: 'Apple',
          points: 60,
          rankOrder: 1,
          revealedByPlayerId: 'p1',
          revealedByNickname: 'Alice',
          revealedByTeam: 'TEAM_1',
        },
      ];

      const teamSession = createTeamGuessingSessionFromFaceOff(faceOffSession, {
        autoStartTimer: false,
      });

      // Opposing team is Team 2. Opposing contender is Diana (p2).
      expect(teamSession.controllingTeam).toBe('TEAM_1');
      expect(teamSession.opposingTeam).toBe('TEAM_2');
      expect(teamSession.stealSpokespersonId).toBe('p2');
      expect(teamSession.stealSpokesperson?.id).toBe('p2');
      expect(teamSession.stealSpokesperson?.nickname).toBe('Diana');
    });
  });
});

