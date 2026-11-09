import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as geminiService from '../src/services/geminiService';
import { config } from '../src/config/env';
import { logger } from '../src/utils/logger';

describe('Backend Regression Suite: Gemini AI Question Generation Service (US-05 Step 2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* -------------------------------------------------------------
   * 1. Normalization Logic (Scenario 3)
   * ------------------------------------------------------------- */
  describe('normalizeQuestionAnswers', () => {
    it('preserves question when points already sum to exactly 100 and are sorted', () => {
      const input: geminiService.GeneratedQuestion = {
        questionText: 'Name something you drink hot',
        answers: [
          { text: 'Coffee', points: 50 },
          { text: 'Tea', points: 30 },
          { text: 'Hot Chocolate', points: 15 },
          { text: 'Soup', points: 5 },
        ],
      };

      const result = geminiService.normalizeQuestionAnswers(input);
      expect(result.answers.reduce((sum, a) => sum + a.points, 0)).toBe(100);
      expect(result.answers[0].points).toBe(50);
      expect(result.answers[0].text).toBe('Coffee');
    });

    it('satisfies Scenario 3: adjusts difference on #1 answer when sum is 99 (under-sum)', () => {
      const input: geminiService.GeneratedQuestion = {
        questionText: 'Name an animal at a zoo',
        answers: [
          { text: 'Lion', points: 38 },
          { text: 'Elephant', points: 26 },
          { text: 'Monkey', points: 18 },
          { text: 'Giraffe', points: 11 },
          { text: 'Bear', points: 6 },
        ], // 38 + 26 + 18 + 11 + 6 = 99
      };

      const result = geminiService.normalizeQuestionAnswers(input);
      expect(result.answers.reduce((sum, a) => sum + a.points, 0)).toBe(100);
      // Top answer adjusted from 38 to 39
      expect(result.answers[0].text).toBe('Lion');
      expect(result.answers[0].points).toBe(39);
    });

    it('satisfies Scenario 3: adjusts difference on #1 answer when sum is 101 (over-sum)', () => {
      const input: geminiService.GeneratedQuestion = {
        questionText: 'Name a month where people spend the most money',
        answers: [
          { text: 'December', points: 56 },
          { text: 'November', points: 21 },
          { text: 'July', points: 12 },
          { text: 'August', points: 7 },
          { text: 'January', points: 5 },
        ], // 56 + 21 + 12 + 7 + 5 = 101
      };

      const result = geminiService.normalizeQuestionAnswers(input);
      expect(result.answers.reduce((sum, a) => sum + a.points, 0)).toBe(100);
      // Top answer adjusted from 56 to 55
      expect(result.answers[0].text).toBe('December');
      expect(result.answers[0].points).toBe(55);
    });

    it('rebalances proportionally if negative adjustment would make top answer <= 0', () => {
      const input: geminiService.GeneratedQuestion = {
        questionText: 'Extreme over-sum test',
        answers: [
          { text: 'Answer A', points: 50 },
          { text: 'Answer B', points: 50 },
          { text: 'Answer C', points: 50 },
        ], // total 150 -> diff = -50 -> 50 - 50 = 0
      };

      const result = geminiService.normalizeQuestionAnswers(input);
      expect(result.answers.reduce((sum, a) => sum + a.points, 0)).toBe(100);
      result.answers.forEach((ans) => {
        expect(ans.points).toBeGreaterThan(0);
      });
    });

    it('sorts unsorted answers in descending order by point values', () => {
      const input: geminiService.GeneratedQuestion = {
        questionText: 'Name a pizza topping',
        answers: [
          { text: 'Mushrooms', points: 15 },
          { text: 'Pepperoni', points: 45 },
          { text: 'Onions', points: 10 },
          { text: 'Cheese', points: 30 },
        ],
      };

      const result = geminiService.normalizeQuestionAnswers(input);
      expect(result.answers.reduce((sum, a) => sum + a.points, 0)).toBe(100);
      expect(result.answers[0].text).toBe('Pepperoni');
      expect(result.answers[0].points).toBe(45);
      expect(result.answers[1].text).toBe('Cheese');
      expect(result.answers[2].text).toBe('Mushrooms');
      expect(result.answers[3].text).toBe('Onions');
    });

    it('throws when answers array is empty or invalid', () => {
      expect(() => {
        geminiService.normalizeQuestionAnswers({
          questionText: 'Empty question',
          answers: [],
        });
      }).toThrow(/answers array cannot be empty/i);

      expect(() => {
        geminiService.normalizeQuestionAnswers({
          questionText: 'All empty answers',
          answers: [{ text: '   ', points: 10 }],
        });
      }).toThrow(/all answers had empty text/i);
    });
  });

  /* -------------------------------------------------------------
   * 2. Prompt Builder
   * ------------------------------------------------------------- */
  describe('buildPrompt', () => {
    it('generates prompt for Fast Money mode with requested question count', () => {
      const prompt = geminiService.buildPrompt('FAST_MONEY', 'FR', 5);
      expect(prompt).toContain('French (Français)');
      expect(prompt).toContain('5 fast-paced, intuitive Family Feud survey questions');
      expect(prompt).toContain('EXACTLY 100');
      expect(prompt).toContain('Family-friendly');
    });

    it('generates prompt for Main Game round in Spanish', () => {
      const prompt = geminiService.buildPrompt('MAIN_GAME', 'ES', 1, 2);
      expect(prompt).toContain('Spanish (Español)');
      expect(prompt).toContain('Round 2');
      expect(prompt).toContain('4 and 8 ranked survey answers');
    });
  });

  /* -------------------------------------------------------------
   * 3. Question Generation Service (Scenarios 1, 2, 4)
   * ------------------------------------------------------------- */
  describe('generateQuestions', () => {
    it('satisfies Scenario 4: returns curated fallback bank when GEMINI_API_KEY is missing', async () => {
      const originalKey = config.geminiApiKey;
      config.geminiApiKey = '';

      const warnSpy = vi.spyOn(logger, 'warn');
      const questions = await geminiService.generateQuestions({
        gameMode: 'FAST_MONEY',
        language: 'FR',
        count: 5,
      });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No GEMINI_API_KEY'));
      expect(questions).toHaveLength(5);
      questions.forEach((q) => {
        expect(q.answers.reduce((s, a) => s + a.points, 0)).toBe(100);
      });

      config.geminiApiKey = originalKey;
    });

    it('satisfies Scenario 1: successfully generates 5 Fast Money questions in French via Gemini API', async () => {
      const originalKey = config.geminiApiKey;
      config.geminiApiKey = 'test-gemini-key';

      const mockApiResponse = [
        {
          questionText: "Citez un aliment qu'on mange au petit-déjeuner",
          answers: [
            { text: 'Croissant', points: 42 },
            { text: 'Pain grillé', points: 28 },
            { text: 'Céréales', points: 18 },
            { text: 'Yaourt', points: 12 },
          ],
        },
        {
          questionText: 'Citez une couleur primaire',
          answers: [
            { text: 'Bleu', points: 45 },
            { text: 'Rouge', points: 35 },
            { text: 'Jaune', points: 20 },
          ],
        },
        {
          questionText: 'Citez un animal de compagnie',
          answers: [
            { text: 'Chien', points: 52 },
            { text: 'Chat', points: 38 },
            { text: 'Poisson', points: 10 },
          ],
        },
        {
          questionText: 'Citez une saison de l’année',
          answers: [
            { text: 'Été', points: 48 },
            { text: 'Printemps', points: 28 },
            { text: 'Automne', points: 14 },
            { text: 'Hiver', points: 10 },
          ],
        },
        {
          questionText: 'Citez un moyen de transport',
          answers: [
            { text: 'Voiture', points: 46 },
            { text: 'Train', points: 27 },
            { text: 'Avion', points: 17 },
            { text: 'Vélo', points: 10 },
          ],
        },
      ];

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify(mockApiResponse),
        },
      });

      const mockModel = { generateContent: mockGenerateContent };
      const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) };

      vi.spyOn(geminiService.geminiClientFactory, 'createClient').mockReturnValue(mockClient as any);

      const questions = await geminiService.generateQuestions({
        gameMode: 'FAST_MONEY',
        language: 'FR',
        count: 5,
      });

      expect(questions).toHaveLength(5);
      expect(questions[0].questionText).toContain('petit-déjeuner');
      expect(questions[0].answers[0].text).toBe('Croissant');
      questions.forEach((q) => {
        expect(q.answers.reduce((s, a) => s + a.points, 0)).toBe(100);
      });

      config.geminiApiKey = originalKey;
    });

    it('satisfies Scenario 2: generates Main Game single-round question with points sorted descending in Spanish', async () => {
      const originalKey = config.geminiApiKey;
      config.geminiApiKey = 'test-gemini-key';

      const mockApiResponse = [
        {
          questionText: 'Mencione algo que encuentras en una cocina',
          answers: [
            { text: 'Nevera', points: 40 },
            { text: 'Sartén', points: 25 },
            { text: 'Microondas', points: 16 },
            { text: 'Cuchillo', points: 11 },
            { text: 'Platos', points: 8 },
          ],
        },
      ];

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify(mockApiResponse),
        },
      });

      const mockModel = { generateContent: mockGenerateContent };
      const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) };

      vi.spyOn(geminiService.geminiClientFactory, 'createClient').mockReturnValue(mockClient as any);

      const questions = await geminiService.generateQuestions({
        gameMode: 'MAIN_GAME',
        language: 'ES',
        count: 1,
        roundNumber: 1,
      });

      expect(questions).toHaveLength(1);
      expect(questions[0].questionText).toContain('cocina');
      expect(questions[0].answers).toHaveLength(5);
      expect(questions[0].answers[0].points).toBe(40);
      expect(questions[0].answers.reduce((s, a) => s + a.points, 0)).toBe(100);

      config.geminiApiKey = originalKey;
    });

    it('handles response wrapped in an object with questions key or single question object', async () => {
      const originalKey = config.geminiApiKey;
      config.geminiApiKey = 'test-gemini-key';

      const mockWrappedResponse = {
        questions: [
          {
            questionText: 'Name something in an office',
            answers: [
              { text: 'Desk', points: 60 },
              { text: 'Computer', points: 40 },
            ],
          },
        ],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify(mockWrappedResponse),
        },
      });

      const mockModel = { generateContent: mockGenerateContent };
      const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) };

      vi.spyOn(geminiService.geminiClientFactory, 'createClient').mockReturnValue(mockClient as any);

      const questions = await geminiService.generateQuestions({
        gameMode: 'MAIN_GAME',
        language: 'EN',
        count: 1,
      });

      expect(questions).toHaveLength(1);
      expect(questions[0].questionText).toBe('Name something in an office');

      // Also test single question object
      const mockSingleObj = {
        questionText: 'Single question format',
        answers: [
          { text: 'Top', points: 70 },
          { text: 'Bottom', points: 30 },
        ],
      };

      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify(mockSingleObj),
        },
      });

      const singleResult = await geminiService.generateQuestions({
        gameMode: 'MAIN_GAME',
        language: 'EN',
        count: 1,
      });

      expect(singleResult).toHaveLength(1);
      expect(singleResult[0].questionText).toBe('Single question format');

      config.geminiApiKey = originalKey;
    });

    it('satisfies Scenario 4: falls back to curated bank and logs error when Gemini API throws an exception', async () => {
      const originalKey = config.geminiApiKey;
      config.geminiApiKey = 'test-gemini-key';

      const errorSpy = vi.spyOn(logger, 'error');
      const mockGenerateContent = vi
        .fn()
        .mockRejectedValue(new Error('429 Too Many Requests: Rate limit exceeded'));

      const mockModel = { generateContent: mockGenerateContent };
      const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) };

      vi.spyOn(geminiService.geminiClientFactory, 'createClient').mockReturnValue(mockClient as any);

      const questions = await geminiService.generateQuestions({
        gameMode: 'FAST_MONEY',
        language: 'EN',
        count: 5,
      });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded')
      );
      // Fallback questions returned seamlessly
      expect(questions).toHaveLength(5);
      questions.forEach((q) => {
        expect(q.answers.reduce((s, a) => s + a.points, 0)).toBe(100);
      });

      config.geminiApiKey = originalKey;
    });

    it('satisfies Scenario 4: handles empty or malformed JSON from Gemini gracefully', async () => {
      const originalKey = config.geminiApiKey;
      config.geminiApiKey = 'test-gemini-key';

      const errorSpy = vi.spyOn(logger, 'error');
      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: {
          text: () => 'Invalid Non-JSON response',
        },
      });

      const mockModel = { generateContent: mockGenerateContent };
      const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) };

      vi.spyOn(geminiService.geminiClientFactory, 'createClient').mockReturnValue(mockClient as any);

      const questions = await geminiService.generateQuestions({
        gameMode: 'MAIN_GAME',
        language: 'FR',
        count: 1,
      });

      expect(errorSpy).toHaveBeenCalled();
      expect(questions).toHaveLength(1);
      expect(questions[0].answers.reduce((s, a) => s + a.points, 0)).toBe(100);

      // Also test empty text string
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => '',
        },
      });

      const emptyResult = await geminiService.generateQuestions({
        gameMode: 'MAIN_GAME',
        language: 'FR',
        count: 1,
      });
      expect(emptyResult).toHaveLength(1);

      // Also test empty array return
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => '[]',
        },
      });

      const zeroResult = await geminiService.generateQuestions({
        gameMode: 'MAIN_GAME',
        language: 'FR',
        count: 1,
      });
      expect(zeroResult).toHaveLength(1);

      config.geminiApiKey = originalKey;
    });

    it('geminiClientFactory.createClient creates a GoogleGenerativeAI instance', () => {
      const client = geminiService.geminiClientFactory.createClient('test-key');
      expect(client).toBeDefined();
      expect(typeof client.getGenerativeModel).toBe('function');
    });
  });

  /* -------------------------------------------------------------
   * 6. AI Question Deduplication & Negative Exclusion (US-27)
   * ------------------------------------------------------------- */
  describe('AI Question Deduplication & Negative Exclusion (US-27)', () => {
    describe('buildPrompt with exclusion constraints', () => {
      it('satisfies Scenario 1: omits negative constraints section when exclusion list is empty', () => {
        const prompt = geminiService.buildPrompt('FAST_MONEY', 'EN', 5, 1, []);
        expect(prompt).not.toContain('Negative Constraints (Do NOT Repeat)');
      });

      it('satisfies Scenario 1: renders negative constraints when exclusion list is provided', () => {
        const exclusions = [
          'Name something you eat for breakfast',
          'Name a common household pet',
        ];
        const prompt = geminiService.buildPrompt('FAST_MONEY', 'EN', 5, 1, exclusions);

        expect(prompt).toContain('Negative Constraints (Do NOT Repeat)');
        expect(prompt).toContain('Do NOT generate, repeat, or closely rephrase any of the following');
        expect(prompt).toContain('- "Name something you eat for breakfast"');
        expect(prompt).toContain('- "Name a common household pet"');
      });

      it('filters out empty or whitespace-only exclusion strings', () => {
        const prompt = geminiService.buildPrompt('MAIN_GAME', 'FR', 1, 1, ['', '   ', 'Nommez un animal']);
        expect(prompt).toContain('- "Nommez un animal"');
        expect(prompt).not.toContain('- ""');
      });
    });

    describe('isQuestionCollision', () => {
      it('satisfies Scenario 2: detects exact collision regardless of case, punctuation, and whitespace', () => {
        const candidate = '  Name something you bring to the beach! ';
        const target = 'name something you bring to the beach?';
        expect(geminiService.isQuestionCollision(candidate, target)).toBe(true);
      });

      it('satisfies Scenario 2: detects collision with high token overlap', () => {
        const candidate = 'Name something you pack when going to the beach';
        const target = 'Name something you bring when going to the beach';
        expect(geminiService.isQuestionCollision(candidate, target)).toBe(true);
      });

      it('satisfies Scenario 2: returns false for clearly distinct questions', () => {
        const candidate = 'Name a popular winter sport';
        const target = 'Name something you put in your coffee';
        expect(geminiService.isQuestionCollision(candidate, target)).toBe(false);
      });
    });

    describe('filterAndDeduplicateQuestions', () => {
      it('satisfies Scenario 2: discards historical duplicates and intra-batch collisions', () => {
        const questions: geminiService.GeneratedQuestion[] = [
          {
            questionText: 'Name something you eat for breakfast',
            answers: [{ text: 'Eggs', points: 100 }],
          },
          {
            questionText: 'Name a musical instrument found in an orchestra',
            answers: [{ text: 'Violin', points: 100 }],
          },
          {
            questionText: 'Name a musical instrument you find in an orchestra', // duplicate of above
            answers: [{ text: 'Flute', points: 100 }],
          },
        ];

        const excluded = ['Name something you eat for breakfast'];
        const result = geminiService.filterAndDeduplicateQuestions(questions, excluded);

        expect(result).toHaveLength(1);
        expect(result[0].questionText).toBe('Name a musical instrument found in an orchestra');
      });
    });
  });
});
