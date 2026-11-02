import { describe, it, expect } from 'vitest';
import {
  normalizeString,
  matchTier1Exact,
  CandidateAnswer,
} from '../src/utils/stringNormalizer';

describe('stringNormalizer (US-06 Tier 1 Validation)', () => {
  describe('normalizeString', () => {
    it('trims leading/trailing whitespace and converts to lowercase', () => {
      expect(normalizeString('  tElEvIsIoN  ')).toBe('television');
      expect(normalizeString('  COUCH  ')).toBe('couch');
    });

    it('collapses multiple spaces into a single space', () => {
      expect(normalizeString('ice    cream')).toBe('ice cream');
      expect(normalizeString('  peanut   butter   jelly  ')).toBe('peanut butter jelly');
    });

    it('strips French diacritics and accents (é, è, ê, ç, î, ô, ë, à)', () => {
      expect(normalizeString('Café')).toBe('cafe');
      expect(normalizeString('Télévision')).toBe('television');
      expect(normalizeString('Hôpital')).toBe('hopital');
      expect(normalizeString('Garçon')).toBe('garcon');
      expect(normalizeString('Noël')).toBe('noel');
      expect(normalizeString('Île')).toBe('ile');
      expect(normalizeString('À bientôt')).toBe('a bientot');
    });

    it('strips Spanish diacritics and accents (ñ, á, é, í, ó, ú, ü)', () => {
      expect(normalizeString('Niño')).toBe('nino');
      expect(normalizeString('Fútbol')).toBe('futbol');
      expect(normalizeString('Pingüino')).toBe('pinguino');
      expect(normalizeString('Canción')).toBe('cancion');
      expect(normalizeString('Árbol')).toBe('arbol');
      expect(normalizeString('Mañana')).toBe('manana');
    });

    it('strips punctuation and special characters while preserving alphanumeric chars', () => {
      expect(normalizeString('Father-in-law!')).toBe('fatherinlaw');
      expect(normalizeString('Rock & Roll?')).toBe('rock roll');
      expect(normalizeString('$100 dollars...')).toBe('100 dollars');
      expect(normalizeString('¿Cómo estás?')).toBe('como estas');
    });

    it('returns empty string for non-string, null, undefined, or empty values', () => {
      expect(normalizeString('')).toBe('');
      expect(normalizeString('   ')).toBe('');
      expect(normalizeString(null)).toBe('');
      expect(normalizeString(undefined)).toBe('');
      expect(normalizeString(12345)).toBe('');
      expect(normalizeString({})).toBe('');
    });
  });

  describe('matchTier1Exact', () => {
    const mockBoardAnswers: CandidateAnswer[] = [
      { id: 'ans-1', answerText: 'Television', points: 35, orderIndex: 1 },
      { id: 'ans-2', answerText: 'Refrigerator', points: 25, orderIndex: 2 },
      { id: 'ans-3', answerText: 'Microwave Oven', points: 20, orderIndex: 3 },
      { id: 'ans-4', answerText: 'Toaster', points: 12, orderIndex: 4 },
      { id: 'ans-5', answerText: 'Blender', points: 8, orderIndex: 5 },
    ];

    it('matches exact string with arbitrary casing and whitespace (< 5ms latency)', () => {
      const startTime = performance.now();
      const result = matchTier1Exact('  tElEvIsIoN  ', mockBoardAnswers);
      const durationMs = performance.now() - startTime;

      expect(result.isMatched).toBe(true);
      expect(result.matchedIndex).toBe(0);
      expect(result.matchedAnswer).toEqual(mockBoardAnswers[0]);
      expect(result.normalizedInput).toBe('television');
      expect(result.normalizedTarget).toBe('television');
      expect(durationMs).toBeLessThan(5); // DoD requirement: < 5ms
    });

    it('matches multi-word answers accurately', () => {
      const result = matchTier1Exact('microwave   oven', mockBoardAnswers);
      expect(result.isMatched).toBe(true);
      expect(result.matchedIndex).toBe(2);
      expect(result.matchedAnswer?.id).toBe('ans-3');
    });

    it('matches French accented board answers when player enters plain letters', () => {
      const frenchAnswers: CandidateAnswer[] = [
        { id: 'fr-1', answerText: 'Café', points: 40 },
        { id: 'fr-2', answerText: 'Hôpital', points: 30 },
      ];

      const resultCafe = matchTier1Exact('cafe', frenchAnswers);
      expect(resultCafe.isMatched).toBe(true);
      expect(resultCafe.matchedIndex).toBe(0);
      expect(resultCafe.matchedAnswer?.id).toBe('fr-1');

      const resultHopital = matchTier1Exact('hopital', frenchAnswers);
      expect(resultHopital.isMatched).toBe(true);
      expect(resultHopital.matchedIndex).toBe(1);
    });

    it('matches Spanish accented answers regardless of accent presence', () => {
      const spanishAnswers: CandidateAnswer[] = [
        { id: 'es-1', answerText: 'Niño', points: 45 },
        { id: 'es-2', answerText: 'Fútbol', points: 35 },
      ];

      const resultNino = matchTier1Exact('nino', spanishAnswers);
      expect(resultNino.isMatched).toBe(true);
      expect(resultNino.matchedIndex).toBe(0);

      const resultFutbolAccented = matchTier1Exact('FÚTBOL', spanishAnswers);
      expect(resultFutbolAccented.isMatched).toBe(true);
      expect(resultFutbolAccented.matchedIndex).toBe(1);
    });

    it('returns isMatched=false for unmatched answers (delegating to Tier 2)', () => {
      const result = matchTier1Exact('refrigirater', mockBoardAnswers); // typo -> fails Tier 1
      expect(result.isMatched).toBe(false);
      expect(result.matchedIndex).toBeNull();
      expect(result.matchedAnswer).toBeNull();
      expect(result.normalizedInput).toBe('refrigirater');
    });

    it('returns isMatched=false for completely unrelated submissions', () => {
      const result = matchTier1Exact('Submarine', mockBoardAnswers);
      expect(result.isMatched).toBe(false);
      expect(result.matchedIndex).toBeNull();
      expect(result.matchedAnswer).toBeNull();
    });

    it('handles empty candidates or invalid inputs gracefully', () => {
      expect(matchTier1Exact('', mockBoardAnswers).isMatched).toBe(false);
      expect(matchTier1Exact(null, mockBoardAnswers).isMatched).toBe(false);
      expect(matchTier1Exact('Television', []).isMatched).toBe(false);
      expect(matchTier1Exact('Television', [null as unknown as CandidateAnswer]).isMatched).toBe(false);
    });

    it('executes 1,000 matches in under 20ms total (<0.02ms average)', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        matchTier1Exact('television', mockBoardAnswers);
      }
      const totalDuration = performance.now() - start;
      expect(totalDuration).toBeLessThan(20);
    });
  });
});

