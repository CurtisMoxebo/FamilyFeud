/**
 * Host Speech Synthesis (TTS) Engine Utility
 * Provides safe text-to-speech for Question reading during Fast Money speed rounds,
 * duplicate warnings, and victory / defeat announcements.
 */

export function speakQuestion(text: string, language: string = 'EN'): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const normalizedLang = language.toUpperCase();

    if (normalizedLang === 'FR') {
      utterance.lang = 'fr-FR';
    } else if (normalizedLang === 'ES') {
      utterance.lang = 'es-ES';
    } else {
      utterance.lang = 'en-US';
    }

    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
  } catch (error) {
    // Non-blocking fallback if browser speech synthesis is restricted or unavailable
    console.warn('[HOST_TTS:WARN] Speech synthesis failed or blocked by autoplay policy:', error);
  }
}

export function cancelSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
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
export function speakDuplicateAlert(language: string = 'EN', customText?: string): void {
  const text = customText || getDuplicateWarningPhrase(language);
  speakQuestion(text, language);
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
export function speakVictory(language: string = 'EN', customText?: string): void {
  const text = customText || getVictoryPhrase(language);
  speakQuestion(text, language);
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
export function speakDefeat(language: string = 'EN', finalScore: number = 0, customText?: string): void {
  const text = customText || getDefeatPhrase(language, finalScore);
  speakQuestion(text, language);
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
  customText?: string
): void {
  const text = customText || getPlayOrPassPhrase(teamName, decision, language);
  speakQuestion(text, language);
}
