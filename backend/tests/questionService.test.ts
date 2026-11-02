import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../src/services/db';
import * as questionService from '../src/services/questionService';
import * as geminiService from '../src/services/geminiService';

describe('Backend Integration Suite: Question Persistence Service (US-05 Step 3)', () => {
  let fastMoneyRoomId: string;
  let fastMoneyGameId: string;
  let mainGameRoomId: string;
  let mainGameGameId: string;

  beforeAll(async () => {
    // Clean up previous runs if any
    await prisma.room.deleteMany({
      where: { roomCode: { in: ['FEUD-QS01', 'FEUD-QS02'] } },
    });

    // Create test rooms and games
    const fmRoom = await prisma.room.create({
      data: {
        roomCode: 'FEUD-QS01',
        roomName: 'TEST-QS-FastMoney',
        language: 'FR',
        gameMode: 'FAST_MONEY',
        status: 'LOBBY',
      },
    });
    fastMoneyRoomId = fmRoom.id;

    const fmGame = await prisma.game.create({
      data: {
        roomId: fmRoom.id,
        mode: 'FAST_MONEY',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });
    fastMoneyGameId = fmGame.id;

    const mgRoom = await prisma.room.create({
      data: {
        roomCode: 'FEUD-QS02',
        roomName: 'TEST-QS-MainGame',
        language: 'ES',
        gameMode: 'MAIN_GAME',
        status: 'LOBBY',
      },
    });
    mainGameRoomId = mgRoom.id;

    const mgGame = await prisma.game.create({
      data: {
        roomId: mgRoom.id,
        mode: 'MAIN_GAME',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });
    mainGameGameId = mgGame.id;
  });

  afterAll(async () => {
    // Cascade deletion cleans up games, questions, and answers
    await prisma.room.deleteMany({
      where: { roomCode: { in: ['FEUD-QS01', 'FEUD-QS02'] } },
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
    it('satisfies Scenario 1: generates and saves 5 questions for Fast Money', async () => {
      const saved = await questionService.generateAndSaveGameQuestions({
        gameId: fastMoneyGameId,
        gameMode: 'FAST_MONEY',
        language: 'FR',
      });

      expect(saved).toHaveLength(5);
      saved.forEach((q, idx) => {
        expect(q.gameId).toBe(fastMoneyGameId);
        expect(q.orderIndex).toBe(idx + 1);
        const sum = q.answers.reduce((acc, a) => acc + a.points, 0);
        expect(sum).toBe(100);
      });
    });

    it('satisfies Scenario 2: generates and saves 1 question for Main Game Round 1', async () => {
      const saved = await questionService.generateAndSaveGameQuestions({
        gameId: mainGameGameId,
        gameMode: 'MAIN_GAME',
        language: 'ES',
        roundNumber: 1,
      });

      expect(saved).toHaveLength(1);
      expect(saved[0].roundNumber).toBe(1);
      expect(saved[0].answers.length).toBeGreaterThanOrEqual(4);
      expect(saved[0].answers.reduce((s, a) => s + a.points, 0)).toBe(100);
    });
  });

  /* -------------------------------------------------------------
   * 3. Query & Reveal Helpers
   * ------------------------------------------------------------- */
  describe('query and answer reveal helpers', () => {
    it('retrieves all questions by gameId in correct order', async () => {
      const questions = await questionService.getQuestionsByGameId(fastMoneyGameId);
      expect(questions.length).toBeGreaterThanOrEqual(5);
      expect(questions[0].orderIndex).toBeLessThanOrEqual(questions[1].orderIndex);
    });

    it('retrieves specific question by round and orderIndex', async () => {
      const question = await questionService.getQuestionByRound(mainGameGameId, 1, 1);
      expect(question).not.toBeNull();
      expect(question?.roundNumber).toBe(1);
      expect(question?.orderIndex).toBe(1);

      const nonExistent = await questionService.getQuestionByRound(mainGameGameId, 99, 99);
      expect(nonExistent).toBeNull();
    });

    it('reveals answer and updates database record', async () => {
      const question = await questionService.getQuestionByRound(mainGameGameId, 1, 1);
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

