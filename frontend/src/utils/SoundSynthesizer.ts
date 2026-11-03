/**
 * US-18: Real-Time Game Show Sound Effects Synthesizer
 * Built with native Web Audio API (AudioContext, createOscillator, createGain).
 * 100% zero external audio asset dependencies.
 */

import * as sfxModule from './soundEffects';

export const getAudioContext = sfxModule.getAudioContext;
export const resumeAudioContext = sfxModule.resumeAudioContext;
export const registerAutoplayResumeListener = sfxModule.registerAutoplayResumeListener;
export const setMuted = sfxModule.setMuted;
export const isMuted = sfxModule.isMuted;
export const playCorrectDing = sfxModule.playCorrectDing;
export const playDing = sfxModule.playDing;
export const playStrikeBuzzer = sfxModule.playStrikeBuzzer;
export const playBuzzerHit = sfxModule.playBuzzerHit;
export const playFaceOffBuzzer = sfxModule.playFaceOffBuzzer;
export const playDuplicateAlarm = sfxModule.playDuplicateAlarm;
export const playDuplicateWarning = sfxModule.playDuplicateWarning;
export const playVictoryFanfare = sfxModule.playVictoryFanfare;
export const playPointsChime = sfxModule.playPointsChime;
export const playBuzzerBlip = sfxModule.playBuzzerBlip;
export const playDefeatSound = sfxModule.playDefeatSound;
export const sfx = sfxModule.sfx;
export default sfxModule.default;
