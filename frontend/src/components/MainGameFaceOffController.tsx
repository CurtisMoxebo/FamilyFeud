import React, { useState, useEffect, useRef } from 'react';
import { MainGameScoreboardHeader } from './MainGameScoreboardHeader';
import {
  ScoreboardUpdatePayload,
  FaceOffSessionState,
  FaceOffPhase,
  TimerTickPayload,
  BuzzerLockedPayload,
  BuzzerRejectedPayload,
  FaceOffTimeoutPayload,
  PromptPassPlayPayload,
  RoundControlAssignedPayload,
  OpponentTurnPromptPayload,
  FaceOffAnswerSubmittedPayload,
  AnswerRevealCompletedPayload,
  StrikeIssuedPayload,
} from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { triggerHaptic } from '../utils/haptics';
import { playStrikeBuzzer } from '../utils/soundEffects';
import { useVirtualKeyboard } from '../hooks/useVirtualKeyboard';
import {
  Zap,
  Lock,
  CheckCircle2,
  Award,
  Users,
  Send,
  Play,
  ArrowRight,
  Sparkles,
  Flame,
  Clock,
} from 'lucide-react';

export interface MainGameFaceOffControllerProps {
  snapshot: FaceOffSessionState;
  timerTick?: TimerTickPayload | null;
  initialReadyCountdown?: number | null;
  isPaused?: boolean;
  pausedRemainingSeconds?: number;
  buzzerLocked?: BuzzerLockedPayload | null;
  buzzerRejected?: BuzzerRejectedPayload | null;
  timeoutResult?: FaceOffTimeoutPayload | null;
  strikeIssued?: StrikeIssuedPayload | null;
  promptPassPlay?: PromptPassPlayPayload | null;
  roundControlAssigned?: RoundControlAssignedPayload | null;
  opponentTurnPrompt?: OpponentTurnPromptPayload | null;
  currentNickname: string;
  currentPlayerId?: string;
  roomCode: string;
  roomName: string;
  onReady?: () => void;
  onBuzz?: () => void;
  onSubmitAnswer?: (rawAnswer: string) => void;
  onChoosePlayPass?: (decision: 'play' | 'pass') => void;
  scoreboardState?: ScoreboardUpdatePayload | null;
  faceOffAnswerSubmitted?: FaceOffAnswerSubmittedPayload | null;
  answerRevealCompleted?: AnswerRevealCompletedPayload | null;
  onLeave?: () => void;
}

export const MainGameFaceOffController: React.FC<MainGameFaceOffControllerProps> = ({
  snapshot,
  timerTick,
  initialReadyCountdown,
  isPaused = false,
  pausedRemainingSeconds,
  buzzerLocked,
  buzzerRejected,
  timeoutResult,
  strikeIssued,
  promptPassPlay,
  roundControlAssigned,
  opponentTurnPrompt: _opponentTurnPrompt,
  faceOffAnswerSubmitted,
  answerRevealCompleted,
  currentNickname,
  currentPlayerId,
  roomCode,
  roomName,
  onReady,
  onBuzz,
  onSubmitAnswer,
  onChoosePlayPass,
  scoreboardState,
  onLeave: _onLeave,
}) => {
  const { t } = useTranslation();
  const [answerInput, setAnswerInput] = useState<string>('');
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState<{
    player: string;
    answer: string;
  } | null>(null);
  const handledSubmissionRef = useRef<Set<string>>(new Set());

  // Listen for opponent or contender answer submission
  useEffect(() => {
    if (faceOffAnswerSubmitted?.rawAnswer) {
      const key = `${faceOffAnswerSubmitted.playerId}-${faceOffAnswerSubmitted.rawAnswer}`;
      if (!handledSubmissionRef.current.has(key)) {
        handledSubmissionRef.current.add(key);
        setActiveAnnouncement({
          player: faceOffAnswerSubmitted.playerNickname || 'Contender',
          answer: faceOffAnswerSubmitted.rawAnswer,
        });
      }
    }
  }, [faceOffAnswerSubmitted]);

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

  // Reset local state when entering AWAITING_READY or when round / question changes
  const currentRoundKey = `${snapshot.gameId || 'game'}-${snapshot.roundNumber}-${snapshot.question?.id || 'q'}`;
  const prevRoundKeyRef = useRef<string>(currentRoundKey);

  useEffect(() => {
    if (prevRoundKeyRef.current !== currentRoundKey || snapshot.phase === 'AWAITING_READY') {
      prevRoundKeyRef.current = currentRoundKey;
      setAnswerInput('');
      setHasSubmitted(false);
      setActiveAnnouncement(null);
      handledSubmissionRef.current.clear();
      hasVibratedWinRef.current = null;
      lastBuzzHapticAtRef.current = 0;
      if (snapshot.phase === 'AWAITING_READY' && initialReadyCountdown === undefined) {
        setReadyCountdown(null);
      }
    }
  }, [currentRoundKey, snapshot.phase, initialReadyCountdown]);

  const inputRef = useRef<HTMLInputElement>(null);
  const formAnchorRef = useRef<HTMLFormElement>(null);
  const lastBuzzHapticAtRef = useRef<number>(0);
  const hasVibratedWinRef = useRef<string | null>(null);
  const { isKeyboardOpen, keepElementVisible } = useVirtualKeyboard();

  // Authoritative countdown seconds
  const currentSeconds =
    isPaused && typeof pausedRemainingSeconds === 'number' && pausedRemainingSeconds > 0
      ? pausedRemainingSeconds
      : timerTick && timerTick.secondsRemaining !== undefined
        ? timerTick.secondsRemaining
        : snapshot.remainingSeconds;

  const trimmedNick = currentNickname.trim().toLowerCase();

  // Contender identification
  const c1 = snapshot.team1Contender;
  const c2 = snapshot.team2Contender;

  // 5-second countdown timer when both contenders are ready
  const isBothReady = Boolean(c1?.isReady && c2?.isReady);
  const [readyCountdown, setReadyCountdown] = useState<number | null>(() =>
    initialReadyCountdown !== undefined ? initialReadyCountdown : null
  );
  const previousBothReadyRef = useRef<boolean>(
    initialReadyCountdown !== undefined ? false : isBothReady
  );
  const previousPhaseRef = useRef<FaceOffPhase>(snapshot.phase);

  useEffect(() => {
    if (initialReadyCountdown !== undefined) {
      setReadyCountdown(initialReadyCountdown);
    }
  }, [initialReadyCountdown]);

  useEffect(() => {
    const wasNotBothReady = !previousBothReadyRef.current;
    const wasAwaitingReady = previousPhaseRef.current === 'AWAITING_READY';
    previousBothReadyRef.current = isBothReady;
    previousPhaseRef.current = snapshot.phase;

    if (isBothReady && (wasNotBothReady || (wasAwaitingReady && snapshot.phase === 'BUZZER_ACTIVE'))) {
      setReadyCountdown(5);
    }
  }, [isBothReady, snapshot.phase]);

  const isC1 =
    (currentPlayerId && c1?.id === currentPlayerId) ||
    c1?.nickname?.toLowerCase() === trimmedNick;

  const isC2 =
    (currentPlayerId && c2?.id === currentPlayerId) ||
    c2?.nickname?.toLowerCase() === trimmedNick;

  const isContender = isC1 || isC2;

  useEffect(() => {
    if (readyCountdown === null) return;
    if (readyCountdown <= 0) {
      setReadyCountdown(null);
      if (isContender) {
        triggerHaptic('buzz');
      }
      return;
    }
    if (isPaused) return;

    const timer = setTimeout(() => {
      setReadyCountdown((prev) => (prev !== null && prev > 1 ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [readyCountdown, isPaused, isContender]);
  const myContender = isC1 ? c1 : isC2 ? c2 : null;
  const opponentContender = isC1 ? c2 : isC2 ? c1 : null;

  const isTeam1 =
    isC1 ||
    snapshot.team1Players?.some(
      (p) =>
        (currentPlayerId && p.id === currentPlayerId) ||
        p.nickname.toLowerCase() === trimmedNick
    );
  const isTeam2 =
    isC2 ||
    snapshot.team2Players?.some(
      (p) =>
        (currentPlayerId && p.id === currentPlayerId) ||
        p.nickname.toLowerCase() === trimmedNick
    );
  const playerTeam: 'TEAM_1' | 'TEAM_2' | null = isTeam1 ? 'TEAM_1' : isTeam2 ? 'TEAM_2' : null;
  const myTeamPlayers = isTeam2 ? snapshot.team2Players : snapshot.team1Players;
  const myTeamName = isTeam2 ? t.mainGame.team2 : t.mainGame.team1;

  // Full-Screen Giant Strike Overlay for failed contender (timeout or wrong answer)
  const [activeStrikeOverlay, setActiveStrikeOverlay] = useState<{
    message?: string;
  } | null>(null);
  const lastMobileStrikeKeyRef = useRef<string>('');

  // Robust auto-dismissal for mobile strike overlay: guarantees it disappears after 2000ms
  useEffect(() => {
    if (!activeStrikeOverlay) return;
    const timer = setTimeout(() => {
      setActiveStrikeOverlay(null);
    }, 2000);
    return () => clearTimeout(timer);
  }, [activeStrikeOverlay]);

  // Trigger giant strike X overlay on the mobile display of the player who failed to provide the answer
  useEffect(() => {
    if (strikeIssued) {
      const strikePlayerId = strikeIssued.playerId || strikeIssued.player?.id;
      const strikeNickname = strikeIssued.playerNickname || strikeIssued.player?.nickname;
      const isFailedPlayer = Boolean(
        (currentPlayerId && strikePlayerId === currentPlayerId) ||
        (strikeNickname && strikeNickname.toLowerCase() === trimmedNick)
      );

      if (isFailedPlayer) {
        const key = `strike-${strikeIssued.roomCode}-${strikeIssued.team}-${strikeIssued.strikeCount}-${strikeIssued.isTimeout ? 'to' : 'ans'}`;
        if (lastMobileStrikeKeyRef.current !== key) {
          lastMobileStrikeKeyRef.current = key;
          setActiveStrikeOverlay({
            message: strikeIssued.isTimeout ? "TIME'S UP!" : t.mainGame.notOnBoard,
          });
          playStrikeBuzzer(1);
          triggerHaptic('strike');
        }
      }
    }
  }, [strikeIssued, currentPlayerId, trimmedNick, t.mainGame.notOnBoard]);

  useEffect(() => {
    if (timeoutResult) {
      const isFailedPlayer = Boolean(
        (currentPlayerId && timeoutResult.timedOutPlayerId === currentPlayerId) ||
        (timeoutResult.timedOutPlayerNickname &&
          timeoutResult.timedOutPlayerNickname.toLowerCase() === trimmedNick)
      );

      if (isFailedPlayer) {
        const key = `timeout-${timeoutResult.roomCode}-${timeoutResult.timedOutPlayerId}-${timeoutResult.type}`;
        if (lastMobileStrikeKeyRef.current !== key) {
          lastMobileStrikeKeyRef.current = key;
          setActiveStrikeOverlay({
            message: "TIME'S UP!",
          });
          playStrikeBuzzer(1);
          triggerHaptic('strike');
        }
      }
    }
  }, [timeoutResult, currentPlayerId, trimmedNick]);

  const prevStrikePhaseRef = useRef<FaceOffPhase>(snapshot.phase);
  const prevStrikeRoundRef = useRef<number>(snapshot.roundNumber);

  // Dismiss strike overlay when transitioning to a new round or entering ready phase from an active round
  useEffect(() => {
    if (
      prevStrikeRoundRef.current !== snapshot.roundNumber ||
      (prevStrikePhaseRef.current !== 'AWAITING_READY' && snapshot.phase === 'AWAITING_READY')
    ) {
      setActiveStrikeOverlay(null);
      lastMobileStrikeKeyRef.current = '';
    }
    prevStrikePhaseRef.current = snapshot.phase;
    prevStrikeRoundRef.current = snapshot.roundNumber;
  }, [snapshot.phase, snapshot.roundNumber]);

  // Buzzer lockout arbiter
  const isCurrentContenderBuzzer = Boolean(
    buzzerLocked &&
    (buzzerLocked.winnerPlayerId === c1?.id || buzzerLocked.winnerPlayerId === c2?.id)
  );

  const isBuzzerLocked =
    snapshot.phase !== 'AWAITING_READY' &&
    snapshot.phase !== 'BUZZER_ACTIVE' &&
    (snapshot.buzzerLocked || isCurrentContenderBuzzer);

  // Active respondent in face-off session
  const activeRespondentPlayer =
    snapshot.team1Players?.find((p) => p.id === snapshot.activeRespondentId) ||
    snapshot.team2Players?.find((p) => p.id === snapshot.activeRespondentId);

  const activeWinnerId =
    snapshot.phase === 'AWAITING_READY' || snapshot.phase === 'BUZZER_ACTIVE'
      ? null
      : snapshot.activeRespondentId ||
      (isCurrentContenderBuzzer ? buzzerLocked?.winnerPlayerId : null) ||
      snapshot.buzzedPlayerId;

  const activeWinnerName =
    snapshot.phase === 'AWAITING_READY' || snapshot.phase === 'BUZZER_ACTIVE'
      ? 'Contender'
      : activeRespondentPlayer?.nickname ||
      (isCurrentContenderBuzzer ? buzzerLocked?.winnerNickname : null) ||
      snapshot.buzzedPlayerNickname ||
      'Contender';

  // Face-Off Duel Winner (strictly designated contender of winning team)
  const faceOffWinnerId =
    snapshot.phase === 'AWAITING_READY' || snapshot.phase === 'BUZZER_ACTIVE'
      ? null
      : snapshot.winnerPlayerId || promptPassPlay?.winnerPlayerId;

  const winningTeam = snapshot.winnerTeam || promptPassPlay?.winnerTeam;
  const winningTeamContender = winningTeam === 'TEAM_2' ? c2 : c1;

  const faceOffWinnerName =
    snapshot.phase === 'AWAITING_READY' || snapshot.phase === 'BUZZER_ACTIVE'
      ? 'Contender'
      : winningTeamContender?.nickname ||
      promptPassPlay?.winnerNickname ||
      snapshot.winnerNickname ||
      activeWinnerName;

  const isFaceOffWinner =
    snapshot.phase === 'PASS_OR_PLAY' &&
    Boolean(
      (currentPlayerId && (currentPlayerId === faceOffWinnerId || currentPlayerId === winningTeamContender?.id)) ||
      (currentNickname && winningTeamContender?.nickname.toLowerCase() === trimmedNick)
    );

  const isBuzzerWinner =
    Boolean(activeWinnerId) &&
    ((currentPlayerId && (activeWinnerId === currentPlayerId || snapshot.buzzedPlayerId === currentPlayerId)) ||
      (activeWinnerName && activeWinnerName.toLowerCase() === trimmedNick));

  // Active respondent check (strictly player whose turn it currently is to answer)
  const isRespondent =
    snapshot.phase !== 'AWAITING_READY' &&
    snapshot.phase !== 'BUZZER_ACTIVE' &&
    snapshot.phase !== 'PASS_OR_PLAY' &&
    snapshot.phase !== 'ROUND_CONTROL_ASSIGNED' &&
    snapshot.phase !== 'DEADLOCK_RESET' &&
    snapshot.phase !== 'RESOLVED' &&
    (snapshot.phase === 'ANSWERING' || snapshot.phase === 'OPPONENT_GUESS') &&
    currentSeconds > 0 &&
    Boolean(
      (currentPlayerId && snapshot.activeRespondentId === currentPlayerId) ||
      (activeRespondentPlayer && (currentPlayerId === activeRespondentPlayer.id || activeRespondentPlayer.nickname.toLowerCase() === trimmedNick))
    );

  const isActiveRespondent = isRespondent && !hasSubmitted;

  // The "LOCKED OUT" section should only appear to the player who failed to press the buzz first
  const isLockedOut =
    snapshot.phase === 'ANSWERING' &&
    Boolean(snapshot.buzzedPlayerId) &&
    snapshot.buzzedPlayerId !== currentPlayerId &&
    isContender &&
    !snapshot.firstGuessResult;

  // Requirement: After the player who buzzed first answers in the face-off round,
  // we should never see the {{player name} buzzed first!} / {You buzzed first!} section ever again for that round.
  const [hasInitialBuzzerAnsweredLocal, setHasInitialBuzzerAnsweredLocal] = useState<boolean>(false);

  useEffect(() => {
    if (snapshot.phase === 'AWAITING_READY') {
      setHasInitialBuzzerAnsweredLocal(false);
    }
  }, [snapshot.phase, snapshot.roundNumber]);

  const hasInitialBuzzerAnswered =
    hasInitialBuzzerAnsweredLocal ||
    hasSubmitted ||
    Boolean(
      snapshot.firstGuessResult ||
      snapshot.secondGuessResult ||
      snapshot.phase === 'OPPONENT_GUESS' ||
      snapshot.phase === 'PASS_OR_PLAY' ||
      snapshot.phase === 'ROUND_CONTROL_ASSIGNED' ||
      snapshot.phase === 'DEADLOCK_RESET' ||
      snapshot.phase === 'RESOLVED' ||
      (snapshot.phase === 'ANSWERING' && snapshot.attemptedPlayerIds && snapshot.attemptedPlayerIds.length > 1) ||
      (snapshot.revealedAnswers && snapshot.revealedAnswers.length > 0)
    );

  const isMissedPlayer = Boolean(
    (currentPlayerId && snapshot.firstGuessResult?.playerId === currentPlayerId) ||
    (currentNickname &&
      snapshot.firstGuessResult?.playerNickname &&
      snapshot.firstGuessResult.playerNickname.trim().toLowerCase() === trimmedNick)
  );

  // US-22 Scenario 3: Tactile strike vibration when buzzer is rejected / locked out
  useEffect(() => {
    if (buzzerRejected) {
      triggerHaptic('strike');
    }
  }, [buzzerRejected]);

  // US-22: Celebratory haptic pulse when winning the Face-Off duel
  useEffect(() => {
    if (snapshot.phase === 'PASS_OR_PLAY' && isFaceOffWinner) {
      const winKey = `${snapshot.roundNumber}-${snapshot.question?.id ?? 'q'}`;
      if (hasVibratedWinRef.current !== winKey) {
        hasVibratedWinRef.current = winKey;
        triggerHaptic('success');
      }
    }
  }, [snapshot.phase, snapshot.roundNumber, snapshot.question?.id, isFaceOffWinner]);

  // Auto-focus input when floor becomes active for current player
  useEffect(() => {
    if (
      isActiveRespondent &&
      (snapshot.phase === 'ANSWERING' || snapshot.phase === 'OPPONENT_GUESS')
    ) {
      inputRef.current?.focus();
    }
  }, [isActiveRespondent, snapshot.phase]);

  // Reset local submission state when phase changes or deadlock resets
  useEffect(() => {
    if (snapshot.phase === 'AWAITING_READY' || snapshot.phase === 'BUZZER_ACTIVE') {
      setHasSubmitted(false);
      setAnswerInput('');
      setActiveAnnouncement(null);
    } else if (snapshot.phase === 'OPPONENT_GUESS') {
      setHasSubmitted(false);
      setAnswerInput('');
    }
  }, [snapshot.phase, snapshot.question?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPaused || !answerInput.trim() || hasSubmitted) return;

    const trimmed = answerInput.trim();
    setHasSubmitted(true);
    setHasInitialBuzzerAnsweredLocal(true);
    setActiveAnnouncement({
      player: currentNickname,
      answer: trimmed,
    });
    if (onSubmitAnswer) {
      onSubmitAnswer(trimmed);
    }
  };

  const handleChoosePlay = () => {
    if (isPaused) return;
    if (onChoosePlayPass) {
      onChoosePlayPass('play');
    }
  };

  const handleChoosePass = () => {
    if (isPaused) return;
    if (onChoosePlayPass) {
      onChoosePlayPass('pass');
    }
  };

  const controllingTeam =
    snapshot.controllingTeam || roundControlAssigned?.controllingTeam;
  const controllingTeamNum = controllingTeam === 'TEAM_2' ? '2' : '1';

  // Active respondent details for opponent turn display
  const respondentTeamName =
    activeRespondentPlayer?.team === 'TEAM_2'
      ? t.mainGame.team2
      : activeRespondentPlayer?.team === 'TEAM_1'
        ? t.mainGame.team1
        : snapshot.activeRespondentId === c2?.id
          ? t.mainGame.team2
          : t.mainGame.team1;

  const respondentPlayerName =
    activeRespondentPlayer?.nickname ||
    (snapshot.activeRespondentId === c2?.id ? c2?.nickname : c1?.nickname) ||
    'Opponent';

  return (
    <div
      data-testid="main-game-face-off-controller"
      data-keyboard-open={isKeyboardOpen ? 'true' : 'false'}
      className={`max-w-md w-full max-w-[100%] overflow-x-hidden bg-feud-slate-card/95 backdrop-blur-xl border border-feud-slate-border rounded-2xl sm:rounded-3xl ${isKeyboardOpen ? 'p-2.5 gap-2' : 'h-full max-h-full justify-between p-3 sm:p-5 gap-2 sm:gap-3 overflow-hidden'
        } pb-safe shadow-2xl animate-fadeIn flex flex-col items-center text-center`}
    >
      {/* Persistent Grand Total Header (US-16 Scenario 1 Mobile) */}
      <div className="w-full">
        <MainGameScoreboardHeader
          team1GrandTotal={scoreboardState?.team1GrandTotal ?? 0}
          team2GrandTotal={scoreboardState?.team2GrandTotal ?? 0}
          activeRoundBank={scoreboardState?.activeRoundBank ?? 0}
          currentRoundNumber={scoreboardState?.currentRoundNumber ?? snapshot.roundNumber ?? 1}
          totalRounds={scoreboardState?.totalRounds ?? (snapshot.team1Players?.length ? snapshot.team1Players.length : 3)}
          isSuddenDeath={scoreboardState?.isSuddenDeath ?? false}
          highlightTeam={playerTeam}
          compact={true}
        />
      </div>

      {/* Header Info (sr-only to maximize mobile play area) */}
      <div
        data-testid="controller-header-info"
        className="sr-only"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-feud-gold px-2.5 py-0.5 rounded-full bg-feud-gold/10 border border-feud-gold/20">
            {t.mainGame.faceOffTitle}
          </span>
          <span
            data-testid="controller-round-badge"
            className="text-xs font-extrabold uppercase tracking-wider text-yellow-300 px-2 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/30"
          >
            {t.mainGame.roundNumber.replace('{round}', String(snapshot.roundNumber || 1))}
          </span>
          <span
            data-testid="controller-room-code"
            className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 rounded bg-slate-800"
          >
            {roomCode}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 truncate max-w-[140px]">
            {roomName}
          </span>
        </div>
      </div>

      {/* Role & Status Pill (sr-only to maximize mobile play area) */}
      <div
        data-testid="controller-role-pill"
        className="sr-only"
      >
        <span className="font-semibold text-slate-300">
          Player: <span className="font-bold text-white">{currentNickname}</span>
        </span>
        {isContender ? (
          <span
            data-testid="role-contender-badge"
            className="font-extrabold text-feud-gold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-feud-gold/15 border border-feud-gold/30"
          >
            Contender
          </span>
        ) : (
          <span
            data-testid="role-spectator-badge"
            className="font-extrabold text-blue-400 uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30"
          >
            Spectator
          </span>
        )}
      </div>

      {/* Question Card (Visible once buzzers active or answering) */}
      {snapshot.phase !== 'AWAITING_READY' && snapshot.question && readyCountdown === null && (
        <div
          data-testid="controller-question-card"
          className="w-full p-4 rounded-2xl bg-slate-900/90 border border-feud-gold/40 text-left"
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-feud-gold block mb-1">
            Question
          </span>
          <p
            data-testid="controller-question-text"
            className="text-base sm:text-lg font-extrabold text-white leading-snug"
          >
            &ldquo;{snapshot.question.questionText}&rdquo;
          </p>
        </div>
      )}

      {/* Deadlock Reset Alert */}
      {timeoutResult && timeoutResult.type === 'DEADLOCK_RESET' && (
        <div
          data-testid="controller-timeout-alert"
          className="w-full p-3 rounded-xl text-xs sm:text-sm font-bold border animate-bounce bg-red-950/80 border-red-500 text-red-200"
        >
          <span>{t.mainGame.deadlockReset}</span>
        </div>
      )}

      {/* Buzzer Rejection Warning */}
      {buzzerRejected && (
        <div
          data-testid="buzzer-rejected-alert"
          className="w-full p-2.5 rounded-xl bg-red-950/80 border border-red-500/80 text-xs font-bold text-red-300 animate-shake"
        >
          {buzzerRejected.reason === 'BUZZER_LOCKED'
            ? t.mainGame.buzzerLockedOpponentFirst
            : buzzerRejected.reason === 'NOT_A_CONTENDER'
              ? t.mainGame.spectatorRoundNotice
              : t.mainGame.buzzerRejected}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5-SECOND READY COUNTDOWN BEFORE GAME STARTS */}
      {/* ===================================================================== */}
      {readyCountdown !== null && (
        <div
          data-testid="face-off-ready-countdown"
          className="w-full flex-1 min-h-[260px] flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-900/90 border-2 border-feud-gold/60 text-center gap-4 animate-pulse my-auto"
        >
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-feud-gold/20 border border-feud-gold/40 text-feud-gold text-xs font-bold uppercase tracking-wider">
            <Clock className="w-4 h-4 animate-spin" />
            <span>{t.mainGame.bothReady}</span>
          </div>
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-feud-gold flex flex-col items-center justify-center bg-slate-950/80 shadow-[0_0_35px_rgba(234,179,8,0.4)]">
            <span
              data-testid="face-off-ready-seconds"
              className="text-5xl sm:text-6xl font-black text-feud-gold tracking-tight"
            >
              {readyCountdown}
            </span>
            <span className="text-[10px] font-black uppercase text-amber-300 tracking-wider">
              {t.mainGame.startsIn}
            </span>
          </div>
          <p className="text-base sm:text-lg font-extrabold text-white">
            {t.mainGame.gameStartsIn.replace('{seconds}', String(readyCountdown))}
          </p>
          <p className="text-xs text-slate-400">
            {isContender ? t.mainGame.readyForFaceOff : t.mainGame.spectatorRoundNotice}
          </p>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 1: AWAITING READY */}
      {/* ===================================================================== */}
      {snapshot.phase === 'AWAITING_READY' && readyCountdown === null && (
        <div className="w-full flex flex-col items-center gap-4">
          {isContender ? (
            myContender?.isReady ? (
              /* Contender Already Ready */
              <div
                data-testid="face-off-waiting-badge"
                className="w-full p-6 rounded-2xl bg-slate-900/90 border border-green-500/40 flex flex-col items-center gap-3 animate-pulse"
              >
                <div className="w-12 h-12 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-extrabold text-white">
                  {t.mainGame.imReady}
                </h3>
                <p className="text-xs text-slate-300">
                  {t.mainGame.waitingForOpponent.replace(
                    '{opponent}',
                    opponentContender?.nickname || 'opponent'
                  )}
                </p>
              </div>
            ) : (
              /* Contender Needs to Click "I'm Ready!" */
              <div className="w-full flex flex-col items-center gap-3">
                <p className="text-sm text-slate-300">
                  {t.mainGame.designatedContenderNotice}
                </p>
                <button
                  type="button"
                  data-testid="face-off-ready-btn"
                  disabled={isPaused}
                  onClick={() => {
                    if (!isPaused && onReady) onReady();
                  }}
                  className="w-full touch-target min-h-touch py-4 px-6 rounded-2xl bg-gradient-to-r from-feud-gold via-yellow-400 to-feud-gold-light text-slate-950 font-black text-lg uppercase tracking-wider shadow-[0_0_25px_rgba(234,179,8,0.4)] hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t.mainGame.imReady}
                </button>
              </div>
            )
          ) : (
            /* Spectator View during Awaiting Ready */
            <div
              data-testid="face-off-spectator-badge"
              className="w-full p-6 rounded-2xl bg-slate-900/80 border border-slate-700/80 flex flex-col items-center gap-2"
            >
              <Users className="w-8 h-8 text-blue-400 mb-1" />
              <h3 className="text-sm font-bold text-slate-200">
                {t.mainGame.spectatorCheer}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Contenders: <span className="font-bold text-white">{c1?.nickname}</span> ({t.mainGame.team1}) vs{' '}
                <span className="font-bold text-white">{c2?.nickname}</span> ({t.mainGame.team2})
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 2: BUZZER ACTIVE */}
      {/* ===================================================================== */}
      {snapshot.phase === 'BUZZER_ACTIVE' && readyCountdown === null && (
        <div className="w-full flex flex-col items-center gap-4">
          {isContender ? (
            /* Giant Mobile Tactile Buzzer Button (US-22 Scenarios 2 & 3) */
            <div
              data-testid="face-off-buzzer-zone"
              className="w-full flex-1 min-h-[260px] flex flex-col items-center justify-center gap-2 my-1"
            >
              <button
                type="button"
                data-testid="face-off-buzzer-btn"
                disabled={isPaused}
                onTouchStart={() => {
                  if (!isPaused) {
                    lastBuzzHapticAtRef.current = Date.now();
                    triggerHaptic('buzz');
                  }
                }}
                onClick={() => {
                  if (!isPaused) {
                    if (Date.now() - lastBuzzHapticAtRef.current > 400) {
                      triggerHaptic('buzz');
                    }
                    if (onBuzz) onBuzz();
                  }
                }}
                className="w-56 h-56 max-w-[75vw] max-h-[75vw] min-w-touch min-h-touch touch-target touch-manipulation rounded-full bg-gradient-to-b from-red-500 via-feud-red to-red-800 border-8 border-yellow-400 shadow-[0_0_40px_rgba(239,68,68,0.6)] text-white font-black text-2xl sm:text-3xl uppercase tracking-widest flex flex-col items-center justify-center gap-1.5 transform active:scale-90 hover:brightness-110 transition-all cursor-pointer select-none animate-pulse disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap className="w-9 h-9 text-yellow-300" />
                <span>{t.mainGame.buzzerBtn}</span>
              </button>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                Tap to Buzz In First!
              </span>
            </div>
          ) : (
            /* Spectator View while Buzzers Active */
            <div
              data-testid="face-off-spectator-view"
              className="w-full p-6 rounded-2xl bg-slate-900/80 border border-blue-500/30 flex flex-col items-center gap-2"
            >
              <Zap className="w-8 h-8 text-yellow-400 animate-bounce mb-1" />
              <h3 className="text-sm font-bold text-white">
                Buzzers are active!
              </h3>
              <p className="text-xs text-slate-400">
                Cheer on your contender as they duel on the buzzer!
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 3: ANSWERING / BUZZER LOCKED */}
      {/* ===================================================================== */}
      {snapshot.phase !== 'AWAITING_READY' &&
        snapshot.phase !== 'OPPONENT_GUESS' &&
        snapshot.phase !== 'PASS_OR_PLAY' &&
        snapshot.phase !== 'ROUND_CONTROL_ASSIGNED' &&
        snapshot.phase !== 'DEADLOCK_RESET' &&
        snapshot.phase !== 'RESOLVED' &&
        (snapshot.phase === 'ANSWERING' || isBuzzerLocked) && (
          <div className="w-full flex flex-col items-center gap-4">
            {/* Winner Banner: ONLY shown before the initial buzzer winner answers! */}
            {!hasInitialBuzzerAnswered && (
              <div
                data-testid="controller-winner-banner"
                className="w-full p-3 rounded-2xl bg-gradient-to-r from-yellow-500/20 via-feud-gold/30 to-yellow-500/20 border border-feud-gold/50 flex items-center justify-center gap-2 text-sm font-black text-feud-gold uppercase tracking-wider"
              >
                <Award className="w-5 h-5 text-feud-gold" />
                <span>
                  {isBuzzerWinner
                    ? t.mainGame.youBuzzedFirst
                    : t.mainGame.buzzerWinner.replace('{name}', activeWinnerName)}
                </span>
              </div>
            )}

            {/* Active 15-Second Authoritative Countdown Ring */}
            <div
              data-testid="controller-timer-ring"
              className={`${isKeyboardOpen ? 'w-14 h-14' : 'w-24 h-24'
                } rounded-full flex flex-col items-center justify-center border-4 shadow-xl transition-all ${currentSeconds <= 5
                  ? 'border-red-500 bg-red-950/40 text-red-400 animate-pulse'
                  : 'border-feud-gold bg-slate-900/90 text-feud-gold'
                }`}
            >
              <span
                data-testid="controller-seconds-remaining"
                className={`${isKeyboardOpen ? 'text-xl' : 'text-3xl'} font-black`}
              >
                {currentSeconds}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Seconds
              </span>
            </div>

          {/* ACTIVE RESPONDENT: Answer Input Field Form */}
          {isRespondent ? (
            hasSubmitted ? (
              /* Already Submitted Answer (visually hidden on mobile screen view) */
              <div
                data-testid="controller-submitted-card"
                className="sr-only"
              >
                <span>Answer Submitted</span>
                <p>&ldquo;{answerInput}&rdquo;</p>
              </div>
            ) : (
              /* Input Form with 15s Timer */
              <form
                ref={formAnchorRef}
                onSubmit={handleSubmit}
                data-testid="face-off-answer-form"
                className={`w-full flex flex-col ${isKeyboardOpen ? 'gap-2 sticky bottom-0 z-10' : 'gap-3'
                  }`}
              >
                <label
                  htmlFor="face-off-answer-input"
                  className="text-xs font-bold text-feud-gold uppercase tracking-wider text-left block"
                >
                  {t.mainGame.answeringTurn.replace('{name}', activeWinnerName)}
                </label>
                <input
                  id="face-off-answer-input"
                  ref={inputRef}
                  type="text"
                  inputMode="text"
                  enterKeyHint="send"
                  data-testid="face-off-answer-input"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  onFocus={() => keepElementVisible(formAnchorRef.current)}
                  placeholder={t.mainGame.faceOffInputPlaceholder}
                  maxLength={60}
                  autoComplete="off"
                  disabled={isPaused}
                  className="w-full min-h-touch px-4 py-3.5 rounded-2xl bg-slate-900 border-2 border-feud-gold/70 text-white font-extrabold text-lg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-feud-gold disabled:opacity-50"
                />
                <button
                  type="submit"
                  data-testid="face-off-submit-btn"
                  disabled={isPaused || !answerInput.trim()}
                  className="w-full touch-target min-h-touch py-3.5 rounded-2xl bg-gradient-to-r from-feud-gold to-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black text-base uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
                >
                  <Send className="w-4 h-4" />
                  <span>{t.mainGame.submitAnswer}</span>
                </button>
              </form>
            )
          ) : isLockedOut ? (
            /* OPPONENT LOCKED OUT */
            <div
              data-testid="face-off-lockout-card"
              className="w-full p-6 rounded-2xl bg-red-950/60 border border-red-500/60 flex flex-col items-center gap-2 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <span className="text-sm font-black text-red-400 uppercase tracking-wider">
                {t.mainGame.buzzerLocked}
              </span>
              <p className="text-xs text-slate-300 max-w-xs mt-1">
                {t.mainGame.answeringTurn.replace('{name}', activeWinnerName)}. If they time out, floor cascades to you!
              </p>
            </div>
          ) : (
            /* SPECTATOR VIEW DURING ANSWERING */
            <div className="w-full p-4 rounded-2xl bg-slate-900/80 border border-slate-700 text-center text-xs text-slate-300">
              <span className="font-bold text-white">{activeWinnerName}</span> has the floor to answer ({currentSeconds}s remaining).
            </div>
          )}
          </div>
        )}

      {/* ===================================================================== */}
      {/* US-28: SUSPENSE BANNER WHILE HOST READS ANSWER BEFORE REVEAL */}
      {/* ===================================================================== */}
      {activeAnnouncement && snapshot.phase !== 'AWAITING_READY' && (
        <div
          data-testid="controller-survey-said-banner"
          className="w-full p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-yellow-500/20 via-feud-gold/30 to-yellow-500/20 border-2 border-feud-gold/70 shadow-[0_0_25px_rgba(234,179,8,0.3)] flex flex-col items-center justify-center gap-2 text-center animate-pulse"
        >
          <Sparkles className="w-6 h-6 text-feud-gold animate-bounce" />
          <p className="text-sm sm:text-base font-black text-white">
            {activeAnnouncement.player} said &ldquo;{activeAnnouncement.answer}&rdquo;...
          </p>
          <span className="text-xs sm:text-sm font-extrabold text-feud-gold uppercase tracking-widest">
            Survey said...
          </span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 3.5: OPPONENT_GUESS (US-13 Scenarios 2 & 4) */}
      {/* ===================================================================== */}
      {snapshot.phase === 'OPPONENT_GUESS' && (
        <div className="w-full flex flex-col items-center gap-4 animate-fadeIn">
          {/* Opponent Challenge Alert */}
          {!activeAnnouncement && (
            <div
              data-testid="controller-opponent-challenge-banner"
              className="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-950/90 via-slate-900 to-blue-950/90 border-2 border-blue-400/70 text-center shadow-lg"
            >
              <div className="flex items-center justify-center gap-2 text-amber-300 font-extrabold text-sm sm:text-base">
                <Flame className="w-5 h-5 text-amber-400 animate-bounce" />
                <span>
                  {snapshot.firstGuessResult?.isMatched && snapshot.firstGuessResult.points > 0
                    ? t.mainGame.canYouBeat
                      .replace('{answer}', snapshot.firstGuessResult.rawAnswer)
                      .replace('{points}', String(snapshot.firstGuessResult.points))
                    : isMissedPlayer
                      ? t.mainGame.youMissedChance
                      : t.mainGame.opponentChance.replace(
                        '{contender}',
                        snapshot.firstGuessResult?.playerNickname || c1?.nickname || 'Contender'
                      )}
                </span>
              </div>
            </div>
          )}

          {/* 15-Second Countdown Ring */}
          <div
            data-testid="controller-timer-ring"
            className={`${isKeyboardOpen ? 'w-14 h-14' : 'w-24 h-24'
              } rounded-full flex flex-col items-center justify-center border-4 shadow-xl transition-all ${currentSeconds <= 5
                ? 'border-red-500 bg-red-950/40 text-red-400 animate-pulse'
                : 'border-blue-400 bg-slate-900/90 text-blue-300'
              }`}
          >
            <span
              data-testid="controller-seconds-remaining"
              className={`${isKeyboardOpen ? 'text-xl' : 'text-3xl'} font-black`}
            >
              {currentSeconds}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
              Seconds
            </span>
          </div>

          {/* ACTIVE RESPONDENT (Opponent Contender) */}
          {isRespondent ? (
            hasSubmitted ? (
              /* Already Submitted Answer (visually hidden on mobile screen view) */
              <div
                data-testid="controller-submitted-card"
                className="sr-only"
              >
                <span>Answer Submitted</span>
                <p>&ldquo;{answerInput}&rdquo;</p>
              </div>
            ) : (
              <form
                ref={formAnchorRef}
                onSubmit={handleSubmit}
                data-testid="face-off-answer-form"
                className={`w-full flex flex-col ${isKeyboardOpen ? 'gap-2 sticky bottom-0 z-10' : 'gap-3'
                  }`}
              >
                <label
                  htmlFor="face-off-answer-input"
                  className="text-xs font-bold text-blue-300 uppercase tracking-wider text-left block"
                >
                  Your Turn to Answer & Beat the Score!
                </label>
                <input
                  id="face-off-answer-input"
                  ref={inputRef}
                  type="text"
                  inputMode="text"
                  enterKeyHint="send"
                  data-testid="face-off-answer-input"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  onFocus={() => keepElementVisible(formAnchorRef.current)}
                  placeholder={t.mainGame.faceOffInputPlaceholder}
                  maxLength={60}
                  autoComplete="off"
                  disabled={isPaused}
                  className="w-full min-h-touch px-4 py-3.5 rounded-2xl bg-slate-900 border-2 border-blue-400/70 text-white font-extrabold text-lg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                />
                <button
                  type="submit"
                  data-testid="face-off-submit-btn"
                  disabled={isPaused || !answerInput.trim()}
                  className="w-full touch-target min-h-touch py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-base uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
                >
                  <Send className="w-4 h-4" />
                  <span>{t.mainGame.submitAnswer}</span>
                </button>
              </form>
            )
          ) : (
            /* NON-ACTIVE RESPONDENT WAITING */
            <div
              data-testid="opponent-turn-waiting-card"
              className="w-full p-4 rounded-2xl bg-slate-900/80 border border-slate-700 text-center text-xs text-slate-300"
            >
              <Clock className="w-6 h-6 text-blue-400 mx-auto mb-1 animate-spin" />
              <p>{respondentPlayerName} ({respondentTeamName}) is answering to steal control ({currentSeconds}s remaining)...</p>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 4: PASS OR PLAY (US-13 Scenarios 1, 3, 4) */}
      {/* ===================================================================== */}
      {snapshot.phase === 'PASS_OR_PLAY' && !activeAnnouncement && (
        <div className="w-full flex flex-col items-center gap-5 animate-fadeIn">
          {isFaceOffWinner ? (
            /* WINNER: Pass or Play Decision Modal / Buttons */
            <div
              data-testid="face-off-pass-play-modal"
              className="w-full p-6 rounded-3xl bg-gradient-to-b from-yellow-500/20 via-slate-900 to-slate-950 border-2 border-feud-gold shadow-[0_0_35px_rgba(234,179,8,0.35)] flex flex-col items-center gap-4"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-feud-gold animate-bounce" />
                <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider">
                  {t.mainGame.passOrPlayTitle}
                </h2>
                <Sparkles className="w-6 h-6 text-feud-gold animate-bounce" />
              </div>

              {(snapshot.firstGuessResult?.isNumberOneAnswer ||
                snapshot.secondGuessResult?.isNumberOneAnswer) && (
                  <span
                    data-testid="number-one-badge"
                    className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-yellow-300 bg-yellow-500/20 px-3 py-1 rounded-full border border-yellow-400/50"
                  >
                    <Award className="w-4 h-4" />
                    {t.mainGame.numberOneAnswerFound || '#1 ANSWER!'}
                  </span>
                )}

              <p className="text-xs sm:text-sm text-slate-300 font-medium max-w-sm">
                {t.mainGame.passOrPlaySubtitle}
              </p>

              {/* Action Buttons: PLAY or PASS */}
              <div className="w-full grid grid-cols-2 gap-2 sm:gap-3 mt-2">
                <button
                  type="button"
                  data-testid="face-off-play-btn"
                  disabled={isPaused}
                  onClick={handleChoosePlay}
                  className="touch-target min-h-touch py-3 sm:py-4 px-2 sm:px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black text-base sm:text-xl uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.4)] flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white shrink-0" />
                    <span>{t.mainGame.playBtn}</span>
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-100 uppercase tracking-wider text-center leading-tight">
                    Your team plays
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="face-off-pass-btn"
                  disabled={isPaused}
                  onClick={handleChoosePass}
                  className="touch-target min-h-touch py-3 sm:py-4 px-2 sm:px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black text-base sm:text-xl uppercase tracking-wider shadow-[0_0_20px_rgba(245,158,11,0.4)] flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-950 shrink-0" />
                    <span>{t.mainGame.passBtn}</span>
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-bold text-slate-900 uppercase tracking-wider text-center leading-tight">
                    Pass to opponent
                  </span>
                </button>
              </div>
            </div>
          ) : (
            /* OPPONENT / SPECTATOR: Waiting for Winner Choice */
            <div
              data-testid="face-off-pass-play-spectator"
              className="w-full p-6 rounded-3xl bg-slate-900/90 border border-slate-700 flex flex-col items-center gap-3"
            >
              <Award className="w-10 h-10 text-feud-gold animate-bounce mb-1" />
              <h3 className="text-lg font-bold text-white">
                {t.mainGame.passOrPlayTitle}
              </h3>
              <p className="text-xs sm:text-sm text-yellow-200">
                {t.mainGame.waitingForWinnerChoice.replace('{winner}', faceOffWinnerName)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 5: ROUND_CONTROL_ASSIGNED (US-13 Scenarios 6 & 7) */}
      {/* ===================================================================== */}
      {snapshot.phase === 'ROUND_CONTROL_ASSIGNED' && (
        <div
          data-testid="controller-round-control-banner"
          className={`w-full p-5 rounded-3xl border-2 text-center shadow-2xl animate-fadeIn ${(snapshot.passOrPlayDecision || roundControlAssigned?.decision) === 'play'
            ? 'bg-gradient-to-r from-green-950/90 via-slate-900 to-green-950/90 border-green-400 shadow-[0_0_25px_rgba(34,197,94,0.35)]'
            : 'bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.35)]'
            }`}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Award className="w-6 h-6 text-feud-gold animate-bounce" />
            <h3 className="text-xl sm:text-2xl font-black text-white">
              {(snapshot.passOrPlayDecision || roundControlAssigned?.decision) === 'play'
                ? t.mainGame.teamChosePlay.replace('{team}', controllingTeamNum)
                : t.mainGame.controlPassesTo.replace('{team}', controllingTeamNum)}
            </h3>
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-300 mt-1">
            Starting Team Guessing Round...
          </p>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHASE 6: RESOLVED */}
      {/* ===================================================================== */}
      {snapshot.phase === 'RESOLVED' && (
        <div
          data-testid="controller-resolved-card"
          className="w-full p-5 rounded-2xl bg-slate-900/90 border border-feud-gold text-center animate-fadeIn"
        >
          <CheckCircle2 className="w-8 h-8 text-feud-gold mx-auto mb-2" />
          <h3 className="text-base font-extrabold text-white">
            Face-Off Turn Complete
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Host is verifying the answer on the survey board...
          </p>
        </div>
      )}

      {/* My Team Roster: Members of My Team in 2 Columns */}
      {myTeamPlayers && myTeamPlayers.length > 0 && (
        <div
          data-testid="face-off-my-team-roster"
          className={`${isKeyboardOpen ? 'hidden' : 'flex flex-col'
            } w-full mt-4 gap-2 transition-all`}
        >
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              {myTeamName} ({myTeamPlayers.length} Members)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {myTeamPlayers.map((player) => {
              const isMe =
                (currentPlayerId && player.id === currentPlayerId) ||
                player.nickname.toLowerCase() === trimmedNick;
              const isContender =
                (myContender?.id && myContender.id === player.id) ||
                myContender?.nickname.toLowerCase() === player.nickname.toLowerCase();

              return (
                <div
                  key={player.id}
                  data-testid={`face-off-team-player-${player.id}`}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs border transition-all ${isContender
                    ? 'bg-amber-500/25 border-amber-400/60 text-amber-200 font-extrabold shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                    : isMe
                      ? isTeam2
                        ? 'bg-emerald-600/30 border-emerald-400/50 text-white font-bold'
                        : 'bg-blue-600/30 border-blue-400/50 text-white font-bold'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300'
                    }`}
                >
                  <div className="flex items-center gap-1.5 truncate mr-1">
                    <span
                      className={`w-5 h-5 rounded-full font-black flex items-center justify-center text-[10px] shrink-0 ${isTeam2
                        ? 'bg-emerald-500/30 text-emerald-300'
                        : 'bg-blue-500/30 text-blue-300'
                        }`}
                    >
                      {player.battingOrder}
                    </span>
                    <span className="truncate font-bold">{player.nickname}</span>
                    {isMe && (
                      <span className="text-[9px] text-yellow-300 uppercase font-black shrink-0">
                        (You)
                      </span>
                    )}
                  </div>
                  {isContender && (
                    <span className="text-[9px] uppercase tracking-wider font-black text-amber-300 shrink-0">
                      Duel
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full-Screen Giant Strike Overlay for player who failed to answer */}
      {activeStrikeOverlay && (
        <div
          data-testid="mobile-strike-overlay"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-scale-up select-none pointer-events-none"
        >
          <span className="text-8xl sm:text-9xl font-black text-red-500 leading-none drop-shadow-[0_0_40px_rgba(239,68,68,0.9)] animate-pulse mb-3">
            X
          </span>
          {activeStrikeOverlay.message && (
            <div className="px-5 py-2 rounded-full bg-red-600/40 border border-red-500 text-white font-extrabold text-lg sm:text-xl uppercase tracking-wider shadow-lg">
              {activeStrikeOverlay.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
