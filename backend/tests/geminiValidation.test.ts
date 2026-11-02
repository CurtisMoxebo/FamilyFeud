import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateAnswerWithGemini,
  buildValidationPrompt,
  geminiClientFactory,
} from '../src/services/geminiService';
import { config } from '../src/config/env';
import { CandidateAnswer } from '../src/utils/stringNormalizer';

describe('validateAnswerWithGemini (US-06 Tier 2 Validation)', () => {
  const mockCandidates: CandidateAnswer[] = [
    { id: 'ans-1', answerText: 'Television', points: 35, orderIndex: 1 },
    { id: 'ans-2', answerText: 'Refrigerator', points: 25, orderIndex: 2 },
    { id: 'ans-3', answerText: 'Automobile', points: 20, orderIndex: 3 },
    { id: 'ans-4', answerText: 'Microwave Oven', points: 12, orderIndex: 4 },
    { id: 'ans-5', answerText: 'Toaster', points: 8, orderIndex: 5 },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildValidationPrompt', () => {
    it('formats the survey question, indexed candidate list, and guess correctly', () => {
      const prompt = buildValidationPrompt(
        'Name something found in a home',
        ['Television', 'Refrigerator'],
        'fridge',
        'EN'
      );

      expect(prompt).toContain('Family Feud in English');
      expect(prompt).toContain('Name something found in a home');
      expect(prompt).toContain('[Index 0] "Television"');
      expect(prompt).toContain('[Index 1] "Refrigerator"');
      expect(prompt).toContain('Contestant\'s Guess: "fridge"');
    });

    it('adapts prompt language for French and Spanish', () => {
      const frPrompt = buildValidationPrompt('Nommez un meuble', ['Canapé'], 'sofa', 'FR');
      expect(frPrompt).toContain('Family Feud in French');

      const esPrompt = buildValidationPrompt('Nombra un vehículo', ['Automóvil'], 'carro', 'ES');
      expect(esPrompt).toContain('Family Feud in Spanish');
    });
  });

  describe('Gemini API Live Flow (Mocked Client)', () => {
    it('approves a typo via Gemini (Scenario 3: "refrigirater" -> "Refrigerator")', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('AIzaSyFakeTestKey123');

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              is_matched: true,
              matched_answer_index: 1,
              reasoning: 'Minor spelling error of Refrigerator',
            }),
        },
      });

      vi.spyOn(geminiClientFactory, 'createClient').mockReturnValue({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: mockGenerateContent,
        }),
      } as any);

      const result = await validateAnswerWithGemini({
        questionText: 'Name something found in a kitchen',
        candidateAnswers: mockCandidates,
        rawInput: 'refrigirater',
        language: 'EN',
      });

      expect(result.isMatched).toBe(true);
      expect(result.matchedIndex).toBe(1);
      expect(result.matchedAnswer?.id).toBe('ans-2');
      expect(result.matchedAnswer?.answerText).toBe('Refrigerator');
      expect(result.tier).toBe('TIER_2_GEMINI');
      expect(result.reasoning).toContain('Refrigerator');
    });

    it('approves a synonym via Gemini (Scenario 4: "car" -> "Automobile")', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('AIzaSyFakeTestKey123');

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              is_matched: true,
              matched_answer_index: 2,
              reasoning: 'Car is a direct synonym for Automobile',
            }),
        },
      });

      vi.spyOn(geminiClientFactory, 'createClient').mockReturnValue({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: mockGenerateContent,
        }),
      } as any);

      const result = await validateAnswerWithGemini({
        questionText: 'Name something with wheels',
        candidateAnswers: mockCandidates,
        rawInput: 'car',
        language: 'EN',
      });

      expect(result.isMatched).toBe(true);
      expect(result.matchedIndex).toBe(2);
      expect(result.matchedAnswer?.answerText).toBe('Automobile');
      expect(result.tier).toBe('TIER_2_GEMINI');
    });

    it('rejects completely unrelated guess (Scenario 5: "Submarine" for kitchen items)', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('AIzaSyFakeTestKey123');

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              is_matched: false,
              matched_answer_index: null,
              reasoning: 'Submarine is unrelated to kitchen items',
            }),
        },
      });

      vi.spyOn(geminiClientFactory, 'createClient').mockReturnValue({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: mockGenerateContent,
        }),
      } as any);

      const result = await validateAnswerWithGemini({
        questionText: 'Name something you find in a kitchen',
        candidateAnswers: mockCandidates,
        rawInput: 'Submarine',
        language: 'EN',
      });

      expect(result.isMatched).toBe(false);
      expect(result.matchedIndex).toBeNull();
      expect(result.matchedAnswer).toBeNull();
      expect(result.tier).toBe('TIER_2_GEMINI');
    });

    it('handles JSON wrapped in markdown formatting from Gemini', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('AIzaSyFakeTestKey123');

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: {
          text: () =>
            '```json\n{"is_matched": true, "matched_answer_index": 0, "reasoning": "TV matches Television"}\n```',
        },
      });

      vi.spyOn(geminiClientFactory, 'createClient').mockReturnValue({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: mockGenerateContent,
        }),
      } as any);

      const result = await validateAnswerWithGemini({
        questionText: 'Name an appliance',
        candidateAnswers: mockCandidates,
        rawInput: 'tv',
        language: 'EN',
      });

      expect(result.isMatched).toBe(true);
      expect(result.matchedIndex).toBe(0);
      expect(result.tier).toBe('TIER_2_GEMINI');
    });

    it('resets out-of-bounds matched_answer_index to null', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('AIzaSyFakeTestKey123');

      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              is_matched: true,
              matched_answer_index: 999, // Out of bounds
              reasoning: 'Invalid index test',
            }),
        },
      });

      vi.spyOn(geminiClientFactory, 'createClient').mockReturnValue({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: mockGenerateContent,
        }),
      } as any);

      const result = await validateAnswerWithGemini({
        questionText: 'Test question',
        candidateAnswers: mockCandidates,
        rawInput: 'some input',
        language: 'EN',
      });

      expect(result.matchedIndex).toBeNull();
      expect(result.matchedAnswer).toBeNull();
    });
  });

  describe('Offline Fallback Resiliency (Missing Key or Gemini API Errors)', () => {
    it('falls back to offline matcher when GEMINI_API_KEY is not configured', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('');

      const result = await validateAnswerWithGemini({
        questionText: 'Name something found in a kitchen',
        candidateAnswers: mockCandidates,
        rawInput: 'refrigirater', // Typo handled by Levenshtein distance
        language: 'EN',
      });

      expect(result.isMatched).toBe(true);
      expect(result.matchedIndex).toBe(1);
      expect(result.matchedAnswer?.answerText).toBe('Refrigerator');
      expect(result.tier).toBe('TIER_2_FALLBACK');
    });

    it('falls back to offline matcher when Gemini API throws an error (e.g. rate limit 429)', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('AIzaSyFakeTestKey123');

      vi.spyOn(geminiClientFactory, 'createClient').mockReturnValue({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: vi.fn().mockRejectedValue(new Error('Rate limit exceeded (429)')),
        }),
      } as any);

      const result = await validateAnswerWithGemini({
        questionText: 'Name something with wheels',
        candidateAnswers: mockCandidates,
        rawInput: 'car', // Synonym handled by offline synonym bank
        language: 'EN',
      });

      expect(result.isMatched).toBe(true);
      expect(result.matchedIndex).toBe(2);
      expect(result.matchedAnswer?.answerText).toBe('Automobile');
      expect(result.tier).toBe('TIER_2_FALLBACK');
    });

    it('rejects unrelated guesses in offline fallback mode', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('');

      const result = await validateAnswerWithGemini({
        questionText: 'Name something you find in a kitchen',
        candidateAnswers: mockCandidates,
        rawInput: 'Submarine',
        language: 'EN',
      });

      expect(result.isMatched).toBe(false);
      expect(result.matchedIndex).toBeNull();
      expect(result.matchedAnswer).toBeNull();
      expect(result.tier).toBe('TIER_2_FALLBACK');
    });

    it('returns isMatched=false immediately for empty input or empty candidate list', async () => {
      const emptyInputResult = await validateAnswerWithGemini({
        questionText: 'Test',
        candidateAnswers: mockCandidates,
        rawInput: '   ',
      });
      expect(emptyInputResult.isMatched).toBe(false);

      const emptyCandidatesResult = await validateAnswerWithGemini({
        questionText: 'Test',
        candidateAnswers: [],
        rawInput: 'Television',
      });
      expect(emptyCandidatesResult.isMatched).toBe(false);
    });
  });
});

