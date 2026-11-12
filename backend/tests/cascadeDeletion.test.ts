import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import prisma from '../src/config/db';
import { Prisma } from '@prisma/client';

describe('US-19: Foreign Key Relational Integrity & Cascade Deletion Suite', () => {
  const TEST_ROOM_PREFIX = 'CASC-';
  const testRoomCodes = [
    `${TEST_ROOM_PREFIX}01`,
    `${TEST_ROOM_PREFIX}02`,
    `${TEST_ROOM_PREFIX}03`,
    `${TEST_ROOM_PREFIX}04`,
    `${TEST_ROOM_PREFIX}05`,
    `${TEST_ROOM_PREFIX}06`,
  ];

  const cleanupTestRecords = async () => {
    await prisma.room.deleteMany({
      where: {
        roomCode: { in: testRoomCodes },
      },
    });
  };

  beforeAll(async () => {
    await cleanupTestRecords();
  });

  afterAll(async () => {
    await cleanupTestRecords();
  });

  beforeEach(async () => {
    await cleanupTestRecords();
  });

  describe('Scenario 3: Cascade Deletion of Room Data', () => {
    it('cleanly cascades room deletion to players, games, questions, answers, and player responses', async () => {
      // 1. Create a full hierarchical graph: Room -> Player & Game -> Question -> Answer & PlayerResponse
      const room = await prisma.room.create({
        data: {
          roomCode: `${TEST_ROOM_PREFIX}01`,
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'ACTIVE',
        },
      });

      const player = await prisma.player.create({
        data: {
          roomId: room.id,
          nickname: 'Alice',
          team: 'TEAM_1',
          isReady: true,
          totalScore: 45,
        },
      });

      const game = await prisma.game.create({
        data: {
          roomId: room.id,
          mode: 'MAIN_GAME',
          currentRound: 1,
          status: 'IN_PROGRESS',
        },
      });

      const question = await prisma.question.create({
        data: {
          gameId: game.id,
          roundNumber: 1,
          orderIndex: 1,
          language: 'EN',
          questionText: 'Name something people bring to the beach',
        },
      });

      const answer = await prisma.answer.create({
        data: {
          questionId: question.id,
          rankOrder: 1,
          answerText: 'Towel',
          points: 35,
          isRevealed: true,
        },
      });

      const response = await prisma.playerResponse.create({
        data: {
          questionId: question.id,
          playerId: player.id,
          rawInput: 'beach towel',
          isMatched: true,
          matchedAnswerId: answer.id,
          pointsAwarded: 35,
          responseTimeSeconds: new Prisma.Decimal(3.45),
        },
      });

      // Verify all 6 records exist
      expect(await prisma.room.findUnique({ where: { id: room.id } })).not.toBeNull();
      expect(await prisma.player.findUnique({ where: { id: player.id } })).not.toBeNull();
      expect(await prisma.game.findUnique({ where: { id: game.id } })).not.toBeNull();
      expect(await prisma.question.findUnique({ where: { id: question.id } })).not.toBeNull();
      expect(await prisma.answer.findUnique({ where: { id: answer.id } })).not.toBeNull();
      expect(await prisma.playerResponse.findUnique({ where: { id: response.id } })).not.toBeNull();

      // 2. Perform Room deletion
      const deletedRoom = await prisma.room.delete({
        where: { id: room.id },
      });
      expect(deletedRoom.id).toBe(room.id);

      // 3. Assert all child records have been cascaded and no longer exist
      expect(await prisma.room.findUnique({ where: { id: room.id } })).toBeNull();
      expect(await prisma.player.findUnique({ where: { id: player.id } })).toBeNull();
      expect(await prisma.game.findUnique({ where: { id: game.id } })).toBeNull();
      expect(await prisma.question.findUnique({ where: { id: question.id } })).toBeNull();
      expect(await prisma.answer.findUnique({ where: { id: answer.id } })).toBeNull();
      expect(await prisma.playerResponse.findUnique({ where: { id: response.id } })).toBeNull();
    });

    it('cascades a complex room with multiple players, rounds, answers, and audit responses', async () => {
      const room = await prisma.room.create({
        data: {
          roomCode: `${TEST_ROOM_PREFIX}02`,
          language: 'FR',
          gameMode: 'FAST_MONEY',
          status: 'ACTIVE',
        },
      });

      const player1 = await prisma.player.create({
        data: { roomId: room.id, nickname: 'Pierre', team: 'TEAM_1' },
      });
      const player2 = await prisma.player.create({
        data: { roomId: room.id, nickname: 'Jean', team: 'TEAM_2' },
      });

      const game = await prisma.game.create({
        data: { roomId: room.id, mode: 'FAST_MONEY', currentRound: 1 },
      });

      const question1 = await prisma.question.create({
        data: {
          gameId: game.id,
          roundNumber: 1,
          orderIndex: 1,
          language: 'FR',
          questionText: 'Nommez un aliment pour le petit déjeuner',
        },
      });
      const question2 = await prisma.question.create({
        data: {
          gameId: game.id,
          roundNumber: 1,
          orderIndex: 2,
          language: 'FR',
          questionText: 'Nommez une boisson chaude',
        },
      });

      const a1 = await prisma.answer.create({
        data: { questionId: question1.id, rankOrder: 1, answerText: 'Croissant', points: 40 },
      });
      const a2 = await prisma.answer.create({
        data: { questionId: question2.id, rankOrder: 1, answerText: 'Café', points: 55 },
      });

      await prisma.playerResponse.createMany({
        data: [
          {
            questionId: question1.id,
            playerId: player1.id,
            rawInput: 'croissant',
            isMatched: true,
            matchedAnswerId: a1.id,
            pointsAwarded: 40,
            responseTimeSeconds: new Prisma.Decimal(2.1),
          },
          {
            questionId: question2.id,
            playerId: player2.id,
            rawInput: 'the',
            isMatched: false,
            pointsAwarded: 0,
            responseTimeSeconds: new Prisma.Decimal(4.3),
          },
        ],
      });

      // Verify counts before deletion
      expect(await prisma.player.count({ where: { roomId: room.id } })).toBe(2);
      expect(await prisma.question.count({ where: { gameId: game.id } })).toBe(2);
      expect(await prisma.answer.count({ where: { questionId: { in: [question1.id, question2.id] } } })).toBe(2);
      expect(await prisma.playerResponse.count({ where: { questionId: { in: [question1.id, question2.id] } } })).toBe(2);

      // Delete Room
      await prisma.room.delete({ where: { id: room.id } });

      // Verify all cascaded counts are zero
      expect(await prisma.player.count({ where: { roomId: room.id } })).toBe(0);
      expect(await prisma.game.count({ where: { roomId: room.id } })).toBe(0);
      expect(await prisma.question.count({ where: { gameId: game.id } })).toBe(0);
      expect(await prisma.answer.count({ where: { questionId: { in: [question1.id, question2.id] } } })).toBe(0);
      expect(await prisma.playerResponse.count({ where: { questionId: { in: [question1.id, question2.id] } } })).toBe(0);
    });
  });

  describe('Sub-Tree Cascade Deletions (Game, Question, Player)', () => {
    it('cascades game deletion to questions and answers without affecting parent room or sibling games', async () => {
      const room = await prisma.room.create({
        data: {
          roomCode: `${TEST_ROOM_PREFIX}03`,
          language: 'EN',
          gameMode: 'MAIN_GAME',
        },
      });

      const game1 = await prisma.game.create({
        data: { roomId: room.id, mode: 'MAIN_GAME', currentRound: 1 },
      });
      const game2 = await prisma.game.create({
        data: { roomId: room.id, mode: 'MAIN_GAME', currentRound: 2 },
      });

      const q1 = await prisma.question.create({
        data: { gameId: game1.id, roundNumber: 1, language: 'EN', questionText: 'Q1' },
      });
      const q2 = await prisma.question.create({
        data: { gameId: game2.id, roundNumber: 2, language: 'EN', questionText: 'Q2' },
      });

      const a1 = await prisma.answer.create({
        data: { questionId: q1.id, rankOrder: 1, answerText: 'Ans1', points: 10 },
      });
      const a2 = await prisma.answer.create({
        data: { questionId: q2.id, rankOrder: 1, answerText: 'Ans2', points: 20 },
      });

      // Delete game1 only
      await prisma.game.delete({ where: { id: game1.id } });

      // Game 1 subtree is deleted
      expect(await prisma.game.findUnique({ where: { id: game1.id } })).toBeNull();
      expect(await prisma.question.findUnique({ where: { id: q1.id } })).toBeNull();
      expect(await prisma.answer.findUnique({ where: { id: a1.id } })).toBeNull();

      // Room and Game 2 subtree remain intact
      expect(await prisma.room.findUnique({ where: { id: room.id } })).not.toBeNull();
      expect(await prisma.game.findUnique({ where: { id: game2.id } })).not.toBeNull();
      expect(await prisma.question.findUnique({ where: { id: q2.id } })).not.toBeNull();
      expect(await prisma.answer.findUnique({ where: { id: a2.id } })).not.toBeNull();
    });

    it('cascades player deletion to associated player_responses without affecting room or questions', async () => {
      const room = await prisma.room.create({
        data: {
          roomCode: `${TEST_ROOM_PREFIX}04`,
          language: 'ES',
          gameMode: 'FAST_MONEY',
        },
      });

      const player = await prisma.player.create({
        data: { roomId: room.id, nickname: 'Carlos', team: 'TEAM_1' },
      });

      const game = await prisma.game.create({
        data: { roomId: room.id, mode: 'FAST_MONEY', currentRound: 1 },
      });

      const question = await prisma.question.create({
        data: { gameId: game.id, roundNumber: 1, language: 'ES', questionText: 'Pregunta 1' },
      });

      const response = await prisma.playerResponse.create({
        data: {
          questionId: question.id,
          playerId: player.id,
          rawInput: 'sol',
          isMatched: false,
          pointsAwarded: 0,
        },
      });

      // Delete player
      await prisma.player.delete({ where: { id: player.id } });

      // Player and response deleted
      expect(await prisma.player.findUnique({ where: { id: player.id } })).toBeNull();
      expect(await prisma.playerResponse.findUnique({ where: { id: response.id } })).toBeNull();

      // Room, Game, and Question remain intact
      expect(await prisma.room.findUnique({ where: { id: room.id } })).not.toBeNull();
      expect(await prisma.game.findUnique({ where: { id: game.id } })).not.toBeNull();
      expect(await prisma.question.findUnique({ where: { id: question.id } })).not.toBeNull();
    });
  });

  describe('ON DELETE SET NULL: Matched Answer Reference Handling', () => {
    it('sets matchedAnswerId to null when Answer is deleted, preserving the PlayerResponse audit log', async () => {
      const room = await prisma.room.create({
        data: {
          roomCode: `${TEST_ROOM_PREFIX}05`,
          language: 'EN',
          gameMode: 'FAST_MONEY',
        },
      });

      const player = await prisma.player.create({
        data: { roomId: room.id, nickname: 'AuditPlayer' },
      });

      const game = await prisma.game.create({
        data: { roomId: room.id, mode: 'FAST_MONEY' },
      });

      const question = await prisma.question.create({
        data: { gameId: game.id, roundNumber: 1, language: 'EN', questionText: 'Favorite fruit' },
      });

      const answer = await prisma.answer.create({
        data: { questionId: question.id, rankOrder: 1, answerText: 'Apple', points: 30 },
      });

      const response = await prisma.playerResponse.create({
        data: {
          questionId: question.id,
          playerId: player.id,
          rawInput: 'apple',
          isMatched: true,
          matchedAnswerId: answer.id,
          pointsAwarded: 30,
          responseTimeSeconds: new Prisma.Decimal(1.85),
        },
      });

      expect(response.matchedAnswerId).toBe(answer.id);

      // Delete the Answer specifically
      await prisma.answer.delete({
        where: { id: answer.id },
      });

      // Verify the Answer is gone
      const deletedAnswer = await prisma.answer.findUnique({ where: { id: answer.id } });
      expect(deletedAnswer).toBeNull();

      // Verify the PlayerResponse was PRESERVED, but matchedAnswerId became NULL (ON DELETE SET NULL)
      const preservedResponse = await prisma.playerResponse.findUnique({
        where: { id: response.id },
      });
      expect(preservedResponse).not.toBeNull();
      expect(preservedResponse?.matchedAnswerId).toBeNull();
      expect(preservedResponse?.rawInput).toBe('apple');
      expect(preservedResponse?.isMatched).toBe(true);
      expect(preservedResponse?.pointsAwarded).toBe(30);
    });
  });

  describe('Foreign Key Integrity & Constraint Violations (P2003)', () => {
    it('rejects creating a player with a non-existent roomId', async () => {
      await expect(
        prisma.player.create({
          data: {
            roomId: 'non-existent-room-uuid',
            nickname: 'GhostPlayer',
          },
        }),
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });

    it('rejects creating a game with a non-existent roomId', async () => {
      await expect(
        prisma.game.create({
          data: {
            roomId: 'non-existent-room-uuid',
            mode: 'MAIN_GAME',
          },
        }),
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });

    it('rejects creating a question with a non-existent gameId', async () => {
      await expect(
        prisma.question.create({
          data: {
            gameId: 'non-existent-game-uuid',
            roundNumber: 1,
            language: 'EN',
            questionText: 'Invalid Question',
          },
        }),
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });

    it('rejects creating an answer with a non-existent questionId', async () => {
      await expect(
        prisma.answer.create({
          data: {
            questionId: 'non-existent-question-uuid',
            rankOrder: 1,
            answerText: 'Invalid Answer',
            points: 10,
          },
        }),
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });

    it('rejects creating a player_response with an invalid questionId or playerId', async () => {
      await expect(
        prisma.playerResponse.create({
          data: {
            questionId: 'non-existent-question-uuid',
            playerId: 'non-existent-player-uuid',
            rawInput: 'ghost answer',
          },
        }),
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });
  });
});

