import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  playCorrectDing,
  playDing,
  playPointsChime,
  playBuzzerBlip,
  playBuzzerHit,
  playFaceOffBuzzer,
  playDuplicateAlarm,
  playDuplicateWarning,
  playVictoryFanfare,
  playDefeatSound,
  playStrikeBuzzer,
  setMuted,
  isMuted,
  getAudioContext,
  resumeAudioContext,
  registerAutoplayResumeListener,
  _resetAudioContextForTesting,
  sfx,
} from '../src/utils/soundEffects';
import * as SoundSynthesizerModule from '../src/utils/SoundSynthesizer';

describe('Frontend Utility Suite: Game Show Sound Effects Synthesizer (soundEffects.ts & SoundSynthesizer.ts)', () => {
  let createdOscillators: any[] = [];
  let createdGains: any[] = [];

  class MockOscillator {
    type: string = 'sine';
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
    setMuted(false);

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

  it('lazily creates and caches singleton AudioContext instance', () => {
    const ctx1 = getAudioContext();
    const ctx2 = getAudioContext();

    expect(ctx1).toBeDefined();
    expect(ctx1).toBe(ctx2);
  });

  it('resumes audio context if initially suspended by autoplay policy', () => {
    const ctx = getAudioContext()!;
    (ctx as any).state = 'suspended';

    getAudioContext();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('satisfies US-18 Scenario 1: playCorrectDing synthesizes two-tone chime (880Hz -> 1320Hz)', () => {
    playCorrectDing();

    // 880Hz (A5) and 1320Hz (E6)
    expect(createdOscillators).toHaveLength(2);
    expect(createdGains).toHaveLength(2);

    expect(createdOscillators[0].type).toBe('sine');
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(880, 0);
    expect(createdOscillators[0].start).toHaveBeenCalledWith(0);
    expect(createdOscillators[0].stop).toHaveBeenCalledWith(0.35);

    expect(createdOscillators[1].type).toBe('sine');
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(1320, 0.08);
    expect(createdOscillators[1].start).toHaveBeenCalledWith(0.08);
    expect(createdOscillators[1].stop).toHaveBeenCalledWith(0.53);
  });

  it('maintains playDing as a backward-compatible alias for playCorrectDing', () => {
    playDing();

    expect(createdOscillators).toHaveLength(2);
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(880, 0);
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(1320, 0.08);
  });

  it('satisfies US-18 Scenario 2: playStrikeBuzzer synthesizes low harsh sawtooth buzz (dual 110Hz & 116Hz)', () => {
    playStrikeBuzzer(1);

    expect(createdOscillators).toHaveLength(2);
    expect(createdGains).toHaveLength(1);

    expect(createdOscillators[0].type).toBe('sawtooth');
    expect(createdOscillators[1].type).toBe('sawtooth');
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(110, 0);
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(116, 0);
  });

  it('satisfies US-18: playBuzzerHit synthesizes electronic podium buzzer (240Hz -> 180Hz)', () => {
    playBuzzerHit();

    expect(createdOscillators).toHaveLength(1);
    expect(createdGains).toHaveLength(1);

    const osc = createdOscillators[0];
    expect(osc.type).toBe('sawtooth');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(240, 0);
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(180, 0.15);
    expect(osc.start).toHaveBeenCalledWith(0);
    expect(osc.stop).toHaveBeenCalledWith(0.35);
  });

  it('maintains playFaceOffBuzzer as alias for playBuzzerHit', () => {
    playFaceOffBuzzer();

    expect(createdOscillators).toHaveLength(1);
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(240, 0);
  });

  it('satisfies US-18: playDuplicateAlarm synthesizes rapid warning pulses (440Hz & 330Hz)', () => {
    playDuplicateAlarm();

    expect(createdOscillators).toHaveLength(2);
    expect(createdGains).toHaveLength(2);

    expect(createdOscillators[0].type).toBe('sawtooth');
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
    expect(createdOscillators[0].start).toHaveBeenCalledWith(0);
    expect(createdOscillators[0].stop).toHaveBeenCalledWith(0.12);

    expect(createdOscillators[1].type).toBe('sawtooth');
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(330, 0.14);
    expect(createdOscillators[1].start).toHaveBeenCalledWith(0.14);
    expect(createdOscillators[1].stop).toHaveBeenCalledWith(0.32);
  });

  it('maintains playDuplicateWarning as alias for playDuplicateAlarm', () => {
    playDuplicateWarning();

    expect(createdOscillators).toHaveLength(2);
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
  });

  it('satisfies Scenario 1 & 3: playPointsChime synthesizes ascending 3-tone arpeggio (C6, E6, G6)', () => {
    playPointsChime();

    expect(createdOscillators).toHaveLength(3);
    expect(createdGains).toHaveLength(3);

    // C6 (1046.5 Hz), E6 (1318.5 Hz), G6 (1567.98 Hz)
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(1046.5, 0);
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(1318.5, 0.09);
    expect(createdOscillators[2].frequency.setValueAtTime).toHaveBeenCalledWith(1567.98, 0.18);

    createdOscillators.forEach((osc) => {
      expect(osc.type).toBe('triangle');
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    });
  });

  it('satisfies Scenario 2: playBuzzerBlip synthesizes low sawtooth wave blip for 0 points', () => {
    playBuzzerBlip();

    expect(createdOscillators).toHaveLength(1);
    expect(createdGains).toHaveLength(1);

    const osc = createdOscillators[0];
    expect(osc.type).toBe('sawtooth');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(135, 0);
    expect(osc.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(90, 0.3);
    expect(osc.start).toHaveBeenCalledWith(0);
    expect(osc.stop).toHaveBeenCalledWith(0.3);
  });

  it('satisfies US-10 Scenario 2: playVictoryFanfare synthesizes celebratory fanfare and sustained chord', () => {
    playVictoryFanfare();

    // 6 oscillators: C5, E5, G5, sustained C6, E6, G6
    expect(createdOscillators).toHaveLength(6);
    expect(createdGains).toHaveLength(6);

    // Arpeggio
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(523.25, 0);
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(659.25, 0.12);
    expect(createdOscillators[2].frequency.setValueAtTime).toHaveBeenCalledWith(783.99, 0.24);

    // Sustained celebratory chord
    expect(createdOscillators[3].frequency.setValueAtTime).toHaveBeenCalledWith(1046.5, 0.39);
    expect(createdOscillators[4].frequency.setValueAtTime).toHaveBeenCalledWith(1318.51, 0.39);
    expect(createdOscillators[5].frequency.setValueAtTime).toHaveBeenCalledWith(1567.98, 0.39);

    createdOscillators.forEach((osc) => {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    });
  });

  it('satisfies US-10 Scenario 3: playDefeatSound synthesizes descending sad trombone with pitch drop', () => {
    playDefeatSound();

    // 4 notes: 370, 349.23, 329.63, 311.13 -> drop to 246.94
    expect(createdOscillators).toHaveLength(4);
    expect(createdGains).toHaveLength(4);

    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(370.0, 0);
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(349.23, 0.28);
    expect(createdOscillators[2].frequency.setValueAtTime).toHaveBeenCalledWith(329.63, 0.56);
    expect(createdOscillators[3].frequency.setValueAtTime).toHaveBeenCalledWith(311.13, 0.84);
    expect(createdOscillators[3].frequency.linearRampToValueAtTime).toHaveBeenCalledWith(246.94, 1.44);

    createdOscillators.forEach((osc) => {
      expect(osc.type).toBe('sawtooth');
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    });
  });

  it('honors setMuted toggle, persists in localStorage, and skips audio playback when muted', () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    expect(localStorage.getItem('family_feud_tts_muted')).toBe('true');

    playCorrectDing();
    playDing();
    playPointsChime();
    playBuzzerBlip();
    playBuzzerHit();
    playFaceOffBuzzer();
    playDuplicateAlarm();
    playDuplicateWarning();
    playVictoryFanfare();
    playDefeatSound();
    playStrikeBuzzer(3);

    expect(createdOscillators).toHaveLength(0);
    expect(createdGains).toHaveLength(0);

    setMuted(false);
    expect(isMuted()).toBe(false);
    expect(localStorage.getItem('family_feud_tts_muted')).toBe('false');
  });

  it('satisfies US-18 Scenario 3: resumeAudioContext explicitly resumes suspended AudioContext', async () => {
    const ctx = getAudioContext()!;
    (ctx as any).state = 'suspended';

    await resumeAudioContext();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('satisfies US-18 Scenario 3: registerAutoplayResumeListener resumes AudioContext on user click', () => {
    _resetAudioContextForTesting();
    const cleanup = registerAutoplayResumeListener();
    const ctx = getAudioContext()!;
    (ctx as any).state = 'suspended';

    window.dispatchEvent(new MouseEvent('click'));
    expect(ctx.resume).toHaveBeenCalled();
    cleanup();
  });

  it('handles environment without Web Audio API gracefully without throwing', () => {
    // @ts-ignore
    delete window.AudioContext;
    // @ts-ignore
    delete window.webkitAudioContext;

    expect(() => playCorrectDing()).not.toThrow();
    expect(() => playDing()).not.toThrow();
    expect(() => playPointsChime()).not.toThrow();
    expect(() => playBuzzerBlip()).not.toThrow();
    expect(() => playBuzzerHit()).not.toThrow();
    expect(() => playDuplicateAlarm()).not.toThrow();
    expect(() => playVictoryFanfare()).not.toThrow();
    expect(() => playDefeatSound()).not.toThrow();
    expect(() => playStrikeBuzzer()).not.toThrow();
    expect(() => resumeAudioContext()).not.toThrow();
  });

  it('catches and logs warning if audio node creation throws', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = getAudioContext()!;
    ctx.createOscillator = vi.fn().mockImplementation(() => {
      throw new Error('Audio hardware unavailable');
    });

    expect(() => playCorrectDing()).not.toThrow();
    expect(() => playPointsChime()).not.toThrow();
    expect(() => playBuzzerBlip()).not.toThrow();
    expect(() => playBuzzerHit()).not.toThrow();
    expect(() => playDuplicateAlarm()).not.toThrow();
    expect(() => playVictoryFanfare()).not.toThrow();
    expect(() => playDefeatSound()).not.toThrow();
    expect(() => playStrikeBuzzer()).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SFX:WARN]'),
      expect.any(Error)
    );
  });

  it('defensively falls back when localStorage throws during setMuted or isMuted', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: Access denied');
    });
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: Access denied');
    });

    expect(() => setMuted(true)).not.toThrow();
    expect(isMuted()).toBe(true);

    setItemSpy.mockRestore();
    getItemSpy.mockRestore();
  });

  it('US-14: synthesizes dual-sawtooth strike buzzer with pulse count', () => {
    createdOscillators = [];
    createdGains = [];

    // Strike 1 (single pulse, 2 detuned oscillators)
    playStrikeBuzzer(1);
    expect(createdOscillators.length).toBe(2);
    expect(createdOscillators[0].type).toBe('sawtooth');
    expect(createdOscillators[1].type).toBe('sawtooth');

    // Strike 2 (two pulses, 4 oscillators)
    createdOscillators = [];
    playStrikeBuzzer(2);
    expect(createdOscillators.length).toBe(4);

    // Strike 3 (three pulses, 6 oscillators)
    createdOscillators = [];
    playStrikeBuzzer(3);
    expect(createdOscillators.length).toBe(6);
  });

  it('exports convenient sfx bundle object and SoundSynthesizer re-export matches soundEffects', () => {
    expect(sfx.playCorrectDing).toBe(playCorrectDing);
    expect(sfx.playDing).toBe(playDing);
    expect(sfx.playPointsChime).toBe(playPointsChime);
    expect(sfx.playBuzzerBlip).toBe(playBuzzerBlip);
    expect(sfx.playBuzzerHit).toBe(playBuzzerHit);
    expect(sfx.playFaceOffBuzzer).toBe(playFaceOffBuzzer);
    expect(sfx.playDuplicateAlarm).toBe(playDuplicateAlarm);
    expect(sfx.playDuplicateWarning).toBe(playDuplicateWarning);
    expect(sfx.playVictoryFanfare).toBe(playVictoryFanfare);
    expect(sfx.playDefeatSound).toBe(playDefeatSound);
    expect(sfx.playStrikeBuzzer).toBe(playStrikeBuzzer);
    expect(sfx.resumeAudioContext).toBe(resumeAudioContext);

    // SoundSynthesizer re-exports
    expect(SoundSynthesizerModule.playCorrectDing).toBe(playCorrectDing);
    expect(SoundSynthesizerModule.playStrikeBuzzer).toBe(playStrikeBuzzer);
    expect(SoundSynthesizerModule.playBuzzerHit).toBe(playBuzzerHit);
    expect(SoundSynthesizerModule.playDuplicateAlarm).toBe(playDuplicateAlarm);
    expect(SoundSynthesizerModule.playVictoryFanfare).toBe(playVictoryFanfare);

    // Direct invocation through SoundSynthesizer
    SoundSynthesizerModule.playCorrectDing();
    SoundSynthesizerModule.playBuzzerHit();
    SoundSynthesizerModule.playDuplicateAlarm();
    SoundSynthesizerModule.playVictoryFanfare();
    expect(SoundSynthesizerModule.isMuted()).toBe(false);
  });

  it('falls back to webkitAudioContext when window.AudioContext is undefined', () => {
    _resetAudioContextForTesting();
    // @ts-ignore
    delete window.AudioContext;
    // @ts-ignore
    window.webkitAudioContext = MockAudioContext;

    const ctx = getAudioContext();
    expect(ctx).toBeDefined();

    // @ts-ignore
    delete window.webkitAudioContext;
  });

  it('resumes suspended context when getAudioContext is called with an initially suspended context', () => {
    _resetAudioContextForTesting();
    class SuspendedAudioContext extends MockAudioContext {
      constructor() {
        super();
        this.state = 'suspended';
      }
    }
    // @ts-ignore
    window.AudioContext = SuspendedAudioContext;
    const ctx = getAudioContext();
    expect(ctx?.resume).toHaveBeenCalled();
  });

  it('returns null in SSR environment where window is undefined', () => {
    const originalWindow = globalThis.window;
    // @ts-ignore
    delete globalThis.window;
    expect(getAudioContext()).toBeNull();
    globalThis.window = originalWindow;
  });

  it('returns null if AudioContext constructor throws', () => {
    _resetAudioContextForTesting();
    // @ts-ignore
    window.AudioContext = class ThrowingAudioContext {
      constructor() {
        throw new Error('Hardware failure');
      }
    };
    expect(getAudioContext()).toBeNull();
  });
});
