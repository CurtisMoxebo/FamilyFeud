/**
 * Game Show Sound Effects Synthesizer (US-08 & US-18)
 * Synthesizes classic TV game show sound cues (Ding, Chime, Buzzer) using the Web Audio API.
 * 100% zero external audio asset dependencies.
 */

let sharedAudioCtx: AudioContext | null = null;
let isSoundMuted = false;

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

  return sharedAudioCtx;
}

export function setMuted(muted: boolean): void {
  isSoundMuted = muted;
}

export function isMuted(): boolean {
  return isSoundMuted;
}

/**
 * Scenario 1: Bright Game Show "Ding!"
 * Plays a clean bell chime when contestant answer card flips open.
 * Uses a fundamental tone with harmonic overtone and exponential decay envelope.
 */
export function playDing(): void {
  if (isSoundMuted) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Fundamental Bell Oscillator (1200 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1200, now);

    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.6);

    // Harmonic Shimmer Oscillator (2400 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2400, now);

    gain2.gain.setValueAtTime(0.12, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now);
    osc2.stop(now + 0.4);
  } catch (err) {
    console.warn('[SFX:WARN] Failed to synthesize Ding sound:', err);
  }
}

/**
 * Scenario 1 & 3: Cheerful Ascending "Points Tally Chime"
 * Plays an ascending three-tone arpeggio (C6 -> E6 -> G6) when points are revealed.
 */
export function playPointsChime(): void {
  if (isSoundMuted) return;

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
  if (isSoundMuted) return;

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
 * Scenario 2: Game Show Duplicate Answer Alarm (US-09)
 * Plays a classic alternating two-tone alarm / buzz when a duplicate answer is submitted.
 * Distinct from 0-point single buzzer; warns contestant to give another answer.
 */
export function playDuplicateWarning(): void {
  if (isSoundMuted) return;

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

export const sfx = {
  playDing,
  playPointsChime,
  playBuzzerBlip,
  playDuplicateWarning,
  setMuted,
  isMuted,
  getAudioContext,
};

export default sfx;

