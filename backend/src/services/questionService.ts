import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from './db';
import {
  generateQuestions,
  GeneratedQuestion,
  SupportedGameMode,
  SupportedLanguage,
} from './geminiService';
import { logger } from '../utils/logger';

export type QuestionWithAnswers = Prisma.QuestionGetPayload<{
  include: { answers: true };
}>;

export interface SaveQuestionsOptions {
  gameId: string;
  questions: GeneratedQuestion[];
  language: string;
  gameMode?: SupportedGameMode;
  startingRoundNumber?: number;
  startingOrderIndex?: number;
  prismaClient?: typeof defaultPrisma;
}

export interface GenerateAndSaveOptions {
  gameId: string;
  gameMode: SupportedGameMode;
  language: SupportedLanguage;
  roundNumber?: number;
  count?: number;
  prismaClient?: typeof defaultPrisma;
}

/**
 * Persists an array of questions and their ranked answers into MySQL via Prisma.
 */
export async function saveQuestionsForGame(
  options: SaveQuestionsOptions
): Promise<QuestionWithAnswers[]> {
  const {
    gameId,
    questions,
    language,
    gameMode = 'MAIN_GAME',
    startingRoundNumber = 1,
    startingOrderIndex = 1,
    prismaClient = defaultPrisma,
  } = options;

  if (!gameId || questions.length === 0) {
    throw new Error('gameId and at least one question are required to persist');
  }

  // Create question records with nested answers in an atomic transaction
  const operations = questions.map((q, i) => {
    // In Fast Money, all 5 questions belong to Round 1 with sequential orderIndex (1..5).
    // In Main Game, each question represents a round (Round 1, Round 2, etc.) with orderIndex = 1.
    const roundNumber = gameMode === 'FAST_MONEY' ? startingRoundNumber : startingRoundNumber + i;
    const orderIndex = gameMode === 'FAST_MONEY' ? startingOrderIndex + i : startingOrderIndex;

    return prismaClient.question.create({
      data: {
        gameId,
        roundNumber,
        orderIndex,
        language,
        questionText: q.questionText,
        answers: {
          create: q.answers.map((ans, ansIdx) => ({
            rankOrder: ansIdx + 1,
            answerText: ans.text,
            points: ans.points,
            isRevealed: false,
          })),
        },
      },
      include: {
        answers: {
          orderBy: { rankOrder: 'asc' },
        },
      },
    });
  });

  const createdQuestions = await prismaClient.$transaction(operations);

  logger.info(
    `[DB:QUESTIONS] Persisted ${createdQuestions.length} question(s) for game ${gameId} (mode: ${gameMode}, lang: ${language})`
  );

  return createdQuestions;
}

/**
 * Orchestrator: invokes the Gemini AI generator (or fallback) and saves the generated
 * survey questions directly into MySQL via Prisma.
 */
export async function generateAndSaveGameQuestions(
  options: GenerateAndSaveOptions
): Promise<QuestionWithAnswers[]> {
  const {
    gameId,
    gameMode,
    language,
    roundNumber = 1,
    count = gameMode === 'FAST_MONEY' ? 5 : 1,
    prismaClient = defaultPrisma,
  } = options;

  // 1. Generate questions via Gemini (or fallback bank on API failure/missing key)
  const generated = await generateQuestions({
    gameMode,
    language,
    count,
    roundNumber,
  });

  // 2. Persist the validated, normalized questions into MySQL
  const saved = await saveQuestionsForGame({
    gameId,
    questions: generated,
    language,
    gameMode,
    startingRoundNumber: roundNumber,
    prismaClient,
  });

  return saved;
}

/**
 * Retrieves all questions and ordered answers for a given game.
 */
export async function getQuestionsByGameId(
  gameId: string,
  prismaClient = defaultPrisma
): Promise<QuestionWithAnswers[]> {
  return prismaClient.question.findMany({
    where: { gameId },
    include: {
      answers: {
        orderBy: { rankOrder: 'asc' },
      },
    },
    orderBy: [{ roundNumber: 'asc' }, { orderIndex: 'asc' }],
  });
}

/**
 * Retrieves a single question by round number and order index.
 */
export async function getQuestionByRound(
  gameId: string,
  roundNumber: number,
  orderIndex = 1,
  prismaClient = defaultPrisma
): Promise<QuestionWithAnswers | null> {
  return prismaClient.question.findFirst({
    where: {
      gameId,
      roundNumber,
      orderIndex,
    },
    include: {
      answers: {
        orderBy: { rankOrder: 'asc' },
      },
    },
  });
}

/**
 * Marks an answer as revealed on the host game board.
 */
export async function revealAnswer(answerId: string, prismaClient = defaultPrisma) {
  return prismaClient.answer.update({
    where: { id: answerId },
    data: { isRevealed: true },
  });
}

