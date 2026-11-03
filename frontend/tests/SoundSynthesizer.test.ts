import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as SoundSynthesizer from '../src/utils/SoundSynthesizer';
import { _resetAudioContextForTesting } from '../src/utils/soundEffects';

describe('US-18: Real-Time Game Show Sound Effects Synthesizer Acceptance Suite', () => {
  let createdOscillators: MockOscillator[] = [];
  let createdGains: MockGain[] = [];

  class MockOscillator {
    type: OscillatorType = 'sine';
    frequency = {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    };
    connect = vi.fn();
    start = vi.fn();
    stop = vi.fn();

    constructor() {
      createdOscillators.push(this);
    }
  }

  class MockGain {
    gain = {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
    connect = vi.fn();

    constructor() {
      createdGains.push(this);
    }
  }

  class MockAudioContext {
    currentTime = 0;
    state: AudioContextState = 'running';
    destination = {};
    createOscillator = vi.fn(() => new MockOscillator());
    createGain = vi.fn(() => new MockGain());
    resume = vi.fn().mockResolvedValue(undefined);
  }

  beforeEach(() => {
    _resetAudioContextForTesting();
    createdOscillators = [];
    createdGains = [];
    localStorage.clear();
    SoundSynthesizer.setMuted(false);

    Object.defineProperty(window, 'AudioContext', {
      value: MockAudioContext,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    _resetAudioContextForTesting();
    vi.restoreAllMocks();
  });

  describe('Scenario 1: Correct Answer Ding Playback', () => {
    it('executes playCorrectDing with < 10ms execution latency and pure sine wave synthesis', () => {
      const startTime = performance.now();
      SoundSynthesizer.playCorrectDing();
      const executionDuration = performance.now() - startTime;

      // Acceptance criteria: < 10ms execution latency
      expect(executionDuration).toBeLessThan(10);

      // Verify two-tone chime: 880 Hz (A5) -> 1320 Hz (E6)
      expect(createdOscillators).toHaveLength(2);
      expect(createdGains).toHaveLength(2);

      // Tone 1: 880 Hz
      expect(createdOscillators[0].type).toBe('sine');
      expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(880, 0);
      expect(createdOscillators[0].start).toHaveBeenCalledWith(0);
      expect(createdOscillators[0].stop).toHaveBeenCalledWith(0.35);

      // Tone 2: 1320 Hz
      expect(createdOscillators[1].type).toBe('sine');
      expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(1320, 0.08);
      expect(createdOscillators[1].start).toHaveBeenCalledWith(0.08);
      expect(createdOscillators[1].stop).toHaveBeenCalledWith(0.53);

      // Exponential decay envelope
      expect(createdGains[0].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, 0.35);
      expect(createdGains[1].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, 0.53);
    });
  });

  describe('Scenario 2: Strike Buzzer Playback (X, XX, XXX)', () => {
    it('synthesizes harsh, low-frequency dual-sawtooth buzz on strike 1 (X)', () => {
      SoundSynthesizer.playStrikeBuzzer(1);

      // 2 detuned sawtooth oscillators (110 Hz and 116 Hz) through 1 gain envelope
      expect(createdOscillators).toHaveLength(2);
      expect(createdGains).toHaveLength(1);

      expect(createdOscillators[0].type).toBe('sawtooth');
      expect(createdOscillators[1].type).toBe('sawtooth');
      expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(110, 0);
      expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(116, 0);
      expect(createdGains[0].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, 0.28);
    });

    it('synthesizes two distinct pulse buzzes on strike 2 (XX)', () => {
      SoundSynthesizer.playStrikeBuzzer(2);

      expect(createdOscillators).toHaveLength(4);
      expect(createdGains).toHaveLength(2);

      // Pulse 1 at t=0
      expect(createdOscillators[0].start).toHaveBeenCalledWith(0);
      expect(createdOscillators[1].start).toHaveBeenCalledWith(0);

      // Pulse 2 at t=0.4 (0.28 pulse + 0.12 gap)
      expect(createdOscillators[2].start).toHaveBeenCalledWith(0.4);
      expect(createdOscillators[3].start).toHaveBeenCalledWith(0.4);
    });

    it('synthesizes three distinct pulse buzzes on strike 3 (XXX)', () => {
      SoundSynthesizer.playStrikeBuzzer(3);

      expect(createdOscillators).toHaveLength(6);
      expect(createdGains).toHaveLength(3);

      // Pulse 3 at t=0.8
      expect(createdOscillators[4].start).toHaveBeenCalledWith(0.8);
      expect(createdOscillators[5].start).toHaveBeenCalledWith(0.8);
    });

    it('clamps strike pulse count safely between 1 and 3', () => {
      // Clamps negative / 0 count to 1
      SoundSynthesizer.playStrikeBuzzer(0);
      expect(createdOscillators).toHaveLength(2);

      createdOscillators = [];
      createdGains = [];

      // Clamps > 3 to 3
      SoundSynthesizer.playStrikeBuzzer(10);
      expect(createdOscillators).toHaveLength(6);
    });
  });

  describe('Scenario 3: AudioContext Autoplay Policy Handling', () => {
    it('resumes AudioContext from suspended state automatically on user click gesture', () => {
      const cleanup = SoundSynthesizer.registerAutoplayResumeListener();
      const ctx = SoundSynthesizer.getAudioContext()!;
      (ctx as any).state = 'suspended';

      window.dispatchEvent(new MouseEvent('click'));
      expect(ctx.resume).toHaveBeenCalled();
      cleanup();
    });

    it('resumes AudioContext from suspended state on touchstart or keydown gestures', () => {
      const cleanup = SoundSynthesizer.registerAutoplayResumeListener();
      const ctx = SoundSynthesizer.getAudioContext()!;
      (ctx as any).state = 'suspended';

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(ctx.resume).toHaveBeenCalled();

      window.dispatchEvent(new Event('touchstart'));
      expect(ctx.resume).toHaveBeenCalled();
      cleanup();
    });

    it('resumes AudioContext explicitly via resumeAudioContext()', async () => {
      const ctx = SoundSynthesizer.getAudioContext()!;
      (ctx as any).state = 'suspended';

      await SoundSynthesizer.resumeAudioContext();
      expect(ctx.resume).toHaveBeenCalled();
    });
  });

  describe('Verification of All 5 Game Show Sound Cues', () => {
    it('verifies Cue 1: playCorrectDing()', () => {
      SoundSynthesizer.playCorrectDing();
      expect(createdOscillators.length).toBeGreaterThanOrEqual(2);
      expect(createdOscillators.every((o) => o.type === 'sine')).toBe(true);
    });

    it('verifies Cue 2: playStrikeBuzzer()', () => {
      SoundSynthesizer.playStrikeBuzzer(1);
      expect(createdOscillators.length).toBe(2);
      expect(createdOscillators.every((o) => o.type === 'sawtooth')).toBe(true);
    });

    it('verifies Cue 3: playBuzzerHit() electronic podium buzzer (240Hz -> 180Hz)', () => {
      SoundSynthesizer.playBuzzerHit();
      expect(createdOscillators).toHaveLength(1);
      expect(createdOscillators[0].type).toBe('sawtooth');
      expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(240, 0);
      expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(180, 0.15);
    });

    it('verifies Cue 4: playDuplicateAlarm() warning pulses (440Hz & 330Hz)', () => {
      SoundSynthesizer.playDuplicateAlarm();
      expect(createdOscillators).toHaveLength(2);
      expect(createdOscillators[0].type).toBe('sawtooth');
      expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
      expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(330, 0.14);
    });

    it('verifies Cue 5: playVictoryFanfare() celebratory C-major arpeggio', () => {
      SoundSynthesizer.playVictoryFanfare();
      expect(createdOscillators).toHaveLength(6);
      expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(523.25, 0);
      expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(659.25, 0.12);
      expect(createdOscillators[2].frequency.setValueAtTime).toHaveBeenCalledWith(783.99, 0.24);
      expect(createdOscillators[3].frequency.setValueAtTime).toHaveBeenCalledWith(1046.5, 0.39);
    });
  });

  describe('Host Audio Mute & Zero-Asset Guarantee', () => {
    it('suppresses all sound cues when muted and persists preference', () => {
      SoundSynthesizer.setMuted(true);
      expect(SoundSynthesizer.isMuted()).toBe(true);
      expect(localStorage.getItem('family_feud_tts_muted')).toBe('true');

      SoundSynthesizer.playCorrectDing();
      SoundSynthesizer.playStrikeBuzzer(3);
      SoundSynthesizer.playBuzzerHit();
      SoundSynthesizer.playDuplicateAlarm();
      SoundSynthesizer.playVictoryFanfare();

      expect(createdOscillators).toHaveLength(0);
      expect(createdGains).toHaveLength(0);
    });

    it('does not instantiate Audio or make network requests (100% zero assets)', () => {
      const audioSpy = vi.spyOn(globalThis, 'Audio');
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      SoundSynthesizer.playCorrectDing();
      SoundSynthesizer.playStrikeBuzzer(1);
      SoundSynthesizer.playBuzzerHit();

      expect(audioSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

