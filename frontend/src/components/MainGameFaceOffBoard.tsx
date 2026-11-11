import { MainGameScoreboardHeader } from './MainGameScoreboardHeader';
import React, { useState, useEffect, useRef } from 'react';
import {
  ScoreboardUpdatePayload,
  FaceOffSessionState,
  FaceOffPhase,
  TimerTickPayload,
  BuzzerLockedPayload,
  FaceOffTimeoutPayload,
  PromptPassPlayPayload,
  RoundControlAssignedPayload,
  OpponentTurnPromptPayload,
} from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { useFullscreen } from '../hooks/useFullscreen';
import {
  speakQuestion,
  cancelSpeech,
  speakPlayOrPassDecision,
  speakPlayerAnswerSurveySaid,
  isTtsMuted,
  setTtsMuted,
} from '../utils/tts';
import {
  playBuzzerHit,
  playCorrectDing,
  playPointsChime,
} from '../utils/soundEffects';
import {
  Tv,
  Zap,
  Clock,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Volume2,
  VolumeX,
  AlertTriangle,
  Award,
  Sparkles,
  Maximize2,
  Minimize2,
  Play,
  Pause,
} from 'lucide-react';

export interface MainGameFaceOffBoardProps {
  snapshot: FaceOffSessionState;
  timerTick?: TimerTickPayload | null;
  initialReadyCountdown?: number | null;
  isPaused?: boolean;
  pausedRemainingSeconds?: number;
  buzzerLocked?: BuzzerLockedPayload | null;
  timeoutResult?: FaceOffTimeoutPayload | null;
  promptPassPlay?: PromptPassPlayPayload | null;
  roundControlAssigned?: RoundControlAssignedPayload | null;
  opponentTurnPrompt?: OpponentTurnPromptPayload | null;
  scoreboardState?: ScoreboardUpdatePayload | null;
  language?: string;
  roomName: string;
  roomCode: string;
  onLeave?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onTogglePause?: () => void;
}

// 8-slot vertical counting layout on host TV board:
// Row 1: 1, 5 | Row 2: 2, 6 | Row 3: 3, 7 | Row 4: 4, 8
const HOST_SLOT_RANKS = [1, 5, 2, 6, 3, 7, 4, 8];

export const MainGameFaceOffBoard: React.FC<MainGameFaceOffBoardProps> = ({
  snapshot,
  timerTick,
  initialReadyCountdown,
  isPaused = false,
  pausedRemainingSeconds,
  buzzerLocked,
  timeoutResult,
  promptPassPlay,
  roundControlAssigned,
  opponentTurnPrompt: _opponentTurnPrompt,
  scoreboardState,
  language = 'EN',
  roomName,
  roomCode,
  onLeave,
  isFullscreen: propsIsFullscreen,
  onToggleFullscreen,
  onTogglePause,
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

  // 5-second countdown timer when both face-off contenders are ready
  const isBothReady = Boolean(snapshot.team1Contender?.isReady && snapshot.team2Contender?.isReady);
  const [readyCountdown, setReadyCountdown] = useState<number | null>(() => {
    if (initialReadyCountdown !== undefined) return initialReadyCountdown;
    if (snapshot.phase === 'AWAITING_READY' && isBothReady) return 5;
    return null;
  });

  // Track whether countdown has completed before revealing board and speaking question
  const [hasCompletedReadyCountdown, setHasCompletedReadyCountdown] = useState<boolean>(() => {
    if (initialReadyCountdown !== undefined && initialReadyCountdown !== null) {
      return initialReadyCountdown <= 0;
    }
    // In direct test mounts where phase is already BUZZER_ACTIVE or later without ready countdown:
    if (snapshot.phase !== 'AWAITING_READY') return true;
    return false;
  });

  const previousBothReadyRef = useRef<boolean>(
    initialReadyCountdown !== undefined ? false : (snapshot.phase === 'AWAITING_READY' ? false : isBothReady)
  );
  const previousPhaseRef = useRef<FaceOffPhase>(snapshot.phase);

  useEffect(() => {
    if (initialReadyCountdown !== undefined) {
      setReadyCountdown(initialReadyCountdown);
      if (initialReadyCountdown !== null && initialReadyCountdown > 0) {
        setHasCompletedReadyCountdown(false);
      } else if (initialReadyCountdown !== null && initialReadyCountdown <= 0) {
        setHasCompletedReadyCountdown(true);
      }
    }
  }, [initialReadyCountdown]);

  // Reset countdown completed state when entering AWAITING_READY or loading a new question
  useEffect(() => {
    if (snapshot.phase === 'AWAITING_READY') {
      setHasCompletedReadyCountdown(false);
      lastSpokenQuestionId.current = null;
      cancelSpeech();
    }
  }, [snapshot.phase, snapshot.question?.id]);

  useEffect(() => {
    const wasNotBothReady = !previousBothReadyRef.current;
    const wasAwaitingReady = previousPhaseRef.current === 'AWAITING_READY';
    previousBothReadyRef.current = isBothReady;
    previousPhaseRef.current = snapshot.phase;

    if (isBothReady && (wasNotBothReady || (wasAwaitingReady && snapshot.phase === 'BUZZER_ACTIVE'))) {
      cancelSpeech();
      setHasCompletedReadyCountdown(false);
      setReadyCountdown(5);
    }
  }, [isBothReady, snapshot.phase, snapshot.team1Contender?.isReady, snapshot.team2Contender?.isReady]);

  useEffect(() => {
    if (readyCountdown === null) return;
    if (readyCountdown <= 0) {
      setReadyCountdown(null);
      setHasCompletedReadyCountdown(true);
      return;
    }
    if (isPaused) return;

    const timer = setTimeout(() => {
      setReadyCountdown((prev) => {
        if (prev !== null && prev <= 1) {
          setHasCompletedReadyCountdown(true);
          return null;
        }
        return prev !== null ? prev - 1 : null;
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [readyCountdown, isPaused]);

  // Track the last question read by TTS to avoid re-speaking on every tick
  const lastSpokenQuestionId = useRef<string | null>(null);
  // Track whether buzzer SFX / speech cancellation has fired for current buzzer lockout
  const lastHandledLockoutWinnerId = useRef<string | null>(null);

  // Derive remaining seconds for authoritative countdown
  const currentSeconds =
    isPaused && typeof pausedRemainingSeconds === 'number' && pausedRemainingSeconds > 0
      ? pausedRemainingSeconds
      : timerTick && timerTick.secondsRemaining !== undefined
        ? timerTick.secondsRemaining
        : snapshot.remainingSeconds;

  const isBuzzerLocked = snapshot.buzzerLocked || Boolean(buzzerLocked);
  const activeWinnerId =
    snapshot.winnerPlayerId ||
    promptPassPlay?.winnerPlayerId ||
    buzzerLocked?.winnerPlayerId ||
    snapshot.buzzedPlayerId ||
    snapshot.activeRespondentId;
  const activeWinnerName =
    snapshot.winnerNickname ||
    promptPassPlay?.winnerNickname ||
    buzzerLocked?.winnerNickname ||
    snapshot.buzzedPlayerNickname ||
    t.mainGame.contender;

  const controllingTeam =
    roundControlAssigned?.controllingTeam || snapshot.controllingTeam;
  const controllingTeamName =
    roundControlAssigned?.controllingTeamName ||
    (controllingTeam === 'TEAM_1' ? t.mainGame.team1 : t.mainGame.team2);

  // Scenario 1: Trigger TTS reading of question when buzzers activate (strictly after 5s countdown completes)
  useEffect(() => {
    if (
      snapshot.phase === 'BUZZER_ACTIVE' &&
      snapshot.question?.id &&
      readyCountdown === null &&
      hasCompletedReadyCountdown
    ) {
      if (lastSpokenQuestionId.current !== snapshot.question.id) {
        lastSpokenQuestionId.current = snapshot.question.id;
        if (audioEnabled) {
          const count = snapshot.question.answers?.length || 0;
          const intro = count > 0
            ? `${t.mainGame.topAnswersOnBoard.replace('{count}', String(count))} `
            : '';
          speakQuestion(`${intro}${snapshot.question.questionText}`, language);
        }
      }
    }
  }, [
    snapshot.phase,
    snapshot.question?.id,
    snapshot.question?.questionText,
    snapshot.question?.answers?.length,
    language,
    audioEnabled,
    t.mainGame.topAnswersOnBoard,
    readyCountdown,
    hasCompletedReadyCountdown,
  ]);

  // Scenario 2: Atomic Buzzer Lockout cuts off ongoing TTS and sounds sharp buzzer cue
  useEffect(() => {
    if (isBuzzerLocked && activeWinnerId) {
      if (lastHandledLockoutWinnerId.current !== activeWinnerId) {
        lastHandledLockoutWinnerId.current = activeWinnerId;
        // Immediate speech cancellation to cut off host question reading
        cancelSpeech();
        // Synthesize classic game show podium buzzer tone
        playBuzzerHit();
      }
    } else if (!isBuzzerLocked) {
      lastHandledLockoutWinnerId.current = null;
    }
  }, [isBuzzerLocked, activeWinnerId]);

  // Scenario 1, 2, 3: Ding sound cue when card flips open on the board
  const previousRevealedCount = useRef<number>(0);
  useEffect(() => {
    const currentCount = snapshot.revealedAnswers?.length || 0;
    if (currentCount > previousRevealedCount.current) {
      playCorrectDing();
    }
    previousRevealedCount.current = currentCount;
  }, [snapshot.revealedAnswers]);

  // Scenario 6 & 7: Points Chime & TTS speech when round control is assigned
  const lastHandledControlAssignment = useRef<string | null>(null);
  useEffect(() => {
    const isControlAssigned =
      snapshot.phase === 'ROUND_CONTROL_ASSIGNED' || Boolean(roundControlAssigned);
    const decision = snapshot.passOrPlayDecision || roundControlAssigned?.decision;
    const team = roundControlAssigned?.controllingTeamName || controllingTeamName;

    if (isControlAssigned && decision && team) {
      const key = `${team}-${decision}`;
      if (lastHandledControlAssignment.current !== key) {
        lastHandledControlAssignment.current = key;
        playPointsChime();
        speakPlayOrPassDecision(team, decision, language);
      }
    }
  }, [
    snapshot.phase,
    snapshot.passOrPlayDecision,
    roundControlAssigned,
    controllingTeamName,
    language,
  ]);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  const contender1 = snapshot.team1Contender;
  const contender2 = snapshot.team2Contender;

  const [revealedRanks, setRevealedRanks] = useState<number[]>(() =>
    snapshot.revealedAnswers?.map((r) => r.rankOrder) || []
  );
  const [surveySaidAnnouncement, setSurveySaidAnnouncement] = useState<{
    player: string;
    answer: string;
  } | null>(null);

  const handledGuessesRef = useRef<Set<string>>(new Set());

  // Re-sync revealedRanks on initial load or if snapshot answers already revealed
  useEffect(() => {
    const answers = snapshot.revealedAnswers;
    if (answers && answers.length > 0) {
      if (!surveySaidAnnouncement) {
        setRevealedRanks((prev) => {
          const incoming = answers.map((r) => r.rankOrder);
          const hasAll = incoming.every((r) => prev.includes(r));
          return hasAll ? prev : Array.from(new Set([...prev, ...incoming]));
        });
      }
    }
  }, [snapshot.revealedAnswers, surveySaidAnnouncement]);

  // US-28: "{Player} said {Answer}, survey said..." before revealing answer
  useEffect(() => {
    const checkContenderGuess = (
      guess: typeof snapshot.firstGuessResult,
      defaultContender?: typeof contender1
    ) => {
      if (!guess) return;
      const key = `${guess.playerId}-${guess.rawAnswer}`;
      if (handledGuessesRef.current.has(key)) return;
      handledGuessesRef.current.add(key);

      const playerName = guess.playerNickname || defaultContender?.nickname || 'Contender';
      const playerAnswer = guess.rawAnswer;

      setSurveySaidAnnouncement({ player: playerName, answer: playerAnswer });

      const onReveal = () => {
        setSurveySaidAnnouncement(null);
        if (guess.rankOrder) {
          setRevealedRanks((prev) =>
            prev.includes(guess.rankOrder!) ? prev : [...prev, guess.rankOrder!]
          );
          playCorrectDing();
        } else {
          playBuzzerHit();
        }
      };

      if (audioEnabled) {
        speakPlayerAnswerSurveySaid(playerName, playerAnswer, language, onReveal);
      } else {
        const timer = setTimeout(onReveal, 600);
        return () => clearTimeout(timer);
      }
    };

    checkContenderGuess(snapshot.firstGuessResult, contender1);
    checkContenderGuess(snapshot.secondGuessResult, contender2);
  }, [
    snapshot.firstGuessResult,
    snapshot.secondGuessResult,
    contender1,
    contender2,
    audioEnabled,
    language,
  ]);

  const isC1Winner = activeWinnerId === contender1?.id;
  const isC2Winner = activeWinnerId === contender2?.id;

  const isC1LockedOut = isBuzzerLocked && !isC1Winner;
  const isC2LockedOut = isBuzzerLocked && !isC2Winner;

  const showDeadlockBoard =
    snapshot.phase === 'DEADLOCK_RESET' || timeoutResult?.type === 'DEADLOCK_RESET';

  const answers = snapshot.question?.answers || [];
  const answerByRank = new Map<number, (typeof answers)[0]>();
  answers.forEach((a) => answerByRank.set(a.rankOrder, a));
  snapshot.revealedAnswers?.forEach((a) => {
    if (!answerByRank.has(a.rankOrder)) {
      answerByRank.set(a.rankOrder, {
        id: a.id,
        answerText: a.answerText,
        points: a.points,
        rankOrder: a.rankOrder,
      });
    }
  });
  const totalAnswers = Math.max(
    answers.length,
    answerByRank.size
  );
  const revealedCount =
    revealedRanks.length || (showDeadlockBoard ? answers.length : 0);

  const renderDuelPodiums = () => (
    <div className="w-full grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
      {/* Contender 1 Podium (Team 1) */}
      <div
        data-testid="face-off-podium-team1"
        className={`relative flex flex-col items-center p-2.5 sm:p-3 2xl:p-4 rounded-xl sm:rounded-2xl backdrop-blur-xl border-2 transition-all duration-300 ${isC1Winner
          ? 'bg-blue-900/40 border-feud-gold shadow-[0_0_30px_rgba(234,179,8,0.35)] scale-105'
          : isC1LockedOut
            ? 'bg-slate-900/60 border-red-500/60 opacity-80'
            : 'bg-slate-900/80 border-blue-500/40'
          }`}
      >
        {/* Winner Banner */}
        {isC1Winner && (
          <div
            data-testid="c1-winner-badge"
            className="absolute -top-3 px-3 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-feud-gold text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-lg flex items-center gap-1 animate-pulse"
          >
            <Award className="w-3.5 h-3.5" />
            <span>{t.mainGame.buzzerWinner.replace('{name}', contender1?.nickname || '')}</span>
          </div>
        )}

        {/* Locked Out Overlay */}
        {isC1LockedOut && (
          <div
            data-testid="c1-lockout-badge"
            className="absolute -top-3 px-3 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shadow-lg flex items-center gap-1"
          >
            <Lock className="w-3 h-3" />
            <span>{t.mainGame.buzzerLocked}</span>
          </div>
        )}

        <span className="text-[10px] font-extrabold uppercase text-blue-400 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 mb-2">
          {t.mainGame.team1} &bull; {t.mainGame.battingOrder.replace('{order}', String(contender1?.battingOrder || 1))}
        </span>

        <h3
          data-testid="c1-nickname"
          className="text-lg sm:text-2xl font-black text-white tracking-wide"
        >
          {contender1?.nickname}
        </h3>

        {/* Readiness State */}
        <div className="mt-2.5 flex items-center gap-2">
          {contender1?.isReady ? (
            <span
              data-testid="c1-ready-badge"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-green-400 px-2.5 py-0.5 rounded-full bg-green-500/15 border border-green-500/30"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{t.mainGame.imReady}</span>
            </span>
          ) : (
            <span
              data-testid="c1-waiting-badge"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 animate-pulse"
            >
              <span>{t.lobby.statusWaiting}</span>
            </span>
          )}
        </div>
      </div>

      {/* Center Buzzer & Countdown Arbiter */}
      <div
        data-testid="face-off-center-arbiter"
        className="flex flex-col items-center justify-center p-2 min-w-[140px]"
      >
        {readyCountdown !== null ? (
          /* 5-Second Ready Countdown Ring */
          <div
            data-testid="face-off-ready-countdown"
            className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-full bg-slate-900/90 border-3 border-feud-gold shadow-[0_0_30px_rgba(234,179,8,0.5)] animate-pulse"
          >
            <Clock className="w-6 h-6 text-feud-gold mb-0.5 animate-spin" />
            <span
              data-testid="face-off-ready-seconds"
              className="text-2xl sm:text-3xl font-black text-feud-gold tracking-tight"
            >
              {readyCountdown}s
            </span>
            <span className="text-[9px] font-bold uppercase text-amber-300 tracking-wider">
              {t.mainGame.startsIn}
            </span>
          </div>
        ) : isBuzzerLocked ? (
          /* 15-Second Active Countdown Ring */
          <div
            data-testid="face-off-timer-ring"
            className="flex flex-col items-center justify-center p-3.5 sm:p-4 rounded-full bg-slate-900/90 border-3 border-feud-gold shadow-[0_0_25px_rgba(234,179,8,0.4)] animate-pulse"
          >
            <Clock className="w-6 h-6 text-feud-gold mb-0.5" />
            <span
              data-testid="face-off-seconds"
              className={`text-2xl sm:text-3xl font-black tracking-tight ${currentSeconds <= 5 ? 'text-red-400 animate-ping' : 'text-feud-gold'
                }`}
            >
              {currentSeconds}s
            </span>
            <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
              Timer
            </span>
          </div>
        ) : snapshot.phase === 'BUZZER_ACTIVE' ? (
          /* Armed Buzzers Active State */
          <div
            data-testid="buzzers-armed-cue"
            className="flex flex-col items-center justify-center p-3.5 sm:p-4 rounded-full bg-yellow-500/10 border-2 border-feud-gold/70 text-center animate-pulse"
          >
            <Zap className="w-7 h-7 text-feud-gold animate-bounce mb-0.5" />
            <span className="text-xs font-black text-feud-gold uppercase tracking-wider">
              {t.mainGame.buzzerBtn}
            </span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Ready to Buzz
            </span>
          </div>
        ) : (
          /* Waiting for Readiness */
          <div className="flex flex-col items-center text-center p-2">
            <span className="text-xl sm:text-2xl font-black text-slate-600 tracking-wider">VS</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              {t.mainGame.faceOffTitle}
            </span>
          </div>
        )}
      </div>

      {/* Contender 2 Podium (Team 2) */}
      <div
        data-testid="face-off-podium-team2"
        className={`relative flex flex-col items-center p-2.5 sm:p-3 2xl:p-4 rounded-xl sm:rounded-2xl backdrop-blur-xl border-2 transition-all duration-300 ${isC2Winner
          ? 'bg-blue-900/40 border-feud-gold shadow-[0_0_30px_rgba(234,179,8,0.35)] scale-105'
          : isC2LockedOut
            ? 'bg-slate-900/60 border-red-500/60 opacity-80'
            : 'bg-slate-900/80 border-purple-500/40'
          }`}
      >
        {/* Winner Banner */}
        {isC2Winner && (
          <div
            data-testid="c2-winner-badge"
            className="absolute -top-3 px-3 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-feud-gold text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-lg flex items-center gap-1 animate-pulse"
          >
            <Award className="w-3.5 h-3.5" />
            <span>{t.mainGame.buzzerWinner.replace('{name}', contender2?.nickname || '')}</span>
          </div>
        )}

        {/* Locked Out Overlay */}
        {isC2LockedOut && (
          <div
            data-testid="c2-lockout-badge"
            className="absolute -top-3 px-3 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shadow-lg flex items-center gap-1"
          >
            <Lock className="w-3 h-3" />
            <span>{t.mainGame.buzzerLocked}</span>
          </div>
        )}

        <span className="text-[10px] font-extrabold uppercase text-purple-400 px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 mb-2">
          {t.mainGame.team2} &bull; {t.mainGame.battingOrder.replace('{order}', String(contender2?.battingOrder || 1))}
        </span>

        <h3
          data-testid="c2-nickname"
          className="text-lg sm:text-2xl font-black text-white tracking-wide"
        >
          {contender2?.nickname}
        </h3>

        {/* Readiness State */}
        <div className="mt-2.5 flex items-center gap-2">
          {contender2?.isReady ? (
            <span
              data-testid="c2-ready-badge"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-green-400 px-2.5 py-0.5 rounded-full bg-green-500/15 border border-green-500/30"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{t.mainGame.imReady}</span>
            </span>
          ) : (
            <span
              data-testid="c2-waiting-badge"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 animate-pulse"
            >
              <span>{t.lobby.statusWaiting}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      data-testid="main-game-face-off-board"
      className="w-full h-full max-h-full max-w-6xl xl:max-w-7xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] flex flex-col justify-between items-center overflow-hidden animate-fadeIn"
    >
      {/* 1. Header Bar with Controls on the Top */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-xl sm:rounded-2xl p-2.5 sm:p-3 2xl:p-4 shadow-xl shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="p-1.5 sm:p-2 rounded-xl bg-feud-gold/20 border border-feud-gold/40 text-feud-gold">
              <Tv className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-feud-gold px-2.5 py-0.5 rounded-full bg-feud-gold/10 border border-feud-gold/20">
                  {t.mainGame.faceOffTitle}
                </span>
                <span
                  data-testid="face-off-round-badge"
                  className="text-xs font-extrabold uppercase tracking-wider text-yellow-300 px-2.5 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/30"
                >
                  {t.mainGame.roundNumber.replace('{round}', String(snapshot.roundNumber || 1))}
                </span>
                <span
                  data-testid="face-off-room-code"
                  className="text-xs font-extrabold uppercase tracking-wider text-slate-300 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700"
                >
                  {roomCode}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-white mt-0.5">
                {roomName}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {onTogglePause && (
              <button
                type="button"
                onClick={onTogglePause}
                data-testid="host-pause-resume-btn"
                aria-label={isPaused ? t.admin.resumeTimer : t.admin.pauseTimer}
                title={isPaused ? `${t.admin.resumeTimer} (${t.admin.spacebarShortcutHint})` : `${t.admin.pauseTimer} (${t.admin.spacebarShortcutHint})`}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${isPaused
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-300 hover:text-white'
                  }`}
              >
                {isPaused ? (
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 fill-current" />
                ) : (
                  <Pause className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 fill-current" />
                )}
                <span className="sr-only">{isPaused ? t.admin.resumeTimer : t.admin.pauseTimer}</span>
                <span className="sr-only">{t.admin.spacebarShortcutHint}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              data-testid="host-fullscreen-toggle"
              aria-pressed={isFullscreen}
              aria-label={isFullscreen ? t.host.exitFullscreen : t.host.enterFullscreen}
              title={`${isFullscreen ? t.host.exitFullscreen : t.host.enterFullscreen} (${t.host.fullscreenHint})`}
              className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5 text-feud-gold" />
              ) : (
                <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5 text-feud-gold" />
              )}
              <span className="sr-only">{isFullscreen ? t.host.exitFullscreen : t.host.enterFullscreen}</span>
              <span className="sr-only">{t.host.fullscreenHint}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleAudio}
              data-testid="host-audio-toggle"
              title={audioEnabled ? 'Mute Sounds & TTS' : 'Unmute Sounds & TTS'}
              className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              {audioEnabled ? (
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-feud-gold" />
              ) : (
                <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
              )}
            </button>

            {onLeave && (
              <button
                type="button"
                onClick={onLeave}
                data-testid="face-off-leave-btn"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t.lobby.leaveLobby}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Team Scores directly underneath */}
      <div className="w-full shrink-0">
        <MainGameScoreboardHeader
          team1GrandTotal={scoreboardState?.team1GrandTotal ?? 0}
          team2GrandTotal={scoreboardState?.team2GrandTotal ?? 0}
          activeRoundBank={scoreboardState?.activeRoundBank ?? 0}
          currentRoundNumber={scoreboardState?.currentRoundNumber ?? snapshot.roundNumber ?? 1}
          totalRounds={scoreboardState?.totalRounds ?? 3}
          isSuddenDeath={scoreboardState?.isSuddenDeath ?? false}
        />
      </div>

      {/* Timeout / Hand-off / Deadlock Alerts */}
      {timeoutResult && (
        <div
          data-testid="face-off-timeout-banner"
          className={`w-full p-4 rounded-2xl text-center font-bold text-sm sm:text-base border transition-all animate-bounce ${timeoutResult.type === 'DEADLOCK_RESET'
            ? 'bg-red-950/80 border-red-500/80 text-red-200'
            : 'bg-amber-950/80 border-amber-500/80 text-amber-200'
            }`}
        >
          {timeoutResult.type === 'DEADLOCK_RESET' ? (
            <div className="flex items-center justify-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span>{t.mainGame.deadlockReset}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span>
                {t.mainGame.timeUpHandOff.replace(
                  '{next}',
                  timeoutResult.nextPlayerNickname || 'Opponent'
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3. Middle of Remaining Space */}
      {snapshot.phase === 'AWAITING_READY' || readyCountdown !== null || !hasCompletedReadyCountdown ? (
        <div
          data-testid="face-off-pending-players-section"
          className="flex-1 min-h-0 w-full flex flex-col items-center justify-center gap-4 sm:gap-6 my-auto"
        >
          {/* Awaiting Ready Announcement Banner (sr-only for accessibility/tests) */}
          <div
            data-testid="face-off-awaiting-banner"
            className="sr-only"
          >
            <h2>
              {t.mainGame.readyForFaceOff}
            </h2>
            <p>
              {t.mainGame.faceOffContenders}: {contender1?.nickname} {t.mainGame.versus}{' '}
              {contender2?.nickname}
            </p>
          </div>

          {/* Prominent 5-Second Ready Countdown Banner before game starts */}
          {readyCountdown !== null && (
            <div
              data-testid="face-off-ready-countdown-banner"
              className="flex flex-col items-center gap-1.5 py-3 px-8 rounded-2xl bg-slate-900/90 border-2 border-feud-gold/60 shadow-[0_0_35px_rgba(234,179,8,0.35)] text-center animate-pulse"
            >
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-feud-gold">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span>{t.mainGame.bothReady}</span>
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-white">
                {t.mainGame.gameStartsIn.replace('{seconds}', String(readyCountdown))}
              </p>
            </div>
          )}

          {/* Pending Players Duel Podiums */}
          <div className="w-full max-w-4xl shrink-0">
            {renderDuelPodiums()}
          </div>
        </div>
      ) : (
        <>
          {/* Duel Podiums & Center Arbiter (Players Doing Face-Off) */}
          <div className="w-full max-w-4xl shrink-0 my-1 sm:my-1.5">
            {renderDuelPodiums()}
          </div>

          {/* Survey Question Banner */}
          <div className="w-full shrink-0">
            <div
              data-testid="face-off-question-banner"
              className="p-2.5 sm:p-3.5 2xl:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-b from-blue-950/80 via-slate-900/90 to-slate-950 border-2 border-feud-gold/60 shadow-[0_0_25px_rgba(234,179,8,0.2)] text-center relative overflow-hidden"
            >
              <div className="absolute top-1.5 right-3 flex items-center gap-1.5 text-[10px] font-bold text-feud-gold uppercase tracking-wider">
                {audioEnabled ? (
                  <>
                    <Volume2 className="w-3 h-3 animate-pulse" />
                    <span>{t.host.hostTts}</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-500">{t.host.hostTtsMuted}</span>
                  </>
                )}
              </div>

              <span className="text-[10px] font-extrabold text-feud-gold-light uppercase tracking-widest block mb-0.5">
                {readyCountdown !== null ? t.mainGame.bothReady : t.host.surveyQuestion}
              </span>
              <h2
                data-testid="face-off-question-text"
                className="text-lg sm:text-xl lg:text-2xl 2xl:text-3xl font-extrabold text-white leading-tight drop-shadow-md"
              >
                {readyCountdown !== null
                  ? t.mainGame.gameStartsIn.replace('{seconds}', String(readyCountdown))
                  : `\u201C${snapshot.question?.questionText}\u201D`}
              </h2>
            </div>
          </div>

          {/* Opponent Challenge Banner (US-13 Scenarios 2 & 4: sr-only for accessibility/tests) */}
          {snapshot.phase === 'OPPONENT_GUESS' && (
            <div
              data-testid="face-off-opponent-challenge-banner"
              className="sr-only"
            >
              <span>
                {snapshot.firstGuessResult?.isMatched && snapshot.firstGuessResult.points > 0
                  ? t.mainGame.canYouBeat
                    .replace('{answer}', snapshot.firstGuessResult.rawAnswer)
                    .replace('{points}', String(snapshot.firstGuessResult.points))
                  : t.mainGame.opponentChance.replace('{contender}', snapshot.firstGuessResult?.playerNickname || contender1?.nickname || 'Contender')}
              </span>
              <span>
                {contender2?.nickname} has 15 seconds to buzz in and steal control!
              </span>
            </div>
          )}

          {/* Pass or Play Prompt (US-13 Scenarios 1, 3, 4: sr-only for accessibility/tests) */}
          {snapshot.phase === 'PASS_OR_PLAY' && (
            <div
              data-testid="face-off-pass-play-banner"
              className="sr-only"
            >
              <h2>{t.mainGame.passOrPlayTitle}</h2>
              <p>
                {t.mainGame.waitingForWinnerChoice.replace(
                  '{winner}',
                  snapshot.winnerNickname || promptPassPlay?.winnerNickname || activeWinnerName
                )}
              </p>
            </div>
          )}

          {/* Round Control Assigned Modal Overlay (US-13 Scenarios 6 & 7) */}
          {(snapshot.phase === 'ROUND_CONTROL_ASSIGNED' || roundControlAssigned) && (
            <div
              data-testid="face-off-control-assigned-banner"
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fadeIn"
            >
              <div
                className={`w-full max-w-xl p-6 sm:p-8 rounded-3xl border-2 text-center shadow-[0_0_50px_rgba(34,197,94,0.4)] backdrop-blur-xl ${(snapshot.passOrPlayDecision || roundControlAssigned?.decision) === 'play'
                  ? 'bg-gradient-to-r from-green-950/95 via-slate-900 to-green-950/95 border-green-400'
                  : 'bg-gradient-to-r from-amber-950/95 via-slate-900 to-amber-950/95 border-amber-400'
                  }`}
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Award className="w-7 h-7 text-feud-gold animate-bounce" />
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-wide">
                    {(snapshot.passOrPlayDecision || roundControlAssigned?.decision) === 'play'
                      ? t.mainGame.teamChosePlay.replace('{team}', controllingTeam === 'TEAM_2' ? '2' : '1')
                      : t.mainGame.controlPassesTo.replace('{team}', controllingTeam === 'TEAM_2' ? '2' : '1')}
                  </h2>
                </div>
                <p className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-slate-300 mt-1">
                  Transitioning to Team Guessing Round...
                </p>
              </div>
            </div>
          )}

          {/* Survey Said Suspense Banner (US-28: sr-only for accessibility/tests) */}
          {surveySaidAnnouncement && (
            <div
              data-testid="survey-said-banner"
              className="sr-only"
            >
              <span>{t.host.surveyQuestion}</span>
              <h3>
                <span>{surveySaidAnnouncement.player}</span> said &ldquo;{surveySaidAnnouncement.answer}&rdquo;
              </h3>
              <p>Survey said...!</p>
            </div>
          )}

          {/* Survey Board Grid (US-13 Scenarios 1, 2, 3, 4) */}
          {answers.length > 0 && (
            <div
              data-testid="face-off-survey-board"
              className="w-full flex-1 min-h-0 flex flex-col bg-slate-950/80 border-2 border-feud-gold/40 rounded-xl sm:rounded-2xl p-2 sm:p-2.5 2xl:p-3.5 shadow-xl backdrop-blur-md overflow-hidden my-1 sm:my-1.5"
            >
              <div className="flex items-center justify-between mb-1.5 sm:mb-2 border-b border-slate-800 pb-1.5 sm:pb-2 shrink-0">
                <span className="text-xs font-black uppercase tracking-widest text-feud-gold flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-feud-gold" />
                  Survey Board
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  {revealedCount} / {answers.length} Revealed
                </span>
              </div>

              <div className="flex-1 min-h-0 w-full h-full max-h-full grid grid-cols-2 grid-rows-4 auto-rows-fr gap-2 sm:gap-2.5 overflow-hidden">
                {HOST_SLOT_RANKS.map((rankOrder) => {
                  const answer = answerByRank.get(rankOrder);
                  const hasAnswer = Boolean(answer) || rankOrder <= totalAnswers;

                  if (!hasAnswer) {
                    return (
                      <div
                        key={`face-off-empty-slot-${rankOrder}`}
                        data-testid={`face-off-empty-slot-${rankOrder}`}
                        className="h-full rounded-xl border border-slate-800/40 bg-slate-950/30 select-none"
                      />
                    );
                  }

                  const isRevealed =
                    revealedRanks.includes(rankOrder) ||
                    showDeadlockBoard;
                  const isNumberOne = rankOrder === 1;

                  return isRevealed && answer ? (
                    <div
                      key={answer.id || rankOrder}
                      data-testid={`face-off-card-${rankOrder}`}
                      className={`h-full flex items-center justify-between p-2 sm:p-2.5 2xl:p-3 rounded-xl transition-all duration-300 min-h-[42px] sm:min-h-[50px] ${isNumberOne
                        ? 'bg-gradient-to-r from-amber-500/25 via-yellow-500/20 to-feud-gold/30 border-2 border-feud-gold shadow-[0_0_20px_rgba(234,179,8,0.4)]'
                        : 'bg-slate-800/90 border border-blue-500/40 shadow-md'
                        }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                        <span
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full font-black text-xs sm:text-sm flex items-center justify-center shadow-inner shrink-0 ${isNumberOne
                            ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 ring-2 ring-yellow-300'
                            : 'bg-blue-600/30 text-blue-300 border border-blue-400/30'
                            }`}
                        >
                          {rankOrder}
                        </span>
                        <div className="min-w-0">
                          <span className="font-black text-white uppercase text-xs sm:text-sm md:text-base tracking-wide block truncate">
                            {answer.answerText}
                          </span>
                          {isNumberOne && (
                            <span
                              data-testid="number-one-badge"
                              className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-yellow-300 bg-yellow-500/20 px-1.5 py-0.5 rounded-full border border-yellow-400/40"
                            >
                              <Award className="w-2.5 h-2.5" />
                              {t.mainGame.numberOneAnswerFound || '#1 ANSWER'}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        data-testid={`face-off-points-${rankOrder}`}
                        className={`font-black text-xs sm:text-sm md:text-base px-2.5 sm:px-3 py-1 rounded-lg shadow-md shrink-0 ${isNumberOne
                          ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950'
                          : 'bg-feud-gold/20 text-feud-gold border border-feud-gold/40'
                          }`}
                      >
                        {answer.points} pts
                      </span>
                    </div>
                  ) : (
                    <div
                      key={`concealed-${rankOrder}`}
                      data-testid={`face-off-card-concealed-${rankOrder}`}
                      className="h-full flex items-center justify-between p-2 sm:p-2.5 2xl:p-3 rounded-xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-blue-950/40 border border-slate-800/80 shadow-inner group min-h-[42px] sm:min-h-[50px]"
                    >
                      <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 border border-slate-700 font-extrabold text-xs sm:text-sm text-slate-400 flex items-center justify-center shrink-0">
                        {rankOrder}
                      </span>
                      <div className="flex-1 mx-3 h-2.5 bg-slate-800/50 rounded-full border border-dashed border-slate-700/60" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">
                        --
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Answer Submission / Resolved Stage (sr-only for accessibility/tests) */}
          {snapshot.submittedAnswer && (
            <div
              data-testid="face-off-submitted-answer"
              className="sr-only"
            >
              <span>
                {activeWinnerName}&apos;s Submitted Answer
              </span>
              <div>
                &ldquo;{snapshot.submittedAnswer}&rdquo;
              </div>
            </div>
          )}

          {/* Deadlock Reset Revealed Answers Board (sr-only for accessibility/tests so nothing appears under board) */}
          {showDeadlockBoard && answers.length > 0 && (
            <div
              data-testid="deadlock-answers-board"
              className="sr-only"
            >
              <div>
                <span>Deadlock Revealed Survey Answers (0 Points Awarded)</span>
                <h3>What survey answers were on the board:</h3>
              </div>
              <div>
                {answers.map((answer) => (
                  <div
                    key={answer.id}
                    data-testid={`deadlock-answer-${answer.rankOrder}`}
                  >
                    <span>{answer.rankOrder}</span>
                    <span>{answer.answerText}</span>
                    <span>{answer.points} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
