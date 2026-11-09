import { describe, it, expect, beforeEach } from 'vitest';
import {
  FastMoneySession,
  FastMoneyQuestionItem,
  FastMoneySessionOptions,
} from '../src/services/fastMoneySession';

describe('FastMoneySession: Player 2 Reveal, Victory & Replay (US-10 Step 1)', () => {
  const mockQuestions: FastMoneyQuestionItem[] = [
    {
      id: 'q-1',
      questionText: 'Name something you eat with a spoon',
      orderIndex: 0,
      answers: [
        { id: 'ans-1', answerText: 'Soup', points: 45, rankOrder: 1 },
        { id: 'ans-2', answerText: 'Cereal', points: 30, rankOrder: 2 },
        { id: 'ans-3', answerText: 'Ice Cream', points: 15, rankOrder: 3 },
      ],
    },
    {
      id: 'q-2',
      questionText: 'Name a yellow fruit',
      orderIndex: 1,
      answers: [
        { id: 'ans-4', answerText: 'Banana', points: 65, rankOrder: 1 },
        { id: 'ans-5', answerText: 'Lemon', points: 25, rankOrder: 2 },
      ],
    },
    {
      id: 'q-3',
      questionText: 'Name something you wear on your head',
      orderIndex: 2,
      answers: [
        { id: 'ans-6', answerText: 'Hat', points: 50, rankOrder: 1 },
        { id: 'ans-7', answerText: 'Cap', points: 30, rankOrder: 2 },
      ],
    },
    {
      id: 'q-4',
      questionText: 'Name a day of the weekend',
      orderIndex: 3,
      answers: [
        { id: 'ans-8', answerText: 'Saturday', points: 55, rankOrder: 1 },
        { id: 'ans-9', answerText: 'Sunday', points: 45, rankOrder: 2 },
      ],
    },
    {
      id: 'q-5',
      questionText: 'Name an animal with stripes',
      orderIndex: 4,
      answers: [
        { id: 'ans-10', answerText: 'Zebra', points: 70, rankOrder: 1 },
        { id: 'ans-11', answerText: 'Tiger', points: 30, rankOrder: 2 },
      ],
    },
  ];

  let session: FastMoneySession;
  let options: FastMoneySessionOptions;

  beforeEach(() => {
    options = {
      gameId: 'game-vic-100',
      roomCode: 'FEUD-V100',
      player1Id: 'p1-alice',
      player2Id: 'p2-bob',
      questions: mockQuestions,
      timerDurationSeconds: 60,
      p2TimerDurationSeconds: 75,
    };
    session = new FastMoneySession(options);
  });

  describe('Player 2 Reveal Sequence & Phase Guarding', () => {
    beforeEach(() => {
      // Simulate Player 1 round & reveal completion
      session.startPlayer1Turn('p1-alice');
      session.submitAnswer('p1-alice', 'q-1', 'Soup');
      session.submitAnswer('p1-alice', 'q-2', 'Lemon');
      session.submitAnswer('p1-alice', 'q-3', 'Hat');
      session.submitAnswer('p1-alice', 'q-4', 'Saturday');
      session.submitAnswer('p1-alice', 'q-5', 'Zebra');

      session.recordEvaluation('q-1', 45, true, 'ans-1', 1);
      session.recordEvaluation('q-2', 25, true, 'ans-5', 1);
      session.recordEvaluation('q-3', 50, true, 'ans-6', 1);
      session.recordEvaluation('q-4', 55, true, 'ans-8', 1);
      session.recordEvaluation('q-5', 70, true, 'ans-10', 1);

      session.startRevealPhase();
      for (let i = 1; i <= 5; i++) {
        session.revealAnswer(i);
        session.revealPoints(i);
      }
      expect(session.getPhase()).toBe('P2_READY');

      // Player 2 plays
      session.startPlayer2Turn('p2-bob');
      expect(session.getPhase()).toBe('P2_PLAYING');
      session.submitAnswer('p2-bob', 'q-1', 'Cereal');
      session.submitAnswer('p2-bob', 'q-2', 'Banana');
      session.submitAnswer('p2-bob', 'q-3', 'Cap');
      session.submitAnswer('p2-bob', 'q-4', 'Sunday');
      session.submitAnswer('p2-bob', 'q-5', 'Tiger');

      session.recordEvaluation('q-1', 30, true, 'ans-2', 2);
      session.recordEvaluation('q-2', 65, true, 'ans-4', 2);
      session.recordEvaluation('q-3', 30, true, 'ans-7', 2);
      session.recordEvaluation('q-4', 45, true, 'ans-9', 2);
      session.recordEvaluation('q-5', 30, true, 'ans-11', 2);
      expect(session.getPhase()).toBe('P2_FINISHED');
    });

    it('transitions to P2_REVEAL upon startP2RevealPhase()', () => {
      session.startP2RevealPhase();
      expect(session.getPhase()).toBe('P2_REVEAL');
      expect(session.getActiveP2RevealSlotNumber()).toBe(1);
    });

    it('throws when attempting to reveal Player 2 answers or points outside P2_REVEAL', () => {
      expect(() => session.revealP2Answer(1)).toThrow(/outside of P2_REVEAL phase/);
      expect(() => session.revealP2Points(1)).toThrow(/outside of P2_REVEAL phase/);
    });

    it('enforces sequential reveal: cannot reveal slot 2 before slot 1 points are revealed', () => {
      session.startP2RevealPhase();
      session.revealP2Answer(1);
      expect(() => session.revealP2Answer(2)).toThrow(/before completing reveal for slot 1/);
    });

    it('enforces answer-first reveal: cannot reveal slot points before its answer', () => {
      session.startP2RevealPhase();
      expect(() => session.revealP2Points(1)).toThrow(/before revealing answer/);
    });
  });

  describe('Scenario 2: Immediate Victory at 200 Points Mid-Reveal', () => {
    beforeEach(() => {
      // Player 1 earns 140 points
      session.startPlayer1Turn('p1-alice');
      session.submitAnswer('p1-alice', 'q-1', 'Soup');
      session.submitAnswer('p1-alice', 'q-2', 'Lemon');
      session.submitAnswer('p1-alice', 'q-3', 'Hat');
      session.submitAnswer('p1-alice', 'q-4', 'CustomPassAns1');
      session.submitAnswer('p1-alice', 'q-5', 'CustomPassAns2');

      session.recordEvaluation('q-1', 45, true, 'ans-1', 1);
      session.recordEvaluation('q-2', 25, true, 'ans-5', 1);
      session.recordEvaluation('q-3', 50, true, 'ans-6', 1);
      session.recordEvaluation('q-4', 20, true, 'ans-custom', 1); // Total P1 = 140
      session.recordEvaluation('q-5', 0, false, undefined, 1);

      session.startRevealPhase();
      for (let i = 1; i <= 5; i++) {
        session.revealAnswer(i);
        session.revealPoints(i);
      }
      expect(session.getP1TotalScore()).toBe(140);
      expect(session.getPhase()).toBe('P2_READY');

      // Player 2 answers
      session.startPlayer2Turn('p2-bob');
      session.submitAnswer('p2-bob', 'q-1', 'Cereal');
      session.submitAnswer('p2-bob', 'q-2', 'Banana');
      session.submitAnswer('p2-bob', 'q-3', 'Cap');
      session.submitAnswer('p2-bob', 'q-4', 'Sunday');
      session.submitAnswer('p2-bob', 'q-5', 'Tiger');

      session.recordEvaluation('q-1', 30, true, 'ans-2', 2);
      session.recordEvaluation('q-2', 65, true, 'ans-4', 2); // 140 + 30 + 65 = 235!
      session.recordEvaluation('q-3', 30, true, 'ans-7', 2);
      session.recordEvaluation('q-4', 45, true, 'ans-9', 2);
      session.recordEvaluation('q-5', 30, true, 'ans-11', 2);

      session.startP2RevealPhase();
    });

    it('satisfies Scenario 2: triggers immediate victory on Question 2 points reveal when total hits >= 200', () => {
      // Slot 1: Answer revealed
      const slot1Ans = session.revealP2Answer(1);
      expect(slot1Ans.isAnswerRevealed).toBe(true);
      expect(slot1Ans.isPointsRevealed).toBe(false);
      expect(session.getP2TotalScore()).toBe(0);
      expect(session.getGrandTotalScore()).toBe(140);

      // Slot 1: Points revealed (+30 -> Total 170)
      const slot1Pts = session.revealP2Points(1);
      expect(slot1Pts.isVictory).toBe(false);
      expect(slot1Pts.isGameOver).toBe(false);
      expect(slot1Pts.grandTotal).toBe(170);
      expect(session.getP2TotalScore()).toBe(30);
      expect(session.getPhase()).toBe('P2_REVEAL');

      // Slot 2: Answer revealed
      session.revealP2Answer(2);

      // Slot 2: Points revealed (+65 -> Total 235 >= 200)
      const slot2Pts = session.revealP2Points(2);
      expect(slot2Pts.isVictory).toBe(true);
      expect(slot2Pts.isGameOver).toBe(true);
      expect(slot2Pts.grandTotal).toBe(235);
      expect(session.getPhase()).toBe('GAME_OVER');
      expect(session.isVictory()).toBe(true);

      const summary = session.getGameOverSummary();
      expect(summary.isVictory).toBe(true);
      expect(summary.p1TotalScore).toBe(140);
      expect(summary.p2TotalScore).toBe(95); // 30 + 65
      expect(summary.grandTotal).toBe(235);
      expect(summary.targetScore).toBe(200);

      // Host snapshot reflects victory
      const hostSnap = session.getHostSnapshot();
      expect(hostSnap.phase).toBe('GAME_OVER');
      expect(hostSnap.isVictory).toBe(true);
      expect(hostSnap.grandTotal).toBe(235);
      expect(hostSnap.totalScore).toBe(235);
      expect(hostSnap.p1TotalScore).toBe(140);
      expect(hostSnap.p2TotalScore).toBe(95);

      // Remaining unrevealed answers and points are revealed on game over
      expect(hostSnap.p2RevealSlots).toBeDefined();
      expect(hostSnap.p2RevealSlots![2].isAnswerRevealed).toBe(true);
      expect(hostSnap.p2RevealSlots![2].isPointsRevealed).toBe(true);
      expect(hostSnap.p2RevealSlots![2].rawAnswer).toBe('Cap');
      expect(hostSnap.p2RevealSlots![2].pointsAwarded).toBe(30);
      expect(hostSnap.p2RevealSlots![3].isAnswerRevealed).toBe(true);
      expect(hostSnap.p2RevealSlots![3].isPointsRevealed).toBe(true);
      expect(hostSnap.p2RevealSlots![4].isAnswerRevealed).toBe(true);
      expect(hostSnap.p2RevealSlots![4].isPointsRevealed).toBe(true);
    });
  });

  describe('Scenario 3: Defeat When Final Sum is Under 200 Points', () => {
    beforeEach(() => {
      // Player 1 earns 90 points
      session.startPlayer1Turn('p1-alice');
      for (let i = 1; i <= 5; i++) {
        session.submitAnswer('p1-alice', `q-${i}`, `Answer-${i}`);
      }
      session.recordEvaluation('q-1', 30, true, 'ans-1', 1);
      session.recordEvaluation('q-2', 20, true, 'ans-2', 1);
      session.recordEvaluation('q-3', 20, true, 'ans-3', 1);
      session.recordEvaluation('q-4', 20, true, 'ans-4', 1);
      session.recordEvaluation('q-5', 0, false, undefined, 1); // P1 = 90

      session.startRevealPhase();
      for (let i = 1; i <= 5; i++) {
        session.revealAnswer(i);
        session.revealPoints(i);
      }
      expect(session.getP1TotalScore()).toBe(90);

      // Player 2 earns 85 points (90 + 85 = 175 < 200)
      session.startPlayer2Turn('p2-bob');
      for (let i = 1; i <= 5; i++) {
        session.submitAnswer('p2-bob', `q-${i}`, `P2Answer-${i}`);
      }
      session.recordEvaluation('q-1', 20, true, 'ans-101', 2);
      session.recordEvaluation('q-2', 20, true, 'ans-102', 2);
      session.recordEvaluation('q-3', 15, true, 'ans-103', 2);
      session.recordEvaluation('q-4', 15, true, 'ans-104', 2);
      session.recordEvaluation('q-5', 15, true, 'ans-105', 2); // P2 = 85

      session.startP2RevealPhase();
    });

    it('satisfies Scenario 3: concludes with defeat when all 5 questions reveal under 200 points', () => {
      // Reveal slots 1 to 4
      for (let i = 1; i <= 4; i++) {
        session.revealP2Answer(i);
        const res = session.revealP2Points(i);
        expect(res.isVictory).toBe(false);
        expect(res.isGameOver).toBe(false);
        expect(session.getPhase()).toBe('P2_REVEAL');
      }

      // Slot 5 reveals
      session.revealP2Answer(5);
      const slot5Pts = session.revealP2Points(5);
      expect(slot5Pts.isVictory).toBe(false);
      expect(slot5Pts.isGameOver).toBe(true);
      expect(slot5Pts.grandTotal).toBe(175);
      expect(session.getPhase()).toBe('GAME_OVER');
      expect(session.isVictory()).toBe(false);

      const summary = session.getGameOverSummary();
      expect(summary.isVictory).toBe(false);
      expect(summary.p1TotalScore).toBe(90);
      expect(summary.p2TotalScore).toBe(85);
      expect(summary.grandTotal).toBe(175);
      expect(summary.targetScore).toBe(200);

      // Isolation snapshot reflects defeat message
      const p2Snap = session.getPlayer2Snapshot();
      expect(p2Snap.phase).toBe('GAME_OVER');
      expect(p2Snap.isolationMessage).toContain('GAME OVER! Final Score: 175 / 200');
    });
  });

  describe('Scenario 4: Replay Reset in the Same Room', () => {
    it('satisfies Scenario 4: resets session back to P1_READY with fresh questions for a new game', () => {
      session.startPlayer1Turn('p1-alice');
      for (let i = 1; i <= 5; i++) {
        session.submitAnswer('p1-alice', `q-${i}`, `Ans-${i}`);
        session.recordEvaluation(`q-${i}`, 20, true, `ans-${i}`, 1);
      }
      session.startRevealPhase();
      for (let i = 1; i <= 5; i++) {
        session.revealAnswer(i);
        session.revealPoints(i);
      }
      session.startPlayer2Turn('p2-bob');
      for (let i = 1; i <= 5; i++) {
        session.submitAnswer('p2-bob', `q-${i}`, `P2Ans-${i}`);
        session.recordEvaluation(`q-${i}`, 25, true, `ans-p2-${i}`, 2);
      }
      session.startP2RevealPhase();
      for (let i = 1; i <= 5; i++) {
        session.revealP2Answer(i);
        const res = session.revealP2Points(i);
        if (res.isGameOver) break;
      }
      expect(session.getPhase()).toBe('GAME_OVER');
      expect(session.isTurnFinished()).toBe(true);

      // Replay with 5 brand new questions
      const freshQuestions: FastMoneyQuestionItem[] = [
        { id: 'fresh-1', questionText: 'Fresh Q1', orderIndex: 0 },
        { id: 'fresh-2', questionText: 'Fresh Q2', orderIndex: 1 },
        { id: 'fresh-3', questionText: 'Fresh Q3', orderIndex: 2 },
        { id: 'fresh-4', questionText: 'Fresh Q4', orderIndex: 3 },
        { id: 'fresh-5', questionText: 'Fresh Q5', orderIndex: 4 },
      ];

      session.resetForReplay('new-game-202', freshQuestions);

      expect(session.gameId).toBe('new-game-202');
      expect(session.getPhase()).toBe('P1_READY');
      expect(session.getP1TotalScore()).toBe(0);
      expect(session.getP2TotalScore()).toBe(0);
      expect(session.getGrandTotalScore()).toBe(0);
      expect(session.getActiveRevealSlotNumber()).toBeNull();
      expect(session.getActiveP2RevealSlotNumber()).toBeNull();

      // Verify Player 1 can start the fresh speed round immediately
      session.startPlayer1Turn('p1-alice');
      expect(session.getCurrentQuestion()?.id).toBe('fresh-1');
      expect(session.getPhase()).toBe('P1_PLAYING');
    });

    it('throws error if resetForReplay receives empty questions', () => {
      expect(() => session.resetForReplay('bad-game', [])).toThrow(/at least 1 survey question/);
    });
  });
});
