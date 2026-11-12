import { MainGameScoreboardHeader } from './MainGameScoreboardHeader';
import { MainGameVictoryModal } from './MainGameVictoryModal';
import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  speakRoundWinner,
  speakPlayerAnswerSurveySaid,
  speakRevealAnswer,
  cancelSpeech,
  isTtsMuted,
  setTtsMuted,
} from '../utils/tts';
import {
  Tv,
  Clock,
  ArrowLeft,
  Flame,
  Volume2,
  VolumeX,
  Trophy,
  ShieldCheck,
  Play,
  Gavel,
  CheckCircle2,
  X,
  Maximize2,
  Minimize2,
  Pause,
  Award,
  Sparkles,
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
  audioEnabled?: boolean;
  roomCode: string;
  onLeave?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onTogglePause?: () => void;
  onAnswerRevealCompleted?: (roomCode: string) => void;
}

// 8-slot vertical counting layout on host TV board:
// Row 1: 1, 5 | Row 2: 2, 6 | Row 3: 3, 7 | Row 4: 4, 8
const HOST_SLOT_RANKS = [1, 5, 2, 6, 3, 7, 4, 8];

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
  audioEnabled: propAudioEnabled,
  roomCode,
  onLeave,
  isFullscreen: propsIsFullscreen,
  onToggleFullscreen,
  onTogglePause,
  onAnswerRevealCompleted,
}) => {
  const { t } = useTranslation();
  const internalFullscreen = useFullscreen({ enableShortcut: false });
  const isFullscreen = propsIsFullscreen ?? internalFullscreen.isFullscreen;
  const toggleFullscreen = onToggleFullscreen ?? internalFullscreen.toggleFullscreen;

  const [internalAudioEnabled, setInternalAudioEnabled] = useState<boolean>(() => !isTtsMuted());
  const audioEnabled = propAudioEnabled !== undefined ? propAudioEnabled : internalAudioEnabled;

  const handleToggleAudio = () => {
    const nextAudio = !audioEnabled;
    setInternalAudioEnabled(nextAudio);
    setTtsMuted(!nextAudio);
    if (!nextAudio) {
      cancelSpeech();
    }
  };

  const [surveySaidAnnouncement, setSurveySaidAnnouncement] = useState<{
    player: string;
    answer: string;
    rankOrder?: number;
  } | null>(null);
  const surveySaidAnnouncementRef = useRef(surveySaidAnnouncement);
  surveySaidAnnouncementRef.current = surveySaidAnnouncement;

  // Active full-screen strike animation overlay state
  const [activeStrikeOverlay, setActiveStrikeOverlay] = useState<{
    count: number;
    message?: string;
  } | null>(null);

  // Track strikes visually displayed on the board - delayed while survey said announcement is active
  const [displayedStrikes, setDisplayedStrikes] = useState<number>(snapshot.strikes);

  // A strike announcement is in progress if the banner is showing, overlay is showing, or a strike is pending reveal
  const isStrikeAnnouncementInProgress = Boolean(
    surveySaidAnnouncement ||
    activeStrikeOverlay ||
    (strikeIssued &&
      strikeIssued.strikeCount > 0 &&
      strikeIssued.rawAnswer &&
      !strikeIssued.isTimeout &&
      !strikeIssued.isPass &&
      displayedStrikes < strikeIssued.strikeCount)
  );

  // Fallback: if snapshot strikes increase without strikeIssued or after announcement finishes
  useEffect(() => {
    if (!strikeIssued && !isStrikeAnnouncementInProgress && snapshot.strikes > displayedStrikes) {
      setDisplayedStrikes(snapshot.strikes);
    }
  }, [snapshot.strikes, strikeIssued, isStrikeAnnouncementInProgress, displayedStrikes]);

  // Track previous active player to preserve guesser nickname on strike answer announcements
  const prevActivePlayerRef = useRef(snapshot.activePlayer);
  useEffect(() => {
    if (snapshot.activePlayer) {
      prevActivePlayerRef.current = snapshot.activePlayer;
    }
  }, [snapshot.activePlayer]);

  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  // Scenario 1, US-17 & US-28: After Pass or Play is chosen, read the question to each player who has to answer
  const lastSpokenPlayerTurn = useRef<string | null>(null);
  useEffect(() => {
    if (
      snapshot.phase === 'TEAM_GUESSING' &&
      snapshot.question?.questionText &&
      !isStrikeAnnouncementInProgress &&
      displayedStrikes === snapshot.strikes
    ) {
      const playerId = snapshot.activePlayer?.id || 'initial';
      const turnKey = `${snapshot.question.id}-${playerId}-${displayedStrikes}-${snapshot.revealedAnswers.length}`;
      if (lastSpokenPlayerTurn.current !== turnKey) {
        lastSpokenPlayerTurn.current = turnKey;
        if (audioEnabled) {
          speakQuestion(snapshot.question.questionText, language);
        }
      }
    }
  }, [
    snapshot.phase,
    snapshot.question?.id,
    snapshot.question?.questionText,
    snapshot.activePlayer?.id,
    snapshot.strikes,
    displayedStrikes,
    snapshot.revealedAnswers.length,
    isStrikeAnnouncementInProgress,
    language,
    audioEnabled,
  ]);

  // Steal phase: speak question for the steal spokesperson
  const hasSpokenStealQuestion = useRef<boolean>(false);
  useEffect(() => {
    if (
      (snapshot.phase === 'STEAL_PHASE' || Boolean(transitionStealPhase)) &&
      snapshot.question?.questionText &&
      !hasSpokenStealQuestion.current &&
      !isStrikeAnnouncementInProgress
    ) {
      hasSpokenStealQuestion.current = true;
      if (audioEnabled) {
        const timer = setTimeout(() => {
          speakQuestion(snapshot.question.questionText, language);
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [
    snapshot.phase,
    transitionStealPhase,
    snapshot.question?.questionText,
    language,
    audioEnabled,
    isStrikeAnnouncementInProgress,
  ]);

  // Scenario 2: Cancel host reading on rapid guess submission or reveal (US-17 Scenario 2)
  const prevRevealedCountRef = useRef<number>(snapshot.revealedAnswers.length);
  useEffect(() => {
    if (snapshot.revealedAnswers.length > prevRevealedCountRef.current) {
      prevRevealedCountRef.current = snapshot.revealedAnswers.length;
      if (!surveySaidAnnouncementRef.current) {
        cancelSpeech();
      }
    }
  }, [snapshot.revealedAnswers.length]);

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
      setDisplayedStrikes(snapshot.strikes);
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
  const handledStrikesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (strikeIssued && strikeIssued.strikeCount > 0) {
      const strikeKey = `${strikeIssued.strikeCount}-${strikeIssued.team || ''}-${strikeIssued.rawAnswer || ''}-${strikeIssued.player?.id || ''}`;
      if (handledStrikesRef.current.has(strikeKey)) return;
      handledStrikesRef.current.add(strikeKey);

      lastHandledStrikeTimestamp.current = Date.now();

      const showStrikeOverlayAndBuzzer = () => {
        setDisplayedStrikes(strikeIssued.strikeCount);
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
      };

      if (strikeIssued.rawAnswer && !strikeIssued.isTimeout && !strikeIssued.isPass) {
        cancelSpeech();

        const player =
          strikeIssued.player?.nickname ||
          prevActivePlayerRef.current?.nickname ||
          snapshot.activePlayer?.nickname ||
          t.mainGame.contender ||
          'Player';
        const answer = strikeIssued.rawAnswer;

        setSurveySaidAnnouncement({ player, answer });

        const onRevealStrike = () => {
          setSurveySaidAnnouncement(null);
          showStrikeOverlayAndBuzzer();
          if (onAnswerRevealCompleted) {
            onAnswerRevealCompleted(roomCode);
          }
        };

        if (audioEnabled) {
          speakPlayerAnswerSurveySaid(player, answer, language, onRevealStrike);
        } else {
          const timer = setTimeout(onRevealStrike, 600);
          return () => clearTimeout(timer);
        }
      } else {
        showStrikeOverlayAndBuzzer();
      }
    }
  }, [
    strikeIssued,
    audioEnabled,
    language,
    snapshot.activePlayer?.nickname,
    t.mainGame.contender,
    t.mainGame.duplicateAnswerWarning,
    t.mainGame.notOnBoard,
    onAnswerRevealCompleted,
    roomCode,
  ]);

  // Scenario 1: Trigger Chime SFX when new cards are revealed directly in snapshot (without boardReveal prop)
  useEffect(() => {
    if (!boardReveal && snapshot.revealedAnswers.length > lastRevealedAnswerCount.current) {
      lastRevealedAnswerCount.current = snapshot.revealedAnswers.length;
      playCorrectDing();
      const chimeTimer = setTimeout(() => {
        playPointsChime();
      }, 350);
      return () => clearTimeout(chimeTimer);
    }
  }, [snapshot.revealedAnswers.length, boardReveal]);

  // US-28: Announce "{Player} said {Answer}, survey said..." before revealing answer on boardReveal
  const handledBoardRevealsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!boardReveal || !boardReveal.rankOrder) return;
    const revealKey = `${boardReveal.rankOrder}-${boardReveal.rawAnswer || boardReveal.answerText}-${boardReveal.points}`;
    if (handledBoardRevealsRef.current.has(revealKey)) return;
    handledBoardRevealsRef.current.add(revealKey);

    lastRevealedAnswerCount.current = Math.max(
      lastRevealedAnswerCount.current,
      snapshot.revealedAnswers.length
    );

    // If remaining reveal (e.g. end of round reveals), reveal immediately without announcement
    if (boardReveal.isRemainingReveal) {
      playCorrectDing();
      return;
    }

    cancelSpeech();

    const player =
      boardReveal.playerNickname ||
      snapshot.activePlayer?.nickname ||
      t.mainGame.contender ||
      'Player';
    const answer = boardReveal.rawAnswer || boardReveal.answerText;

    setSurveySaidAnnouncement({
      player,
      answer,
      rankOrder: boardReveal.rankOrder,
    });

    const onReveal = () => {
      setSurveySaidAnnouncement(null);
      playCorrectDing();
      const chimeTimer = setTimeout(() => {
        playPointsChime();
      }, 350);
      if (onAnswerRevealCompleted) {
        onAnswerRevealCompleted(roomCode);
      }
      return () => clearTimeout(chimeTimer);
    };

    if (audioEnabled) {
      speakPlayerAnswerSurveySaid(player, answer, language, onReveal);
    } else {
      const timer = setTimeout(onReveal, 600);
      return () => clearTimeout(timer);
    }
  }, [
    boardReveal,
    audioEnabled,
    language,
    snapshot.activePlayer?.nickname,
    t.mainGame.contender,
    snapshot.revealedAnswers.length,
    onAnswerRevealCompleted,
    roomCode,
  ]);

  // Scenario 4: Steal Phase trigger announcement
  useEffect(() => {
    if (
      (transitionStealPhase || snapshot.phase === 'STEAL_PHASE') &&
      !hasAnnouncedSteal.current &&
      !isStrikeAnnouncementInProgress
    ) {
      hasAnnouncedSteal.current = true;
      if (audioEnabled) { cancelSpeech(); speakStealPhase(opposingTeamName, language); }
    }
  }, [
    transitionStealPhase,
    snapshot.phase,
    opposingTeamName,
    language,
    isStrikeAnnouncementInProgress,
    audioEnabled,
  ]);

  const isStealSuccess = Boolean(
    stealResolved?.success ||
      (snapshot.phase === 'RESOLVED' && snapshot.winningTeam === snapshot.opposingTeam)
  );

  const isBoardCleared = Boolean(
    roundCleared || snapshot.phase === 'ROUND_CLEARED'
  );

  const isRoundOver = Boolean(
    stealResolved ||
      roundWinner ||
      isBoardCleared ||
      (snapshot.phase === 'RESOLVED' && Boolean(snapshot.winningTeam))
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

  type RoundOverStage = 'IDLE' | 'ANNOUNCING' | 'REVEALING' | 'COUNTDOWN' | 'COMPLETED';
  const [roundOverStage, setRoundOverStage] = useState<RoundOverStage>('IDLE');
  const [revealedRemainingRanks, setRevealedRemainingRanks] = useState<Set<number>>(new Set());
  const [nextRoundCountdown, setNextRoundCountdown] = useState<number>(5);

  const onNextRoundRef = useRef(onNextRound);
  useEffect(() => {
    onNextRoundRef.current = onNextRound;
  }, [onNextRound]);

  const announcementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasStartedRevealsRef = useRef<boolean>(false);

  // Helper to collect unread answers sorted from smallest to largest by points
  const getUnreadAnswers = useCallback(() => {
    const alreadyRevealedRanks = new Set<number>();
    snapshot.revealedAnswers.forEach((a) => alreadyRevealedRanks.add(a.rankOrder));
    if (stealResolved?.matchedAnswer) {
      alreadyRevealedRanks.add(stealResolved.matchedAnswer.rankOrder);
    }

    const candidateList: Array<{ id?: string; rankOrder: number; answerText: string; points: number }> = [];

    if (stealResolved?.remainingAnswers && stealResolved.remainingAnswers.length > 0) {
      stealResolved.remainingAnswers.forEach((a) => {
        if (!alreadyRevealedRanks.has(a.rankOrder)) {
          candidateList.push(a);
        }
      });
    }
    if (snapshot.question.answers && snapshot.question.answers.length > 0) {
      snapshot.question.answers.forEach((a) => {
        if (!alreadyRevealedRanks.has(a.rankOrder)) {
          candidateList.push(a);
        }
      });
    }

    const uniqueMap = new Map<number, { id?: string; rankOrder: number; answerText: string; points: number }>();
    candidateList.forEach((a) => {
      if (!uniqueMap.has(a.rankOrder)) {
        uniqueMap.set(a.rankOrder, a);
      }
    });

    // Smallest to largest by points (secondary sort by rankOrder descending)
    return Array.from(uniqueMap.values()).sort((a, b) => {
      if (a.points !== b.points) {
        return a.points - b.points;
      }
      return b.rankOrder - a.rankOrder;
    });
  }, [snapshot.revealedAnswers, snapshot.question.answers, stealResolved]);

  const isRoundOverHandledRef = useRef<boolean>(false);

  // Reset round over sequencer when round changes
  const currentRoundKey = `${snapshot.gameId || 'game'}-${snapshot.roundNumber}-${snapshot.question.id}`;
  const prevRoundKeyRef = useRef<string>(currentRoundKey);

  useEffect(() => {
    if (prevRoundKeyRef.current !== currentRoundKey) {
      prevRoundKeyRef.current = currentRoundKey;
      isRoundOverHandledRef.current = false;
      hasCelebratedClear.current = false;
      hasCelebratedStealSuccess.current = false;
      hasAnnouncedStealFailed.current = false;
      hasStartedRevealsRef.current = false;
      if (announcementTimerRef.current) clearTimeout(announcementTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setRoundOverStage('IDLE');
      setRevealedRemainingRanks(new Set());
      setNextRoundCountdown(5);
    }
  }, [currentRoundKey]);

  useEffect(() => {
    return () => {
      if (announcementTimerRef.current) clearTimeout(announcementTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // Start 5-second countdown to next round
  const startNextRoundCountdown = useCallback(() => {
    setRoundOverStage('COUNTDOWN');
    setNextRoundCountdown(5);

    let remaining = 5;
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        setNextRoundCountdown(0);
        setRoundOverStage('COMPLETED');
        if (!matchOver && !suddenDeathInitiated && onNextRoundRef.current) {
          onNextRoundRef.current();
        }
      } else {
        setNextRoundCountdown(remaining);
      }
    }, 1000);
  }, [matchOver, suddenDeathInitiated]);

  // Start sequential reveal of unread answers from smallest to largest
  const startUnreadReveals = useCallback(() => {
    if (hasStartedRevealsRef.current) return;
    hasStartedRevealsRef.current = true;
    setRoundOverStage('REVEALING');

    const unread = getUnreadAnswers();

    if (unread.length === 0) {
      startNextRoundCountdown();
      return;
    }

    let idx = 0;
    const revealStep = () => {
      if (idx < unread.length) {
        const nextAns = unread[idx];
        setRevealedRemainingRanks((prev) => new Set([...prev, nextAns.rankOrder]));
        playPointsChime();
        idx += 1;

        let hasMovedNext = false;
        const onDone = () => {
          if (hasMovedNext) return;
          hasMovedNext = true;
          if (revealTimerRef.current) {
            clearTimeout(revealTimerRef.current);
            revealTimerRef.current = null;
          }
          if (idx < unread.length) {
            revealTimerRef.current = setTimeout(revealStep, 1000);
          } else {
            revealTimerRef.current = setTimeout(() => {
              startNextRoundCountdown();
            }, 800);
          }
        };

        if (audioEnabled) {
          speakRevealAnswer(nextAns.rankOrder, nextAns.answerText, language, onDone);
          // Safety timeout in case TTS speech is delayed or doesn't fire onend
          revealTimerRef.current = setTimeout(onDone, 3500);
        } else {
          revealTimerRef.current = setTimeout(onDone, 1000);
        }
      }
    };

    revealStep();
  }, [getUnreadAnswers, startNextRoundCountdown, audioEnabled, language]);

  // Round over orchestration: Announce result -> Reveal unread answers -> 5s Countdown -> Next Round
  useEffect(() => {
    if (!isRoundOver || isRoundOverHandledRef.current) return;
    isRoundOverHandledRef.current = true;

    setRoundOverStage('ANNOUNCING');

    if (stealResolved) {
      if (stealResolved.success) {
        if (!hasCelebratedStealSuccess.current) {
          hasCelebratedStealSuccess.current = true;
          playVictoryFanfare();
          if (audioEnabled) { cancelSpeech(); }
          speakStealSuccess(
            opposingTeamName,
            stealResolved.pointsAwarded || snapshot.roundBank,
            language
          );
        }
      } else {
        if (!hasAnnouncedStealFailed.current) {
          hasAnnouncedStealFailed.current = true;
          playStrikeBuzzer(1);
          if (audioEnabled) { cancelSpeech(); }
          speakStealFailed(
            controllingTeamName,
            stealResolved.pointsAwarded || snapshot.roundBank,
            language
          );
        }
      }
    } else if (isBoardCleared) {
      if (!hasCelebratedClear.current) {
        hasCelebratedClear.current = true;
        playVictoryFanfare();
        if (audioEnabled) { cancelSpeech(); }
        speakBoardCleared(controllingTeamName, language);
      }
    } else if (roundWinner || (snapshot.phase === 'RESOLVED' && snapshot.winningTeam)) {
      playVictoryFanfare();
      if (audioEnabled) { cancelSpeech(); }
      speakRoundWinner(winningTeamName, resolvedPoints, language);
    }

    // Safety timeout to allow result announcement to play before starting unread reveals
    announcementTimerRef.current = setTimeout(() => {
      startUnreadReveals();
    }, audioEnabled ? 2200 : 1000);
  }, [
    isRoundOver,
    stealResolved,
    isBoardCleared,
    roundWinner,
    opposingTeamName,
    controllingTeamName,
    winningTeamName,
    resolvedPoints,
    snapshot.roundBank,
    snapshot.phase,
    snapshot.winningTeam,
    language,
    audioEnabled,
    startUnreadReveals,
  ]);

  const handleManualNextRound = useCallback(() => {
    if (announcementTimerRef.current) clearTimeout(announcementTimerRef.current);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    cancelSpeech();
    setRoundOverStage('COMPLETED');
    if (onNextRound) {
      onNextRound();
    }
  }, [onNextRound]);

  // Combine revealed answers from snapshot, boardReveal, and steal resolution
  const revealedMap = new Map<number, TeamRevealedAnswer>();
  snapshot.revealedAnswers.forEach((a) => {
    if (surveySaidAnnouncement?.rankOrder === a.rankOrder) return;
    revealedMap.set(a.rankOrder, a);
  });

  if (boardReveal && boardReveal.rankOrder) {
    if (surveySaidAnnouncement?.rankOrder !== boardReveal.rankOrder && !revealedMap.has(boardReveal.rankOrder)) {
      if (!boardReveal.isRemainingReveal || revealedRemainingRanks.has(boardReveal.rankOrder)) {
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
        if (revealedRemainingRanks.has(rem.rankOrder) && !revealedMap.has(rem.rankOrder)) {
          revealedMap.set(rem.rankOrder, {
            ...rem,
            isRemainingReveal: true,
          });
        }
      });
    }
  }

  if (snapshot.question.answers) {
    snapshot.question.answers.forEach((ans) => {
      if (revealedRemainingRanks.has(ans.rankOrder) && !revealedMap.has(ans.rankOrder)) {
        revealedMap.set(ans.rankOrder, {
          id: ans.id,
          rankOrder: ans.rankOrder,
          answerText: ans.answerText,
          points: ans.points,
          isRemainingReveal: true,
        });
      }
    });
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

  // Total survey answer count for card grid
  const totalAnswers = Math.max(
    snapshot.totalAnswersCount || 0,
    snapshot.question.answerCount || 0,
    snapshot.question.answers?.length || 0,
    revealedMap.size,
    overrideOptionMap.size
  );


  const isTeam1Controlling = snapshot.controllingTeam === 'TEAM_1';
  const isTeam1Stealing = isStealPhase && snapshot.opposingTeam === 'TEAM_1';
  const isTeam2Stealing = isStealPhase && snapshot.opposingTeam === 'TEAM_2';

  const isTeam1Answering = (!isStealPhase && isTeam1Controlling) || isTeam1Stealing;
  const isTeam2Answering = (!isStealPhase && !isTeam1Controlling) || isTeam2Stealing;

  const stealSpokespersonPlayer =
    snapshot.stealSpokesperson ||
    spokesperson ||
    snapshot.opposingTeamPlayers?.find((p) => p.id === snapshot.stealSpokespersonId) ||
    snapshot.opposingTeamPlayers?.[0] ||
    null;

  const team1Player = isTeam1Controlling
    ? snapshot.activePlayer || snapshot.controllingTeamPlayers?.[0] || null
    : stealSpokespersonPlayer || snapshot.opposingTeamPlayers?.[0] || null;

  const team2Player = !isTeam1Controlling
    ? snapshot.activePlayer || snapshot.controllingTeamPlayers?.[0] || null
    : stealSpokespersonPlayer || snapshot.opposingTeamPlayers?.[0] || null;

  return (
    <div
      className="w-full h-full max-h-full max-w-6xl xl:max-w-7xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] 2xl:px-10 flex flex-col justify-between items-center overflow-hidden animate-fadeIn"
      data-testid="main-game-team-guessing-board"
    >
      {/* Dynamic Background Glow */}
      <div className="absolute inset-0 bg-radial-gradient from-blue-900/20 via-transparent to-transparent pointer-events-none" />

      {/* 1. Header Bar with Controls on the Top */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-xl sm:rounded-2xl p-2.5 sm:p-3 2xl:p-4 shadow-xl shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 sm:gap-2.5">
            {onLeave && (
              <button
                onClick={() => {
                  cancelSpeech();
                  onLeave();
                }}
                className="p-1.5 sm:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title={t.mainGame.leaveRoomBtn}
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
            <div className="p-1.5 sm:p-2 rounded-xl bg-feud-gold/20 border border-feud-gold/40 text-feud-gold">
              <Tv className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-feud-gold px-2.5 py-0.5 rounded-full bg-feud-gold/10 border border-feud-gold/20">
                  Host Board
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
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isPaused
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
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
              ) : (
                <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Persistent Grand Total Header (US-16 Scenario 1 & 2) */}
      <div className="w-full shrink-0">
        <MainGameScoreboardHeader
          team1GrandTotal={scoreboardState?.team1GrandTotal ?? 0}
          team2GrandTotal={scoreboardState?.team2GrandTotal ?? 0}
          activeRoundBank={snapshot.roundBank}
          currentRoundNumber={scoreboardState?.currentRoundNumber ?? snapshot.roundNumber ?? 1}
          totalRounds={scoreboardState?.totalRounds ?? (snapshot.controllingTeamPlayers?.length ? snapshot.controllingTeamPlayers.length : 3)}
          isSuddenDeath={scoreboardState?.isSuddenDeath ?? false}
        />
      </div>

      {/* 3. Section with Players Names (Answering Player & Failed Face-Off Opponent) */}
      <div className="w-full shrink-0">
        <div className="w-full grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
          {/* Team 1 Podium */}
          <div
            data-testid="team-guessing-podium-team1"
            className={`relative flex flex-col items-center p-2.5 sm:p-3 2xl:p-4 rounded-xl sm:rounded-2xl backdrop-blur-xl border-2 transition-all duration-300 ${
              isTeam1Answering
                ? 'bg-blue-900/40 border-feud-gold shadow-[0_0_30px_rgba(234,179,8,0.35)] scale-105'
                : 'bg-slate-900/80 border-blue-500/40 opacity-80'
            }`}
          >
            {/* Status Badge */}
            <div
              className={`absolute -top-3 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg flex items-center gap-1 ${
                isTeam1Answering
                  ? 'bg-gradient-to-r from-yellow-400 to-feud-gold text-slate-950 animate-pulse'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {isTeam1Answering ? (
                <>
                  <Award className="w-3.5 h-3.5" />
                  <span>
                    {isStealPhase
                      ? t.mainGame.stealPhaseTitle
                      : t.mainGame.answeringTurn.replace('{name}', team1Player?.nickname || '')}
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    {isStealPhase ? t.lobby.statusWaiting : `${t.mainGame.stealPhaseTitle} • ${t.lobby.statusWaiting}`}
                  </span>
                </>
              )}
            </div>

            <span className="text-[10px] font-extrabold uppercase text-blue-400 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 mb-2">
              {t.mainGame.team1} &bull; {t.mainGame.battingOrder.replace('{order}', String(team1Player?.battingOrder || 1))}
            </span>

            <h3
              className="text-lg sm:text-2xl font-black text-white tracking-wide"
              {...(isTeam1Answering ? { 'data-testid': 'active-player-display' } : {})}
            >
              {isTeam1Answering && isStealPhase
                ? `${team1Player?.nickname || 'Spokesperson'} (${t.mainGame.team1})`
                : team1Player?.nickname || 'Teammate'}
            </h3>

            <div className="mt-2.5 flex items-center gap-2">
              {isTeam1Answering ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-yellow-300 px-2.5 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/30">
                  <Flame className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
                  <span>{isStealPhase ? 'Stealing' : 'Answering'}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 px-2.5 py-0.5 rounded-full bg-slate-800/60 border border-slate-700">
                  <span>{isTeam1Controlling ? 'Defending' : 'Will answer if steal comes'}</span>
                </span>
              )}
            </div>
          </div>

          {/* Center Arbiter: Countdown Timer & 3 Strikes */}
          <div
            data-testid="team-guessing-center-arbiter"
            className="flex flex-col items-center justify-center p-2 min-w-[140px]"
          >
            {/* 15-Second Active Countdown Ring */}
            <div
              data-testid="timer-display"
              className="flex flex-col items-center justify-center p-3 sm:p-3.5 rounded-full bg-slate-900/90 border-2 border-feud-gold shadow-[0_0_20px_rgba(234,179,8,0.4)] animate-pulse"
            >
              <Clock className="w-5 h-5 text-feud-gold mb-0.5" />
              <span
                className={`text-xl sm:text-2xl font-black tracking-tight ${
                  currentSeconds <= 3 ? 'text-red-400 animate-ping' : currentSeconds <= 7 ? 'text-amber-400' : 'text-feud-gold'
                }`}
              >
                {currentSeconds}s
              </span>
              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
                {isStealPhase ? 'Steal Timer' : 'Timer'}
              </span>
            </div>

            {/* 3-Strike Box Counters */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700 px-3 py-1 rounded-xl shadow-lg mt-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-1">
                {t.mainGame.strikeTitle}s:
              </span>
              {[1, 2, 3].map((strikeNum) => {
                const hasStrike = displayedStrikes >= strikeNum;
                return (
                  <div
                    key={strikeNum}
                    data-testid={`strike-box-${strikeNum}`}
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center font-black text-xs sm:text-sm transition-all duration-300 ${
                      hasStrike
                        ? 'bg-red-600 text-white border-2 border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.7)] scale-105'
                        : 'bg-slate-800 text-slate-600 border border-slate-700'
                    }`}
                  >
                    {hasStrike ? 'X' : strikeNum}
                  </div>
                );
              })}
            </div>

            {/* Hidden round-bank-display for tests */}
            <span className="sr-only" data-testid="round-bank-display">
              {snapshot.roundBank}
            </span>
          </div>

          {/* Team 2 Podium */}
          <div
            data-testid="team-guessing-podium-team2"
            className={`relative flex flex-col items-center p-2.5 sm:p-3 2xl:p-4 rounded-xl sm:rounded-2xl backdrop-blur-xl border-2 transition-all duration-300 ${
              isTeam2Answering
                ? 'bg-purple-900/40 border-feud-gold shadow-[0_0_30px_rgba(234,179,8,0.35)] scale-105'
                : 'bg-slate-900/80 border-purple-500/40 opacity-80'
            }`}
          >
            {/* Status Badge */}
            <div
              className={`absolute -top-3 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg flex items-center gap-1 ${
                isTeam2Answering
                  ? 'bg-gradient-to-r from-yellow-400 to-feud-gold text-slate-950 animate-pulse'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {isTeam2Answering ? (
                <>
                  <Award className="w-3.5 h-3.5" />
                  <span>
                    {isStealPhase
                      ? t.mainGame.stealPhaseTitle
                      : t.mainGame.answeringTurn.replace('{name}', team2Player?.nickname || '')}
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                  <span>
                    {isStealPhase ? t.lobby.statusWaiting : `${t.mainGame.stealPhaseTitle} • ${t.lobby.statusWaiting}`}
                  </span>
                </>
              )}
            </div>

            <span className="text-[10px] font-extrabold uppercase text-purple-400 px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 mb-2">
              {t.mainGame.team2} &bull; {t.mainGame.battingOrder.replace('{order}', String(team2Player?.battingOrder || 1))}
            </span>

            <h3
              className="text-lg sm:text-2xl font-black text-white tracking-wide"
              {...(isTeam2Answering ? { 'data-testid': 'active-player-display' } : {})}
            >
              {isTeam2Answering && isStealPhase
                ? `${team2Player?.nickname || 'Spokesperson'} (${t.mainGame.team2})`
                : team2Player?.nickname || 'Teammate'}
            </h3>

            <div className="mt-2.5 flex items-center gap-2">
              {isTeam2Answering ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-yellow-300 px-2.5 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/30">
                  <Flame className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
                  <span>{isStealPhase ? 'Stealing' : 'Answering'}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 px-2.5 py-0.5 rounded-full bg-slate-800/60 border border-slate-700">
                  <span>{!isTeam1Controlling ? 'Defending' : 'Will answer if steal comes'}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Prominent Survey Question Display */}
      <section className="relative z-10 w-full shrink-0">
        <div className="p-2 sm:p-2.5 2xl:p-3.5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-2 border-indigo-500/40 shadow-2xl text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent opacity-80" />
          <h2 className="text-lg md:text-xl 2xl:text-2xl 3xl:text-3xl font-black text-yellow-300 tracking-wide drop-shadow-md">
            "{snapshot.question.questionText}"
          </h2>
        </div>
      </section>

      {/* Judge Override Confirmation Toast (US-21 Scenario 2: floating notification) */}
      {overrideToast && (
        <div
          data-testid="host-override-toast"
          role="status"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-emerald-950/95 border border-emerald-400/60 text-emerald-200 flex items-center justify-between gap-3 shadow-2xl backdrop-blur-md animate-fadeIn"
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

      {/* Discrete Judge Manual Override Modal Panel (US-21 Scenario 2: floating modal overlay) */}
      {showOverrideControls && (
        <div
          data-testid="host-manual-override-panel"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <section className="w-full max-w-2xl p-5 rounded-2xl bg-indigo-950/95 border-2 border-indigo-400 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
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
        </div>
      )}

      {/* Survey Said Suspense Banner (US-28) */}
      {surveySaidAnnouncement && (
        <div
          data-testid="survey-said-banner"
          className="w-full max-w-2xl mx-auto my-2 p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-yellow-500/20 via-feud-gold/30 to-yellow-500/20 border-2 border-feud-gold/70 shadow-[0_0_30px_rgba(234,179,8,0.35)] flex flex-col items-center justify-center gap-1 text-center animate-pulse"
        >
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-feud-gold">
            <Sparkles className="w-4 h-4 text-feud-gold animate-bounce" />
            <span>{t.host.surveyQuestion}</span>
            <Sparkles className="w-4 h-4 text-feud-gold animate-bounce" />
          </div>
          <h3 className="text-lg sm:text-2xl font-black text-white">
            <span>{surveySaidAnnouncement.player}</span>{' '}
            said &ldquo;{surveySaidAnnouncement.answer}&rdquo;...{' '}
            <span className="text-feud-gold">Survey said!</span>
          </h3>
        </div>
      )}

      {/* 5. Answer Board Card Grid (Always 8 Flip Card Slots counted vertically: 1,5 / 2,6 / 3,7 / 4,8) */}
      <main className="relative z-10 w-full flex-1 min-h-0 flex flex-col justify-center overflow-hidden py-0.5 sm:py-1">
        <div className="flex-1 min-h-0 w-full h-full max-h-full grid grid-cols-2 grid-rows-4 auto-rows-fr gap-2 sm:gap-2.5 2xl:gap-3.5 p-2 sm:p-2.5 2xl:p-4 bg-slate-900/85 border-2 border-blue-900/60 rounded-2xl sm:rounded-3xl shadow-2xl backdrop-blur-sm overflow-hidden">
          {HOST_SLOT_RANKS.map((rankOrder) => {
            const revealedItem = revealedMap.get(rankOrder);
            const isRevealed =
              Boolean(revealedItem) &&
              surveySaidAnnouncement?.rankOrder !== rankOrder;
            const isRemaining = Boolean(revealedItem?.isRemainingReveal);
            const isStealMatch = Boolean(revealedItem?.isStealMatch);
            const candidateOption = overrideOptionMap.get(rankOrder);
            const hasAnswer = rankOrder <= totalAnswers || Boolean(revealedItem) || Boolean(candidateOption);

            if (!hasAnswer) {
              return (
                <div
                  key={`empty-slot-${rankOrder}`}
                  data-testid={`team-board-empty-slot-${rankOrder}`}
                  className="h-full rounded-xl sm:rounded-2xl border border-slate-800/40 bg-slate-950/30 select-none"
                />
              );
            }

            return (
              <div
                key={rankOrder}
                data-testid={`team-board-card-${rankOrder}`}
                className={`relative h-full min-h-[46px] sm:min-h-[56px] 2xl:min-h-[72px] 3xl:min-h-[84px] rounded-xl sm:rounded-2xl border-2 flex items-center px-3 sm:px-4 2xl:px-6 py-1 sm:py-1.5 transition-all duration-500 shadow-md ${
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
                  <div className="w-full flex items-center justify-between gap-2.5 sm:gap-3">
                    <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
                      <span
                        className={`w-8 h-8 sm:w-10 sm:h-10 2xl:w-12 2xl:h-12 rounded-full font-black flex items-center justify-center text-sm sm:text-base 2xl:text-xl shadow shrink-0 ${
                          isStealMatch
                            ? 'bg-yellow-300 text-slate-950 animate-bounce'
                            : isRemaining
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-yellow-400 text-slate-950'
                        }`}
                      >
                        {rankOrder}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-extrabold text-white text-base sm:text-lg md:text-xl 2xl:text-2xl tracking-wide uppercase truncate">
                          {revealedItem.answerText}
                        </span>
                        {isRemaining && (
                          <span className="text-[10px] sm:text-xs font-bold text-amber-300/90 uppercase tracking-wider">
                            {t.mainGame.remainingAnswersTitle}
                          </span>
                        )}
                        {isStealMatch && (
                          <span className="text-[10px] sm:text-xs font-black text-emerald-300 uppercase tracking-wider">
                            ⚡ Stolen Answer!
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`font-black px-3 sm:px-4 2xl:px-5 py-1 sm:py-1.5 rounded-xl text-base sm:text-xl 2xl:text-2xl shadow-inner shrink-0 ${
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
                  <div className="w-full flex items-center justify-between gap-2.5 sm:gap-3 py-1">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <span className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-indigo-500/30 border border-indigo-400 text-indigo-200 font-black flex items-center justify-center text-sm sm:text-base shrink-0">
                        {rankOrder}
                      </span>
                      <div
                        data-testid={`host-override-slot-label-${rankOrder}`}
                        className="flex flex-col min-w-0"
                      >
                        <span className="font-extrabold text-indigo-100 text-sm sm:text-base md:text-lg truncate">
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
                      className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-300 hover:to-green-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wide shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      <Gavel className="w-3.5 h-3.5" />
                      <span>{t.admin.overrideAccept}</span>
                    </button>
                  </div>
                ) : (
                  <div className="w-full flex items-center justify-center">
                    <span className="w-9 h-9 sm:w-11 sm:h-11 2xl:w-13 2xl:h-13 rounded-full bg-slate-800 border-2 border-slate-700 text-slate-400 font-black flex items-center justify-center text-base sm:text-xl 2xl:text-2xl shadow-inner">
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
              {roundOverStage === 'COUNTDOWN' && !matchOver && (
                <div
                  data-testid="next-round-countdown"
                  className="mt-3 px-4 py-1.5 rounded-full bg-indigo-900/90 border border-indigo-400 text-indigo-100 font-black text-xs sm:text-sm flex items-center gap-1.5 animate-pulse"
                >
                  <Clock className="w-3.5 h-3.5 text-yellow-300" />
                  <span>Next round in {nextRoundCountdown}s...</span>
                </div>
              )}
              {onNextRound && !matchOver && !suddenDeathInitiated && (
                <button
                  type="button"
                  data-testid="next-round-btn"
                  onClick={handleManualNextRound}
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

      {/* Scenario 4: Steal Phase Handoff (US-28: sr-only for accessibility/tests so nothing appears under board) */}
      {snapshot.phase === 'STEAL_PHASE' && (
        <div
          data-testid="steal-phase-banner"
          className="sr-only"
        >
          <div>
            {t.mainGame.threeStrikes} — {t.mainGame.stealPhaseTitle}
          </div>
          <div>
            {t.mainGame.chanceToSteal.replace('{team}', opposingTeamName)}
          </div>
          <div>
            {t.mainGame.teammateConsultPrompt.replace(
              '{spokesperson}',
              spokesperson?.nickname || 'Spokesperson'
            )}
          </div>
          <span>{snapshot.roundBank} PTS</span>
          <span>{currentSeconds}s</span>
        </div>
      )}

      {/* Round Resolution Banner */}
      {(stealResolved || (snapshot.phase === 'RESOLVED' && Boolean(snapshot.winningTeam))) && (
        <div
          data-testid="steal-resolved-banner"
          className="fixed inset-x-0 top-3 sm:top-5 z-40 flex justify-center px-4 animate-fade-in pointer-events-none"
        >
          <div
            className={`max-w-2xl w-full p-1 rounded-2xl sm:rounded-3xl shadow-2xl pointer-events-auto ${
              isStealSuccess || isBoardCleared
                ? 'bg-gradient-to-b from-emerald-400 via-teal-500 to-emerald-600 shadow-[0_0_50px_rgba(16,185,129,0.5)]'
                : 'bg-gradient-to-b from-amber-500 via-yellow-600 to-amber-700 shadow-[0_0_50px_rgba(245,158,11,0.5)]'
            }`}
          >
            <div className="bg-slate-950/95 backdrop-blur-md rounded-[20px] p-4 sm:p-5 text-center flex flex-col items-center">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div
                  className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center border-2 animate-bounce ${
                    isStealSuccess || isBoardCleared
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
                      : 'bg-amber-500/20 border-amber-400 text-amber-400'
                  }`}
                >
                  {isStealSuccess || isBoardCleared ? (
                    <Trophy className="w-5 h-5" />
                  ) : (
                    <ShieldCheck className="w-5 h-5" />
                  )}
                </div>
                <h2
                  className={`text-xl sm:text-2xl font-black uppercase tracking-tight ${
                    isStealSuccess || isBoardCleared ? 'text-emerald-300' : 'text-yellow-300'
                  }`}
                >
                  {isStealSuccess
                    ? t.mainGame.stealPhaseTitle
                    : isBoardCleared
                    ? t.mainGame.roundWinnerBanner.replace('{team}', winningTeamName)
                    : t.mainGame.strikeTitle}
                </h2>
              </div>
              <p className="text-base sm:text-lg text-white font-extrabold mb-1" data-testid="steal-announcement-text">
                {stealResolved
                  ? isStealSuccess
                    ? t.mainGame.stealSuccessAnnouncement
                        .replace('{team}', opposingTeamName)
                        .replace('{points}', String(resolvedPoints))
                    : t.mainGame.stealFailedAnnouncement
                        .replace('{team}', controllingTeamName)
                        .replace('{points}', String(resolvedPoints))
                  : isBoardCleared
                  ? `${controllingTeamName} cleared the board! +${resolvedPoints} PTS`
                  : `${winningTeamName} wins the round! +${resolvedPoints} PTS`}
              </p>
              <p className="text-xs sm:text-sm text-slate-300 font-semibold mb-2">
                {t.mainGame.roundWinnerBanner.replace('{team}', winningTeamName)}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <div
                  className={`px-5 py-1 rounded-full font-black text-base sm:text-lg shadow-lg ${
                    isStealSuccess || isBoardCleared
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-yellow-400 text-slate-950'
                  }`}
                >
                  +{resolvedPoints} POINTS
                </div>
                {roundOverStage === 'REVEALING' && (
                  <div
                    data-testid="revealing-unread-indicator"
                    className="px-4 py-1 rounded-full bg-blue-900/90 border border-blue-400 text-blue-200 font-bold text-xs sm:text-sm animate-pulse flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                    <span>Revealing unread answers...</span>
                  </div>
                )}
                {roundOverStage === 'COUNTDOWN' && !matchOver && (
                  <div
                    data-testid="next-round-countdown"
                    className="px-4 py-1 rounded-full bg-indigo-900/90 border border-indigo-400 text-indigo-100 font-black text-xs sm:text-sm flex items-center gap-1.5 animate-pulse"
                  >
                    <Clock className="w-3.5 h-3.5 text-yellow-300" />
                    <span>Next round in {nextRoundCountdown}s...</span>
                  </div>
                )}
              </div>
              {onNextRound && !matchOver && !suddenDeathInitiated && (
                <button
                  type="button"
                  data-testid="next-round-btn"
                  onClick={handleManualNextRound}
                  className="mt-3 inline-flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-black text-sm shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
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
