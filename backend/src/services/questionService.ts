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
  excludedQuestions?: string[];
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
    const answersList =
      gameMode === 'MAIN_GAME' && q.answers.length > 8 ? q.answers.slice(0, 8) : q.answers;

    return prismaClient.question.create({
      data: {
        gameId,
        roundNumber,
        orderIndex,
        language,
        questionText: q.questionText,
        answers: {
          create: answersList.map((ans, ansIdx) => ({
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
 * Retrieves question texts already played in the current room/game, combined with
 * recent global questions in the given language, to prevent question repetition.
 */
export async function getExcludedQuestionTexts(
  gameId: string,
  language: SupportedLanguage,
  limit = 50,
  prismaClient = defaultPrisma
): Promise<string[]> {
  try {
    // 1. Fetch current game to resolve its parent roomId (if exists)
    const game = await prismaClient.game.findUnique({
      where: { id: gameId },
      select: { roomId: true },
    });

    let roomQuestions: { questionText: string }[] = [];
    if (game?.roomId) {
      // Fetch all questions from all games played in this room
      roomQuestions = await prismaClient.question.findMany({
        where: {
          game: { roomId: game.roomId },
        },
        select: { questionText: true },
      });
    } else {
      // Fallback: fetch questions for this specific game
      roomQuestions = await prismaClient.question.findMany({
        where: { gameId },
        select: { questionText: true },
      });
    }

    // 2. Fetch recent questions in the target language across other games/rooms
    const recentGlobalQuestions = await prismaClient.question.findMany({
      where: {
        language,
        ...(game?.roomId
          ? { game: { roomId: { not: game.roomId } } }
          : { gameId: { not: gameId } }),
      },
      select: { questionText: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const combinedSet = new Set<string>();
    for (const q of roomQuestions) {
      const trimmed = q.questionText?.trim();
      if (trimmed) combinedSet.add(trimmed);
    }
    for (const q of recentGlobalQuestions) {
      const trimmed = q.questionText?.trim();
      if (trimmed) combinedSet.add(trimmed);
    }

    return Array.from(combinedSet);
  } catch (error) {
    logger.warn(`[QUESTIONS:EXCLUSIONS] Failed to retrieve exclusion history for game ${gameId}:`, { error });
    return [];
  }
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

  // Retrieve excluded questions from room history and recent language history if not explicitly provided
  const excludedQuestions =
    options.excludedQuestions ??
    (await getExcludedQuestionTexts(gameId, language, 50, prismaClient));

  // 1. Generate questions via Gemini (or fallback bank on API failure/missing key)
  const generated = await generateQuestions({
    gameMode,
    language,
    count,
    roundNumber,
    excludedQuestions,
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

