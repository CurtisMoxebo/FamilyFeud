import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evaluatePlayerAnswer,
  getAuditResponsesForQuestion,
  getAuditResponsesForPlayer,
} from '../src/services/answerValidationService';
import * as geminiService from '../src/services/geminiService';
import { CandidateAnswer } from '../src/utils/stringNormalizer';

describe('answerValidationService (US-06 Two-Tier Validation & Audit Logging)', () => {
  const mockCandidates: CandidateAnswer[] = [
    { id: 'ans-1', answerText: 'Television', points: 35, orderIndex: 1 },
    { id: 'ans-2', answerText: 'Refrigerator', points: 25, orderIndex: 2 },
    { id: 'ans-3', answerText: 'Automobile', points: 20, orderIndex: 3 },
    { id: 'ans-4', answerText: 'Café', points: 12, orderIndex: 4 },
  ];

  let mockPrisma: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockPrisma = {
      playerResponse: {
        create: vi.fn().mockImplementation(async ({ data }: any) => ({
          id: 'response-uuid-1234',
          ...data,
          createdAt: new Date(),
        })),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
  });

  describe('Tier 1: Instant Local Match (<5ms Bypass)', () => {
    it('satisfies Scenario 1: exact match directly accepts in Tier 1 without calling Gemini', async () => {
      const geminiSpy = vi.spyOn(geminiService, 'validateAnswerWithGemini');

      const outcome = await evaluatePlayerAnswer({
        questionId: 'q-101',
        playerId: 'p-202',
        questionText: 'Name an appliance',
        candidateAnswers: mockCandidates,
        rawInput: '  tElEvIsIoN  ',
        prismaClient: mockPrisma,
      });

      expect(outcome.isMatched).toBe(true);
      expect(outcome.matchedIndex).toBe(0);
      expect(outcome.matchedAnswer?.id).toBe('ans-1');
      expect(outcome.pointsAwarded).toBe(35);
      expect(outcome.tier).toBe('TIER_1_LOCAL');
      expect(geminiSpy).not.toHaveBeenCalled();

      // Audit log was created
      expect(mockPrisma.playerResponse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          questionId: 'q-101',
          playerId: 'p-202',
          rawInput: '  tElEvIsIoN  ',
          isMatched: true,
          matchedAnswerId: 'ans-1',
          pointsAwarded: 35,
        }),
      });
      expect(outcome.auditResponseId).toBe('response-uuid-1234');
    });

    it('satisfies Scenario 2: accent & diacritic tolerance bypasses Gemini in Tier 1', async () => {
      const geminiSpy = vi.spyOn(geminiService, 'validateAnswerWithGemini');

      const outcome = await evaluatePlayerAnswer({
        questionId: 'q-101',
        playerId: 'p-202',
        questionText: 'Nommez une boisson',
        candidateAnswers: mockCandidates,
        rawInput: 'cafe', // unaccented version of Café
        language: 'FR',
        prismaClient: mockPrisma,
      });

      expect(outcome.isMatched).toBe(true);
      expect(outcome.matchedIndex).toBe(3);
      expect(outcome.matchedAnswer?.answerText).toBe('Café');
      expect(outcome.pointsAwarded).toBe(12);
      expect(outcome.tier).toBe('TIER_1_LOCAL');
      expect(geminiSpy).not.toHaveBeenCalled();
    });
  });

  describe('Tier 2: Gemini Semantic Fallback', () => {
    it('satisfies Scenario 3: passes typo to Gemini when Tier 1 fails and awards points', async () => {
      const geminiSpy = vi
        .spyOn(geminiService, 'validateAnswerWithGemini')
        .mockResolvedValueOnce({
          isMatched: true,
          matchedIndex: 1,
          matchedAnswer: mockCandidates[1],
          reasoning: 'Minor spelling mistake of Refrigerator',
          tier: 'TIER_2_GEMINI',
        });

      const outcome = await evaluatePlayerAnswer({
        questionId: 'q-101',
        playerId: 'p-202',
        questionText: 'Name something in a kitchen',
        candidateAnswers: mockCandidates,
        rawInput: 'refrigirater',
        language: 'EN',
        prismaClient: mockPrisma,
      });

      expect(geminiSpy).toHaveBeenCalledOnce();
      expect(outcome.isMatched).toBe(true);
      expect(outcome.matchedIndex).toBe(1);
      expect(outcome.matchedAnswer?.answerText).toBe('Refrigerator');
      expect(outcome.pointsAwarded).toBe(25);
      expect(outcome.tier).toBe('TIER_2_GEMINI');
      expect(outcome.reasoning).toContain('Refrigerator');

      expect(mockPrisma.playerResponse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          rawInput: 'refrigirater',
          isMatched: true,
          matchedAnswerId: 'ans-2',
          pointsAwarded: 25,
        }),
      });
    });

    it('satisfies Scenario 4: passes synonym to Gemini when Tier 1 fails and awards points', async () => {
      vi.spyOn(geminiService, 'validateAnswerWithGemini').mockResolvedValueOnce({
        isMatched: true,
        matchedIndex: 2,
        matchedAnswer: mockCandidates[2],
        reasoning: 'Car is synonymous with Automobile',
        tier: 'TIER_2_GEMINI',
      });

      const outcome = await evaluatePlayerAnswer({
        questionId: 'q-101',
        playerId: 'p-202',
        questionText: 'Name something with wheels',
        candidateAnswers: mockCandidates,
        rawInput: 'car',
        prismaClient: mockPrisma,
      });

      expect(outcome.isMatched).toBe(true);
      expect(outcome.matchedIndex).toBe(2);
      expect(outcome.matchedAnswer?.answerText).toBe('Automobile');
      expect(outcome.pointsAwarded).toBe(20);
      expect(outcome.tier).toBe('TIER_2_GEMINI');
    });

    it('satisfies Scenario 5: rejects completely unrelated submission with 0 points', async () => {
      vi.spyOn(geminiService, 'validateAnswerWithGemini').mockResolvedValueOnce({
        isMatched: false,
        matchedIndex: null,
        matchedAnswer: null,
        reasoning: 'Submarine is unrelated to kitchen items',
        tier: 'TIER_2_GEMINI',
      });

      const outcome = await evaluatePlayerAnswer({
        questionId: 'q-101',
        playerId: 'p-202',
        questionText: 'Name something found in a kitchen',
        candidateAnswers: mockCandidates,
        rawInput: 'Submarine',
        prismaClient: mockPrisma,
      });

      expect(outcome.isMatched).toBe(false);
      expect(outcome.matchedIndex).toBeNull();
      expect(outcome.matchedAnswer).toBeNull();
      expect(outcome.pointsAwarded).toBe(0);
      expect(outcome.tier).toBe('TIER_2_GEMINI');

      expect(mockPrisma.playerResponse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          rawInput: 'Submarine',
          isMatched: false,
          matchedAnswerId: null,
          pointsAwarded: 0,
        }),
      });
    });
  });

  describe('Audit Logging & Edge Cases', () => {
    it('handles empty input string without calling Gemini and records rejection', async () => {
      const outcome = await evaluatePlayerAnswer({
        questionId: 'q-101',
        playerId: 'p-202',
        questionText: 'Name an appliance',
        candidateAnswers: mockCandidates,
        rawInput: '   ',
        prismaClient: mockPrisma,
      });

      expect(outcome.isMatched).toBe(false);
      expect(outcome.pointsAwarded).toBe(0);
      expect(outcome.tier).toBe('TIER_1_LOCAL');
      expect(mockPrisma.playerResponse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isMatched: false,
          pointsAwarded: 0,
        }),
      });
    });

    it('skips database persistence when persistAudit is false', async () => {
      const outcome = await evaluatePlayerAnswer({
        questionText: 'Name an appliance',
        candidateAnswers: mockCandidates,
        rawInput: 'Television',
        persistAudit: false,
        prismaClient: mockPrisma,
      });

      expect(outcome.isMatched).toBe(true);
      expect(outcome.auditResponseId).toBeNull();
      expect(mockPrisma.playerResponse.create).not.toHaveBeenCalled();
    });

    it('catches and recovers gracefully if database persistence throws', async () => {
      mockPrisma.playerResponse.create.mockRejectedValueOnce(
        new Error('MySQL connection lost')
      );

      const outcome = await evaluatePlayerAnswer({
        questionId: 'q-101',
        playerId: 'p-202',
        questionText: 'Name an appliance',
        candidateAnswers: mockCandidates,
        rawInput: 'Television',
        prismaClient: mockPrisma,
      });

      // Function must not crash; returns evaluation result with auditResponseId = null
      expect(outcome.isMatched).toBe(true);
      expect(outcome.pointsAwarded).toBe(35);
      expect(outcome.auditResponseId).toBeNull();
    });

    it('fetches audit records via question and player query helpers', async () => {
      mockPrisma.playerResponse.findMany.mockResolvedValueOnce([
        { id: 'res-1', questionId: 'q-101', rawInput: 'tv' },
      ]);

      const questionResponses = await getAuditResponsesForQuestion('q-101', mockPrisma);
      expect(questionResponses).toHaveLength(1);
      expect(mockPrisma.playerResponse.findMany).toHaveBeenCalledWith({
        where: { questionId: 'q-101' },
        include: { matchedAnswer: true, player: true },
        orderBy: { createdAt: 'asc' },
      });

      mockPrisma.playerResponse.findMany.mockResolvedValueOnce([
        { id: 'res-2', playerId: 'p-202', rawInput: 'couch' },
      ]);

      const playerResponses = await getAuditResponsesForPlayer('p-202', mockPrisma);
      expect(playerResponses).toHaveLength(1);
      expect(mockPrisma.playerResponse.findMany).toHaveBeenCalledWith({
        where: { playerId: 'p-202' },
        include: { matchedAnswer: true, question: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  });
});

