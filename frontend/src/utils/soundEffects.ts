/**
 * Game Show Sound Effects Synthesizer (US-08, US-09, US-10 & US-18)
 * Synthesizes classic TV game show sound cues (Ding, Chime, Buzzer, Victory Fanfare, Defeat) using the Web Audio API.
 * 100% zero external audio asset dependencies.
 */

let sharedAudioCtx: AudioContext | null = null;
let isSoundMuted = false;
let autoplayListenerRegistered = false;
let cleanupAutoplayListener: (() => void) | null = null;

const STORAGE_KEY_MUTED = 'family_feud_tts_muted';

/**
 * Lazily initializes and caches the singleton Web Audio context.
 * Safely handles browser autoplay policies and SSR environments.
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new AudioContextClass();
    } catch {
      return null;
    }
  }

  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {
      // Browser autoplay policy might restrict resume until user interaction
    });
  }

  if (!autoplayListenerRegistered) {
    cleanupAutoplayListener = registerAutoplayResumeListener();
    autoplayListenerRegistered = true;
  }

  return sharedAudioCtx;
}

/**
 * Resumes the AudioContext explicitly, usually in response to a user gesture.
 */
export async function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }
}

/**
 * Scenario 3: AudioContext Autoplay Policy Handling
 * Attaches passive event listeners on user interactions (click, keydown, touchstart)
 * to resume the AudioContext automatically upon first user gesture.
 */
export function registerAutoplayResumeListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  const resume = () => {
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
  };

  window.addEventListener('click', resume, { passive: true });
  window.addEventListener('keydown', resume, { passive: true });
  window.addEventListener('touchstart', resume, { passive: true });

  return () => {
    window.removeEventListener('click', resume);
    window.removeEventListener('keydown', resume);
    window.removeEventListener('touchstart', resume);
  };
}

/**
 * Resets the cached AudioContext and listener for test isolation.
 */
export function _resetAudioContextForTesting(): void {
  if (cleanupAutoplayListener) {
    cleanupAutoplayListener();
    cleanupAutoplayListener = null;
  }
  sharedAudioCtx = null;
  autoplayListenerRegistered = false;
  isSoundMuted = false;
}

export function setMuted(muted: boolean): void {
  isSoundMuted = muted;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY_MUTED, String(muted));
    } catch {
      // Defensive fallback if localStorage throws in sandboxed iframes
    }
  }
}

export function isMuted(): boolean {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_MUTED);
      if (stored !== null) {
        return stored === 'true';
      }
    } catch {
      // Fallback to in-memory state
    }
  }
  return isSoundMuted;
}

/**
 * US-18 Scenario 1: Correct Answer Ding Playback
 * High-frequency two-tone sine chime (880Hz -> 1320Hz) with < 10ms latency.
 * Plays when a contestant submits a correct answer and the card flips open.
 */
export function playCorrectDing(): void {
  if (isMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // High-frequency two-tone sine chime: 880Hz (A5) -> 1320Hz (E6)
    const tones = [
      { freq: 880, start: now, duration: 0.35, gain: 0.3 },
      { freq: 1320, start: now + 0.08, duration: 0.45, gain: 0.32 },
    ];

    tones.forEach(({ freq, start, duration, gain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gainNode.gain.setValueAtTime(gain, start);
      gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    });
  } catch (err) {
    console.warn('[SFX:WARN] Failed to synthesize Correct Ding sound:', err);
  }
}

/**
 * Backward-compatible alias for playCorrectDing.
 */
export const playDing = playCorrectDing;

/**
 * Scenario 1 & 3: Cheerful Ascending "Points Tally Chime"
 * Plays an ascending three-tone arpeggio (C6 -> E6 -> G6) when points are revealed.
 */
export function playPointsChime(): void {
  if (isMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    // C6 (1046.5 Hz), E6 (1318.5 Hz), G6 (1567.98 Hz)
    const notes = [1046.5, 1318.5, 1567.98];

    notes.forEach((freq, index) => {
      const noteStart = now + index * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteStart);

      gain.gain.setValueAtTime(0.25, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteStart);
      osc.stop(noteStart + 0.35);
    });
  } catch (err) {
    console.warn('[SFX:WARN] Failed to synthesize Points Chime:', err);
  }
}

/**
 * Scenario 2: Low "Buzz / Blip" Strike Sound
 * Plays a short, distinct buzzer for 0 points / unmatched answers.
 */
export function playBuzzerBlip(): void {
  if (isMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Harsh low sawtooth wave (135 Hz)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135, now);
    // Slight pitch drop for classic game show blip
    osc.frequency.linearRampToValueAtTime(90, now + 0.3);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch (err) {
    console.warn('[SFX:WARN] Failed to synthesize Buzzer sound:', err);
  }
}

/**
 * US-18: Game Show Duplicate Answer Alarm (US-09)
 * Rapid warning pulses (440Hz and 330Hz) when a duplicate answer is submitted.
 */
export function playDuplicateAlarm(): void {
  if (isMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    // Two rapid alert pulses: tone 1 (440 Hz) and tone 2 (330 Hz)
    const pulses = [
      { freq: 440, start: now, duration: 0.12 },
      { freq: 330, start: now + 0.14, duration: 0.18 },
    ];

    pulses.forEach(({ freq, start, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.28, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    });
  } catch (err) {
    console.warn('[SFX:WARN] Failed to synthesize Duplicate Warning sound:', err);
  }
}

/**
 * Backward-compatible alias for playDuplicateAlarm.
 */
export const playDuplicateWarning = playDuplicateAlarm;

/**
 * US-18: Game Show Victory Fanfare (US-10)
 * Triumphant C-major arpeggio: C5 -> E5 -> G5 -> C6 with sustaining major chord (E6 + G6).
 */
export function playVictoryFanfare(): void {
  if (isMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const sequence = [
      { freq: 523.25, start: now, duration: 0.12, type: 'triangle' as OscillatorType, gain: 0.25 },
      { freq: 659.25, start: now + 0.12, duration: 0.12, type: 'triangle' as OscillatorType, gain: 0.25 },
      { freq: 783.99, start: now + 0.24, duration: 0.15, type: 'triangle' as OscillatorType, gain: 0.28 },
      { freq: 1046.5, start: now + 0.39, duration: 0.8, type: 'sine' as OscillatorType, gain: 0.3 },
      { freq: 1318.51, start: now + 0.39, duration: 0.8, type: 'sine' as OscillatorType, gain: 0.2 },
      { freq: 1567.98, start: now + 0.39, duration: 0.8, type: 'sine' as OscillatorType, gain: 0.18 },
    ];

    sequence.forEach(({ freq, start, duration, type, gain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);

      gainNode.gain.setValueAtTime(gain, start);
      gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    });
  } catch (err) {
    console.warn('[SFX:WARN] Failed to synthesize Victory Fanfare:', err);
  }
}

/**
 * Scenario 3: Game Show Defeat Sound (US-10)
 * Plays a classic descending sad trombone / wah-wah sequence when contestants fall short of 200 points.
 */
export function playDefeatSound(): void {
  if (isMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [
      { freq: 370.0, start: now, duration: 0.25 },
      { freq: 349.23, start: now + 0.28, duration: 0.25 },
      { freq: 329.63, start: now + 0.56, duration: 0.25 },
      { freq: 311.13, start: now + 0.84, duration: 0.6, dropTo: 246.94 },
    ];

    notes.forEach(({ freq, start, duration, dropTo }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);
      if (dropTo) {
        osc.frequency.linearRampToValueAtTime(dropTo, start + duration);
      }

      gainNode.gain.setValueAtTime(0.22, start);
      gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    });
  } catch (err) {
    console.warn('[SFX:WARN] Failed to synthesize Defeat Sound:', err);
  }
}

/**
 * US-18: Instant Electronic Podium Buzzer (240Hz / 220Hz -> 180Hz)
 * Plays an instantaneous, punchy electronic buzzer cue upon successful buzzer press.
 */
export function playBuzzerHit(): void {
  if (isMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.setValueAtTime(180, now + 0.15);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  } catch (err) {
    console.warn('[SFX:WARN] Failed to synthesize Buzzer Hit sound:', err);
  }
}

/**
 * Backward-compatible alias for playBuzzerHit.
 */
export const playFaceOffBuzzer = playBuzzerHit;

/**
 * US-18 Scenario 2: Strike Buzzer Playback (X, XX, XXX)
 * Low harsh sawtooth tone (130Hz / dual 110Hz & 116Hz).
 * Emits `count` distinct audible buzzes (e.g., 1 for X, 2 for XX, 3 for XXX).
 */
export function playStrikeBuzzer(count: number = 1): void {
  if (isMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const pulseDuration = 0.28;
    const gap = 0.12;
    const safeCount = Math.max(1, Math.min(3, count));

    for (let i = 0; i < safeCount; i++) {
      const pulseStart = now + i * (pulseDuration + gap);

      // Low dual-sawtooth oscillators (110 Hz & 116 Hz) for harsh buzzing effect
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(110, pulseStart);
      osc2.frequency.setValueAtTime(116, pulseStart);

      gain.gain.setValueAtTime(0.35, pulseStart);
      gain.gain.exponentialRampToValueAtTime(0.001, pulseStart + pulseDuration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(pulseStart);
      osc2.start(pulseStart);
      osc1.stop(pulseStart + pulseDuration);
      osc2.stop(pulseStart + pulseDuration);
    }
  } catch (err) {
    console.warn('[SFX:WARN] Failed to synthesize Strike Buzzer sound:', err);
  }
}

export const sfx = {
  playCorrectDing,
  playDing,
  playStrikeBuzzer,
  playBuzzerHit,
  playFaceOffBuzzer,
  playDuplicateAlarm,
  playDuplicateWarning,
  playVictoryFanfare,
  playPointsChime,
  playBuzzerBlip,
  playDefeatSound,
  resumeAudioContext,
  registerAutoplayResumeListener,
  setMuted,
  isMuted,
  getAudioContext,
};

export default sfx;
