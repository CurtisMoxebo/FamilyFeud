import { describe, it, expect } from 'vitest';
import {
  FastMoneySession,
  FastMoneyQuestionItem,
} from '../src/services/fastMoneySession';

describe('FastMoneySession State Machine (US-07 Step 1)', () => {
  const mockQuestions: FastMoneyQuestionItem[] = [
    { id: 'q-1', questionText: 'Name a breakfast food', orderIndex: 1 },
    { id: 'q-2', questionText: 'Name something you find in the sky', orderIndex: 2 },
    { id: 'q-3', questionText: 'Name an animal in a zoo', orderIndex: 3 },
    { id: 'q-4', questionText: 'Name a day of the week', orderIndex: 4 },
    { id: 'q-5', questionText: 'Name a cold drink', orderIndex: 5 },
  ];

  const defaultOptions = {
    gameId: 'game-101',
    roomCode: 'FEUD-FM01',
    player1Id: 'p1-uuid',
    player2Id: 'p2-uuid',
    questions: mockQuestions,
    timerDurationSeconds: 60,
  };

  describe('Initialization & State Setup', () => {
    it('initializes in P1_READY phase with empty submissions and 60 seconds duration', () => {
      const session = new FastMoneySession(defaultOptions);

      expect(session.getPhase()).toBe('P1_READY');
      expect(session.getRemainingSeconds()).toBe(60);
      expect(session.getAnsweredCount()).toBe(0);
      expect(session.getPassedCount()).toBe(0);
      expect(session.getCurrentQuestion()).toBeNull();
      expect(session.isTurnFinished()).toBe(false);
    });

    it('throws if questions array is empty', () => {
      expect(
        () =>
          new FastMoneySession({
            ...defaultOptions,
            questions: [],
          })
      ).toThrow('FastMoneySession requires at least 1 survey question');
    });
  });

  describe('Scenario 1: Ready Button Starts 60-Second Timer', () => {
    it('starts turn and pops Question 1 when Player 1 clicks Ready', () => {
      const session = new FastMoneySession(defaultOptions);

      session.startPlayer1Turn('p1-uuid');

      expect(session.getPhase()).toBe('P1_PLAYING');
      expect(session.getCurrentQuestion()?.id).toBe('q-1');
      expect(session.getCurrentQuestion()?.questionText).toBe('Name a breakfast food');
      expect(session.getRemainingSeconds()).toBe(60);
    });

    it('throws if unauthorized player (e.g. Player 2) attempts to start Player 1 turn', () => {
      const session = new FastMoneySession(defaultOptions);

      expect(() => session.startPlayer1Turn('p2-uuid')).toThrow(
        'Only Player 1 (p1-uuid) can start Player 1 round'
      );
    });

    it('throws if starting when already playing or finished', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');

      expect(() => session.startPlayer1Turn('p1-uuid')).toThrow(
        'Cannot start turn from phase P1_PLAYING'
      );
    });
  });

  describe('Scenario 2: Submitting an Answer Advances with Zero Latency', () => {
    it('records answer for Question 1 and immediately advances to Question 2', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');

      const submission = session.submitAnswer('p1-uuid', 'q-1', 'Pancakes');

      expect(submission.questionId).toBe('q-1');
      expect(submission.rawAnswer).toBe('Pancakes');
      expect(submission.orderAttempted).toBe(1);

      expect(session.getAnsweredCount()).toBe(1);
      expect(session.getCurrentQuestion()?.id).toBe('q-2');
    });

    it('throws if submitting an empty or whitespace-only answer', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');

      expect(() => session.submitAnswer('p1-uuid', 'q-1', '   ')).toThrow(
        'Cannot submit an empty answer'
      );
    });

    it('throws if questionId does not match current active question', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');

      expect(() => session.submitAnswer('p1-uuid', 'q-4', 'Friday')).toThrow(
        'Submitted questionId does not match current active question'
      );
    });

    it('transitions to P1_FINISHED when all 5 questions receive answers', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');

      session.submitAnswer('p1-uuid', 'q-1', 'Eggs');
      session.submitAnswer('p1-uuid', 'q-2', 'Clouds');
      session.submitAnswer('p1-uuid', 'q-3', 'Lion');
      session.submitAnswer('p1-uuid', 'q-4', 'Monday');
      session.submitAnswer('p1-uuid', 'q-5', 'Iced Tea');

      expect(session.getPhase()).toBe('P1_FINISHED');
      expect(session.getAnsweredCount()).toBe(5);
      expect(session.getCurrentQuestion()).toBeNull();
      expect(session.isAllAnswered()).toBe(true);
      expect(session.isTurnFinished()).toBe(true);
    });
  });

  describe('Scenario 3: Passing and Re-visiting Questions', () => {
    it('moves passed Question 2 to passedQueue, advances to Question 3, and returns to Question 2 after Q5', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');

      // 1. Answer Q1
      session.submitAnswer('p1-uuid', 'q-1', 'Eggs');
      expect(session.getCurrentQuestion()?.id).toBe('q-2');

      // 2. Pass Q2
      session.passQuestion('p1-uuid', 'q-2');
      expect(session.getPassedCount()).toBe(1);
      expect(session.getCurrentQuestion()?.id).toBe('q-3'); // Advanced to Q3!

      // 3. Answer Q3, Q4, Q5
      session.submitAnswer('p1-uuid', 'q-3', 'Tiger');
      expect(session.getCurrentQuestion()?.id).toBe('q-4');

      session.submitAnswer('p1-uuid', 'q-4', 'Friday');
      expect(session.getCurrentQuestion()?.id).toBe('q-5');

      session.submitAnswer('p1-uuid', 'q-5', 'Soda');

      // 4. Q2 loops back!
      expect(session.getCurrentQuestion()?.id).toBe('q-2');
      expect(session.getAnsweredCount()).toBe(4);
      expect(session.isTurnFinished()).toBe(false);

      // 5. Answer the recycled Q2
      session.submitAnswer('p1-uuid', 'q-2', 'Birds');

      // Turn is complete!
      expect(session.getPhase()).toBe('P1_FINISHED');
      expect(session.getAnsweredCount()).toBe(5);
      expect(session.getPassedCount()).toBe(0);
      expect(session.isAllAnswered()).toBe(true);
    });

    it('handles multiple passed questions (Q2, Q4) recycling in chronological sequence', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');

      session.submitAnswer('p1-uuid', 'q-1', 'Cereal'); // Q1 answered
      session.passQuestion('p1-uuid', 'q-2');           // Q2 passed
      session.submitAnswer('p1-uuid', 'q-3', 'Monkey'); // Q3 answered
      session.passQuestion('p1-uuid', 'q-4');           // Q4 passed
      session.submitAnswer('p1-uuid', 'q-5', 'Water');  // Q5 answered

      // Should loop back to Q2 first
      expect(session.getCurrentQuestion()?.id).toBe('q-2');
      session.submitAnswer('p1-uuid', 'q-2', 'Airplane');

      // Next should be Q4
      expect(session.getCurrentQuestion()?.id).toBe('q-4');
      session.submitAnswer('p1-uuid', 'q-4', 'Saturday');

      expect(session.getPhase()).toBe('P1_FINISHED');
      expect(session.getAnsweredCount()).toBe(5);
    });

    it('allows a question to be passed multiple times (re-cycling to end of passed queue)', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');

      session.submitAnswer('p1-uuid', 'q-1', 'A1');
      session.passQuestion('p1-uuid', 'q-2');
      session.submitAnswer('p1-uuid', 'q-3', 'A3');
      session.passQuestion('p1-uuid', 'q-4');
      session.submitAnswer('p1-uuid', 'q-5', 'A5');

      // Active is Q2. Pass Q2 again!
      expect(session.getCurrentQuestion()?.id).toBe('q-2');
      session.passQuestion('p1-uuid', 'q-2');

      // Should advance to Q4!
      expect(session.getCurrentQuestion()?.id).toBe('q-4');

      // Pass Q4 again!
      session.passQuestion('p1-uuid', 'q-4');

      // Loops back to Q2!
      expect(session.getCurrentQuestion()?.id).toBe('q-2');
    });
  });

  describe('Scenario 4: Timer Expiration', () => {
    it('terminates turn immediately when expireTimer is called', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');

      session.submitAnswer('p1-uuid', 'q-1', 'Bacon');
      session.submitAnswer('p1-uuid', 'q-2', 'Sun');

      session.expireTimer();

      expect(session.getPhase()).toBe('P1_FINISHED');
      expect(session.isTurnFinished()).toBe(true);
      expect(session.getCurrentQuestion()).toBeNull();
      expect(session.getAnsweredCount()).toBe(2);
    });

    it('rejects submissions once the turn has finished', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');
      session.expireTimer();

      expect(() => session.submitAnswer('p1-uuid', 'q-1', 'Toast')).toThrow(
        'Turn is not currently active'
      );
    });
  });

  describe('Scenario 5: Player 2 Offstage Isolation & Sanitized Snapshots', () => {
    it('provides Player 2 with an offstage isolation screen that strictly conceals question text and answers', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');

      const p2Snapshot = session.getPlayer2Snapshot();

      expect(p2Snapshot.isOffstage).toBe(true);
      expect(p2Snapshot.isolationMessage).toContain('Look away from the host screen');
      expect((p2Snapshot as any).currentQuestion).toBeUndefined();
      expect((p2Snapshot as any).submissions).toBeUndefined();
    });

    it('provides Player 1 with full active question details and input controls', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');

      const p1Snapshot = session.getPlayer1Snapshot();

      expect(p1Snapshot.phase).toBe('P1_PLAYING');
      expect(p1Snapshot.currentQuestion?.id).toBe('q-1');
      expect(p1Snapshot.currentQuestion?.questionNumber).toBe(1);
      expect(p1Snapshot.canSubmit).toBe(true);
      expect(p1Snapshot.canPass).toBe(true);
    });

    it('provides Host with concealed slot progression without leaking raw answer strings or points', () => {
      const session = new FastMoneySession(defaultOptions);
      session.startPlayer1Turn('p1-uuid');
      session.submitAnswer('p1-uuid', 'q-1', 'Eggs');

      const hostSnapshot = session.getHostSnapshot();

      expect(hostSnapshot.totalQuestions).toBe(5);
      expect(hostSnapshot.answeredCount).toBe(1);
      expect(hostSnapshot.slots).toEqual([
        { slotNumber: 1, isFilled: true },
        { slotNumber: 2, isFilled: false },
        { slotNumber: 3, isFilled: false },
        { slotNumber: 4, isFilled: false },
        { slotNumber: 5, isFilled: false },
      ]);
      expect((hostSnapshot as any).rawAnswers).toBeUndefined();
    });
  });
});

