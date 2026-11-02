import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { speakQuestion, cancelSpeech } from '../src/utils/tts';

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
});

