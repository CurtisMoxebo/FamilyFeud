import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  HostStateSnapshot,
  TimerTickPayload,
  FastMoneyRevealSlot,
  DuplicateAnswerWarningPayload,
  GameOverPayload,
} from '../types';
import {
  speakQuestion,
  cancelSpeech,
  isTtsMuted,
  setTtsMuted,
  speakDuplicateAlert,
  speakVictory,
  speakDefeat,
} from '../utils/tts';
import {
  playCorrectDing,
  playPointsChime,
  playBuzzerBlip,
  playDuplicateAlarm,
  playVictoryFanfare,
  playDefeatSound,
} from '../utils/soundEffects';
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
  AlertTriangle,
  RotateCcw,
  Loader2,
  Award,
} from 'lucide-react';

export interface FastMoneyHostBoardProps {
  snapshot?: HostStateSnapshot | null;
  timerTick?: TimerTickPayload | null;
  duplicateWarning?: DuplicateAnswerWarningPayload | null;
  gameOver?: GameOverPayload | null;
  isPaused?: boolean;
  pausedRemainingSeconds?: number;
  language?: string;
  roomName?: string;
  roomCode?: string;
  enableTTS?: boolean;
  enableSFX?: boolean;
  onRevealAnswer?: (slotNumber: number) => void;
  onRevealPoints?: (slotNumber: number) => void;
  onStartReveal?: () => void;
  onStartP2Reveal?: () => void;
  onRevealP2Answer?: (slotNumber: number) => void;
  onRevealP2Points?: (slotNumber: number) => void;
  onReplay?: () => void;
}

export const FastMoneyHostBoard: React.FC<FastMoneyHostBoardProps> = ({
  snapshot = null,
  timerTick = null,
  duplicateWarning = null,
  gameOver = null,
  isPaused = false,
  pausedRemainingSeconds,
  language = 'EN',
  roomName = 'Family Feud',
  roomCode = '',
  enableTTS = true,
  enableSFX = true,
  onRevealAnswer,
  onRevealPoints,
  onStartReveal,
  onStartP2Reveal,
  onRevealP2Answer,
  onRevealP2Points,
  onReplay,
}) => {
  const { t } = useTranslation();
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
    return !isTtsMuted() && (enableSFX || enableTTS);
  });

  const handleToggleAudio = () => {
    const nextAudio = !audioEnabled;
    setAudioEnabled(nextAudio);
    setTtsMuted(!nextAudio);
    if (!nextAudio) {
      cancelSpeech();
    }
  };
  const isInitialMountRef = useRef<boolean>(true);
  const isP2InitialMountRef = useRef<boolean>(true);
  const [isAutoPacing, setIsAutoPacing] = useState<boolean>(false);
  const [isAutoPacingP2, setIsAutoPacingP2] = useState<boolean>(false);
  const [activeWarning, setActiveWarning] = useState<DuplicateAnswerWarningPayload | null>(null);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);

  const lastSpokenQuestionRef = useRef<string | null>(null);
  const lastSpokenRevealSlotRef = useRef<number | null>(null);
  const lastSpokenP2RevealSlotRef = useRef<number | null>(null);
  const prevRevealStatesRef = useRef<Map<number, { answer: boolean; points: boolean }>>(new Map());
  const prevP2RevealStatesRef = useRef<Map<number, { answer: boolean; points: boolean }>>(new Map());
  const autoPacingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHandledGameOverRef = useRef<boolean>(false);

  const phase = snapshot?.phase ?? 'P1_READY';
  const isP1RevealPhase = phase === 'P1_REVEAL';
  const isP2RevealPhase = phase === 'P2_REVEAL';
  const isReadyForP2 = phase === 'P2_READY';
  const isP2Playing = phase === 'P2_PLAYING';
  const isP2Finished = phase === 'P2_FINISHED';
  const isP2SpeedRound = isP2Playing || isP2Finished;
  const isGameOver = phase === 'GAME_OVER' || !!gameOver;

  const remainingSeconds =
    isPaused && typeof pausedRemainingSeconds === 'number' && pausedRemainingSeconds > 0
      ? pausedRemainingSeconds
      : timerTick && typeof timerTick.secondsRemaining === 'number'
      ? timerTick.secondsRemaining
      : snapshot?.remainingSeconds ?? (isP2Playing ? 75 : 60);

  const currentQuestionText = snapshot?.currentQuestionText ?? null;
  const activeNumber = snapshot?.activeQuestionNumber ?? 1;

  // Fallback 5 reveal slots if not loaded from snapshot
  const defaultSlots: FastMoneyRevealSlot[] = [
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

  const p1Slots: FastMoneyRevealSlot[] =
    snapshot?.p1Slots ?? snapshot?.revealSlots ?? defaultSlots;
  const p2Slots: FastMoneyRevealSlot[] =
    snapshot?.p2Slots ?? snapshot?.revealSlots ?? defaultSlots;

  // Active slot tracking for P1 Reveal
  const activeRevealSlotNumber = snapshot?.activeRevealSlotNumber ?? (isReadyForP2 ? null : 1);
  const activeRevealSlot =
    p1Slots.find((s) => s.slotNumber === activeRevealSlotNumber) ??
    (p1Slots.length > 0 ? p1Slots[0] : null);

  // Active slot tracking for P2 Reveal
  const activeP2RevealSlotNumber =
    snapshot?.activeRevealSlotNumber ??
    p2Slots.find((s) => !s.isPointsRevealed)?.slotNumber ??
    null;
  const activeP2RevealSlot =
    p2Slots.find((s) => s.slotNumber === activeP2RevealSlotNumber) ??
    (p2Slots.length > 0 ? p2Slots[0] : null);

  // Score Calculations
  const p1TotalScore = snapshot?.p1TotalScore ?? snapshot?.totalScore ?? 0;
  const p2TotalScore = snapshot?.p2TotalScore ?? 0;
  const grandTotal =
    gameOver?.grandTotal ??
    snapshot?.grandTotal ??
    (p1TotalScore + p2TotalScore);
  const totalScore = isP2RevealPhase || isGameOver ? grandTotal : snapshot?.totalScore ?? p1TotalScore;

  const isVictory = gameOver
    ? gameOver.isVictory
    : snapshot?.isVictory ?? grandTotal >= 200;

  // Rapid transition cancellation: stop any pending speech when round finishes or advances (US-17 Scenario 2)
  useEffect(() => {
    if (phase !== 'P1_PLAYING' && phase !== 'P2_PLAYING') {
      cancelSpeech();
    }
  }, [phase]);

  // Clean up speech on unmount (US-17 Scenario 2)
  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  // 1. Speak question via TTS during P1_PLAYING and P2_PLAYING (US-07 & US-09 Scenario 1)
  useEffect(() => {
    if (
      enableTTS &&
      audioEnabled &&
      (phase === 'P1_PLAYING' || phase === 'P2_PLAYING') &&
      currentQuestionText &&
      currentQuestionText !== lastSpokenQuestionRef.current
    ) {
      lastSpokenQuestionRef.current = currentQuestionText;
      cancelSpeech();
      speakQuestion(currentQuestionText, language);
    }
  }, [currentQuestionText, phase, language, enableTTS, audioEnabled]);

  // 2. Duplicate Answer Detection Alarm & Speech (US-09 Scenario 2)
  useEffect(() => {
    if (duplicateWarning) {
      setActiveWarning(duplicateWarning);

      if (enableSFX && audioEnabled) {
        playDuplicateAlarm();
      }

      if (enableTTS && audioEnabled) {
        speakDuplicateAlert(language);
      }

      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }

      warningTimeoutRef.current = setTimeout(() => {
        setActiveWarning(null);
      }, 3500);
    }
  }, [duplicateWarning, enableSFX, enableTTS, audioEnabled, language]);

  // 3. Speak question via TTS when new slot begins in P1_REVEAL (US-08 Scenario 1)
  useEffect(() => {
    if (
      enableTTS &&
      audioEnabled &&
      isP1RevealPhase &&
      activeRevealSlotNumber !== null &&
      activeRevealSlotNumber !== lastSpokenRevealSlotRef.current &&
      activeRevealSlot
    ) {
      lastSpokenRevealSlotRef.current = activeRevealSlotNumber;
      const p1Prefix = language.toUpperCase() === 'ES' ? 'Pregunta' : 'Question';
      speakQuestion(
        `${p1Prefix} ${activeRevealSlotNumber}: ${activeRevealSlot.questionText}`,
        language
      );
    }
  }, [activeRevealSlotNumber, isP1RevealPhase, activeRevealSlot, language, enableTTS, audioEnabled]);

  // 4. Speak question via TTS when new slot begins in P2_REVEAL (US-10 Scenario 1)
  useEffect(() => {
    if (
      enableTTS &&
      audioEnabled &&
      isP2RevealPhase &&
      activeP2RevealSlotNumber !== null &&
      activeP2RevealSlotNumber !== lastSpokenP2RevealSlotRef.current &&
      activeP2RevealSlot
    ) {
      lastSpokenP2RevealSlotRef.current = activeP2RevealSlotNumber;
      const p2Prefix = language.toUpperCase() === 'ES' ? 'Pregunta' : 'Question';
      speakQuestion(
        `${p2Prefix} ${activeP2RevealSlotNumber}: ${activeP2RevealSlot.questionText}`,
        language
      );
    }
  }, [activeP2RevealSlotNumber, isP2RevealPhase, activeP2RevealSlot, language, enableTTS, audioEnabled]);

  // 5. Play Synchronized Sound Effects on P1 Reveal Flips
  useEffect(() => {
    if (!isP1RevealPhase && !isReadyForP2) return;

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      p1Slots.forEach((slot) => {
        prevRevealStatesRef.current.set(slot.slotNumber, {
          answer: slot.isAnswerRevealed,
          points: slot.isPointsRevealed,
        });
      });
      return;
    }

    p1Slots.forEach((slot) => {
      const prev = prevRevealStatesRef.current.get(slot.slotNumber);

      // Answer just revealed -> Play Ding
      if (slot.isAnswerRevealed && (!prev || !prev.answer)) {
        if (enableSFX && audioEnabled) {
          playCorrectDing();
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

      prevRevealStatesRef.current.set(slot.slotNumber, {
        answer: slot.isAnswerRevealed,
        points: slot.isPointsRevealed,
      });
    });
  }, [p1Slots, isP1RevealPhase, isReadyForP2, enableSFX, audioEnabled]);

  // 6. Play Synchronized Sound Effects on P2 Reveal Flips (US-10 Scenario 1)
  useEffect(() => {
    if (!isP2RevealPhase && !isGameOver) return;

    if (isP2InitialMountRef.current) {
      isP2InitialMountRef.current = false;
      p2Slots.forEach((slot) => {
        prevP2RevealStatesRef.current.set(slot.slotNumber, {
          answer: slot.isAnswerRevealed,
          points: slot.isPointsRevealed,
        });
      });
      return;
    }

    p2Slots.forEach((slot) => {
      const prev = prevP2RevealStatesRef.current.get(slot.slotNumber);

      if (slot.isAnswerRevealed && (!prev || !prev.answer)) {
        if (enableSFX && audioEnabled) {
          playCorrectDing();
        }
      }

      if (slot.isPointsRevealed && (!prev || !prev.points)) {
        if (enableSFX && audioEnabled) {
          if (slot.pointsAwarded > 0) {
            playPointsChime();
          } else {
            playBuzzerBlip();
          }
        }
      }

      prevP2RevealStatesRef.current.set(slot.slotNumber, {
        answer: slot.isAnswerRevealed,
        points: slot.isPointsRevealed,
      });
    });
  }, [p2Slots, isP2RevealPhase, isGameOver, enableSFX, audioEnabled]);

  // 7. Victory Fanfare, Confetti, and Defeat Sounds (US-10 Scenario 2 & 3)
  useEffect(() => {
    if (isGameOver && !hasHandledGameOverRef.current) {
      hasHandledGameOverRef.current = true;

      if (isVictory) {
        // Victory Fanfare & TTS
        if (enableSFX && audioEnabled) {
          playVictoryFanfare();
        }
        if (enableTTS && audioEnabled) {
          speakVictory(language);
        }

        // Spectacular Confetti Bursts via canvas-confetti
        try {
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#f59e0b', '#fbbf24', '#3b82f6', '#10b981', '#ef4444', '#ec4899'],
          });

          setTimeout(() => {
            confetti({
              particleCount: 80,
              angle: 60,
              spread: 55,
              origin: { x: 0 },
            });
            confetti({
              particleCount: 80,
              angle: 120,
              spread: 55,
              origin: { x: 1 },
            });
          }, 350);
        } catch {
          // Safe fallback for virtual / non-canvas DOM environments
        }
      } else {
        // Defeat Sound & TTS
        if (enableSFX && audioEnabled) {
          playDefeatSound();
        }
        if (enableTTS && audioEnabled) {
          speakDefeat(language, grandTotal);
        }
      }
    } else if (!isGameOver) {
      hasHandledGameOverRef.current = false;
      setIsReplaying(false);
    }
  }, [isGameOver, isVictory, grandTotal, enableSFX, enableTTS, audioEnabled, language]);

  // 8. Auto-Pacing Execution Engine for P1 Reveal
  useEffect(() => {
    if (isPaused || !isAutoPacing || !isP1RevealPhase || !activeRevealSlotNumber) {
      if (autoPacingTimeoutRef.current) {
        clearTimeout(autoPacingTimeoutRef.current);
      }
      return;
    }

    const currentSlot = p1Slots.find((s) => s.slotNumber === activeRevealSlotNumber);
    if (!currentSlot) return;

    if (!currentSlot.isAnswerRevealed) {
      autoPacingTimeoutRef.current = setTimeout(() => {
        onRevealAnswer?.(activeRevealSlotNumber);
      }, 1200);
    } else if (!currentSlot.isPointsRevealed) {
      autoPacingTimeoutRef.current = setTimeout(() => {
        onRevealPoints?.(activeRevealSlotNumber);
      }, 1500);
    }

    return () => {
      if (autoPacingTimeoutRef.current) {
        clearTimeout(autoPacingTimeoutRef.current);
      }
    };
  }, [isPaused, isAutoPacing, isP1RevealPhase, activeRevealSlotNumber, p1Slots, onRevealAnswer, onRevealPoints]);

  // 9. Auto-Pacing Execution Engine for P2 Reveal with 1.5s Suspense Pause (US-10 Scenario 1)
  useEffect(() => {
    if (isPaused || !isAutoPacingP2 || !isP2RevealPhase || !activeP2RevealSlotNumber) {
      return;
    }

    const currentSlot = p2Slots.find((s) => s.slotNumber === activeP2RevealSlotNumber);
    if (!currentSlot) return;

    if (!currentSlot.isAnswerRevealed) {
      autoPacingTimeoutRef.current = setTimeout(() => {
        onRevealP2Answer?.(activeP2RevealSlotNumber);
      }, 1200);
    } else if (!currentSlot.isPointsRevealed) {
      autoPacingTimeoutRef.current = setTimeout(() => {
        onRevealP2Points?.(activeP2RevealSlotNumber);
      }, 1500);
    }

    return () => {
      if (autoPacingTimeoutRef.current) {
        clearTimeout(autoPacingTimeoutRef.current);
      }
    };
  }, [
    isPaused,
    isAutoPacingP2,
    isP2RevealPhase,
    activeP2RevealSlotNumber,
    p2Slots,
    onRevealP2Answer,
    onRevealP2Points,
  ]);

  const handleStartRevealClick = () => {
    if (onStartReveal) {
      onStartReveal();
    }
  };

  const handleStartP2RevealClick = () => {
    if (onStartP2Reveal) {
      onStartP2Reveal();
    }
  };

  const handleReplayClick = () => {
    if (onReplay && !isReplaying) {
      setIsReplaying(true);
      onReplay();
    }
  };

  const getTimerStyle = () => {
    if (remainingSeconds > 30) return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40';
    if (remainingSeconds > 10) return 'text-amber-400 border-amber-500/40 bg-amber-950/40';
    return 'text-feud-red border-red-500/50 bg-red-950/60 animate-pulse';
  };

  const isDualColumnView = isP2SpeedRound || isP2RevealPhase || isGameOver;

  return (
    <div
      data-testid="fast-money-host-board"
      className="w-full max-w-5xl flex flex-col items-center gap-6 animate-fade-in"
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
                  {isGameOver
                    ? isVictory
                      ? 'Fast Money Victory'
                      : 'Match Defeat'
                    : isP2RevealPhase
                    ? t.fastMoney.p2RevealPhaseTitle
                    : isP1RevealPhase || isReadyForP2
                    ? t.fastMoney.revealPhaseTitle
                    : isP2SpeedRound
                    ? t.fastMoney.p2SpeedRoundTitle
                    : 'Fast Money Speed Round'}
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

          {/* Right Header Area: Total Score (Reveal/Game Over) or Countdown Clock */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleAudio}
              data-testid="host-audio-toggle"
              title={audioEnabled ? 'Mute Sounds & TTS' : 'Unmute Sounds & TTS'}
              className="p-3 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              {audioEnabled ? (
                <Volume2 className="w-5 h-5 text-feud-gold" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-500" />
              )}
            </button>

            {isP1RevealPhase || isReadyForP2 || isP2RevealPhase || isGameOver ? (
              /* Cumulative Score Display with Target Indicator */
              <div
                data-testid="fast-money-total-score"
                className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl border font-black font-game text-3xl sm:text-4xl tracking-wider shadow-lg transition-all ${
                  isGameOver && isVictory
                    ? 'border-yellow-400 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 shadow-[0_0_25px_rgba(245,158,11,0.6)] animate-pulse'
                    : 'border-feud-gold/50 bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/60 text-feud-gold shadow-feud-gold/10'
                }`}
              >
                <Trophy
                  className={`w-7 h-7 shrink-0 ${
                    isGameOver && isVictory
                      ? 'text-slate-950 fill-current animate-bounce'
                      : 'text-feud-gold'
                  }`}
                />
                <span data-testid="host-total-score-digits">{totalScore}</span>
                <span className="text-xs font-bold uppercase tracking-widest opacity-80 ml-1">
                  / 200 PTS
                </span>
              </div>
            ) : (
              /* Synchronized 60s (P1) or 75s (P2) Clock */
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
              {isGameOver
                ? isVictory
                  ? 'Victory Celebration'
                  : 'Game Over'
                : isP2RevealPhase
                ? `Player 2 Reveal • Slot #${activeP2RevealSlotNumber ?? 1}`
                : isP1RevealPhase
                ? `Player 1 Reveal • Slot #${activeRevealSlotNumber ?? 1}`
                : isReadyForP2
                ? 'Player 1 Complete'
                : isP2Playing
                ? `Player 2 • Question #${activeNumber}`
                : `Question #${activeNumber}`}
            </span>
          </div>

          <h2
            data-testid="fast-money-host-question"
            className="text-xl sm:text-2xl font-black text-white leading-snug drop-shadow min-h-[3rem] flex items-center justify-center"
          >
            {isGameOver
              ? isVictory
                ? t.fastMoney.victoryTitle
                : t.fastMoney.defeatSubtitle.replace('{score}', String(grandTotal))
              : phase === 'P1_READY'
              ? "Waiting for Player 1 to press 'I'm Ready!'..."
              : phase === 'P1_FINISHED'
              ? 'Player 1 Speed Round Complete! Click "Start Reveal" below.'
              : isReadyForP2
              ? 'Player 1 Reveal Sequence Complete! Ready for Player 2.'
              : phase === 'P2_FINISHED'
              ? 'Player 2 Speed Round Complete! Click "Start Player 2 Reveal" below.'
              : isP2RevealPhase && activeP2RevealSlot
              ? activeP2RevealSlot.questionText
              : isP1RevealPhase && activeRevealSlot
              ? activeRevealSlot.questionText
              : currentQuestionText || 'Loading question...'}
          </h2>
        </div>

        {/* Duplicate Answer Warning Banner */}
        {activeWarning && (
          <div
            data-testid="host-duplicate-warning-banner"
            className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-red-600 via-amber-600 to-red-600 border-2 border-yellow-300 text-white text-center shadow-[0_0_30px_rgba(239,68,68,0.7)] animate-bounce"
          >
            <div className="flex items-center justify-center gap-2">
              <AlertTriangle className="w-7 h-7 text-yellow-300 shrink-0" />
              <span className="text-2xl font-black uppercase tracking-wider">
                {activeWarning.message || t.fastMoney.duplicateWarningHost}
              </span>
              <AlertTriangle className="w-7 h-7 text-yellow-300 shrink-0" />
            </div>
            {activeWarning.duplicateWithAnswer && (
              <p className="text-xs font-semibold text-yellow-100 mt-1">
                Player 1 already answered: &quot;{activeWarning.duplicateWithAnswer}&quot;
              </p>
            )}
          </div>
        )}

        {/* US-10 Scenario 2: Immediate Victory Celebratory Banner */}
        {isGameOver && isVictory && (
          <div
            data-testid="host-victory-banner"
            className="mt-6 p-6 rounded-3xl bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border-2 border-feud-gold text-center animate-fade-in shadow-[0_0_40px_rgba(245,158,11,0.4)]"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-feud-gold text-slate-950 font-black text-xs uppercase tracking-widest mb-3 shadow-md">
              <Award className="w-4 h-4" />
              <span>Fast Money Champions</span>
            </div>
            <h3 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-feud-gold to-amber-200">
              {t.fastMoney.victoryTitle}
            </h3>
            <p className="text-slate-200 text-sm sm:text-base font-semibold mt-2 max-w-xl mx-auto">
              {t.fastMoney.victorySubtitle}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              <span className="px-3 py-1 rounded-lg bg-slate-900/80 border border-slate-700">
                Player 1: <strong className="text-feud-gold">{p1TotalScore} pts</strong>
              </span>
              <span>+</span>
              <span className="px-3 py-1 rounded-lg bg-slate-900/80 border border-slate-700">
                Player 2: <strong className="text-blue-400">{p2TotalScore} pts</strong>
              </span>
              <span>=</span>
              <span className="px-3.5 py-1 rounded-lg bg-feud-gold/20 border border-feud-gold/40 text-feud-gold font-extrabold text-sm">
                Grand Total: {grandTotal} pts
              </span>
            </div>
          </div>
        )}

        {/* US-10 Scenario 3: Defeat Summary Banner (< 200 Points) */}
        {isGameOver && !isVictory && (
          <div
            data-testid="host-defeat-banner"
            className="mt-6 p-6 rounded-3xl bg-gradient-to-r from-red-950/40 via-slate-900 to-red-950/40 border border-red-500/40 text-center animate-fade-in shadow-xl"
          >
            <h3 className="text-2xl sm:text-3xl font-black text-red-400 uppercase tracking-wider">
              {t.fastMoney.defeatTitle}
            </h3>
            <p className="text-slate-300 text-base font-semibold mt-1">
              {t.fastMoney.defeatSubtitle.replace('{score}', String(grandTotal))}
            </p>
            <div className="mt-3 text-xs font-mono font-bold text-slate-400">
              Player 1 ({p1TotalScore} pts) + Player 2 ({p2TotalScore} pts) = {grandTotal} / 200 pts
            </div>
          </div>
        )}
      </div>

      {/* Answer & Point Slots Board */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 shadow-2xl">
        {/* Dual-Column Layout for Player 2 Speed Round, Reveal, and Game Over */}
        {isDualColumnView ? (
          <div>
            <div className="flex items-center justify-between border-b border-feud-slate-border/80 pb-4 mb-6">
              <h3 className="text-lg font-black uppercase tracking-wider text-slate-200">
                {isGameOver
                  ? 'Final Match Results'
                  : isP2RevealPhase
                  ? t.fastMoney.p2RevealPhaseTitle
                  : 'Fast Money Dual Column Board'}
              </h3>
              <div className="text-xs font-bold uppercase tracking-wider text-feud-gold">
                {isP2RevealPhase
                  ? `Player 2: ${p2Slots.filter((s) => s.isPointsRevealed).length} / 5 Revealed`
                  : isGameOver
                  ? `Match Completed • ${grandTotal} pts`
                  : `Player 2 Speed Round: ${snapshot?.answeredCount ?? 0} / 5 Answered`}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left Column: Player 1 Revealed Board */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-bold uppercase tracking-wider">
                  <span className="text-feud-gold font-extrabold">{t.fastMoney.p1ColumnTitle}</span>
                  <span className="text-feud-gold">{p1TotalScore} PTS</span>
                </div>
                {p1Slots.map((slot) => (
                  <div
                    key={`p1-${slot.slotNumber}`}
                    data-testid={`host-p1-slot-${slot.slotNumber}`}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 mr-2">
                      <span className="w-7 h-7 rounded-lg bg-slate-800 text-feud-gold text-xs font-black flex items-center justify-center shrink-0">
                        {slot.slotNumber}
                      </span>
                      <span className="font-mono text-sm font-bold text-white uppercase truncate">
                        {slot.rawAnswer || (
                          <span className="text-slate-500 italic">{t.fastMoney.noAnswer}</span>
                        )}
                      </span>
                    </div>
                    <div className="w-12 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center font-game font-black text-sm text-feud-gold">
                      {slot.pointsAwarded}
                    </div>
                  </div>
                ))}
              </div>

              {/* Right Column: Player 2 Slots (Playing, Reveal, or Game Over) */}
              <div
                className={`flex flex-col gap-3 p-4 rounded-2xl bg-slate-950/60 border transition-all ${
                  isP2RevealPhase
                    ? 'border-blue-500/50 shadow-lg shadow-blue-500/10'
                    : 'border-blue-500/30'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-bold uppercase tracking-wider">
                  <span className="text-blue-400 font-extrabold">{t.fastMoney.p2ColumnTitle}</span>
                  <span className="text-blue-400">
                    {isP2RevealPhase || isGameOver
                      ? `${p2TotalScore} PTS`
                      : `${snapshot?.answeredCount ?? 0} / 5 Answered`}
                  </span>
                </div>

                {p2Slots.map((slot) => {
                  const isPlayingActive =
                    phase === 'P2_PLAYING' && activeNumber === slot.slotNumber;
                  const isRevealActive =
                    isP2RevealPhase && activeP2RevealSlotNumber === slot.slotNumber;
                  const isFilled =
                    snapshot?.slots?.[slot.slotNumber - 1]?.isFilled ?? false;

                  return (
                    <div
                      key={`p2-${slot.slotNumber}`}
                      data-testid={`fast-money-slot-${slot.slotNumber}`}
                      className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all duration-300 ${
                        isRevealActive
                          ? 'border-blue-400 bg-slate-800/90 shadow-[0_0_20px_rgba(96,165,250,0.35)] scale-[1.01]'
                          : isPlayingActive
                          ? 'border-blue-400 bg-slate-800/90 shadow-[0_0_15px_rgba(96,165,250,0.3)]'
                          : 'border-slate-800 bg-slate-900/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 mr-2">
                        <span
                          className={`w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center shrink-0 ${
                            isRevealActive || isPlayingActive
                              ? 'bg-blue-500 text-white shadow'
                              : 'bg-slate-800 text-blue-400'
                          }`}
                        >
                          {slot.slotNumber}
                        </span>

                        <div
                          data-testid={`fast-money-slot-status-${slot.slotNumber}`}
                          className="font-mono text-sm tracking-wider font-bold truncate"
                        >
                          {isP2RevealPhase || isGameOver ? (
                            slot.isAnswerRevealed ? (
                              <span
                                data-testid={`revealed-answer-${slot.slotNumber}`}
                                className="text-white font-extrabold uppercase tracking-wide text-base drop-shadow"
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
                          ) : isFilled ? (
                            <span
                              data-testid={`fast-money-slot-filled-${slot.slotNumber}`}
                              className="inline-flex items-center gap-1.5 text-emerald-400"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
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

                      <div
                        data-testid={`revealed-points-box-${slot.slotNumber}`}
                        className={`w-14 h-8 rounded-lg border flex items-center justify-center font-game font-black text-sm select-none transition-all ${
                          slot.isPointsRevealed
                            ? slot.pointsAwarded > 0
                              ? 'bg-gradient-to-tr from-blue-600 to-cyan-400 text-slate-950 border-cyan-300 shadow-[0_0_10px_rgba(56,189,248,0.5)]'
                              : 'bg-slate-900 border-red-500/50 text-red-400'
                            : 'border-slate-800 bg-slate-950 text-slate-600'
                        }`}
                      >
                        {isP2RevealPhase || isGameOver ? (
                          slot.isPointsRevealed ? (
                            <span data-testid={`points-val-${slot.slotNumber}`}>
                              {slot.pointsAwarded}
                            </span>
                          ) : (
                            '--'
                          )
                        ) : isFilled ? (
                          '--'
                        ) : (
                          ''
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Single Column Layout for P1 Speed Round & P1 Reveal */
          <div>
            <div className="flex items-center justify-between border-b border-feud-slate-border/80 pb-4 mb-6">
              <h3 className="text-lg font-black uppercase tracking-wider text-slate-200">
                {isP1RevealPhase ? 'Player 1 Reveal Board' : 'Player 1 Board (Answers Concealed)'}
              </h3>
              <div className="text-xs font-bold uppercase tracking-wider text-feud-gold">
                {isP1RevealPhase
                  ? `${p1Slots.filter((s) => s.isPointsRevealed).length} / 5 Revealed`
                  : `${snapshot?.answeredCount ?? 0} / 5 Answered`}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {p1Slots.map((slot) => {
                const isActive = isP1RevealPhase && activeRevealSlotNumber === slot.slotNumber;
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

                      <div
                        data-testid={`fast-money-slot-status-${slot.slotNumber}`}
                        className="font-mono text-base tracking-wider font-bold truncate"
                      >
                        {isP1RevealPhase || isReadyForP2 ? (
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
                      {isP1RevealPhase || isReadyForP2 ? (
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
          </div>
        )}

        {/* P1 Reveal Pacing Controls */}
        {isP1RevealPhase && (
          <div
            data-testid="host-reveal-controls"
            className="mt-6 pt-6 border-t border-feud-slate-border/80 flex flex-wrap items-center justify-between gap-4"
          >
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

        {/* P2 Reveal Pacing Controls (US-10 Scenario 1) */}
        {isP2RevealPhase && (
          <div
            data-testid="host-p2-reveal-controls"
            className="mt-6 pt-6 border-t border-feud-slate-border/80 flex flex-wrap items-center justify-between gap-4"
          >
            <button
              type="button"
              onClick={() => setIsAutoPacingP2(!isAutoPacingP2)}
              data-testid="host-p2-auto-pacing-btn"
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border transition-all cursor-pointer ${
                isAutoPacingP2
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-md'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {isAutoPacingP2 ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>
                {isAutoPacingP2 ? t.fastMoney.autoPacing : t.fastMoney.manualPacing}
              </span>
            </button>

            {activeP2RevealSlotNumber && (
              <div className="flex items-center gap-3">
                {activeP2RevealSlot && !activeP2RevealSlot.isAnswerRevealed && (
                  <button
                    type="button"
                    onClick={() => onRevealP2Answer?.(activeP2RevealSlotNumber)}
                    data-testid="host-reveal-p2-answer-btn"
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 text-slate-950 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-500/20 cursor-pointer"
                  >
                    <span>
                      {t.fastMoney.revealAnswerBtn.replace(
                        '{num}',
                        String(activeP2RevealSlotNumber)
                      )}
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}

                {activeP2RevealSlot &&
                  activeP2RevealSlot.isAnswerRevealed &&
                  !activeP2RevealSlot.isPointsRevealed && (
                    <button
                      type="button"
                      onClick={() => onRevealP2Points?.(activeP2RevealSlotNumber)}
                      data-testid="host-reveal-p2-points-btn"
                      className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-amber-500 via-yellow-400 to-feud-gold text-slate-950 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-feud-gold/25 cursor-pointer"
                    >
                      <span>
                        {t.fastMoney.revealPointsBtn.replace(
                          '{num}',
                          String(activeP2RevealSlotNumber)
                        )}
                      </span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
              </div>
            )}
          </div>
        )}

        {/* Phase Transition: Start P1 Reveal */}
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

        {/* Phase Transition: Start P2 Reveal (US-10 Scenario 1) */}
        {phase === 'P2_FINISHED' && onStartP2Reveal && (
          <div className="mt-6 pt-6 border-t border-feud-slate-border/80 flex justify-center">
            <button
              type="button"
              onClick={handleStartP2RevealClick}
              data-testid="host-start-p2-reveal-btn"
              className="px-8 py-3.5 rounded-2xl font-black text-base uppercase tracking-wider bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 text-slate-950 shadow-xl shadow-blue-500/25 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-5 h-5 fill-slate-950" />
              <span>{t.fastMoney.startP2RevealBtn}</span>
            </button>
          </div>
        )}

        {/* P1 Reveal Completion Banner */}
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

        {/* Game Over Actions: Play Again in the Same Room (US-10 Scenario 4) */}
        {isGameOver && onReplay && (
          <div className="mt-8 pt-6 border-t border-feud-slate-border/80 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={handleReplayClick}
              disabled={isReplaying}
              data-testid="host-replay-btn"
              className={`px-8 py-4 rounded-2xl font-black text-base uppercase tracking-wider transition-all shadow-xl flex items-center gap-2.5 ${
                isReplaying
                  ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-wait'
                  : 'bg-gradient-to-r from-feud-gold via-amber-400 to-yellow-500 text-slate-950 shadow-feud-gold/25 hover:scale-105 active:scale-95 cursor-pointer animate-pulse'
              }`}
            >
              {isReplaying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Starting New Match...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-5 h-5" />
                  <span>{t.fastMoney.playAgain}</span>
                </>
              )}
            </button>
            <p className="text-xs text-slate-400">
              Resets scores and starts a fresh Fast Money round in the same room.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FastMoneyHostBoard;
