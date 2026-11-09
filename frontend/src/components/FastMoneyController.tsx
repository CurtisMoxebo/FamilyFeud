import React, { useState, useEffect, useRef } from 'react';
import {
  Player1StateSnapshot,
  Player2IsolationSnapshot,
  TimerTickPayload,
  DuplicateAnswerWarningPayload,
  GameOverPayload,
} from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { triggerHaptic } from '../utils/haptics';
import { useVirtualKeyboard } from '../hooks/useVirtualKeyboard';
import {
  Timer,
  Zap,
  CheckCircle2,
  Send,
  SkipForward,
  Sparkles,
  Lock,
  AlertCircle,
  Trophy,
} from 'lucide-react';

export interface FastMoneyControllerProps {
  snapshot: Player1StateSnapshot | Player2IsolationSnapshot;
  timerTick?: TimerTickPayload | null;
  duplicateWarning?: DuplicateAnswerWarningPayload | null;
  gameOver?: GameOverPayload | null;
  isPaused?: boolean;
  pausedRemainingSeconds?: number;
  onClearDuplicateWarning?: () => void;
  playerNumber?: 1 | 2;
  playerName?: string;
  partnerName?: string;
  player1Name?: string;
  player2Name?: string;
  onReady: () => void;
  onSubmitAnswer: (questionId: string, answer: string) => void;
  onPass: (questionId: string) => void;
  onLeave?: () => void;
}

export const FastMoneyController: React.FC<FastMoneyControllerProps> = ({
  snapshot,
  timerTick = null,
  duplicateWarning = null,
  gameOver = null,
  isPaused = false,
  pausedRemainingSeconds,
  onClearDuplicateWarning,
  playerNumber,
  playerName,
  partnerName,
  player1Name,
  player2Name,
  onReady,
  onSubmitAnswer,
  onPass,
}) => {
  const { t } = useTranslation();
  const [answerText, setAnswerText] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);
  const { isKeyboardOpen, keepElementVisible } = useVirtualKeyboard();

  const isPlayer2 =
    playerNumber === 2 ||
    (playerNumber !== 1 && snapshot.phase.startsWith('P2') && !('revealSlots' in snapshot && snapshot.revealSlots));
  const isPlaying = snapshot.phase === 'P1_PLAYING' || snapshot.phase === 'P2_PLAYING';

  const effectivePlayerName =
    playerName ||
    (isPlayer2 ? player2Name || 'Player 2' : player1Name || 'Player 1');
  const effectivePartnerName =
    partnerName ||
    (isPlayer2 ? player1Name || 'Player 1' : player2Name || 'Player 2');

  // Synchronized countdown timer value (authoritative timer tick takes priority)
  const remainingSeconds =
    isPaused && typeof pausedRemainingSeconds === 'number' && pausedRemainingSeconds > 0
      ? pausedRemainingSeconds
      : timerTick && typeof timerTick.secondsRemaining === 'number'
      ? timerTick.secondsRemaining
      : snapshot.remainingSeconds;

  // US-22 Scenario 4: Ensure question card + input + buttons stay above soft keyboard
  useEffect(() => {
    if (isKeyboardOpen && isPlaying) {
      keepElementVisible(activeCardRef.current);
    }
  }, [isKeyboardOpen, isPlaying, snapshot.currentQuestion?.id, keepElementVisible]);

  // Auto-focus input and reset value on each new question (DoD Requirement)
  useEffect(() => {
    if (isPlaying && snapshot.currentQuestion) {
      setAnswerText('');
      // Small timeout ensures DOM focus after question re-render on mobile
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [snapshot.currentQuestion?.id, isPlaying]);

  // US-09 Scenario 2: Duplicate Answer Detection Shake, Haptic & Clear
  useEffect(() => {
    if (duplicateWarning) {
      // Clear input field (DoD Requirement)
      setAnswerText('');

      // Trigger mobile haptic feedback via shared US-22 haptics engine
      triggerHaptic('strike');

      // Trigger shake animation (DoD Requirement)
      setIsShaking(true);
      const shakeTimer = setTimeout(() => {
        setIsShaking(false);
      }, 600);

      // Re-focus input field immediately (DoD Requirement)
      const focusTimer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      return () => {
        clearTimeout(shakeTimer);
        clearTimeout(focusTimer);
      };
    }
  }, [duplicateWarning]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAnswerText(e.target.value);
    if (duplicateWarning && onClearDuplicateWarning) {
      onClearDuplicateWarning();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = answerText.trim();
    if (isPaused || !trimmed || !snapshot.currentQuestion || snapshot.canSubmit === false) {
      return;
    }
    if (onClearDuplicateWarning) {
      onClearDuplicateWarning();
    }
    onSubmitAnswer(snapshot.currentQuestion.id, trimmed);
    setAnswerText('');
  };

  const handlePass = () => {
    if (isPaused || !snapshot.currentQuestion || snapshot.canPass === false) {
      return;
    }
    if (onClearDuplicateWarning) {
      onClearDuplicateWarning();
    }
    onPass(snapshot.currentQuestion.id);
    setAnswerText('');
  };

  // Timer color indicator
  const getTimerColorClass = () => {
    if (remainingSeconds > 30) return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40';
    if (remainingSeconds > 10) return 'text-amber-400 border-amber-500/40 bg-amber-950/40';
    return 'text-feud-red border-red-500/40 bg-red-950/50 animate-pulse';
  };

  // US-10 Scenario 2: Haptic feedback on Victory
  useEffect(() => {
    const isGameOverState = snapshot.phase === 'GAME_OVER' || !!gameOver;
    if (isGameOverState) {
      const isVic = gameOver
        ? gameOver.isVictory
        : snapshot.isVictory ??
          (snapshot.grandTotal ?? snapshot.totalScore ?? 0) >= 200;
      if (isVic && typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
        try {
          navigator.vibrate([100, 50, 100, 50, 200]);
        } catch {
          // Safe fallback
        }
      }
    }
  }, [snapshot.phase, gameOver, snapshot.isVictory, snapshot.grandTotal, snapshot.totalScore]);

  // US-10 Scenario 2 & 3: Game Over (Victory / Defeat) Mobile Screen
  if (snapshot.phase === 'GAME_OVER' || gameOver) {
    const isVic = gameOver
      ? gameOver.isVictory
      : snapshot.isVictory ??
        (snapshot.grandTotal ?? snapshot.totalScore ?? 0) >= 200;
    const finalScore =
      gameOver?.grandTotal ??
      snapshot.grandTotal ??
      snapshot.totalScore ??
      0;
    const p1Score = gameOver?.p1TotalScore ?? snapshot.p1TotalScore ?? 0;
    const p2Score = gameOver?.p2TotalScore ?? snapshot.p2TotalScore ?? 0;

    return (
      <div
        data-testid="fast-money-game-over-screen"
        className="max-w-md w-full max-w-[100%] overflow-x-hidden pb-safe bg-feud-slate-card/95 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-fade-in"
      >
        {isVic ? (
          <div data-testid="player-victory-view" className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500/20 to-yellow-400/30 text-feud-gold mx-auto flex items-center justify-center mb-4 ring-4 ring-feud-gold/30 shadow-lg shadow-feud-gold/20 animate-bounce">
              <Trophy className="w-10 h-10" />
            </div>

            <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-feud-gold to-amber-200 mb-2">
              {t.fastMoney.victoryTitle}
            </h2>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              {t.fastMoney.victorySubtitle}
            </p>

            <div className="w-full p-4 rounded-2xl bg-slate-900/80 border border-feud-gold/40 mb-6">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Final Score
              </div>
              <div
                data-testid="player-final-score"
                className="text-4xl font-black font-game text-feud-gold"
              >
                {finalScore} <span className="text-sm font-bold text-feud-gold/80">/ 200 PTS</span>
              </div>
              {(p1Score > 0 || p2Score > 0) && (
                <div className="mt-2 text-xs text-slate-400 flex items-center justify-center gap-3">
                  <span>P1: <strong className="text-feud-gold">{p1Score}</strong></span>
                  <span>•</span>
                  <span>P2: <strong className="text-blue-400">{p2Score}</strong></span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div data-testid="player-defeat-view" className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-red-950/60 border border-red-500/40 text-red-400 mx-auto flex items-center justify-center mb-4">
              <AlertCircle className="w-10 h-10" />
            </div>

            <h2 className="text-2xl font-black text-red-400 mb-2">
              {t.fastMoney.defeatTitle}
            </h2>
            <p className="text-slate-300 text-sm mb-6">
              {t.fastMoney.defeatSubtitle.replace('{score}', String(finalScore))}
            </p>

            <div className="w-full p-4 rounded-2xl bg-slate-900/80 border border-slate-800 mb-6">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Final Score
              </div>
              <div
                data-testid="player-final-score"
                className="text-3xl font-black font-game text-slate-200"
              >
                {finalScore} <span className="text-sm font-bold text-slate-400">/ 200 PTS</span>
              </div>
            </div>
          </div>
        )}

        {/* Waiting for Host Replay Status Indicator */}
        <div
          data-testid="player-waiting-replay-notice"
          className="flex items-center justify-center gap-2 text-xs font-semibold text-feud-gold/90 bg-slate-900/90 py-3 px-4 rounded-2xl border border-feud-gold/30"
        >
          <span className="w-2 h-2 rounded-full bg-feud-gold animate-ping" />
          <span>Waiting for host to start a new match...</span>
        </div>
      </div>
    );
  }

  // 1. Scenario 1: Ready Button State
  if (
    snapshot.phase === 'P1_READY' ||
    (snapshot.phase === 'P2_READY' && (!('revealSlots' in snapshot) || !snapshot.revealSlots))
  ) {
    return (
      <div
        data-testid={isPlayer2 ? 'p2-ready-screen' : 'p1-ready-screen'}
        className="max-w-md w-full max-w-[100%] overflow-x-hidden pb-safe bg-feud-slate-card/95 backdrop-blur-xl border border-feud-gold/40 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-fade-in"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500/20 to-yellow-400/30 text-feud-gold mx-auto flex items-center justify-center mb-5 ring-4 ring-feud-gold/30 shadow-lg shadow-feud-gold/20">
          <Zap className="w-10 h-10 animate-bounce" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-feud-gold/15 border border-feud-gold/30 text-feud-gold text-xs font-bold uppercase tracking-widest mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isPlayer2 ? 'Fast Money Round 2' : 'Fast Money Round 1'}</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide mb-2">
          {playerName
            ? `${playerName}, You're Up!`
            : isPlayer2
            ? t.fastMoney.p2ReadyTitle
            : t.fastMoney.p1ReadyTitle}
        </h1>
        <p className="text-slate-300 text-sm mb-8 leading-relaxed">
          {isPlayer2
            ? partnerName || player1Name
              ? `${partnerName || player1Name} scored ${snapshot.totalScore ?? 0} points. Tap ready when you are set!`
              : t.fastMoney.p2ReadySubtitle.replace('{score}', String(snapshot.totalScore ?? 0))
            : t.fastMoney.p1ReadySubtitle}
        </p>

        {/* 60s (P1) or 75s (P2) Timer Badge */}
        <div className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-slate-900/80 border border-slate-700/80 text-sm font-semibold text-slate-300 mb-8">
          <Timer className="w-5 h-5 text-feud-gold" />
          <span>{isPlayer2 ? '75 Seconds on the Clock' : '60 Seconds on the Clock'}</span>
        </div>

        {/* "I'm Ready!" Start Button */}
        <button
          type="button"
          onClick={() => {
            if (!isPaused) onReady();
          }}
          disabled={isPaused}
          data-testid={isPlayer2 ? 'p2-ready-btn' : 'p1-ready-btn'}
          className="w-full touch-target min-h-touch py-4 px-6 rounded-2xl font-black text-lg uppercase tracking-wider bg-gradient-to-r from-feud-gold via-amber-400 to-yellow-500 hover:from-yellow-400 hover:to-feud-gold text-slate-950 shadow-xl shadow-feud-gold/25 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Zap className="w-6 h-6 fill-slate-950" />
          <span>{t.fastMoney.imReady}</span>
        </button>
      </div>
    );
  }

  // 2. US-08: Reveal Sequence View & Round 2 Ready Transition (Player 1)
  if (
    !isPlayer2 &&
    (snapshot.phase === 'P1_REVEAL' || snapshot.phase === 'P2_READY') &&
    snapshot.revealSlots &&
    snapshot.revealSlots.length > 0
  ) {
    const isReady = snapshot.phase === 'P2_READY';
    const totalScore = snapshot.totalScore ?? 0;
    const slots = snapshot.revealSlots;

    return (
      <div
        data-testid="p1-reveal-screen"
        className="max-w-md w-full max-w-[100%] overflow-x-hidden pb-safe flex flex-col gap-4 animate-fade-in"
      >
        {/* Header: Synchronized Cumulative Total Score */}
        <div className="flex items-center justify-between gap-3 bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-feud-gold/30 shadow-lg">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-feud-gold/20 text-feud-gold text-[11px] font-extrabold uppercase tracking-widest mb-1">
              <Sparkles className="w-3 h-3" />
              <span>{t.fastMoney.revealPhaseTitle}</span>
            </div>
            <h2 className="text-lg font-black text-white">{effectivePlayerName} Reveal</h2>
          </div>

          <div className="flex flex-col items-end">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t.fastMoney.totalScore}
            </span>
            <div
              data-testid="p1-reveal-total-score"
              className="text-3xl font-black font-game text-feud-gold px-3 py-0.5 rounded-xl bg-slate-950/80 border border-feud-gold/40 shadow-inner"
            >
              {totalScore}
            </div>
          </div>
        </div>

        {/* Phase Complete Banner if P2_READY */}
        {isReady && (
          <div
            data-testid="p1-reveal-complete-banner"
            className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 shadow-lg animate-fade-in"
          >
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            <div>
              <div className="font-extrabold text-sm text-white">
                {t.fastMoney.revealComplete}
              </div>
              <div className="text-xs text-emerald-200/80">
                Waiting for {effectivePartnerName} to start Round 2...
              </div>
            </div>
          </div>
        )}

        {/* Synchronized 5 Reveal Cards */}
        <div className="flex flex-col gap-2.5">
          {slots.map((slot) => {
            const isActive = slot.slotNumber === snapshot.activeRevealSlotNumber;
            const pointsColor =
              slot.pointsAwarded && slot.pointsAwarded > 0
                ? 'text-emerald-400 bg-emerald-950/60 border-emerald-500/50'
                : 'text-feud-red bg-red-950/50 border-red-500/40';

            return (
              <div
                key={slot.slotNumber}
                data-testid={`p1-reveal-slot-${slot.slotNumber}`}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isActive
                    ? 'bg-slate-800/95 border-feud-gold/70 ring-2 ring-feud-gold/40 shadow-lg'
                    : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 line-clamp-1">
                  Q{slot.slotNumber}: {slot.questionText}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 font-black text-sm uppercase tracking-wide truncate">
                    {slot.isAnswerRevealed ? (
                      <span
                        data-testid={`p1-reveal-answer-${slot.slotNumber}`}
                        className="text-white"
                      >
                        {slot.rawAnswer || t.fastMoney.noAnswer}
                      </span>
                    ) : (
                      <span
                        data-testid={`p1-concealed-answer-${slot.slotNumber}`}
                        className="text-slate-500 tracking-widest font-mono"
                      >
                        ••••••••
                      </span>
                    )}
                  </div>
                  <div
                    data-testid={`p1-reveal-points-${slot.slotNumber}`}
                    className={`min-w-[3rem] px-2.5 py-1 text-center font-black font-game rounded-xl border text-sm ${
                      slot.isPointsRevealed
                        ? pointsColor
                        : 'text-slate-600 bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    {slot.isPointsRevealed ? slot.pointsAwarded : '--'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input Locked Notice */}
        <div
          data-testid="fast-money-locked-notice"
          className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60"
        >
          <Lock className="w-4 h-4 text-slate-400" />
          <span>Input locked for reveal phase</span>
        </div>
      </div>
    );
  }

  // US-10 Scenario 1: P2 Reveal Spectator Screen for Mobile Players
  if (snapshot.phase === 'P2_REVEAL') {
    const grandTotal =
      (snapshot as any).grandTotal ??
      (snapshot as any).totalScore ??
      0;

    return (
      <div
        data-testid="p2-reveal-spectator-screen"
        className="max-w-md w-full max-w-[100%] overflow-x-hidden pb-safe bg-feud-slate-card/95 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-fade-in"
      >
        <div className="w-16 h-16 rounded-full bg-feud-gold/20 text-feud-gold mx-auto flex items-center justify-center mb-4">
          <Sparkles className="w-10 h-10 text-feud-gold animate-spin" />
        </div>

        <h2 className="text-2xl font-black text-white mb-2">
          {t.fastMoney.p2RevealPhaseTitle || 'Fast Money Reveal'}
        </h2>
        <p className="text-slate-300 text-sm mb-6 leading-relaxed">
          Look up at the host TV screen to watch {effectivePartnerName}&apos;s answers and points revealed!
        </p>

        {/* Grand Total Indicator */}
        <div className="w-full p-4 rounded-2xl bg-slate-900/80 border border-slate-800 mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
            {t.fastMoney.grandTotal || 'Grand Total'}
          </div>
          <div
            data-testid="player-reveal-grand-total"
            className="text-3xl font-black font-game text-feud-gold"
          >
            {grandTotal} <span className="text-sm font-bold text-slate-400">/ 200 PTS</span>
          </div>
        </div>

        <div
          data-testid="fast-money-locked-notice"
          className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60"
        >
          <Lock className="w-4 h-4 text-slate-400" />
          <span>Input locked for reveal phase</span>
        </div>
      </div>
    );
  }

  // 3. Scenario 4: Turn Expiration / Turn Complete State
  if (
    snapshot.phase === 'P1_FINISHED' ||
    snapshot.phase === 'P2_FINISHED' ||
    (snapshot.phase === 'P1_REVEAL' && isPlayer2) ||
    (!isPlayer2 && (snapshot.phase === 'P2_PLAYING' || snapshot.phase === 'P2_FINISHED'))
  ) {
    const answeredCount = snapshot.answeredCount ?? 0;
    const totalQuestions = snapshot.totalQuestions || 5;

    return (
      <div
        data-testid="fast-money-turn-complete"
        className="max-w-md w-full max-w-[100%] overflow-x-hidden pb-safe bg-feud-slate-card/95 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-fade-in"
      >
        <div className="w-16 h-16 rounded-full bg-green-500/20 text-green-400 mx-auto flex items-center justify-center mb-4">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <h2 className="text-2xl font-black text-white mb-2">
          {t.fastMoney.turnCompleteTitle}
        </h2>
        <p className="text-slate-300 text-sm mb-6 leading-relaxed">
          {t.fastMoney.turnCompleteSubtitle}
        </p>

        {/* Answers Score Badge */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
            Questions Answered
          </div>
          <div className="text-3xl font-extrabold text-feud-gold">
            {answeredCount} / {totalQuestions}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {t.fastMoney.answeredCount
              .replace('{count}', String(answeredCount))
              .replace('{total}', String(totalQuestions))}
          </div>
        </div>

        {/* Locked Input Indicator */}
        <div
          data-testid="fast-money-locked-notice"
          className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60"
        >
          <Lock className="w-4 h-4 text-slate-400" />
          <span>Input locked for reveal phase</span>
        </div>
      </div>
    );
  }

  // 4. Scenario 2 & 3: Active Speed Round Playing State
  const currentQ = snapshot.currentQuestion;
  const answeredCount = snapshot.answeredCount ?? 0;
  const passedCount = snapshot.passedCount ?? 0;
  const totalQuestions = snapshot.totalQuestions || 5;

  return (
    <div
      data-testid="fast-money-playing-screen"
      data-keyboard-open={isKeyboardOpen ? 'true' : 'false'}
      className={`max-w-md w-full max-w-[100%] overflow-x-hidden pb-safe flex flex-col ${
        isKeyboardOpen ? 'gap-2' : 'gap-4'
      } animate-fade-in`}
    >
      {/* Inline styles for shake animation */}
      <style>{`
        @keyframes controller-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: controller-shake 0.5s ease-in-out;
        }
      `}</style>

      {/* Top Header: Authoritative Countdown Timer & Question Counter */}
      <div
        className={`flex items-center justify-between gap-3 bg-slate-900/90 backdrop-blur-md ${
          isKeyboardOpen ? 'p-2.5' : 'p-3.5'
        } rounded-2xl border border-slate-800 shadow-lg`}
      >
        {/* Synchronized Timer Display */}
        <div
          data-testid="fast-money-timer"
          className={`flex items-center gap-2 ${
            isKeyboardOpen ? 'px-3 py-1 text-base' : 'px-4 py-2 text-xl'
          } rounded-xl border font-black tracking-wider transition-colors ${getTimerColorClass()}`}
        >
          <Timer className="w-5 h-5 shrink-0" />
          <span>
            {remainingSeconds}
            <span className="text-xs font-medium ml-0.5">{t.fastMoney.secondsLeft}</span>
          </span>
        </div>

        {/* Question Counter Pill */}
        <div
          data-testid="fast-money-question-counter"
          className="flex flex-col items-end text-right"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {currentQ
              ? t.fastMoney.questionProgress
                  .replace('{current}', String(currentQ.questionNumber))
                  .replace('{total}', String(totalQuestions))
              : 'Question'}
          </span>
          {passedCount > 0 && (
            <span
              data-testid="fast-money-passed-counter"
              className="text-[11px] font-semibold text-amber-400"
            >
              (Passed: {passedCount})
            </span>
          )}
        </div>
      </div>

      {/* Question Card */}
      <div
        ref={activeCardRef}
        data-testid="fast-money-active-card"
        className={`bg-feud-slate-card/95 backdrop-blur-xl border border-feud-slate-border rounded-3xl ${
          isKeyboardOpen ? 'p-3.5 sm:p-5' : 'p-6 sm:p-7'
        } shadow-2xl text-center transition-all`}
      >
        <div
          className={`inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-feud-gold/20 text-feud-gold text-[11px] font-extrabold uppercase tracking-widest ${
            isKeyboardOpen ? 'mb-1.5' : 'mb-3'
          }`}
        >
          <span>
            {effectivePlayerName} • Question #{currentQ?.questionNumber ?? 1}
          </span>
        </div>

        <h2
          data-testid="fast-money-question-text"
          className={`${
            isKeyboardOpen
              ? 'text-base sm:text-xl mb-2.5 min-h-0'
              : 'text-xl sm:text-2xl mb-5 min-h-[3.5rem]'
          } font-black text-white leading-snug flex items-center justify-center`}
        >
          {currentQ?.questionText || 'Loading question...'}
        </h2>

        {/* US-09 Scenario 2: Duplicate Answer Error Banner */}
        {duplicateWarning && (
          <div
            data-testid="duplicate-warning-banner"
            className="mb-4 p-3.5 rounded-2xl bg-red-950/80 border-2 border-red-500/80 text-red-200 text-sm font-bold flex items-center gap-2.5 shadow-lg shadow-red-950/50 animate-shake"
          >
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <div className="flex-1 text-left">
              <div className="text-white font-extrabold text-sm">
                {duplicateWarning.message || t.fastMoney.duplicateWarningPlayer}
              </div>
              {duplicateWarning.duplicateWithAnswer && (
                <div className="text-xs text-red-300 font-normal mt-0.5">
                  {effectivePartnerName} answered: &quot;{duplicateWarning.duplicateWithAnswer}&quot;
                </div>
              )}
            </div>
          </div>
        )}

        {/* Answer Submission Form */}
        <form
          onSubmit={handleSubmit}
          data-testid="fast-money-answer-form"
          className={`flex flex-col ${isKeyboardOpen ? 'gap-2 sticky bottom-0 z-10' : 'gap-3'}`}
        >
          <div className={`relative transition-transform ${isShaking ? 'animate-shake' : ''}`}>
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              data-testid="fast-money-input"
              value={answerText}
              onChange={handleInputChange}
              onFocus={() => keepElementVisible(activeCardRef.current)}
              placeholder={t.fastMoney.answerPlaceholder}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              enterKeyHint="send"
              maxLength={50}
              disabled={isPaused || snapshot.canSubmit === false}
              className={`w-full min-h-touch px-4 ${
                isKeyboardOpen ? 'py-2.5' : 'py-3.5'
              } rounded-2xl bg-slate-900/90 text-white placeholder-slate-500 font-bold text-lg text-center focus:outline-none transition-all disabled:opacity-50 border ${
                isShaking
                  ? 'border-red-500 ring-2 ring-red-500/50 bg-red-950/30'
                  : 'border-slate-700 focus:ring-2 focus:ring-feud-gold/50 focus:border-feud-gold'
              }`}
            />
          </div>

          {/* Action Buttons: Submit and Pass */}
          <div className="grid grid-cols-2 gap-3 mt-1">
            {/* Yellow Pass Button */}
            <button
              type="button"
              onClick={handlePass}
              disabled={isPaused || snapshot.canPass === false}
              data-testid="fast-money-pass-btn"
              className="touch-target min-h-touch flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-black text-sm uppercase tracking-wider bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 shadow-md shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SkipForward className="w-4 h-4 fill-slate-950" />
              <span>{t.fastMoney.passButton}</span>
            </button>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isPaused || !answerText.trim() || snapshot.canSubmit === false}
              data-testid="fast-money-submit-btn"
              className="touch-target min-h-touch flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-feud-gold to-yellow-500 hover:from-yellow-400 hover:to-feud-gold active:to-amber-500 text-slate-950 shadow-md shadow-feud-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              <span>{t.fastMoney.submitButton}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Progress Footer: Answered Count */}
      <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-2">
        <span>Answered: {answeredCount} / {totalQuestions}</span>
        <span>Remaining: {totalQuestions - answeredCount}</span>
      </div>
    </div>
  );
};

export default FastMoneyController;
