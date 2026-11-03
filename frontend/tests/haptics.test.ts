import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  triggerHaptic,
  cancelHaptic,
  isHapticsSupported,
  HAPTIC_PATTERNS,
} from '../src/utils/haptics';

describe('US-22 Step 1: Mobile Haptic Feedback Engine (haptics.ts)', () => {
  const originalVibrateDescriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(navigator),
    'vibrate'
  );
  const originalOwnVibrateDescriptor = Object.getOwnPropertyDescriptor(navigator, 'vibrate');

  const restoreNavigatorVibrate = () => {
    delete (navigator as any).vibrate;
    if (originalOwnVibrateDescriptor) {
      Object.defineProperty(navigator, 'vibrate', originalOwnVibrateDescriptor);
    }
    if (originalVibrateDescriptor) {
      Object.defineProperty(Object.getPrototypeOf(navigator), 'vibrate', originalVibrateDescriptor);
    }
  };

  afterEach(() => {
    vi.restoreAllMocks();
    restoreNavigatorVibrate();
  });

  it('defines exact US-22 haptic vibration patterns for buzz, strike, and success', () => {
    expect(HAPTIC_PATTERNS.buzz).toBe(50);
    expect(HAPTIC_PATTERNS.strike).toEqual([100, 50, 100]);
    expect(HAPTIC_PATTERNS.success).toEqual([50, 50, 150]);
  });

  it('executes navigator.vibrate(50) on buzz, [100, 50, 100] on strike, and [50, 50, 150] on success', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    expect(isHapticsSupported()).toBe(true);

    expect(triggerHaptic('buzz')).toBe(true);
    expect(vibrateMock).toHaveBeenLastCalledWith(50);

    expect(triggerHaptic('strike')).toBe(true);
    expect(vibrateMock).toHaveBeenLastCalledWith([100, 50, 100]);

    expect(triggerHaptic('success')).toBe(true);
    expect(vibrateMock).toHaveBeenLastCalledWith([50, 50, 150]);

    expect(cancelHaptic()).toBe(true);
    expect(vibrateMock).toHaveBeenLastCalledWith(0);
  });

  it('returns false gracefully when navigator.vibrate is unsupported (e.g. desktop / iOS Safari)', () => {
    delete (navigator as any).vibrate;
    delete (Object.getPrototypeOf(navigator) as any).vibrate;

    expect(isHapticsSupported()).toBe(false);
    expect(triggerHaptic('buzz')).toBe(false);
    expect(triggerHaptic('strike')).toBe(false);
    expect(triggerHaptic('success')).toBe(false);
    expect(cancelHaptic()).toBe(false);
  });

  it('handles unknown haptic types and thrown navigator.vibrate exceptions without crashing', () => {
    const throwingVibrate = vi.fn(() => {
      throw new Error('Blocked without user activation');
    });
    Object.defineProperty(navigator, 'vibrate', {
      value: throwingVibrate,
      configurable: true,
      writable: true,
    });

    expect(triggerHaptic('unknown' as any)).toBe(false);
    expect(triggerHaptic('buzz')).toBe(false);
    expect(cancelHaptic()).toBe(false);
  });
});

