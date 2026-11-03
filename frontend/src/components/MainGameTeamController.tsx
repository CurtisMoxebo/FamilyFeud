import React, { useState, useEffect, useRef } from 'react';
import {
  TeamGuessingSessionState,
  TimerTickPayload,
  StrikeIssuedPayload,
  RoundClearedPayload,
  TransitionStealPhasePayload,
} from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import {
  Clock,
  Send,
  ArrowLeft,
  Sparkles,
  Flame,
  AlertTriangle,
  Trophy,
  SkipForward,
  Users,
} from 'lucide-react';

export interface MainGameTeamControllerProps {
  snapshot: TeamGuessingSessionState;
  timerTick?: TimerTickPayload | null;
  strikeIssued?: StrikeIssuedPayload | null;
  roundCleared?: RoundClearedPayload | null;
  transitionStealPhase?: TransitionStealPhasePayload | null;
  currentNickname: string;
  currentPlayerId?: string;
  roomCode: string;
  roomName: string;
  onSubmitGuess?: (rawAnswer: string) => void;
  onPassTurn?: () => void;
  onLeave?: () => void;
}

export const MainGameTeamController: React.FC<MainGameTeamControllerProps> = ({
  snapshot,
  timerTick,
  strikeIssued,
  roundCleared,
  transitionStealPhase,
  currentNickname,
  currentPlayerId,
  roomCode,
  roomName,
  onSubmitGuess,
  onPassTurn,
  onLeave,
}) => {
  const { t } = useTranslation();
  const [guessInput, setGuessInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [localStrikeAlert, setLocalStrikeAlert] = useState<{
    count: number;
    message?: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const lastStrikeTimestamp = useRef<number>(0);

  // Authoritative remaining seconds
  const currentSeconds =
    timerTick && timerTick.secondsRemaining !== undefined
      ? timerTick.secondsRemaining
      : snapshot.remainingSeconds;

  const trimmedNick = currentNickname.trim().toLowerCase();

  // Determine controlling vs opposing team identity
  const isControllingTeam =
    snapshot.controllingTeamPlayers.some(
      (p) =>
        (currentPlayerId && p.id === currentPlayerId) ||
        p.nickname.toLowerCase() === trimmedNick
    );

  const controllingTeamName =
    snapshot.controllingTeam === 'TEAM_1' ? t.mainGame.team1 : t.mainGame.team2;
  const opposingTeamName =
    snapshot.opposingTeam === 'TEAM_1' ? t.mainGame.team1 : t.mainGame.team2;

  // Active guesser arbiter
  const isActiveGuesser =
    isControllingTeam &&
    ((currentPlayerId && snapshot.activePlayer?.id === currentPlayerId) ||
      snapshot.activePlayer?.nickname.toLowerCase() === trimmedNick);

  // Auto-focus input when active turn begins
  useEffect(() => {
    if (isActiveGuesser && snapshot.phase === 'TEAM_GUESSING') {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isActiveGuesser, snapshot.activePlayer?.id, snapshot.phase]);

  // Strike alert banner listener
  useEffect(() => {
    if (strikeIssued && strikeIssued.strikeCount > 0) {
      const now = Date.now();
      if (!lastStrikeTimestamp.current || now - lastStrikeTimestamp.current > 300) {
        lastStrikeTimestamp.current = now;
        setLocalStrikeAlert({
          count: strikeIssued.strikeCount,
          message: strikeIssued.isDuplicate
            ? t.mainGame.duplicateAnswerWarning
            : strikeIssued.isTimeout
            ? "TIME'S UP!"
            : t.mainGame.notOnBoard,
        });

        const alertTimer = setTimeout(() => {
          setLocalStrikeAlert(null);
        }, 2500);
        return () => clearTimeout(alertTimer);
      }
    }
  }, [strikeIssued, t.mainGame.duplicateAnswerWarning, t.mainGame.notOnBoard]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = guessInput.trim();
    if (!cleaned || isSubmitting || !isActiveGuesser || snapshot.phase !== 'TEAM_GUESSING') {
      return;
    }

    setIsSubmitting(true);
    if (onSubmitGuess) {
      onSubmitGuess(cleaned);
    }
    setGuessInput('');
    setTimeout(() => {
      setIsSubmitting(false);
    }, 600);
  };

  const handlePass = () => {
    if (isSubmitting || !isActiveGuesser || snapshot.phase !== 'TEAM_GUESSING') {
      return;
    }
    setIsSubmitting(true);
    if (onPassTurn) {
      onPassTurn();
    }
    setGuessInput('');
    setTimeout(() => {
      setIsSubmitting(false);
    }, 600);
  };

  const totalSlots = Math.max(
    snapshot.totalAnswersCount,
    snapshot.question.answerCount,
    snapshot.revealedAnswers.length,
    4
  );

  return (
    <div
      className="w-full max-w-lg mx-auto flex flex-col min-h-[90vh] text-white select-none relative pb-6"
      data-testid="main-game-team-controller"
    >
      {/* Top Mobile Bar */}
      <header className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          {onLeave && (
            <button
              onClick={onLeave}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Leave Room"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {t.mainGame.teamGuessingTitle}
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {t.mainGame.roundNumber.replace('{round}', String(snapshot.roundNumber))}
              </span>
            </div>
            <h1 className="text-base font-extrabold text-white truncate max-w-[200px]">
              {roomName}
              <span className="text-xs font-normal text-slate-400 ml-1.5">({roomCode})</span>
            </h1>
          </div>
        </div>

        {/* Player Roster Badge */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold uppercase ${
            isControllingTeam
              ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
              : 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>{isControllingTeam ? controllingTeamName : opposingTeamName}</span>
        </div>
      </header>

      {/* Survey Question Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/40 shadow-xl text-center mb-4">
        <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-300/80 block mb-1">
          Survey Question
        </span>
        <h2 className="text-base sm:text-lg font-black text-yellow-300 tracking-wide">
          "{snapshot.question.questionText}"
        </h2>
      </div>

      {/* Round Bank & Strikes Row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Round Bank */}
        <div className="bg-gradient-to-b from-yellow-500/15 to-amber-600/10 border border-yellow-400/50 rounded-2xl p-3 flex flex-col items-center justify-center shadow-md">
          <span className="text-[10px] uppercase font-black tracking-wider text-yellow-400/90">
            {t.mainGame.roundBankTitle}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Sparkles className="w-4 h-4 text-yellow-400 animate-spin" />
            <span
              className="text-2xl font-black text-yellow-300"
              data-testid="player-round-bank"
            >
              {snapshot.roundBank}
            </span>
            <span className="text-xs font-bold text-yellow-400/80">PTS</span>
          </div>
        </div>

        {/* 3-Strike Indicators */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 flex flex-col items-center justify-center shadow-md">
          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1">
            {t.mainGame.strikeTitle}s
          </span>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((strikeNum) => {
              const hasStrike = snapshot.strikes >= strikeNum;
              return (
                <div
                  key={strikeNum}
                  data-testid={`player-strike-box-${strikeNum}`}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm transition-all ${
                    hasStrike
                      ? 'bg-red-600 text-white border-2 border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.7)] scale-105'
                      : 'bg-slate-800 text-slate-500 border border-slate-700'
                  }`}
                >
                  {hasStrike ? 'X' : strikeNum}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Turn Status Banner */}
      <div className="mb-4">
        {isActiveGuesser ? (
          <div
            data-testid="active-guesser-banner"
            className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-600/30 via-blue-600/30 to-indigo-600/30 border-2 border-indigo-400/60 shadow-lg flex items-center justify-between animate-pulse"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center font-black text-white text-sm shadow">
                {snapshot.activePlayer?.battingOrder || 1}
              </div>
              <div>
                <span className="text-xs font-black uppercase text-indigo-300 block">
                  {t.mainGame.yourTurnToGuess}
                </span>
                <span className="text-xs text-slate-300">Submit an answer or pass turn</span>
              </div>
            </div>

            {/* Countdown Badge */}
            {snapshot.phase === 'TEAM_GUESSING' && (
              <div
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full font-black text-sm border ${
                  currentSeconds <= 3
                    ? 'bg-red-500/20 text-red-400 border-red-500 animate-ping'
                    : currentSeconds <= 7
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500'
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                }`}
                data-testid="player-turn-timer"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{currentSeconds}s</span>
              </div>
            )}
          </div>
        ) : isControllingTeam ? (
          <div
            data-testid="waiting-teammate-banner"
            className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <Flame className="w-5 h-5 text-amber-400 animate-pulse" />
              <div>
                <span className="text-xs font-bold text-slate-300 block">
                  {t.mainGame.waitingForTeammate.replace(
                    '{name}',
                    snapshot.activePlayer?.nickname || 'Teammate'
                  )}
                </span>
                <span className="text-[11px] text-slate-500">
                  Player #{snapshot.activePlayer?.battingOrder || 1} is guessing...
                </span>
              </div>
            </div>

            {snapshot.phase === 'TEAM_GUESSING' && (
              <div className="flex items-center gap-1 text-slate-400 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5" />
                <span>{currentSeconds}s</span>
              </div>
            )}
          </div>
        ) : (
          <div
            data-testid="opposing-team-banner"
            className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center gap-3 text-slate-300"
          >
            <Users className="w-5 h-5 text-emerald-400" />
            <div>
              <span className="text-xs font-bold block">
                {t.mainGame.controllingTeamPlaying.replace('{team}', controllingTeamName)}
              </span>
              <span className="text-[11px] text-slate-400">
                Stand by! If they get 3 strikes, your team can STEAL!
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Strike Alert Popup Banner (when strikeIssued arrives) */}
      {localStrikeAlert && (
        <div
          data-testid="mobile-strike-alert"
          className="mb-4 p-3.5 rounded-2xl bg-red-950/90 border-2 border-red-500 shadow-xl flex items-center justify-between animate-shake"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center text-red-400 font-black text-2xl tracking-tight">
              {Array.from({ length: localStrikeAlert.count }).map((_, i) => (
                <span key={i} className="animate-pulse">
                  X
                </span>
              ))}
            </div>
            <div>
              <span className="text-xs font-extrabold text-red-200 uppercase block">
                {t.mainGame.strikesCount.replace('{count}', String(localStrikeAlert.count))}
              </span>
              <span className="text-xs text-red-300 font-medium">
                {localStrikeAlert.message}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Answer Board Slots (Compact Mobile Card Grid) */}
      <div className="mb-4 p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
          Survey Board ({snapshot.revealedAnswers.length} / {totalSlots} Revealed)
        </span>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: totalSlots }).map((_, idx) => {
            const rankOrder = idx + 1;
            const item = snapshot.revealedAnswers.find((ra) => ra.rankOrder === rankOrder);
            const isRevealed = Boolean(item);

            return (
              <div
                key={rankOrder}
                data-testid={`player-card-slot-${rankOrder}`}
                className={`min-h-[44px] rounded-xl px-2.5 py-1.5 flex items-center justify-between border text-xs transition-all ${
                  isRevealed
                    ? 'bg-blue-950/80 border-yellow-400/70 text-white shadow-sm'
                    : 'bg-slate-900/80 border-slate-800 text-slate-500'
                }`}
              >
                {isRevealed && item ? (
                  <>
                    <div className="flex items-center gap-1.5 truncate mr-1">
                      <span className="w-5 h-5 rounded-full bg-yellow-400 text-slate-950 font-black flex items-center justify-center text-[10px] shrink-0">
                        {rankOrder}
                      </span>
                      <span className="font-bold uppercase truncate">{item.answerText}</span>
                    </div>
                    <span className="font-black text-yellow-400 shrink-0">{item.points}</span>
                  </>
                ) : (
                  <div className="w-full flex items-center justify-center">
                    <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 font-bold flex items-center justify-center text-[10px] text-slate-400">
                      {rankOrder}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Answer Submission / Pass Form for Active Guesser */}
      {isActiveGuesser && snapshot.phase === 'TEAM_GUESSING' ? (
        <form
          onSubmit={handleSubmit}
          className="mt-auto flex flex-col gap-2.5 p-4 rounded-2xl bg-slate-900/90 border border-indigo-500/50 shadow-2xl"
          data-testid="player-guess-form"
        >
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              placeholder={t.mainGame.teamGuessInputPlaceholder}
              disabled={isSubmitting}
              maxLength={40}
              data-testid="player-guess-input"
              className="w-full bg-slate-950 border border-indigo-500/40 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm font-semibold focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 transition-all uppercase"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="submit"
              disabled={isSubmitting || !guessInput.trim()}
              data-testid="player-submit-guess-btn"
              className="col-span-2 py-3 px-4 rounded-xl bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 text-slate-950 font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{t.mainGame.submitAnswer}</span>
            </button>

            <button
              type="button"
              onClick={handlePass}
              disabled={isSubmitting}
              data-testid="player-pass-turn-btn"
              className="col-span-1 py-3 px-2 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-40"
            >
              <SkipForward className="w-3.5 h-3.5" />
              <span>{t.mainGame.passTurnBtn}</span>
            </button>
          </div>
        </form>
      ) : null}

      {/* Immediate Board Cleared Victory Modal */}
      {(snapshot.phase === 'ROUND_CLEARED' || roundCleared) && (
        <div
          data-testid="mobile-round-cleared-banner"
          className="mt-auto p-5 rounded-2xl bg-gradient-to-b from-yellow-500/20 via-amber-600/20 to-yellow-500/10 border-2 border-yellow-400 shadow-xl text-center animate-fade-in"
        >
          <div className="w-12 h-12 rounded-full bg-yellow-400/20 border border-yellow-400 mx-auto flex items-center justify-center mb-2 animate-bounce">
            <Trophy className="w-6 h-6 text-yellow-400" />
          </div>
          <h3 className="text-xl font-black text-yellow-300 uppercase tracking-tight">
            {t.mainGame.roundClearedTitle}
          </h3>
          <p className="text-xs text-slate-300 font-medium mt-1">
            {t.mainGame.roundClearedSubtitle
              .replace('{team}', controllingTeamName)
              .replace('{points}', String(snapshot.roundBank))}
          </p>
        </div>
      )}

      {/* Steal Phase Transition Banner */}
      {(snapshot.phase === 'STEAL_PHASE' || transitionStealPhase) && (
        <div
          data-testid="mobile-steal-phase-banner"
          className="mt-auto p-4 rounded-2xl bg-gradient-to-r from-red-950/90 via-purple-950/90 to-red-950/90 border-2 border-red-500 shadow-xl flex items-center justify-between animate-pulse"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-yellow-400 animate-bounce shrink-0" />
            <div>
              <span className="text-[10px] uppercase font-black tracking-wider text-red-300 block">
                {t.mainGame.threeStrikes}
              </span>
              <span className="text-sm font-black text-white">
                {t.mainGame.chanceToSteal.replace('{team}', opposingTeamName)}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] uppercase font-bold text-yellow-300 block">At Stake</span>
            <span className="text-lg font-black text-yellow-400">{snapshot.roundBank} PTS</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainGameTeamController;
