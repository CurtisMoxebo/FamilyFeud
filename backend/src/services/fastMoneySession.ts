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

export interface FastMoneySessionOptions {
  gameId: string;
  roomCode: string;
  player1Id: string;
  player2Id: string;
  questions: FastMoneyQuestionItem[];
  timerDurationSeconds?: number;
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
}

export interface Player2IsolationSnapshot {
  phase: FastMoneyPhase;
  isOffstage: boolean;
  isolationMessage: string;
  remainingSeconds: number;
  isTimerRunning: boolean;
}

export interface HostStateSnapshot {
  phase: FastMoneyPhase;
  activeQuestionNumber: number | null;
  totalQuestions: number;
  answeredCount: number;
  remainingSeconds: number;
  isTimerRunning: boolean;
  currentQuestionText: string | null;
  // Raw answers and points are strictly omitted to keep Host TV board concealed until reveal phase
  slots: {
    slotNumber: number;
    isFilled: boolean;
  }[];
}

/**
 * FastMoneySession: Manages question queues, pass recycling, and server clock
 * for Fast Money rounds (US-07).
 */
export class FastMoneySession {
  public readonly gameId: string;
  public readonly roomCode: string;
  public readonly player1Id: string;
  public readonly player2Id: string;
  public readonly timerDurationSeconds: number;

  private readonly questions: FastMoneyQuestionItem[];
  private unattemptedQueue: FastMoneyQuestionItem[];
  private passedQueue: FastMoneyQuestionItem[];
  private currentQuestion: FastMoneyQuestionItem | null = null;

  private submissions: Map<string, SubmittedAnswerRecord> = new Map();
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

    // Clone and sort questions by orderIndex
    this.questions = [...options.questions].sort((a, b) => a.orderIndex - b.orderIndex);
    this.unattemptedQueue = [...this.questions];
    this.passedQueue = [];
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

    if (this.phase === 'P1_FINISHED' || this.phase === 'P1_REVEAL') {
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
    return this.phase === 'P1_FINISHED' || this.phase === 'P1_REVEAL';
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
    };
  }

  /**
   * Sanitized isolation shield snapshot for Player 2 (Scenario 5 Anti-Cheating).
   * Strictly omits question text, input fields, and contestant answers.
   */
  public getPlayer2Snapshot(): Player2IsolationSnapshot {
    return {
      phase: this.phase,
      isOffstage: this.phase === 'P1_READY' || this.phase === 'P1_PLAYING',
      isolationMessage: '🎧 Player 1 is currently playing! Look away from the host screen',
      remainingSeconds: this.getRemainingSeconds(),
      isTimerRunning: this.phase === 'P1_PLAYING',
    };
  }

  /**
   * Sanitized snapshot for the TV Host screen.
   * Shows 5 concealed answer slots without revealing contestant answers or point values.
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

    return {
      phase: this.phase,
      activeQuestionNumber,
      totalQuestions: this.questions.length,
      answeredCount: this.getAnsweredCount(),
      remainingSeconds: this.getRemainingSeconds(),
      isTimerRunning: this.phase === 'P1_PLAYING' && this.getRemainingSeconds() > 0,
      currentQuestionText: this.currentQuestion ? this.currentQuestion.questionText : null,
      slots,
    };
  }
}

