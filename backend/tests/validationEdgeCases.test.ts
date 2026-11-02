import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluatePlayerAnswer } from '../src/services/answerValidationService';
import { geminiClientFactory } from '../src/services/geminiService';
import { config } from '../src/config/env';
import { CandidateAnswer } from '../src/utils/stringNormalizer';

describe('US-06 DoD Edge-Case Suite: 20+ Synonyms, Typos, and Semantic Evaluations', () => {
  const kitchenAnswers: CandidateAnswer[] = [
    { id: 'k-1', answerText: 'Refrigerator', points: 30, orderIndex: 1 },
    { id: 'k-2', answerText: 'Microwave Oven', points: 25, orderIndex: 2 },
    { id: 'k-3', answerText: 'Television', points: 20, orderIndex: 3 },
    { id: 'k-4', answerText: 'Toaster', points: 15, orderIndex: 4 },
    { id: 'k-5', answerText: 'Blender', points: 10, orderIndex: 5 },
  ];

  const livingRoomAnswers: CandidateAnswer[] = [
    { id: 'lr-1', answerText: 'Sofa', points: 35, orderIndex: 1 },
    { id: 'lr-2', answerText: 'Television', points: 30, orderIndex: 2 },
    { id: 'lr-3', answerText: 'Coffee Table', points: 20, orderIndex: 3 },
    { id: 'lr-4', answerText: 'Bookshelf', points: 15, orderIndex: 4 },
  ];

  const vehicleAnswers: CandidateAnswer[] = [
    { id: 'v-1', answerText: 'Automobile', points: 40, orderIndex: 1 },
    { id: 'v-2', answerText: 'Bicycle', points: 30, orderIndex: 2 },
    { id: 'v-3', answerText: 'Motorcycle', points: 20, orderIndex: 3 },
    { id: 'v-4', answerText: 'Airplane', points: 10, orderIndex: 4 },
  ];

  const spanishAnswers: CandidateAnswer[] = [
    { id: 'es-1', answerText: 'Automóvil', points: 35, orderIndex: 1 },
    { id: 'es-2', answerText: 'Refrigerador', points: 30, orderIndex: 2 },
    { id: 'es-3', answerText: 'Televisión', points: 20, orderIndex: 3 },
    { id: 'es-4', answerText: 'Dinero', points: 15, orderIndex: 4 },
  ];

  const frenchAnswers: CandidateAnswer[] = [
    { id: 'fr-1', answerText: 'Automobile', points: 35, orderIndex: 1 },
    { id: 'fr-2', answerText: 'Réfrigérateur', points: 30, orderIndex: 2 },
    { id: 'fr-3', answerText: 'Télévision', points: 20, orderIndex: 3 },
    { id: 'fr-4', answerText: 'Argent', points: 15, orderIndex: 4 },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Part 1: Typo & Misspelling Edge Cases (Scenario 3)', () => {
    const typoCases = [
      { input: 'refrigirater', target: 'Refrigerator', answers: kitchenAnswers, expectedIndex: 0 },
      { input: 'refridgerator', target: 'Refrigerator', answers: kitchenAnswers, expectedIndex: 0 },
      { input: 'toatr', target: 'Toaster', answers: kitchenAnswers, expectedIndex: 3 },
      { input: 'belnder', target: 'Blender', answers: kitchenAnswers, expectedIndex: 4 },
      { input: 'telivision', target: 'Television', answers: kitchenAnswers, expectedIndex: 2 },
      { input: 'soffa', target: 'Sofa', answers: livingRoomAnswers, expectedIndex: 0 },
      { input: 'autmobile', target: 'Automobile', answers: vehicleAnswers, expectedIndex: 0 },
      { input: 'bycicle', target: 'Bicycle', answers: vehicleAnswers, expectedIndex: 1 },
      { input: 'aeroplane', target: 'Airplane', answers: vehicleAnswers, expectedIndex: 3 },
      { input: 'refrigeradorr', target: 'Refrigerador', answers: spanishAnswers, expectedIndex: 1 },
      { input: 'automovill', target: 'Automóvil', answers: spanishAnswers, expectedIndex: 0 },
    ];

    typoCases.forEach(({ input, target, answers, expectedIndex }, index) => {
      it(`[Typo #${index + 1}] approves misspelling "${input}" -> "${target}"`, async () => {
        vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue(''); // Tests offline/resilient Levenshtein

        const outcome = await evaluatePlayerAnswer({
          questionText: 'Survey question',
          candidateAnswers: answers,
          rawInput: input,
          persistAudit: false,
        });

        expect(outcome.isMatched).toBe(true);
        expect(outcome.matchedIndex).toBe(expectedIndex);
        expect(outcome.matchedAnswer?.answerText).toBe(target);
        expect(outcome.pointsAwarded).toBeGreaterThan(0);
      });
    });
  });

  describe('Part 2: Synonyms & Colloquial Phrasing Edge Cases (Scenario 4)', () => {
    const synonymCases = [
      // English Synonyms
      { input: 'car', target: 'Automobile', answers: vehicleAnswers, expectedIndex: 0, lang: 'EN' as const },
      { input: 'vehicle', target: 'Automobile', answers: vehicleAnswers, expectedIndex: 0, lang: 'EN' as const },
      { input: 'auto', target: 'Automobile', answers: vehicleAnswers, expectedIndex: 0, lang: 'EN' as const },
      { input: 'bike', target: 'Bicycle', answers: vehicleAnswers, expectedIndex: 1, lang: 'EN' as const },
      { input: 'cycle', target: 'Bicycle', answers: vehicleAnswers, expectedIndex: 1, lang: 'EN' as const },
      { input: 'fridge', target: 'Refrigerator', answers: kitchenAnswers, expectedIndex: 0, lang: 'EN' as const },
      { input: 'freezer', target: 'Refrigerator', answers: kitchenAnswers, expectedIndex: 0, lang: 'EN' as const },
      { input: 'tv', target: 'Television', answers: kitchenAnswers, expectedIndex: 2, lang: 'EN' as const },
      { input: 'tele', target: 'Television', answers: kitchenAnswers, expectedIndex: 2, lang: 'EN' as const },
      { input: 'couch', target: 'Sofa', answers: livingRoomAnswers, expectedIndex: 0, lang: 'EN' as const },
      { input: 'davenport', target: 'Sofa', answers: livingRoomAnswers, expectedIndex: 0, lang: 'EN' as const },

      // Spanish Synonyms
      { input: 'coche', target: 'Automóvil', answers: spanishAnswers, expectedIndex: 0, lang: 'ES' as const },
      { input: 'carro', target: 'Automóvil', answers: spanishAnswers, expectedIndex: 0, lang: 'ES' as const },
      { input: 'nevera', target: 'Refrigerador', answers: spanishAnswers, expectedIndex: 1, lang: 'ES' as const },
      { input: 'tele', target: 'Televisión', answers: spanishAnswers, expectedIndex: 2, lang: 'ES' as const },
      { input: 'plata', target: 'Dinero', answers: spanishAnswers, expectedIndex: 3, lang: 'ES' as const },

      // French Synonyms
      { input: 'voiture', target: 'Automobile', answers: frenchAnswers, expectedIndex: 0, lang: 'FR' as const },
      { input: 'frigo', target: 'Réfrigérateur', answers: frenchAnswers, expectedIndex: 1, lang: 'FR' as const },
      { input: 'tele', target: 'Télévision', answers: frenchAnswers, expectedIndex: 2, lang: 'FR' as const },
      { input: 'fric', target: 'Argent', answers: frenchAnswers, expectedIndex: 3, lang: 'FR' as const },
      { input: 'sous', target: 'Argent', answers: frenchAnswers, expectedIndex: 3, lang: 'FR' as const },
    ];

    synonymCases.forEach(({ input, target, answers, expectedIndex, lang }, index) => {
      it(`[Synonym #${index + 1}] approves synonym "${input}" -> "${target}" (${lang})`, async () => {
        vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue(''); // Tests offline synonym bank

        const outcome = await evaluatePlayerAnswer({
          questionText: 'Survey question',
          candidateAnswers: answers,
          rawInput: input,
          language: lang,
          persistAudit: false,
        });

        expect(outcome.isMatched).toBe(true);
        expect(outcome.matchedIndex).toBe(expectedIndex);
        expect(outcome.matchedAnswer?.answerText).toBe(target);
      });
    });
  });

  describe('Part 3: Gemini Live Contextual Evaluation (Mocked LLM)', () => {
    it('approves contextual slang "beater" -> "Automobile" when judged by Gemini', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('AIzaSyFakeTestKey123');

      vi.spyOn(geminiClientFactory, 'createClient').mockReturnValue({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: () =>
                JSON.stringify({
                  is_matched: true,
                  matched_answer_index: 0,
                  reasoning: 'Beater is informal slang for an old automobile',
                }),
            },
          }),
        }),
      } as any);

      const outcome = await evaluatePlayerAnswer({
        questionText: 'Name something you drive',
        candidateAnswers: vehicleAnswers,
        rawInput: 'beater',
        persistAudit: false,
      });

      expect(outcome.isMatched).toBe(true);
      expect(outcome.matchedAnswer?.answerText).toBe('Automobile');
      expect(outcome.tier).toBe('TIER_2_GEMINI');
    });

    it('approves contextual subcategory "macbook" -> "Computer" via Gemini', async () => {
      const computerAnswers: CandidateAnswer[] = [
        { id: 'c-1', answerText: 'Computer', points: 50 },
        { id: 'c-2', answerText: 'Smartphone', points: 30 },
      ];

      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('AIzaSyFakeTestKey123');

      vi.spyOn(geminiClientFactory, 'createClient').mockReturnValue({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: () =>
                JSON.stringify({
                  is_matched: true,
                  matched_answer_index: 0,
                  reasoning: 'MacBook is a specific brand/model of computer',
                }),
            },
          }),
        }),
      } as any);

      const outcome = await evaluatePlayerAnswer({
        questionText: 'Name an electronic device you use for work',
        candidateAnswers: computerAnswers,
        rawInput: 'macbook',
        persistAudit: false,
      });

      expect(outcome.isMatched).toBe(true);
      expect(outcome.matchedAnswer?.answerText).toBe('Computer');
      expect(outcome.tier).toBe('TIER_2_GEMINI');
    });
  });

  describe('Part 4: Distractor & Unrelated Rejection Edge Cases (Scenario 5)', () => {
    const rejectionCases = [
      { input: 'Submarine', answers: kitchenAnswers, reason: 'unrelated vehicle' },
      { input: 'Giraffe', answers: livingRoomAnswers, reason: 'zoo animal' },
      { input: 'Pizza', answers: vehicleAnswers, reason: 'food item' },
      { input: 'Skyscraper', answers: kitchenAnswers, reason: 'building' },
      { input: 'Elephant', answers: spanishAnswers, reason: 'animal' },
      { input: 'Avion', answers: kitchenAnswers, reason: 'aircraft in kitchen' },
    ];

    rejectionCases.forEach(({ input, answers, reason }, index) => {
      it(`[Rejection #${index + 1}] strictly rejects "${input}" (${reason})`, async () => {
        vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('');

        const outcome = await evaluatePlayerAnswer({
          questionText: 'Survey question',
          candidateAnswers: answers,
          rawInput: input,
          persistAudit: false,
        });

        expect(outcome.isMatched).toBe(false);
        expect(outcome.matchedIndex).toBeNull();
        expect(outcome.matchedAnswer).toBeNull();
        expect(outcome.pointsAwarded).toBe(0);
      });
    });
  });

  describe('Part 5: Latency and Performance Benchmark (DoD Requirement: <500ms for AI, <5ms for Local)', () => {
    it('executes Tier 1 exact match in <5ms', async () => {
      const outcome = await evaluatePlayerAnswer({
        questionText: 'Survey question',
        candidateAnswers: kitchenAnswers,
        rawInput: 'Refrigerator',
        persistAudit: false,
      });

      expect(outcome.tier).toBe('TIER_1_LOCAL');
      expect(outcome.responseTimeSeconds).toBeLessThan(0.005); // < 5ms
    });

    it('executes Tier 2 offline fallback in <50ms (well under 500ms DoD threshold)', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('');

      const start = performance.now();
      const outcome = await evaluatePlayerAnswer({
        questionText: 'Survey question',
        candidateAnswers: kitchenAnswers,
        rawInput: 'fridge',
        persistAudit: false,
      });
      const durationMs = performance.now() - start;

      expect(outcome.isMatched).toBe(true);
      expect(durationMs).toBeLessThan(50); // Under 50ms (DoD is < 500ms)
    });
  });
});

