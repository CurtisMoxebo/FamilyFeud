import React, { useEffect, useState, useRef } from 'react';
import {
  TeamGuessingSessionState,
  TimerTickPayload,
  StrikeIssuedPayload,
  RoundClearedPayload,
  TransitionStealPhasePayload,
  MainGameBoardRevealPayload,
} from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import {
  playDing,
  playPointsChime,
  playStrikeBuzzer,
  playVictoryFanfare,
} from '../utils/soundEffects';
import {
  speakBoardCleared,
  speakStealPhase,
  cancelSpeech,
} from '../utils/tts';
import {
  Tv,
  Clock,
  ArrowLeft,
  Sparkles,
  Flame,
  AlertTriangle,
  Trophy,
} from 'lucide-react';

export interface MainGameTeamGuessingBoardProps {
  snapshot: TeamGuessingSessionState;
  timerTick?: TimerTickPayload | null;
  strikeIssued?: StrikeIssuedPayload | null;
  roundCleared?: RoundClearedPayload | null;
  transitionStealPhase?: TransitionStealPhasePayload | null;
  boardReveal?: MainGameBoardRevealPayload | null;
  language?: string;
  roomName: string;
  roomCode: string;
  onLeave?: () => void;
}

export const MainGameTeamGuessingBoard: React.FC<MainGameTeamGuessingBoardProps> = ({
  snapshot,
  timerTick,
  strikeIssued,
  roundCleared,
  transitionStealPhase,
  boardReveal,
  language = 'EN',
  roomName,
  roomCode,
  onLeave,
}) => {
  const { t } = useTranslation();

  // Active full-screen strike animation overlay state
  const [activeStrikeOverlay, setActiveStrikeOverlay] = useState<{
    count: number;
    message?: string;
  } | null>(null);

  // Track handled strikes and board reveals to avoid duplicate sound triggers
  const lastHandledStrikeTimestamp = useRef<number>(0);
  const lastRevealedAnswerCount = useRef<number>(snapshot.revealedAnswers.length);
  const hasCelebratedClear = useRef<boolean>(false);
  const hasAnnouncedSteal = useRef<boolean>(false);

  // Derive remaining seconds for authoritative countdown
  const currentSeconds =
    timerTick && timerTick.secondsRemaining !== undefined
      ? timerTick.secondsRemaining
      : snapshot.remainingSeconds;

  const controllingTeamName =
    snapshot.controllingTeam === 'TEAM_1' ? t.mainGame.team1 : t.mainGame.team2;
  const opposingTeamName =
    snapshot.opposingTeam === 'TEAM_1' ? t.mainGame.team1 : t.mainGame.team2;

  // Scenario 2 & 4: Trigger Strike Buzzer & Overlay when strikeIssued arrives
  useEffect(() => {
    if (strikeIssued && strikeIssued.strikeCount > 0) {
      const now = Date.now();
      if (!lastHandledStrikeTimestamp.current || now - lastHandledStrikeTimestamp.current > 300) {
        lastHandledStrikeTimestamp.current = now;
        setActiveStrikeOverlay({
          count: strikeIssued.strikeCount,
          message: strikeIssued.isDuplicate
            ? t.mainGame.duplicateAnswerWarning
            : strikeIssued.isTimeout
            ? "TIME'S UP!"
            : t.mainGame.notOnBoard,
        });

        playStrikeBuzzer(strikeIssued.strikeCount);

        const timer = setTimeout(() => {
          setActiveStrikeOverlay(null);
        }, 2200);

        return () => clearTimeout(timer);
      }
    }
  }, [strikeIssued, t.mainGame.duplicateAnswerWarning, t.mainGame.notOnBoard]);

  // Scenario 1: Trigger Chime SFX when new cards are revealed
  useEffect(() => {
    if (snapshot.revealedAnswers.length > lastRevealedAnswerCount.current || boardReveal) {
      lastRevealedAnswerCount.current = snapshot.revealedAnswers.length;
      playDing();
      const chimeTimer = setTimeout(() => {
        playPointsChime();
      }, 350);
      return () => clearTimeout(chimeTimer);
    }
  }, [snapshot.revealedAnswers.length, boardReveal]);

  // Scenario 3: Board Cleared celebration & victory fanfare
  useEffect(() => {
    if (
      (roundCleared || snapshot.phase === 'ROUND_CLEARED') &&
      !hasCelebratedClear.current
    ) {
      hasCelebratedClear.current = true;
      playVictoryFanfare();
      speakBoardCleared(controllingTeamName, language);
    }
  }, [roundCleared, snapshot.phase, controllingTeamName, language]);

  // Scenario 4: Steal Phase trigger announcement
  useEffect(() => {
    if (
      (transitionStealPhase || snapshot.phase === 'STEAL_PHASE') &&
      !hasAnnouncedSteal.current
    ) {
      hasAnnouncedSteal.current = true;
      speakStealPhase(opposingTeamName, language);
    }
  }, [transitionStealPhase, snapshot.phase, opposingTeamName, language]);

  // Total answer count for card grid (defaults to total answers or 6)
  const totalSlots = Math.max(
    snapshot.totalAnswersCount,
    snapshot.question.answerCount,
    snapshot.revealedAnswers.length,
    4
  );

  return (
    <div
      className="min-h-screen bg-slate-950 text-white flex flex-col p-4 md:p-6 select-none relative overflow-hidden"
      data-testid="main-game-team-guessing-board"
    >
      {/* Dynamic Background Glow */}
      <div className="absolute inset-0 bg-radial-gradient from-blue-900/20 via-transparent to-transparent pointer-events-none" />

      {/* Top TV Stage Navigation Bar */}
      <header className="relative z-10 flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-3">
          {onLeave && (
            <button
              onClick={() => {
                cancelSpeech();
                onLeave();
              }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Leave Room"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Tv className="w-3.5 h-3.5" />
                Host Board
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {t.mainGame.roundNumber.replace('{round}', String(snapshot.roundNumber))}
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              {roomName}
              <span className="text-sm font-normal text-slate-400">({roomCode})</span>
            </h1>
          </div>
        </div>

        {/* Controlling Team Banner */}
        <div className="flex items-center gap-3">
          <div
            className={`px-4 py-2 rounded-xl border flex items-center gap-2 shadow-lg ${
              snapshot.controllingTeam === 'TEAM_1'
                ? 'bg-blue-600/30 border-blue-500/50 text-blue-300'
                : 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300'
            }`}
          >
            <Flame className="w-5 h-5 animate-pulse text-yellow-400" />
            <span className="font-extrabold text-sm md:text-base tracking-wide uppercase">
              {t.mainGame.controllingTeamPlaying.replace('{team}', controllingTeamName)}
            </span>
          </div>
        </div>
      </header>

      {/* Prominent Survey Question Display */}
      <section className="relative z-10 w-full max-w-4xl mx-auto mb-6">
        <div className="p-4 md:p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-2 border-indigo-500/40 shadow-2xl text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent opacity-80" />
          <h2 className="text-xl md:text-3xl font-black text-yellow-300 tracking-wide drop-shadow-md">
            "{snapshot.question.questionText}"
          </h2>
        </div>
      </section>

      {/* Main Game Stage Scoreboard & Centerpieces */}
      <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        {/* Active Guesser & Timer */}
        <div className="flex items-center gap-4 bg-slate-900/90 border border-slate-700 px-5 py-3 rounded-2xl shadow-lg w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-black text-white shadow">
              {snapshot.activePlayer?.battingOrder || 1}
            </div>
            <div>
              <div className="text-xs uppercase font-semibold text-slate-400">
                {t.mainGame.answeringTurn.replace(
                  '{name}',
                  snapshot.activePlayer?.nickname || 'Teammate'
                )}
              </div>
              <div className="text-lg font-black text-white">
                {snapshot.activePlayer?.nickname || 'Waiting for player...'}
              </div>
            </div>
          </div>

          {/* 15s Timer Ring */}
          {snapshot.phase === 'TEAM_GUESSING' && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-sm border shadow-inner ${
                currentSeconds <= 3
                  ? 'bg-red-500/20 text-red-400 border-red-500 animate-pulse'
                  : currentSeconds <= 7
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{currentSeconds}s</span>
            </div>
          )}
        </div>

        {/* Central Round Bank Tally Display */}
        <div className="flex flex-col items-center justify-center bg-gradient-to-b from-yellow-500/20 to-amber-600/10 border-2 border-yellow-400/60 rounded-2xl px-8 py-3 shadow-[0_0_30px_rgba(250,204,21,0.2)]">
          <span className="text-xs uppercase font-black tracking-widest text-yellow-400/90">
            {t.mainGame.roundBankTitle}
          </span>
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-yellow-400 animate-spin" />
            <span
              className="text-4xl md:text-5xl font-black text-yellow-300 drop-shadow-[0_2px_10px_rgba(250,204,21,0.5)]"
              data-testid="round-bank-display"
            >
              {snapshot.roundBank}
            </span>
            <span className="text-sm font-bold text-yellow-400/80">PTS</span>
          </div>
        </div>

        {/* 3-Strike Box Counters */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-5 py-3 rounded-2xl shadow-lg">
          <span className="text-xs font-black uppercase text-slate-400 tracking-wider mr-2">
            {t.mainGame.strikeTitle}s:
          </span>
          {[1, 2, 3].map((strikeNum) => {
            const hasStrike = snapshot.strikes >= strikeNum;
            return (
              <div
                key={strikeNum}
                data-testid={`strike-box-${strikeNum}`}
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xl transition-all duration-300 ${
                  hasStrike
                    ? 'bg-red-600 text-white border-2 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.7)] scale-105'
                    : 'bg-slate-800 text-slate-600 border border-slate-700'
                }`}
              >
                {hasStrike ? 'X' : strikeNum}
              </div>
            );
          })}
        </div>
      </div>

      {/* Answer Board Card Grid (4 to 8 Flip Cards) */}
      <main className="relative z-10 w-full max-w-5xl mx-auto flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 p-4 md:p-6 bg-slate-900/80 border-2 border-blue-900/60 rounded-3xl shadow-2xl backdrop-blur-sm">
          {Array.from({ length: totalSlots }).map((_, idx) => {
            const rankOrder = idx + 1;
            const revealedItem = snapshot.revealedAnswers.find(
              (ra) => ra.rankOrder === rankOrder
            );
            const isRevealed = Boolean(revealedItem);

            return (
              <div
                key={rankOrder}
                data-testid={`team-board-card-${rankOrder}`}
                className={`relative min-h-[70px] rounded-2xl border-2 flex items-center px-5 transition-all duration-500 shadow-md ${
                  isRevealed
                    ? 'bg-gradient-to-r from-blue-700 to-indigo-800 border-yellow-400/70 shadow-[0_4px_20px_rgba(59,130,246,0.3)]'
                    : 'bg-gradient-to-r from-slate-900 to-slate-800 border-slate-700/80 hover:border-slate-600'
                }`}
              >
                {isRevealed && revealedItem ? (
                  <div className="w-full flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-yellow-400 text-slate-950 font-black flex items-center justify-center text-sm shadow">
                        {rankOrder}
                      </span>
                      <span className="font-extrabold text-white text-base md:text-lg tracking-wide uppercase">
                        {revealedItem.answerText}
                      </span>
                    </div>
                    <span className="bg-yellow-400 text-slate-950 font-black px-3.5 py-1 rounded-lg text-lg shadow-inner">
                      {revealedItem.points}
                    </span>
                  </div>
                ) : (
                  <div className="w-full flex items-center justify-center">
                    <span className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-black flex items-center justify-center text-lg shadow-inner">
                      {rankOrder}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Scenario 3: Board Cleared Immediate Victory Celebration Banner */}
      {snapshot.phase === 'ROUND_CLEARED' && (
        <div
          data-testid="round-cleared-banner"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
        >
          <div className="max-w-2xl w-full bg-gradient-to-b from-yellow-500 via-amber-600 to-yellow-700 p-1 rounded-3xl shadow-[0_0_60px_rgba(250,204,21,0.6)]">
            <div className="bg-slate-950 rounded-[22px] p-8 text-center flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-yellow-400/20 border-2 border-yellow-400 flex items-center justify-center mb-4 animate-bounce">
                <Trophy className="w-12 h-12 text-yellow-400" />
              </div>
              <h2 className="text-3xl md:text-5xl font-black text-yellow-300 uppercase tracking-tight mb-2">
                {t.mainGame.roundClearedTitle}
              </h2>
              <p className="text-lg md:text-xl text-slate-200 font-semibold mb-6">
                {t.mainGame.roundClearedSubtitle
                  .replace('{team}', controllingTeamName)
                  .replace('{points}', String(snapshot.roundBank))}
              </p>
              <div className="px-6 py-2.5 rounded-full bg-yellow-400 text-slate-950 font-black text-xl shadow-lg">
                +{snapshot.roundBank} POINTS
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scenario 4: Steal Phase Handoff Banner */}
      {snapshot.phase === 'STEAL_PHASE' && (
        <div
          data-testid="steal-phase-banner"
          className="relative z-20 w-full max-w-4xl mx-auto mt-4 p-5 rounded-2xl bg-gradient-to-r from-red-900/90 via-purple-900/90 to-red-900/90 border-2 border-red-500 shadow-2xl flex items-center justify-between animate-pulse"
        >
          <div className="flex items-center gap-4">
            <AlertTriangle className="w-10 h-10 text-yellow-400 animate-bounce" />
            <div>
              <div className="text-xs uppercase font-black tracking-widest text-red-300">
                {t.mainGame.threeStrikes}
              </div>
              <div className="text-xl md:text-2xl font-black text-white">
                {t.mainGame.chanceToSteal.replace('{team}', opposingTeamName)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs uppercase font-bold text-yellow-300 block">Bank At Stake</span>
            <span className="text-3xl font-black text-yellow-400">{snapshot.roundBank} PTS</span>
          </div>
        </div>
      )}

      {/* Full-Screen Giant Strike Overlay Animation (Scenario 2 & 4) */}
      {activeStrikeOverlay && (
        <div
          data-testid="giant-strike-overlay"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-scale-up select-none pointer-events-none"
        >
          <div className="flex items-center justify-center gap-4 md:gap-8 mb-4">
            {Array.from({ length: activeStrikeOverlay.count }).map((_, i) => (
              <span
                key={i}
                className="text-8xl md:text-[14rem] font-black text-red-500 leading-none drop-shadow-[0_0_50px_rgba(239,68,68,0.9)] animate-pulse"
              >
                X
              </span>
            ))}
          </div>
          {activeStrikeOverlay.message && (
            <div className="px-6 py-2 rounded-full bg-red-600/40 border border-red-500 text-white font-extrabold text-xl md:text-2xl uppercase tracking-wider shadow-lg">
              {activeStrikeOverlay.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MainGameTeamGuessingBoard;
