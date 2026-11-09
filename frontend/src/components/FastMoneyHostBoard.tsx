import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  HostStateSnapshot,
  TimerTickPayload,
  FastMoneyRevealSlot,
  DuplicateAnswerWarningPayload,
  GameOverPayload,
  QuestionRepeatRequestedPayload,
} from '../types';
import {
  speakQuestion,
  cancelSpeech,
  isTtsMuted,
  setTtsMuted,
  speakDuplicateAlert,
  speakVictory,
  speakDefeat,
  speakYouSaid,
  speakSurveySaid,
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
  AlertTriangle,
  RotateCcw,
  Loader2,
  Award,
} from 'lucide-react';

export interface TypewriterAnswerProps {
  text: string;
  animate?: boolean;
  speedMs?: number;
  className?: string;
  testId?: string;
  onComplete?: () => void;
}

export const TypewriterAnswer: React.FC<TypewriterAnswerProps> = ({
  text,
  animate = false,
  speedMs = 50,
  className = '',
  testId,
  onComplete,
}) => {
  const [visibleCount, setVisibleCount] = useState<number>(animate ? 0 : text.length);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!animate) {
      setVisibleCount(text.length);
      return;
    }

    setVisibleCount(0);
    const chars = Array.from(text);
    if (chars.length === 0) {
      onCompleteRef.current?.();
      return;
    }

    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setVisibleCount(current);
      if (current >= chars.length) {
        clearInterval(interval);
        onCompleteRef.current?.();
      }
    }, speedMs);

    return () => clearInterval(interval);
  }, [text, animate, speedMs]);

  const chars = Array.from(text);
  const visible = chars.slice(0, visibleCount).join('');
  const hidden = chars.slice(visibleCount).join('');

  return (
    <span
      data-testid={testId}
      data-revealed-length={visibleCount}
      data-animating={animate && visibleCount < chars.length}
      className={className}
    >
      <span>{visible}</span>
      {hidden.length > 0 && (
        <span className="opacity-0 select-none" aria-hidden="true">
          {hidden}
        </span>
      )}
    </span>
  );
};

export interface FastMoneyHostBoardProps {
  snapshot?: HostStateSnapshot | null;
  timerTick?: TimerTickPayload | null;
  duplicateWarning?: DuplicateAnswerWarningPayload | null;
  repeatQuestionAlert?: QuestionRepeatRequestedPayload | null;
  gameOver?: GameOverPayload | null;
  isPaused?: boolean;
  pausedRemainingSeconds?: number;
  language?: string;
  roomName?: string;
  roomCode?: string;
  player1Name?: string;
  player2Name?: string;
  enableTTS?: boolean;
  enableSFX?: boolean;
  defaultAutoPacing?: boolean;
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
  repeatQuestionAlert = null,
  gameOver = null,
  isPaused = false,
  pausedRemainingSeconds,
  language = 'EN',
  roomName = 'Family Feud',
  roomCode = '',
  player1Name,
  player2Name,
  enableTTS = true,
  enableSFX = true,
  defaultAutoPacing = true,
  onRevealAnswer,
  onRevealPoints,
  onStartReveal,
  onStartP2Reveal,
  onRevealP2Answer,
  onRevealP2Points,
  onReplay,
}) => {
  const { t } = useTranslation();
  const effectiveP1Name =
    player1Name || snapshot?.player1Name || t.fastMoney.p1ColumnTitle;
  const effectiveP2Name =
    player2Name || snapshot?.player2Name || t.fastMoney.p2ColumnTitle;
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
  const [isAutoPacing, setIsAutoPacing] = useState<boolean>(defaultAutoPacing);
  const [isAutoPacingP2, setIsAutoPacingP2] = useState<boolean>(defaultAutoPacing);
  const [animatingSlotNumbers, setAnimatingSlotNumbers] = useState<Set<number>>(new Set());
  const [animatingP2SlotNumbers, setAnimatingP2SlotNumbers] = useState<Set<number>>(new Set());
  const [activeWarning, setActiveWarning] = useState<DuplicateAnswerWarningPayload | null>(null);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);

  const lastSpokenQuestionRef = useRef<string | null>(null);
  const lastSpokenRevealSlotRef = useRef<number | null>(null);
  const lastSpokenP2RevealSlotRef = useRef<number | null>(null);
  const questionFinishedRef = useRef<Set<number>>(new Set());
  const questionP2FinishedRef = useRef<Set<number>>(new Set());
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
  const isP1SpeedRound = phase === 'P1_READY' || phase === 'P1_PLAYING' || phase === 'P1_FINISHED';
  const isGameOver = phase === 'GAME_OVER' || !!gameOver;
  const isP2OrGameOver = isP2SpeedRound || isP2RevealPhase || isGameOver;

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
    snapshot?.p1RevealSlots ?? snapshot?.revealSlots ?? snapshot?.p1Slots ?? defaultSlots;
  const p2Slots: FastMoneyRevealSlot[] =
    snapshot?.p2RevealSlots ?? snapshot?.revealSlots ?? snapshot?.p2Slots ?? defaultSlots;

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

  const [showRepeatAlert, setShowRepeatAlert] = useState<boolean>(false);
  const lastRepeatTimestampRef = useRef<number>(0);
  const repeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Contestant asks host to repeat the current question
  useEffect(() => {
    if (!repeatQuestionAlert || !repeatQuestionAlert.timestamp) return;
    if (repeatQuestionAlert.timestamp === lastRepeatTimestampRef.current) return;
    lastRepeatTimestampRef.current = repeatQuestionAlert.timestamp;

    setShowRepeatAlert(true);
    if (audioEnabled && enableSFX) {
      playPointsChime();
    }

    const isPlaying =
      snapshot?.phase === 'P1_PLAYING' ||
      snapshot?.phase === 'P2_PLAYING' ||
      phase === 'P1_PLAYING' ||
      phase === 'P2_PLAYING';

    const qText =
      currentQuestionText ||
      snapshot?.currentQuestionText ||
      p1Slots.find((s) => s.questionId === repeatQuestionAlert.questionId)?.questionText ||
      p2Slots.find((s) => s.questionId === repeatQuestionAlert.questionId)?.questionText;

    if (enableTTS && (audioEnabled || !isTtsMuted()) && isPlaying && qText) {
      cancelSpeech();
      speakQuestion(qText, language);
    }

    if (repeatTimeoutRef.current) {
      clearTimeout(repeatTimeoutRef.current);
    }

    repeatTimeoutRef.current = setTimeout(() => {
      setShowRepeatAlert(false);
    }, 4000);
  }, [repeatQuestionAlert, snapshot?.phase, currentQuestionText, audioEnabled, enableTTS, enableSFX, language]);

  // 3. Speak question via TTS when new slot begins in P1_REVEAL (US-08 Scenario 1 & US-26 Scenario 6)
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
      const questionTextToSpeak =
        activeRevealSlot.questionText && activeRevealSlot.questionText !== 'undefined'
          ? activeRevealSlot.questionText
          : '';
      speakQuestion(
        questionTextToSpeak
          ? `${p1Prefix} ${activeRevealSlotNumber}: ${questionTextToSpeak}`
          : `${p1Prefix} ${activeRevealSlotNumber}`,
        language
      );
    }
  }, [activeRevealSlotNumber, isP1RevealPhase, activeRevealSlot, language, enableTTS, audioEnabled]);

  // 4. Speak question via TTS when new slot begins in P2_REVEAL (US-10 Scenario 1 & US-26 Scenario 6)
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
      const questionTextToSpeak =
        activeP2RevealSlot.questionText && activeP2RevealSlot.questionText !== 'undefined'
          ? activeP2RevealSlot.questionText
          : '';
      speakQuestion(
        questionTextToSpeak
          ? `${p2Prefix} ${activeP2RevealSlotNumber}: ${questionTextToSpeak}`
          : `${p2Prefix} ${activeP2RevealSlotNumber}`,
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

  // Handlers for Reveal Sequence (Host reads question -> says "You said" -> reads answer + typewriters reveal <=100ms -> says "Survey said" -> reveals points & adds to total)
  const handleRevealAnswer = (slotNum: number) => {
    setAnimatingSlotNumbers((prev) => new Set(prev).add(slotNum));
    onRevealAnswer?.(slotNum);

    if (enableTTS && audioEnabled) {
      const currentSlot = p1Slots.find((s) => s.slotNumber === slotNum);
      const answerText = currentSlot?.rawAnswer || t.fastMoney.noAnswer;
      speakYouSaid(language, () => {
        speakQuestion(answerText, language);
      });
    }
  };

  const handleRevealPoints = (slotNum: number) => {
    onRevealPoints?.(slotNum);

    if (enableTTS && audioEnabled) {
      speakSurveySaid(language);
    }
  };

  const handleRevealP2Answer = (slotNum: number) => {
    setAnimatingP2SlotNumbers((prev) => new Set(prev).add(slotNum));
    onRevealP2Answer?.(slotNum);

    if (enableTTS && audioEnabled) {
      const currentSlot = p2Slots.find((s) => s.slotNumber === slotNum);
      const answerText = currentSlot?.rawAnswer || t.fastMoney.noAnswer;
      speakYouSaid(language, () => {
        speakQuestion(answerText, language);
      });
    }
  };

  const handleRevealP2Points = (slotNum: number) => {
    onRevealP2Points?.(slotNum);

    if (enableTTS && audioEnabled) {
      speakSurveySaid(language);
    }
  };

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
      // In Auto-Pacing: allow ample time for the host to read the question before revealing the answer!
      // When TTS is enabled, question speaking takes ~3.5 - 4.5 seconds.
      // When TTS is disabled (such as in Vitest timer tests), use 1200ms.
      const delayMs =
        enableTTS && audioEnabled && !isTtsMuted()
          ? Math.max(3500, (currentSlot.questionText?.length || 0) * 65)
          : 1200;

      autoPacingTimeoutRef.current = setTimeout(() => {
        handleRevealAnswer(activeRevealSlotNumber);
      }, delayMs);
    } else if (!currentSlot.isPointsRevealed) {
      autoPacingTimeoutRef.current = setTimeout(() => {
        handleRevealPoints(activeRevealSlotNumber);
      }, 1500);
    }

    return () => {
      if (autoPacingTimeoutRef.current) {
        clearTimeout(autoPacingTimeoutRef.current);
      }
    };
  }, [
    isPaused,
    isAutoPacing,
    isP1RevealPhase,
    activeRevealSlotNumber,
    p1Slots,
    language,
    enableTTS,
    audioEnabled,
    onRevealAnswer,
    onRevealPoints,
  ]);

  // 9. Auto-Pacing Execution Engine for P2 Reveal with 1.5s Suspense Pause (US-10 Scenario 1)
  useEffect(() => {
    if (isPaused || !isAutoPacingP2 || !isP2RevealPhase || !activeP2RevealSlotNumber) {
      return;
    }

    const currentSlot = p2Slots.find((s) => s.slotNumber === activeP2RevealSlotNumber);
    if (!currentSlot) return;

    if (!currentSlot.isAnswerRevealed) {
      const delayMs =
        enableTTS && audioEnabled && !isTtsMuted()
          ? Math.max(3500, (currentSlot.questionText?.length || 0) * 65)
          : 1200;

      autoPacingTimeoutRef.current = setTimeout(() => {
        handleRevealP2Answer(activeP2RevealSlotNumber);
      }, delayMs);
    } else if (!currentSlot.isPointsRevealed) {
      autoPacingTimeoutRef.current = setTimeout(() => {
        handleRevealP2Points(activeP2RevealSlotNumber);
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
    language,
    enableTTS,
    audioEnabled,
    onRevealP2Answer,
    onRevealP2Points,
  ]);

  const handleStartRevealClick = () => {
    setIsAutoPacing(true);
    if (onStartReveal) {
      onStartReveal();
    }
  };

  const handleStartP2RevealClick = () => {
    setIsAutoPacingP2(true);
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

  return (
    <div
      data-testid="fast-money-host-board"
      className="w-full max-w-5xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] flex flex-col items-center gap-2 sm:gap-3 2xl:gap-3.5 animate-fade-in"
    >
      {/* Top TV Scoreboard Header */}
      <div className="w-full bg-feud-slate-card/95 backdrop-blur-xl border border-feud-slate-border rounded-xl sm:rounded-2xl p-3 sm:p-4 2xl:p-4.5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-feud-slate-border/80 pb-2.5 sm:pb-3">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-feud-gold/20 border border-feud-gold/40 text-feud-gold">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-feud-gold px-2 py-0.5 rounded-full bg-feud-gold/10 border border-feud-gold/20">
                  {isGameOver
                    ? isVictory
                      ? 'Fast Money Victory'
                      : 'Match Defeat'
                    : isP2RevealPhase
                    ? `${effectiveP2Name} Reveal`
                    : isP1RevealPhase || isReadyForP2
                    ? `${effectiveP1Name} Reveal`
                    : isP2SpeedRound
                    ? `${effectiveP2Name} Speed Round`
                    : `${effectiveP1Name} Speed Round`}
                </span>
                <span
                  data-testid="host-phase-badge"
                  className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-green-400 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20"
                >
                  {phase}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl 2xl:text-2xl font-black text-white mt-0.5 flex items-center gap-2">
                <span>{roomName}</span>
                {roomCode && (
                  <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded-md bg-slate-800 text-feud-gold border border-slate-700">
                    {roomCode}
                  </span>
                )}
              </h1>
            </div>
          </div>

          {/* Right Header Area: Total Score (Reveal/Game Over) or Countdown Clock */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={handleToggleAudio}
              data-testid="host-audio-toggle"
              title={audioEnabled ? 'Mute Sounds & TTS' : 'Unmute Sounds & TTS'}
              className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              {audioEnabled ? (
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-feud-gold" />
              ) : (
                <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
              )}
            </button>

            {isP1RevealPhase || isReadyForP2 || isP2RevealPhase || isGameOver ? (
              /* Cumulative Score Display with Target Indicator */
              <div
                data-testid="fast-money-total-score"
                className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border font-black font-game text-xl sm:text-2xl tracking-wider shadow-lg transition-all ${
                  isGameOver && isVictory
                    ? 'border-yellow-400 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 shadow-[0_0_25px_rgba(245,158,11,0.6)] animate-pulse'
                    : 'border-feud-gold/50 bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/60 text-feud-gold shadow-feud-gold/10'
                }`}
              >
                <Trophy
                  className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${
                    isGameOver && isVictory
                      ? 'text-slate-950 fill-current animate-bounce'
                      : 'text-feud-gold'
                  }`}
                />
                <span data-testid="host-total-score-digits">{totalScore}</span>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest opacity-80 ml-0.5">
                  / 200 PTS
                </span>
              </div>
            ) : (
              /* Synchronized 60s (P1) or 75s (P2) Clock */
              <div
                data-testid="fast-money-host-timer"
                className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border font-black font-game text-xl sm:text-2xl tracking-wider transition-colors shadow-lg ${getTimerStyle()}`}
              >
                <Timer className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span>{remainingSeconds}s</span>
              </div>
            )}
          </div>
        </div>

        {/* Active Question Banner */}
        <div className="mt-2 sm:mt-2.5 p-2 sm:p-2.5 2xl:p-3 rounded-xl bg-gradient-to-r from-feud-blue-dark via-feud-blue to-feud-blue-dark border border-feud-gold/40 shadow-inner text-center">
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-feud-gold/20 border border-feud-gold/30 text-feud-gold text-[9px] sm:text-[10px] 2xl:text-xs font-extrabold uppercase tracking-widest mb-0.5">
            <Sparkles className="w-3 h-3" />
            <span>
              {isGameOver
                ? isVictory
                  ? 'Victory Celebration'
                  : 'Game Over'
                : isP2RevealPhase
                ? `${effectiveP2Name} Reveal • Slot #${activeP2RevealSlotNumber ?? 1}`
                : isP1RevealPhase
                ? `${effectiveP1Name} Reveal • Slot #${activeRevealSlotNumber ?? 1}`
                : isReadyForP2
                ? `${effectiveP1Name} Complete`
                : isP2Playing
                ? `${effectiveP2Name} • Question #${activeNumber}`
                : `${effectiveP1Name} • Question #${activeNumber}`}
            </span>
          </div>

          <h2
            data-testid="fast-money-host-question"
            className="text-base sm:text-lg 2xl:text-xl font-black text-white leading-snug drop-shadow min-h-[1.75rem] flex items-center justify-center"
          >
            {isGameOver
              ? isVictory
                ? t.fastMoney.victoryTitle
                : t.fastMoney.defeatSubtitle.replace('{score}', String(grandTotal))
              : phase === 'P1_READY'
              ? `Waiting for ${effectiveP1Name} to press 'I\'m Ready!'...`
              : phase === 'P1_FINISHED'
              ? `${effectiveP1Name} Speed Round Complete! Click "Start Reveal" below.`
              : isReadyForP2
              ? `${effectiveP1Name} Reveal Sequence Complete! Ready for ${effectiveP2Name}.`
              : phase === 'P2_FINISHED'
              ? `${effectiveP2Name} Speed Round Complete! Click "Start ${effectiveP2Name} Reveal" below.`
              : isP2RevealPhase && activeP2RevealSlot
              ? activeP2RevealSlot.questionText
              : isP1RevealPhase && activeRevealSlot
              ? activeRevealSlot.questionText
              : currentQuestionText || 'Loading question...'}
          </h2>
        </div>

        {/* Repeat Question Alert Banner */}
        {showRepeatAlert && (
          <div
            data-testid="host-repeat-question-banner"
            className="mt-2.5 sm:mt-3 p-3 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 border-2 border-yellow-200 text-slate-950 text-center shadow-[0_0_30px_rgba(245,158,11,0.6)] animate-bounce"
          >
            <div className="flex items-center justify-center gap-2">
              <Volume2 className="w-5 h-5 fill-slate-950 shrink-0" />
              <span className="text-base sm:text-lg font-black uppercase tracking-wider">
                {t.fastMoney.hostRepeatAlert.replace(
                  '{name}',
                  isP2Playing ? effectiveP2Name : effectiveP1Name
                )}
              </span>
              <Volume2 className="w-5 h-5 fill-slate-950 shrink-0" />
            </div>
          </div>
        )}

        {/* Duplicate Answer Warning Banner */}
        {activeWarning && (
          <div
            data-testid="host-duplicate-warning-banner"
            className="mt-2.5 sm:mt-3 p-3 rounded-xl bg-gradient-to-r from-red-600 via-amber-600 to-red-600 border-2 border-yellow-300 text-white text-center shadow-[0_0_30px_rgba(239,68,68,0.7)] animate-bounce"
          >
            <div className="flex items-center justify-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-300 shrink-0" />
              <span className="text-lg sm:text-xl font-black uppercase tracking-wider">
                {activeWarning.message || t.fastMoney.duplicateWarningHost}
              </span>
              <AlertTriangle className="w-5 h-5 text-yellow-300 shrink-0" />
            </div>
            {activeWarning.duplicateWithAnswer && (
              <p className="text-xs font-semibold text-yellow-100 mt-0.5">
                {effectiveP1Name} already answered: &quot;{activeWarning.duplicateWithAnswer}&quot;
              </p>
            )}
          </div>
        )}

        {/* US-10 Scenario 2: Immediate Victory Celebratory Banner */}
        {isGameOver && isVictory && (
          <div
            data-testid="host-victory-banner"
            className="mt-2.5 sm:mt-3 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border-2 border-feud-gold text-center animate-fade-in shadow-[0_0_30px_rgba(245,158,11,0.3)]"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-feud-gold text-slate-950 font-black text-[10px] sm:text-xs uppercase tracking-widest mb-1.5 shadow-md">
              <Award className="w-3.5 h-3.5" />
              <span>Fast Money Champions</span>
            </div>
            <h3 className="text-xl sm:text-2xl 2xl:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-feud-gold to-amber-200">
              {t.fastMoney.victoryTitle}
            </h3>
            <p className="text-slate-200 text-xs sm:text-sm font-semibold mt-1 max-w-xl mx-auto">
              {t.fastMoney.victorySubtitle}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              <span className="px-2.5 py-0.5 rounded-lg bg-slate-900/80 border border-slate-700">
                {effectiveP1Name}: <strong className="text-feud-gold">{p1TotalScore} pts</strong>
              </span>
              <span>+</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-slate-900/80 border border-slate-700">
                {effectiveP2Name}: <strong className="text-blue-400">{p2TotalScore} pts</strong>
              </span>
              <span>=</span>
              <span className="px-3 py-0.5 rounded-lg bg-feud-gold/20 border border-feud-gold/40 text-feud-gold font-extrabold text-xs sm:text-sm">
                Grand Total: {grandTotal} pts
              </span>
            </div>
          </div>
        )}

        {/* US-10 Scenario 3: Defeat Summary Banner (< 200 Points) */}
        {isGameOver && !isVictory && (
          <div
            data-testid="host-defeat-banner"
            className="mt-2.5 sm:mt-3 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-red-950/40 via-slate-900 to-red-950/40 border border-red-500/40 text-center animate-fade-in shadow-xl"
          >
            <h3 className="text-lg sm:text-xl font-black text-red-400 uppercase tracking-wider">
              {t.fastMoney.defeatTitle}
            </h3>
            <p className="text-slate-300 text-xs sm:text-sm font-semibold mt-0.5">
              {t.fastMoney.defeatSubtitle.replace('{score}', String(grandTotal))}
            </p>
            <div className="mt-2 text-xs font-mono font-bold text-slate-400">
              {effectiveP1Name} ({p1TotalScore} pts) + {effectiveP2Name} ({p2TotalScore} pts) = {grandTotal} / 200 pts
            </div>
          </div>
        )}
      </div>

      {/* Answer & Point Slots Board: Permanent Dual-Column Layout for Both Players */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-xl sm:rounded-2xl p-3 sm:p-4 2xl:p-5 shadow-xl">
        <div>
          <div className="flex items-center justify-between border-b border-feud-slate-border/80 pb-2 mb-2.5 sm:mb-3">
            <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-200">
              {isGameOver
                ? 'Final Match Results'
                : isP2RevealPhase
                ? t.fastMoney.p2RevealPhaseTitle
                : isP2SpeedRound
                ? 'Fast Money Dual Column Board'
                : isP1RevealPhase
                ? t.fastMoney.revealPhaseTitle
                : 'Fast Money Survey Board'}
            </h3>
            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-feud-gold">
              {isP2RevealPhase
                ? `${effectiveP2Name}: ${p2Slots.filter((s) => s.isPointsRevealed).length} / 5 Revealed`
                : isGameOver
                ? `Match Completed • ${grandTotal} pts`
                : isP2SpeedRound
                ? `${effectiveP2Name} Speed Round: ${snapshot?.answeredCount ?? 0} / 5 Answered`
                : isP1RevealPhase
                ? `${effectiveP1Name}: ${p1Slots.filter((s) => s.isPointsRevealed).length} / 5 Revealed`
                : `${effectiveP1Name} Speed Round: ${snapshot?.answeredCount ?? 0} / 5 Answered`}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3.5">
            {/* Left Column: Player 1 Board */}
            <div
              className={`flex flex-col gap-1.5 sm:gap-2 p-2 sm:p-2.5 2xl:p-3 rounded-xl bg-slate-950/60 border transition-all ${
                !isP2OrGameOver && isP1RevealPhase
                  ? 'border-feud-gold/50 shadow-md shadow-feud-gold/10'
                  : !isP2OrGameOver
                  ? 'border-feud-gold/30'
                  : 'border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                <span className="text-feud-gold font-extrabold">{effectiveP1Name}</span>
                <span className="text-feud-gold">
                  {isP1SpeedRound
                    ? `${snapshot?.answeredCount ?? 0} / 5 Answered`
                    : `${p1TotalScore} PTS`}
                </span>
              </div>
              {p1Slots.map((slot) => {
                if (isP2OrGameOver) {
                  // In P2 or Game Over: Player 1 slots are a fully revealed summary
                  return (
                    <div
                      key={`p1-${slot.slotNumber}`}
                      data-testid={`host-p1-slot-${slot.slotNumber}`}
                      className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg border border-slate-800/80 bg-slate-900/60"
                    >
                      <div className="flex items-center gap-2 min-w-0 mr-2">
                        <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-slate-800 text-feud-gold text-[10px] sm:text-xs font-black flex items-center justify-center shrink-0">
                          {slot.slotNumber}
                        </span>
                        <span className="font-mono text-xs sm:text-sm font-bold text-white uppercase truncate">
                          {slot.rawAnswer || (
                            <span className="text-slate-500 italic">{t.fastMoney.noAnswer}</span>
                          )}
                        </span>
                      </div>
                      <div className="w-10 sm:w-12 h-6 sm:h-7 rounded-md bg-slate-900 border border-slate-800 flex items-center justify-center font-game font-black text-xs sm:text-sm text-feud-gold">
                        {slot.pointsAwarded}
                      </div>
                    </div>
                  );
                }

                // In P1 Speed Round, P1 Reveal, or Ready For P2: Player 1 is actively playing/revealing
                const isActive = isP1RevealPhase && activeRevealSlotNumber === slot.slotNumber;
                const isPlayingActive =
                  phase === 'P1_PLAYING' && activeNumber === slot.slotNumber;
                const isFilled =
                  Boolean(slot.rawAnswer) || Boolean(snapshot?.slots?.[slot.slotNumber - 1]?.isFilled);

                return (
                  <div
                    key={`p1-${slot.slotNumber}`}
                    data-testid={`fast-money-slot-${slot.slotNumber}`}
                    className={`flex items-center justify-between p-2 sm:p-2.5 rounded-lg border-2 transition-all duration-300 ${
                      isActive
                        ? 'border-feud-gold bg-slate-800/90 shadow-[0_0_15px_rgba(245,158,11,0.35)] scale-[1.01]'
                        : isPlayingActive
                        ? 'border-blue-400 bg-slate-800/90 shadow-[0_0_10px_rgba(96,165,250,0.3)]'
                        : 'border-slate-800 bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 mr-2">
                      <span
                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md font-black text-[10px] sm:text-xs flex items-center justify-center shrink-0 ${
                          isActive
                            ? 'bg-feud-gold text-slate-950 border-yellow-300 shadow-md'
                            : isPlayingActive
                            ? 'bg-blue-500 text-white shadow'
                            : 'bg-slate-800 text-feud-gold'
                        }`}
                      >
                        {slot.slotNumber}
                      </span>

                      <div
                        data-testid={`fast-money-slot-status-${slot.slotNumber}`}
                        className="font-mono text-xs sm:text-sm tracking-wider font-bold truncate"
                      >
                        {isP1RevealPhase || isReadyForP2 ? (
                          slot.isAnswerRevealed ? (
                            <TypewriterAnswer
                              testId={`revealed-answer-${slot.slotNumber}`}
                              text={slot.rawAnswer || t.fastMoney.noAnswer}
                              animate={animatingSlotNumbers.has(slot.slotNumber)}
                              speedMs={50}
                              className="text-white font-extrabold uppercase tracking-wide text-xs sm:text-sm drop-shadow"
                            />
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
                      className={`w-11 sm:w-12 h-6 sm:h-7 rounded-md border flex items-center justify-center font-game font-black text-xs sm:text-sm select-none transition-all ${
                        slot.isPointsRevealed
                          ? slot.pointsAwarded > 0
                            ? 'bg-gradient-to-tr from-amber-600 to-yellow-400 text-slate-950 border-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                            : 'bg-slate-900 border-red-500/50 text-red-400'
                          : 'border-slate-800 bg-slate-950 text-slate-600'
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

            {/* Right Column: Player 2 Board */}
            <div
              className={`flex flex-col gap-1.5 sm:gap-2 p-2 sm:p-2.5 2xl:p-3 rounded-xl bg-slate-950/60 border transition-all ${
                isP2RevealPhase
                  ? 'border-blue-500/50 shadow-md shadow-blue-500/10'
                  : isP2SpeedRound
                  ? 'border-blue-500/30'
                  : 'border-slate-800/80 opacity-80'
              }`}
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                <span className="text-blue-400 font-extrabold">{effectiveP2Name}</span>
                <span className="text-blue-400">
                  {isP2RevealPhase || isGameOver
                    ? `${p2TotalScore} PTS`
                    : isP2SpeedRound
                    ? `${snapshot?.answeredCount ?? 0} / 5 Answered`
                    : isReadyForP2
                    ? 'Ready'
                    : 'Waiting...'}
                </span>
              </div>

              {p2Slots.map((slot) => {
                if (!isP2OrGameOver) {
                  // In P1 phases: Player 2 board is waiting
                  return (
                    <div
                      key={`p2-waiting-${slot.slotNumber}`}
                      data-testid={`host-p2-slot-${slot.slotNumber}`}
                      className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg border border-slate-800/60 bg-slate-900/40"
                    >
                      <div className="flex items-center gap-2 min-w-0 mr-2">
                        <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-md font-black text-[10px] sm:text-xs flex items-center justify-center shrink-0 bg-slate-800/60 text-blue-400/50">
                          {slot.slotNumber}
                        </span>
                        <span className="text-slate-600 select-none font-mono text-xs sm:text-sm tracking-widest">
                          — — — — — — — — — —
                        </span>
                      </div>
                      <div className="w-11 sm:w-12 h-6 sm:h-7 rounded-md border border-slate-800/60 bg-slate-950/60 flex items-center justify-center font-game font-black text-xs sm:text-sm text-slate-700 select-none">
                        {''}
                      </div>
                    </div>
                  );
                }

                // In P2 Speed Round, P2 Reveal, or Game Over: Player 2 is actively playing/revealing
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
                    className={`flex items-center justify-between p-2 sm:p-2.5 rounded-lg border-2 transition-all duration-300 ${
                      isRevealActive
                        ? 'border-blue-400 bg-slate-800/90 shadow-[0_0_15px_rgba(96,165,250,0.35)] scale-[1.01]'
                        : isPlayingActive
                        ? 'border-blue-400 bg-slate-800/90 shadow-[0_0_10px_rgba(96,165,250,0.3)]'
                        : 'border-slate-800 bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 mr-2">
                      <span
                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md font-black text-[10px] sm:text-xs flex items-center justify-center shrink-0 ${
                          isRevealActive || isPlayingActive
                            ? 'bg-blue-500 text-white shadow'
                            : 'bg-slate-800 text-blue-400'
                        }`}
                      >
                        {slot.slotNumber}
                      </span>

                      <div
                        data-testid={`fast-money-slot-status-${slot.slotNumber}`}
                        className="font-mono text-xs sm:text-sm tracking-wider font-bold truncate"
                      >
                        {isP2RevealPhase || isGameOver ? (
                          slot.isAnswerRevealed ? (
                            <TypewriterAnswer
                              testId={`revealed-answer-${slot.slotNumber}`}
                              text={slot.rawAnswer || t.fastMoney.noAnswer}
                              animate={animatingP2SlotNumbers.has(slot.slotNumber)}
                              speedMs={50}
                              className="text-white font-extrabold uppercase tracking-wide text-xs sm:text-sm drop-shadow"
                            />
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
                      className={`w-11 sm:w-12 h-6 sm:h-7 rounded-md border flex items-center justify-center font-game font-black text-xs sm:text-sm select-none transition-all ${
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

        {/* P1 Reveal Pacing Controls */}
        {isP1RevealPhase && (
          <div
            data-testid="host-reveal-controls"
            className="mt-3 sm:mt-3.5 pt-2.5 sm:pt-3 border-t border-feud-slate-border/80 flex flex-wrap items-center justify-between gap-2.5"
          >
            <button
              type="button"
              onClick={() => setIsAutoPacing(!isAutoPacing)}
              data-testid="host-auto-pacing-btn"
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl font-bold text-xs sm:text-sm border transition-all cursor-pointer ${
                isAutoPacing
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-md'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {isAutoPacing ? <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              <span>
                {isAutoPacing ? t.fastMoney.autoPacing : t.fastMoney.manualPacing}
              </span>
            </button>

            {activeRevealSlotNumber && (
              <div className="flex items-center gap-2 sm:gap-2.5">
                {activeRevealSlot && !activeRevealSlot.isAnswerRevealed && (
                  <button
                    type="button"
                    onClick={() => handleRevealAnswer(activeRevealSlotNumber)}
                    data-testid="host-reveal-answer-btn"
                    className="flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider bg-gradient-to-r from-feud-gold via-amber-400 to-yellow-500 text-slate-950 hover:scale-105 active:scale-95 transition-all shadow-md shadow-feud-gold/20 cursor-pointer"
                  >
                    <span>
                      {t.fastMoney.revealAnswerBtn.replace(
                        '{num}',
                        String(activeRevealSlotNumber)
                      )}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                )}

                {activeRevealSlot &&
                  activeRevealSlot.isAnswerRevealed &&
                  !activeRevealSlot.isPointsRevealed && (
                    <button
                      type="button"
                      onClick={() => handleRevealPoints(activeRevealSlotNumber)}
                      data-testid="host-reveal-points-btn"
                      className="flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider bg-gradient-to-r from-amber-500 via-yellow-400 to-feud-gold text-slate-950 hover:scale-105 active:scale-95 transition-all shadow-md shadow-feud-gold/25 cursor-pointer"
                    >
                      <span>
                        {t.fastMoney.revealPointsBtn.replace(
                          '{num}',
                          String(activeRevealSlotNumber)
                        )}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
            className="mt-3 sm:mt-3.5 pt-2.5 sm:pt-3 border-t border-feud-slate-border/80 flex flex-wrap items-center justify-between gap-2.5"
          >
            <button
              type="button"
              onClick={() => setIsAutoPacingP2(!isAutoPacingP2)}
              data-testid="host-p2-auto-pacing-btn"
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl font-bold text-xs sm:text-sm border transition-all cursor-pointer ${
                isAutoPacingP2
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-md'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {isAutoPacingP2 ? <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              <span>
                {isAutoPacingP2 ? t.fastMoney.autoPacing : t.fastMoney.manualPacing}
              </span>
            </button>

            {activeP2RevealSlotNumber && (
              <div className="flex items-center gap-2 sm:gap-2.5">
                {activeP2RevealSlot && !activeP2RevealSlot.isAnswerRevealed && (
                  <button
                    type="button"
                    onClick={() => handleRevealP2Answer(activeP2RevealSlotNumber)}
                    data-testid="host-reveal-p2-answer-btn"
                    className="flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 text-slate-950 hover:scale-105 active:scale-95 transition-all shadow-md shadow-blue-500/20 cursor-pointer"
                  >
                    <span>
                      {t.fastMoney.revealAnswerBtn.replace(
                        '{num}',
                        String(activeP2RevealSlotNumber)
                      )}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                )}

                {activeP2RevealSlot &&
                  activeP2RevealSlot.isAnswerRevealed &&
                  !activeP2RevealSlot.isPointsRevealed && (
                    <button
                      type="button"
                      onClick={() => handleRevealP2Points(activeP2RevealSlotNumber)}
                      data-testid="host-reveal-p2-points-btn"
                      className="flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider bg-gradient-to-r from-amber-500 via-yellow-400 to-feud-gold text-slate-950 hover:scale-105 active:scale-95 transition-all shadow-md shadow-feud-gold/25 cursor-pointer"
                    >
                      <span>
                        {t.fastMoney.revealPointsBtn.replace(
                          '{num}',
                          String(activeP2RevealSlotNumber)
                        )}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  )}
              </div>
            )}
          </div>
        )}

        {/* Phase Transition: Start P1 Reveal */}
        {phase === 'P1_FINISHED' && onStartReveal && (
          <div className="mt-3 sm:mt-3.5 pt-2.5 sm:pt-3 border-t border-feud-slate-border/80 flex justify-center">
            <button
              type="button"
              onClick={handleStartRevealClick}
              data-testid="host-start-reveal-btn"
              className="px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider bg-gradient-to-r from-feud-gold via-amber-400 to-yellow-500 text-slate-950 shadow-lg shadow-feud-gold/25 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 fill-slate-950" />
              <span>{player1Name ? `Start ${player1Name} Reveal` : 'Start Fast Money Reveal'}</span>
            </button>
          </div>
        )}

        {/* Phase Transition: Start P2 Reveal (US-10 Scenario 1) */}
        {phase === 'P2_FINISHED' && onStartP2Reveal && (
          <div className="mt-3 sm:mt-3.5 pt-2.5 sm:pt-3 border-t border-feud-slate-border/80 flex justify-center">
            <button
              type="button"
              onClick={handleStartP2RevealClick}
              data-testid="host-start-p2-reveal-btn"
              className="px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 text-slate-950 shadow-lg shadow-blue-500/25 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 fill-slate-950" />
              <span>{player2Name ? `Start ${player2Name} Reveal` : t.fastMoney.startP2RevealBtn}</span>
            </button>
          </div>
        )}

        {/* Game Over Actions: Play Again in the Same Room (US-10 Scenario 4) */}
        {isGameOver && onReplay && (
          <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-feud-slate-border/80 flex flex-col items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleReplayClick}
              disabled={isReplaying}
              data-testid="host-replay-btn"
              className={`px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider transition-all shadow-lg flex items-center gap-2 ${
                isReplaying
                  ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-wait'
                  : 'bg-gradient-to-r from-feud-gold via-amber-400 to-yellow-500 text-slate-950 shadow-feud-gold/25 hover:scale-105 active:scale-95 cursor-pointer animate-pulse'
              }`}
            >
              {isReplaying ? (
                <>
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  <span>Starting New Match...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>{t.fastMoney.playAgain}</span>
                </>
              )}
            </button>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Resets scores and starts a fresh Fast Money round in the same room.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FastMoneyHostBoard;
