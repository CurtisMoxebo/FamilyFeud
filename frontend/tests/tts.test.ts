import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  speakQuestion,
  speak,
  cancelSpeech,
  getVoiceForLang,
  isTtsMuted,
  setTtsMuted,
  toggleTtsMuted,
  TTS_MUTED_STORAGE_KEY,
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
  speakBoardCleared,
  ROUND_CLEARED_PHRASES,
  speakStealPhase,
  STEAL_PHASE_PHRASES,
  speakStealSuccess,
  STEAL_SUCCESS_PHRASES,
  speakStealFailed,
  STEAL_FAILED_PHRASES,
} from '../src/utils/tts';

describe('Frontend Utility Suite: Host Speech Synthesis (tts.ts)', () => {
  let mockSpeak: any;
  let mockCancel: any;
  let mockGetVoices: any;

  beforeEach(() => {
    localStorage.clear();
    mockSpeak = vi.fn();
    mockCancel = vi.fn();
    mockGetVoices = vi.fn().mockReturnValue([]);

    // Mock window.speechSynthesis
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: mockSpeak,
        cancel: mockCancel,
        getVoices: mockGetVoices,
      },
      writable: true,
      configurable: true,
    });

    // Mock SpeechSynthesisUtterance if not defined in jsdom
    (globalThis as any).SpeechSynthesisUtterance = class {
      text: string;
      lang: string = 'en-US';
      rate: number = 1.0;
      pitch: number = 1.0;
      voice: any = null;
      onend: (() => void) | null = null;
      onerror: ((error: any) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('Mute Management & Persistence (isTtsMuted, setTtsMuted, toggleTtsMuted)', () => {
    it('defaults to unmuted (false)', () => {
      expect(isTtsMuted()).toBe(false);
    });

    it('sets and persists mute state in localStorage', () => {
      setTtsMuted(true);
      expect(localStorage.getItem(TTS_MUTED_STORAGE_KEY)).toBe('true');
      expect(isTtsMuted()).toBe(true);

      setTtsMuted(false);
      expect(localStorage.getItem(TTS_MUTED_STORAGE_KEY)).toBe('false');
      expect(isTtsMuted()).toBe(false);
    });

    it('toggles mute state and returns the new value', () => {
      expect(toggleTtsMuted()).toBe(true);
      expect(isTtsMuted()).toBe(true);

      expect(toggleTtsMuted()).toBe(false);
      expect(isTtsMuted()).toBe(false);
    });

    it('handles localStorage exceptions gracefully without crashing', () => {
      const originalGetItem = localStorage.getItem;
      const originalSetItem = localStorage.setItem;

      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError: Access Denied');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(isTtsMuted()).toBe(false);
      expect(() => setTtsMuted(true)).not.toThrow();

      Storage.prototype.getItem = originalGetItem;
      Storage.prototype.setItem = originalSetItem;
    });

    it('handles undefined localStorage gracefully without throwing', () => {
      const orig = window.localStorage;
      // @ts-ignore
      delete window.localStorage;

      expect(isTtsMuted()).toBe(false);
      expect(() => setTtsMuted(true)).not.toThrow();

      Object.defineProperty(window, 'localStorage', {
        value: orig,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('Voice Resolution (getVoiceForLang)', () => {
    it('returns null if window or speechSynthesis is missing or getVoices is undefined', () => {
      const orig = window.speechSynthesis;
      // @ts-ignore
      delete window.speechSynthesis;
      expect(getVoiceForLang('EN')).toBeNull();

      Object.defineProperty(window, 'speechSynthesis', {
        value: orig,
        writable: true,
        configurable: true,
      });
    });

    it('returns null if getVoices returns empty list', () => {
      mockGetVoices.mockReturnValue([]);
      expect(getVoiceForLang('FR')).toBeNull();
    });

    it('resolves French voices in order of preference (fr-FR > fr-CA > fr-*)', () => {
      const vFrFr = { name: 'Google Français', lang: 'fr-FR' };
      const vFrCa = { name: 'Amélie', lang: 'fr-CA' };
      const vFrBe = { name: 'Belgian French', lang: 'fr-BE' };

      mockGetVoices.mockReturnValue([vFrBe, vFrCa, vFrFr]);
      expect(getVoiceForLang('FR')).toBe(vFrFr);

      mockGetVoices.mockReturnValue([vFrBe, vFrCa]);
      expect(getVoiceForLang('fr')).toBe(vFrCa);

      mockGetVoices.mockReturnValue([vFrBe]);
      expect(getVoiceForLang('fr-FR')).toBe(vFrBe);
    });

    it('resolves Spanish voices in order of preference (es-ES > es-MX > es-US > es-*)', () => {
      const vEsEs = { name: 'Jorge', lang: 'es-ES' };
      const vEsMx = { name: 'Paulina', lang: 'es-MX' };
      const vEsUs = { name: 'Diego', lang: 'es-US' };
      const vEsAr = { name: 'Mateo', lang: 'es-AR' };

      mockGetVoices.mockReturnValue([vEsAr, vEsUs, vEsMx, vEsEs]);
      expect(getVoiceForLang('ES')).toBe(vEsEs);

      mockGetVoices.mockReturnValue([vEsAr, vEsUs, vEsMx]);
      expect(getVoiceForLang('es')).toBe(vEsMx);

      mockGetVoices.mockReturnValue([vEsAr, vEsUs]);
      expect(getVoiceForLang('es-US')).toBe(vEsUs);

      mockGetVoices.mockReturnValue([vEsAr]);
      expect(getVoiceForLang('ES')).toBe(vEsAr);
    });

    it('resolves English voices in order of preference (en-US > en-GB > en-*)', () => {
      const vEnUs = { name: 'Samantha', lang: 'en-US' };
      const vEnGb = { name: 'Daniel', lang: 'en-GB' };
      const vEnAu = { name: 'Karen', lang: 'en-AU' };

      mockGetVoices.mockReturnValue([vEnAu, vEnGb, vEnUs]);
      expect(getVoiceForLang('EN')).toBe(vEnUs);

      mockGetVoices.mockReturnValue([vEnAu, vEnGb]);
      expect(getVoiceForLang('en')).toBe(vEnGb);

      mockGetVoices.mockReturnValue([vEnAu]);
      expect(getVoiceForLang('en-US')).toBe(vEnAu);
    });

    it('returns null when no voices match the target language prefix', () => {
      mockGetVoices.mockReturnValue([
        { name: 'Keiko', lang: 'ja-JP' },
        { name: 'Anna', lang: 'de-DE' },
      ]);
      expect(getVoiceForLang('FR')).toBeNull();
    });

    it('returns null if getVoices throws an error', () => {
      mockGetVoices.mockImplementationOnce(() => {
        throw new Error('Speech synthesis error');
      });
      expect(getVoiceForLang('EN')).toBeNull();
    });
  });

  describe('speakQuestion and speak alias', () => {
    it('cancels ongoing speech and speaks English text with rate 1.05 and pitch 1.0 by default', () => {
      speakQuestion('Name a yellow fruit');

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Name a yellow fruit');
      expect(utterance.lang).toBe('en-US');
      expect(utterance.rate).toBe(1.05);
      expect(utterance.pitch).toBe(1.0);
    });

    it('speak is an alias to speakQuestion', () => {
      expect(speak).toBe(speakQuestion);
      speak('Speak alias test', 'EN');
      expect(mockSpeak).toHaveBeenCalledTimes(1);
    });

    it('assigns resolved voice to utterance if available', () => {
      const mockVoice = { name: 'Google Français', lang: 'fr-FR' };
      mockGetVoices.mockReturnValue([mockVoice]);

      speakQuestion('Nommez un animal', 'FR');

      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.voice).toBe(mockVoice);
      expect(utterance.lang).toBe('fr-FR');
    });

    it('configures French locale when language is FR and no voice matched', () => {
      mockGetVoices.mockReturnValue([]);
      speakQuestion('Nommez un fruit jaune', 'FR');

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Nommez un fruit jaune');
      expect(utterance.lang).toBe('fr-FR');
    });

    it('configures Spanish locale when language is ES and no voice matched', () => {
      mockGetVoices.mockReturnValue([]);
      speakQuestion('Menciona una fruta amarilla', 'ES');

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Menciona una fruta amarilla');
      expect(utterance.lang).toBe('es-ES');
    });

    it('executes onComplete immediately and skips speaking when muted', () => {
      setTtsMuted(true);
      const onComplete = vi.fn();

      speakQuestion('Muted question', 'EN', onComplete);

      expect(mockSpeak).not.toHaveBeenCalled();
      expect(mockCancel).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('fires onComplete callback when utterance.onend is triggered', () => {
      const onComplete = vi.fn();
      speakQuestion('Hello World', 'EN', onComplete);

      const utterance = mockSpeak.mock.calls[0][0];
      expect(onComplete).not.toHaveBeenCalled();

      // Trigger onend
      utterance.onend();
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('fires onComplete callback and warns when utterance.onerror is triggered', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const onComplete = vi.fn();
      speakQuestion('Hello Error', 'EN', onComplete);

      const utterance = mockSpeak.mock.calls[0][0];
      expect(onComplete).not.toHaveBeenCalled();

      // Trigger onerror
      utterance.onerror(new Error('Audio interrupted'));
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HOST_TTS:WARN] Speech utterance encountered an error:'),
        expect.any(Error)
      );
    });

    it('cancelSpeech cancels active speech safely', () => {
      cancelSpeech();
      expect(mockCancel).toHaveBeenCalledTimes(1);
    });

    it('handles missing window.speechSynthesis gracefully, warns, and triggers onComplete', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const originalSpeechSynthesis = window.speechSynthesis;
      // @ts-ignore
      delete window.speechSynthesis;

      const onComplete = vi.fn();
      expect(() => speakQuestion('Test without speech support', 'EN', onComplete)).not.toThrow();
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HOST_TTS:WARN] Speech synthesis is not supported in this browser.')
      );

      expect(() => cancelSpeech()).not.toThrow();

      // Restore
      Object.defineProperty(window, 'speechSynthesis', {
        value: originalSpeechSynthesis,
        writable: true,
        configurable: true,
      });
    });

    it('catches and logs warning if speech synthesis throws an error, invoking onComplete', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSpeak.mockImplementationOnce(() => {
        throw new Error('Autoplay restriction');
      });

      const onComplete = vi.fn();
      expect(() => speakQuestion('Error trigger', 'EN', onComplete)).not.toThrow();
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HOST_TTS:WARN] Speech synthesis failed or blocked by autoplay policy:'),
        expect.any(Error)
      );
    });
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

    it('allows speaking custom duplicate warning text and forwards onComplete', () => {
      const onComplete = vi.fn();
      speakDuplicateAlert('EN', 'Custom warning!', onComplete);

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('Custom warning!');

      utterance.onend();
      expect(onComplete).toHaveBeenCalledTimes(1);
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

    it('forwards onComplete callback on victory announcement', () => {
      const onComplete = vi.fn();
      speakVictory('EN', undefined, onComplete);
      const utterance = mockSpeak.mock.calls[0][0];
      utterance.onend();
      expect(onComplete).toHaveBeenCalledTimes(1);
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

    it('forwards onComplete callback on defeat announcement', () => {
      const onComplete = vi.fn();
      speakDefeat('EN', 150, undefined, onComplete);
      const utterance = mockSpeak.mock.calls[0][0];
      utterance.onend();
      expect(onComplete).toHaveBeenCalledTimes(1);
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

    it('speaks customText when provided and triggers onComplete', () => {
      const onComplete = vi.fn();
      speakPlayOrPassDecision('Team 1', 'play', 'EN', 'Custom Announcement!', onComplete);
      expect(mockSpeak.mock.calls[0][0].text).toBe('Custom Announcement!');
      mockSpeak.mock.calls[0][0].onend();
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('getPlayOrPassPhrase falls back to English for unknown locales', () => {
      expect(getPlayOrPassPhrase('Team A', 'play', 'JA')).toBe('Team A will play!');
      expect(getPlayOrPassPhrase('Team B', 'pass', 'JA')).toBe('Control passes to Team B!');
    });

    it('provides PLAY_OR_PASS_PHRASES mapping directly', () => {
      expect(PLAY_OR_PASS_PHRASES.EN.play('Team 1')).toBe('Team 1 will play!');
      expect(PLAY_OR_PASS_PHRASES.EN.pass('Team 2')).toBe('Control passes to Team 2!');
      expect(PLAY_OR_PASS_PHRASES.FR.play('Équipe 1')).toBe("L'Équipe 1 va jouer !");
      expect(PLAY_OR_PASS_PHRASES.ES.play('Equipo 1')).toBe('¡Equipo 1 jugará!');
    });
  });

  describe('US-14: speakBoardCleared & speakStealPhase', () => {
    it('speaks board cleared announcements across EN, FR, and ES with onComplete', () => {
      const onComplete = vi.fn();
      speakBoardCleared('Team 1', 'EN', onComplete);
      expect(mockSpeak.mock.calls[0][0].text).toBe('Team 1 cleared the board!');
      expect(mockSpeak.mock.calls[0][0].lang).toBe('en-US');
      mockSpeak.mock.calls[0][0].onend();
      expect(onComplete).toHaveBeenCalledTimes(1);

      mockSpeak.mockClear();
      speakBoardCleared('Équipe 1', 'FR');
      expect(mockSpeak.mock.calls[0][0].text).toBe("L'Équipe 1 a vidé le tableau !");
      expect(mockSpeak.mock.calls[0][0].lang).toBe('fr-FR');

      mockSpeak.mockClear();
      speakBoardCleared('Equipo 1', 'ES');
      expect(mockSpeak.mock.calls[0][0].text).toBe('¡El Equipo 1 despejó el tablero!');
      expect(mockSpeak.mock.calls[0][0].lang).toBe('es-ES');
    });

    it('speaks steal phase announcements across EN, FR, and ES with onComplete', () => {
      const onComplete = vi.fn();
      speakStealPhase('Team 2', 'EN', onComplete);
      expect(mockSpeak.mock.calls[0][0].text).toBe('Three strikes! Team 2 has a chance to steal!');
      mockSpeak.mock.calls[0][0].onend();
      expect(onComplete).toHaveBeenCalledTimes(1);

      mockSpeak.mockClear();
      speakStealPhase('Équipe 2', 'FR');
      expect(mockSpeak.mock.calls[0][0].text).toBe("Trois fautes ! L'Équipe 2 a une chance de voler les points !");

      mockSpeak.mockClear();
      speakStealPhase('Equipo 2', 'ES');
      expect(mockSpeak.mock.calls[0][0].text).toBe('¡Tres fallos! ¡El Equipo 2 tiene la oportunidad de robar!');
    });

    it('speaks steal success and steal failed announcements with onComplete', () => {
      const onCompleteSuccess = vi.fn();
      speakStealSuccess('Team 2', 45, 'EN', onCompleteSuccess);
      expect(mockSpeak.mock.calls[0][0].text).toBe('Steal successful! Team 2 stole 45 points!');
      mockSpeak.mock.calls[0][0].onend();
      expect(onCompleteSuccess).toHaveBeenCalledTimes(1);

      mockSpeak.mockClear();
      speakStealSuccess('Équipe 2', 45, 'FR');
      expect(mockSpeak.mock.calls[0][0].text).toBe("Vol réussi ! L'Équipe 2 a volé 45 points !");

      mockSpeak.mockClear();
      speakStealSuccess('Equipo 2', 45, 'ES');
      expect(mockSpeak.mock.calls[0][0].text).toBe('¡Robo exitoso! ¡El Equipo 2 robó 45 puntos!');

      const onCompleteFailed = vi.fn();
      mockSpeak.mockClear();
      speakStealFailed('Team 1', 45, 'EN', onCompleteFailed);
      expect(mockSpeak.mock.calls[0][0].text).toBe('Steal failed! Team 1 retains 45 points!');
      mockSpeak.mock.calls[0][0].onend();
      expect(onCompleteFailed).toHaveBeenCalledTimes(1);

      mockSpeak.mockClear();
      speakStealFailed('Équipe 1', 45, 'FR');
      expect(mockSpeak.mock.calls[0][0].text).toBe("Vol échoué ! L'Équipe 1 conserve 45 points !");

      mockSpeak.mockClear();
      speakStealFailed('Equipo 1', 45, 'ES');
      expect(mockSpeak.mock.calls[0][0].text).toBe('¡Robo fallido! ¡El Equipo 1 retiene 45 puntos!');
    });

    it('provides ROUND_CLEARED_PHRASES, STEAL_PHASE_PHRASES, STEAL_SUCCESS_PHRASES, and STEAL_FAILED_PHRASES mappings directly', () => {
      expect(ROUND_CLEARED_PHRASES.EN('Team 1')).toBe('Team 1 cleared the board!');
      expect(ROUND_CLEARED_PHRASES.FR('Équipe 1')).toBe("L'Équipe 1 a vidé le tableau !");
      expect(ROUND_CLEARED_PHRASES.ES('Equipo 1')).toBe('¡El Equipo 1 despejó el tablero!');

      expect(STEAL_PHASE_PHRASES.EN('Team 2')).toBe('Three strikes! Team 2 has a chance to steal!');
      expect(STEAL_PHASE_PHRASES.FR('Équipe 2')).toBe("Trois fautes ! L'Équipe 2 a une chance de voler les points !");
      expect(STEAL_PHASE_PHRASES.ES('Equipo 2')).toBe('¡Tres fallos! ¡El Equipo 2 tiene la oportunidad de robar!');

      expect(STEAL_SUCCESS_PHRASES.EN('Team 2', 50)).toBe('Steal successful! Team 2 stole 50 points!');
      expect(STEAL_SUCCESS_PHRASES.FR('Équipe 2', 50)).toBe("Vol réussi ! L'Équipe 2 a volé 50 points !");
      expect(STEAL_SUCCESS_PHRASES.ES('Equipo 2', 50)).toBe('¡Robo exitoso! ¡El Equipo 2 robó 50 puntos!');

      expect(STEAL_FAILED_PHRASES.EN('Team 1', 50)).toBe('Steal failed! Team 1 retains 50 points!');
      expect(STEAL_FAILED_PHRASES.FR('Équipe 1', 50)).toBe("Vol échoué ! L'Équipe 1 conserve 50 points !");
      expect(STEAL_FAILED_PHRASES.ES('Equipo 1', 50)).toBe('¡Robo fallido! ¡El Equipo 1 retiene 50 puntos!');
    });
  });
});
