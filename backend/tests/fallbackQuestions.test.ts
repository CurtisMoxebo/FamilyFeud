import { describe, it, expect } from 'vitest';
import {
  FALLBACK_QUESTION_BANK,
  getFallbackQuestions,
  FallbackQuestion,
} from '../src/data/fallbackQuestions';

describe('Backend Regression Suite: Fallback Survey Questions (US-05 Step 1)', () => {
  const languages: ('EN' | 'FR' | 'ES')[] = ['EN', 'FR', 'ES'];

  languages.forEach((lang) => {
    describe(`Language Set: ${lang}`, () => {
      const languageData = FALLBACK_QUESTION_BANK[lang];

      it(`has valid Fast Money sets where each question has answers strictly summing to 100`, () => {
        expect(languageData.fastMoneySets.length).toBeGreaterThanOrEqual(2);

        languageData.fastMoneySets.forEach((set, setIndex) => {
          expect(set).toHaveLength(5);

          set.forEach((q: FallbackQuestion, qIndex: number) => {
            expect(q.questionText.trim().length).toBeGreaterThan(10);
            expect(q.answers.length).toBeGreaterThanOrEqual(4);
            expect(q.answers.length).toBeLessThanOrEqual(8);

            // Verify points sum to exactly 100
            const totalPoints = q.answers.reduce((sum, a) => sum + a.points, 0);
            expect(
              totalPoints,
              `Set ${setIndex} Question ${qIndex} in ${lang} must sum to 100`
            ).toBe(100);

            // Verify points are in descending order
            for (let i = 0; i < q.answers.length - 1; i++) {
              expect(
                q.answers[i].points,
                `Answers must be descending in Set ${setIndex} Q${qIndex}`
              ).toBeGreaterThanOrEqual(q.answers[i + 1].points);
            }

            // Verify non-empty texts and positive points
            q.answers.forEach((ans) => {
              expect(ans.text.trim().length).toBeGreaterThan(0);
              expect(ans.points).toBeGreaterThan(0);
            });
          });
        });
      });

      it(`has valid Main Game questions with 4-8 answers strictly summing to 100`, () => {
        expect(languageData.mainGameQuestions.length).toBeGreaterThanOrEqual(5);

        languageData.mainGameQuestions.forEach((q: FallbackQuestion, qIndex: number) => {
          expect(q.questionText.trim().length).toBeGreaterThan(10);
          expect(q.answers.length).toBeGreaterThanOrEqual(4);
          expect(q.answers.length).toBeLessThanOrEqual(8);

          // Verify points sum to exactly 100
          const totalPoints = q.answers.reduce((sum, a) => sum + a.points, 0);
          expect(
            totalPoints,
            `Main Game Question ${qIndex} in ${lang} must sum to 100`
          ).toBe(100);

          // Verify points are in descending order
          for (let i = 0; i < q.answers.length - 1; i++) {
            expect(
              q.answers[i].points,
              `Answers must be descending in Main Game Q${qIndex}`
            ).toBeGreaterThanOrEqual(q.answers[i + 1].points);
          }

          q.answers.forEach((ans) => {
            expect(ans.text.trim().length).toBeGreaterThan(0);
            expect(ans.points).toBeGreaterThan(0);
          });
        });
      });
    });
  });

  describe('getFallbackQuestions Utility', () => {
    it('returns 5 questions for FAST_MONEY mode', () => {
      const questions = getFallbackQuestions('FAST_MONEY', 'FR', 1);
      expect(questions).toHaveLength(5);
      questions.forEach((q) => {
        const sum = q.answers.reduce((acc, a) => acc + a.points, 0);
        expect(sum).toBe(100);
      });
    });

    it('cycles through Fast Money sets for different round/index values', () => {
      const set1 = getFallbackQuestions('FAST_MONEY', 'EN', 1);
      const set2 = getFallbackQuestions('FAST_MONEY', 'EN', 2);
      expect(set1[0].questionText).not.toBe(set2[0].questionText);
    });

    it('returns 1 question for MAIN_GAME mode corresponding to round', () => {
      const qRound1 = getFallbackQuestions('MAIN_GAME', 'ES', 1);
      const qRound2 = getFallbackQuestions('MAIN_GAME', 'ES', 2);
      expect(qRound1).toHaveLength(1);
      expect(qRound2).toHaveLength(1);
      expect(qRound1[0].questionText).not.toBe(qRound2[0].questionText);
    });

    it('returns a deep copy so mutating results does not corrupt the bank', () => {
      const original = getFallbackQuestions('MAIN_GAME', 'EN', 1);
      const originalQuestion = original[0].questionText;
      original[0].questionText = 'MUTATED';

      const fresh = getFallbackQuestions('MAIN_GAME', 'EN', 1);
      expect(fresh[0].questionText).toBe(originalQuestion);
      expect(fresh[0].questionText).not.toBe('MUTATED');
    });

    it('falls back to English when an unsupported language is provided', () => {
      // @ts-expect-error Testing invalid language fallback
      const questions = getFallbackQuestions('MAIN_GAME', 'UNKNOWN', 1);
      expect(questions).toHaveLength(1);
      expect(questions[0].answers.reduce((s, a) => s + a.points, 0)).toBe(100);
    });
  });
});

