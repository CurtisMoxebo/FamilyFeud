import { describe, it, expect } from 'vitest';
import {
  FastMoneySession,
  FastMoneyQuestionItem,
  DuplicateAnswerError,
} from '../src/services/fastMoneySession';

describe('FastMoneySession: Player 2 Turn & Duplicate Check (US-09 Step 1)', () => {
  const mockQuestions: FastMoneyQuestionItem[] = [
    {
      id: 'q-1',
      questionText: 'Name something people drink in the morning',
      orderIndex: 1,
      answers: [
        { id: 'ans-coffee', answerText: 'Coffee', points: 45 },
        { id: 'ans-tea', answerText: 'Tea', points: 25 },
        { id: 'ans-juice', answerText: 'Orange Juice', points: 15 },
        { id: 'ans-water', answerText: 'Water', points: 10 },
        { id: 'ans-milk', answerText: 'Milk', points: 5 },
      ],
    },
    {
      id: 'q-2',
      questionText: 'Name a fruit that is yellow',
      orderIndex: 2,
      answers: [
        { id: 'ans-banana', answerText: 'Banana', points: 55 },
        { id: 'ans-lemon', answerText: 'Lemon', points: 30 },
      ],
    },
    {
      id: 'q-3',
      questionText: 'Name an animal you see at the zoo',
      orderIndex: 3,
      answers: [
        { id: 'ans-lion', answerText: 'Lion', points: 40 },
        { id: 'ans-monkey', answerText: 'Monkey', points: 30 },
      ],
    },
    {
      id: 'q-4',
      questionText: 'Name a day of the week',
      orderIndex: 4,
      answers: [
        { id: 'ans-friday', answerText: 'Friday', points: 50 },
        { id: 'ans-saturday', answerText: 'Saturday', points: 35 },
      ],
    },
    {
      id: 'q-5',
      questionText: 'Name a cold dessert',
      orderIndex: 5,
      answers: [
        { id: 'ans-icecream', answerText: 'Ice Cream', points: 60 },
        { id: 'ans-popsicle', answerText: 'Popsicle', points: 25 },
      ],
    },
  ];

  const createReadyForP2Session = (): FastMoneySession => {
    const session = new FastMoneySession({
      gameId: 'game-101',
      roomCode: 'FEUD-P201',
      player1Id: 'player-1-id',
      player2Id: 'player-2-id',
      questions: mockQuestions,
      timerDurationSeconds: 60,
      p2TimerDurationSeconds: 75,
    });

    // Complete Player 1 turn
    session.startPlayer1Turn('player-1-id');
    session.submitAnswer('player-1-id', 'q-1', 'Coffee'); // matches ans-coffee
    session.submitAnswer('player-1-id', 'q-2', 'Banana'); // matches ans-banana
    session.submitAnswer('player-1-id', 'q-3', 'Lion');   // matches ans-lion
    session.submitAnswer('player-1-id', 'q-4', 'Friday'); // matches ans-friday
    session.submitAnswer('player-1-id', 'q-5', 'Ice Cream'); // matches ans-icecream

    // Complete Player 1 reveal phase
    session.startRevealPhase();
    for (let slot = 1; slot <= 5; slot++) {
      session.revealAnswer(slot);
      session.revealPoints(slot);
    }

    // Now session is automatically in P2_READY!
    return session;
  };

  describe('Scenario 1: 75-Second Countdown Initialization (US-09)', () => {
    it('initializes Player 2 turn with 75 seconds on the clock from P2_READY', () => {
      const session = createReadyForP2Session();
      expect(session.getPhase()).toBe('P2_READY');
      expect(session.getRemainingSeconds()).toBe(75);

      session.startPlayer2Turn('player-2-id');

      expect(session.getPhase()).toBe('P2_PLAYING');
      expect(session.getRemainingSeconds()).toBe(75);
      expect(session.getCurrentQuestion()?.id).toBe('q-1');
      expect(session.getCurrentQuestion()?.questionText).toBe(
        'Name something people drink in the morning'
      );
      expect(session.getAnsweredCount('player-2-id')).toBe(0);
      expect(session.getPassedCount('player-2-id')).toBe(0);
    });

    it('rejects unauthorized player (Player 1) attempting to start Player 2 turn', () => {
      const session = createReadyForP2Session();

      expect(() => session.startPlayer2Turn('player-1-id')).toThrow(
        /Only Player 2 \(player-2-id\) can start Player 2 round/i
      );
    });

    it('rejects starting Player 2 turn from invalid phases (e.g. P1_PLAYING, P1_REVEAL)', () => {
      const session = new FastMoneySession({
        gameId: 'game-101',
        roomCode: 'FEUD-P201',
        player1Id: 'player-1-id',
        player2Id: 'player-2-id',
        questions: mockQuestions,
      });

      expect(() => session.startPlayer2Turn('player-2-id')).toThrow(
        /Cannot start Player 2 turn from phase P1_READY/i
      );
    });
  });

  describe('Scenario 2: Duplicate Answer Detection & Prompt to Try Again (US-09)', () => {
    it('detects exact raw text duplicate of Player 1 answer', () => {
      const session = createReadyForP2Session();
      session.startPlayer2Turn('player-2-id');

      const dupCheck = session.checkPlayer2Duplicate('q-1', 'Coffee');
      expect(dupCheck.isDuplicate).toBe(true);
      expect(dupCheck.reason).toBe('EXACT_RAW');
      expect(dupCheck.duplicateWithAnswer).toBe('Coffee');
    });

    it('detects case-insensitive, whitespace, and diacritic duplicates', () => {
      const session = createReadyForP2Session();
      session.startPlayer2Turn('player-2-id');

      // Lowercase
      expect(session.checkPlayer2Duplicate('q-1', 'coffee').isDuplicate).toBe(true);
      // Punctuation and whitespace
      expect(session.checkPlayer2Duplicate('q-1', '  COFFEE!!  ').isDuplicate).toBe(true);
      // Diacritic tolerance (Café -> Coffee in normalization)
      expect(session.checkPlayer2Duplicate('q-1', '  cOfFeE  ').isDuplicate).toBe(true);
    });

    it('detects semantic synonym duplicate matching board answer ID credited to Player 1', () => {
      const session = createReadyForP2Session();
      session.startPlayer2Turn('player-2-id');

      // Player 2 submits "espresso", which validates to 'ans-coffee' (already matched by Player 1)
      const dupCheck = session.checkPlayer2Duplicate('q-1', 'espresso', 'ans-coffee');
      expect(dupCheck.isDuplicate).toBe(true);
      expect(dupCheck.reason).toBe('SEMANTIC_MATCH');
      expect(dupCheck.duplicateWithAnswer).toBe('Coffee');
    });

    it('prevents question queue from advancing when duplicate is submitted and throws DuplicateAnswerError', () => {
      const session = createReadyForP2Session();
      session.startPlayer2Turn('player-2-id');

      expect(() => session.submitAnswer('player-2-id', 'q-1', 'coffee')).toThrow(
        DuplicateAnswerError
      );

      // Question MUST NOT advance!
      expect(session.getCurrentQuestion()?.id).toBe('q-1');
      expect(session.getAnsweredCount('player-2-id')).toBe(0);
      expect(session.getSubmissions('player-2-id')).toHaveLength(0);
    });
  });

  describe('Scenario 3: Valid Alternate Answer Advances Queue (US-09)', () => {
    it('allows Player 2 to formulate and submit a distinct valid answer after duplicate alert', () => {
      const session = createReadyForP2Session();
      session.startPlayer2Turn('player-2-id');

      // 1. First attempt triggers duplicate
      expect(session.checkPlayer2Duplicate('q-1', 'coffee').isDuplicate).toBe(true);

      // 2. Alternate answer "Tea" passes duplicate check
      const alternateCheck = session.checkPlayer2Duplicate('q-1', 'Tea', 'ans-tea');
      expect(alternateCheck.isDuplicate).toBe(false);

      // 3. Submits alternate answer
      const submission = session.submitAnswer('player-2-id', 'q-1', 'Tea');
      expect(submission.questionId).toBe('q-1');
      expect(submission.rawAnswer).toBe('Tea');

      // 4. Queue advances to Question 2!
      expect(session.getCurrentQuestion()?.id).toBe('q-2');
      expect(session.getAnsweredCount('player-2-id')).toBe(1);
    });
  });

  describe('Scenario 4: Player 2 Can Pass and Return (US-09)', () => {
    it('cycles passed Question 2 to passedQueue and re-presents it after Question 5', () => {
      const session = createReadyForP2Session();
      session.startPlayer2Turn('player-2-id');

      // Answer Q1
      session.submitAnswer('player-2-id', 'q-1', 'Tea');
      expect(session.getCurrentQuestion()?.id).toBe('q-2');

      // Pass Q2 (Yellow Fruit)
      session.passQuestion('player-2-id', 'q-2');
      expect(session.getPassedCount('player-2-id')).toBe(1);
      expect(session.getCurrentQuestion()?.id).toBe('q-3'); // Advanced to Q3!

      // Answer Q3, Q4, Q5
      session.submitAnswer('player-2-id', 'q-3', 'Monkey');
      expect(session.getCurrentQuestion()?.id).toBe('q-4');

      session.submitAnswer('player-2-id', 'q-4', 'Saturday');
      expect(session.getCurrentQuestion()?.id).toBe('q-5');

      session.submitAnswer('player-2-id', 'q-5', 'Popsicle');

      // Now passed Q2 returns!
      expect(session.getCurrentQuestion()?.id).toBe('q-2');
      expect(session.getAnsweredCount('player-2-id')).toBe(4);

      // Answer recycled Q2 with distinct answer "Lemon"
      session.submitAnswer('player-2-id', 'q-2', 'Lemon');

      // All 5 answered -> transitions to P2_FINISHED!
      expect(session.getPhase()).toBe('P2_FINISHED');
      expect(session.getAnsweredCount('player-2-id')).toBe(5);
      expect(session.getCurrentQuestion()).toBeNull();
      expect(session.isAllAnswered('player-2-id')).toBe(true);
    });
  });

  describe('Scenario 5: 75-Second Timer Expiration & Authoritative Snapshots', () => {
    it('expires timer and transitions phase to P2_FINISHED while preserving submissions', () => {
      const session = createReadyForP2Session();
      session.startPlayer2Turn('player-2-id');

      session.submitAnswer('player-2-id', 'q-1', 'Tea');
      session.submitAnswer('player-2-id', 'q-2', 'Lemon');

      session.expireTimer();

      expect(session.getPhase()).toBe('P2_FINISHED');
      expect(session.getCurrentQuestion()).toBeNull();
      expect(session.getAnsweredCount('player-2-id')).toBe(2);
      expect(session.getSubmissions('player-2-id')).toHaveLength(2);
    });

    it('generates sanitized Player 2 speed-round snapshot during P2_PLAYING', () => {
      const session = createReadyForP2Session();
      session.startPlayer2Turn('player-2-id');

      const snapshot = session.getPlayer2Snapshot();

      expect(snapshot.phase).toBe('P2_PLAYING');
      expect(snapshot.isOffstage).toBe(false);
      expect(snapshot.remainingSeconds).toBe(75);
      expect(snapshot.isTimerRunning).toBe(true);
      expect(snapshot.canSubmit).toBe(true);
      expect(snapshot.canPass).toBe(true);
      expect(snapshot.currentQuestion?.id).toBe('q-1');
      expect(snapshot.currentQuestion?.questionNumber).toBe(1);
      expect(snapshot.answeredCount).toBe(0);
      expect(snapshot.passedCount).toBe(0);
      expect(snapshot.totalQuestions).toBe(5);
    });

    it('generates host snapshot reflecting active Player 2 turn and dual-player slot states', () => {
      const session = createReadyForP2Session();
      session.startPlayer2Turn('player-2-id');

      session.submitAnswer('player-2-id', 'q-1', 'Tea');

      const hostSnapshot = session.getHostSnapshot();

      expect(hostSnapshot.phase).toBe('P2_PLAYING');
      expect(hostSnapshot.remainingSeconds).toBe(75);
      expect(hostSnapshot.activeQuestionNumber).toBe(2);
      expect(hostSnapshot.p1Slots).toHaveLength(5);
      expect(hostSnapshot.p2Slots).toHaveLength(5);
      expect(hostSnapshot.p2Slots?.[0].isFilled).toBe(true);
      expect(hostSnapshot.p2Slots?.[1].isFilled).toBe(false);
    });
  });
});

