import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from './db';
import {
  matchTier1Exact,
  CandidateAnswer,
} from '../utils/stringNormalizer';
import {
  validateAnswerWithGemini,
  SupportedLanguage,
} from './geminiService';
import { logger } from '../utils/logger';

export interface EvaluateAnswerRequest<T extends CandidateAnswer = CandidateAnswer> {
  questionId?: string;
  playerId?: string;
  questionText: string;
  candidateAnswers: readonly T[];
  rawInput: string;
  language?: SupportedLanguage;
  persistAudit?: boolean;
  prismaClient?: typeof defaultPrisma;
}

export interface EvaluationOutcome<T extends CandidateAnswer = CandidateAnswer> {
  isMatched: boolean;
  matchedIndex: number | null;
  matchedAnswer: T | null;
  pointsAwarded: number;
  reasoning: string;
  tier: 'TIER_1_LOCAL' | 'TIER_2_GEMINI' | 'TIER_2_FALLBACK';
  responseTimeSeconds: number;
  auditResponseId?: string | null;
}

/**
 * Two-Tier Semantic Answer Validation Engine:
 * 1. Tier 1: Instant local exact-match normalization (<5ms latency, 0 external API calls).
 * 2. Tier 2: Gemini semantic fuzzy-matching fallback for synonyms, typos, and slang (~300ms).
 * 3. Audit Logging: Automatically records player guess, points awarded, match status, and latency in MySQL.
 */
export async function evaluatePlayerAnswer<T extends CandidateAnswer = CandidateAnswer>(
  request: EvaluateAnswerRequest<T>
): Promise<EvaluationOutcome<T>> {
  const {
    questionId,
    playerId,
    questionText,
    candidateAnswers,
    rawInput,
    language = 'EN',
    persistAudit = true,
    prismaClient = defaultPrisma,
  } = request;

  const startTime = performance.now();

  // Guard: empty inputs
  if (!rawInput || !rawInput.trim() || !candidateAnswers || candidateAnswers.length === 0) {
    const durationMs = performance.now() - startTime;
    const responseTimeSeconds = Number((durationMs / 1000).toFixed(2));

    const auditResponseId = await recordAuditLogSafe({
      prismaClient,
      persistAudit,
      questionId,
      playerId,
      rawInput: rawInput || '',
      isMatched: false,
      matchedAnswerId: null,
      pointsAwarded: 0,
      responseTimeSeconds,
    });

    return {
      isMatched: false,
      matchedIndex: null,
      matchedAnswer: null,
      pointsAwarded: 0,
      reasoning: 'Empty player submission or candidate answer list',
      tier: 'TIER_1_LOCAL',
      responseTimeSeconds,
      auditResponseId,
    };
  }

  // --- Tier 1: Instant Local Exact Match (<5ms) ---
  const tier1Match = matchTier1Exact(rawInput, candidateAnswers);

  if (tier1Match.isMatched && tier1Match.matchedAnswer) {
    const durationMs = performance.now() - startTime;
    const responseTimeSeconds = Number((durationMs / 1000).toFixed(2));
    const pointsAwarded = Number(tier1Match.matchedAnswer.points) || 0;

    const auditResponseId = await recordAuditLogSafe({
      prismaClient,
      persistAudit,
      questionId,
      playerId,
      rawInput,
      isMatched: true,
      matchedAnswerId: tier1Match.matchedAnswer.id ?? null,
      pointsAwarded,
      responseTimeSeconds,
    });

    logger.info(
      `[TIER_1:MATCH] "${rawInput}" exact-matched "${tier1Match.matchedAnswer.answerText}" (${pointsAwarded} pts, ${durationMs.toFixed(
        1
      )}ms)`
    );

    return {
      isMatched: true,
      matchedIndex: tier1Match.matchedIndex,
      matchedAnswer: tier1Match.matchedAnswer,
      pointsAwarded,
      reasoning: 'Exact match (Tier 1 Local Bypass)',
      tier: 'TIER_1_LOCAL',
      responseTimeSeconds,
      auditResponseId,
    };
  }

  // --- Tier 2: Gemini Semantic Evaluation Fallback ---
  const tier2Result = await validateAnswerWithGemini({
    questionText,
    candidateAnswers,
    rawInput,
    language,
  });

  const durationMs = performance.now() - startTime;
  const responseTimeSeconds = Number((durationMs / 1000).toFixed(2));
  const pointsAwarded =
    tier2Result.isMatched && tier2Result.matchedAnswer
      ? Number(tier2Result.matchedAnswer.points) || 0
      : 0;

  const auditResponseId = await recordAuditLogSafe({
    prismaClient,
    persistAudit,
    questionId,
    playerId,
    rawInput,
    isMatched: tier2Result.isMatched,
    matchedAnswerId: tier2Result.matchedAnswer?.id ?? null,
    pointsAwarded,
    responseTimeSeconds,
  });

  logger.info(
    `[${tier2Result.tier}:${tier2Result.isMatched ? 'MATCH' : 'REJECT'}] "${rawInput}" -> ${
      tier2Result.isMatched ? `"${tier2Result.matchedAnswer?.answerText}"` : 'NONE'
    } (${pointsAwarded} pts, ${durationMs.toFixed(1)}ms)`
  );

  return {
    isMatched: tier2Result.isMatched,
    matchedIndex: tier2Result.matchedIndex,
    matchedAnswer: tier2Result.matchedAnswer,
    pointsAwarded,
    reasoning: tier2Result.reasoning,
    tier: tier2Result.tier,
    responseTimeSeconds,
    auditResponseId,
  };
}

/**
 * Safely persists an audit log record into MySQL without interrupting game flow if DB errors occur.
 */
async function recordAuditLogSafe(params: {
  prismaClient: typeof defaultPrisma;
  persistAudit: boolean;
  questionId?: string;
  playerId?: string;
  rawInput: string;
  isMatched: boolean;
  matchedAnswerId: string | null;
  pointsAwarded: number;
  responseTimeSeconds: number;
}): Promise<string | null> {
  const {
    prismaClient,
    persistAudit,
    questionId,
    playerId,
    rawInput,
    isMatched,
    matchedAnswerId,
    pointsAwarded,
    responseTimeSeconds,
  } = params;

  if (!persistAudit || !questionId || !playerId) {
    return null;
  }

  try {
    const record = await prismaClient.playerResponse.create({
      data: {
        questionId,
        playerId,
        rawInput: rawInput.slice(0, 255),
        isMatched,
        matchedAnswerId,
        pointsAwarded,
        responseTimeSeconds: new Prisma.Decimal(responseTimeSeconds),
      },
    });

    return record.id;
  } catch (error: any) {
    logger.error(
      `[AUDIT:ERROR] Failed to record player response audit log: ${error?.message || error}`
    );
    return null;
  }
}

/**
 * Fetches all audit logs recorded for a specific question.
 */
export async function getAuditResponsesForQuestion(
  questionId: string,
  prismaClient = defaultPrisma
) {
  return prismaClient.playerResponse.findMany({
    where: { questionId },
    include: {
      matchedAnswer: true,
      player: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Fetches all audit logs recorded for a specific player.
 */
export async function getAuditResponsesForPlayer(
  playerId: string,
  prismaClient = defaultPrisma
) {
  return prismaClient.playerResponse.findMany({
    where: { playerId },
    include: {
      matchedAnswer: true,
      question: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

