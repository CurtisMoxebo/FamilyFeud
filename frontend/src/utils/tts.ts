/**
 * Host Speech Synthesis (TTS) Engine Utility
 * Provides safe text-to-speech for Question reading during Fast Money speed rounds.
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

