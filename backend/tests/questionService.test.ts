import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../src/services/db';
import * as questionService from '../src/services/questionService';
import * as geminiService from '../src/services/geminiService';
import { config } from '../src/config/env';

describe('Backend Integration Suite: Question Persistence Service (US-05 Step 3 & Step 5)', () => {
  let fastMoneyGameId: string;
  let mainGameGameId: string;
  let scenario1GameId: string;
  let scenario2GameId: string;
  let scenario3GameId: string;
  let scenario4GameId: string;
  let queryHelperGameId: string;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeAll(async () => {
    const testRoomCodes = [
      'FEUD-QS01',
      'FEUD-QS02',
      'FEUD-QS03',
      'FEUD-QS04',
      'FEUD-QS05',
      'FEUD-QS06',
      'FEUD-QS07',
    ];
    // Clean up previous runs if any
    await prisma.room.deleteMany({
      where: { roomCode: { in: testRoomCodes } },
    });

    // 1. fastMoneyGame (for saveQuestionsForGame unit tests)
    const fmRoom = await prisma.room.create({
      data: {
        roomCode: 'FEUD-QS01',
        language: 'FR',
        gameMode: 'FAST_MONEY',
        status: 'LOBBY',
      },
    });
    const fmGame = await prisma.game.create({
      data: {
        roomId: fmRoom.id,
        mode: 'FAST_MONEY',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });
    fastMoneyGameId = fmGame.id;

    // 2. mainGameGame (for saveQuestionsForGame unit tests)
    const mgRoom = await prisma.room.create({
      data: {
        roomCode: 'FEUD-QS02',
        language: 'ES',
        gameMode: 'MAIN_GAME',
        status: 'LOBBY',
      },
    });
    const mgGame = await prisma.game.create({
      data: {
        roomId: mgRoom.id,
        mode: 'MAIN_GAME',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });
    mainGameGameId = mgGame.id;

    // 3. scenario1Game (Fast Money 5-question generation)
    const s1Room = await prisma.room.create({
      data: {
        roomCode: 'FEUD-QS03',
        language: 'FR',
        gameMode: 'FAST_MONEY',
        status: 'LOBBY',
      },
    });
    const s1Game = await prisma.game.create({
      data: {
        roomId: s1Room.id,
        mode: 'FAST_MONEY',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });
    scenario1GameId = s1Game.id;

    // 4. scenario2Game (Main Game single-round generation)
    const s2Room = await prisma.room.create({
      data: {
        roomCode: 'FEUD-QS04',
        language: 'ES',
        gameMode: 'MAIN_GAME',
        status: 'LOBBY',
      },
    });
    const s2Game = await prisma.game.create({
      data: {
        roomId: s2Room.id,
        mode: 'MAIN_GAME',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });
    scenario2GameId = s2Game.id;

    // 5. scenario3Game (Point sum normalization)
    const s3Room = await prisma.room.create({
      data: {
        roomCode: 'FEUD-QS05',
        language: 'ES',
        gameMode: 'MAIN_GAME',
        status: 'LOBBY',
      },
    });
    const s3Game = await prisma.game.create({
      data: {
        roomId: s3Room.id,
        mode: 'MAIN_GAME',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });
    scenario3GameId = s3Game.id;

    // 6. scenario4Game (AI Failure fallback)
    const s4Room = await prisma.room.create({
      data: {
        roomCode: 'FEUD-QS06',
        language: 'EN',
        gameMode: 'FAST_MONEY',
        status: 'LOBBY',
      },
    });
    const s4Game = await prisma.game.create({
      data: {
        roomId: s4Room.id,
        mode: 'FAST_MONEY',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });
    scenario4GameId = s4Game.id;

    // 7. queryHelperGame (Query and Answer Reveal Helpers)
    const qhRoom = await prisma.room.create({
      data: {
        roomCode: 'FEUD-QS07',
        language: 'EN',
        gameMode: 'FAST_MONEY',
        status: 'LOBBY',
      },
    });
    const qhGame = await prisma.game.create({
      data: {
        roomId: qhRoom.id,
        mode: 'FAST_MONEY',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });
    queryHelperGameId = qhGame.id;

    // Seed questions for query helper
    await questionService.saveQuestionsForGame({
      gameId: queryHelperGameId,
      language: 'EN',
      gameMode: 'FAST_MONEY',
      questions: [
        {
          questionText: 'Name something in your kitchen',
          answers: [
            { text: 'Fridge', points: 50 },
            { text: 'Stove', points: 30 },
            { text: 'Sink', points: 20 },
          ],
        },
        {
          questionText: 'Name something in your living room',
          answers: [
            { text: 'TV', points: 60 },
            { text: 'Couch', points: 40 },
          ],
        },
      ],
    });
  });

  afterAll(async () => {
    // Cascade deletion cleans up games, questions, and answers
    const testRoomCodes = [
      'FEUD-QS01',
      'FEUD-QS02',
      'FEUD-QS03',
      'FEUD-QS04',
      'FEUD-QS05',
      'FEUD-QS06',
      'FEUD-QS07',
    ];
    await prisma.room.deleteMany({
      where: { roomCode: { in: testRoomCodes } },
    });
  });

  /* -------------------------------------------------------------
   * 1. saveQuestionsForGame
   * ------------------------------------------------------------- */
  describe('saveQuestionsForGame', () => {
    it('satisfies Scenario 1: persists 5 Fast Money questions with answers in French', async () => {
      const mockQuestions: geminiService.GeneratedQuestion[] = [
        {
          questionText: "Citez un aliment du petit-déjeuner",
          answers: [
            { text: 'Croissant', points: 45 },
            { text: 'Pain', points: 30 },
            { text: 'Céréales', points: 15 },
            { text: 'Café', points: 10 },
          ],
        },
        {
          questionText: 'Citez une couleur',
          answers: [
            { text: 'Bleu', points: 50 },
            { text: 'Rouge', points: 30 },
            { text: 'Vert', points: 20 },
          ],
        },
      ];

      const saved = await questionService.saveQuestionsForGame({
        gameId: fastMoneyGameId,
        questions: mockQuestions,
        language: 'FR',
        gameMode: 'FAST_MONEY',
      });

      expect(saved).toHaveLength(2);
      expect(saved[0].gameId).toBe(fastMoneyGameId);
      expect(saved[0].language).toBe('FR');
      expect(saved[0].roundNumber).toBe(1);
      expect(saved[0].orderIndex).toBe(1);
      expect(saved[0].answers).toHaveLength(4);
      expect(saved[0].answers[0].rankOrder).toBe(1);
      expect(saved[0].answers[0].answerText).toBe('Croissant');
      expect(saved[0].answers[0].points).toBe(45);
      expect(saved[0].answers[0].isRevealed).toBe(false);

      expect(saved[1].orderIndex).toBe(2);
      expect(saved[1].answers).toHaveLength(3);
    });

    it('persists Main Game question for specific round in Spanish', async () => {
      const mockQuestions: geminiService.GeneratedQuestion[] = [
        {
          questionText: 'Mencione un animal doméstico',
          answers: [
            { text: 'Perro', points: 55 },
            { text: 'Gato', points: 35 },
            { text: 'Pájaro', points: 10 },
          ],
        },
      ];

      const saved = await questionService.saveQuestionsForGame({
        gameId: mainGameGameId,
        questions: mockQuestions,
        language: 'ES',
        gameMode: 'MAIN_GAME',
        startingRoundNumber: 2,
      });

      expect(saved).toHaveLength(1);
      expect(saved[0].roundNumber).toBe(2);
      expect(saved[0].language).toBe('ES');
      expect(saved[0].answers[0].text ?? saved[0].answers[0].answerText).toBe('Perro');
    });

    it('throws error when gameId or questions array is empty', async () => {
      await expect(
        questionService.saveQuestionsForGame({
          gameId: '',
          questions: [{ questionText: 'Q1', answers: [{ text: 'A', points: 100 }] }],
          language: 'EN',
        })
      ).rejects.toThrow(/gameId and at least one question are required/i);

      await expect(
        questionService.saveQuestionsForGame({
          gameId: fastMoneyGameId,
          questions: [],
          language: 'EN',
        })
      ).rejects.toThrow(/gameId and at least one question are required/i);
    });
  });

  /* -------------------------------------------------------------
   * 2. generateAndSaveGameQuestions (Orchestrator)
   * ------------------------------------------------------------- */
  describe('generateAndSaveGameQuestions', () => {
    it('satisfies Scenario 1: generates and saves 5 Fast Money questions from Gemini API in French', async () => {
      const originalKey = config.geminiApiKey;
      config.geminiApiKey = 'test-gemini-key';

      const mockApiResponse = [
        {
          question: 'Citez un aliment du petit-déjeuner',
          language: 'fr',
          answers: [
            { text: 'Croissant', points: 42 },
            { text: 'Pain', points: 28 },
            { text: 'Céréales', points: 18 },
            { text: 'Café', points: 12 },
          ],
        },
        {
          question: 'Citez une couleur primaire',
          language: 'fr',
          answers: [
            { text: 'Bleu', points: 45 },
            { text: 'Rouge', points: 35 },
            { text: 'Jaune', points: 20 },
          ],
        },
        {
          question: 'Citez un animal de compagnie',
          language: 'fr',
          answers: [
            { text: 'Chien', points: 52 },
            { text: 'Chat', points: 38 },
            { text: 'Poisson', points: 10 },
          ],
        },
        {
          question: 'Citez une saison de l’année',
          language: 'fr',
          answers: [
            { text: 'Été', points: 48 },
            { text: 'Printemps', points: 28 },
            { text: 'Automne', points: 14 },
            { text: 'Hiver', points: 10 },
          ],
        },
        {
          question: 'Citez un moyen de transport',
          language: 'fr',
          answers: [
            { text: 'Voiture', points: 46 },
            { text: 'Train', points: 27 },
            { text: 'Avion', points: 17 },
            { text: 'Vélo', points: 10 },
          ],
        },
      ];

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: { text: () => JSON.stringify(mockApiResponse) },
      });
      const mockModel = { generateContent: mockGenerateContent };
      const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) };
      vi.spyOn(geminiService.geminiClientFactory, 'createClient').mockReturnValue(mockClient as any);

      const saved = await questionService.generateAndSaveGameQuestions({
        gameId: scenario1GameId,
        gameMode: 'FAST_MONEY',
        language: 'FR',
      });

      expect(saved).toHaveLength(5);

      // Verify directly from MySQL via Prisma
      const dbQuestions = await prisma.question.findMany({
        where: { gameId: scenario1GameId },
        include: { answers: true },
        orderBy: { orderIndex: 'asc' },
      });

      expect(dbQuestions).toHaveLength(5);
      dbQuestions.forEach((q, idx) => {
        expect(q.gameId).toBe(scenario1GameId);
        expect(q.language).toBe('FR');
        expect(q.roundNumber).toBe(1);
        expect(q.orderIndex).toBe(idx + 1);
        const sum = q.answers.reduce((acc, a) => acc + a.points, 0);
        expect(sum).toBe(100);
        q.answers.forEach((ans) => {
          expect(ans.isRevealed).toBe(false);
        });
      });

      config.geminiApiKey = originalKey;
    });

    it('satisfies Scenario 2: generates and saves 1 Main Game question with ranked answers in Spanish', async () => {
      const originalKey = config.geminiApiKey;
      config.geminiApiKey = 'test-gemini-key';

      const mockApiResponse = {
        question: 'Nombre algo que la gente olvida llevar al salir de casa',
        language: 'es',
        answers: [
          { text: 'Llaves', points: 45 },
          { text: 'Teléfono', points: 30 },
          { text: 'Billetera', points: 15 },
          { text: 'Gafas de sol', points: 7 },
          { text: 'Paraguas', points: 3 },
        ],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: { text: () => JSON.stringify(mockApiResponse) },
      });
      const mockModel = { generateContent: mockGenerateContent };
      const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) };
      vi.spyOn(geminiService.geminiClientFactory, 'createClient').mockReturnValue(mockClient as any);

      const saved = await questionService.generateAndSaveGameQuestions({
        gameId: scenario2GameId,
        gameMode: 'MAIN_GAME',
        language: 'ES',
        roundNumber: 2,
      });

      expect(saved).toHaveLength(1);
      expect(saved[0].roundNumber).toBe(2);
      expect(saved[0].language).toBe('ES');

      // Verify DB persistence
      const dbQuestion = await prisma.question.findFirst({
        where: { gameId: scenario2GameId, roundNumber: 2 },
        include: { answers: { orderBy: { rankOrder: 'asc' } } },
      });

      expect(dbQuestion).not.toBeNull();
      expect(dbQuestion?.answers).toHaveLength(5);
      expect(dbQuestion?.answers[0].answerText).toBe('Llaves');
      expect(dbQuestion?.answers[0].points).toBe(45);

      // Verify points descending and sum = 100
      let lastPoints = 1000;
      for (const a of dbQuestion!.answers) {
        expect(a.points).toBeLessThanOrEqual(lastPoints);
        lastPoints = a.points;
      }
      const sum = dbQuestion!.answers.reduce((s, a) => s + a.points, 0);
      expect(sum).toBe(100);

      config.geminiApiKey = originalKey;
    });

    it('satisfies Scenario 3: normalizes 99-point rounding discrepancy on top answer and persists 100 points', async () => {
      const originalKey = config.geminiApiKey;
      config.geminiApiKey = 'test-gemini-key';

      // 38 + 26 + 18 + 11 + 6 = 99 (discrepancy: +1 needed on top answer)
      const mockApiResponse = {
        question: 'Nombre un animal que se encuentra en un zoológico',
        language: 'es',
        answers: [
          { text: 'León', points: 38 },
          { text: 'Elefante', points: 26 },
          { text: 'Mono', points: 18 },
          { text: 'Jirafa', points: 11 },
          { text: 'Oso', points: 6 },
        ],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: { text: () => JSON.stringify(mockApiResponse) },
      });
      const mockModel = { generateContent: mockGenerateContent };
      const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) };
      vi.spyOn(geminiService.geminiClientFactory, 'createClient').mockReturnValue(mockClient as any);

      const saved = await questionService.generateAndSaveGameQuestions({
        gameId: scenario3GameId,
        gameMode: 'MAIN_GAME',
        language: 'ES',
        roundNumber: 1,
      });

      expect(saved).toHaveLength(1);

      // Query database directly to confirm persisted points
      const dbAnswers = await prisma.answer.findMany({
        where: { questionId: saved[0].id },
        orderBy: { rankOrder: 'asc' },
      });

      // León should be adjusted from 38 to 39
      expect(dbAnswers[0].answerText).toBe('León');
      expect(dbAnswers[0].points).toBe(39);

      // Total persisted points strictly 100
      const totalPoints = dbAnswers.reduce((sum, a) => sum + a.points, 0);
      expect(totalPoints).toBe(100);

      config.geminiApiKey = originalKey;
    });

    it('satisfies Scenario 3: normalizes 101-point over-sum on top answer and persists 100 points', async () => {
      const originalKey = config.geminiApiKey;
      config.geminiApiKey = 'test-gemini-key';

      // 56 + 21 + 12 + 7 + 5 = 101 (discrepancy: -1 needed on top answer)
      const mockApiResponse = {
        question: 'Nombre un mes de altos gastos',
        language: 'es',
        answers: [
          { text: 'Diciembre', points: 56 },
          { text: 'Noviembre', points: 21 },
          { text: 'Julio', points: 12 },
          { text: 'Agosto', points: 7 },
          { text: 'Enero', points: 5 },
        ],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: { text: () => JSON.stringify(mockApiResponse) },
      });
      const mockModel = { generateContent: mockGenerateContent };
      const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) };
      vi.spyOn(geminiService.geminiClientFactory, 'createClient').mockReturnValue(mockClient as any);

      const saved = await questionService.generateAndSaveGameQuestions({
        gameId: scenario3GameId,
        gameMode: 'MAIN_GAME',
        language: 'ES',
        roundNumber: 2,
      });

      const dbAnswers = await prisma.answer.findMany({
        where: { questionId: saved[0].id },
        orderBy: { rankOrder: 'asc' },
      });

      // Diciembre adjusted from 56 to 55
      expect(dbAnswers[0].answerText).toBe('Diciembre');
      expect(dbAnswers[0].points).toBe(55);

      const totalPoints = dbAnswers.reduce((sum, a) => sum + a.points, 0);
      expect(totalPoints).toBe(100);

      config.geminiApiKey = originalKey;
    });

    it('satisfies Scenario 4: falls back to curated bank and persists without error when Gemini API throws 429', async () => {
      const originalKey = config.geminiApiKey;
      config.geminiApiKey = 'test-gemini-key';

      const mockGenerateContent = vi.fn().mockRejectedValue(new Error('429 Too Many Requests: Rate limit exceeded'));
      const mockModel = { generateContent: mockGenerateContent };
      const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) };
      vi.spyOn(geminiService.geminiClientFactory, 'createClient').mockReturnValue(mockClient as any);

      const saved = await questionService.generateAndSaveGameQuestions({
        gameId: scenario4GameId,
        gameMode: 'FAST_MONEY',
        language: 'EN',
      });

      expect(saved).toHaveLength(5);
      saved.forEach((q) => {
        expect(q.gameId).toBe(scenario4GameId);
        const sum = q.answers.reduce((acc, a) => acc + a.points, 0);
        expect(sum).toBe(100);
      });

      // Verify in DB
      const dbQuestions = await prisma.question.findMany({
        where: { gameId: scenario4GameId },
      });
      expect(dbQuestions).toHaveLength(5);

      config.geminiApiKey = originalKey;
    });

    it('satisfies Scenario 4: falls back to curated bank when GEMINI_API_KEY is missing', async () => {
      const originalKey = config.geminiApiKey;
      config.geminiApiKey = '';

      const saved = await questionService.generateAndSaveGameQuestions({
        gameId: scenario4GameId,
        gameMode: 'FAST_MONEY',
        language: 'FR',
      });

      expect(saved).toHaveLength(5);
      saved.forEach((q) => {
        const sum = q.answers.reduce((acc, a) => acc + a.points, 0);
        expect(sum).toBe(100);
      });

      config.geminiApiKey = originalKey;
    });
  });

  /* -------------------------------------------------------------
   * 3. Query & Reveal Helpers
   * ------------------------------------------------------------- */
  describe('query and answer reveal helpers', () => {
    it('retrieves all questions by gameId in correct order', async () => {
      const questions = await questionService.getQuestionsByGameId(queryHelperGameId);
      expect(questions).toHaveLength(2);
      expect(questions[0].orderIndex).toBe(1);
      expect(questions[1].orderIndex).toBe(2);
    });

    it('retrieves specific question by round and orderIndex', async () => {
      const question = await questionService.getQuestionByRound(queryHelperGameId, 1, 1);
      expect(question).not.toBeNull();
      expect(question?.roundNumber).toBe(1);
      expect(question?.orderIndex).toBe(1);

      const nonExistent = await questionService.getQuestionByRound(queryHelperGameId, 99, 99);
      expect(nonExistent).toBeNull();
    });

    it('reveals answer and updates database record', async () => {
      const question = await questionService.getQuestionByRound(queryHelperGameId, 1, 1);
      expect(question).not.toBeNull();
      const firstAnswer = question!.answers[0];
      expect(firstAnswer.isRevealed).toBe(false);

      const updated = await questionService.revealAnswer(firstAnswer.id);
      expect(updated.isRevealed).toBe(true);

      // Verify in DB
      const dbCheck = await prisma.answer.findUnique({ where: { id: firstAnswer.id } });
      expect(dbCheck?.isRevealed).toBe(true);
    });
  });
});

