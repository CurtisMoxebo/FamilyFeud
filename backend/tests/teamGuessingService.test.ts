import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initTeamGuessingSession,
  getTeamGuessingSession,
  removeTeamGuessingSession,
  clearAllTeamGuessingSessions,
  createTeamGuessingSessionFromFaceOff,
  TeamGuessingQuestion,
  TeamGuessingPlayer,
  TeamRevealedAnswer,
} from '../src/services/teamGuessingService';
import { initFaceOffSession, clearAllFaceOffSessions } from '../src/services/faceOffService';

describe('US-14: Main Game Team Guessing Turn, Board Flips & 3-Strike System (teamGuessingService)', () => {
  const mockQuestion: TeamGuessingQuestion = {
    id: 'q-main-1',
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
    { id: 'p3', nickname: 'Charlie', team: 'TEAM_1', battingOrder: 3 },
  ];

  const team2Players: TeamGuessingPlayer[] = [
    { id: 'p4', nickname: 'David', team: 'TEAM_2', battingOrder: 1 },
    { id: 'p5', nickname: 'Eve', team: 'TEAM_2', battingOrder: 2 },
    { id: 'p6', nickname: 'Frank', team: 'TEAM_2', battingOrder: 3 },
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

  /* -------------------------------------------------------------
   * 1. Session Initialization & Player Ordering
   * ------------------------------------------------------------- */
  describe('Session Initialization & Batting Order', () => {
    it('initializes session with Team 1 in control and starts with Player 2 by default', () => {
      const session = initTeamGuessingSession('FEUD-TG01', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
      });

      expect(session.roomCode).toBe('FEUD-TG01');
      expect(session.controllingTeam).toBe('TEAM_1');
      expect(session.opposingTeam).toBe('TEAM_2');
      expect(session.phase).toBe('TEAM_GUESSING');
      expect(session.strikes).toBe(0);
      expect(session.roundBank).toBe(0);
      expect(session.revealedAnswers).toHaveLength(0);

      // Default: starts at index 1 (Bob, battingOrder 2) since Alice was Face-Off contender
      expect(session.activePlayerIndex).toBe(1);
      expect(session.activePlayer.id).toBe('p2');
      expect(session.activePlayer.nickname).toBe('Bob');
    });

    it('initializes starting player at index 0 if team has only 1 player', () => {
      const soloPlayer: TeamGuessingPlayer[] = [
        { id: 'solo-1', nickname: 'Solo', team: 'TEAM_1', battingOrder: 1 },
      ];

      const session = initTeamGuessingSession('FEUD-SOLO', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players: soloPlayer,
        team2Players,
        question: mockQuestion,
      });

      expect(session.activePlayerIndex).toBe(0);
      expect(session.activePlayer.id).toBe('solo-1');
    });

    it('allows overriding starting player via startPlayerId or startPlayerIndex', () => {
      const sessionById = initTeamGuessingSession('FEUD-TG02', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
        startPlayerId: 'p3',
      });
      expect(sessionById.activePlayer.id).toBe('p3');
      expect(sessionById.activePlayerIndex).toBe(2);

      const sessionByIndex = initTeamGuessingSession('FEUD-TG03', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
        startPlayerIndex: 0,
      });
      expect(sessionByIndex.activePlayer.id).toBe('p1');
      expect(sessionByIndex.activePlayerIndex).toBe(0);
    });

    it('carries over initial revealed answers and bank from face-off', () => {
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
      ];

      const session = initTeamGuessingSession('FEUD-BANK', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
        initialRevealedAnswers: initialRevealed,
      });

      expect(session.roundBank).toBe(42);
      expect(session.revealedAnswers).toHaveLength(1);
      expect(session.revealedAnswers[0].answerText).toBe('Sofa / Couch');
    });

    it('throws an error if controlling team has no registered players', () => {
      expect(() => {
        initTeamGuessingSession('FEUD-EMPTY', {
          gameId: 'game-1',
          roundNumber: 1,
          controllingTeam: 'TEAM_1',
          team1Players: [],
          team2Players,
          question: mockQuestion,
        });
      }).toThrow('Controlling team TEAM_1 has no players registered.');
    });

    it('returns accurate state snapshot via getState()', () => {
      const session = initTeamGuessingSession('FEUD-STATE', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
      });

      const state = session.getState();
      expect(state.roomCode).toBe('FEUD-STATE');
      expect(state.phase).toBe('TEAM_GUESSING');
      expect(state.controllingTeam).toBe('TEAM_1');
      expect(state.controllingTeamName).toBe('Team 1');
      expect(state.opposingTeam).toBe('TEAM_2');
      expect(state.opposingTeamName).toBe('Team 2');
      expect(state.activePlayer?.id).toBe('p2');
      expect(state.activePlayerIndex).toBe(1);
      expect(state.strikes).toBe(0);
      expect(state.roundBank).toBe(0);
      expect(state.totalAnswersCount).toBe(4);
      expect(state.revealedAnswersCount).toBe(0);
      expect(state.remainingAnswersCount).toBe(4);
      expect(state.isTimerRunning).toBe(true);
      expect(state.question.id).toBe('q-main-1');
    });
  });

  /* -------------------------------------------------------------
   * 2. Scenario 1: Correct Guess Flips Card and Increments Bank
   * ------------------------------------------------------------- */
  describe('Scenario 1: Correct Guess Flips Card and Increments Round Bank', () => {
    it('reveals card, adds points to bank, and rotates to next teammate', async () => {
      const turnAdvancedSpy = vi.fn();
      const session = initTeamGuessingSession('FEUD-S1', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
        onTurnAdvanced: turnAdvancedSpy,
      });

      // Player 2 (Bob) is active guesser
      expect(session.activePlayer.id).toBe('p2');

      const result = await session.evaluateGuess('p2', 'Coffee Table', async () => ({
        isMatched: true,
        matchedAnswer: mockQuestion.answers[2], // Coffee Table (18 pts, rank 3)
        points: 18,
        rankOrder: 3,
      }));

      expect(result.outcome).toBe('CORRECT_GUESS');
      expect(result.isStrike).toBe(false);
      expect(result.strikeCount).toBe(0);
      expect(result.pointsAwarded).toBe(18);
      expect(result.roundBank).toBe(18);
      expect(result.revealedAnswer?.answerText).toBe('Coffee Table');
      expect(result.revealedAnswer?.rankOrder).toBe(3);

      // Bank updated
      expect(session.roundBank).toBe(18);
      expect(session.revealedAnswers).toHaveLength(1);

      // Turn advances to Player 3 (Charlie, battingOrder 3)
      expect(session.activePlayerIndex).toBe(2);
      expect(session.activePlayer.id).toBe('p3');
      expect(session.activePlayer.nickname).toBe('Charlie');

      expect(turnAdvancedSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p3', nickname: 'Charlie' }),
        expect.any(Number)
      );

      // Next guess from Player 3 (Charlie)
      const result2 = await session.evaluateGuess('p3', 'Lamp', async () => ({
        isMatched: true,
        matchedAnswer: mockQuestion.answers[3], // Lamp (12 pts, rank 4)
        points: 12,
        rankOrder: 4,
      }));

      expect(result2.outcome).toBe('CORRECT_GUESS');
      expect(result2.roundBank).toBe(30);
      expect(session.roundBank).toBe(30);

      // Turn wraps around to Player 1 (Alice, index 0)
      expect(session.activePlayerIndex).toBe(0);
      expect(session.activePlayer.id).toBe('p1');
    });

    it('uses answerValidationService evaluatePlayerAnswer when customValidator not passed', async () => {
      const session = initTeamGuessingSession('FEUD-REAL-EVAL', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
      });

      // Bob submits exact match "Coffee Table"
      const res = await session.evaluateGuess('p2', 'Coffee Table');
      expect(res.outcome).toBe('CORRECT_GUESS');
      expect(res.pointsAwarded).toBe(18);
      expect(session.roundBank).toBe(18);
    });
  });

  /* -------------------------------------------------------------
   * 3. Scenario 2: Incorrect Guess Triggers Strike
   * ------------------------------------------------------------- */
  describe('Scenario 2: Incorrect Guess Triggers Strike', () => {
    it('issues strike 1 on wrong answer and advances to next player', async () => {
      const strikeSpy = vi.fn();
      const turnAdvancedSpy = vi.fn();

      const session = initTeamGuessingSession('FEUD-S2', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
        onStrike: strikeSpy,
        onTurnAdvanced: turnAdvancedSpy,
      });

      // Player 2 (Bob) submits incorrect answer
      const result = await session.evaluateGuess('p2', 'Elephant', async () => ({
        isMatched: false,
        points: 0,
      }));

      expect(result.outcome).toBe('STRIKE');
      expect(result.isStrike).toBe(true);
      expect(result.strikeCount).toBe(1);
      expect(result.roundBank).toBe(0);
      expect(result.message).toContain('Strike 1 (X)!');

      expect(session.strikes).toBe(1);
      expect(strikeSpy).toHaveBeenCalledWith(1, expect.objectContaining({ id: 'p2' }));

      // Turn advances to Charlie (p3)
      expect(session.activePlayer.id).toBe('p3');
      expect(turnAdvancedSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p3' }),
        expect.any(Number)
      );

      // Charlie makes a second incorrect guess -> Strike 2
      const result2 = await session.evaluateGuess('p3', 'Refrigerator', async () => ({
        isMatched: false,
        points: 0,
      }));

      expect(result2.outcome).toBe('STRIKE');
      expect(result2.strikeCount).toBe(2);
      expect(session.strikes).toBe(2);
      expect(result2.message).toContain('Strike 2 (XX)!');

      // Turn advances to Alice (p1)
      expect(session.activePlayer.id).toBe('p1');
    });

    it('treats duplicate answers (already on board) as strikes', async () => {
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
      ];

      const session = initTeamGuessingSession('FEUD-DUP', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
        initialRevealedAnswers: initialRevealed,
      });

      // Bob repeats "Sofa / Couch" which is already revealed
      const res = await session.evaluateGuess('p2', 'sofa', async () => ({
        isMatched: true,
        matchedAnswer: mockQuestion.answers[0],
        points: 42,
        rankOrder: 1,
      }));

      expect(res.outcome).toBe('STRIKE');
      expect(res.isStrike).toBe(true);
      expect(res.guessResult.isDuplicate).toBe(true);
      expect(res.message).toContain('Duplicate answer!');
      expect(session.strikes).toBe(1);
    });
  });

  /* -------------------------------------------------------------
   * 4. Scenario 3: Clearing the Entire Board Wins the Round (100 Points)
   * ------------------------------------------------------------- */
  describe('Scenario 3: Clearing the Entire Board Wins the Round', () => {
    it('triggers ROUND_CLEARED immediately when all answers are revealed', async () => {
      const roundClearedSpy = vi.fn();

      // Start with 3 out of 4 cards already revealed (88 points in bank)
      const initialRevealed: TeamRevealedAnswer[] = [
        { id: 'a1', answerText: 'Sofa / Couch', points: 42, rankOrder: 1 },
        { id: 'a2', answerText: 'Television', points: 28, rankOrder: 2 },
        { id: 'a3', answerText: 'Coffee Table', points: 18, rankOrder: 3 },
      ];

      const session = initTeamGuessingSession('FEUD-S3', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
        initialRevealedAnswers: initialRevealed,
        onRoundCleared: roundClearedSpy,
      });

      expect(session.roundBank).toBe(88);
      expect(session.revealedAnswers).toHaveLength(3);

      // Active player Bob guesses the final card (Lamp, 12 pts)
      const result = await session.evaluateGuess('p2', 'Lamp', async () => ({
        isMatched: true,
        matchedAnswer: mockQuestion.answers[3],
        points: 12,
        rankOrder: 4,
      }));

      expect(result.outcome).toBe('ROUND_CLEARED');
      expect(result.phase).toBe('ROUND_CLEARED');
      expect(result.roundBank).toBe(100);
      expect(result.activePlayer).toBeNull();
      expect(result.message).toContain('cleared the board!');

      expect(session.phase).toBe('ROUND_CLEARED');
      expect(session.winningTeam).toBe('TEAM_1');
      expect(session.roundBank).toBe(100);
      expect(session.revealedAnswers).toHaveLength(4);

      expect(roundClearedSpy).toHaveBeenCalledWith('TEAM_1', 100);
      expect(session.getState().isTimerRunning).toBe(false);
    });
  });

  /* -------------------------------------------------------------
   * 5. Scenario 4: Accumulating 3 Strikes Triggers Steal Phase
   * ------------------------------------------------------------- */
  describe('Scenario 4: Accumulating 3 Strikes Triggers Steal Phase', () => {
    it('transitions to STEAL_PHASE immediately when 3rd strike is issued', async () => {
      const stealPhaseSpy = vi.fn();

      const session = initTeamGuessingSession('FEUD-S4', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
        initialBank: 42, // e.g. face-off bank
        onStealPhase: stealPhaseSpy,
      });

      // Strike 1 by Bob (p2)
      await session.evaluateGuess('p2', 'Wrong 1', async () => ({ isMatched: false, points: 0 }));
      expect(session.strikes).toBe(1);

      // Strike 2 by Charlie (p3)
      await session.evaluateGuess('p3', 'Wrong 2', async () => ({ isMatched: false, points: 0 }));
      expect(session.strikes).toBe(2);

      // Strike 3 by Alice (p1)
      const result3 = await session.evaluateGuess('p1', 'Wrong 3', async () => ({
        isMatched: false,
        points: 0,
      }));

      expect(result3.outcome).toBe('STEAL_PHASE_TRIGGERED');
      expect(result3.strikeCount).toBe(3);
      expect(result3.phase).toBe('STEAL_PHASE');
      expect(result3.activePlayer).toBeNull();
      expect(result3.nextPlayer).toBeNull();
      expect(result3.message).toContain('Three strikes!');

      expect(session.phase).toBe('STEAL_PHASE');
      expect(session.strikes).toBe(3);

      expect(stealPhaseSpy).toHaveBeenCalledWith(
        'TEAM_1',
        'TEAM_2',
        42,
        expect.anything(),
        expect.anything()
      );
      expect(session.getState().isTimerRunning).toBe(true);
    });

    it('rejects further guesses after transitioning to STEAL_PHASE', async () => {
      const session = initTeamGuessingSession('FEUD-STEAL-LOCK', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
      });

      // Reach 3 strikes
      await session.evaluateGuess('p2', 'W1', async () => ({ isMatched: false, points: 0 }));
      await session.evaluateGuess('p3', 'W2', async () => ({ isMatched: false, points: 0 }));
      await session.evaluateGuess('p1', 'W3', async () => ({ isMatched: false, points: 0 }));

      expect(session.phase).toBe('STEAL_PHASE');

      await expect(
        session.evaluateGuess('p2', 'Another guess', async () => ({ isMatched: true, points: 10 }))
      ).rejects.toThrow('Team guessing is not in progress (current phase: STEAL_PHASE).');
    });
  });

  /* -------------------------------------------------------------
   * 6. Timer Lifecycle & Timeouts
   * ------------------------------------------------------------- */
  describe('Timer Lifecycle & Timeouts', () => {
    it('issues timeout strike and advances turn when 15s timer expires', () => {
      const timeoutSpy = vi.fn();
      const strikeSpy = vi.fn();

      const session = initTeamGuessingSession('FEUD-TIMER', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
        timerDurationSeconds: 15,
        onTimeout: timeoutSpy,
        onStrike: strikeSpy,
      });

      expect(session.activePlayer.id).toBe('p2');

      // Fast-forward 15 seconds
      vi.advanceTimersByTime(15000);

      expect(session.strikes).toBe(1);
      expect(strikeSpy).toHaveBeenCalledWith(1, expect.objectContaining({ id: 'p2' }));

      expect(timeoutSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STRIKE_TIMEOUT',
          strikeCount: 1,
          timedOutPlayer: expect.objectContaining({ id: 'p2' }),
          nextPlayer: expect.objectContaining({ id: 'p3' }),
        })
      );

      // Floor passed to p3
      expect(session.activePlayer.id).toBe('p3');
    });

    it('transitions to STEAL_PHASE if 3rd strike happens due to timeout', () => {
      const timeoutSpy = vi.fn();
      const stealSpy = vi.fn();

      const session = initTeamGuessingSession('FEUD-TIMEOUT-STEAL', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
        timerDurationSeconds: 15,
        onTimeout: timeoutSpy,
        onStealPhase: stealSpy,
      });

      // Strike 1
      vi.advanceTimersByTime(15000);
      expect(session.strikes).toBe(1);

      // Strike 2
      vi.advanceTimersByTime(15000);
      expect(session.strikes).toBe(2);

      // Strike 3
      vi.advanceTimersByTime(15000);
      expect(session.strikes).toBe(3);
      expect(session.phase).toBe('STEAL_PHASE');

      expect(timeoutSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'STEAL_PHASE_TRIGGERED',
          strikeCount: 3,
        })
      );

      expect(stealSpy).toHaveBeenCalledWith(
        'TEAM_1',
        'TEAM_2',
        0,
        expect.anything(),
        expect.anything()
      );
    });

    it('emits onTick callback every second', () => {
      const tickSpy = vi.fn();
      initTeamGuessingSession('FEUD-TICK', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
        onTick: tickSpy,
      });

      vi.advanceTimersByTime(3000);
      expect(tickSpy).toHaveBeenCalled();
    });
  });

  /* -------------------------------------------------------------
   * 7. Turn Validation, Passing & Guards
   * ------------------------------------------------------------- */
  describe('Turn Validation & Voluntary Pass', () => {
    it('throws an error if a non-active teammate attempts to guess', async () => {
      const session = initTeamGuessingSession('FEUD-GUARD', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
      });

      // Active player is Bob (p2). Alice (p1) tries to guess.
      await expect(
        session.evaluateGuess('p1', 'Sofa', async () => ({ isMatched: true, points: 42 }))
      ).rejects.toThrow('It is not your turn to guess. Active player is Bob.');
    });

    it('allows active player to pass voluntarily, counting as a strike', () => {
      const session = initTeamGuessingSession('FEUD-PASS', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
      });

      expect(session.activePlayer.id).toBe('p2');

      const passRes = session.passTurn('p2');
      expect(passRes.outcome).toBe('STRIKE');
      expect(passRes.strikeCount).toBe(1);
      expect(session.strikes).toBe(1);

      // Advances to p3
      expect(session.activePlayer.id).toBe('p3');
    });

    it('rejects passTurn when called by non-active player', () => {
      const session = initTeamGuessingSession('FEUD-PASS-ERR', {
        gameId: 'game-1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
      });

      expect(() => session.passTurn('p1')).toThrow('Only the active player (Bob) can pass.');
    });
  });

  /* -------------------------------------------------------------
   * 8. Factory: createTeamGuessingSessionFromFaceOff
   * ------------------------------------------------------------- */
  describe('Factory: createTeamGuessingSessionFromFaceOff', () => {
    it('smoothly converts FaceOffSession into TeamGuessingSession with carried bank and cards', () => {
      const faceOff = initFaceOffSession('FEUD-CONV', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players,
        team2Players,
        question: mockQuestion,
      });

      // Simulate Face-Off winning and choosing PLAY
      faceOff.team1Contender.isReady = true;
      faceOff.team2Contender.isReady = true;
      faceOff.phase = 'PASS_OR_PLAY';
      faceOff['winnerPlayerId'] = 'p1';
      faceOff['winnerNickname'] = 'Alice';
      faceOff['winnerTeam'] = 'TEAM_1';
      faceOff.revealedAnswers = [
        {
          id: 'a1',
          answerText: 'Sofa / Couch',
          points: 42,
          rankOrder: 1,
          revealedByPlayerId: 'p1',
          revealedByNickname: 'Alice',
          revealedByTeam: 'TEAM_1',
        },
      ];

      faceOff.choosePlayOrPass('p1', 'play');
      expect(faceOff.controllingTeam).toBe('TEAM_1');

      const teamSession = createTeamGuessingSessionFromFaceOff(faceOff);

      expect(teamSession.roomCode).toBe('FEUD-CONV');
      expect(teamSession.controllingTeam).toBe('TEAM_1');
      expect(teamSession.roundBank).toBe(42);
      expect(teamSession.revealedAnswers).toHaveLength(1);
      expect(teamSession.activePlayer.id).toBe('p2'); // Player 2 starts
    });

    it('throws error if face-off controllingTeam is not set', () => {
      const faceOff = initFaceOffSession('FEUD-NO-CONTROL', {
        gameId: 'game-1',
        roundNumber: 1,
        team1Players,
        team2Players,
        question: mockQuestion,
      });

      expect(() => createTeamGuessingSessionFromFaceOff(faceOff)).toThrow(
        'Cannot create TeamGuessingSession: FaceOff controllingTeam is not set.'
      );
    });
  });

  /* -------------------------------------------------------------
   * 9. Registry Management
   * ------------------------------------------------------------- */
  describe('Registry Management', () => {
    it('retrieves, removes, and clears sessions correctly', () => {
      const s1 = initTeamGuessingSession('FEUD-REG1', {
        gameId: 'g1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
      });

      expect(getTeamGuessingSession('FEUD-REG1')).toBe(s1);

      removeTeamGuessingSession('FEUD-REG1');
      expect(getTeamGuessingSession('FEUD-REG1')).toBeUndefined();

      initTeamGuessingSession('FEUD-REG2', {
        gameId: 'g1',
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players,
        team2Players,
        question: mockQuestion,
      });

      clearAllTeamGuessingSessions();
      expect(getTeamGuessingSession('FEUD-REG2')).toBeUndefined();
    });
  });
});

