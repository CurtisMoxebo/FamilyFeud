import React, { useState, useEffect, useRef } from 'react';
import { MainGameScoreboardHeader } from './MainGameScoreboardHeader';
import {
  ScoreboardUpdatePayload,
  TeamGuessingSessionState,
  TimerTickPayload,
  StrikeIssuedPayload,
  RoundClearedPayload,
  TransitionStealPhasePayload,
  StealResolvedPayload,
  TeamGuessSubmittedPayload,
  AnswerRevealCompletedPayload,
} from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { triggerHaptic } from '../utils/haptics';
import { useVirtualKeyboard } from '../hooks/useVirtualKeyboard';
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
  Zap,
  ShieldCheck,
} from 'lucide-react';

export interface MainGameTeamControllerProps {
  snapshot: TeamGuessingSessionState;
  timerTick?: TimerTickPayload | null;
  isPaused?: boolean;
  pausedRemainingSeconds?: number;
  strikeIssued?: StrikeIssuedPayload | null;
  roundCleared?: RoundClearedPayload | null;
  transitionStealPhase?: TransitionStealPhasePayload | null;
  stealResolved?: StealResolvedPayload | null;
  currentNickname: string;
  currentPlayerId?: string;
  roomCode: string;
  roomName: string;
  onSubmitGuess?: (rawAnswer: string) => void;
  onSubmitStealGuess?: (rawAnswer: string) => void;
  onPassTurn?: () => void;
  scoreboardState?: ScoreboardUpdatePayload | null;
  teamGuessSubmitted?: TeamGuessSubmittedPayload | null;
  answerRevealCompleted?: AnswerRevealCompletedPayload | null;
  onLeave?: () => void;
}

export const MainGameTeamController: React.FC<MainGameTeamControllerProps> = ({
  snapshot,
  timerTick,
  isPaused = false,
  pausedRemainingSeconds,
  strikeIssued,
  roundCleared,
  transitionStealPhase,
  stealResolved,
  teamGuessSubmitted,
  answerRevealCompleted,
  currentNickname,
  currentPlayerId,
  roomCode,
  roomName,
  onSubmitGuess,
  onSubmitStealGuess,
  onPassTurn,
  scoreboardState,
  onLeave,
}) => {
  const { t } = useTranslation();
  const [guessInput, setGuessInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [localStrikeAlert, setLocalStrikeAlert] = useState<{
    count: number;
    message?: string;
  } | null>(null);
  const [activeAnnouncement, setActiveAnnouncement] = useState<{
    player: string;
    answer: string;
  } | null>(null);
  const handledSubmissionRef = useRef<Set<string>>(new Set());
  const pendingStrikeAlertRef = useRef<{ count: number; message?: string } | null>(null);

  // Listen for team guess submitted
  useEffect(() => {
    if (teamGuessSubmitted?.rawAnswer) {
      const key = `${teamGuessSubmitted.playerId}-${teamGuessSubmitted.rawAnswer}`;
      if (!handledSubmissionRef.current.has(key)) {
        handledSubmissionRef.current.add(key);
        setActiveAnnouncement({
          player: teamGuessSubmitted.playerNickname || 'Teammate',
          answer: teamGuessSubmitted.rawAnswer,
        });
      }
    }
  }, [teamGuessSubmitted]);

  // Safety timer for announcement suspense (~2800ms)
  useEffect(() => {
    if (!activeAnnouncement) return;
    const timer = setTimeout(() => {
      setActiveAnnouncement(null);
    }, 2800);
    return () => clearTimeout(timer);
  }, [activeAnnouncement]);

  // Dismiss suspense immediately when host finishes reading and sends answerRevealCompleted
  useEffect(() => {
    if (answerRevealCompleted && activeAnnouncement) {
      setActiveAnnouncement(null);
    }
  }, [answerRevealCompleted, activeAnnouncement]);

  // Flush pending strike alert when announcement suspense ends
  useEffect(() => {
    if (!activeAnnouncement && pendingStrikeAlertRef.current) {
      const pending = pendingStrikeAlertRef.current;
      pendingStrikeAlertRef.current = null;
      triggerHaptic('strike');
      setLocalStrikeAlert(pending);
      const alertTimer = setTimeout(() => {
        setLocalStrikeAlert(null);
      }, 2500);
      return () => clearTimeout(alertTimer);
    }
  }, [activeAnnouncement]);

  const inputRef = useRef<HTMLInputElement>(null);
  const formAnchorRef = useRef<HTMLFormElement>(null);
  const lastStrikeTimestamp = useRef<number>(0);
  const prevStrikesRef = useRef<number>(snapshot.strikes);
  const prevRevealedCountRef = useRef<number>(snapshot.revealedAnswers.length);
  const handledResolutionRef = useRef<string | null>(null);
  const { isKeyboardOpen, keepElementVisible } = useVirtualKeyboard();

  // Dismiss mobile strike alert immediately if strike is retracted by Host Override (US-21 Scenario 2)
  useEffect(() => {
    if (snapshot.strikes < prevStrikesRef.current) {
      setLocalStrikeAlert(null);
    }
    prevStrikesRef.current = snapshot.strikes;
  }, [snapshot.strikes]);

  // Authoritative remaining seconds
  const currentSeconds =
    isPaused && typeof pausedRemainingSeconds === 'number' && pausedRemainingSeconds > 0
      ? pausedRemainingSeconds
      : timerTick && timerTick.secondsRemaining !== undefined
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

  const playerTeam: 'TEAM_1' | 'TEAM_2' | null = isControllingTeam ? snapshot.controllingTeam : snapshot.opposingTeam;

  // Active guesser arbiter for standard turn
  const isActiveGuesser =
    isControllingTeam &&
    ((currentPlayerId && snapshot.activePlayer?.id === currentPlayerId) ||
      snapshot.activePlayer?.nickname.toLowerCase() === trimmedNick);

  // US-15 Steal Phase arbiters
  const isStealPhase = snapshot.phase === 'STEAL_PHASE' || Boolean(transitionStealPhase);

  const stealSpokesperson =
    transitionStealPhase?.spokesperson ||
    snapshot.stealSpokesperson ||
    snapshot.opposingTeamPlayers[0];

  const isSpokesperson =
    isStealPhase &&
    !isControllingTeam &&
    ((currentPlayerId && stealSpokesperson?.id === currentPlayerId) ||
      stealSpokesperson?.nickname.toLowerCase() === trimmedNick);

  const isStealingTeammate = isStealPhase && !isControllingTeam && !isSpokesperson;
  const isDefendingTeam = isStealPhase && isControllingTeam;

  // Auto-focus input when active turn or steal turn begins
  useEffect(() => {
    if (
      (isActiveGuesser && snapshot.phase === 'TEAM_GUESSING') ||
      (isSpokesperson && snapshot.phase === 'STEAL_PHASE')
    ) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isActiveGuesser, isSpokesperson, snapshot.activePlayer?.id, snapshot.phase]);

  // Strike alert banner & double-pulse haptic feedback listener (US-22)
  useEffect(() => {
    if (strikeIssued && strikeIssued.strikeCount > 0) {
      const now = Date.now();
      if (!lastStrikeTimestamp.current || now - lastStrikeTimestamp.current > 300) {
        lastStrikeTimestamp.current = now;
        const alertData = {
          count: strikeIssued.strikeCount,
          message: strikeIssued.isDuplicate
            ? t.mainGame.duplicateAnswerWarning
            : strikeIssued.isTimeout
            ? "TIME'S UP!"
            : t.mainGame.notOnBoard,
        };

        if (activeAnnouncement) {
          pendingStrikeAlertRef.current = alertData;
        } else {
          triggerHaptic('strike');
          setLocalStrikeAlert(alertData);
          const alertTimer = setTimeout(() => {
            setLocalStrikeAlert(null);
          }, 2500);
          return () => clearTimeout(alertTimer);
        }
      }
    }
  }, [strikeIssued, activeAnnouncement, t.mainGame.duplicateAnswerWarning, t.mainGame.notOnBoard]);

  // US-22: Celebratory haptic feedback on answer reveal, board clear, or steal resolution
  useEffect(() => {
    if (
      snapshot.revealedAnswers.length > prevRevealedCountRef.current &&
      snapshot.phase === 'TEAM_GUESSING' &&
      isControllingTeam
    ) {
      if (!activeAnnouncement) {
        triggerHaptic('success');
      }
    }
    prevRevealedCountRef.current = snapshot.revealedAnswers.length;
  }, [snapshot.revealedAnswers.length, snapshot.phase, isControllingTeam, activeAnnouncement]);

  useEffect(() => {
    if (roundCleared && isControllingTeam) {
      const key = `cleared-${snapshot.roundNumber}`;
      if (handledResolutionRef.current !== key) {
        handledResolutionRef.current = key;
        triggerHaptic('success');
      }
    }
  }, [roundCleared, isControllingTeam, snapshot.roundNumber]);

  useEffect(() => {
    if (stealResolved) {
      const key = `steal-${snapshot.roundNumber}-${stealResolved.winningTeam}`;
      if (handledResolutionRef.current !== key) {
        handledResolutionRef.current = key;
        const didMyTeamWin =
          (stealResolved.success && !isControllingTeam) ||
          (!stealResolved.success && isControllingTeam);
        triggerHaptic(didMyTeamWin ? 'success' : 'strike');
      }
    }
  }, [stealResolved, isControllingTeam, snapshot.roundNumber]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = guessInput.trim();
    if (isPaused || !cleaned || isSubmitting || !isActiveGuesser || snapshot.phase !== 'TEAM_GUESSING') {
      return;
    }

    setIsSubmitting(true);
    setActiveAnnouncement({
      player: currentNickname,
      answer: cleaned,
    });
    if (onSubmitGuess) {
      onSubmitGuess(cleaned);
    }
    setGuessInput('');
    setTimeout(() => {
      setIsSubmitting(false);
    }, 600);
  };

  const handleStealSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = guessInput.trim();
    if (isPaused || !cleaned || isSubmitting || !isSpokesperson || snapshot.phase !== 'STEAL_PHASE') {
      return;
    }

    setIsSubmitting(true);
    setActiveAnnouncement({
      player: currentNickname,
      answer: cleaned,
    });
    if (onSubmitStealGuess) {
      onSubmitStealGuess(cleaned);
    }
    setGuessInput('');
    setTimeout(() => {
      setIsSubmitting(false);
    }, 600);
  };

  const handlePass = () => {
    if (isPaused || isSubmitting || !isActiveGuesser || snapshot.phase !== 'TEAM_GUESSING') {
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

  const isStealSuccess = stealResolved
    ? stealResolved.success
    : Boolean(snapshot.phase === 'RESOLVED' && snapshot.winningTeam === snapshot.opposingTeam);

  const resolvedPoints =
    stealResolved?.pointsAwarded ?? snapshot.roundBank;

  const myTeamPlayers = isControllingTeam
    ? snapshot.controllingTeamPlayers
    : snapshot.opposingTeamPlayers;
  const myTeamName = isControllingTeam ? controllingTeamName : opposingTeamName;

  return (
    <div
      className={`w-full max-w-lg max-w-[100%] overflow-x-hidden mx-auto flex flex-col ${
        isKeyboardOpen ? 'min-h-0 pb-2' : 'h-full max-h-full justify-between pb-2 overflow-hidden'
      } text-white select-none relative pb-safe`}
      data-testid="main-game-team-controller"
      data-keyboard-open={isKeyboardOpen ? 'true' : 'false'}
    >
      {/* Top Mobile Bar */}
      <header className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
        <div className="flex items-center gap-2">
          {onLeave && (
            <button
              type="button"
              onClick={onLeave}
              className="touch-target min-h-touch min-w-touch flex items-center justify-center p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              title={t.mainGame.leaveRoomBtn}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {isStealPhase ? t.mainGame.stealPhaseTitle : t.mainGame.teamGuessingTitle}
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
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl border text-xs font-bold uppercase ${
            isControllingTeam
              ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
              : 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>{isControllingTeam ? controllingTeamName : opposingTeamName}</span>
        </div>
      </header>

      {/* Persistent Grand Total Header (US-16 Scenario 1 Mobile) */}
      <div className="w-full mb-2">
        <MainGameScoreboardHeader
          team1GrandTotal={scoreboardState?.team1GrandTotal ?? 0}
          team2GrandTotal={scoreboardState?.team2GrandTotal ?? 0}
          activeRoundBank={scoreboardState?.activeRoundBank ?? snapshot.roundBank ?? 0}
          currentRoundNumber={scoreboardState?.currentRoundNumber ?? snapshot.roundNumber ?? 1}
          totalRounds={scoreboardState?.totalRounds ?? (snapshot.controllingTeamPlayers?.length ? snapshot.controllingTeamPlayers.length : 3)}
          isSuddenDeath={scoreboardState?.isSuddenDeath ?? false}
          highlightTeam={playerTeam}
          compact={true}
        />
      </div>

      {/* Survey Question Card */}
      <div
        data-testid="team-controller-question-card"
        className={`${
          isKeyboardOpen ? 'p-2 mb-1.5' : 'p-2.5 sm:p-3 mb-2'
        } rounded-xl sm:rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/40 shadow-xl text-center transition-all`}
      >
        <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-300/80 block mb-0.5">
          Survey Question
        </span>
        <h2 className="text-sm sm:text-base font-black text-yellow-300 tracking-wide">
          "{snapshot.question.questionText}"
        </h2>
      </div>

      {/* Round Bank & Strikes Row */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {/* Round Bank */}
        <div className="bg-gradient-to-b from-yellow-500/15 to-amber-600/10 border border-yellow-400/50 rounded-xl p-2 flex flex-col items-center justify-center shadow-md">
          <span className="text-[10px] uppercase font-black tracking-wider text-yellow-400/90">
            {t.mainGame.roundBankTitle}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-spin" />
            <span
              className="text-xl font-black text-yellow-300"
              data-testid="player-round-bank"
            >
              {snapshot.roundBank}
            </span>
            <span className="text-xs font-bold text-yellow-400/80">PTS</span>
          </div>
        </div>

        {/* 3-Strike Indicators */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2 flex flex-col items-center justify-center shadow-md">
          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-0.5">
            {t.mainGame.strikeTitle}s
          </span>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((strikeNum) => {
              const hasStrike = snapshot.strikes >= strikeNum;
              return (
                <div
                  key={strikeNum}
                  data-testid={`player-strike-box-${strikeNum}`}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs transition-all ${
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

      {/* US-28: Suspense Announcement Card before Host Finishes Reading Answer */}
      {activeAnnouncement && (
        <div
          data-testid="controller-survey-said-banner"
          className="mb-2 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-yellow-500/20 via-feud-gold/30 to-yellow-500/20 border-2 border-feud-gold/70 shadow-xl flex flex-col items-center justify-center gap-1 text-center animate-pulse"
        >
          <Sparkles className="w-5 h-5 text-feud-gold animate-bounce" />
          <p className="text-xs sm:text-sm font-black text-white">
            {activeAnnouncement.player} said &ldquo;{activeAnnouncement.answer}&rdquo;...
          </p>
          <span className="text-[10px] sm:text-xs font-extrabold text-feud-gold uppercase tracking-widest">
            Survey said...
          </span>
        </div>
      )}

      {/* Active Turn Status Banner (Scenario 4) */}
      <div className="mb-2">
        {isStealPhase ? (
          isSpokesperson ? (
            /* Scenario 4: Spokesperson Mobile View */
            <div
              data-testid="spokesperson-steal-banner"
              className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-600/30 via-yellow-600/30 to-amber-600/30 border-2 border-yellow-400 shadow-xl flex items-center justify-between animate-pulse"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-yellow-400 text-slate-950 flex items-center justify-center font-black shadow shrink-0">
                  <Zap className="w-4 h-4 fill-slate-950" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-yellow-300 block">
                    {t.mainGame.stealPhaseTitle}
                  </span>
                  <span className="text-xs text-white font-extrabold">
                    {t.mainGame.spokespersonTurnPrompt}
                  </span>
                </div>
              </div>

              {/* 15s Countdown Badge */}
              <div
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-black text-xs border shrink-0 ${
                  currentSeconds <= 3
                    ? 'bg-red-500/20 text-red-400 border-red-500 animate-ping'
                    : currentSeconds <= 7
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500'
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                }`}
                data-testid="player-turn-timer"
              >
                <Clock className="w-3 h-3" />
                <span>{currentSeconds}s</span>
              </div>
            </div>
          ) : isStealingTeammate ? (
            /* Scenario 4: Non-Spokesperson Stealing Teammate View */
            <div
              data-testid="teammate-consult-banner"
              className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-purple-900/40 via-indigo-900/40 to-purple-900/40 border-2 border-indigo-400/60 shadow-xl flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-indigo-300 shrink-0 animate-pulse" />
                <div>
                  <span className="text-xs font-bold text-indigo-300 block">
                    {t.mainGame.teammateConsultPrompt.replace(
                      '{spokesperson}',
                      stealSpokesperson?.nickname || 'Spokesperson'
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Talk together to find the best unrevealed answer!
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 text-slate-400 text-xs font-semibold shrink-0">
                <Clock className="w-3 h-3" />
                <span>{currentSeconds}s</span>
              </div>
            </div>
          ) : isDefendingTeam ? (
            /* Scenario 4: Defending Team (3-Strike) Fingers Crossed View */
            <div
              data-testid="defending-team-banner"
              className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-900/95 border-2 border-slate-700 shadow-xl flex items-center justify-between text-slate-300"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xl shrink-0">🤞</span>
                <div>
                  <span className="text-xs font-extrabold text-slate-200 block">
                    {t.mainGame.defendingTeamFingersCrossed}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    If they miss, your team keeps all {snapshot.roundBank} points!
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 text-slate-400 text-xs font-semibold shrink-0">
                <Clock className="w-3 h-3" />
                <span>{currentSeconds}s</span>
              </div>
            </div>
          ) : null
        ) : isActiveGuesser ? (
          /* Standard Guesser Active Banner */
          <div
            data-testid="active-guesser-banner"
            className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-indigo-600/30 via-blue-600/30 to-indigo-600/30 border-2 border-indigo-400/60 shadow-lg flex items-center justify-between animate-pulse"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center font-black text-white text-xs shadow">
                {snapshot.activePlayer?.battingOrder || 1}
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-300 block">
                  {t.mainGame.yourTurnToGuess}
                </span>
                <span className="text-[11px] text-slate-300">{t.mainGame.submitOrPassPrompt}</span>
              </div>
            </div>

            {/* Countdown Badge */}
            {snapshot.phase === 'TEAM_GUESSING' && (
              <div
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-black text-xs border ${
                  currentSeconds <= 3
                    ? 'bg-red-500/20 text-red-400 border-red-500 animate-ping'
                    : currentSeconds <= 7
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500'
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                }`}
                data-testid="player-turn-timer"
              >
                <Clock className="w-3 h-3" />
                <span>{currentSeconds}s</span>
              </div>
            )}
          </div>
        ) : isControllingTeam ? (
          /* Waiting Teammate Banner */
          <div
            data-testid="waiting-teammate-banner"
            className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
              <div>
                <span className="text-xs font-bold text-slate-300 block">
                  {t.mainGame.waitingForTeammate.replace(
                    '{name}',
                    snapshot.activePlayer?.nickname || 'Teammate'
                  )}
                </span>
                <span className="text-[10px] text-slate-500">
                  Player #{snapshot.activePlayer?.battingOrder || 1} is guessing...
                </span>
              </div>
            </div>

            {snapshot.phase === 'TEAM_GUESSING' && (
              <div className="flex items-center gap-1 text-slate-400 text-xs font-semibold">
                <Clock className="w-3 h-3" />
                <span>{currentSeconds}s</span>
              </div>
            )}
          </div>
        ) : (
          /* Opposing Team Waiting Banner */
          <div
            data-testid="opposing-team-banner"
            className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center gap-2.5 text-slate-300"
          >
            <Users className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="text-xs font-bold block">
                {t.mainGame.controllingTeamPlaying.replace('{team}', controllingTeamName)}
              </span>
              <span className="text-[10px] text-slate-400">
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
          className="mb-2 p-2.5 rounded-xl bg-red-950/90 border-2 border-red-500 shadow-xl flex items-center justify-between animate-shake"
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

      {/* My Team Roster: Members of My Team in 2 Columns */}
      {myTeamPlayers && myTeamPlayers.length > 0 && (
        <div
          data-testid="mobile-my-team-roster"
          className={`${
            isKeyboardOpen ? 'hidden' : 'flex flex-col'
          } w-full mb-2 gap-1 transition-all`}
        >
          <div className="flex items-center justify-between px-1 mb-0.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {myTeamName} ({myTeamPlayers.length} Members)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {myTeamPlayers.map((player) => {
              const isMe =
                (currentPlayerId && player.id === currentPlayerId) ||
                player.nickname.toLowerCase() === trimmedNick;
              const isTurn = snapshot.activePlayer?.id === player.id;
              const isSpokesperson = isStealPhase && stealSpokesperson?.id === player.id;

              return (
                <div
                  key={player.id}
                  data-testid={`mobile-team-player-${player.id}`}
                  className={`flex items-center justify-between px-2 py-1 rounded-lg text-xs border transition-all ${
                    isTurn
                      ? 'bg-amber-500/25 border-amber-400/70 text-amber-200 font-extrabold shadow-[0_0_12px_rgba(245,158,11,0.35)] animate-pulse'
                      : isSpokesperson
                      ? 'bg-purple-500/25 border-purple-400/60 text-purple-200 font-extrabold shadow-sm'
                      : isMe
                      ? playerTeam === 'TEAM_1'
                        ? 'bg-blue-600/30 border-blue-400/50 text-white font-bold'
                        : 'bg-emerald-600/30 border-emerald-400/50 text-white font-bold'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate mr-1">
                    <span
                      className={`w-4 h-4 rounded-full font-black flex items-center justify-center text-[9px] shrink-0 ${
                        playerTeam === 'TEAM_1'
                          ? 'bg-blue-500/30 text-blue-300'
                          : 'bg-emerald-500/30 text-emerald-300'
                      }`}
                    >
                      {player.battingOrder}
                    </span>
                    <span className="truncate font-bold text-xs">{player.nickname}</span>
                    {isMe && (
                      <span className="text-[8px] text-yellow-300 uppercase font-black shrink-0">
                        (You)
                      </span>
                    )}
                  </div>
                  {isTurn && (
                    <span className="text-[8px] uppercase tracking-wider font-black text-amber-300 shrink-0">
                      Turn
                    </span>
                  )}
                  {isSpokesperson && !isTurn && (
                    <span className="text-[8px] uppercase tracking-wider font-black text-purple-300 shrink-0">
                      Steal
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive Answer Submission / Pass Form for Active Guesser during TEAM_GUESSING */}
      {isActiveGuesser && snapshot.phase === 'TEAM_GUESSING' ? (
        <form
          ref={formAnchorRef}
          onSubmit={handleSubmit}
          className={`mt-auto flex flex-col gap-1.5 ${
            isKeyboardOpen ? 'p-2 sticky bottom-0 z-20' : 'p-2.5 sm:p-3'
          } rounded-xl sm:rounded-2xl bg-slate-900/95 border border-indigo-500/50 shadow-2xl`}
          data-testid="player-guess-form"
        >
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              enterKeyHint="send"
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              onFocus={() => keepElementVisible(formAnchorRef.current)}
              placeholder={t.mainGame.teamGuessInputPlaceholder}
              disabled={isPaused || isSubmitting}
              maxLength={40}
              data-testid="player-guess-input"
              className="w-full min-h-touch bg-slate-950 border border-indigo-500/40 rounded-xl px-3 py-2 text-white placeholder-slate-500 text-base font-semibold focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 transition-all uppercase disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="submit"
              disabled={isPaused || isSubmitting || !guessInput.trim()}
              data-testid="player-submit-guess-btn"
              className="col-span-2 touch-target min-h-touch py-2.5 px-3 rounded-xl bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wide flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t.mainGame.submitAnswer}</span>
            </button>

            <button
              type="button"
              onClick={handlePass}
              disabled={isPaused || isSubmitting}
              data-testid="player-pass-turn-btn"
              className="col-span-1 touch-target min-h-touch py-2.5 px-2 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SkipForward className="w-3 h-3" />
              <span>{t.mainGame.passTurnBtn}</span>
            </button>
          </div>
        </form>
      ) : null}

      {/* Scenario 4: Interactive Steal Submission Form (ONLY for designated spokesperson during STEAL_PHASE) */}
      {isSpokesperson && snapshot.phase === 'STEAL_PHASE' ? (
        <form
          ref={formAnchorRef}
          onSubmit={handleStealSubmit}
          className={`mt-auto flex flex-col gap-1.5 ${
            isKeyboardOpen ? 'p-2 sticky bottom-0 z-20' : 'p-2.5 sm:p-3'
          } rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-950/95 via-yellow-950/95 to-amber-950/95 border-2 border-yellow-400 shadow-2xl animate-fade-in`}
          data-testid="spokesperson-steal-form"
        >
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              enterKeyHint="send"
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              onFocus={() => keepElementVisible(formAnchorRef.current)}
              placeholder={t.mainGame.stealInputPlaceholder}
              disabled={isPaused || isSubmitting}
              maxLength={40}
              data-testid="spokesperson-steal-input"
              className="w-full min-h-touch bg-slate-950 border-2 border-yellow-400/80 rounded-xl px-3 py-2 text-white placeholder-slate-400 text-base font-bold focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all uppercase shadow-inner disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isPaused || isSubmitting || !guessInput.trim()}
            data-testid="spokesperson-submit-steal-btn"
            className="w-full touch-target min-h-touch py-2.5 px-4 rounded-xl bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wide flex items-center justify-center gap-2 shadow-xl hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Zap className="w-4 h-4 fill-slate-950" />
            <span>{t.mainGame.submitStealAnswer}</span>
          </button>
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

      {/* Steal Phase Transition Banner (Non-spokespersons when bottom form is absent) */}
      {!isSpokesperson && isStealPhase && (
        <div
          data-testid="mobile-steal-phase-banner"
          className="mt-auto p-4 rounded-2xl bg-gradient-to-r from-red-950/90 via-purple-950/90 to-red-950/90 border-2 border-red-500 shadow-xl flex items-center justify-between animate-pulse"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-yellow-400 animate-bounce shrink-0" />
            <div>
              <span className="text-[10px] uppercase font-black tracking-wider text-red-300 block">
                {t.mainGame.threeStrikes} — {t.mainGame.stealPhaseTitle}
              </span>
              <span className="text-sm font-black text-white">
                {t.mainGame.chanceToSteal.replace('{team}', opposingTeamName)}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] uppercase font-bold text-yellow-300 block">{t.mainGame.atStake}</span>
            <span className="text-lg font-black text-yellow-400">{snapshot.roundBank} PTS</span>
          </div>
        </div>
      )}

      {/* Steal Resolution Banner (Scenarios 1 & 2) */}
      {(stealResolved || (snapshot.phase === 'RESOLVED' && snapshot.winningTeam)) && (
        <div
          data-testid="mobile-steal-resolved-banner"
          className="mt-auto p-5 rounded-2xl border-2 shadow-2xl text-center animate-fade-in"
        >
          <div
            className={`w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-2 animate-bounce ${
              isStealSuccess
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400'
                : 'bg-amber-500/20 text-amber-400 border border-amber-400'
            }`}
          >
            {isStealSuccess ? <Trophy className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
          </div>
          <h3
            className={`text-xl font-black uppercase tracking-tight ${
              isStealSuccess ? 'text-emerald-300' : 'text-yellow-300'
            }`}
          >
            {isStealSuccess ? t.mainGame.stealPhaseTitle : t.mainGame.strikeTitle}
          </h3>
          <p className="text-xs text-white font-bold mt-1" data-testid="mobile-steal-outcome-text">
            {isStealSuccess
              ? t.mainGame.stealSuccessAnnouncement
                  .replace('{team}', opposingTeamName)
                  .replace('{points}', String(resolvedPoints))
              : t.mainGame.stealFailedAnnouncement
                  .replace('{team}', controllingTeamName)
                  .replace('{points}', String(resolvedPoints))}
          </p>
        </div>
      )}
    </div>
  );
};

export default MainGameTeamController;
