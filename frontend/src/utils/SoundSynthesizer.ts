/**
 * US-18: Real-Time Game Show Sound Effects Synthesizer
 * Built with native Web Audio API (AudioContext, createOscillator, createGain).
 * 100% zero external audio asset dependencies.
 */

export {
  getAudioContext,
  resumeAudioContext,
  registerAutoplayResumeListener,
  setMuted,
  isMuted,
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
  sfx,
  default,
} from './soundEffects';

