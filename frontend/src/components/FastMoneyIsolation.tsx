import React from 'react';
import { Player2IsolationSnapshot, TimerTickPayload } from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { Headphones, ShieldAlert, Timer, EyeOff } from 'lucide-react';

export interface FastMoneyIsolationProps {
  snapshot?: Player2IsolationSnapshot | null;
  timerTick?: TimerTickPayload | null;
  onLeave?: () => void;
}

export const FastMoneyIsolation: React.FC<FastMoneyIsolationProps> = ({
  snapshot = null,
  timerTick = null,
}) => {
  const { t } = useTranslation();

  const remainingSeconds =
    timerTick && typeof timerTick.secondsRemaining === 'number'
      ? timerTick.secondsRemaining
      : snapshot?.remainingSeconds ?? 60;

  return (
    <div
      data-testid="player2-isolation-screen"
      className="max-w-md w-full bg-feud-slate-card/95 backdrop-blur-xl border border-indigo-500/40 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-fade-in relative overflow-hidden"
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
        <span>Offstage Isolation Shield</span>
      </div>

      {/* Localized Title */}
      <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide mb-3 leading-tight">
        {t.fastMoney.player2IsolationTitle}
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
          <span>Player 1 Clock</span>
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
        <span>Questions and answers remain strictly hidden until your turn</span>
      </div>
    </div>
  );
};

export default FastMoneyIsolation;

