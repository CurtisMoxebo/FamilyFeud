/**
 * Host Speech Synthesis (TTS) Engine Utility
 * Provides safe text-to-speech for Question reading during Fast Money speed rounds,
 * Face-Off duels, team guessing rounds, duplicate warnings, and victory / defeat announcements.
 */

export const TTS_MUTED_STORAGE_KEY = 'family_feud_tts_muted';

/**
 * Checks whether Host TTS output is currently muted in localStorage.
 */
export function isTtsMuted(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    return window.localStorage.getItem(TTS_MUTED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persists the TTS mute preference to localStorage.
 */
export function setTtsMuted(muted: boolean): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(TTS_MUTED_STORAGE_KEY, String(muted));
    }
  } catch {
    // Graceful handling of storage quota or security restrictions
  }
}

/**
 * Toggles the TTS mute preference and returns the updated state.
 */
export function toggleTtsMuted(): boolean {
  const nextState = !isTtsMuted();
  setTtsMuted(nextState);
  return nextState;
}

/**
 * Resolves the best available native SpeechSynthesisVoice for the specified language.
 * Follows priority:
 * - French: fr-FR, fr-CA, then any fr*
 * - Spanish: es-ES, es-MX, es-US, then any es*
 * - English: en-US, en-GB, then any en*
 */
export function getVoiceForLang(language: string = 'EN'): SpeechSynthesisVoice | null {
  if (
    typeof window === 'undefined' ||
    !('speechSynthesis' in window) ||
    typeof window.speechSynthesis.getVoices !== 'function'
  ) {
    return null;
  }

  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) {
      return null;
    }

    const norm = language.toLowerCase();
    let preferredCodes: string[] = [];

    if (norm.startsWith('fr')) {
      preferredCodes = ['fr-fr', 'fr-ca', 'fr'];
    } else if (norm.startsWith('es')) {
      preferredCodes = ['es-es', 'es-mx', 'es-us', 'es'];
    } else {
      preferredCodes = ['en-us', 'en-gb', 'en'];
    }

    for (const code of preferredCodes) {
      const match = voices.find((v) => {
        const langLower = (v.lang || '').toLowerCase().replace('_', '-');
        return langLower === code || langLower.startsWith(code + '-');
      });
      if (match) {
        return match;
      }
    }

    // Fallback: any voice starting with prefix
    const prefix = preferredCodes[preferredCodes.length - 1];
    const fallback = voices.find((v) =>
      (v.lang || '').toLowerCase().replace('_', '-').startsWith(prefix)
    );
    return fallback || null;
  } catch {
    return null;
  }
}

/**
 * Vocalizes text using browser SpeechSynthesis with rate 1.05 and pitch 1.0.
 * Respects mute settings and cancels any active utterance before starting.
 * Safe fallback and non-blocking callback invocation on complete or error.
 */
export function speakQuestion(
  text: string,
  language: string = 'EN',
  onComplete?: () => void
): void {
  if (isTtsMuted()) {
    onComplete?.();
    return;
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('[HOST_TTS:WARN] Speech synthesis is not supported in this browser.');
    onComplete?.();
    return;
  }

  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getVoiceForLang(language);

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      const normalizedLang = language.toUpperCase();
      if (normalizedLang === 'FR') {
        utterance.lang = 'fr-FR';
      } else if (normalizedLang === 'ES') {
        utterance.lang = 'es-ES';
      } else {
        utterance.lang = 'en-US';
      }
    }

    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Retain reference to prevent garbage collection before speech completes in Chromium browsers
    (window as any).__activeSpeechUtterance = utterance;

    utterance.onend = () => {
      (window as any).__activeSpeechUtterance = null;
      onComplete?.();
    };

    utterance.onerror = (error) => {
      (window as any).__activeSpeechUtterance = null;
      console.warn('[HOST_TTS:WARN] Speech utterance encountered an error:', error);
      onComplete?.();
    };

    window.speechSynthesis.speak(utterance);
  } catch (error) {
    // Non-blocking fallback if browser speech synthesis is restricted or unavailable
    console.warn('[HOST_TTS:WARN] Speech synthesis failed or blocked by autoplay policy:', error);
    onComplete?.();
  }
}

/**
 * Alias for speakQuestion conforming to US-17 Technical Specification.
 */
export const speak = speakQuestion;

export function cancelSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      (window as any).__activeSpeechUtterance = null;
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
}

export const DUPLICATE_WARNING_PHRASES: Record<string, string> = {
  EN: 'Already said! Try again!',
  FR: 'Déjà dit ! Réessayez !',
  ES: '¡Ya se dijo! ¡Intenta de nuevo!',
};

export function getDuplicateWarningPhrase(language: string = 'EN'): string {
  const norm = language.toUpperCase();
  return DUPLICATE_WARNING_PHRASES[norm] || DUPLICATE_WARNING_PHRASES.EN;
}

/**
 * Host Speech Synthesis for Fast Money Duplicate Answer Warning (US-09 Scenario 2)
 * Announces localized prompt: "Already said! Try again!" / "Déjà dit ! Réessayez !" / "¡Ya se dijo! ¡Intenta de nuevo!"
 */
export function speakDuplicateAlert(
  language: string = 'EN',
  customText?: string,
  onComplete?: () => void
): void {
  const text = customText || getDuplicateWarningPhrase(language);
  speakQuestion(text, language, onComplete);
}

export const VICTORY_PHRASES: Record<string, string> = {
  EN: '200 points! You won Fast Money!',
  FR: '200 points ! Vous avez gagné le Face-à-Face !',
  ES: '¡200 puntos! ¡Ganaron Dinero Rápido!',
};

export function getVictoryPhrase(language: string = 'EN'): string {
  const norm = language.toUpperCase();
  return VICTORY_PHRASES[norm] || VICTORY_PHRASES.EN;
}

/**
 * Host Speech Synthesis for Fast Money Victory Announcement (US-10 Scenario 2)
 * Announces localized celebration: "200 points! You won Fast Money!"
 */
export function speakVictory(
  language: string = 'EN',
  customText?: string,
  onComplete?: () => void
): void {
  const text = customText || getVictoryPhrase(language);
  speakQuestion(text, language, onComplete);
}

export const DEFEAT_PHRASES: Record<string, (score: number) => string> = {
  EN: (score: number) => `Final score: ${score} points. Game over!`,
  FR: (score: number) => `Score final : ${score} points. Partie terminée !`,
  ES: (score: number) => `Puntuación final: ${score} puntos. ¡Juego terminado!`,
};

export function getDefeatPhrase(language: string = 'EN', finalScore: number = 0): string {
  const norm = language.toUpperCase();
  const formatter = DEFEAT_PHRASES[norm] || DEFEAT_PHRASES.EN;
  return formatter(finalScore);
}

/**
 * Host Speech Synthesis for Fast Money Defeat Announcement (US-10 Scenario 3)
 * Announces localized defeat summary: "Final score: [X] points. Game over!"
 */
export function speakDefeat(
  language: string = 'EN',
  finalScore: number = 0,
  customText?: string,
  onComplete?: () => void
): void {
  const text = customText || getDefeatPhrase(language, finalScore);
  speakQuestion(text, language, onComplete);
}

export const PLAY_OR_PASS_PHRASES: Record<string, { play: (team: string) => string; pass: (team: string) => string }> = {
  EN: {
    play: (team: string) => `${team} will play!`,
    pass: (team: string) => `Control passes to ${team}!`,
  },
  FR: {
    play: (team: string) => `L'${team} va jouer !`,
    pass: (team: string) => `La main passe à l'${team} !`,
  },
  ES: {
    play: (team: string) => `¡${team} jugará!`,
    pass: (team: string) => `¡El control pasa a ${team}!`,
  },
};

export function getPlayOrPassPhrase(
  teamName: string,
  decision: 'play' | 'pass',
  language: string = 'EN'
): string {
  const norm = language.toUpperCase();
  const dict = PLAY_OR_PASS_PHRASES[norm] || PLAY_OR_PASS_PHRASES.EN;
  return dict[decision](teamName);
}

/**
 * Host Speech Synthesis for Main Game Face-Off Pass or Play Decision (US-13 Scenarios 6 & 7)
 * Announces: "Team [X] will play!" or "Control passes to Team [Y]!"
 */
export function speakPlayOrPassDecision(
  teamName: string,
  decision: 'play' | 'pass',
  language: string = 'EN',
  customText?: string,
  onComplete?: () => void
): void {
  const text = customText || getPlayOrPassPhrase(teamName, decision, language);
  speakQuestion(text, language, onComplete);
}

export const ROUND_CLEARED_PHRASES: Record<string, (team: string) => string> = {
  EN: (team: string) => `${team} cleared the board!`,
  FR: (team: string) => `L'${team} a vidé le tableau !`,
  ES: (team: string) => `¡El ${team} despejó el tablero!`,
};

export function speakBoardCleared(
  teamName: string,
  language: string = 'EN',
  onComplete?: () => void
): void {
  const norm = language.toUpperCase();
  const fn = ROUND_CLEARED_PHRASES[norm] || ROUND_CLEARED_PHRASES.EN;
  speakQuestion(fn(teamName), language, onComplete);
}

export const STEAL_PHASE_PHRASES: Record<string, (opposingTeam: string) => string> = {
  EN: (team: string) => `Three strikes! ${team} has a chance to steal!`,
  FR: (team: string) => `Trois fautes ! L'${team} a une chance de voler les points !`,
  ES: (team: string) => `¡Tres fallos! ¡El ${team} tiene la oportunidad de robar!`,
};

export function speakStealPhase(
  opposingTeamName: string,
  language: string = 'EN',
  onComplete?: () => void
): void {
  const norm = language.toUpperCase();
  const fn = STEAL_PHASE_PHRASES[norm] || STEAL_PHASE_PHRASES.EN;
  speakQuestion(fn(opposingTeamName), language, onComplete);
}

export const STEAL_SUCCESS_PHRASES: Record<string, (team: string, points: number) => string> = {
  EN: (team: string, points: number) => `Steal successful! ${team} stole ${points} points!`,
  FR: (team: string, points: number) => `Vol réussi ! L'${team} a volé ${points} points !`,
  ES: (team: string, points: number) => `¡Robo exitoso! ¡El ${team} robó ${points} puntos!`,
};

export function speakStealSuccess(
  teamName: string,
  points: number,
  language: string = 'EN',
  onComplete?: () => void
): void {
  const norm = language.toUpperCase();
  const fn = STEAL_SUCCESS_PHRASES[norm] || STEAL_SUCCESS_PHRASES.EN;
  speakQuestion(fn(teamName, points), language, onComplete);
}

export const STEAL_FAILED_PHRASES: Record<string, (team: string, points: number) => string> = {
  EN: (team: string, points: number) => `Steal failed! ${team} retains ${points} points!`,
  FR: (team: string, points: number) => `Vol échoué ! L'${team} conserve ${points} points !`,
  ES: (team: string, points: number) => `¡Robo fallido! ¡El ${team} retiene ${points} puntos!`,
};

export function speakStealFailed(
  teamName: string,
  points: number,
  language: string = 'EN',
  onComplete?: () => void
): void {
  const norm = language.toUpperCase();
  const fn = STEAL_FAILED_PHRASES[norm] || STEAL_FAILED_PHRASES.EN;
  speakQuestion(fn(teamName, points), language, onComplete);
}

export const ROUND_WINNER_PHRASES: Record<string, (team: string, points: number) => string> = {
  EN: (team: string, points: number) => `${team} wins the round with ${points} points!`,
  FR: (team: string, points: number) => `L'${team} remporte la manche avec ${points} points !`,
  ES: (team: string, points: number) => `¡El ${team} gana la ronda con ${points} puntos!`,
};

export function speakRoundWinner(
  teamName: string,
  points: number,
  language: string = 'EN',
  onComplete?: () => void
): void {
  const norm = language.toUpperCase();
  const fn = ROUND_WINNER_PHRASES[norm] || ROUND_WINNER_PHRASES.EN;
  speakQuestion(fn(teamName, points), language, onComplete);
}

export const YOU_SAID_PHRASES: Record<string, string> = {
  EN: 'You said',
  FR: 'Vous avez dit',
  ES: 'Dijiste',
};

export function speakYouSaid(
  language: string = 'EN',
  onComplete?: () => void
): void {
  const norm = language.toUpperCase();
  const text = YOU_SAID_PHRASES[norm] || YOU_SAID_PHRASES.EN;
  speakQuestion(text, language, onComplete);
}

export const SURVEY_SAID_PHRASES: Record<string, string> = {
  EN: 'Survey said',
  FR: 'Le sondage dit',
  ES: 'La encuesta dice',
};

export function speakSurveySaid(
  language: string = 'EN',
  onComplete?: () => void
): void {
  const norm = language.toUpperCase();
  const text = SURVEY_SAID_PHRASES[norm] || SURVEY_SAID_PHRASES.EN;
  speakQuestion(text, language, onComplete);
}

export const PLAYER_SAID_SURVEY_SAID_PHRASES: Record<string, (player: string, answer: string) => string> = {
  EN: (player: string, answer: string) => `${player} said ${answer}, survey said...`,
  FR: (player: string, answer: string) => `${player} a dit ${answer}, le sondage dit...`,
  ES: (player: string, answer: string) => `${player} dijo ${answer}, la encuesta dice...`,
};

export function getPlayerSaidSurveySaidPhrase(
  player: string,
  answer: string,
  language: string = 'EN'
): string {
  const norm = language.toUpperCase();
  const fn = PLAYER_SAID_SURVEY_SAID_PHRASES[norm] || PLAYER_SAID_SURVEY_SAID_PHRASES.EN;
  return fn(player, answer);
}

/**
 * Host Speech Synthesis for Player Answer Survey Reveal (US-28)
 * Announces: "{Player} said {Answer}, survey said..." then triggers the callback to reveal the card.
 */
export function speakPlayerAnswerSurveySaid(
  player: string,
  answer: string,
  language: string = 'EN',
  onComplete?: () => void
): void {
  const phrase = getPlayerSaidSurveySaidPhrase(player, answer, language);
  speakQuestion(phrase, language, onComplete);
}
