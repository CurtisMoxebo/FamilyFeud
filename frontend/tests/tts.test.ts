import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  speakQuestion,
  cancelSpeech,
  speakDuplicateAlert,
  getDuplicateWarningPhrase,
  DUPLICATE_WARNING_PHRASES,
  speakVictory,
  getVictoryPhrase,
  VICTORY_PHRASES,
  speakDefeat,
  getDefeatPhrase,
  DEFEAT_PHRASES,
  speakPlayOrPassDecision,
  getPlayOrPassPhrase,
  PLAY_OR_PASS_PHRASES,
} from '../src/utils/tts';

describe('Frontend Utility Suite: Host Speech Synthesis (tts.ts)', () => {
  let mockSpeak: any;
  let mockCancel: any;

  beforeEach(() => {
    mockSpeak = vi.fn();
    mockCancel = vi.fn();

    // Mock window.speechSynthesis
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: mockSpeak,
        cancel: mockCancel,
      },
      writable: true,
      configurable: true,
    });

    // Mock SpeechSynthesisUtterance if not defined in jsdom
    if (typeof (globalThis as any).SpeechSynthesisUtterance === 'undefined') {
      (globalThis as any).SpeechSynthesisUtterance = class {
        text: string;
        lang: string = 'en-US';
        rate: number = 1.0;
        pitch: number = 1.0;
        constructor(text: string) {
          this.text = text;
        }
      };
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cancels any ongoing speech and speaks English text by default', () => {
    speakQuestion('Name a yellow fruit');

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const utterance = mockSpeak.mock.calls[0][0];
    expect(utterance.text).toBe('Name a yellow fruit');
    expect(utterance.lang).toBe('en-US');
  });

  it('configures French locale when language is FR', () => {
    speakQuestion('Nommez un fruit jaune', 'FR');

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const utterance = mockSpeak.mock.calls[0][0];
    expect(utterance.text).toBe('Nommez un fruit jaune');
    expect(utterance.lang).toBe('fr-FR');
  });

  it('configures Spanish locale when language is ES', () => {
    speakQuestion('Menciona una fruta amarilla', 'ES');

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const utterance = mockSpeak.mock.calls[0][0];
    expect(utterance.text).toBe('Menciona una fruta amarilla');
    expect(utterance.lang).toBe('es-ES');
  });

  it('cancelSpeech cancels active speech safely', () => {
    cancelSpeech();
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it('handles missing window.speechSynthesis gracefully without throwing', () => {
    const originalSpeechSynthesis = window.speechSynthesis;
    // @ts-ignore
    delete window.speechSynthesis;

    expect(() => speakQuestion('Test without speech support')).not.toThrow();
    expect(() => cancelSpeech()).not.toThrow();

    // Restore
    Object.defineProperty(window, 'speechSynthesis', {
      value: originalSpeechSynthesis,
      writable: true,
      configurable: true,
    });
  });

  it('catches and logs warning if speech synthesis throws an error', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSpeak.mockImplementationOnce(() => {
      throw new Error('Autoplay restriction');
    });

    expect(() => speakQuestion('Error trigger')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[HOST_TTS:WARN]'),
      expect.any(Error)
    );
  });

  describe('speakDuplicateAlert (US-09 Scenario 2)', () => {
    it('speaks English duplicate warning by default', () => {
      speakDuplicateAlert();

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Already said! Try again!');
      expect(utterance.lang).toBe('en-US');
    });

    it('speaks French duplicate warning when language is FR', () => {
      speakDuplicateAlert('FR');

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Déjà dit ! Réessayez !');
      expect(utterance.lang).toBe('fr-FR');
    });

    it('speaks Spanish duplicate warning when language is ES', () => {
      speakDuplicateAlert('ES');

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('¡Ya se dijo! ¡Intenta de nuevo!');
      expect(utterance.lang).toBe('es-ES');
    });

    it('allows speaking custom duplicate warning text', () => {
      speakDuplicateAlert('EN', 'Custom warning!');

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Custom warning!');
    });

    it('getDuplicateWarningPhrase returns localized phrases and English fallback', () => {
      expect(DUPLICATE_WARNING_PHRASES.EN).toBe('Already said! Try again!');
      expect(getDuplicateWarningPhrase('EN')).toBe('Already said! Try again!');
      expect(getDuplicateWarningPhrase('FR')).toBe('Déjà dit ! Réessayez !');
      expect(getDuplicateWarningPhrase('ES')).toBe('¡Ya se dijo! ¡Intenta de nuevo!');
      expect(getDuplicateWarningPhrase('DE')).toBe('Already said! Try again!');
    });
  });

  describe('speakVictory (US-10 Scenario 2)', () => {
    it('speaks English victory announcement by default', () => {
      speakVictory();

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('200 points! You won Fast Money!');
      expect(utterance.lang).toBe('en-US');
    });

    it('speaks French victory announcement when language is FR', () => {
      speakVictory('FR');

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('200 points ! Vous avez gagné le Face-à-Face !');
      expect(utterance.lang).toBe('fr-FR');
    });

    it('speaks Spanish victory announcement when language is ES', () => {
      speakVictory('ES');

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('¡200 puntos! ¡Ganaron Dinero Rápido!');
      expect(utterance.lang).toBe('es-ES');
    });

    it('getVictoryPhrase returns localized victory phrases and English fallback', () => {
      expect(VICTORY_PHRASES.EN).toBe('200 points! You won Fast Money!');
      expect(getVictoryPhrase('EN')).toBe('200 points! You won Fast Money!');
      expect(getVictoryPhrase('FR')).toBe('200 points ! Vous avez gagné le Face-à-Face !');
      expect(getVictoryPhrase('ES')).toBe('¡200 puntos! ¡Ganaron Dinero Rápido!');
      expect(getVictoryPhrase('IT')).toBe('200 points! You won Fast Money!');
    });
  });

  describe('speakDefeat (US-10 Scenario 3)', () => {
    it('speaks English defeat announcement with final score', () => {
      speakDefeat('EN', 145);

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Final score: 145 points. Game over!');
      expect(utterance.lang).toBe('en-US');
    });

    it('speaks French defeat announcement with final score', () => {
      speakDefeat('FR', 180);

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Score final : 180 points. Partie terminée !');
      expect(utterance.lang).toBe('fr-FR');
    });

    it('speaks Spanish defeat announcement with final score', () => {
      speakDefeat('ES', 160);

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Puntuación final: 160 puntos. ¡Juego terminado!');
      expect(utterance.lang).toBe('es-ES');
    });

    it('getDefeatPhrase returns localized defeat phrases with score formatting', () => {
      expect(DEFEAT_PHRASES.EN(120)).toBe('Final score: 120 points. Game over!');
      expect(getDefeatPhrase('EN', 120)).toBe('Final score: 120 points. Game over!');
      expect(getDefeatPhrase('FR', 120)).toBe('Score final : 120 points. Partie terminée !');
      expect(getDefeatPhrase('ES', 120)).toBe('Puntuación final: 120 puntos. ¡Juego terminado!');
      expect(getDefeatPhrase('DE', 120)).toBe('Final score: 120 points. Game over!');
    });
  });

  describe('speakPlayOrPassDecision (US-13 Scenarios 6 & 7)', () => {
    it('speaks English play decision', () => {
      speakPlayOrPassDecision('Team 1', 'play', 'EN');
      expect(mockCancel).toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalled();
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Team 1 will play!');
      expect(utterance.lang).toBe('en-US');
    });

    it('speaks English pass decision', () => {
      speakPlayOrPassDecision('Team 2', 'pass', 'EN');
      expect(mockCancel).toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalled();
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Control passes to Team 2!');
      expect(utterance.lang).toBe('en-US');
    });

    it('speaks French play and pass decisions', () => {
      speakPlayOrPassDecision('Équipe 1', 'play', 'FR');
      expect(mockSpeak.mock.calls[0][0].text).toBe("L'Équipe 1 va jouer !");
      expect(mockSpeak.mock.calls[0][0].lang).toBe('fr-FR');

      mockSpeak.mockClear();
      speakPlayOrPassDecision('Équipe 2', 'pass', 'FR');
      expect(mockSpeak.mock.calls[0][0].text).toBe("La main passe à l'Équipe 2 !");
    });

    it('speaks Spanish play and pass decisions', () => {
      speakPlayOrPassDecision('Equipo 1', 'play', 'ES');
      expect(mockSpeak.mock.calls[0][0].text).toBe('¡Equipo 1 jugará!');
      expect(mockSpeak.mock.calls[0][0].lang).toBe('es-ES');

      mockSpeak.mockClear();
      speakPlayOrPassDecision('Equipo 2', 'pass', 'ES');
      expect(mockSpeak.mock.calls[0][0].text).toBe('¡El control pasa a Equipo 2!');
    });

    it('speaks customText when provided', () => {
      speakPlayOrPassDecision('Team 1', 'play', 'EN', 'Custom Announcement!');
      expect(mockSpeak.mock.calls[0][0].text).toBe('Custom Announcement!');
    });

    it('getPlayOrPassPhrase falls back to English for unknown locales', () => {
      expect(getPlayOrPassPhrase('Team A', 'play', 'JA')).toBe('Team A will play!');
      expect(getPlayOrPassPhrase('Team B', 'pass', 'JA')).toBe('Control passes to Team B!');
    });
  });
});
