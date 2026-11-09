import React from 'react';
import { Player2IsolationSnapshot, TimerTickPayload } from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { Headphones, ShieldAlert, Timer, EyeOff, Zap, Sparkles, Eye } from 'lucide-react';

export interface FastMoneyIsolationProps {
  snapshot?: Player2IsolationSnapshot | null;
  timerTick?: TimerTickPayload | null;
  isPaused?: boolean;
  pausedRemainingSeconds?: number;
  playerName?: string;
  partnerName?: string;
  player1Name?: string;
  player2Name?: string;
  onReady?: () => void;
  onLeave?: () => void;
}

export const FastMoneyIsolation: React.FC<FastMoneyIsolationProps> = ({
  snapshot = null,
  timerTick = null,
  isPaused = false,
  pausedRemainingSeconds,
  playerName,
  partnerName,
  player1Name,
  player2Name,
  onReady,
}) => {
  const { t } = useTranslation();

  const effectivePlayerName = playerName || player2Name || 'Player 2';
  const effectivePartnerName = partnerName || player1Name || 'Player 1';

  const remainingSeconds =
    isPaused && typeof pausedRemainingSeconds === 'number' && pausedRemainingSeconds > 0
      ? pausedRemainingSeconds
      : timerTick && typeof timerTick.secondsRemaining === 'number'
      ? timerTick.secondsRemaining
      : snapshot?.remainingSeconds ?? 60;

  // 1. Scenario 4: Completion of Player 1 Reveal -> Player 2 Ready Prompt
  if (snapshot?.phase === 'P2_READY') {
    const totalScore = snapshot.totalScore ?? 0;
    return (
      <div
        data-testid="player2-ready-screen"
        className="max-w-md w-full max-w-[100%] overflow-x-hidden pb-safe bg-feud-slate-card/95 backdrop-blur-xl border border-feud-gold/40 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-fade-in"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500/20 to-yellow-400/30 text-feud-gold mx-auto flex items-center justify-center mb-5 ring-4 ring-feud-gold/30 shadow-lg shadow-feud-gold/20">
          <Zap className="w-10 h-10 animate-bounce" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-feud-gold/15 border border-feud-gold/30 text-feud-gold text-xs font-bold uppercase tracking-widest mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t.fastMoney.fastMoneyRound2}</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide mb-2">
          {playerName || player2Name
            ? `${effectivePlayerName}, You're Up!`
            : (t.fastMoney.p2ReadyTitle || "Player 2, You're Up!")}
        </h1>
        <p className="text-slate-300 text-sm mb-6 leading-relaxed">
          {partnerName || player1Name
            ? t.fastMoney.partnerScoredPrompt
                .replace('{partner}', effectivePartnerName)
                .replace('{score}', String(totalScore))
            : (t.fastMoney.p2ReadySubtitle?.replace('{score}', String(totalScore)) ||
              `Player 1 scored ${totalScore} points. Tap ready when you are set!`)}
        </p>

        {/* Player 1's Total Score Badge */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
            {t.fastMoney.scoreToBeat.replace('{partner}', effectivePartnerName)}
          </div>
          <div
            data-testid="p2-round1-total"
            className="text-4xl font-black font-game text-feud-gold"
          >
            {totalScore}
          </div>
        </div>

        {/* "I'm Ready!" Start Button */}
        <button
          type="button"
          onClick={() => {
            if (!isPaused && onReady) onReady();
          }}
          disabled={isPaused}
          data-testid="p2-ready-btn"
          className="w-full touch-target min-h-touch py-4 px-6 rounded-2xl font-black text-lg uppercase tracking-wider bg-gradient-to-r from-feud-gold via-amber-400 to-yellow-500 hover:from-yellow-400 hover:to-feud-gold text-slate-950 shadow-xl shadow-feud-gold/25 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Zap className="w-6 h-6 fill-slate-950" />
          <span>{t.fastMoney.imReady}</span>
        </button>
      </div>
    );
  }

  // 2. Scenario 5: Mobile Audience Synchronization during P1_REVEAL
  if (snapshot?.phase === 'P1_REVEAL') {
    const totalScore = snapshot.totalScore ?? 0;
    const slots = snapshot.revealSlots ?? [];

    return (
      <div
        data-testid="player2-reveal-screen"
        className="max-w-md w-full max-w-[100%] overflow-x-hidden pb-safe flex flex-col gap-4 animate-fade-in"
      >
        {/* Header: Synchronized Live Total Score */}
        <div className="flex items-center justify-between gap-3 bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-indigo-500/30 shadow-lg">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-extrabold uppercase tracking-widest mb-1">
              <Eye className="w-3 h-3" />
              <span>{t.fastMoney.revealPhaseTitle}</span>
            </div>
            <h2 className="text-lg font-black text-white">{effectivePartnerName} Reveal</h2>
          </div>

          <div className="flex flex-col items-end">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t.fastMoney.totalScore}
            </span>
            <div
              data-testid="player2-reveal-total-score"
              className="text-3xl font-black font-game text-indigo-300 px-3 py-0.5 rounded-xl bg-slate-950/80 border border-indigo-500/40 shadow-inner"
            >
              {totalScore}
            </div>
          </div>
        </div>

        {/* Reveal Cards List */}
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
                data-testid={`player2-reveal-slot-${slot.slotNumber}`}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isActive
                    ? 'bg-slate-800/95 border-indigo-500/70 ring-2 ring-indigo-500/40 shadow-lg'
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
                        data-testid={`player2-reveal-answer-${slot.slotNumber}`}
                        className="text-white"
                      >
                        {slot.rawAnswer || t.fastMoney.noAnswer}
                      </span>
                    ) : (
                      <span
                        data-testid={`player2-concealed-answer-${slot.slotNumber}`}
                        className="text-slate-500 tracking-widest font-mono"
                      >
                        ••••••••
                      </span>
                    )}
                  </div>
                  <div
                    data-testid={`player2-reveal-points-${slot.slotNumber}`}
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

        {/* Spectator notice */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-800/40 py-2.5 px-4 rounded-xl border border-slate-700/40">
          <Eye className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>
            {snapshot.isolationMessage ||
              (partnerName || player1Name
                ? t.fastMoney.partnerWatchingReveal.replace('{partner}', effectivePartnerName)
                : t.fastMoney.watchingReveal)}
          </span>
        </div>
      </div>
    );
  }

  // 3. Scenario 5: Offstage Isolation Shield (P1_PLAYING, P1_READY, P1_FINISHED)
  return (
    <div
      data-testid="player2-isolation-screen"
      className="max-w-md w-full max-w-[100%] overflow-x-hidden pb-safe bg-feud-slate-card/95 backdrop-blur-xl border border-indigo-500/40 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-fade-in relative overflow-hidden"
    >
      {/* Decorative background glow */}
      <div className="absolute -top-12 -left-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Main Headphone & Shield Icon Badge */}
      <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-indigo-950 via-slate-900 to-indigo-900 border-2 border-indigo-500/50 text-indigo-400 mx-auto flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/20">
        <Headphones className="w-12 h-12 text-indigo-300 animate-pulse" />
        <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-indigo-600 text-white shadow-md">
          <EyeOff className="w-4 h-4" />
        </div>
      </div>

      {/* Anti-Cheating Shield Pill */}
      <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-4">
        <ShieldAlert className="w-3.5 h-3.5 text-indigo-400" />
        <span>{t.fastMoney.isolationShieldTitle}</span>
        <span className="sr-only">Offstage Isolation Shield</span>
      </div>

      {/* Localized Title */}
      <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide mb-3 leading-tight">
        {(partnerName || player1Name)
          ? t.fastMoney.partnerPlayingHeader.replace('{partner}', effectivePartnerName)
          : t.fastMoney.player2IsolationTitle}
      </h1>

      {/* Localized Instructions */}
      <p
        data-testid="player2-isolation-message"
        className="text-slate-300 text-sm mb-6 leading-relaxed"
      >
        {t.fastMoney.player2IsolationSubtitle}
      </p>

      {/* Live Synchronized Timer Box */}
      <div
        data-testid="player2-isolation-timer"
        className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-inner mb-6"
      >
        <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
          <Timer className="w-4 h-4 text-indigo-400" />
          <span>{t.fastMoney.partnerClock.replace('{partner}', effectivePartnerName)}</span>
        </div>
        <div className="text-4xl sm:text-5xl font-black font-game text-indigo-300 tracking-wider">
          {remainingSeconds}
          <span className="text-base font-bold text-indigo-400/80 ml-1">
            {t.fastMoney.secondsLeft}
          </span>
        </div>
      </div>

      {/* Security notice clarifying anti-cheating confidentiality */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-800/40 py-2.5 px-4 rounded-xl border border-slate-700/40">
        <EyeOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>{t.fastMoney.isolationShieldDesc}</span>
      </div>
    </div>
  );
};

export default FastMoneyIsolation;
