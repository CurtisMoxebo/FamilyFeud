import { describe, it, expect, beforeEach } from 'vitest';
import {
  FastMoneySession,
  FastMoneyQuestionItem,
} from '../src/services/fastMoneySession';

describe('FastMoneySession Reveal State Machine (US-08 Step 1)', () => {
  const mockQuestions: FastMoneyQuestionItem[] = [
    {
      id: 'q-1',
      questionText: 'Name something you eat for breakfast',
      orderIndex: 1,
      answers: [
        { id: 'a-1', answerText: 'Eggs', points: 35 },
        { id: 'a-2', answerText: 'Pancakes', points: 25 },
        { id: 'a-3', answerText: 'Toast', points: 15 },
      ],
    },
    {
      id: 'q-2',
      questionText: 'Name something in a living room',
      orderIndex: 2,
      answers: [
        { id: 'a-4', answerText: 'Couch', points: 40 },
        { id: 'a-5', answerText: 'Television', points: 25 },
      ],
    },
    {
      id: 'q-3',
      questionText: 'Name an animal in a zoo',
      orderIndex: 3,
      answers: [
        { id: 'a-6', answerText: 'Lion', points: 30 },
        { id: 'a-7', answerText: 'Elephant', points: 28 },
      ],
    },
    {
      id: 'q-4',
      questionText: 'Name a day of the week',
      orderIndex: 4,
      answers: [
        { id: 'a-8', answerText: 'Friday', points: 50 },
        { id: 'a-9', answerText: 'Saturday', points: 30 },
      ],
    },
    {
      id: 'q-5',
      questionText: 'Name a cold drink',
      orderIndex: 5,
      answers: [
        { id: 'a-10', answerText: 'Water', points: 32 },
        { id: 'a-11', answerText: 'Soda', points: 24 },
      ],
    },
  ];

  let session: FastMoneySession;

  beforeEach(() => {
    session = new FastMoneySession({
      gameId: 'game-reveal-01',
      roomCode: 'FEUD-REV1',
      player1Id: 'p1-uuid',
      player2Id: 'p2-uuid',
      questions: mockQuestions,
      timerDurationSeconds: 60,
    });
  });

  describe('Reveal Initialization & Answer Evaluation Seeding', () => {
    it('initializes 5 unrevealed slots and starts with 0 total score', () => {
      const slots = session.getRevealSlots();
      expect(slots).toHaveLength(5);

      slots.forEach((slot, idx) => {
        expect(slot.slotNumber).toBe(idx + 1);
        expect(slot.isAnswerRevealed).toBe(false);
        expect(slot.isPointsRevealed).toBe(false);
        expect(slot.pointsAwarded).toBe(0);
        expect(slot.rawAnswer).toBe('');
      });

      expect(session.getRoundTotalScore()).toBe(0);
      expect(session.isAllRevealed()).toBe(false);
    });

    it('auto-seeds evaluation points on submitAnswer if answer matches candidate answers', () => {
      session.startPlayer1Turn('p1-uuid');
      session.submitAnswer('p1-uuid', 'q-1', 'Eggs');

      const evaluation = session.getEvaluation('q-1');
      expect(evaluation).toBeDefined();
      expect(evaluation?.pointsAwarded).toBe(35);
      expect(evaluation?.isMatched).toBe(true);
    });

    it('allows explicit evaluation recording via recordEvaluation', () => {
      session.recordEvaluation('q-2', 40, true);
      const evalData = session.getEvaluation('q-2');
      expect(evalData?.pointsAwarded).toBe(40);
      expect(evalData?.isMatched).toBe(true);

      // Overwrite with 0 if unmatched
      session.recordEvaluation('q-2', 0, false);
      const updated = session.getEvaluation('q-2');
      expect(updated?.pointsAwarded).toBe(0);
      expect(updated?.isMatched).toBe(false);
    });
  });

  describe('Scenario 1: Step-by-Step Question Reveal', () => {
    beforeEach(() => {
      session.startPlayer1Turn('p1-uuid');
      session.submitAnswer('p1-uuid', 'q-1', 'Eggs'); // 35 pts
      session.submitAnswer('p1-uuid', 'q-2', 'Banana'); // 0 pts (unmatched)
      session.submitAnswer('p1-uuid', 'q-3', 'Elephant'); // 28 pts
      session.submitAnswer('p1-uuid', 'q-4', 'Friday'); // 50 pts
      session.submitAnswer('p1-uuid', 'q-5', 'Water'); // 32 pts
      session.startRevealPhase();
    });

    it('satisfies Scenario 1: reveals answer text on slot 1, keeping points concealed', () => {
      expect(session.getPhase()).toBe('P1_REVEAL');
      expect(session.getActiveRevealSlotNumber()).toBe(1);

      const slot1 = session.revealAnswer(1);
      expect(slot1.slotNumber).toBe(1);
      expect(slot1.rawAnswer).toBe('Eggs');
      expect(slot1.isAnswerRevealed).toBe(true);
      expect(slot1.isPointsRevealed).toBe(false);

      // In sanitized snapshot, pointsAwarded is 0 until points are revealed
      const sanitizedSlot = session.getRevealSlot(1, true);
      expect(sanitizedSlot.rawAnswer).toBe('Eggs');
      expect(sanitizedSlot.pointsAwarded).toBe(0);
      expect(session.getRoundTotalScore()).toBe(0);
    });

    it('satisfies Scenario 1: reveals points on slot 1 and increments round total', () => {
      session.revealAnswer(1);
      const slot1Points = session.revealPoints(1);

      expect(slot1Points.isPointsRevealed).toBe(true);
      expect(slot1Points.pointsAwarded).toBe(35);
      expect(slot1Points.isMatched).toBe(true);

      expect(session.getRoundTotalScore()).toBe(35);
      // Once slot 1 points revealed, active slot advances to 2
      expect(session.getActiveRevealSlotNumber()).toBe(2);
    });
  });

  describe('Scenario 2: Zero Points for Unmatched Answer', () => {
    beforeEach(() => {
      session.startPlayer1Turn('p1-uuid');
      session.submitAnswer('p1-uuid', 'q-1', 'Eggs'); // 35 pts
      session.submitAnswer('p1-uuid', 'q-2', 'Banana'); // 0 pts
      session.recordEvaluation('q-2', 0, false);
      session.startRevealPhase();
    });

    it('satisfies Scenario 2: displays typed answer, reveals 0 points, and does not increment total score', () => {
      // Slot 1 completed
      session.revealAnswer(1);
      session.revealPoints(1);
      expect(session.getRoundTotalScore()).toBe(35);

      // Slot 2 Answer: "Banana"
      const slot2Answer = session.revealAnswer(2);
      expect(slot2Answer.rawAnswer).toBe('Banana');
      expect(slot2Answer.isAnswerRevealed).toBe(true);

      // Slot 2 Points: 0 pts
      const slot2Points = session.revealPoints(2);
      expect(slot2Points.pointsAwarded).toBe(0);
      expect(slot2Points.isMatched).toBe(false);

      // Round total remains 35
      expect(session.getRoundTotalScore()).toBe(35);
    });
  });

  describe('Scenario 3: Real-Time Cumulative Score Increment', () => {
    it('satisfies Scenario 3: accumulates score cleanly from 35 to 60 as Question 2 is revealed', () => {
      session.startPlayer1Turn('p1-uuid');
      session.submitAnswer('p1-uuid', 'q-1', 'Eggs'); // 35 pts
      session.submitAnswer('p1-uuid', 'q-2', 'Television'); // 25 pts
      session.startRevealPhase();

      expect(session.getRoundTotalScore()).toBe(0);

      // Reveal slot 1
      session.revealAnswer(1);
      expect(session.getRoundTotalScore()).toBe(0);
      session.revealPoints(1);
      expect(session.getRoundTotalScore()).toBe(35);

      // Reveal slot 2
      session.revealAnswer(2);
      expect(session.getRoundTotalScore()).toBe(35);
      session.revealPoints(2);
      expect(session.getRoundTotalScore()).toBe(60);
    });
  });

  describe('Scenario 4: Completion of Player 1 Reveal & State Transition to P2_READY', () => {
    it('satisfies Scenario 4: advances state to P2_READY once all 5 slots are revealed', () => {
      session.startPlayer1Turn('p1-uuid');
      session.submitAnswer('p1-uuid', 'q-1', 'Eggs'); // 35 pts
      session.submitAnswer('p1-uuid', 'q-2', 'Couch'); // 40 pts
      session.submitAnswer('p1-uuid', 'q-3', 'Lion'); // 30 pts
      session.submitAnswer('p1-uuid', 'q-4', 'Friday'); // 50 pts
      session.submitAnswer('p1-uuid', 'q-5', 'Soda'); // 24 pts
      session.startRevealPhase();

      for (let i = 1; i <= 4; i++) {
        session.revealAnswer(i);
        session.revealPoints(i);
        expect(session.getPhase()).toBe('P1_REVEAL');
      }

      // Reveal 5th answer
      session.revealAnswer(5);
      expect(session.getPhase()).toBe('P1_REVEAL');
      expect(session.isAllRevealed()).toBe(false);

      // Reveal 5th points
      session.revealPoints(5);

      // All 5 slots revealed -> Transitions to P2_READY
      expect(session.getPhase()).toBe('P2_READY');
      expect(session.isAllRevealed()).toBe(true);
      expect(session.getActiveRevealSlotNumber()).toBeNull();
      expect(session.getRoundTotalScore()).toBe(35 + 40 + 30 + 50 + 24);
    });
  });

  describe('Sequential Pacing Guardrails & Authorization Constraints', () => {
    beforeEach(() => {
      session.startPlayer1Turn('p1-uuid');
      session.submitAnswer('p1-uuid', 'q-1', 'Eggs');
      session.submitAnswer('p1-uuid', 'q-2', 'Couch');
    });

    it('throws if attempting reveal actions outside of P1_REVEAL', () => {
      expect(() => session.revealAnswer(1)).toThrow(
        'Cannot reveal answer outside of P1_REVEAL phase (current phase: P1_PLAYING)'
      );
      expect(() => session.revealPoints(1)).toThrow(
        'Cannot reveal points outside of P1_REVEAL phase (current phase: P1_PLAYING)'
      );
    });

    it('throws if slot number is out of bounds (< 1 or > totalQuestions)', () => {
      session.startRevealPhase();

      expect(() => session.revealAnswer(0)).toThrow('Invalid slotNumber 0');
      expect(() => session.revealAnswer(6)).toThrow('Invalid slotNumber 6');
      expect(() => session.revealPoints(0)).toThrow('Invalid slotNumber 0');
      expect(() => session.revealPoints(6)).toThrow('Invalid slotNumber 6');
    });

    it('throws if revealing points before revealing answer for that slot', () => {
      session.startRevealPhase();

      expect(() => session.revealPoints(1)).toThrow(
        'Cannot reveal points for slot 1 before revealing answer'
      );
    });

    it('throws if attempting to reveal slot N before slot N-1 points are revealed (strictly sequential)', () => {
      session.startRevealPhase();

      // Attempt to reveal slot 2 before slot 1 is done
      expect(() => session.revealAnswer(2)).toThrow(
        'Cannot reveal answer for slot 2 before completing reveal for slot 1'
      );

      // Reveal slot 1 answer only
      session.revealAnswer(1);

      // Slot 1 points not yet revealed -> still blocked from revealing slot 2
      expect(() => session.revealAnswer(2)).toThrow(
        'Cannot reveal answer for slot 2 before completing reveal for slot 1'
      );

      // Once slot 1 points revealed, slot 2 answer succeeds
      session.revealPoints(1);
      expect(() => session.revealAnswer(2)).not.toThrow();
    });
  });

  describe('Scenario 5: Sanitized Snapshots (Anti-Cheating & Spectator Sync)', () => {
    beforeEach(() => {
      session.startPlayer1Turn('p1-uuid');
      session.submitAnswer('p1-uuid', 'q-1', 'Eggs');
      session.submitAnswer('p1-uuid', 'q-2', 'Couch');
      session.startRevealPhase();
    });

    it('sanitizes Host snapshot: conceals unrevealed answer strings and point values', () => {
      const hostSnapshot = session.getHostSnapshot();

      expect(hostSnapshot.phase).toBe('P1_REVEAL');
      expect(hostSnapshot.totalScore).toBe(0);
      expect(hostSnapshot.activeRevealSlotNumber).toBe(1);
      expect(hostSnapshot.revealSlots).toBeDefined();

      const slots = hostSnapshot.revealSlots!;
      expect(slots[0].rawAnswer).toBe(''); // Concealed
      expect(slots[0].pointsAwarded).toBe(0); // Concealed

      // Reveal slot 1 answer
      session.revealAnswer(1);
      const afterAnswerSnapshot = session.getHostSnapshot();
      expect(afterAnswerSnapshot.revealSlots![0].rawAnswer).toBe('Eggs');
      expect(afterAnswerSnapshot.revealSlots![0].pointsAwarded).toBe(0); // Still concealed

      // Reveal slot 1 points
      session.revealPoints(1);
      const afterPointsSnapshot = session.getHostSnapshot();
      expect(afterPointsSnapshot.revealSlots![0].rawAnswer).toBe('Eggs');
      expect(afterPointsSnapshot.revealSlots![0].pointsAwarded).toBe(35);
      expect(afterPointsSnapshot.totalScore).toBe(35);
    });

    it('synchronizes Player 1 and Player 2 snapshots in lockstep with the reveal sequence', () => {
      session.revealAnswer(1);
      session.revealPoints(1);

      const p1Snapshot = session.getPlayer1Snapshot();
      const p2Snapshot = session.getPlayer2Snapshot();

      expect(p1Snapshot.totalScore).toBe(35);
      expect(p2Snapshot.totalScore).toBe(35);
      expect(p1Snapshot.revealSlots).toEqual(p2Snapshot.revealSlots);
      expect(p2Snapshot.isolationMessage).toContain('reveal sequence in progress');
    });

    it('notifies Player 2 when transition to P2_READY completes', () => {
      // Reveal all slots
      for (let i = 1; i <= 5; i++) {
        session.revealAnswer(i);
        session.revealPoints(i);
      }

      const p2Snapshot = session.getPlayer2Snapshot();
      expect(p2Snapshot.phase).toBe('P2_READY');
      expect(p2Snapshot.isOffstage).toBe(false);
      expect(p2Snapshot.isolationMessage).toContain('Get ready for your turn');
    });
  });
});

