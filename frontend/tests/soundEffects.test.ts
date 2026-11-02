import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  playDing,
  playPointsChime,
  playBuzzerBlip,
  setMuted,
  isMuted,
  getAudioContext,
  sfx,
} from '../src/utils/soundEffects';

describe('Frontend Utility Suite: Game Show Sound Effects Synthesizer (soundEffects.ts)', () => {
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
    createdOscillators = [];
    createdGains = [];
    setMuted(false);

    Object.defineProperty(window, 'AudioContext', {
      value: MockAudioContext,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
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

  it('satisfies Scenario 1: playDing synthesizes card-flip bell sound with fundamental and harmonic', () => {
    playDing();

    // Fundamental (1200Hz) and Harmonic (2400Hz)
    expect(createdOscillators).toHaveLength(2);
    expect(createdGains).toHaveLength(2);

    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(1200, 0);
    expect(createdOscillators[0].start).toHaveBeenCalledWith(0);
    expect(createdOscillators[0].stop).toHaveBeenCalledWith(0.6);

    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(2400, 0);
    expect(createdOscillators[1].start).toHaveBeenCalledWith(0);
    expect(createdOscillators[1].stop).toHaveBeenCalledWith(0.4);
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

  it('honors setMuted toggle and skips audio playback when muted', () => {
    setMuted(true);
    expect(isMuted()).toBe(true);

    playDing();
    playPointsChime();
    playBuzzerBlip();

    expect(createdOscillators).toHaveLength(0);
    expect(createdGains).toHaveLength(0);
  });

  it('handles environment without Web Audio API gracefully without throwing', () => {
    // @ts-ignore
    delete window.AudioContext;
    // @ts-ignore
    delete window.webkitAudioContext;

    expect(() => playDing()).not.toThrow();
    expect(() => playPointsChime()).not.toThrow();
    expect(() => playBuzzerBlip()).not.toThrow();
  });

  it('catches and logs warning if audio node creation throws', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = getAudioContext()!;
    ctx.createOscillator = vi.fn().mockImplementation(() => {
      throw new Error('Audio hardware unavailable');
    });

    expect(() => playDing()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SFX:WARN]'),
      expect.any(Error)
    );
  });

  it('exports convenient sfx bundle object', () => {
    expect(sfx.playDing).toBe(playDing);
    expect(sfx.playPointsChime).toBe(playPointsChime);
    expect(sfx.playBuzzerBlip).toBe(playBuzzerBlip);
  });
});
