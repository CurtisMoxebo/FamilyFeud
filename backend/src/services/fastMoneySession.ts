import { SupportedLanguage } from './geminiService';

export type FastMoneyPhase =
  | 'P1_READY'
  | 'P1_PLAYING'
  | 'P1_FINISHED'
  | 'P2_READY'
  | 'P2_PLAYING'
  | 'P2_FINISHED'
  | 'P1_REVEAL'
  | 'P2_REVEAL';

export interface FastMoneyQuestionAnswer {
  id: string;
  answerText: string;
  points: number;
  rankOrder?: number;
  [key: string]: unknown;
}

export interface FastMoneyQuestionItem {
  id: string;
  questionText: string;
  orderIndex: number;
  answers?: FastMoneyQuestionAnswer[];
}

export interface SubmittedAnswerRecord {
  questionId: string;
  questionText: string;
  rawAnswer: string;
  submittedAt: number;
  timeRemainingSeconds: number;
  orderAttempted: number;
}

export interface EvaluationRecord {
  pointsAwarded: number;
  isMatched: boolean;
  matchedAnswerId?: string;
  matchedAnswerText?: string;
}

export interface FastMoneyRevealSlot {
  slotNumber: number;
  questionId: string;
  questionText: string;
  rawAnswer: string;
  pointsAwarded: number;
  isAnswerRevealed: boolean;
  isPointsRevealed: boolean;
  isMatched: boolean;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason?: 'EXACT_RAW' | 'SEMANTIC_MATCH';
  duplicateWithAnswer?: string;
  message?: string;
}

export class DuplicateAnswerError extends Error {
  public readonly questionId: string;
  public readonly rawAnswer: string;
  public readonly reason: 'EXACT_RAW' | 'SEMANTIC_MATCH';
  public readonly duplicateWithAnswer?: string;

  constructor(
    questionId: string,
    rawAnswer: string,
    reason: 'EXACT_RAW' | 'SEMANTIC_MATCH',
    duplicateWithAnswer?: string
  ) {
    super(`Duplicate answer for question ${questionId}: "${rawAnswer}"`);
    this.name = 'DuplicateAnswerError';
    this.questionId = questionId;
    this.rawAnswer = rawAnswer;
    this.reason = reason;
    this.duplicateWithAnswer = duplicateWithAnswer;
  }
}

export interface FastMoneySessionOptions {
  gameId: string;
  roomCode: string;
  player1Id: string;
  player2Id: string;
  questions: FastMoneyQuestionItem[];
  timerDurationSeconds?: number;
  p2TimerDurationSeconds?: number;
  language?: SupportedLanguage;
}

export interface Player1StateSnapshot {
  phase: FastMoneyPhase;
  currentQuestion: {
    id: string;
    questionText: string;
    questionNumber: number; // 1 to 5
    totalQuestions: number;
  } | null;
  answeredCount: number;
  passedCount: number;
  totalQuestions: number;
  remainingSeconds: number;
  isTimerRunning: boolean;
  canSubmit: boolean;
  canPass: boolean;
  totalScore?: number;
  revealSlots?: FastMoneyRevealSlot[];
  activeRevealSlotNumber?: number | null;
}

export interface Player2IsolationSnapshot {
  phase: FastMoneyPhase;
  isOffstage: boolean;
  isolationMessage: string;
  remainingSeconds: number;
  isTimerRunning: boolean;
  totalScore?: number;
  revealSlots?: FastMoneyRevealSlot[];
  activeRevealSlotNumber?: number | null;
  // Speed Round Active Playing Properties (US-09)
  currentQuestion?: {
    id: string;
    questionText: string;
    questionNumber: number;
    totalQuestions: number;
  } | null;
  answeredCount?: number;
  passedCount?: number;
  totalQuestions?: number;
  canSubmit?: boolean;
  canPass?: boolean;
}

export interface HostStateSnapshot {
  phase: FastMoneyPhase;
  activeQuestionNumber: number | null;
  totalQuestions: number;
  answeredCount: number;
  remainingSeconds: number;
  isTimerRunning: boolean;
  currentQuestionText: string | null;
  slots: {
    slotNumber: number;
    isFilled: boolean;
  }[];
  p1Slots?: {
    slotNumber: number;
    isFilled: boolean;
  }[];
  p2Slots?: {
    slotNumber: number;
    isFilled: boolean;
  }[];
  totalScore?: number;
  p1TotalScore?: number;
  revealSlots?: FastMoneyRevealSlot[];
  activeRevealSlotNumber?: number | null;
}

/**
 * FastMoneySession: Manages question queues, pass recycling, authoritative timers,
 * sequential reveal sequencing, and duplicate answer checking (US-07, US-08, US-09).
 */
export class FastMoneySession {
  public readonly gameId: string;
  public readonly roomCode: string;
  public readonly player1Id: string;
  public readonly player2Id: string;
  public readonly timerDurationSeconds: number;
  public readonly p2TimerDurationSeconds: number;
  public readonly language: SupportedLanguage;

  private readonly questions: FastMoneyQuestionItem[];

  // Player 1 Queues & Submissions
  private unattemptedQueue: FastMoneyQuestionItem[];
  private passedQueue: FastMoneyQuestionItem[];
  private currentQuestion: FastMoneyQuestionItem | null = null;
  private submissions: Map<string, SubmittedAnswerRecord> = new Map();
  private evaluations: Map<string, EvaluationRecord> = new Map();
  private timerStartedAt: number | null = null;
  private timerEndsAt: number | null = null;
  private attemptCounter = 0;

  // Player 2 Queues & Submissions (US-09)
  private p2UnattemptedQueue: FastMoneyQuestionItem[] = [];
  private p2PassedQueue: FastMoneyQuestionItem[] = [];
  private p2CurrentQuestion: FastMoneyQuestionItem | null = null;
  private p2Submissions: Map<string, SubmittedAnswerRecord> = new Map();
  private p2Evaluations: Map<string, EvaluationRecord> = new Map();
  private p2TimerStartedAt: number | null = null;
  private p2TimerEndsAt: number | null = null;
  private p2AttemptCounter = 0;

  // Reveal States (US-08)
  private revealStates: Map<number, { isAnswerRevealed: boolean; isPointsRevealed: boolean }> =
    new Map();

  private phase: FastMoneyPhase = 'P1_READY';

  constructor(options: FastMoneySessionOptions) {
    if (!options.questions || options.questions.length === 0) {
      throw new Error('FastMoneySession requires at least 1 survey question');
    }

    this.gameId = options.gameId;
    this.roomCode = options.roomCode;
    this.player1Id = options.player1Id;
    this.player2Id = options.player2Id;
    this.timerDurationSeconds = options.timerDurationSeconds ?? 60;
    this.p2TimerDurationSeconds = options.p2TimerDurationSeconds ?? 75; // 75s for Player 2 (DoD)
    this.language = options.language ?? 'EN';

    // Clone and sort questions by orderIndex
    this.questions = [...options.questions].sort((a, b) => a.orderIndex - b.orderIndex);
    this.unattemptedQueue = [...this.questions];
    this.passedQueue = [];

    // Initialize reveal slot states (slots 1 to 5)
    for (let i = 1; i <= this.questions.length; i++) {
      this.revealStates.set(i, { isAnswerRevealed: false, isPointsRevealed: false });
    }
  }

  // --- Normalization & Duplicate Detection (US-09) ---

  /**
   * Normalizes an answer string for duplicate detection:
   * trims, lowercases, removes diacritics/accents and non-alphanumeric characters.
   */
  public static normalizeAnswerText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Checks whether Player 2's answer is a duplicate of Player 1's answer.
   * Compares against:
   * 1. Player 1's raw normalized submission for the SAME question.
   * 2. Player 1's matched survey answer ID (for the same question or across any question).
   */
  public checkPlayer2Duplicate(
    questionId: string,
    rawAnswer: string,
    matchedAnswerId?: string | null
  ): DuplicateCheckResult {
    const normCandidate = FastMoneySession.normalizeAnswerText(rawAnswer);
    if (!normCandidate) {
      return { isDuplicate: false };
    }

    // 1. Check against Player 1's submission for this specific question
    const p1Submission = this.submissions.get(questionId);
    if (p1Submission) {
      const normP1 = FastMoneySession.normalizeAnswerText(p1Submission.rawAnswer);
      if (normCandidate === normP1) {
        return {
          isDuplicate: true,
          reason: 'EXACT_RAW',
          duplicateWithAnswer: p1Submission.rawAnswer,
          message: 'Answer already given by Player 1! Try again.',
        };
      }

      // Check if Player 1 matched a board survey answer for this question
      const p1Eval = this.evaluations.get(questionId);
      if (
        matchedAnswerId &&
        p1Eval &&
        p1Eval.isMatched &&
        p1Eval.matchedAnswerId &&
        p1Eval.matchedAnswerId === matchedAnswerId
      ) {
        return {
          isDuplicate: true,
          reason: 'SEMANTIC_MATCH',
          duplicateWithAnswer: p1Submission.rawAnswer,
          message: 'Answer already given by Player 1! Try again.',
        };
      }
    }

    // 2. Also check if matchedAnswerId matches any credited answer of Player 1 across the session
    if (matchedAnswerId) {
      const p1MatchedIds = this.getPlayer1MatchedAnswerIds();
      if (p1MatchedIds.includes(matchedAnswerId)) {
        return {
          isDuplicate: true,
          reason: 'SEMANTIC_MATCH',
          duplicateWithAnswer: p1Submission ? p1Submission.rawAnswer : undefined,
          message: 'Answer already given by Player 1! Try again.',
        };
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Retrieves all board survey answer IDs credited to Player 1.
   */
  public getPlayer1MatchedAnswerIds(): string[] {
    const ids: string[] = [];
    for (const evalRecord of this.evaluations.values()) {
      if (evalRecord.isMatched && evalRecord.matchedAnswerId) {
        ids.push(evalRecord.matchedAnswerId);
      }
    }
    return ids;
  }

  // --- Player 1 Speed Round Lifecycle ---

  /**
   * Starts Player 1's turn and starts the 60-second timer.
   */
  public startPlayer1Turn(playerId: string): void {
    if (playerId !== this.player1Id) {
      throw new Error(`Only Player 1 (${this.player1Id}) can start Player 1 round`);
    }

    if (this.phase !== 'P1_READY') {
      throw new Error(`Cannot start turn from phase ${this.phase}`);
    }

    this.phase = 'P1_PLAYING';
    this.timerStartedAt = Date.now();
    this.timerEndsAt = this.timerStartedAt + this.timerDurationSeconds * 1000;

    // Pop the first question
    this.currentQuestion = this.unattemptedQueue.shift() ?? null;
  }

  // --- Player 2 Speed Round Lifecycle (US-09) ---

  /**
   * Starts Player 2's turn and starts the 75-second countdown timer (Scenario 1).
   */
  public startPlayer2Turn(playerId: string): void {
    if (playerId !== this.player2Id) {
      throw new Error(`Only Player 2 (${this.player2Id}) can start Player 2 round`);
    }

    if (this.phase !== 'P2_READY') {
      throw new Error(`Cannot start Player 2 turn from phase ${this.phase}`);
    }

    this.phase = 'P2_PLAYING';
    this.p2TimerStartedAt = Date.now();
    this.p2TimerEndsAt = this.p2TimerStartedAt + this.p2TimerDurationSeconds * 1000;

    // Reset question queues for Player 2
    this.p2UnattemptedQueue = [...this.questions];
    this.p2PassedQueue = [];
    this.p2AttemptCounter = 0;
    this.p2CurrentQuestion = this.p2UnattemptedQueue.shift() ?? null;
  }

  // --- Answer Submission & Pass Mechanics ---

  /**
   * Submits an answer for the active question.
   * For Player 2: checks for duplicate against Player 1's answer. If duplicate, throws DuplicateAnswerError
   * without advancing the question.
   */
  public submitAnswer(
    playerId: string,
    questionId: string,
    rawAnswer: string,
    options?: { matchedAnswerId?: string | null }
  ): SubmittedAnswerRecord {
    this.assertTurnActive(playerId);

    const isPlayer2 = playerId === this.player2Id;
    const activeQ = isPlayer2 ? this.p2CurrentQuestion : this.currentQuestion;

    if (!activeQ || activeQ.id !== questionId) {
      throw new Error('Submitted questionId does not match current active question');
    }

    const trimmedAnswer = rawAnswer.trim();
    if (!trimmedAnswer) {
      throw new Error('Cannot submit an empty answer');
    }

    // US-09 Scenario 2: Enforce duplicate check for Player 2
    if (isPlayer2) {
      const dupCheck = this.checkPlayer2Duplicate(
        questionId,
        trimmedAnswer,
        options?.matchedAnswerId
      );
      if (dupCheck.isDuplicate) {
        throw new DuplicateAnswerError(
          questionId,
          trimmedAnswer,
          dupCheck.reason ?? 'EXACT_RAW',
          dupCheck.duplicateWithAnswer
        );
      }
    }

    const remainingSeconds = this.getRemainingSeconds();

    if (isPlayer2) {
      this.p2AttemptCounter += 1;
      const record: SubmittedAnswerRecord = {
        questionId: activeQ.id,
        questionText: activeQ.questionText,
        rawAnswer: trimmedAnswer,
        submittedAt: Date.now(),
        timeRemainingSeconds: remainingSeconds,
        orderAttempted: this.p2AttemptCounter,
      };

      this.p2Submissions.set(activeQ.id, record);

      // Seed evaluation if candidate answers contain exact match
      if (activeQ.answers && activeQ.answers.length > 0) {
        const norm = FastMoneySession.normalizeAnswerText(trimmedAnswer);
        const matched = activeQ.answers.find(
          (a) => FastMoneySession.normalizeAnswerText(a.answerText) === norm
        );
        if (matched) {
          this.recordEvaluation(activeQ.id, matched.points, true, matched.id, 2);
        }
      }

      // Remove from passed queue if it was previously passed
      this.p2PassedQueue = this.p2PassedQueue.filter((q) => q.id !== questionId);

      // Advance Player 2 queue
      this.advancePlayer2Queue();

      return record;
    } else {
      this.attemptCounter += 1;
      const record: SubmittedAnswerRecord = {
        questionId: activeQ.id,
        questionText: activeQ.questionText,
        rawAnswer: trimmedAnswer,
        submittedAt: Date.now(),
        timeRemainingSeconds: remainingSeconds,
        orderAttempted: this.attemptCounter,
      };

      this.submissions.set(activeQ.id, record);

      // Seed evaluation if candidate answers contain exact match
      if (activeQ.answers && activeQ.answers.length > 0) {
        const norm = FastMoneySession.normalizeAnswerText(trimmedAnswer);
        const matched = activeQ.answers.find(
          (a) => FastMoneySession.normalizeAnswerText(a.answerText) === norm
        );
        if (matched) {
          this.recordEvaluation(activeQ.id, matched.points, true, matched.id, 1);
        }
      }

      // Remove from passed queue if it was previously passed
      this.passedQueue = this.passedQueue.filter((q) => q.id !== questionId);

      // Advance Player 1 queue
      this.advanceQueue();

      return record;
    }
  }

  /**
   * Passes the active question. Moves question to the passed queue
   * and advances to the next question.
   */
  public passQuestion(playerId: string, questionId: string): FastMoneyQuestionItem | null {
    this.assertTurnActive(playerId);

    const isPlayer2 = playerId === this.player2Id;
    const activeQ = isPlayer2 ? this.p2CurrentQuestion : this.currentQuestion;

    if (!activeQ || activeQ.id !== questionId) {
      throw new Error('Passed questionId does not match current active question');
    }

    const passedItem = activeQ;

    if (isPlayer2) {
      if (!this.p2PassedQueue.some((q) => q.id === passedItem.id)) {
        this.p2PassedQueue.push(passedItem);
      } else {
        this.p2PassedQueue = this.p2PassedQueue.filter((q) => q.id !== passedItem.id);
        this.p2PassedQueue.push(passedItem);
      }
      this.advancePlayer2Queue();
      return this.p2CurrentQuestion;
    } else {
      if (!this.passedQueue.some((q) => q.id === passedItem.id)) {
        this.passedQueue.push(passedItem);
      } else {
        this.passedQueue = this.passedQueue.filter((q) => q.id !== passedItem.id);
        this.passedQueue.push(passedItem);
      }
      this.advanceQueue();
      return this.currentQuestion;
    }
  }

  /**
   * Terminates turn automatically when timer reaches 0 or all questions answered.
   */
  public expireTimer(): void {
    if (this.phase === 'P1_PLAYING') {
      this.phase = 'P1_FINISHED';
      this.currentQuestion = null;
    } else if (this.phase === 'P2_PLAYING') {
      this.phase = 'P2_FINISHED';
      this.p2CurrentQuestion = null;
    }
  }

  // --- Internal Queue Advancers ---

  private advanceQueue(): void {
    if (this.submissions.size >= this.questions.length) {
      this.phase = 'P1_FINISHED';
      this.currentQuestion = null;
      return;
    }

    if (this.unattemptedQueue.length > 0) {
      this.currentQuestion = this.unattemptedQueue.shift() ?? null;
      return;
    }

    const remainingPassed = this.passedQueue.filter((q) => !this.submissions.has(q.id));
    if (remainingPassed.length > 0) {
      const nextPassed = remainingPassed.shift()!;
      this.passedQueue = [...remainingPassed, nextPassed];
      this.currentQuestion = nextPassed;
      return;
    }

    this.phase = 'P1_FINISHED';
    this.currentQuestion = null;
  }

  private advancePlayer2Queue(): void {
    if (this.p2Submissions.size >= this.questions.length) {
      this.phase = 'P2_FINISHED';
      this.p2CurrentQuestion = null;
      return;
    }

    if (this.p2UnattemptedQueue.length > 0) {
      this.p2CurrentQuestion = this.p2UnattemptedQueue.shift() ?? null;
      return;
    }

    const remainingPassed = this.p2PassedQueue.filter((q) => !this.p2Submissions.has(q.id));
    if (remainingPassed.length > 0) {
      const nextPassed = remainingPassed.shift()!;
      this.p2PassedQueue = [...remainingPassed, nextPassed];
      this.p2CurrentQuestion = nextPassed;
      return;
    }

    this.phase = 'P2_FINISHED';
    this.p2CurrentQuestion = null;
  }

  private assertTurnActive(playerId: string): void {
    if (this.phase === 'P1_PLAYING') {
      if (playerId !== this.player1Id) {
        throw new Error(`Unauthorized player: ${playerId}`);
      }
      if (this.getRemainingSeconds() <= 0) {
        this.expireTimer();
        throw new Error('Time expired for Player 1 turn');
      }
    } else if (this.phase === 'P2_PLAYING') {
      if (playerId !== this.player2Id) {
        throw new Error(`Unauthorized player: ${playerId}`);
      }
      if (this.getRemainingSeconds() <= 0) {
        this.expireTimer();
        throw new Error('Time expired for Player 2 turn');
      }
    } else {
      throw new Error(`Turn is not currently active (current phase: ${this.phase})`);
    }
  }

  // --- Evaluation Records (US-06, US-08, US-09) ---

  /**
   * Records or updates the evaluated score for a survey question.
   */
  public recordEvaluation(
    questionId: string,
    pointsAwarded: number,
    isMatched: boolean,
    matchedAnswerId?: string,
    playerNumber: 1 | 2 = 1
  ): void {
    const record: EvaluationRecord = {
      pointsAwarded: Math.max(0, pointsAwarded),
      isMatched,
      matchedAnswerId,
    };
    if (playerNumber === 1) {
      this.evaluations.set(questionId, record);
    } else {
      this.p2Evaluations.set(questionId, record);
    }
  }

  public getEvaluation(
    questionId: string,
    playerNumber: 1 | 2 = 1
  ): EvaluationRecord | undefined {
    return playerNumber === 1 ? this.evaluations.get(questionId) : this.p2Evaluations.get(questionId);
  }

  // --- Authoritative Reveal Sequence (US-08) ---

  public startRevealPhase(): void {
    this.phase = 'P1_REVEAL';
    this.currentQuestion = null;
  }

  public revealAnswer(slotNumber: number): FastMoneyRevealSlot {
    if (this.phase !== 'P1_REVEAL') {
      throw new Error(
        `Cannot reveal answer outside of P1_REVEAL phase (current phase: ${this.phase})`
      );
    }

    if (slotNumber < 1 || slotNumber > this.questions.length) {
      throw new Error(
        `Invalid slotNumber ${slotNumber}. Must be between 1 and ${this.questions.length}`
      );
    }

    if (slotNumber > 1) {
      const prevSlotState = this.revealStates.get(slotNumber - 1);
      if (!prevSlotState || !prevSlotState.isPointsRevealed) {
        throw new Error(
          `Cannot reveal answer for slot ${slotNumber} before completing reveal for slot ${
            slotNumber - 1
          }`
        );
      }
    }

    const state = this.revealStates.get(slotNumber)!;
    state.isAnswerRevealed = true;

    return this.getRevealSlot(slotNumber);
  }

  public revealPoints(slotNumber: number): FastMoneyRevealSlot {
    if (this.phase !== 'P1_REVEAL') {
      throw new Error(
        `Cannot reveal points outside of P1_REVEAL phase (current phase: ${this.phase})`
      );
    }

    if (slotNumber < 1 || slotNumber > this.questions.length) {
      throw new Error(
        `Invalid slotNumber ${slotNumber}. Must be between 1 and ${this.questions.length}`
      );
    }

    const state = this.revealStates.get(slotNumber)!;
    if (!state.isAnswerRevealed) {
      throw new Error(`Cannot reveal points for slot ${slotNumber} before revealing answer`);
    }

    state.isPointsRevealed = true;

    if (this.isAllRevealed()) {
      this.phase = 'P2_READY';
    }

    return this.getRevealSlot(slotNumber);
  }

  public getRevealSlot(slotNumber: number, sanitized: boolean = false): FastMoneyRevealSlot {
    if (slotNumber < 1 || slotNumber > this.questions.length) {
      throw new Error(`Invalid slotNumber ${slotNumber}`);
    }

    const question = this.questions[slotNumber - 1];
    const submission = this.submissions.get(question.id);
    const evaluation = this.evaluations.get(question.id) ?? {
      pointsAwarded: 0,
      isMatched: false,
    };
    const state = this.revealStates.get(slotNumber) ?? {
      isAnswerRevealed: false,
      isPointsRevealed: false,
    };

    const rawAnswer = submission ? submission.rawAnswer : '';

    return {
      slotNumber,
      questionId: question.id,
      questionText: question.questionText,
      rawAnswer: sanitized && !state.isAnswerRevealed ? '' : rawAnswer,
      pointsAwarded: sanitized && !state.isPointsRevealed ? 0 : evaluation.pointsAwarded,
      isAnswerRevealed: state.isAnswerRevealed,
      isPointsRevealed: state.isPointsRevealed,
      isMatched: state.isPointsRevealed ? evaluation.isMatched : false,
    };
  }

  public getRevealSlots(sanitized: boolean = false): FastMoneyRevealSlot[] {
    return this.questions.map((_, idx) => this.getRevealSlot(idx + 1, sanitized));
  }

  public getRoundTotalScore(): number {
    return this.questions.reduce((sum, _, idx) => {
      const state = this.revealStates.get(idx + 1);
      if (state && state.isPointsRevealed) {
        const question = this.questions[idx];
        const evalData = this.evaluations.get(question.id);
        return sum + (evalData?.pointsAwarded ?? 0);
      }
      return sum;
    }, 0);
  }

  public isAllRevealed(): boolean {
    return this.questions.every((_, idx) => {
      const state = this.revealStates.get(idx + 1);
      return state?.isAnswerRevealed && state?.isPointsRevealed;
    });
  }

  public getActiveRevealSlotNumber(): number | null {
    if (this.phase !== 'P1_REVEAL') {
      return null;
    }
    for (let i = 1; i <= this.questions.length; i++) {
      const state = this.revealStates.get(i);
      if (!state || !state.isAnswerRevealed || !state.isPointsRevealed) {
        return i;
      }
    }
    return null;
  }

  // --- Getters & Queries ---

  public getPhase(): FastMoneyPhase {
    return this.phase;
  }

  public setPhase(phase: FastMoneyPhase): void {
    this.phase = phase;
  }

  public getCurrentQuestion(): FastMoneyQuestionItem | null {
    if (this.phase === 'P2_PLAYING') {
      return this.p2CurrentQuestion;
    }
    return this.currentQuestion;
  }

  public getRemainingSeconds(): number {
    if (this.phase === 'P1_READY') {
      return this.timerDurationSeconds;
    }

    if (this.phase === 'P1_PLAYING') {
      if (!this.timerEndsAt) return this.timerDurationSeconds;
      const remainingMs = this.timerEndsAt - Date.now();
      return Math.max(0, Math.ceil(remainingMs / 1000));
    }

    if (this.phase === 'P2_READY') {
      return this.p2TimerDurationSeconds;
    }

    if (this.phase === 'P2_PLAYING') {
      if (!this.p2TimerEndsAt) return this.p2TimerDurationSeconds;
      const remainingMs = this.p2TimerEndsAt - Date.now();
      return Math.max(0, Math.ceil(remainingMs / 1000));
    }

    return 0;
  }

  public getAnsweredCount(playerId?: string): number {
    if (
      playerId === this.player2Id ||
      this.phase === 'P2_PLAYING' ||
      this.phase === 'P2_FINISHED' ||
      this.phase === 'P2_REVEAL'
    ) {
      return this.p2Submissions.size;
    }
    return this.submissions.size;
  }

  public getPlayer1AnsweredCount(): number {
    return this.submissions.size;
  }

  public getPlayer2AnsweredCount(): number {
    return this.p2Submissions.size;
  }

  public getPassedCount(playerId?: string): number {
    if (
      playerId === this.player2Id ||
      this.phase === 'P2_PLAYING' ||
      this.phase === 'P2_FINISHED' ||
      this.phase === 'P2_REVEAL'
    ) {
      return this.p2PassedQueue.filter((q) => !this.p2Submissions.has(q.id)).length;
    }
    return this.passedQueue.filter((q) => !this.submissions.has(q.id)).length;
  }

  public isAllAnswered(playerId?: string): boolean {
    if (
      playerId === this.player2Id ||
      this.phase === 'P2_PLAYING' ||
      this.phase === 'P2_FINISHED' ||
      this.phase === 'P2_REVEAL'
    ) {
      return this.p2Submissions.size >= this.questions.length;
    }
    return this.submissions.size >= this.questions.length;
  }

  public isTurnFinished(): boolean {
    return (
      this.phase === 'P1_FINISHED' ||
      this.phase === 'P1_REVEAL' ||
      this.phase === 'P2_READY' ||
      this.phase === 'P2_PLAYING' ||
      this.phase === 'P2_FINISHED' ||
      this.phase === 'P2_REVEAL'
    );
  }

  public getSubmissions(playerId?: string): SubmittedAnswerRecord[] {
    const map =
      playerId === this.player2Id ||
      this.phase === 'P2_PLAYING' ||
      this.phase === 'P2_FINISHED' ||
      this.phase === 'P2_REVEAL'
        ? this.p2Submissions
        : this.submissions;
    return Array.from(map.values()).sort((a, b) => a.orderAttempted - b.orderAttempted);
  }

  public getPlayer1Submissions(): SubmittedAnswerRecord[] {
    return Array.from(this.submissions.values()).sort((a, b) => a.orderAttempted - b.orderAttempted);
  }

  public getPlayer2Submissions(): SubmittedAnswerRecord[] {
    return Array.from(this.p2Submissions.values()).sort((a, b) => a.orderAttempted - b.orderAttempted);
  }

  public getSubmissionForQuestion(
    questionId: string,
    playerNumber: 1 | 2 = 1
  ): SubmittedAnswerRecord | undefined {
    return playerNumber === 1
      ? this.submissions.get(questionId)
      : this.p2Submissions.get(questionId);
  }

  // --- Authoritative State Snapshots ---

  /**
   * Sanitized snapshot for Player 1's interactive mobile controller.
   */
  public getPlayer1Snapshot(): Player1StateSnapshot {
    const isPlaying = this.phase === 'P1_PLAYING' && this.getRemainingSeconds() > 0;
    const currentQ = this.currentQuestion;

    let questionNumber = 1;
    if (currentQ) {
      const originalIdx = this.questions.findIndex((q) => q.id === currentQ.id);
      questionNumber = originalIdx >= 0 ? originalIdx + 1 : 1;
    }

    const isRevealOrReady =
      this.phase === 'P1_REVEAL' ||
      this.phase === 'P2_READY' ||
      this.phase === 'P2_PLAYING' ||
      this.phase === 'P2_FINISHED';
    const totalScore = this.getRoundTotalScore();
    const revealSlots = isRevealOrReady ? this.getRevealSlots(true) : undefined;
    const activeRevealSlotNumber = this.getActiveRevealSlotNumber();

    return {
      phase: this.phase,
      currentQuestion: currentQ
        ? {
            id: currentQ.id,
            questionText: currentQ.questionText,
            questionNumber,
            totalQuestions: this.questions.length,
          }
        : null,
      answeredCount: this.submissions.size,
      passedCount: this.getPassedCount(this.player1Id),
      totalQuestions: this.questions.length,
      remainingSeconds: this.phase === 'P1_PLAYING' ? this.getRemainingSeconds() : 0,
      isTimerRunning: isPlaying,
      canSubmit: isPlaying && currentQ !== null,
      canPass: isPlaying && currentQ !== null,
      totalScore,
      revealSlots,
      activeRevealSlotNumber,
    };
  }

  /**
   * Sanitized isolation shield snapshot for Player 2 (US-07 Scenario 5, US-08, US-09).
   */
  public getPlayer2Snapshot(): Player2IsolationSnapshot {
    const isReveal = this.phase === 'P1_REVEAL';
    const isReady = this.phase === 'P2_READY';
    const isPlaying = this.phase === 'P2_PLAYING';
    const isFinished = this.phase === 'P2_FINISHED';
    const totalScore = this.getRoundTotalScore();
    const revealSlots =
      isReveal || isReady || isPlaying || isFinished ? this.getRevealSlots(true) : undefined;
    const activeRevealSlotNumber = this.getActiveRevealSlotNumber();

    const remaining = this.getRemainingSeconds();

    let questionNumber = 1;
    if (this.p2CurrentQuestion) {
      const originalIdx = this.questions.findIndex((q) => q.id === this.p2CurrentQuestion!.id);
      questionNumber = originalIdx >= 0 ? originalIdx + 1 : 1;
    }

    return {
      phase: this.phase,
      isOffstage: this.phase === 'P1_READY' || this.phase === 'P1_PLAYING',
      isolationMessage: isReady
        ? "Player 1's reveal is complete! Get ready for your turn"
        : isReveal
        ? "Player 1's reveal sequence in progress..."
        : isPlaying
        ? "Round 2 in progress!"
        : isFinished
        ? "Round 2 Complete! Look up at the host TV screen."
        : '🎧 Player 1 is currently playing! Look away from the host screen',
      remainingSeconds: remaining,
      isTimerRunning: isPlaying && remaining > 0,
      totalScore,
      revealSlots,
      activeRevealSlotNumber,
      // Active Speed Round Controller Properties for Player 2 (US-09)
      currentQuestion: isPlaying && this.p2CurrentQuestion
        ? {
            id: this.p2CurrentQuestion.id,
            questionText: this.p2CurrentQuestion.questionText,
            questionNumber,
            totalQuestions: this.questions.length,
          }
        : undefined,
      answeredCount: isPlaying || isFinished ? this.p2Submissions.size : undefined,
      passedCount: isPlaying || isFinished ? this.getPassedCount(this.player2Id) : undefined,
      totalQuestions: isPlaying || isFinished ? this.questions.length : undefined,
      canSubmit: isPlaying ? this.p2CurrentQuestion !== null && remaining > 0 : undefined,
      canPass: isPlaying ? this.p2CurrentQuestion !== null && remaining > 0 : undefined,
    };
  }

  /**
   * Sanitized snapshot for the TV Host screen.
   */
  public getHostSnapshot(): HostStateSnapshot {
    const isP2Turn =
      this.phase === 'P2_READY' || this.phase === 'P2_PLAYING' || this.phase === 'P2_FINISHED';

    const p1Slots = this.questions.map((q, idx) => ({
      slotNumber: idx + 1,
      isFilled: this.submissions.has(q.id),
    }));

    const p2Slots = this.questions.map((q, idx) => ({
      slotNumber: idx + 1,
      isFilled: this.p2Submissions.has(q.id),
    }));

    const slots = this.phase === 'P2_PLAYING' || this.phase === 'P2_FINISHED' ? p2Slots : p1Slots;

    let activeQuestionNumber: number | null = null;
    const activeQ = isP2Turn ? this.p2CurrentQuestion : this.currentQuestion;
    if (activeQ) {
      const idx = this.questions.findIndex((q) => q.id === activeQ.id);
      activeQuestionNumber = idx >= 0 ? idx + 1 : null;
    }

    const isRevealOrReady = this.phase === 'P1_REVEAL' || this.phase === 'P2_READY';
    const totalScore = this.getRoundTotalScore();
    const revealSlots = isRevealOrReady ? this.getRevealSlots(true) : undefined;
    const activeRevealSlotNumber = this.getActiveRevealSlotNumber();

    const isTimerRunning =
      (this.phase === 'P1_PLAYING' || this.phase === 'P2_PLAYING') && this.getRemainingSeconds() > 0;

    return {
      phase: this.phase,
      activeQuestionNumber,
      totalQuestions: this.questions.length,
      answeredCount: isP2Turn ? this.p2Submissions.size : this.submissions.size,
      remainingSeconds: this.getRemainingSeconds(),
      isTimerRunning,
      currentQuestionText: activeQ ? activeQ.questionText : null,
      slots,
      p1Slots,
      p2Slots,
      totalScore,
      p1TotalScore: totalScore,
      revealSlots,
      activeRevealSlotNumber,
    };
  }
}
