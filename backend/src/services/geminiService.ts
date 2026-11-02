import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { getFallbackQuestions } from '../data/fallbackQuestions';

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
  roundNumber = 1
): string {
  const langName =
    language === 'FR' ? 'French (Français)' : language === 'ES' ? 'Spanish (Español)' : 'English';

  const modeInstruction =
    gameMode === 'FAST_MONEY'
      ? `Generate exactly ${count} fast-paced, intuitive Family Feud survey questions for the Fast Money round. For each question, provide 4 to 6 realistic survey answers.`
      : `Generate exactly ${count} survey question for Main Game Round ${roundNumber}. The question must have between 4 and 8 ranked survey answers (ideally 5 to 8).`;

  return `You are an expert Family Feud survey question creator.
Generate culturally authentic, universally accessible, family-friendly survey questions in ${langName}.

Requirements:
1. Tone & Content: Family-friendly, clean, humorous, suitable for players of all ages at home. Explicitly NO NSFW, politics, violence, or sensitive themes.
2. Structure: 100 people were surveyed. For each question, the point values of the answers MUST sum to EXACTLY 100.
3. Order: Answers must be sorted in descending order of points (most popular answer first).
4. Language: Questions and answers must be naturally written in ${langName}.
5. ${modeInstruction}

Output only valid JSON according to the schema.`;
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
  const { gameMode, language, roundNumber = 1 } = options;
  const count = options.count ?? (gameMode === 'FAST_MONEY' ? 5 : 1);

  // Fallback if no API key is provided
  if (!config.geminiApiKey || config.geminiApiKey.trim() === '') {
    logger.warn('[GEMINI:CONFIG] No GEMINI_API_KEY configured. Using curated fallback question bank.');
    const fallbacks = getFallbackQuestions(gameMode, language, roundNumber);
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

    const prompt = buildPrompt(gameMode, language, count, roundNumber);
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
      } else if (parsed.questionText && parsed.answers) {
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

    logger.info(
      `[GEMINI:SUCCESS] Generated ${validatedQuestions.length} survey question(s) in ${language} for ${gameMode}`
    );

    return validatedQuestions;
  } catch (error: any) {
    // Scenario 4: AI Failure / Rate Limit Handling -> fallback to curated bank
    logger.error(
      `[GEMINI:ERROR] Generation failed (${error?.message || error}). Falling back to curated bank.`
    );
    const fallbacks = getFallbackQuestions(gameMode, language, roundNumber);
    return fallbacks.slice(0, count);
  }
}
