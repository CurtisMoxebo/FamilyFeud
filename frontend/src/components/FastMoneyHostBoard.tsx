import React, { useState, useEffect, useRef } from 'react';
import { HostStateSnapshot, TimerTickPayload, FastMoneyRevealSlot } from '../types';
import { speakQuestion } from '../utils/tts';
import { playDing, playPointsChime, playBuzzerBlip } from '../utils/soundEffects';
import { useTranslation } from '../i18n/LanguageContext';
import {
  Timer,
  Zap,
  Sparkles,
  CheckCircle2,
  Trophy,
  Volume2,
  VolumeX,
  Play,
  Pause,
  ChevronRight,
  UserCheck,
} from 'lucide-react';

export interface FastMoneyHostBoardProps {
  snapshot?: HostStateSnapshot | null;
  timerTick?: TimerTickPayload | null;
  language?: string;
  roomName?: string;
  roomCode?: string;
  enableTTS?: boolean;
  enableSFX?: boolean;
  onRevealAnswer?: (slotNumber: number) => void;
  onRevealPoints?: (slotNumber: number) => void;
  onStartReveal?: () => void;
}

export const FastMoneyHostBoard: React.FC<FastMoneyHostBoardProps> = ({
  snapshot = null,
  timerTick = null,
  language = 'EN',
  roomName = 'Family Feud',
  roomCode = '',
  enableTTS = true,
  enableSFX = true,
  onRevealAnswer,
  onRevealPoints,
  onStartReveal,
}) => {
  const { t } = useTranslation();
  const [audioEnabled, setAudioEnabled] = useState<boolean>(enableSFX || enableTTS);
  const isInitialMountRef = useRef<boolean>(true);
  const [isAutoPacing, setIsAutoPacing] = useState<boolean>(false);

  const lastSpokenQuestionRef = useRef<string | null>(null);
  const lastSpokenRevealSlotRef = useRef<number | null>(null);
  const prevRevealStatesRef = useRef<Map<number, { answer: boolean; points: boolean }>>(new Map());
  const autoPacingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remainingSeconds =
    timerTick && typeof timerTick.secondsRemaining === 'number'
      ? timerTick.secondsRemaining
      : snapshot?.remainingSeconds ?? 60;

  const phase = snapshot?.phase ?? 'P1_READY';
  const currentQuestionText = snapshot?.currentQuestionText ?? null;
  const activeNumber = snapshot?.activeQuestionNumber ?? 1;
  const isRevealPhase = phase === 'P1_REVEAL';
  const isReadyForP2 = phase === 'P2_READY';
  const isRevealOrP2 = isRevealPhase || isReadyForP2;

  const totalScore = snapshot?.totalScore ?? 0;
  const activeRevealSlotNumber = snapshot?.activeRevealSlotNumber ?? (isReadyForP2 ? null : 1);

  // Fallback 5 reveal slots if not loaded from snapshot
  const revealSlots: FastMoneyRevealSlot[] = snapshot?.revealSlots ?? [
    {
      slotNumber: 1,
      questionId: 'q-1',
      questionText: 'Question 1',
      rawAnswer: '',
      pointsAwarded: 0,
      isAnswerRevealed: false,
      isPointsRevealed: false,
      isMatched: false,
    },
    {
      slotNumber: 2,
      questionId: 'q-2',
      questionText: 'Question 2',
      rawAnswer: '',
      pointsAwarded: 0,
      isAnswerRevealed: false,
      isPointsRevealed: false,
      isMatched: false,
    },
    {
      slotNumber: 3,
      questionId: 'q-3',
      questionText: 'Question 3',
      rawAnswer: '',
      pointsAwarded: 0,
      isAnswerRevealed: false,
      isPointsRevealed: false,
      isMatched: false,
    },
    {
      slotNumber: 4,
      questionId: 'q-4',
      questionText: 'Question 4',
      rawAnswer: '',
      pointsAwarded: 0,
      isAnswerRevealed: false,
      isPointsRevealed: false,
      isMatched: false,
    },
    {
      slotNumber: 5,
      questionId: 'q-5',
      questionText: 'Question 5',
      rawAnswer: '',
      pointsAwarded: 0,
      isAnswerRevealed: false,
      isPointsRevealed: false,
      isMatched: false,
    },
  ];

  // Current active slot object in reveal mode
  const activeRevealSlot =
    revealSlots.find((s) => s.slotNumber === activeRevealSlotNumber) ??
    (revealSlots.length > 0 ? revealSlots[0] : null);

  // 1. Speak question via TTS during P1_PLAYING
  useEffect(() => {
    if (
      enableTTS &&
      audioEnabled &&
      phase === 'P1_PLAYING' &&
      currentQuestionText &&
      currentQuestionText !== lastSpokenQuestionRef.current
    ) {
      lastSpokenQuestionRef.current = currentQuestionText;
      speakQuestion(currentQuestionText, language);
    }
  }, [currentQuestionText, phase, language, enableTTS, audioEnabled]);

  // 2. Speak question via TTS when new slot begins in P1_REVEAL (Scenario 1)
  useEffect(() => {
    if (
      enableTTS &&
      audioEnabled &&
      isRevealPhase &&
      activeRevealSlotNumber !== null &&
      activeRevealSlotNumber !== lastSpokenRevealSlotRef.current &&
      activeRevealSlot
    ) {
      lastSpokenRevealSlotRef.current = activeRevealSlotNumber;
      speakQuestion(
        `Question ${activeRevealSlotNumber}: ${activeRevealSlot.questionText}`,
        language
      );
    }
  }, [activeRevealSlotNumber, isRevealPhase, activeRevealSlot, language, enableTTS, audioEnabled]);

  // 3. Play Synchronized Sound Effects on Reveal Flips (Scenario 1 & 2)
  useEffect(() => {
    if (!isRevealOrP2) return;

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      revealSlots.forEach((slot) => {
        prevRevealStatesRef.current.set(slot.slotNumber, {
          answer: slot.isAnswerRevealed,
          points: slot.isPointsRevealed,
        });
      });
      return;
    }

    revealSlots.forEach((slot) => {
      const prev = prevRevealStatesRef.current.get(slot.slotNumber);

      // Answer just revealed -> Play Ding
      if (slot.isAnswerRevealed && (!prev || !prev.answer)) {
        if (enableSFX && audioEnabled) {
          playDing();
        }
      }

      // Points just revealed -> Play Chime (points > 0) or Buzzer (points === 0)
      if (slot.isPointsRevealed && (!prev || !prev.points)) {
        if (enableSFX && audioEnabled) {
          if (slot.pointsAwarded > 0) {
            playPointsChime();
          } else {
            playBuzzerBlip();
          }
        }
      }

      // Update ref state
      prevRevealStatesRef.current.set(slot.slotNumber, {
        answer: slot.isAnswerRevealed,
        points: slot.isPointsRevealed,
      });
    });
  }, [revealSlots, isRevealOrP2, enableSFX, audioEnabled]);

  // 4. Auto-Pacing Execution Engine with 1.5-Second Suspense Pause (Scenario 1 & DoD)

  useEffect(() => {
    if (!isAutoPacing || !isRevealPhase || !activeRevealSlotNumber) {
      if (autoPacingTimeoutRef.current) {
        clearTimeout(autoPacingTimeoutRef.current);
      }
      return;
    }

    const currentSlot = revealSlots.find((s) => s.slotNumber === activeRevealSlotNumber);
    if (!currentSlot) return;

    // If answer is hidden: pause 1.2s for question reading, then reveal answer
    if (!currentSlot.isAnswerRevealed) {
      autoPacingTimeoutRef.current = setTimeout(() => {
        onRevealAnswer?.(activeRevealSlotNumber);
      }, 1200);
    }
    // If answer revealed but points hidden: suspense pause 1.5s, then reveal points (Scenario 1)
    else if (!currentSlot.isPointsRevealed) {
      autoPacingTimeoutRef.current = setTimeout(() => {
        onRevealPoints?.(activeRevealSlotNumber);
      }, 1500);
    }

    return () => {
      if (autoPacingTimeoutRef.current) {
        clearTimeout(autoPacingTimeoutRef.current);
      }
    };
  }, [
    isAutoPacing,
    isRevealPhase,
    activeRevealSlotNumber,
    revealSlots,
    onRevealAnswer,
    onRevealPoints,
  ]);

  // Turn finished but reveal not yet started -> Trigger reveal phase
  const handleStartRevealClick = () => {
    if (onStartReveal) {
      onStartReveal();
    }
  };

  // Timer style for P1_PLAYING
  const getTimerStyle = () => {
    if (remainingSeconds > 30) return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40';
    if (remainingSeconds > 10) return 'text-amber-400 border-amber-500/40 bg-amber-950/40';
    return 'text-feud-red border-red-500/50 bg-red-950/60 animate-pulse';
  };

  return (
    <div
      data-testid="fast-money-host-board"
      className="w-full max-w-4xl flex flex-col items-center gap-6 animate-fade-in"
    >
      {/* Top TV Scoreboard Header */}
      <div className="w-full bg-feud-slate-card/95 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-feud-slate-border/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-feud-gold/20 border border-feud-gold/40 text-feud-gold">
              <Zap className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-feud-gold px-2.5 py-0.5 rounded-full bg-feud-gold/10 border border-feud-gold/20">
                  {isRevealOrP2 ? t.fastMoney.revealPhaseTitle : 'Fast Money Speed Round'}
                </span>
                <span
                  data-testid="host-phase-badge"
                  className="text-xs font-bold uppercase tracking-wider text-green-400 px-2.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/20"
                >
                  {phase}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white mt-1 flex items-center gap-2">
                <span>{roomName}</span>
                {roomCode && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-800 text-feud-gold border border-slate-700">
                    {roomCode}
                  </span>
                )}
              </h1>
            </div>
          </div>

          {/* Right Header Area: Total Score (Reveal) or 60s Clock (Playing) */}
          <div className="flex items-center gap-3">
            {/* Audio Toggle Button */}
            <button
              type="button"
              onClick={() => setAudioEnabled(!audioEnabled)}
              data-testid="host-audio-toggle"
              title={audioEnabled ? 'Mute Sounds & TTS' : 'Unmute Sounds & TTS'}
              className="p-3 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              {audioEnabled ? <Volume2 className="w-5 h-5 text-feud-gold" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
            </button>

            {isRevealOrP2 ? (
              /* Real-Time Cumulative Round Total Score Counter (Scenario 3) */
              <div
                data-testid="fast-money-total-score"
                className="flex items-center gap-2.5 px-6 py-3 rounded-2xl border border-feud-gold/50 bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/60 text-feud-gold font-black font-game text-3xl sm:text-4xl tracking-wider shadow-lg shadow-feud-gold/10 transition-all"
              >
                <Trophy className="w-7 h-7 text-feud-gold shrink-0 animate-bounce" />
                <span data-testid="host-total-score-digits">{totalScore}</span>
                <span className="text-xs font-bold uppercase tracking-widest text-feud-gold/80 ml-1">
                  PTS
                </span>
              </div>
            ) : (
              /* Synchronized Authoritative 60-Second Clock */
              <div
                data-testid="fast-money-host-timer"
                className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl border font-black font-game text-3xl sm:text-4xl tracking-wider transition-colors shadow-lg ${getTimerStyle()}`}
              >
                <Timer className="w-7 h-7 shrink-0" />
                <span>{remainingSeconds}s</span>
              </div>
            )}
          </div>
        </div>

        {/* Active Question Banner */}
        <div className="mt-6 p-6 rounded-2xl bg-gradient-to-r from-feud-blue-dark via-feud-blue to-feud-blue-dark border border-feud-gold/40 shadow-inner text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-feud-gold/20 border border-feud-gold/30 text-feud-gold text-xs font-extrabold uppercase tracking-widest mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {isRevealPhase
                ? `Reveal Slot #${activeRevealSlotNumber ?? 1}`
                : isReadyForP2
                ? 'Player 1 Complete'
                : `Question #${activeNumber}`}
            </span>
          </div>

          <h2
            data-testid="fast-money-host-question"
            className="text-xl sm:text-2xl font-black text-white leading-snug drop-shadow min-h-[3rem] flex items-center justify-center"
          >
            {phase === 'P1_READY'
              ? "Waiting for Player 1 to press 'I'm Ready!'..."
              : phase === 'P1_FINISHED'
              ? 'Player 1 Speed Round Complete! Click "Start Reveal" below.'
              : isReadyForP2
              ? 'Player 1 Reveal Sequence Complete! Ready for Player 2.'
              : isRevealPhase && activeRevealSlot
              ? activeRevealSlot.questionText
              : currentQuestionText || 'Loading question...'}
          </h2>
        </div>
      </div>

      {/* 5 Fast Money Answer & Point Slots */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center justify-between border-b border-feud-slate-border/80 pb-4 mb-6">
          <h3 className="text-lg font-black uppercase tracking-wider text-slate-200">
            {isRevealOrP2 ? 'Player 1 Reveal Board' : 'Player 1 Board (Answers Concealed)'}
          </h3>
          <div className="text-xs font-bold uppercase tracking-wider text-feud-gold">
            {isRevealOrP2
              ? `${revealSlots.filter((s) => s.isPointsRevealed).length} / 5 Revealed`
              : `${snapshot?.answeredCount ?? 0} / 5 Answered`}
          </div>
        </div>

        {/* The 5 Slot Grid with 3D Flip Card Aesthetics */}
        <div className="flex flex-col gap-3">
          {revealSlots.map((slot) => {
            const isActive = isRevealPhase && activeRevealSlotNumber === slot.slotNumber;
            const isPlayingActive =
              phase === 'P1_PLAYING' && activeNumber === slot.slotNumber;

            return (
              <div
                key={slot.slotNumber}
                data-testid={`fast-money-slot-${slot.slotNumber}`}
                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300 ${
                  isActive
                    ? 'border-feud-gold bg-slate-800/90 shadow-[0_0_20px_rgba(245,158,11,0.35)] scale-[1.01]'
                    : isPlayingActive
                    ? 'border-blue-400 bg-slate-800/90'
                    : 'border-slate-800 bg-slate-900/70'
                }`}
              >
                {/* Slot Number & Raw Contestant Answer Box */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-4">
                  <span
                    className={`w-9 h-9 rounded-xl border font-black text-sm flex items-center justify-center shrink-0 ${
                      isActive
                        ? 'bg-feud-gold text-slate-950 border-yellow-300 shadow-md'
                        : 'bg-slate-800 border-slate-700 text-feud-gold'
                    }`}
                  >
                    {slot.slotNumber}
                  </span>

                  {/* Contestant Answer Text (Flips open in Scenario 1) */}
                  <div
                    data-testid={`fast-money-slot-status-${slot.slotNumber}`}
                    className="font-mono text-base tracking-wider font-bold truncate"
                  >
                    {isRevealOrP2 ? (
                      slot.isAnswerRevealed ? (
                        <span
                          data-testid={`revealed-answer-${slot.slotNumber}`}
                          className="text-white font-extrabold uppercase tracking-widest text-lg drop-shadow"
                        >
                          {slot.rawAnswer || (
                            <span className="text-slate-500 italic">
                              {t.fastMoney.noAnswer}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span
                          data-testid={`unrevealed-answer-${slot.slotNumber}`}
                          className="text-slate-600 select-none tracking-widest"
                        >
                          — — — — — — — — — —
                        </span>
                      )
                    ) : slot.rawAnswer || snapshot?.slots?.[slot.slotNumber - 1]?.isFilled ? (
                      <span
                        data-testid={`fast-money-slot-filled-${slot.slotNumber}`}
                        className="inline-flex items-center gap-2 text-emerald-400"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>••••••••••••••••••••</span>
                      </span>
                    ) : (
                      <span
                        data-testid={`fast-money-slot-empty-${slot.slotNumber}`}
                        className="text-slate-600 select-none"
                      >
                        — — — — — — — — — —
                      </span>
                    )}
                  </div>
                </div>

                {/* Point Value Box (Flips open with Chime or Buzzer in Scenario 2 & 3) */}
                <div
                  data-testid={`revealed-points-box-${slot.slotNumber}`}
                  className={`w-16 h-11 rounded-xl border flex items-center justify-center font-game font-black text-lg select-none shadow-inner transition-all ${
                    slot.isPointsRevealed
                      ? slot.pointsAwarded > 0
                        ? 'bg-gradient-to-tr from-amber-600 to-yellow-400 text-slate-950 border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                        : 'bg-slate-900 border-red-500/50 text-red-400'
                      : 'bg-slate-950 border-slate-800 text-slate-600'
                  }`}
                >
                  {isRevealOrP2 ? (
                    slot.isPointsRevealed ? (
                      <span data-testid={`points-val-${slot.slotNumber}`}>
                        {slot.pointsAwarded}
                      </span>
                    ) : (
                      '--'
                    )
                  ) : snapshot?.slots?.[slot.slotNumber - 1]?.isFilled ? (
                    '--'
                  ) : (
                    ''
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Host Pacing Controls & Auto-Pacing Mode (Scenario 1 & 5) */}
        {isRevealPhase && (
          <div
            data-testid="host-reveal-controls"
            className="mt-6 pt-6 border-t border-feud-slate-border/80 flex flex-wrap items-center justify-between gap-4"
          >
            {/* Auto Pacing Toggle */}
            <button
              type="button"
              onClick={() => setIsAutoPacing(!isAutoPacing)}
              data-testid="host-auto-pacing-btn"
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border transition-all cursor-pointer ${
                isAutoPacing
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-md'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {isAutoPacing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>
                {isAutoPacing ? t.fastMoney.autoPacing : t.fastMoney.manualPacing}
              </span>
            </button>

            {/* Manual Step-by-Step Pacing Button */}
            {activeRevealSlotNumber && (
              <div className="flex items-center gap-3">
                {activeRevealSlot && !activeRevealSlot.isAnswerRevealed && (
                  <button
                    type="button"
                    onClick={() => onRevealAnswer?.(activeRevealSlotNumber)}
                    data-testid="host-reveal-answer-btn"
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-feud-gold via-amber-400 to-yellow-500 text-slate-950 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-feud-gold/20 cursor-pointer"
                  >
                    <span>
                      {t.fastMoney.revealAnswerBtn.replace(
                        '{num}',
                        String(activeRevealSlotNumber)
                      )}
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}

                {activeRevealSlot &&
                  activeRevealSlot.isAnswerRevealed &&
                  !activeRevealSlot.isPointsRevealed && (
                    <button
                      type="button"
                      onClick={() => onRevealPoints?.(activeRevealSlotNumber)}
                      data-testid="host-reveal-points-btn"
                      className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-amber-500 via-yellow-400 to-feud-gold text-slate-950 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-feud-gold/25 cursor-pointer"
                    >
                      <span>
                        {t.fastMoney.revealPointsBtn.replace(
                          '{num}',
                          String(activeRevealSlotNumber)
                        )}
                      </span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
              </div>
            )}
          </div>
        )}

        {/* Phase Transition to Start Reveal */}
        {phase === 'P1_FINISHED' && onStartReveal && (
          <div className="mt-6 pt-6 border-t border-feud-slate-border/80 flex justify-center">
            <button
              type="button"
              onClick={handleStartRevealClick}
              data-testid="host-start-reveal-btn"
              className="px-8 py-3.5 rounded-2xl font-black text-base uppercase tracking-wider bg-gradient-to-r from-feud-gold via-amber-400 to-yellow-500 text-slate-950 shadow-xl shadow-feud-gold/25 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-5 h-5 fill-slate-950" />
              <span>Start Fast Money Reveal</span>
            </button>
          </div>
        )}

        {/* Completion Banner (Scenario 4) */}
        {isReadyForP2 && (
          <div
            data-testid="host-reveal-complete-banner"
            className="mt-6 p-5 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-emerald-950/70 border border-emerald-500/40 text-center animate-fade-in shadow-xl"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-widest mb-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>{t.fastMoney.revealComplete}</span>
            </div>
            <h4 className="text-xl font-extrabold text-white">
              Player 1 Round Total: <span className="text-feud-gold">{totalScore} PTS</span>
            </h4>
            <p className="text-xs text-slate-300 mt-1">
              Player 2 has been invited to take the stage and press &quot;I&apos;m Ready!&quot;
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FastMoneyHostBoard;
