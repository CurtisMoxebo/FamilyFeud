/**
 * Mobile Haptic Feedback Engine (US-22)
 * Delivers low-latency tactile vibration feedback on compatible smartphone controllers
 * via the Web Vibration API (`navigator.vibrate`), failing silently on desktop/iOS browsers
 * where vibration is unsupported or blocked.
 */

export type HapticFeedbackType = 'buzz' | 'strike' | 'success';

export const HAPTIC_PATTERNS: Readonly<Record<HapticFeedbackType, number | number[]>> = {
  buzz: 50,
  strike: [100, 50, 100],
  success: [50, 50, 150],
};

/**
 * Checks whether the current browser environment supports `navigator.vibrate`.
 */
export function isHapticsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'vibrate' in navigator &&
    typeof navigator.vibrate === 'function'
  );
}

/**
 * Triggers tactile vibration feedback for mobile player actions and game events (US-22).
 * - `buzz`: 50ms crisp tap confirmation when pressing the Face-Off buzzer
 * - `strike`: [100, 50, 100] double pulse on receiving a strike or duplicate warning
 * - `success`: [50, 50, 150] celebratory pulse on winning the buzzer or clearing a round
 */
export function triggerHaptic(type: HapticFeedbackType): boolean {
  if (!isHapticsSupported()) {
    return false;
  }

  const pattern = HAPTIC_PATTERNS[type];
  if (pattern === undefined) {
    return false;
  }

  try {
    return Boolean(navigator.vibrate(pattern));
  } catch {
    return false;
  }
}

/**
 * Cancels any active vibration pattern on supported devices.
 */
export function cancelHaptic(): boolean {
  if (!isHapticsSupported()) {
    return false;
  }

  try {
    return Boolean(navigator.vibrate(0));
  } catch {
    return false;
  }
}

