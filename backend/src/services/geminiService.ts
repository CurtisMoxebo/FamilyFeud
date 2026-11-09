import { GoogleGenerativeAI, SchemaType, ResponseSchema } from '@google/generative-ai';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { getFallbackQuestions } from '../data/fallbackQuestions';
import {
  findOfflineFuzzyMatch,
  CandidateAnswer,
  normalizeString,
  calculateSimilarity,
} from '../utils/stringNormalizer';

export type SupportedLanguage = 'EN' | 'FR' | 'ES';
export type SupportedGameMode = 'FAST_MONEY' | 'MAIN_GAME';

export interface GeneratedAnswer {
  text: string;
  points: number;
}

export interface GeneratedQuestion {
  questionText: string;
  answers: GeneratedAnswer[];
}

export interface QuestionGenerationOptions {
  gameMode: SupportedGameMode;
  language: SupportedLanguage;
  count?: number;
  roundNumber?: number;
  excludedQuestions?: string[];
}

/**
 * Normalizes question answers:
 * 1. Trims text and cleans up numbers.
 * 2. Sorts answers in descending order by points.
 * 3. Adjusts any rounding difference on the #1 answer so total strictly equals 100.
 */
export function normalizeQuestionAnswers(question: GeneratedQuestion): GeneratedQuestion {
  if (!question || !Array.isArray(question.answers) || question.answers.length === 0) {
    throw new Error('Invalid question: answers array cannot be empty');
  }

  // Clean and sort answers descending
  const normalizedAnswers: GeneratedAnswer[] = question.answers
    .map((a) => ({
      text: typeof a.text === 'string' ? a.text.trim() : String(a.text || ''),
      points: Math.max(1, Math.round(Number(a.points) || 1)),
    }))
    .filter((a) => a.text.length > 0)
    .sort((a, b) => b.points - a.points);

  if (normalizedAnswers.length === 0) {
    throw new Error('Invalid question: all answers had empty text');
  }

  // Calculate current point sum
  const total = normalizedAnswers.reduce((sum, a) => sum + a.points, 0);
  const diff = 100 - total;

  if (diff !== 0) {
    // Scenario 3: Adjust the difference on the #1 answer (highest ranked)
    normalizedAnswers[0].points += diff;

    // Guard: ensure top answer stays positive
    if (normalizedAnswers[0].points <= 0) {
      const sum = normalizedAnswers.reduce((s, a) => s + a.points, 0);
      let running = 0;
      for (let i = 0; i < normalizedAnswers.length; i++) {
        if (i === normalizedAnswers.length - 1) {
          normalizedAnswers[i].points = 100 - running;
        } else {
          normalizedAnswers[i].points = Math.max(
            1,
            Math.round((normalizedAnswers[i].points / sum) * 100)
          );
          running += normalizedAnswers[i].points;
        }
      }
    }

    // Re-sort descending
    normalizedAnswers.sort((a, b) => b.points - a.points);
  }

  // Final check to guarantee sum strictly equals 100
  const finalSum = normalizedAnswers.reduce((sum, a) => sum + a.points, 0);
  if (finalSum !== 100) {
    normalizedAnswers[0].points += 100 - finalSum;
  }

  return {
    questionText: question.questionText.trim(),
    answers: normalizedAnswers,
  };
}

/**
 * Builds the localized system and user prompt for Gemini.
 */
export function buildPrompt(
  gameMode: SupportedGameMode,
  language: SupportedLanguage,
  count: number,
  roundNumber = 1,
  excludedQuestions: string[] = []
): string {
  const langName =
    language === 'FR' ? 'French (Français)' : language === 'ES' ? 'Spanish (Español)' : 'English';

  const modeInstruction =
    gameMode === 'FAST_MONEY'
      ? `Generate exactly ${count} fast-paced, intuitive Family Feud survey questions for the Fast Money round. For each question, provide 4 to 6 realistic survey answers.`
      : `Generate exactly ${count} survey question for Main Game Round ${roundNumber}. The question must have between 4 and 8 ranked survey answers (ideally 5 to 8).`;

  const validExcluded = (excludedQuestions || [])
    .map((q) => (typeof q === 'string' ? q.trim() : ''))
    .filter((q) => q.length > 0);

  const exclusionSection =
    validExcluded.length > 0
      ? `\n6. Negative Constraints (Do NOT Repeat):\nDo NOT generate, repeat, or closely rephrase any of the following previously asked survey questions:\n${validExcluded.map((q) => `- "${q}"`).join('\n')}\nEnsure all generated questions are completely fresh, distinct, and novel.`
      : '';

  return `You are an expert Family Feud survey question creator.
Generate culturally authentic, universally accessible, family-friendly survey questions in ${langName}.

Requirements:
1. Tone & Content: Family-friendly, clean, humorous, suitable for players of all ages at home. Explicitly NO NSFW, politics, violence, or sensitive themes.
2. Structure: 100 people were surveyed. For each question, the point values of the answers MUST sum to EXACTLY 100.
3. Order: Answers must be sorted in descending order of points (most popular answer first).
4. Language: Questions and answers must be naturally written in ${langName}.
5. ${modeInstruction}${exclusionSection}

Output only valid JSON according to the schema.`;
}

/**
 * Detects whether a candidate question collides with a target question using
 * exact normalization, Levenshtein edit distance, or token Jaccard similarity (US-27).
 */
export function isQuestionCollision(
  candidateQuestion: string,
  targetQuestion: string,
  threshold = 0.8
): boolean {
  const normA = normalizeString(candidateQuestion);
  const normB = normalizeString(targetQuestion);

  if (!normA || !normB) return false;
  if (normA === normB) return true;

  // 1. Levenshtein edit-distance similarity
  const levSimilarity = calculateSimilarity(normA, normB);
  if (levSimilarity >= threshold) return true;

  // 2. Token Jaccard similarity (order-independent word overlap for words > 2 chars)
  const tokensA = new Set(normA.split(' ').filter((w) => w.length > 2));
  const tokensB = new Set(normB.split(' ').filter((w) => w.length > 2));

  if (tokensA.size > 0 && tokensB.size > 0) {
    let intersection = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) intersection++;
    }
    const union = new Set([...tokensA, ...tokensB]).size;
    const jaccard = intersection / union;
    if (jaccard >= threshold) return true;
  }

  return false;
}

/**
 * Filters generated survey questions against historical exclusion list and
 * intra-batch candidate questions (US-27 Scenario 2 & 3).
 */
export function filterAndDeduplicateQuestions(
  generatedQuestions: GeneratedQuestion[],
  excludedQuestions: string[] = [],
  threshold = 0.8
): GeneratedQuestion[] {
  const validExcluded = (excludedQuestions || []).filter((q) => Boolean(q && q.trim()));
  const acceptedQuestions: GeneratedQuestion[] = [];
  const acceptedTexts: string[] = [];

  for (const q of generatedQuestions) {
    const qText = q.questionText.trim();
    if (!qText) continue;

    // 1. Check historical exclusion list
    const historicalCollision = validExcluded.find((excludedText) =>
      isQuestionCollision(qText, excludedText, threshold)
    );
    if (historicalCollision) {
      logger.warn(
        `[QUESTIONS:DEDUP] Historical collision detected! Candidate "${qText}" matches excluded "${historicalCollision}". Discarding.`
      );
      continue;
    }

    // 2. Check intra-batch collisions with already-accepted questions in this batch
    const intraBatchCollision = acceptedTexts.find((acceptedText) =>
      isQuestionCollision(qText, acceptedText, threshold)
    );
    if (intraBatchCollision) {
      logger.warn(
        `[QUESTIONS:DEDUP] Intra-batch collision detected! Candidate "${qText}" duplicates batch question "${intraBatchCollision}". Discarding.`
      );
      continue;
    }

    acceptedQuestions.push(q);
    acceptedTexts.push(qText);
  }

  return acceptedQuestions;
}

/**
 * Factory for creating the Generative AI client.
 * Using an object method enables reliable spying and mocking in tests.
 */
export const geminiClientFactory = {
  createClient(apiKey: string): GoogleGenerativeAI {
    return new GoogleGenerativeAI(apiKey);
  },
};

/**
 * Main service method: generates questions via Google Gemini API,
 * with point normalization and automatic fallback to curated bank on failure.
 */
export async function generateQuestions(
  options: QuestionGenerationOptions
): Promise<GeneratedQuestion[]> {
  const { gameMode, language, roundNumber = 1, excludedQuestions = [] } = options;
  const count = options.count ?? (gameMode === 'FAST_MONEY' ? 5 : 1);

  // Fallback if no API key is provided
  if (!config.geminiApiKey || config.geminiApiKey.trim() === '') {
    logger.warn('[GEMINI:CONFIG] No GEMINI_API_KEY configured. Using curated fallback question bank.');
    const fallbacks = getFallbackQuestions(gameMode, language, roundNumber, excludedQuestions);
    return fallbacks.slice(0, count);
  }

  try {
    const genAI = geminiClientFactory.createClient(config.geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: config.geminiModel,
      generationConfig: {
        temperature: 0.8,
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.ARRAY,
          description: 'A list of survey questions with ranked answers',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              questionText: {
                type: SchemaType.STRING,
                description: 'The survey question text',
              },
              answers: {
                type: SchemaType.ARRAY,
                description: 'Ranked answers with points summing to 100',
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    text: {
                      type: SchemaType.STRING,
                      description: 'The answer text',
                    },
                    points: {
                      type: SchemaType.INTEGER,
                      description: 'Point value',
                    },
                  },
                  required: ['text', 'points'],
                },
              },
            },
            required: ['questionText', 'answers'],
          },
        },
      },
    });

    const prompt = buildPrompt(gameMode, language, count, roundNumber, excludedQuestions);
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    if (!text || text.trim() === '') {
      throw new Error('Gemini API returned an empty response');
    }

    let parsed = JSON.parse(text);

    // Normalize array vs object wrapper
    if (!Array.isArray(parsed)) {
      if (Array.isArray(parsed.questions)) {
        parsed = parsed.questions;
      } else if ((parsed.questionText || parsed.question) && parsed.answers) {
        parsed = [parsed];
      } else {
        throw new Error('Unexpected JSON format from Gemini API');
      }
    }

    if (parsed.length === 0) {
      throw new Error('Gemini API returned 0 questions');
    }

    // Normalize each question's points and answer order
    const validatedQuestions: GeneratedQuestion[] = parsed.slice(0, count).map((rawQ: any) => {
      const qText = rawQ.questionText || rawQ.question || 'Survey Question';
      const answers: GeneratedAnswer[] = (rawQ.answers || []).map((a: any) => ({
        text: a.text || a.answerText || '',
        points: Number(a.points) || 1,
      }));

      return normalizeQuestionAnswers({
        questionText: qText,
        answers,
      });
    });

    // Post-generation collision detection & deduplication (US-27 Scenario 2 & 3)
    const deduplicated = filterAndDeduplicateQuestions(
      validatedQuestions,
      excludedQuestions
    );

    // If collisions were removed, replenish missing slots with non-overlapping fallback questions
    if (deduplicated.length < count) {
      const currentTexts = deduplicated.map((q) => q.questionText);
      const combinedExcluded = [...excludedQuestions, ...currentTexts];

      const replacements = getFallbackQuestions(gameMode, language, roundNumber, combinedExcluded);
      for (const fb of replacements) {
        if (deduplicated.length >= count) break;
        const isDup = combinedExcluded.some((existing) =>
          isQuestionCollision(fb.questionText, existing)
        );
        if (!isDup) {
          deduplicated.push(normalizeQuestionAnswers(fb));
          combinedExcluded.push(fb.questionText);
        }
      }
    }

    logger.info(
      `[GEMINI:SUCCESS] Generated ${deduplicated.length} survey question(s) in ${language} for ${gameMode}`
    );

    return deduplicated.slice(0, count);
  } catch (error: any) {
    // Scenario 4: AI Failure / Rate Limit Handling -> fallback to curated bank
    logger.error(
      `[GEMINI:ERROR] Generation failed (${error?.message || error}). Falling back to curated bank.`
    );
    const fallbacks = getFallbackQuestions(gameMode, language, roundNumber, excludedQuestions);
    return fallbacks.slice(0, count);
  }
}

/**
 * Structured schema for Gemini answer validation response.
 */
export const AnswerValidationSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  description: 'Validation result of contestant guess against candidate survey answers',
  properties: {
    is_matched: {
      type: SchemaType.BOOLEAN,
      description: 'Whether the player guess matches one of the candidate answers',
    },
    matched_answer_index: {
      type: SchemaType.INTEGER,
      description: 'The 0-based index of the matched candidate answer, or -1 if no match',
      nullable: true,
    },
    reasoning: {
      type: SchemaType.STRING,
      description: 'Concise explanation of the decision',
    },
  },
  required: ['is_matched'],
};

export interface ValidateAnswerOptions<T extends CandidateAnswer = CandidateAnswer> {
  questionText: string;
  candidateAnswers: readonly T[];
  rawInput: string;
  language?: SupportedLanguage;
}

export interface SemanticValidationResult<T extends CandidateAnswer = CandidateAnswer> {
  isMatched: boolean;
  matchedIndex: number | null;
  matchedAnswer: T | null;
  reasoning: string;
  tier: 'TIER_2_GEMINI' | 'TIER_2_FALLBACK';
}

/**
 * Builds the prompt instructing Gemini to evaluate contestant guess against target survey answers.
 */
export function buildValidationPrompt(
  questionText: string,
  candidateAnswers: string[],
  rawInput: string,
  language: SupportedLanguage
): string {
  const langName =
    language === 'FR' ? 'French' : language === 'ES' ? 'Spanish' : 'English';

  const answersList = candidateAnswers
    .map((ans, idx) => `  [Index ${idx}] "${ans}"`)
    .join('\n');

  return `You are an expert impartial judge for the TV game show Family Feud in ${langName}.
Survey Question: "${questionText}"

Available Target Answers on the Board:
${answersList}

Contestant's Guess: "${rawInput}"

Your task is to judge whether the contestant's guess matches any of the target answers listed above.

Rules for Matching:
1. Approve (is_matched: true) if the guess is:
   - A minor spelling mistake or typo (e.g., "refrigirater" matches "Refrigerator").
   - A direct synonym, common alternate name, or colloquial phrasing (e.g., "car" or "vehicle" matches "Automobile", "fridge" matches "Refrigerator", "tele" or "tv" matches "Television").
   - A specific subcategory or instance directly synonymous in the context of this survey question.
2. Reject (is_matched: false, matched_answer_index: null) if the guess is:
   - Completely unrelated or wrong (e.g., "Submarine" for kitchen items).
   - A distinct object/concept not represented on the board.
   - Too broad, too vague, or refers to a different category.
3. If matched, "matched_answer_index" MUST be the exact 0-based integer index of the matching target answer from the list above. If not matched, "matched_answer_index" must be null or -1.

Output ONLY valid JSON matching the schema.`;
}

/**
 * Tier 2 Semantic Validation via Google Gemini (with automatic offline fallback).
 * Evaluates synonyms, colloquialisms, and typos under deterministic temperature (0.2).
 */
export async function validateAnswerWithGemini<T extends CandidateAnswer = CandidateAnswer>(
  options: ValidateAnswerOptions<T>
): Promise<SemanticValidationResult<T>> {
  const { questionText, candidateAnswers, rawInput, language = 'EN' } = options;

  if (!rawInput || !rawInput.trim() || !candidateAnswers || candidateAnswers.length === 0) {
    return {
      isMatched: false,
      matchedIndex: null,
      matchedAnswer: null,
      reasoning: 'Empty input or candidate answers list',
      tier: 'TIER_2_FALLBACK',
    };
  }

  // Fallback if no Gemini API key is configured
  if (!config.geminiApiKey || config.geminiApiKey.trim() === '') {
    logger.warn('[GEMINI:VALIDATION] No GEMINI_API_KEY configured. Using offline fuzzy fallback.');
    const fallback = findOfflineFuzzyMatch(rawInput, candidateAnswers);
    return {
      isMatched: fallback.isMatched,
      matchedIndex: fallback.matchedIndex,
      matchedAnswer: fallback.matchedAnswer,
      reasoning: fallback.reasoning,
      tier: 'TIER_2_FALLBACK',
    };
  }

  try {
    const genAI = geminiClientFactory.createClient(config.geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: config.geminiModel,
      generationConfig: {
        temperature: 0.2, // Low temperature for deterministic evaluation
        responseMimeType: 'application/json',
        responseSchema: AnswerValidationSchema,
      },
    });

    const targetAnswersList = candidateAnswers.map((c) => c.answerText);
    const prompt = buildValidationPrompt(questionText, targetAnswersList, rawInput, language);

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    if (!text || text.trim() === '') {
      throw new Error('Gemini API returned empty validation response');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error('Could not parse Gemini validation JSON');
      }
    }

    const isMatched = Boolean(parsed.is_matched ?? parsed.isMatched ?? false);
    let matchedIndex: number | null =
      parsed.matched_answer_index ?? parsed.matchedAnswerIndex ?? null;

    if (
      typeof matchedIndex === 'number' &&
      (matchedIndex < 0 || matchedIndex >= candidateAnswers.length)
    ) {
      matchedIndex = null;
    }

    if (!isMatched) {
      matchedIndex = null;
    }

    const matchedAnswer =
      isMatched && matchedIndex !== null ? candidateAnswers[matchedIndex] : null;

    const reasoning =
      typeof parsed.reasoning === 'string'
        ? parsed.reasoning
        : isMatched
        ? `Matched target answer at index ${matchedIndex}`
        : 'No semantic match found';

    return {
      isMatched,
      matchedIndex,
      matchedAnswer,
      reasoning,
      tier: 'TIER_2_GEMINI',
    };
  } catch (error: any) {
    logger.warn(
      `[GEMINI:VALIDATION_ERROR] Semantic evaluation failed (${
        error?.message || error
      }). Falling back to offline matcher.`
    );
    const fallback = findOfflineFuzzyMatch(rawInput, candidateAnswers);
    return {
      isMatched: fallback.isMatched,
      matchedIndex: fallback.matchedIndex,
      matchedAnswer: fallback.matchedAnswer,
      reasoning: fallback.reasoning,
      tier: 'TIER_2_FALLBACK',
    };
  }
}
