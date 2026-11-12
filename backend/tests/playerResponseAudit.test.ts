import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import prisma from '../src/config/db';
import {
  evaluatePlayerAnswer,
  getAuditResponsesForQuestion,
  getAuditResponsesForPlayer,
} from '../src/services/answerValidationService';
import {
  initFaceOffSession,
  clearAllFaceOffSessions,
} from '../src/services/faceOffService';
import {
  initTeamGuessingSession,
  clearAllTeamGuessingSessions,
} from '../src/services/teamGuessingService';

describe('US-19: Turn Audit Logging & Player Responses Suite', () => {
  const TEST_ROOM_PREFIX = 'AUDIT-';
  const testRoomCodes = [
    `${TEST_ROOM_PREFIX}01`,
    `${TEST_ROOM_PREFIX}02`,
    `${TEST_ROOM_PREFIX}03`,
    `${TEST_ROOM_PREFIX}04`,
  ];

  const cleanup = async () => {
    clearAllFaceOffSessions();
    clearAllTeamGuessingSessions();

    await prisma.room.deleteMany({
      where: {
        roomCode: { in: testRoomCodes },
      },
    });
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
  });

  describe('Scenario 2: Audit Logging of Player Responses in Fast Money', () => {
    it('persists a detailed audit log row when a player submits a matching answer', async () => {
      // 1. Setup room, player, game, question, and candidate answers
      const room = await prisma.room.create({
        data: {
          roomCode: `${TEST_ROOM_PREFIX}01`,
          language: 'EN',
          gameMode: 'FAST_MONEY',
          status: 'ACTIVE',
        },
      });

      const player = await prisma.player.create({
        data: {
          roomId: room.id,
          nickname: 'FastPlayer1',
          team: 'TEAM_1',
        },
      });

      const game = await prisma.game.create({
        data: {
          roomId: room.id,
          mode: 'FAST_MONEY',
          currentRound: 1,
        },
      });

      const question = await prisma.question.create({
        data: {
          gameId: game.id,
          roundNumber: 1,
          orderIndex: 1,
          language: 'EN',
          questionText: 'Name something you drink in the morning',
        },
      });

      const coffeeAnswer = await prisma.answer.create({
        data: {
          questionId: question.id,
          rankOrder: 1,
          answerText: 'Coffee',
          points: 35,
        },
      });

      const teaAnswer = await prisma.answer.create({
        data: {
          questionId: question.id,
          rankOrder: 2,
          answerText: 'Tea',
          points: 25,
        },
      });

      // 2. Evaluate answer ("coffee") with audit persistence enabled
      const outcome = await evaluatePlayerAnswer({
        questionId: question.id,
        playerId: player.id,
        questionText: question.questionText,
        candidateAnswers: [coffeeAnswer, teaAnswer],
        rawInput: 'coffee',
        language: 'EN',
        persistAudit: true,
        prismaClient: prisma,
      });

      expect(outcome.isMatched).toBe(true);
      expect(outcome.pointsAwarded).toBe(35);
      expect(outcome.auditResponseId).toBeDefined();

      // 3. Query player_responses in MySQL to assert Scenario 2 acceptance criteria
      const responses = await prisma.playerResponse.findMany({
        where: { questionId: question.id, playerId: player.id },
      });

      expect(responses).toHaveLength(1);
      const log = responses[0];
      expect(log.id).toBe(outcome.auditResponseId);
      expect(log.rawInput).toBe('coffee');
      expect(log.isMatched).toBe(true);
      expect(log.matchedAnswerId).toBe(coffeeAnswer.id);
      expect(log.pointsAwarded).toBe(35);
      expect(log.responseTimeSeconds).not.toBeNull();
      expect(Number(log.responseTimeSeconds)).toBeGreaterThanOrEqual(0);
    });

    it('persists a detailed audit log row when a player submits an unmatched answer', async () => {
      const room = await prisma.room.create({
        data: {
          roomCode: `${TEST_ROOM_PREFIX}02`,
          language: 'EN',
          gameMode: 'FAST_MONEY',
        },
      });

      const player = await prisma.player.create({
        data: { roomId: room.id, nickname: 'FastPlayer2' },
      });

      const game = await prisma.game.create({
        data: { roomId: room.id, mode: 'FAST_MONEY' },
      });

      const question = await prisma.question.create({
        data: {
          gameId: game.id,
          roundNumber: 1,
          orderIndex: 1,
          language: 'EN',
          questionText: 'Name something you drink in the morning',
        },
      });

      await prisma.answer.create({
        data: { questionId: question.id, rankOrder: 1, answerText: 'Coffee', points: 35 },
      });

      // Submit miss ("gasoline")
      const outcome = await evaluatePlayerAnswer({
        questionId: question.id,
        playerId: player.id,
        questionText: question.questionText,
        candidateAnswers: [{ id: 'ans-1', answerText: 'Coffee', points: 35, rankOrder: 1 }],
        rawInput: 'gasoline',
        language: 'EN',
        persistAudit: true,
        prismaClient: prisma,
      });

      expect(outcome.isMatched).toBe(false);
      expect(outcome.pointsAwarded).toBe(0);

      const auditRecord = await prisma.playerResponse.findUnique({
        where: { id: outcome.auditResponseId! },
      });

      expect(auditRecord).not.toBeNull();
      expect(auditRecord?.rawInput).toBe('gasoline');
      expect(auditRecord?.isMatched).toBe(false);
      expect(auditRecord?.matchedAnswerId).toBeNull();
      expect(auditRecord?.pointsAwarded).toBe(0);
      expect(Number(auditRecord?.responseTimeSeconds)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Main Game Turn Audit Logging (Face-Off, Team Guessing & Steal)', () => {
    it('logs player guess into player_responses during Face-Off session', async () => {
      const room = await prisma.room.create({
        data: {
          roomCode: `${TEST_ROOM_PREFIX}03`,
          language: 'EN',
          gameMode: 'MAIN_GAME',
        },
      });

      const p1 = await prisma.player.create({
        data: { roomId: room.id, nickname: 'Contender1', team: 'TEAM_1' },
      });
      const p2 = await prisma.player.create({
        data: { roomId: room.id, nickname: 'Contender2', team: 'TEAM_2' },
      });

      const game = await prisma.game.create({
        data: { roomId: room.id, mode: 'MAIN_GAME', currentRound: 1 },
      });

      const question = await prisma.question.create({
        data: {
          gameId: game.id,
          roundNumber: 1,
          language: 'EN',
          questionText: 'Name something found in a refrigerator',
        },
      });

      const milkAnswer = await prisma.answer.create({
        data: {
          questionId: question.id,
          rankOrder: 1,
          answerText: 'Milk',
          points: 40,
        },
      });

      // Initialize FaceOffSession with persistAudit enabled
      const session = initFaceOffSession(room.roomCode, {
        gameId: game.id,
        roundNumber: 1,
        team1Players: [{ id: p1.id, nickname: p1.nickname, team: 'TEAM_1', battingOrder: 1 }],
        team2Players: [{ id: p2.id, nickname: p2.nickname, team: 'TEAM_2', battingOrder: 1 }],
        question: {
          id: question.id,
          questionText: question.questionText,
          answers: [milkAnswer],
        },
        language: 'EN',
        persistAudit: true,
        prismaClient: prisma,
      });

      // Player 1 and Player 2 mark ready, P1 presses buzzer
      session.markContenderReady(p1.id);
      session.markContenderReady(p2.id);
      session.pressBuzzer(p1.id);

      const guessRes = await session.evaluateContenderAnswer(p1.id, 'milk');
      expect(guessRes.guessResult.isMatched).toBe(true);

      // Verify audit log row was written to player_responses
      const responses = await prisma.playerResponse.findMany({
        where: { questionId: question.id, playerId: p1.id },
      });

      expect(responses).toHaveLength(1);
      expect(responses[0].rawInput).toBe('milk');
      expect(responses[0].isMatched).toBe(true);
      expect(responses[0].matchedAnswerId).toBe(milkAnswer.id);
      expect(responses[0].pointsAwarded).toBe(40);
    });

    it('logs team guessing turn and steal phase attempts into player_responses', async () => {
      const room = await prisma.room.create({
        data: {
          roomCode: `${TEST_ROOM_PREFIX}04`,
          language: 'EN',
          gameMode: 'MAIN_GAME',
        },
      });

      const p1 = await prisma.player.create({
        data: { roomId: room.id, nickname: 'Guesser1', team: 'TEAM_1' },
      });
      const p2 = await prisma.player.create({
        data: { roomId: room.id, nickname: 'OpponentStealer', team: 'TEAM_2' },
      });

      const game = await prisma.game.create({
        data: { roomId: room.id, mode: 'MAIN_GAME', currentRound: 1 },
      });

      const question = await prisma.question.create({
        data: {
          gameId: game.id,
          roundNumber: 1,
          language: 'EN',
          questionText: 'Name something you pack in a suitcase',
        },
      });

      const clothesAnswer = await prisma.answer.create({
        data: {
          questionId: question.id,
          rankOrder: 1,
          answerText: 'Clothes',
          points: 50,
        },
      });

      const shoesAnswer = await prisma.answer.create({
        data: {
          questionId: question.id,
          rankOrder: 2,
          answerText: 'Shoes',
          points: 30,
        },
      });

      // Initialize TeamGuessingSession with persistAudit enabled
      const teamSession = initTeamGuessingSession(room.roomCode, {
        gameId: game.id,
        roundNumber: 1,
        controllingTeam: 'TEAM_1',
        team1Players: [{ id: p1.id, nickname: p1.nickname, team: 'TEAM_1', battingOrder: 1 }],
        team2Players: [{ id: p2.id, nickname: p2.nickname, team: 'TEAM_2', battingOrder: 1 }],
        question: {
          id: question.id,
          questionText: question.questionText,
          answers: [clothesAnswer, shoesAnswer],
        },
        language: 'EN',
        stealSpokespersonId: p2.id,
        persistAudit: true,
        prismaClient: prisma,
      });

      // 1. Team 1 guess
      await teamSession.evaluateGuess(p1.id, 'clothes');

      // Verify team 1 audit log
      const p1Responses = await prisma.playerResponse.findMany({
        where: { playerId: p1.id },
      });
      expect(p1Responses).toHaveLength(1);
      expect(p1Responses[0].rawInput).toBe('clothes');
      expect(p1Responses[0].isMatched).toBe(true);
      expect(p1Responses[0].matchedAnswerId).toBe(clothesAnswer.id);

      // 2. Trigger Steal Phase by incurring 3 strikes
      await teamSession.evaluateGuess(p1.id, 'wrong1');
      await teamSession.evaluateGuess(p1.id, 'wrong2');
      await teamSession.evaluateGuess(p1.id, 'wrong3');

      expect(teamSession.phase).toBe('STEAL_PHASE');

      // 3. Opposing team spokesperson submits steal guess
      await teamSession.evaluateStealGuess(p2.id, 'shoes');

      // Verify steal phase audit log for p2
      const p2Responses = await prisma.playerResponse.findMany({
        where: { playerId: p2.id },
      });
      expect(p2Responses).toHaveLength(1);
      expect(p2Responses[0].rawInput).toBe('shoes');
      expect(p2Responses[0].isMatched).toBe(true);
      expect(p2Responses[0].matchedAnswerId).toBe(shoesAnswer.id);
      expect(p2Responses[0].pointsAwarded).toBe(30);

      // Verify all responses for this question via query helper
      const allQResponses = await getAuditResponsesForQuestion(question.id, prisma);
      expect(allQResponses.length).toBeGreaterThanOrEqual(5); // clothes, wrong1, wrong2, wrong3, shoes
      expect(allQResponses[0].player).toBeDefined();

      // Verify player audit helper
      const playerLogs = await getAuditResponsesForPlayer(p1.id, prisma);
      expect(playerLogs).toHaveLength(4);
      expect(playerLogs[0].question).toBeDefined();
    });
  });
});
