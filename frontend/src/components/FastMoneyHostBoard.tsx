import React, { useEffect, useRef } from 'react';
import { HostStateSnapshot, TimerTickPayload } from '../types';
import { speakQuestion } from '../utils/tts';
import { Timer, Zap, Sparkles, CheckCircle2 } from 'lucide-react';

export interface FastMoneyHostBoardProps {
  snapshot?: HostStateSnapshot | null;
  timerTick?: TimerTickPayload | null;
  language?: string;
  roomName?: string;
  roomCode?: string;
  enableTTS?: boolean;
}

export const FastMoneyHostBoard: React.FC<FastMoneyHostBoardProps> = ({
  snapshot = null,
  timerTick = null,
  language = 'EN',
  roomName = 'Family Feud',
  roomCode = '',
  enableTTS = true,
}) => {
  const lastSpokenQuestionRef = useRef<string | null>(null);

  const remainingSeconds =
    timerTick && typeof timerTick.secondsRemaining === 'number'
      ? timerTick.secondsRemaining
      : snapshot?.remainingSeconds ?? 60;

  const phase = snapshot?.phase ?? 'P1_READY';
  const currentQuestionText = snapshot?.currentQuestionText ?? null;
  const activeNumber = snapshot?.activeQuestionNumber ?? 1;

  // Speak question via TTS when new question appears during P1_PLAYING (Scenario 1 & 2)
  useEffect(() => {
    if (
      enableTTS &&
      phase === 'P1_PLAYING' &&
      currentQuestionText &&
      currentQuestionText !== lastSpokenQuestionRef.current
    ) {
      lastSpokenQuestionRef.current = currentQuestionText;
      speakQuestion(currentQuestionText, language);
    }
  }, [currentQuestionText, phase, language, enableTTS]);

  // Slot status data (defaulting to 5 empty slots if not yet loaded)
  const slots = snapshot?.slots ?? [
    { slotNumber: 1, isFilled: false },
    { slotNumber: 2, isFilled: false },
    { slotNumber: 3, isFilled: false },
    { slotNumber: 4, isFilled: false },
    { slotNumber: 5, isFilled: false },
  ];

  // Timer urgency style
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
                  Fast Money Speed Round
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

          {/* Synchronized Authoritative 60-Second Clock */}
          <div
            data-testid="fast-money-host-timer"
            className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl border font-black font-game text-3xl sm:text-4xl tracking-wider transition-colors shadow-lg ${getTimerStyle()}`}
          >
            <Timer className="w-7 h-7 shrink-0" />
            <span>{remainingSeconds}s</span>
          </div>
        </div>

        {/* Active Question Banner */}
        <div className="mt-6 p-6 rounded-2xl bg-gradient-to-r from-feud-blue-dark via-feud-blue to-feud-blue-dark border border-feud-gold/40 shadow-inner text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-feud-gold/20 border border-feud-gold/30 text-feud-gold text-xs font-extrabold uppercase tracking-widest mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Question #{activeNumber}</span>
          </div>

          <h2
            data-testid="fast-money-host-question"
            className="text-xl sm:text-2xl font-black text-white leading-snug drop-shadow min-h-[3rem] flex items-center justify-center"
          >
            {phase === 'P1_READY'
              ? "Waiting for Player 1 to press 'I'm Ready!'..."
              : phase === 'P1_FINISHED' || phase === 'P1_REVEAL'
              ? 'Player 1 Speed Round Complete! Preparing Reveal Phase...'
              : currentQuestionText || 'Loading question...'}
          </h2>
        </div>
      </div>

      {/* 5 Concealed Fast Money Answer Slots (DoD Requirement) */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center justify-between border-b border-feud-slate-border/80 pb-4 mb-6">
          <h3 className="text-lg font-black uppercase tracking-wider text-slate-200">
            Player 1 Board (Answers Concealed)
          </h3>
          <div className="text-xs font-bold uppercase tracking-wider text-feud-gold">
            {snapshot?.answeredCount ?? 0} / {slots.length} Answered
          </div>
        </div>

        {/* The 5 Slot Grid */}
        <div className="flex flex-col gap-3">
          {slots.map((slot) => {
            const isActive = phase === 'P1_PLAYING' && activeNumber === slot.slotNumber;
            return (
              <div
                key={slot.slotNumber}
                data-testid={`fast-money-slot-${slot.slotNumber}`}
                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                  isActive
                    ? 'border-feud-gold bg-slate-800/90 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                    : 'border-slate-800 bg-slate-900/70'
                }`}
              >
                {/* Slot Number */}
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 text-feud-gold font-black text-sm flex items-center justify-center shrink-0">
                    {slot.slotNumber}
                  </span>

                  {/* Concealed Answer Bar (DoD: Raw answer text is NEVER revealed during 60s) */}
                  <div
                    data-testid={`fast-money-slot-status-${slot.slotNumber}`}
                    className="font-mono text-sm tracking-wider font-bold"
                  >
                    {slot.isFilled ? (
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

                {/* Concealed Points Box (Always covered during 60s) */}
                <div className="w-14 h-9 rounded-xl bg-slate-950 border border-slate-800 text-slate-600 font-game font-bold text-sm flex items-center justify-center select-none shadow-inner">
                  {slot.isFilled ? '--' : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FastMoneyHostBoard;
