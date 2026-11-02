import React, { useState, useEffect, useRef } from 'react';
import { Player1StateSnapshot, TimerTickPayload } from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import {
  Timer,
  Zap,
  CheckCircle2,
  Send,
  SkipForward,
  Sparkles,
  Lock,
} from 'lucide-react';

export interface FastMoneyControllerProps {
  snapshot: Player1StateSnapshot;
  timerTick?: TimerTickPayload | null;
  onReady: () => void;
  onSubmitAnswer: (questionId: string, answer: string) => void;
  onPass: (questionId: string) => void;
  onLeave?: () => void;
}

export const FastMoneyController: React.FC<FastMoneyControllerProps> = ({
  snapshot,
  timerTick = null,
  onReady,
  onSubmitAnswer,
  onPass,
}) => {
  const { t } = useTranslation();
  const [answerText, setAnswerText] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronized countdown timer value (authoritative timer tick takes priority)
  const remainingSeconds =
    timerTick && typeof timerTick.secondsRemaining === 'number'
      ? timerTick.secondsRemaining
      : snapshot.remainingSeconds;

  // Auto-focus input and reset value on each new question (DoD Requirement)
  useEffect(() => {
    if (snapshot.phase === 'P1_PLAYING' && snapshot.currentQuestion) {
      setAnswerText('');
      // Small timeout ensures DOM focus after question re-render on mobile
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [snapshot.currentQuestion?.id, snapshot.phase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = answerText.trim();
    if (!trimmed || !snapshot.currentQuestion || !snapshot.canSubmit) {
      return;
    }
    onSubmitAnswer(snapshot.currentQuestion.id, trimmed);
    setAnswerText('');
  };

  const handlePass = () => {
    if (!snapshot.currentQuestion || !snapshot.canPass) {
      return;
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

  // 1. Scenario 1: Ready Button State
  if (snapshot.phase === 'P1_READY') {
    return (
      <div
        data-testid="p1-ready-screen"
        className="max-w-md w-full bg-feud-slate-card/95 backdrop-blur-xl border border-feud-gold/40 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-fade-in"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500/20 to-yellow-400/30 text-feud-gold mx-auto flex items-center justify-center mb-5 ring-4 ring-feud-gold/30 shadow-lg shadow-feud-gold/20">
          <Zap className="w-10 h-10 animate-bounce" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-feud-gold/15 border border-feud-gold/30 text-feud-gold text-xs font-bold uppercase tracking-widest mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Fast Money Round 1</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide mb-2">
          {t.fastMoney.p1ReadyTitle}
        </h1>
        <p className="text-slate-300 text-sm mb-8 leading-relaxed">
          {t.fastMoney.p1ReadySubtitle}
        </p>

        {/* 60 Seconds Timer Badge */}
        <div className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-slate-900/80 border border-slate-700/80 text-sm font-semibold text-slate-300 mb-8">
          <Timer className="w-5 h-5 text-feud-gold" />
          <span>60 Seconds on the Clock</span>
        </div>

        {/* "I'm Ready!" Start Button */}
        <button
          type="button"
          onClick={onReady}
          data-testid="p1-ready-btn"
          className="w-full py-4 px-6 rounded-2xl font-black text-lg uppercase tracking-wider bg-gradient-to-r from-feud-gold via-amber-400 to-yellow-500 hover:from-yellow-400 hover:to-feud-gold text-slate-950 shadow-xl shadow-feud-gold/25 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <Zap className="w-6 h-6 fill-slate-950" />
          <span>{t.fastMoney.imReady}</span>
        </button>
      </div>
    );
  }

  // 2. Scenario 4: Turn Expiration / Turn Complete State
  if (snapshot.phase === 'P1_FINISHED' || snapshot.phase === 'P1_REVEAL') {
    const answeredCount = snapshot.answeredCount;
    const totalQuestions = snapshot.totalQuestions || 5;

    return (
      <div
        data-testid="fast-money-turn-complete"
        className="max-w-md w-full bg-feud-slate-card/95 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-fade-in"
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

  // 3. Scenario 2 & 3: Active Speed Round Playing State
  const currentQ = snapshot.currentQuestion;

  return (
    <div
      data-testid="fast-money-playing-screen"
      className="max-w-md w-full flex flex-col gap-4 animate-fade-in"
    >
      {/* Top Header: Authoritative Countdown Timer & Question Counter */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/90 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800 shadow-lg">
        {/* Synchronized Timer Display */}
        <div
          data-testid="fast-money-timer"
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-black text-xl tracking-wider transition-colors ${getTimerColorClass()}`}
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
                  .replace('{total}', String(snapshot.totalQuestions || 5))
              : 'Question'}
          </span>
          {snapshot.passedCount > 0 && (
            <span
              data-testid="fast-money-passed-counter"
              className="text-[11px] font-semibold text-amber-400"
            >
              (Passed: {snapshot.passedCount})
            </span>
          )}
        </div>
      </div>

      {/* Question Card */}
      <div className="bg-feud-slate-card/95 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-7 shadow-2xl text-center">
        <div className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-feud-gold/20 text-feud-gold text-[11px] font-extrabold uppercase tracking-widest mb-3">
          Question #{currentQ?.questionNumber ?? 1}
        </div>

        <h2
          data-testid="fast-money-question-text"
          className="text-xl sm:text-2xl font-black text-white leading-snug mb-6 min-h-[3.5rem] flex items-center justify-center"
        >
          {currentQ?.questionText || 'Loading question...'}
        </h2>

        {/* Answer Submission Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              data-testid="fast-money-input"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder={t.fastMoney.answerPlaceholder}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              enterKeyHint="send"
              maxLength={50}
              disabled={!snapshot.canSubmit}
              className="w-full px-4 py-3.5 rounded-2xl bg-slate-900/90 border border-slate-700 text-white placeholder-slate-500 font-bold text-lg text-center focus:outline-none focus:ring-2 focus:ring-feud-gold/50 focus:border-feud-gold transition-all disabled:opacity-50"
            />
          </div>

          {/* Action Buttons: Submit (Green/Gold) and Pass (Yellow) */}
          <div className="grid grid-cols-2 gap-3 mt-1">
            {/* Yellow Pass Button */}
            <button
              type="button"
              onClick={handlePass}
              disabled={!snapshot.canPass}
              data-testid="fast-money-pass-btn"
              className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-black text-sm uppercase tracking-wider bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 shadow-md shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SkipForward className="w-4 h-4 fill-slate-950" />
              <span>{t.fastMoney.passButton}</span>
            </button>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!answerText.trim() || !snapshot.canSubmit}
              data-testid="fast-money-submit-btn"
              className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-feud-gold to-yellow-500 hover:from-yellow-400 hover:to-feud-gold active:to-amber-500 text-slate-950 shadow-md shadow-feud-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              <span>{t.fastMoney.submitButton}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Progress Footer: Answered Count */}
      <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-2">
        <span>Answered: {snapshot.answeredCount} / {snapshot.totalQuestions || 5}</span>
        <span>Remaining: {snapshot.totalQuestions - snapshot.answeredCount}</span>
      </div>
    </div>
  );
};

export default FastMoneyController;

