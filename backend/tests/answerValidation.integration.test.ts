import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../src/services/db';
import {
  evaluatePlayerAnswer,
  getAuditResponsesForQuestion,
  getAuditResponsesForPlayer,
} from '../src/services/answerValidationService';
import { geminiClientFactory } from '../src/services/geminiService';
import { config } from '../src/config/env';

describe('Backend Integration Suite: Answer Validation & DB Persistence (US-06 Step 5)', () => {
  const testRoomCodes = ['FEUD-AV01', 'FEUD-AV02'];
  let testRoomId: string;
  let testPlayerId: string;
  let testGameId: string;
  let testQuestionId: string;
  let ansRefrigeratorId: string;
  let ansTelevisionId: string;
  let ansCafeId: string;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeAll(async () => {
    // 1. Clean up any existing records from previous test runs
    await prisma.room.deleteMany({
      where: { roomCode: { in: testRoomCodes } },
    });

    // 2. Create test Room
    const room = await prisma.room.create({
      data: {
        roomCode: 'FEUD-AV01',
        language: 'EN',
        gameMode: 'MAIN_GAME',
        status: 'ACTIVE',
      },
    });
    testRoomId = room.id;

    // 3. Create test Player
    const player = await prisma.player.create({
      data: {
        roomId: testRoomId,
        nickname: 'Contestant1',
        team: 'TEAM_1',
        isConnected: true,
      },
    });
    testPlayerId = player.id;

    // 4. Create test Game
    const game = await prisma.game.create({
      data: {
        roomId: testRoomId,
        mode: 'MAIN_GAME',
        status: 'IN_PROGRESS',
        currentRound: 1,
      },
    });
    testGameId = game.id;

    // 5. Create test Question with candidate Answers
    const question = await prisma.question.create({
      data: {
        gameId: testGameId,
        questionText: 'Name something found in a kitchen',
        language: 'EN',
        roundNumber: 1,
        orderIndex: 1,
        answers: {
          create: [
            { answerText: 'Refrigerator', points: 35, rankOrder: 1 },
            { answerText: 'Microwave Oven', points: 25, rankOrder: 2 },
            { answerText: 'Television', points: 20, rankOrder: 3 },
            { answerText: 'Café', points: 20, rankOrder: 4 }, // Accent test
          ],
        },
      },
      include: {
        answers: {
          orderBy: { rankOrder: 'asc' },
        },
      },
    });

    testQuestionId = question.id;
    ansRefrigeratorId = question.answers[0].id;
    ansTelevisionId = question.answers[2].id;
    ansCafeId = question.answers[3].id;
  });

  afterAll(async () => {
    // Clean up test rooms (cascades to games, questions, answers, players, and responses)
    await prisma.room.deleteMany({
      where: { roomCode: { in: testRoomCodes } },
    });
  });

  describe('Scenario 1: Exact Match Tier 1 Local Bypass with MySQL Audit Logging', () => {
    it('evaluates exact match in Tier 1 and persists valid PlayerResponse record in MySQL', async () => {
      const answers = await prisma.answer.findMany({
        where: { questionId: testQuestionId },
      });

      const outcome = await evaluatePlayerAnswer({
        questionId: testQuestionId,
        playerId: testPlayerId,
        questionText: 'Name something found in a kitchen',
        candidateAnswers: answers,
        rawInput: '  rEfRiGeRaToR  ',
      });

      expect(outcome.isMatched).toBe(true);
      expect(outcome.matchedAnswer?.id).toBe(ansRefrigeratorId);
      expect(outcome.pointsAwarded).toBe(35);
      expect(outcome.tier).toBe('TIER_1_LOCAL');
      expect(outcome.auditResponseId).toBeDefined();

      // Verify row in MySQL database
      const dbRecord = await prisma.playerResponse.findUnique({
        where: { id: outcome.auditResponseId! },
        include: { matchedAnswer: true, player: true, question: true },
      });

      expect(dbRecord).not.toBeNull();
      expect(dbRecord?.questionId).toBe(testQuestionId);
      expect(dbRecord?.playerId).toBe(testPlayerId);
      expect(dbRecord?.rawInput).toBe('  rEfRiGeRaToR  ');
      expect(dbRecord?.isMatched).toBe(true);
      expect(dbRecord?.matchedAnswerId).toBe(ansRefrigeratorId);
      expect(dbRecord?.pointsAwarded).toBe(35);
      expect(dbRecord?.matchedAnswer?.answerText).toBe('Refrigerator');
      expect(dbRecord?.player.nickname).toBe('Contestant1');
      expect(Number(dbRecord?.responseTimeSeconds)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Scenario 2: Accent & Diacritic Tolerance with MySQL Persistence', () => {
    it('evaluates "cafe" against "Café" in Tier 1 and persists match in MySQL', async () => {
      const answers = await prisma.answer.findMany({
        where: { questionId: testQuestionId },
      });

      const outcome = await evaluatePlayerAnswer({
        questionId: testQuestionId,
        playerId: testPlayerId,
        questionText: 'Name something found in a kitchen',
        candidateAnswers: answers,
        rawInput: 'cafe', // unaccented input
      });

      expect(outcome.isMatched).toBe(true);
      expect(outcome.matchedAnswer?.id).toBe(ansCafeId);
      expect(outcome.pointsAwarded).toBe(20);
      expect(outcome.tier).toBe('TIER_1_LOCAL');

      // Verify DB row
      const dbRecord = await prisma.playerResponse.findUnique({
        where: { id: outcome.auditResponseId! },
      });

      expect(dbRecord?.isMatched).toBe(true);
      expect(dbRecord?.matchedAnswerId).toBe(ansCafeId);
      expect(dbRecord?.pointsAwarded).toBe(20);
    });
  });

  describe('Scenario 3: Typo / Misspelling Handling with MySQL Persistence', () => {
    it('evaluates misspelling "refrigirater" via Tier 2 and records match in MySQL', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue(''); // Tests resilient fallback

      const answers = await prisma.answer.findMany({
        where: { questionId: testQuestionId },
      });

      const outcome = await evaluatePlayerAnswer({
        questionId: testQuestionId,
        playerId: testPlayerId,
        questionText: 'Name something found in a kitchen',
        candidateAnswers: answers,
        rawInput: 'refrigirater',
      });

      expect(outcome.isMatched).toBe(true);
      expect(outcome.matchedAnswer?.id).toBe(ansRefrigeratorId);
      expect(outcome.pointsAwarded).toBe(35);
      expect(outcome.tier).toBe('TIER_2_FALLBACK');

      const dbRecord = await prisma.playerResponse.findUnique({
        where: { id: outcome.auditResponseId! },
      });

      expect(dbRecord?.rawInput).toBe('refrigirater');
      expect(dbRecord?.isMatched).toBe(true);
      expect(dbRecord?.matchedAnswerId).toBe(ansRefrigeratorId);
      expect(dbRecord?.pointsAwarded).toBe(35);
    });
  });

  describe('Scenario 4: Synonym & Colloquial Phrasing with MySQL Persistence', () => {
    it('evaluates synonym "tv" to "Television" via Tier 2 and records match in MySQL', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue(''); // Tests resilient fallback

      const answers = await prisma.answer.findMany({
        where: { questionId: testQuestionId },
      });

      const outcome = await evaluatePlayerAnswer({
        questionId: testQuestionId,
        playerId: testPlayerId,
        questionText: 'Name something found in a kitchen',
        candidateAnswers: answers,
        rawInput: 'tv',
      });

      expect(outcome.isMatched).toBe(true);
      expect(outcome.matchedAnswer?.id).toBe(ansTelevisionId);
      expect(outcome.pointsAwarded).toBe(20);

      const dbRecord = await prisma.playerResponse.findUnique({
        where: { id: outcome.auditResponseId! },
      });

      expect(dbRecord?.rawInput).toBe('tv');
      expect(dbRecord?.isMatched).toBe(true);
      expect(dbRecord?.matchedAnswerId).toBe(ansTelevisionId);
      expect(dbRecord?.pointsAwarded).toBe(20);
    });
  });

  describe('Scenario 5: Unrelated Submission Rejection with MySQL Persistence', () => {
    it('rejects "Submarine" with 0 points and persists rejection in MySQL', async () => {
      vi.spyOn(config, 'geminiApiKey', 'get').mockReturnValue('');

      const answers = await prisma.answer.findMany({
        where: { questionId: testQuestionId },
      });

      const outcome = await evaluatePlayerAnswer({
        questionId: testQuestionId,
        playerId: testPlayerId,
        questionText: 'Name something found in a kitchen',
        candidateAnswers: answers,
        rawInput: 'Submarine',
      });

      expect(outcome.isMatched).toBe(false);
      expect(outcome.pointsAwarded).toBe(0);
      expect(outcome.matchedAnswer).toBeNull();

      const dbRecord = await prisma.playerResponse.findUnique({
        where: { id: outcome.auditResponseId! },
      });

      expect(dbRecord?.rawInput).toBe('Submarine');
      expect(dbRecord?.isMatched).toBe(false);
      expect(dbRecord?.matchedAnswerId).toBeNull();
      expect(dbRecord?.pointsAwarded).toBe(0);
    });
  });

  describe('Audit Query Helpers Integration', () => {
    it('fetches complete question audit history ordered chronologically with relations', async () => {
      const history = await getAuditResponsesForQuestion(testQuestionId);

      expect(history.length).toBeGreaterThanOrEqual(5);
      expect(history[0].questionId).toBe(testQuestionId);
      expect(history[0].player).toBeDefined();
      expect(history[0].player.nickname).toBe('Contestant1');

      // Verify chronology
      for (let i = 1; i < history.length; i++) {
        expect(new Date(history[i].createdAt).getTime()).toBeGreaterThanOrEqual(
          new Date(history[i - 1].createdAt).getTime()
        );
      }
    });

    it('fetches player audit history ordered chronologically with question relation', async () => {
      const playerLogs = await getAuditResponsesForPlayer(testPlayerId);

      expect(playerLogs.length).toBeGreaterThanOrEqual(5);
      expect(playerLogs[0].playerId).toBe(testPlayerId);
      expect(playerLogs[0].question).toBeDefined();
      expect(playerLogs[0].question.questionText).toBe('Name something found in a kitchen');
    });
  });
});
