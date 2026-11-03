/**
 * Game Show Sound Effects Synthesizer (US-08, US-09, US-10 & US-18)
 * Synthesizes classic TV game show sound cues (Ding, Chime, Buzzer, Victory Fanfare, Defeat) using the Web Audio API.
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

/**
 * Scenario 2: Game Show Victory Fanfare (US-10)
 * Plays a triumphant celebratory brass/synth fanfare when contestants reach >= 200 points.
 * Ascending triumphant sequence: C5 (523.25 Hz) -> E5 (659.25 Hz) -> G5 (783.99 Hz) -> C6 (1046.5 Hz)
 * with a sustaining celebratory major chord (E6 + G6).
 */
export function playVictoryFanfare(): void {
  if (isSoundMuted) return;

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
 * Descending tones: 370 Hz -> 349.23 Hz -> 329.63 Hz -> 311.13 Hz with pitch drop.
 */
export function playDefeatSound(): void {
  if (isSoundMuted) return;

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
 * US-12 Scenario 2: Classic Game Show Face-Off Podium Buzzer
 * Plays an instantaneous, harsh, punchy buzzer cue upon successful buzzer press.
 * Fundamental 220Hz dropping to 180Hz sawtooth with aggressive 0.35s envelope.
 */
export function playFaceOffBuzzer(): void {
  if (isSoundMuted) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(180, now + 0.15);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  } catch (err) {
    console.warn('[SFX:WARN] Failed to synthesize Face-Off Buzzer sound:', err);
  }
}

/**
 * US-14 Scenario 2 & 4: Classic Game Show Strike Buzzer (X, XX, XXX)
 * Synthesizes harsh, punchy dual-sawtooth strike buzzer pulses using Web Audio API.
 * Emits `count` distinct audible buzzes (e.g., 1 for X, 2 for XX, 3 for XXX).
 */
export function playStrikeBuzzer(count: number = 1): void {
  if (isSoundMuted) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const pulseDuration = 0.28;
    const gap = 0.12;
    const safeCount = Math.max(1, Math.min(3, count));

    for (let i = 0; i < safeCount; i++) {
      const pulseStart = now + i * (pulseDuration + gap);

      // Low dual-sawtooth oscillators (110 Hz & 116 Hz)
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
  playFaceOffBuzzer,
  playStrikeBuzzer,
  playDing,
  playPointsChime,
  playBuzzerBlip,
  playDuplicateWarning,
  playVictoryFanfare,
  playDefeatSound,
  setMuted,
  isMuted,
  getAudioContext,
};

export default sfx;
