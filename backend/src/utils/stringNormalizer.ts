/**
 * String normalization and Tier 1 exact-match validation utilities for Family Feud.
 * Provides ultra-fast (<5ms), accent-tolerant, punctuation-agnostic local matching.
 */

export interface CandidateAnswer {
  id?: string;
  answerText: string;
  points?: number;
  orderIndex?: number;
  [key: string]: unknown;
}

export interface Tier1MatchResult<T extends CandidateAnswer = CandidateAnswer> {
  isMatched: boolean;
  matchedIndex: number | null;
  matchedAnswer: T | null;
  normalizedInput: string;
  normalizedTarget: string | null;
}

/**
 * Normalizes an input string by:
 * 1. Trimming leading and trailing whitespace.
 * 2. Converting to lowercase.
 * 3. Decomposing unicode diacritics (NFD) and stripping accent marks (é, è, ê, ñ, á, ü, ç, î).
 * 4. Removing punctuation and non-alphanumeric characters.
 * 5. Collapsing consecutive whitespace into a single space.
 *
 * @param str The raw input string or unknown input
 * @returns Clean normalized string
 */
export function normalizeString(str: unknown): string {
  if (typeof str !== 'string' || !str) {
    return '';
  }

  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tier 1 Local Exact Match Validator:
 * Compares the normalized player input against an array of candidate answers.
 * Executes synchronously in <1ms without calling external APIs.
 *
 * @param rawInput The raw text submitted by the player
 * @param candidates Array of candidate answers on the board
 * @returns Match result with matched index and answer object if found
 */
export function matchTier1Exact<T extends CandidateAnswer = CandidateAnswer>(
  rawInput: unknown,
  candidates: readonly T[]
): Tier1MatchResult<T> {
  const normalizedInput = normalizeString(rawInput);

  if (!normalizedInput || !Array.isArray(candidates) || candidates.length === 0) {
    return {
      isMatched: false,
      matchedIndex: null,
      matchedAnswer: null,
      normalizedInput,
      normalizedTarget: null,
    };
  }

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    if (!candidate || typeof candidate.answerText !== 'string') {
      continue;
    }

    const normalizedTarget = normalizeString(candidate.answerText);
    if (normalizedInput === normalizedTarget) {
      return {
        isMatched: true,
        matchedIndex: index,
        matchedAnswer: candidate,
        normalizedInput,
        normalizedTarget,
      };
    }
  }

  return {
    isMatched: false,
    matchedIndex: null,
    matchedAnswer: null,
    normalizedInput,
    normalizedTarget: null,
  };
}

