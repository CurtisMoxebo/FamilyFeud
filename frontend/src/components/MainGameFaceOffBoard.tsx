import { MainGameScoreboardHeader } from './MainGameScoreboardHeader';
import React, { useState, useEffect, useRef } from 'react';
import {
  ScoreboardUpdatePayload,
  FaceOffSessionState,
  TimerTickPayload,
  BuzzerLockedPayload,
  FaceOffTimeoutPayload,
  PromptPassPlayPayload,
  RoundControlAssignedPayload,
  OpponentTurnPromptPayload,
} from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import {
  speakQuestion,
  cancelSpeech,
  speakPlayOrPassDecision,
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
  Flame,
} from 'lucide-react';

export interface MainGameFaceOffBoardProps {
  snapshot: FaceOffSessionState;
  timerTick?: TimerTickPayload | null;
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
}

export const MainGameFaceOffBoard: React.FC<MainGameFaceOffBoardProps> = ({
  snapshot,
  timerTick,
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
}) => {
  const { t } = useTranslation();

  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => !isTtsMuted());

  const handleToggleAudio = () => {
    const nextAudio = !audioEnabled;
    setAudioEnabled(nextAudio);
    setTtsMuted(!nextAudio);
    if (!nextAudio) {
      cancelSpeech();
    }
  };

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
    'Contender';

  const controllingTeam =
    roundControlAssigned?.controllingTeam || snapshot.controllingTeam;
  const controllingTeamName =
    roundControlAssigned?.controllingTeamName ||
    (controllingTeam === 'TEAM_1' ? t.mainGame.team1 : t.mainGame.team2);

  // Scenario 1: Trigger TTS reading of question when buzzers activate
  useEffect(() => {
    if (snapshot.phase === 'BUZZER_ACTIVE' && snapshot.question?.id) {
      if (lastSpokenQuestionId.current !== snapshot.question.id) {
        lastSpokenQuestionId.current = snapshot.question.id;
        if (audioEnabled) { speakQuestion(snapshot.question.questionText, language); }
      }
    }
  }, [snapshot.phase, snapshot.question?.id, snapshot.question?.questionText, language, audioEnabled]);

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

  const isC1Winner = activeWinnerId === contender1?.id;
  const isC2Winner = activeWinnerId === contender2?.id;

  const isC1LockedOut = isBuzzerLocked && !isC1Winner;
  const isC2LockedOut = isBuzzerLocked && !isC2Winner;

  const showDeadlockBoard =
    snapshot.phase === 'DEADLOCK_RESET' || timeoutResult?.type === 'DEADLOCK_RESET';

  const answers = snapshot.question?.answers || [];
  const revealedCount =
    snapshot.revealedAnswers?.length || (showDeadlockBoard ? answers.length : 0);

  return (
    <div
      data-testid="main-game-face-off-board"
      className="w-full max-w-5xl flex flex-col items-center gap-8 animate-fadeIn"
    >
      {/* Persistent Grand Total Header (US-16 Scenario 1) */}
      <div className="w-full">
        <MainGameScoreboardHeader
          team1GrandTotal={scoreboardState?.team1GrandTotal ?? 0}
          team2GrandTotal={scoreboardState?.team2GrandTotal ?? 0}
          activeRoundBank={scoreboardState?.activeRoundBank ?? 0}
          currentRoundNumber={scoreboardState?.currentRoundNumber ?? snapshot.roundNumber ?? 1}
          totalRounds={scoreboardState?.totalRounds ?? 3}
          isSuddenDeath={scoreboardState?.isSuddenDeath ?? false}
        />
      </div>

      {/* Header Bar */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-feud-slate-border/80 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-feud-gold/20 border border-feud-gold/40 text-feud-gold">
              <Tv className="w-7 h-7" />
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
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                {roomName}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleAudio}
              data-testid="host-audio-toggle"
              title={audioEnabled ? 'Mute Sounds & TTS' : 'Unmute Sounds & TTS'}
              className="p-3 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              {audioEnabled ? (
                <Volume2 className="w-5 h-5 text-feud-gold" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-500" />
              )}
            </button>

            {onLeave && (
            <button
              type="button"
              onClick={onLeave}
              data-testid="face-off-leave-btn"
              className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Leave Lobby</span>
            </button>
          )}
          </div>
        </div>

        {/* Survey Question Banner */}
        <div className="mt-6">
          {snapshot.phase === 'AWAITING_READY' ? (
            <div
              data-testid="face-off-awaiting-banner"
              className="p-6 rounded-2xl bg-slate-800/60 border border-dashed border-slate-700 text-center"
            >
              <h2 className="text-xl sm:text-2xl font-bold text-slate-200">
                {t.mainGame.readyForFaceOff}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {t.mainGame.faceOffContenders}: {contender1?.nickname} {t.mainGame.versus}{' '}
                {contender2?.nickname}
              </p>
            </div>
          ) : (
            <div
              data-testid="face-off-question-banner"
              className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-blue-950/80 via-slate-900/90 to-slate-950 border-2 border-feud-gold/60 shadow-[0_0_35px_rgba(234,179,8,0.2)] text-center relative overflow-hidden"
            >
              <div className="absolute top-2 right-4 flex items-center gap-1.5 text-xs font-bold text-feud-gold uppercase tracking-wider">
                {audioEnabled ? (
                  <>
                    <Volume2 className="w-4 h-4 animate-pulse" />
                    <span>Host TTS</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-500">Host TTS (Muted)</span>
                  </>
                )}
              </div>

              <span className="text-xs font-extrabold text-feud-gold-light uppercase tracking-widest block mb-2">
                Survey Question
              </span>
              <h2
                data-testid="face-off-question-text"
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white leading-tight drop-shadow-md"
              >
                &ldquo;{snapshot.question?.questionText}&rdquo;
              </h2>
            </div>
          )}
        </div>
      </div>

      {/* Timeout / Hand-off / Deadlock Alerts */}
      {timeoutResult && (
        <div
          data-testid="face-off-timeout-banner"
          className={`w-full p-4 rounded-2xl text-center font-bold text-sm sm:text-base border transition-all animate-bounce ${
            timeoutResult.type === 'DEADLOCK_RESET'
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

      {/* Opponent Challenge Banner (US-13 Scenarios 2 & 4) */}
      {snapshot.phase === 'OPPONENT_GUESS' && (
        <div
          data-testid="face-off-opponent-challenge-banner"
          className="w-full p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-950/90 via-slate-900 to-blue-950/90 border-2 border-blue-400/70 text-center shadow-xl animate-fadeIn"
        >
          <div className="flex items-center justify-center gap-2 text-blue-300 font-extrabold text-sm sm:text-base">
            <Flame className="w-5 h-5 text-amber-400 animate-bounce" />
            <span>
              {snapshot.firstGuessResult?.isMatched && snapshot.firstGuessResult.points > 0
                ? t.mainGame.canYouBeat
                    .replace('{answer}', snapshot.firstGuessResult.rawAnswer)
                    .replace('{points}', String(snapshot.firstGuessResult.points))
                : t.mainGame.opponentChance.replace('{contender}', snapshot.firstGuessResult?.playerNickname || contender1?.nickname || 'Contender')}
            </span>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1 block">
            {contender2?.nickname} has 15 seconds to buzz in and steal control!
          </span>
        </div>
      )}

      {/* Pass or Play Prompt Banner (US-13 Scenarios 1, 3, 4) */}
      {snapshot.phase === 'PASS_OR_PLAY' && (
        <div
          data-testid="face-off-pass-play-banner"
          className="w-full p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-yellow-500/20 via-feud-gold/25 to-yellow-500/20 border-2 border-feud-gold text-center shadow-[0_0_35px_rgba(234,179,8,0.3)] animate-pulse"
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-feud-gold" />
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider">
              {t.mainGame.passOrPlayTitle}
            </h2>
            <Sparkles className="w-5 h-5 text-feud-gold" />
          </div>
          <p className="text-sm sm:text-base font-bold text-yellow-200">
            {t.mainGame.waitingForWinnerChoice.replace(
              '{winner}',
              snapshot.winnerNickname || promptPassPlay?.winnerNickname || activeWinnerName
            )}
          </p>
        </div>
      )}

      {/* Round Control Assigned Banner (US-13 Scenarios 6 & 7) */}
      {(snapshot.phase === 'ROUND_CONTROL_ASSIGNED' || roundControlAssigned) && (
        <div
          data-testid="face-off-control-assigned-banner"
          className={`w-full p-5 sm:p-6 rounded-3xl border-2 text-center shadow-2xl animate-fadeIn ${
            (snapshot.passOrPlayDecision || roundControlAssigned?.decision) === 'play'
              ? 'bg-gradient-to-r from-green-950/90 via-slate-900 to-green-950/90 border-green-400 shadow-[0_0_30px_rgba(34,197,94,0.35)]'
              : 'bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.35)]'
          }`}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Award className="w-6 h-6 text-feud-gold animate-bounce" />
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
      )}

      {/* Survey Board Grid (US-13 Scenarios 1, 2, 3, 4) */}
      {snapshot.phase !== 'AWAITING_READY' && answers.length > 0 && (
        <div
          data-testid="face-off-survey-board"
          className="w-full bg-slate-950/80 border-2 border-feud-gold/40 rounded-3xl p-6 shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <span className="text-xs font-black uppercase tracking-widest text-feud-gold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-feud-gold" />
              Survey Board
            </span>
            <span className="text-xs font-semibold text-slate-400">
              {revealedCount} / {answers.length} Revealed
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {answers.map((answer) => {
              const isRevealed =
                snapshot.revealedAnswers?.some((r) => r.rankOrder === answer.rankOrder) ||
                showDeadlockBoard;
              const isNumberOne = answer.rankOrder === 1;

              return isRevealed ? (
                <div
                  key={answer.id}
                  data-testid={`face-off-card-${answer.rankOrder}`}
                  className={`flex items-center justify-between p-3.5 sm:p-4 rounded-2xl transition-all duration-300 ${
                    isNumberOne
                      ? 'bg-gradient-to-r from-amber-500/25 via-yellow-500/20 to-feud-gold/30 border-2 border-feud-gold shadow-[0_0_25px_rgba(234,179,8,0.4)]'
                      : 'bg-slate-800/90 border border-blue-500/40 shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full font-black text-xs sm:text-sm flex items-center justify-center shadow-inner ${
                        isNumberOne
                          ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 ring-2 ring-yellow-300'
                          : 'bg-blue-600/30 text-blue-300 border border-blue-400/30'
                      }`}
                    >
                      {answer.rankOrder}
                    </span>
                    <div>
                      <span className="font-black text-white uppercase text-sm sm:text-base tracking-wide block">
                        {answer.answerText}
                      </span>
                      {isNumberOne && (
                        <span
                          data-testid="number-one-badge"
                          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-yellow-300 bg-yellow-500/20 px-2 py-0.5 rounded-full border border-yellow-400/40"
                        >
                          <Award className="w-3 h-3" />
                          {t.mainGame.numberOneAnswerFound || '#1 ANSWER'}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    data-testid={`face-off-points-${answer.rankOrder}`}
                    className={`font-black text-sm sm:text-base px-3 py-1 rounded-xl shadow-md ${
                      isNumberOne
                        ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950'
                        : 'bg-feud-gold/20 text-feud-gold border border-feud-gold/40'
                    }`}
                  >
                    {answer.points} pts
                  </span>
                </div>
              ) : (
                <div
                  key={answer.id}
                  data-testid={`face-off-card-concealed-${answer.rankOrder}`}
                  className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-blue-950/40 border border-slate-800/80 shadow-inner group"
                >
                  <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 border border-slate-700 font-extrabold text-xs sm:text-sm text-slate-400 flex items-center justify-center">
                    {answer.rankOrder}
                  </span>
                  <div className="flex-1 mx-4 h-3 bg-slate-800/50 rounded-full border border-dashed border-slate-700/60" />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    --
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Duel Podiums & Center Arbiter */}
      <div className="w-full grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-6">
        {/* Contender 1 Podium (Team 1) */}
        <div
          data-testid="face-off-podium-team1"
          className={`relative flex flex-col items-center p-6 sm:p-8 rounded-3xl backdrop-blur-xl border-2 transition-all duration-300 ${
            isC1Winner
              ? 'bg-blue-900/40 border-feud-gold shadow-[0_0_40px_rgba(234,179,8,0.35)] scale-105'
              : isC1LockedOut
              ? 'bg-slate-900/60 border-red-500/60 opacity-80'
              : 'bg-slate-900/80 border-blue-500/40'
          }`}
        >
          {/* Winner Banner */}
          {isC1Winner && (
            <div
              data-testid="c1-winner-badge"
              className="absolute -top-4 px-4 py-1 rounded-full bg-gradient-to-r from-yellow-400 to-feud-gold text-slate-950 text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5 animate-pulse"
            >
              <Award className="w-4 h-4" />
              <span>{t.mainGame.buzzerWinner.replace('{name}', contender1?.nickname || '')}</span>
            </div>
          )}

          {/* Locked Out Overlay */}
          {isC1LockedOut && (
            <div
              data-testid="c1-lockout-badge"
              className="absolute -top-4 px-4 py-1 rounded-full bg-red-600 text-white text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{t.mainGame.buzzerLocked}</span>
            </div>
          )}

          <span className="text-xs font-extrabold uppercase text-blue-400 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 mb-3">
            {t.mainGame.team1} &bull; {t.mainGame.battingOrder.replace('{order}', String(contender1?.battingOrder || 1))}
          </span>

          <h3
            data-testid="c1-nickname"
            className="text-2xl sm:text-3xl font-black text-white tracking-wide"
          >
            {contender1?.nickname}
          </h3>

          {/* Readiness State */}
          <div className="mt-4 flex items-center gap-2">
            {contender1?.isReady ? (
              <span
                data-testid="c1-ready-badge"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-green-400 px-3 py-1 rounded-full bg-green-500/15 border border-green-500/30"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t.mainGame.imReady}</span>
              </span>
            ) : (
              <span
                data-testid="c1-waiting-badge"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 animate-pulse"
              >
                <span>{t.lobby.statusWaiting}</span>
              </span>
            )}
          </div>
        </div>

        {/* Center Buzzer & Countdown Arbiter */}
        <div
          data-testid="face-off-center-arbiter"
          className="flex flex-col items-center justify-center p-4 min-w-[180px]"
        >
          {isBuzzerLocked ? (
            /* 15-Second Active Countdown Ring */
            <div
              data-testid="face-off-timer-ring"
              className="flex flex-col items-center justify-center p-6 rounded-full bg-slate-900/90 border-4 border-feud-gold shadow-[0_0_35px_rgba(234,179,8,0.4)] animate-pulse"
            >
              <Clock className="w-8 h-8 text-feud-gold mb-1" />
              <span
                data-testid="face-off-seconds"
                className={`text-4xl font-black tracking-tight ${
                  currentSeconds <= 5 ? 'text-red-400 animate-ping' : 'text-feud-gold'
                }`}
              >
                {currentSeconds}s
              </span>
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Authoritative Timer
              </span>
            </div>
          ) : snapshot.phase === 'BUZZER_ACTIVE' ? (
            /* Armed Buzzers Active State */
            <div
              data-testid="buzzers-armed-cue"
              className="flex flex-col items-center justify-center p-6 rounded-full bg-yellow-500/10 border-2 border-feud-gold/70 text-center animate-pulse"
            >
              <Zap className="w-10 h-10 text-feud-gold animate-bounce mb-1" />
              <span className="text-sm font-black text-feud-gold uppercase tracking-wider">
                {t.mainGame.buzzerBtn}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Ready to Buzz
              </span>
            </div>
          ) : (
            /* Waiting for Readiness */
            <div className="flex flex-col items-center text-center p-4">
              <span className="text-2xl font-black text-slate-600 tracking-wider">VS</span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                {t.mainGame.faceOffTitle}
              </span>
            </div>
          )}
        </div>

        {/* Contender 2 Podium (Team 2) */}
        <div
          data-testid="face-off-podium-team2"
          className={`relative flex flex-col items-center p-6 sm:p-8 rounded-3xl backdrop-blur-xl border-2 transition-all duration-300 ${
            isC2Winner
              ? 'bg-blue-900/40 border-feud-gold shadow-[0_0_40px_rgba(234,179,8,0.35)] scale-105'
              : isC2LockedOut
              ? 'bg-slate-900/60 border-red-500/60 opacity-80'
              : 'bg-slate-900/80 border-purple-500/40'
          }`}
        >
          {/* Winner Banner */}
          {isC2Winner && (
            <div
              data-testid="c2-winner-badge"
              className="absolute -top-4 px-4 py-1 rounded-full bg-gradient-to-r from-yellow-400 to-feud-gold text-slate-950 text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5 animate-pulse"
            >
              <Award className="w-4 h-4" />
              <span>{t.mainGame.buzzerWinner.replace('{name}', contender2?.nickname || '')}</span>
            </div>
          )}

          {/* Locked Out Overlay */}
          {isC2LockedOut && (
            <div
              data-testid="c2-lockout-badge"
              className="absolute -top-4 px-4 py-1 rounded-full bg-red-600 text-white text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{t.mainGame.buzzerLocked}</span>
            </div>
          )}

          <span className="text-xs font-extrabold uppercase text-purple-400 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 mb-3">
            {t.mainGame.team2} &bull; {t.mainGame.battingOrder.replace('{order}', String(contender2?.battingOrder || 1))}
          </span>

          <h3
            data-testid="c2-nickname"
            className="text-2xl sm:text-3xl font-black text-white tracking-wide"
          >
            {contender2?.nickname}
          </h3>

          {/* Readiness State */}
          <div className="mt-4 flex items-center gap-2">
            {contender2?.isReady ? (
              <span
                data-testid="c2-ready-badge"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-green-400 px-3 py-1 rounded-full bg-green-500/15 border border-green-500/30"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t.mainGame.imReady}</span>
              </span>
            ) : (
              <span
                data-testid="c2-waiting-badge"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 animate-pulse"
              >
                <span>{t.lobby.statusWaiting}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Answer Submission / Resolved Stage */}
      {snapshot.submittedAnswer && (
        <div
          data-testid="face-off-submitted-answer"
          className="w-full max-w-lg p-5 rounded-3xl bg-slate-900/90 border-2 border-feud-gold text-center shadow-2xl animate-fadeIn"
        >
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {activeWinnerName}&apos;s Submitted Answer
          </span>
          <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1 text-feud-gold uppercase">
            &ldquo;{snapshot.submittedAnswer}&rdquo;
          </div>
        </div>
      )}

      {/* Deadlock Reset Revealed Answers Board (Scenario 5) */}
      {showDeadlockBoard && answers.length > 0 && (
        <div
          data-testid="deadlock-answers-board"
          className="w-full max-w-3xl bg-slate-900/90 border-2 border-red-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl animate-fadeIn"
        >
          <div className="text-center mb-6">
            <span className="text-xs font-extrabold uppercase tracking-widest text-red-400">
              Deadlock Revealed Survey Answers (0 Points Awarded)
            </span>
            <h3 className="text-xl font-black text-white mt-1">
              What survey answers were on the board:
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {answers.map((answer) => (
              <div
                key={answer.id}
                data-testid={`deadlock-answer-${answer.rankOrder}`}
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 font-black text-xs flex items-center justify-center">
                    {answer.rankOrder}
                  </span>
                  <span className="font-extrabold text-white uppercase text-sm sm:text-base">
                    {answer.answerText}
                  </span>
                </div>
                <span className="font-black text-feud-gold text-sm sm:text-base px-2 py-0.5 rounded bg-feud-gold/10">
                  {answer.points} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
