import { MainGameScoreboardHeader } from './MainGameScoreboardHeader';
import { MainGameVictoryModal } from './MainGameVictoryModal';
import React, { useEffect, useState, useRef } from 'react';
import {
  ScoreboardUpdatePayload,
  MatchOverPayload,
  SuddenDeathInitiatedPayload,
  TeamGuessingSessionState,
  TimerTickPayload,
  StrikeIssuedPayload,
  RoundClearedPayload,
  TransitionStealPhasePayload,
  MainGameBoardRevealPayload,
  StealResolvedPayload,
  RoundWinnerPayload,
  TeamRevealedAnswer,
  HostOverrideAnswerOption,
  AnswerOverridePayload,
} from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { useFullscreen } from '../hooks/useFullscreen';
import {
  playCorrectDing,
  playPointsChime,
  playStrikeBuzzer,
  playVictoryFanfare,
} from '../utils/soundEffects';
import {
  speakQuestion,
  speakBoardCleared,
  speakStealPhase,
  speakStealSuccess,
  speakStealFailed,
  cancelSpeech,
  isTtsMuted,
  setTtsMuted,
} from '../utils/tts';
import {
  Tv,
  Clock,
  ArrowLeft,
  Sparkles,
  Flame,
  Volume2,
  VolumeX,
  AlertTriangle,
  Trophy,
  Zap,
  ShieldCheck,
  Play,
  Gavel,
  CheckCircle2,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export interface MainGameTeamGuessingBoardProps {
  snapshot: TeamGuessingSessionState;
  timerTick?: TimerTickPayload | null;
  isPaused?: boolean;
  pausedRemainingSeconds?: number;
  isManualOverrideOpen?: boolean;
  onCloseManualOverride?: () => void;
  hostOverrideOptions?: HostOverrideAnswerOption[];
  answerOverrideAck?: AnswerOverridePayload | null;
  onOverrideAnswer?: (rankOrder: number, points?: number, teamId?: 'TEAM_1' | 'TEAM_2') => void;
  strikeIssued?: StrikeIssuedPayload | null;
  roundCleared?: RoundClearedPayload | null;
  transitionStealPhase?: TransitionStealPhasePayload | null;
  boardReveal?: MainGameBoardRevealPayload | null;
  stealResolved?: StealResolvedPayload | null;
  roundWinner?: RoundWinnerPayload | null;
  scoreboardState?: ScoreboardUpdatePayload | null;
  matchOver?: MatchOverPayload | null;
  suddenDeathInitiated?: SuddenDeathInitiatedPayload | null;
  onNextRound?: () => void;
  onReplay?: () => void;
  language?: string;
  roomName: string;
  roomCode: string;
  onLeave?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const MainGameTeamGuessingBoard: React.FC<MainGameTeamGuessingBoardProps> = ({
  snapshot,
  timerTick,
  isPaused = false,
  pausedRemainingSeconds,
  isManualOverrideOpen = false,
  onCloseManualOverride,
  hostOverrideOptions = [],
  answerOverrideAck = null,
  onOverrideAnswer,
  strikeIssued,
  roundCleared,
  transitionStealPhase,
  boardReveal,
  stealResolved,
  roundWinner,
  scoreboardState,
  matchOver,
  suddenDeathInitiated,
  onNextRound,
  onReplay,
  language = 'EN',
  roomName,
  roomCode,
  onLeave,
  isFullscreen: propsIsFullscreen,
  onToggleFullscreen,
}) => {
  const { t } = useTranslation();
  const internalFullscreen = useFullscreen({ enableShortcut: false });
  const isFullscreen = propsIsFullscreen ?? internalFullscreen.isFullscreen;
  const toggleFullscreen = onToggleFullscreen ?? internalFullscreen.toggleFullscreen;

  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => !isTtsMuted());

  const handleToggleAudio = () => {
    const nextAudio = !audioEnabled;
    setAudioEnabled(nextAudio);
    setTtsMuted(!nextAudio);
    if (!nextAudio) {
      cancelSpeech();
    }
  };

  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  // Scenario 1 & US-17: Trigger TTS reading of question when team guessing phase begins
  const lastSpokenQuestionId = useRef<string | null>(null);
  useEffect(() => {
    if (
      snapshot.phase === 'TEAM_GUESSING' &&
      snapshot.question?.id &&
      lastSpokenQuestionId.current !== snapshot.question.id
    ) {
      lastSpokenQuestionId.current = snapshot.question.id;
      if (audioEnabled) {
        speakQuestion(snapshot.question.questionText, language);
      }
    }
  }, [snapshot.phase, snapshot.question?.id, snapshot.question?.questionText, language, audioEnabled]);

  // Scenario 2: Cancel host reading on rapid guess submission or strike (US-17 Scenario 2)
  useEffect(() => {
    if (snapshot.revealedAnswers.length > 0 || (strikeIssued && strikeIssued.strikeCount > 0)) {
      cancelSpeech();
    }
  }, [snapshot.revealedAnswers.length, strikeIssued]);


  // Active full-screen strike animation overlay state
  const [activeStrikeOverlay, setActiveStrikeOverlay] = useState<{
    count: number;
    message?: string;
  } | null>(null);

  // Judge Manual Override state (US-21 Scenario 2)
  const [creditTeam, setCreditTeam] = useState<'TEAM_1' | 'TEAM_2'>(snapshot.controllingTeam);
  const [overrideToast, setOverrideToast] = useState<AnswerOverridePayload | null>(null);
  const prevStrikesRef = useRef<number>(snapshot.strikes);

  useEffect(() => {
    setCreditTeam(snapshot.controllingTeam);
  }, [snapshot.controllingTeam]);

  // Dismiss strike overlay immediately & reset steal flag if strike is retracted via Host Override
  useEffect(() => {
    if (snapshot.strikes < prevStrikesRef.current) {
      setActiveStrikeOverlay(null);
      if (snapshot.phase === 'TEAM_GUESSING' && snapshot.strikes < 3) {
        hasAnnouncedSteal.current = false;
      }
    }
    prevStrikesRef.current = snapshot.strikes;
  }, [snapshot.strikes, snapshot.phase]);

  useEffect(() => {
    if (answerOverrideAck) {
      setActiveStrikeOverlay(null);
      setOverrideToast(answerOverrideAck);
      const toastTimer = setTimeout(() => {
        setOverrideToast(null);
      }, 4000);
      return () => clearTimeout(toastTimer);
    }
  }, [answerOverrideAck]);

  // Track handled strikes and board reveals to avoid duplicate sound triggers
  const lastHandledStrikeTimestamp = useRef<number>(0);
  const lastRevealedAnswerCount = useRef<number>(snapshot.revealedAnswers.length);
  const hasCelebratedClear = useRef<boolean>(false);
  const hasAnnouncedSteal = useRef<boolean>(false);
  const hasCelebratedStealSuccess = useRef<boolean>(false);
  const hasAnnouncedStealFailed = useRef<boolean>(false);

  // Derive remaining seconds for authoritative countdown
  const currentSeconds =
    isPaused && typeof pausedRemainingSeconds === 'number' && pausedRemainingSeconds > 0
      ? pausedRemainingSeconds
      : timerTick && timerTick.secondsRemaining !== undefined
      ? timerTick.secondsRemaining
      : snapshot.remainingSeconds;

  const controllingTeamName =
    snapshot.controllingTeam === 'TEAM_1' ? t.mainGame.team1 : t.mainGame.team2;
  const opposingTeamName =
    snapshot.opposingTeam === 'TEAM_1' ? t.mainGame.team1 : t.mainGame.team2;

  const isStealPhase = snapshot.phase === 'STEAL_PHASE' || Boolean(transitionStealPhase);

  const spokesperson =
    transitionStealPhase?.spokesperson ||
    snapshot.stealSpokesperson ||
    snapshot.opposingTeamPlayers[0];

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
      playCorrectDing();
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
      if (audioEnabled) { cancelSpeech(); speakBoardCleared(controllingTeamName, language); }
    }
  }, [roundCleared, snapshot.phase, controllingTeamName, language]);

  // Scenario 4: Steal Phase trigger announcement
  useEffect(() => {
    if (
      (transitionStealPhase || snapshot.phase === 'STEAL_PHASE') &&
      !hasAnnouncedSteal.current
    ) {
      hasAnnouncedSteal.current = true;
      if (audioEnabled) { cancelSpeech(); speakStealPhase(opposingTeamName, language); }
    }
  }, [transitionStealPhase, snapshot.phase, opposingTeamName, language]);

  // US-15 Scenarios 1 & 2: Steal Phase Resolution Celebrations & Audio/TTS Announcements
  useEffect(() => {
    if (stealResolved) {
      if (stealResolved.success && !hasCelebratedStealSuccess.current) {
        hasCelebratedStealSuccess.current = true;
        playVictoryFanfare();
        if (audioEnabled) { cancelSpeech(); } speakStealSuccess(
          opposingTeamName,
          stealResolved.pointsAwarded || snapshot.roundBank,
          language
        );
      } else if (!stealResolved.success && !hasAnnouncedStealFailed.current) {
        hasAnnouncedStealFailed.current = true;
        playStrikeBuzzer(1);
        if (audioEnabled) { cancelSpeech(); } speakStealFailed(
          controllingTeamName,
          stealResolved.pointsAwarded || snapshot.roundBank,
          language
        );
      }
    }
  }, [stealResolved, opposingTeamName, controllingTeamName, snapshot.roundBank, language]);

  // Combine revealed answers from snapshot, boardReveal, and steal resolution (Scenario 3)
  const revealedMap = new Map<number, TeamRevealedAnswer>();
  snapshot.revealedAnswers.forEach((a) => revealedMap.set(a.rankOrder, a));

  if (boardReveal && boardReveal.rankOrder) {
    if (!revealedMap.has(boardReveal.rankOrder)) {
      revealedMap.set(boardReveal.rankOrder, {
        id: `reveal-${boardReveal.rankOrder}`,
        answerText: boardReveal.answerText,
        points: boardReveal.points,
        rankOrder: boardReveal.rankOrder,
        revealedByPlayerId: boardReveal.playerId,
        revealedByNickname: boardReveal.playerNickname,
        revealedByTeam: boardReveal.playerTeam,
        isStealMatch: boardReveal.isStealMatch,
        isRemainingReveal: boardReveal.isRemainingReveal,
      });
    }
  }

  if (stealResolved) {
    if (stealResolved.matchedAnswer && !revealedMap.has(stealResolved.matchedAnswer.rankOrder)) {
      revealedMap.set(stealResolved.matchedAnswer.rankOrder, {
        ...stealResolved.matchedAnswer,
        isStealMatch: true,
      });
    }
    if (stealResolved.remainingAnswers) {
      stealResolved.remainingAnswers.forEach((rem) => {
        if (!revealedMap.has(rem.rankOrder)) {
          revealedMap.set(rem.rankOrder, {
            ...rem,
            isRemainingReveal: true,
          });
        }
      });
    }
  }

  // Map of host-only unrevealed/revealed survey slot options for Judge Manual Override (US-21 Scenario 2)
  const overrideOptionMap = new Map<number, { rankOrder: number; answerText: string; points: number }>();
  if (snapshot.question.answers) {
    snapshot.question.answers.forEach((a) => {
      overrideOptionMap.set(a.rankOrder, {
        rankOrder: a.rankOrder,
        answerText: a.answerText,
        points: a.points,
      });
    });
  }
  hostOverrideOptions.forEach((opt) => {
    overrideOptionMap.set(opt.rankOrder, {
      rankOrder: opt.rankOrder,
      answerText: opt.answerText,
      points: opt.points,
    });
  });

  const showOverrideControls = Boolean(
    isManualOverrideOpen &&
      onOverrideAnswer &&
      (snapshot.phase === 'TEAM_GUESSING' || snapshot.phase === 'STEAL_PHASE')
  );

  // Total answer count for card grid
  const totalSlots = Math.max(
    snapshot.totalAnswersCount,
    snapshot.question.answerCount,
    revealedMap.size,
    4
  );

  const isStealSuccess = Boolean(
    stealResolved?.success ||
      (snapshot.phase === 'RESOLVED' && snapshot.winningTeam === snapshot.opposingTeam)
  );

  const resolvedPoints =
    stealResolved?.pointsAwarded ??
    roundWinner?.pointsAwarded ??
    snapshot.roundBank;

  const winnerTeamId =
    stealResolved?.winningTeam ??
    roundWinner?.winningTeam ??
    snapshot.winningTeam ??
    (isStealSuccess ? snapshot.opposingTeam : snapshot.controllingTeam);

  const winningTeamName =
    winnerTeamId === 'TEAM_1' ? t.mainGame.team1 : t.mainGame.team2;

  return (
    <div
      className="w-full min-h-screen min-h-dvh-safe bg-slate-950 text-white flex flex-col p-4 md:p-6 2xl:px-10 3xl:px-14 rounded-3xl select-none relative overflow-hidden"
      data-testid="main-game-team-guessing-board"
    >
      {/* Dynamic Background Glow */}
      <div className="absolute inset-0 bg-radial-gradient from-blue-900/20 via-transparent to-transparent pointer-events-none" />

      {/* Persistent Grand Total Header (US-16 Scenario 1 & 2) */}
      <div className="relative z-20 w-full max-w-5xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] mx-auto mb-4">
        <MainGameScoreboardHeader
          team1GrandTotal={scoreboardState?.team1GrandTotal ?? 0}
          team2GrandTotal={scoreboardState?.team2GrandTotal ?? 0}
          activeRoundBank={snapshot.roundBank}
          currentRoundNumber={scoreboardState?.currentRoundNumber ?? snapshot.roundNumber ?? 1}
          totalRounds={scoreboardState?.totalRounds ?? 3}
          isSuddenDeath={scoreboardState?.isSuddenDeath ?? false}
        />
      </div>

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
              title={t.mainGame.leaveRoomBtn}
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

        {/* Controlling Team Banner & Host Audio Controls (US-17 Scenario 4) */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            data-testid="host-fullscreen-toggle"
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? t.host.exitFullscreen : t.host.enterFullscreen}
            title={`${isFullscreen ? t.host.exitFullscreen : t.host.enterFullscreen} (${t.host.fullscreenHint})`}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5 text-feud-gold" />
            ) : (
              <Maximize2 className="w-5 h-5 text-feud-gold" />
            )}
            <span className="sr-only">{isFullscreen ? t.host.exitFullscreen : t.host.enterFullscreen}</span>
            <span className="sr-only">{t.host.fullscreenHint}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleAudio}
            data-testid="host-audio-toggle"
            title={audioEnabled ? 'Mute Sounds & TTS' : 'Unmute Sounds & TTS'}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            {audioEnabled ? (
              <Volume2 className="w-5 h-5 text-yellow-400" />
            ) : (
              <VolumeX className="w-5 h-5 text-slate-500" />
            )}
          </button>

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
      <section className="relative z-10 w-full max-w-4xl 2xl:max-w-6xl 3xl:max-w-[1440px] 4k:max-w-[1800px] mx-auto mb-6">
        <div className="p-4 md:p-6 2xl:p-8 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-2 border-indigo-500/40 shadow-2xl text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent opacity-80" />
          <h2 className="text-xl md:text-3xl 2xl:text-4xl 3xl:text-5xl font-black text-yellow-300 tracking-wide drop-shadow-md">
            "{snapshot.question.questionText}"
          </h2>
        </div>
      </section>

      {/* Main Game Stage Scoreboard & Centerpieces */}
      <div className="relative z-10 w-full max-w-5xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        {/* Active Guesser / Steal Spokesperson & Timer */}
        <div className="flex items-center gap-4 bg-slate-900/90 border border-slate-700 px-5 py-3 rounded-2xl shadow-lg w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-white shadow ${
                isStealPhase ? 'bg-amber-500 animate-pulse' : 'bg-indigo-600'
              }`}
            >
              {isStealPhase ? (
                <Zap className="w-5 h-5 text-yellow-200" />
              ) : (
                snapshot.activePlayer?.battingOrder || 1
              )}
            </div>
            <div>
              <div className="text-xs uppercase font-semibold text-slate-400">
                {isStealPhase
                  ? t.mainGame.stealPhaseTitle
                  : t.mainGame.answeringTurn.replace(
                      '{name}',
                      snapshot.activePlayer?.nickname || 'Teammate'
                    )}
              </div>
              <div className="text-lg font-black text-white" data-testid="active-player-display">
                {isStealPhase
                  ? `${spokesperson?.nickname || 'Spokesperson'} (${opposingTeamName})`
                  : snapshot.activePlayer?.nickname || 'Waiting for player...'}
              </div>
            </div>
          </div>

          {/* 15s Timer Ring (Active in TEAM_GUESSING & STEAL_PHASE) */}
          {(snapshot.phase === 'TEAM_GUESSING' || snapshot.phase === 'STEAL_PHASE') && (
            <div
              data-testid="timer-display"
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

      {/* Judge Override Confirmation Toast (US-21 Scenario 2) */}
      {overrideToast && (
        <div
          data-testid="host-override-toast"
          role="status"
          className="relative z-20 w-full max-w-5xl mx-auto mb-4 px-5 py-3 rounded-2xl bg-emerald-950/90 border border-emerald-400/60 text-emerald-200 flex items-center justify-between gap-3 shadow-xl"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-sm font-extrabold tracking-wide">
              {t.admin.overrideConfirmedToast
                .replace('{rank}', String(overrideToast.rankOrder))
                .replace('{answer}', overrideToast.answerText)
                .replace('{points}', String(overrideToast.pointsAwarded))}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOverrideToast(null)}
            className="p-1 rounded-lg hover:bg-emerald-900/60 text-emerald-300 transition-colors cursor-pointer"
            aria-label={t.admin.dismiss}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Discrete Judge Manual Override Panel (US-21 Scenario 2) */}
      {showOverrideControls && (
        <section
          data-testid="host-manual-override-panel"
          className="relative z-20 w-full max-w-5xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] mx-auto mb-4 p-4 rounded-2xl bg-indigo-950/90 border-2 border-indigo-400/70 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-300">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-indigo-200">
                {t.admin.manualOverride}
              </h3>
              <p className="text-xs text-slate-300">{t.admin.judgeOverrideSubtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <span className="text-xs font-bold text-slate-300">{t.admin.creditTeamLabel}</span>
            <button
              type="button"
              data-testid="host-override-team-1"
              onClick={() => setCreditTeam('TEAM_1')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase border transition-all cursor-pointer ${
                creditTeam === 'TEAM_1'
                  ? 'bg-blue-600 text-white border-blue-300 shadow'
                  : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              {t.mainGame.team1}
            </button>
            <button
              type="button"
              data-testid="host-override-team-2"
              onClick={() => setCreditTeam('TEAM_2')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase border transition-all cursor-pointer ${
                creditTeam === 'TEAM_2'
                  ? 'bg-emerald-600 text-white border-emerald-300 shadow'
                  : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              {t.mainGame.team2}
            </button>
            {onCloseManualOverride && (
              <button
                type="button"
                data-testid="host-manual-override-close"
                onClick={onCloseManualOverride}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 transition-colors cursor-pointer"
                title={t.admin.closeOverride}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </section>
      )}

      {/* Answer Board Card Grid (4 to 8 Flip Cards) with Steal Match & Board Clearance Highlighting */}
      <main className="relative z-10 w-full max-w-5xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] mx-auto flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 2xl:gap-5 p-4 md:p-6 2xl:p-8 bg-slate-900/80 border-2 border-blue-900/60 rounded-3xl shadow-2xl backdrop-blur-sm">
          {Array.from({ length: totalSlots }).map((_, idx) => {
            const rankOrder = idx + 1;
            const revealedItem = revealedMap.get(rankOrder);
            const isRevealed = Boolean(revealedItem);
            const isRemaining = Boolean(revealedItem?.isRemainingReveal);
            const isStealMatch = Boolean(revealedItem?.isStealMatch);
            const candidateOption = overrideOptionMap.get(rankOrder);

            return (
              <div
                key={rankOrder}
                data-testid={`team-board-card-${rankOrder}`}
                className={`relative min-h-[70px] 2xl:min-h-[88px] 3xl:min-h-[104px] rounded-2xl border-2 flex items-center px-5 2xl:px-7 transition-all duration-500 shadow-md ${
                  isRevealed
                    ? isStealMatch
                      ? 'bg-gradient-to-r from-emerald-700 via-teal-800 to-emerald-900 border-yellow-300 shadow-[0_4px_25px_rgba(16,185,129,0.5)] animate-pulse'
                      : isRemaining
                      ? 'bg-gradient-to-r from-slate-800 to-indigo-950/80 border-amber-500/60 shadow-[0_4px_15px_rgba(245,158,11,0.2)]'
                      : 'bg-gradient-to-r from-blue-700 to-indigo-800 border-yellow-400/70 shadow-[0_4px_20px_rgba(59,130,246,0.3)]'
                    : showOverrideControls
                    ? 'bg-gradient-to-r from-indigo-950/90 to-slate-900 border-indigo-400/70 shadow-[0_0_20px_rgba(99,102,241,0.25)]'
                    : 'bg-gradient-to-r from-slate-900 to-slate-800 border-slate-700/80 hover:border-slate-600'
                }`}
              >
                {isRevealed && revealedItem ? (
                  <div className="w-full flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 rounded-full font-black flex items-center justify-center text-sm shadow ${
                          isStealMatch
                            ? 'bg-yellow-300 text-slate-950 animate-bounce'
                            : isRemaining
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-yellow-400 text-slate-950'
                        }`}
                      >
                        {rankOrder}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-extrabold text-white text-base md:text-lg tracking-wide uppercase">
                          {revealedItem.answerText}
                        </span>
                        {isRemaining && (
                          <span className="text-[10px] font-bold text-amber-300/90 uppercase tracking-wider">
                            {t.mainGame.remainingAnswersTitle}
                          </span>
                        )}
                        {isStealMatch && (
                          <span className="text-[10px] font-black text-emerald-300 uppercase tracking-wider">
                            ⚡ Stolen Answer!
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`font-black px-3.5 py-1 rounded-lg text-lg shadow-inner ${
                        isStealMatch
                          ? 'bg-yellow-300 text-slate-950 ring-2 ring-yellow-400'
                          : isRemaining
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-yellow-400 text-slate-950'
                      }`}
                    >
                      {revealedItem.points}
                    </span>
                  </div>
                ) : showOverrideControls && onOverrideAnswer ? (
                  <div className="w-full flex items-center justify-between gap-3 py-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-full bg-indigo-500/30 border border-indigo-400 text-indigo-200 font-black flex items-center justify-center text-sm shrink-0">
                        {rankOrder}
                      </span>
                      <div
                        data-testid={`host-override-slot-label-${rankOrder}`}
                        className="flex flex-col min-w-0"
                      >
                        <span className="font-extrabold text-indigo-100 text-sm md:text-base truncate">
                          {candidateOption ? `"${candidateOption.answerText}"` : `Slot #${rankOrder}`}
                        </span>
                        {candidateOption && (
                          <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                            {candidateOption.points} PTS
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid={`host-override-slot-btn-${rankOrder}`}
                      onClick={() =>
                        onOverrideAnswer(rankOrder, candidateOption?.points, creditTeam)
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-300 hover:to-green-400 text-slate-950 font-black text-xs uppercase tracking-wide shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      <Gavel className="w-3.5 h-3.5" />
                      <span>{t.admin.overrideAccept}</span>
                    </button>
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
      {(snapshot.phase === 'ROUND_CLEARED' || Boolean(roundCleared)) && (
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
              {onNextRound && !matchOver && !suddenDeathInitiated && (
                <button
                  type="button"
                  data-testid="next-round-btn"
                  onClick={onNextRound}
                  className="mt-6 inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-black text-lg shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>{t.mainGame.nextRoundBtn}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scenario 4: Steal Phase Handoff Banner with Designated Spokesperson & Countdown */}
      {snapshot.phase === 'STEAL_PHASE' && (
        <div
          data-testid="steal-phase-banner"
          className="relative z-20 w-full max-w-5xl mx-auto mt-4 p-5 rounded-2xl bg-gradient-to-r from-red-950 via-purple-950 to-red-950 border-2 border-red-500 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4 animate-pulse"
        >
          <div className="flex items-center gap-4">
            <AlertTriangle className="w-10 h-10 text-yellow-400 animate-bounce shrink-0" />
            <div>
              <div className="text-xs uppercase font-black tracking-widest text-red-400">
                {t.mainGame.threeStrikes} — {t.mainGame.stealPhaseTitle}
              </div>
              <div className="text-xl md:text-2xl font-black text-white">
                {t.mainGame.chanceToSteal.replace('{team}', opposingTeamName)}
              </div>
              <div className="text-sm font-semibold text-yellow-300 mt-0.5">
                {t.mainGame.teammateConsultPrompt.replace(
                  '{spokesperson}',
                  spokesperson?.nickname || 'Spokesperson'
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-right shrink-0">
            <div>
              <span className="text-xs uppercase font-bold text-yellow-300 block">{t.mainGame.bankAtStake}</span>
              <span className="text-3xl font-black text-yellow-400">{snapshot.roundBank} PTS</span>
            </div>
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600/30 border border-red-500 text-red-300 font-black text-base shadow">
              <Clock className="w-4 h-4 text-red-400" />
              <span>{currentSeconds}s</span>
            </div>
          </div>
        </div>
      )}

      {/* Scenarios 1 & 2: Steal Resolution Banner (Celebratory Victory or Point Retention) */}
      {(stealResolved || (snapshot.phase === 'RESOLVED' && snapshot.winningTeam)) && (
        <div
          data-testid="steal-resolved-banner"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
        >
          <div
            className={`max-w-2xl w-full p-1 rounded-3xl shadow-2xl ${
              isStealSuccess
                ? 'bg-gradient-to-b from-emerald-400 via-teal-500 to-emerald-600 shadow-[0_0_60px_rgba(16,185,129,0.5)]'
                : 'bg-gradient-to-b from-amber-500 via-yellow-600 to-amber-700 shadow-[0_0_60px_rgba(245,158,11,0.5)]'
            }`}
          >
            <div className="bg-slate-950 rounded-[22px] p-8 text-center flex flex-col items-center">
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 border-2 animate-bounce ${
                  isStealSuccess
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
                    : 'bg-amber-500/20 border-amber-400 text-amber-400'
                }`}
              >
                {isStealSuccess ? (
                  <Trophy className="w-12 h-12" />
                ) : (
                  <ShieldCheck className="w-12 h-12" />
                )}
              </div>
              <h2
                className={`text-3xl md:text-5xl font-black uppercase tracking-tight mb-2 ${
                  isStealSuccess ? 'text-emerald-300' : 'text-yellow-300'
                }`}
              >
                {isStealSuccess
                  ? t.mainGame.stealPhaseTitle
                  : t.mainGame.strikeTitle}
              </h2>
              <p className="text-xl md:text-2xl text-white font-extrabold mb-2" data-testid="steal-announcement-text">
                {isStealSuccess
                  ? t.mainGame.stealSuccessAnnouncement
                      .replace('{team}', opposingTeamName)
                      .replace('{points}', String(resolvedPoints))
                  : t.mainGame.stealFailedAnnouncement
                      .replace('{team}', controllingTeamName)
                      .replace('{points}', String(resolvedPoints))}
              </p>
              <p className="text-base text-slate-300 font-semibold mb-6">
                {t.mainGame.roundWinnerBanner.replace('{team}', winningTeamName)}
              </p>
              <div
                className={`px-8 py-3 rounded-full font-black text-2xl shadow-xl ${
                  isStealSuccess
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-yellow-400 text-slate-950'
                }`}
              >
                +{resolvedPoints} POINTS
              </div>
              {onNextRound && !matchOver && !suddenDeathInitiated && (
                <button
                  type="button"
                  data-testid="next-round-btn"
                  onClick={onNextRound}
                  className="mt-6 inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-black text-lg shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>{t.mainGame.nextRoundBtn}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scenario 6: Sudden Death Tie-Breaker Resolution Banner */}
      {(suddenDeathInitiated || scoreboardState?.phase === 'SUDDEN_DEATH') && !matchOver && (
        <div
          data-testid="sudden-death-banner"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in select-none"
        >
          <div className="max-w-xl w-full p-1 rounded-3xl bg-gradient-to-b from-red-600 via-orange-600 to-amber-600 shadow-[0_0_60px_rgba(239,68,68,0.6)]">
            <div className="bg-slate-950 rounded-[22px] p-8 text-center flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center mb-4 animate-pulse">
                <Flame className="w-12 h-12 text-red-500" />
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-red-400 uppercase tracking-tight mb-2">
                {t.mainGame.suddenDeathTitle}
              </h2>
              <p className="text-base sm:text-lg text-slate-200 font-semibold mb-6">
                {t.mainGame.suddenDeathSubtitle}
              </p>
              <div className="flex items-center justify-center gap-4 text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-6">
                <span className="px-4 py-1.5 rounded-lg bg-blue-950/80 border border-blue-600">
                  {t.mainGame.team1}: <strong>{scoreboardState?.team1GrandTotal ?? 0} PTS</strong>
                </span>
                <span className="text-yellow-400 font-black">VS</span>
                <span className="px-4 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-600">
                  {t.mainGame.team2}: <strong>{scoreboardState?.team2GrandTotal ?? 0} PTS</strong>
                </span>
              </div>
              {onNextRound && (
                <button
                  type="button"
                  data-testid="start-sudden-death-btn"
                  onClick={onNextRound}
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-gradient-to-r from-red-500 to-amber-600 hover:from-red-400 hover:to-amber-500 text-white font-black text-lg shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>{t.mainGame.nextRoundBtn}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scenario 4 & 5: Match Over Final Victory Modal */}
      {(matchOver || (scoreboardState?.phase === 'MATCH_OVER' && scoreboardState.matchWinner && scoreboardState.matchWinner !== 'TIE')) && (
        <MainGameVictoryModal
          matchOver={
            matchOver || {
              roomCode,
              winningTeam: scoreboardState!.matchWinner as 'TEAM_1' | 'TEAM_2',
              team1GrandTotal: scoreboardState!.team1GrandTotal,
              team2GrandTotal: scoreboardState!.team2GrandTotal,
              totalRounds: scoreboardState!.totalRounds,
              isSuddenDeath: scoreboardState!.isSuddenDeath,
              message: `🏆 TEAM ${scoreboardState!.matchWinner === 'TEAM_1' ? '1' : '2'} WINS THE GAME! (${scoreboardState!.team1GrandTotal} vs ${scoreboardState!.team2GrandTotal})`,
            }
          }
          onReplay={onReplay}
          onLeave={onLeave}
          isHost={true}
        />
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
