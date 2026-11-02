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

export interface FastMoneySessionOptions {
  gameId: string;
  roomCode: string;
  player1Id: string;
  player2Id: string;
  questions: FastMoneyQuestionItem[];
  timerDurationSeconds?: number;
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
}

export interface HostStateSnapshot {
  phase: FastMoneyPhase;
  activeQuestionNumber: number | null;
  totalQuestions: number;
  answeredCount: number;
  remainingSeconds: number;
  isTimerRunning: boolean;
  currentQuestionText: string | null;
  // Concealed slot indicators during speed round
  slots: {
    slotNumber: number;
    isFilled: boolean;
  }[];
  totalScore?: number;
  revealSlots?: FastMoneyRevealSlot[];
  activeRevealSlotNumber?: number | null;
}

/**
 * FastMoneySession: Manages question queues, pass recycling, server clock,
 * and authoritative reveal sequencing for Fast Money rounds (US-07 & US-08).
 */
export class FastMoneySession {
  public readonly gameId: string;
  public readonly roomCode: string;
  public readonly player1Id: string;
  public readonly player2Id: string;
  public readonly timerDurationSeconds: number;
  public readonly language: SupportedLanguage;

  private readonly questions: FastMoneyQuestionItem[];
  private unattemptedQueue: FastMoneyQuestionItem[];
  private passedQueue: FastMoneyQuestionItem[];
  private currentQuestion: FastMoneyQuestionItem | null = null;

  private submissions: Map<string, SubmittedAnswerRecord> = new Map();
  private evaluations: Map<string, { pointsAwarded: number; isMatched: boolean }> = new Map();
  private revealStates: Map<number, { isAnswerRevealed: boolean; isPointsRevealed: boolean }> =
    new Map();

  private phase: FastMoneyPhase = 'P1_READY';

  private timerStartedAt: number | null = null;
  private timerEndsAt: number | null = null;
  private attemptCounter = 0;

  constructor(options: FastMoneySessionOptions) {
    if (!options.questions || options.questions.length === 0) {
      throw new Error('FastMoneySession requires at least 1 survey question');
    }

    this.gameId = options.gameId;
    this.roomCode = options.roomCode;
    this.player1Id = options.player1Id;
    this.player2Id = options.player2Id;
    this.timerDurationSeconds = options.timerDurationSeconds ?? 60;
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

  /**
   * Submits an answer for the active question.
   * Advances the queue immediately with zero latency.
   */
  public submitAnswer(
    playerId: string,
    questionId: string,
    rawAnswer: string
  ): SubmittedAnswerRecord {
    this.assertTurnActive(playerId);

    if (!this.currentQuestion || this.currentQuestion.id !== questionId) {
      throw new Error('Submitted questionId does not match current active question');
    }

    const trimmedAnswer = rawAnswer.trim();
    if (!trimmedAnswer) {
      throw new Error('Cannot submit an empty answer');
    }

    this.attemptCounter += 1;
    const remainingSeconds = this.getRemainingSeconds();

    const record: SubmittedAnswerRecord = {
      questionId: this.currentQuestion.id,
      questionText: this.currentQuestion.questionText,
      rawAnswer: trimmedAnswer,
      submittedAt: Date.now(),
      timeRemainingSeconds: remainingSeconds,
      orderAttempted: this.attemptCounter,
    };

    this.submissions.set(this.currentQuestion.id, record);

    // Seed evaluation if candidate answers contain exact match
    if (this.currentQuestion.answers && this.currentQuestion.answers.length > 0) {
      const norm = trimmedAnswer.toLowerCase().trim();
      const matched = this.currentQuestion.answers.find(
        (a) => a.answerText.toLowerCase().trim() === norm
      );
      if (matched) {
        this.recordEvaluation(this.currentQuestion.id, matched.points, true);
      }
    }

    // Remove from passed queue if it was previously passed
    this.passedQueue = this.passedQueue.filter((q) => q.id !== questionId);

    // Advance queue or finish if all questions answered
    this.advanceQueue();

    return record;
  }

  /**
   * Passes the active question. Moves question to the passed queue
   * and advances to the next question.
   */
  public passQuestion(playerId: string, questionId: string): FastMoneyQuestionItem | null {
    this.assertTurnActive(playerId);

    if (!this.currentQuestion || this.currentQuestion.id !== questionId) {
      throw new Error('Passed questionId does not match current active question');
    }

    const passedItem = this.currentQuestion;

    // If passed question is already in passedQueue, don't duplicate, just keep cycling
    if (!this.passedQueue.some((q) => q.id === passedItem.id)) {
      this.passedQueue.push(passedItem);
    } else {
      // Move to back of passed queue
      this.passedQueue = this.passedQueue.filter((q) => q.id !== passedItem.id);
      this.passedQueue.push(passedItem);
    }

    // Advance queue to next question
    this.advanceQueue();

    return this.currentQuestion;
  }

  /**
   * Terminates turn automatically when timer reaches 0 or all questions answered.
   */
  public expireTimer(): void {
    if (this.phase === 'P1_PLAYING') {
      this.phase = 'P1_FINISHED';
      this.currentQuestion = null;
    }
  }

  /**
   * Internal queue progression logic:
   * 1. Try next unattempted question.
   * 2. If unattempted is empty, cycle through passed queue.
   * 3. If all 5 questions answered or passed queue empty, finish turn.
   */
  private advanceQueue(): void {
    if (this.submissions.size >= this.questions.length) {
      this.phase = 'P1_FINISHED';
      this.currentQuestion = null;
      return;
    }

    // 1. Check if unattempted questions remain
    if (this.unattemptedQueue.length > 0) {
      this.currentQuestion = this.unattemptedQueue.shift() ?? null;
      return;
    }

    // 2. Loop through remaining passed questions (excluding answered)
    const remainingPassed = this.passedQueue.filter((q) => !this.submissions.has(q.id));
    if (remainingPassed.length > 0) {
      // Pick next passed question and recycle to back
      const nextPassed = remainingPassed.shift()!;
      this.passedQueue = [...remainingPassed, nextPassed];
      this.currentQuestion = nextPassed;
      return;
    }

    // 3. No remaining questions to answer
    this.phase = 'P1_FINISHED';
    this.currentQuestion = null;
  }

  private assertTurnActive(playerId: string): void {
    if (playerId !== this.player1Id) {
      throw new Error(`Unauthorized player: ${playerId}`);
    }

    if (this.phase !== 'P1_PLAYING') {
      throw new Error(`Turn is not currently active (current phase: ${this.phase})`);
    }

    if (this.getRemainingSeconds() <= 0) {
      this.expireTimer();
      throw new Error('Time expired for Player 1 turn');
    }
  }

  // --- Evaluation Records (US-06 & US-08) ---

  /**
   * Records or updates the evaluated score for a given survey question.
   */
  public recordEvaluation(questionId: string, pointsAwarded: number, isMatched: boolean): void {
    this.evaluations.set(questionId, {
      pointsAwarded: Math.max(0, pointsAwarded),
      isMatched,
    });
  }

  public getEvaluation(
    questionId: string
  ): { pointsAwarded: number; isMatched: boolean } | undefined {
    return this.evaluations.get(questionId);
  }

  // --- Authoritative Reveal Sequence (US-08) ---

  /**
   * Transitions session into the P1_REVEAL phase.
   */
  public startRevealPhase(): void {
    this.phase = 'P1_REVEAL';
    this.currentQuestion = null;
  }

  /**
   * Scenario 1: Reveal Answer Text on Slot N.
   * Flips open the contestant's submitted answer text. Points remain concealed.
   */
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

    // Enforce sequential pacing: previous slot points must be revealed before advancing
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

  /**
   * Scenario 2: Reveal Point Value on Slot N.
   * Flips open the point box, adds points to total, and checks completion.
   */
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

    // Check if all 5 slots are now fully revealed; if so, transition to P2_READY (Scenario 4)
    if (this.isAllRevealed()) {
      this.phase = 'P2_READY';
    }

    return this.getRevealSlot(slotNumber);
  }

  /**
   * Retrieves the reveal state for a specific slot number (1-based).
   * If sanitized=true, hides answer and points if their respective reveal flags are false.
   */
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

  /**
   * Returns array of all 5 reveal slots.
   */
  public getRevealSlots(sanitized: boolean = false): FastMoneyRevealSlot[] {
    return this.questions.map((_, idx) => this.getRevealSlot(idx + 1, sanitized));
  }

  /**
   * Computes the cumulative round total score.
   * Only sums points for slots whose point values have been revealed.
   */
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

  /**
   * Checks if all slots have both answer and points revealed.
   */
  public isAllRevealed(): boolean {
    return this.questions.every((_, idx) => {
      const state = this.revealStates.get(idx + 1);
      return state?.isAnswerRevealed && state?.isPointsRevealed;
    });
  }

  /**
   * Returns the 1-based number of the slot currently being revealed,
   * or null if not in P1_REVEAL or all are revealed.
   */
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
    return this.currentQuestion;
  }

  public getRemainingSeconds(): number {
    if (!this.timerEndsAt || this.phase === 'P1_READY') {
      return this.timerDurationSeconds;
    }

    if (
      this.phase === 'P1_FINISHED' ||
      this.phase === 'P1_REVEAL' ||
      this.phase === 'P2_READY' ||
      this.phase === 'P2_PLAYING' ||
      this.phase === 'P2_FINISHED' ||
      this.phase === 'P2_REVEAL'
    ) {
      return 0;
    }

    const remainingMs = this.timerEndsAt - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  public getAnsweredCount(): number {
    return this.submissions.size;
  }

  public getPassedCount(): number {
    return this.passedQueue.filter((q) => !this.submissions.has(q.id)).length;
  }

  public isAllAnswered(): boolean {
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

  public getSubmissions(): SubmittedAnswerRecord[] {
    return Array.from(this.submissions.values()).sort(
      (a, b) => a.orderAttempted - b.orderAttempted
    );
  }

  public getSubmissionForQuestion(questionId: string): SubmittedAnswerRecord | undefined {
    return this.submissions.get(questionId);
  }

  // --- Authoritative State Snapshots ---

  /**
   * Sanitized snapshot for Player 1's interactive mobile controller.
   */
  public getPlayer1Snapshot(): Player1StateSnapshot {
    const currentQ = this.currentQuestion;
    const remaining = this.getRemainingSeconds();
    const isPlaying = this.phase === 'P1_PLAYING' && remaining > 0;

    // Calculate human-friendly question index (1..5)
    let questionNumber = 1;
    if (currentQ) {
      const originalIdx = this.questions.findIndex((q) => q.id === currentQ.id);
      questionNumber = originalIdx >= 0 ? originalIdx + 1 : 1;
    }

    const isRevealOrReady = this.phase === 'P1_REVEAL' || this.phase === 'P2_READY';
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
      answeredCount: this.getAnsweredCount(),
      passedCount: this.getPassedCount(),
      totalQuestions: this.questions.length,
      remainingSeconds: remaining,
      isTimerRunning: isPlaying,
      canSubmit: isPlaying && currentQ !== null,
      canPass: isPlaying && currentQ !== null,
      totalScore,
      revealSlots,
      activeRevealSlotNumber,
    };
  }

  /**
   * Sanitized isolation shield snapshot for Player 2 (Scenario 5 Anti-Cheating).
   * Strictly omits question text, input fields, and contestant answers until reveal phase.
   */
  public getPlayer2Snapshot(): Player2IsolationSnapshot {
    const isReveal = this.phase === 'P1_REVEAL';
    const isReady = this.phase === 'P2_READY';
    const totalScore = this.getRoundTotalScore();
    const revealSlots = isReveal || isReady ? this.getRevealSlots(true) : undefined;
    const activeRevealSlotNumber = this.getActiveRevealSlotNumber();

    return {
      phase: this.phase,
      isOffstage: this.phase === 'P1_READY' || this.phase === 'P1_PLAYING',
      isolationMessage: isReady
        ? "Player 1's reveal is complete! Get ready for your turn"
        : isReveal
        ? "Player 1's reveal sequence in progress..."
        : '🎧 Player 1 is currently playing! Look away from the host screen',
      remainingSeconds: this.getRemainingSeconds(),
      isTimerRunning: this.phase === 'P1_PLAYING',
      totalScore,
      revealSlots,
      activeRevealSlotNumber,
    };
  }

  /**
   * Sanitized snapshot for the TV Host screen.
   * Shows 5 concealed answer slots during playing, and controlled reveal states during P1_REVEAL.
   */
  public getHostSnapshot(): HostStateSnapshot {
    const slots = this.questions.map((q, idx) => ({
      slotNumber: idx + 1,
      isFilled: this.submissions.has(q.id),
    }));

    let activeQuestionNumber: number | null = null;
    if (this.currentQuestion) {
      const idx = this.questions.findIndex((q) => q.id === this.currentQuestion!.id);
      activeQuestionNumber = idx >= 0 ? idx + 1 : null;
    }

    const isRevealOrReady = this.phase === 'P1_REVEAL' || this.phase === 'P2_READY';
    const totalScore = this.getRoundTotalScore();
    const revealSlots = isRevealOrReady ? this.getRevealSlots(true) : undefined;
    const activeRevealSlotNumber = this.getActiveRevealSlotNumber();

    return {
      phase: this.phase,
      activeQuestionNumber,
      totalQuestions: this.questions.length,
      answeredCount: this.getAnsweredCount(),
      remainingSeconds: this.getRemainingSeconds(),
      isTimerRunning: this.phase === 'P1_PLAYING' && this.getRemainingSeconds() > 0,
      currentQuestionText: this.currentQuestion ? this.currentQuestion.questionText : null,
      slots,
      totalScore,
      revealSlots,
      activeRevealSlotNumber,
    };
  }
}
