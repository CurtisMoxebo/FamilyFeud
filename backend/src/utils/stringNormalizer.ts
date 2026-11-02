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
 * Calculates the Levenshtein edit distance between two strings.
 */
export function calculateLevenshteinDistance(a: string, b: string): number {
  const s1 = a || '';
  const s2 = b || '';
  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost  // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculates similarity ratio between two strings from 0.0 to 1.0 based on Levenshtein distance.
 */
export function calculateSimilarity(a: string, b: string): number {
  const normA = normalizeString(a);
  const normB = normalizeString(b);

  if (!normA && !normB) return 1.0;
  if (!normA || !normB) return 0.0;
  if (normA === normB) return 1.0;

  const maxLen = Math.max(normA.length, normB.length);
  const distance = calculateLevenshteinDistance(normA, normB);
  return Math.max(0, (maxLen - distance) / maxLen);
}

/**
 * Common curated multilingual synonym dictionary for zero-downtime offline fallback.
 */
export const OFFLINE_SYNONYMS: Record<string, string[]> = {
  // English
  television: ['tv', 'tele', 'telly', 'screen', 'monitor', 'flat screen'],
  refrigerator: ['fridge', 'icebox', 'freezer', 'cooler'],
  automobile: ['car', 'auto', 'vehicle', 'motorcar'],
  sofa: ['couch', 'davenport', 'settee', 'loveseat'],
  phone: ['telephone', 'cellphone', 'mobile', 'smartphone', 'cell'],
  dog: ['puppy', 'pooch', 'canine', 'doggy', 'hound'],
  cat: ['kitten', 'kitty', 'feline'],
  money: ['cash', 'currency', 'bucks', 'dough', 'bills'],
  doctor: ['physician', 'doc', 'md', 'surgeon'],
  bicycle: ['bike', 'cycle'],
  cinema: ['movies', 'theater', 'movie theater', 'movie theatre'],

  // Spanish
  television_es: ['tele', 'televisor', 'pantalla'],
  automovil_es: ['coche', 'carro', 'auto', 'vehiculo'],
  refrigerador_es: ['nevera', 'heladera', 'frigo', 'refrig'],
  sofa_es: ['sillon', 'divan'],
  telefono_es: ['celular', 'movil'],
  perro_es: ['perrito', 'can'],
  gato_es: ['gatito', 'felino'],
  dinero_es: ['plata', 'efectivo', 'pasta', 'lana'],
  bicicleta_es: ['bici', 'cicla'],

  // French
  television_fr: ['tele', 'ecran', 'poste'],
  automobile_fr: ['voiture', 'auto', 'vehicule'],
  refrigerateur_fr: ['frigo', 'glaciere'],
  canape_fr: ['sofa', 'fauteuil'],
  telephone_fr: ['portable', 'mobile', 'tel'],
  chien_fr: ['chiot', 'toutou'],
  chat_fr: ['chaton', 'minou'],
  argent_fr: ['sous', 'fric', 'monnaie', 'especes', 'thune'],
  bicyclette_fr: ['velo', 'becane'],
};

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

/**
 * Offline fuzzy and synonym matching fallback when Gemini API is unconfigured or unreachable.
 * Evaluates typo tolerance using Levenshtein distance and localized synonym dictionaries.
 */
export function findOfflineFuzzyMatch<T extends CandidateAnswer = CandidateAnswer>(
  rawInput: unknown,
  candidates: readonly T[]
): {
  isMatched: boolean;
  matchedIndex: number | null;
  matchedAnswer: T | null;
  reasoning: string;
} {
  const normalizedInput = normalizeString(rawInput);
  if (!normalizedInput || !Array.isArray(candidates) || candidates.length === 0) {
    return {
      isMatched: false,
      matchedIndex: null,
      matchedAnswer: null,
      reasoning: 'Input or candidate list is empty',
    };
  }

  // 1. Check offline synonym dictionary
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate || typeof candidate.answerText !== 'string') continue;

    const normalizedTarget = normalizeString(candidate.answerText);

    // Direct synonym lookup
    for (const [key, synonyms] of Object.entries(OFFLINE_SYNONYMS)) {
      const cleanKey = key.replace(/_(es|fr)$/, '');
      const isTargetKey = normalizedTarget === cleanKey || normalizedTarget.includes(cleanKey);
      const isInputSynonym = synonyms.some(
        (syn) => normalizeString(syn) === normalizedInput
      );

      if (isTargetKey && isInputSynonym) {
        return {
          isMatched: true,
          matchedIndex: i,
          matchedAnswer: candidate,
          reasoning: `Matched via synonym dictionary: "${rawInput}" is a synonym for "${candidate.answerText}"`,
        };
      }

      // Check reverse synonym: input is the key, target is a synonym
      const isInputKey = normalizedInput === cleanKey;
      const isTargetSynonym = synonyms.some(
        (syn) => normalizeString(syn) === normalizedTarget
      );
      if (isInputKey && isTargetSynonym) {
        return {
          isMatched: true,
          matchedIndex: i,
          matchedAnswer: candidate,
          reasoning: `Matched via reverse synonym dictionary: "${rawInput}" corresponds to "${candidate.answerText}"`,
        };
      }
    }
  }

  // 2. Check Levenshtein typo tolerance
  let bestMatchIndex: number | null = null;
  let highestSimilarity = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate || typeof candidate.answerText !== 'string') continue;

    const normalizedTarget = normalizeString(candidate.answerText);
    const targetLen = normalizedTarget.length;
    const similarity = calculateSimilarity(normalizedInput, normalizedTarget);
    const distance = calculateLevenshteinDistance(normalizedInput, normalizedTarget);

    let isTypo = false;
    if (targetLen >= 7 && distance <= 2 && similarity >= 0.75) {
      isTypo = true;
    } else if (targetLen >= 4 && targetLen < 7 && distance <= 1 && similarity >= 0.75) {
      isTypo = true;
    }

    if (isTypo && similarity > highestSimilarity) {
      highestSimilarity = similarity;
      bestMatchIndex = i;
    }
  }

  if (bestMatchIndex !== null) {
    const candidate = candidates[bestMatchIndex];
    return {
      isMatched: true,
      matchedIndex: bestMatchIndex,
      matchedAnswer: candidate,
      reasoning: `Approved minor spelling error/typo (similarity: ${Math.round(
        highestSimilarity * 100
      )}%) to "${candidate.answerText}"`,
    };
  }

  return {
    isMatched: false,
    matchedIndex: null,
    matchedAnswer: null,
    reasoning: 'No matching answer found among candidate board answers',
  };
}

