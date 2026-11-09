import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as geminiService from '../src/services/geminiService';
import * as questionService from '../src/services/questionService';
import { getFallbackQuestions } from '../src/data/fallbackQuestions';
import { config } from '../src/config/env';
import { prisma } from '../src/services/db';

describe('US-27 Step 1: AI Question Deduplication & Negative Exclusion History', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* -------------------------------------------------------------
   * 1. buildPrompt: Negative Constraints Formatting (Scenario 1 & 4)
   * ------------------------------------------------------------- */
  describe('buildPrompt Negative Exclusion Formatting', () => {
    it('appends negative constraints section when excludedQuestions array is provided', () => {
      const excluded = [
        'Name a food people eat for breakfast',
        'Name an animal you would see at a zoo',
      ];
      const prompt = geminiService.buildPrompt('FAST_MONEY', 'EN', 5, 1, excluded);

      expect(prompt).toContain('Negative Constraints (Do NOT Repeat):');
      expect(prompt).toContain('Do NOT generate, repeat, or closely rephrase any of the following previously asked survey questions:');
      expect(prompt).toContain('- "Name a food people eat for breakfast"');
      expect(prompt).toContain('- "Name an animal you would see at a zoo"');
      expect(prompt).toContain('Ensure all generated questions are completely fresh, distinct, and novel.');
    });

    it('omits negative constraints section when excludedQuestions is empty', () => {
      const prompt = geminiService.buildPrompt('FAST_MONEY', 'EN', 5, 1, []);
      expect(prompt).not.toContain('Negative Constraints');
      expect(prompt).not.toContain('Do NOT generate, repeat, or closely rephrase');
    });

    it('cleans whitespace and filters empty items from excludedQuestions list', () => {
      const excluded = ['   ', 'Name something hot', ''];
      const prompt = geminiService.buildPrompt('MAIN_GAME', 'FR', 1, 1, excluded);

      expect(prompt).toContain('Negative Constraints (Do NOT Repeat):');
      expect(prompt).toContain('- "Name something hot"');
      expect(prompt).not.toContain('- ""');
    });
  });

  /* -------------------------------------------------------------
   * 2. generateQuestions: Exclusions Forwarding & Fallback Filtering (Scenario 1 & 5)
   * ------------------------------------------------------------- */
  describe('generateQuestions Exclusion Integration', () => {
    it('passes excludedQuestions into the prompt when calling the Gemini model', async () => {
      const excluded = ['Name a place where people whisper'];
      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify([
              {
                questionText: 'Name something you find in the attic',
                answers: [
                  { text: 'Old Photos', points: 60 },
                  { text: 'Dust', points: 40 },
                ],
              },
            ]),
        },
      });

      const mockModel = { generateContent: mockGenerateContent };
      const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) };
      vi.spyOn(geminiService.geminiClientFactory, 'createClient').mockReturnValue(mockClient as any);

      const originalKey = config.geminiApiKey;
      config.geminiApiKey = 'test-fake-key-for-prompt-inspection';

      try {
        await geminiService.generateQuestions({
          gameMode: 'MAIN_GAME',
          language: 'EN',
          count: 1,
          roundNumber: 2,
          excludedQuestions: excluded,
        });

        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
        const promptSent = mockGenerateContent.mock.calls[0][0];
        expect(promptSent).toContain('Negative Constraints (Do NOT Repeat):');
        expect(promptSent).toContain('- "Name a place where people whisper"');
      } finally {
        config.geminiApiKey = originalKey;
      }
    });

    it('satisfies Scenario 5: selects an alternative non-overlapping fallback set when offline', () => {
      // In fallbackQuestions.ts EN set 0 includes 'Name a month where people spend the most money'
      const excluded = ['Name a month where people spend the most money'];
      const questions = getFallbackQuestions('FAST_MONEY', 'EN', 1, excluded);

      expect(questions).toHaveLength(5);
      const questionTexts = questions.map((q) => q.questionText);
      expect(questionTexts).not.toContain('Name a month where people spend the most money');
      // Set 1 includes beach items
      expect(questionTexts).toContain('Name something you bring to the beach');
    });

    it('satisfies Scenario 5: filters out excluded Main Game fallback questions', () => {
      // Main Game EN Q1 is "Name a reason why someone might be late for work"
      const excluded = ['Name a reason why someone might be late for work'];
      const questions = getFallbackQuestions('MAIN_GAME', 'EN', 1, excluded);

      expect(questions).toHaveLength(1);
      expect(questions[0].questionText).not.toBe('Name a reason why someone might be late for work');
    });
  });

  /* -------------------------------------------------------------
   * 3. getExcludedQuestionTexts: Database Querying & Scoping (Scenario 1, 4 & 6)
   * ------------------------------------------------------------- */
  describe('getExcludedQuestionTexts Database Retrieval', () => {
    it('retrieves questions played in the same room across games and recent global questions in that language', async () => {
      const roomCode = `DED1-${Math.floor(1000 + Math.random() * 9000)}`;
      const testRoom = await prisma.room.create({
        data: {
          roomCode,
          roomName: 'Deduplication Test Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
        },
      });

      // Game 1 in this room with Round 1 question
      const game1 = await prisma.game.create({
        data: {
          roomId: testRoom.id,
          mode: 'MAIN_GAME',
          currentRound: 1,
        },
      });
      await prisma.question.create({
        data: {
          gameId: game1.id,
          roundNumber: 1,
          orderIndex: 1,
          language: 'EN',
          questionText: 'Room Game 1 Question',
          answers: {
            create: [{ rankOrder: 1, answerText: 'Top Answer', points: 100 }],
          },
        },
      });

      // Game 2 (e.g. rematch) in the same room
      const game2 = await prisma.game.create({
        data: {
          roomId: testRoom.id,
          mode: 'MAIN_GAME',
          currentRound: 1,
        },
      });

      // Another room with a recent question in EN
      const otherRoom = await prisma.room.create({
        data: {
          roomCode: `DED2-${Math.floor(1000 + Math.random() * 9000)}`,
          roomName: 'Other Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
        },
      });
      const otherGame = await prisma.game.create({
        data: {
          roomId: otherRoom.id,
          mode: 'MAIN_GAME',
          currentRound: 1,
        },
      });
      await prisma.question.create({
        data: {
          gameId: otherGame.id,
          roundNumber: 1,
          orderIndex: 1,
          language: 'EN',
          questionText: 'Global External Question EN',
          answers: {
            create: [{ rankOrder: 1, answerText: 'Top Answer', points: 100 }],
          },
        },
      });

      // Another room with a recent question in FR (should be excluded due to language partitioning)
      const frenchRoom = await prisma.room.create({
        data: {
          roomCode: `DED3-${Math.floor(1000 + Math.random() * 9000)}`,
          roomName: 'French Room',
          language: 'FR',
          gameMode: 'MAIN_GAME',
        },
      });
      const frenchGame = await prisma.game.create({
        data: {
          roomId: frenchRoom.id,
          mode: 'MAIN_GAME',
          currentRound: 1,
        },
      });
      await prisma.question.create({
        data: {
          gameId: frenchGame.id,
          roundNumber: 1,
          orderIndex: 1,
          language: 'FR',
          questionText: 'Question en Français Exclusive',
          answers: {
            create: [{ rankOrder: 1, answerText: 'Réponse', points: 100 }],
          },
        },
      });

      try {
        const exclusions = await questionService.getExcludedQuestionTexts(game2.id, 'EN', 50);

        // Contains question from Game 1 in the same room
        expect(exclusions).toContain('Room Game 1 Question');
        // Contains global EN question
        expect(exclusions).toContain('Global External Question EN');
        // Does NOT contain French question (language partition satisfied)
        expect(exclusions).not.toContain('Question en Français Exclusive');
      } finally {
        // Cleanup test rooms
        await prisma.playerResponse.deleteMany({
          where: { player: { roomId: { in: [testRoom.id, otherRoom.id, frenchRoom.id] } } },
        });
        await prisma.answer.deleteMany({
          where: { question: { game: { roomId: { in: [testRoom.id, otherRoom.id, frenchRoom.id] } } } },
        });
        await prisma.question.deleteMany({
          where: { game: { roomId: { in: [testRoom.id, otherRoom.id, frenchRoom.id] } } },
        });
        await prisma.game.deleteMany({
          where: { roomId: { in: [testRoom.id, otherRoom.id, frenchRoom.id] } },
        });
        await prisma.player.deleteMany({
          where: { roomId: { in: [testRoom.id, otherRoom.id, frenchRoom.id] } },
        });
        await prisma.room.deleteMany({
          where: { id: { in: [testRoom.id, otherRoom.id, frenchRoom.id] } },
        });
      }
    });

    it('gracefully returns empty array if database query throws an error', async () => {
      const brokenPrisma = {
        game: {
          findUnique: vi.fn().mockRejectedValue(new Error('DB Connection Timeout')),
        },
      };

      const result = await questionService.getExcludedQuestionTexts(
        'mock-game-id',
        'EN',
        50,
        brokenPrisma as any
      );
      expect(result).toEqual([]);
    });
  });

  /* -------------------------------------------------------------
   * 4. generateAndSaveGameQuestions: Automatic Exclusion Pass-Through
   * ------------------------------------------------------------- */
  describe('generateAndSaveGameQuestions Automatic Exclusion Integration', () => {
    it('automatically retrieves exclusions from database and forwards them to generateQuestions', async () => {
      const roomCode = `DED4-${Math.floor(1000 + Math.random() * 9000)}`;
      const testRoom = await prisma.room.create({
        data: {
          roomCode,
          roomName: 'Orchestrator Test Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
        },
      });

      const testGame = await prisma.game.create({
        data: {
          roomId: testRoom.id,
          mode: 'MAIN_GAME',
          currentRound: 1,
        },
      });

      // Insert pre-existing question into the game
      await prisma.question.create({
        data: {
          gameId: testGame.id,
          roundNumber: 1,
          orderIndex: 1,
          language: 'EN',
          questionText: 'Pre-existing Historical Question',
          answers: {
            create: [{ rankOrder: 1, answerText: 'Top Answer', points: 100 }],
          },
        },
      });

      const spyGenerateQuestions = vi
        .spyOn(geminiService, 'generateQuestions')
        .mockResolvedValue([
          {
            questionText: 'Novel Generated Survey Question',
            answers: [
              { text: 'Answer 1', points: 60 },
              { text: 'Answer 2', points: 40 },
            ],
          },
        ]);

      try {
        const result = await questionService.generateAndSaveGameQuestions({
          gameId: testGame.id,
          gameMode: 'MAIN_GAME',
          language: 'EN',
          roundNumber: 2,
        });

        expect(spyGenerateQuestions).toHaveBeenCalledWith(
          expect.objectContaining({
            excludedQuestions: expect.arrayContaining(['Pre-existing Historical Question']),
          })
        );
        expect(result).toHaveLength(1);
        expect(result[0].questionText).toBe('Novel Generated Survey Question');
        expect(result[0].answers).toHaveLength(2);
      } finally {
        await prisma.answer.deleteMany({
          where: { question: { gameId: testGame.id } },
        });
        await prisma.question.deleteMany({
          where: { gameId: testGame.id },
        });
        await prisma.game.deleteMany({
          where: { id: testGame.id },
        });
        await prisma.room.deleteMany({
          where: { id: testRoom.id },
        });
      }
    });
  });
});
