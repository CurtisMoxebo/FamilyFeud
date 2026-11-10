import { isTtsMuted, setTtsMuted, cancelSpeech } from '../utils/tts';
import { resumeAudioContext, registerAutoplayResumeListener } from '../utils/soundEffects';
import React, { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Room,
  TeamsAssignedPayload,
  FaceOffSessionState,
  TeamGuessingSessionState,
  ScoreboardUpdatePayload,
  MatchOverPayload,
  SuddenDeathInitiatedPayload,
  PlayerLeftAlertPayload,
  GamePausedPayload,
  HostOverrideAnswerOption,
  AnswerOverridePayload,
} from '../types';
import { MainGameVictoryModal } from '../components/MainGameVictoryModal';
import { useTranslation } from '../i18n/LanguageContext';
import { useRouter } from '../router/router';
import { useSocket } from '../hooks/useSocket';
import { useFullscreen } from '../hooks/useFullscreen';
import { FastMoneyHostBoard } from '../components/FastMoneyHostBoard';
import { MainGameTeamsStage } from '../components/MainGameTeamsStage';
import { MainGameFaceOffBoard } from '../components/MainGameFaceOffBoard';
import { MainGameTeamGuessingBoard } from '../components/MainGameTeamGuessingBoard';
import {
  Tv,
  Volume2,
  VolumeX,
  Users,
  Zap,
  Globe,
  ArrowLeft,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Copy,
  Check,
  Smartphone,
  Play,
  Pause,
  UserX,
  Gavel,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export interface HostBoardProps {
  roomCode: string;
  initialRoom?: Room | null;
  initialTeamsAssigned?: TeamsAssignedPayload | null;
  initialFaceOffState?: FaceOffSessionState | null;
  initialTeamGuessingState?: TeamGuessingSessionState | null;
  initialScoreboardState?: ScoreboardUpdatePayload | null;
  initialMatchOver?: MatchOverPayload | null;
  initialSuddenDeathInitiated?: SuddenDeathInitiatedPayload | null;
  initialPlayerLeftAlert?: PlayerLeftAlertPayload | null;
  initialGamePaused?: GamePausedPayload | null;
  initialHostOverrideOptions?: HostOverrideAnswerOption[];
  initialAnswerOverrideAck?: AnswerOverridePayload | null;
  onAdvanceNextRound?: () => void;
  onReplay?: () => void;
  apiBaseUrl?: string;
  onStartGame?: () => void;
}

export const HostBoard: React.FC<HostBoardProps> = ({
  roomCode,
  initialRoom = null,
  initialTeamsAssigned = null,
  initialFaceOffState = null,
  initialTeamGuessingState = null,
  initialScoreboardState = null,
  initialMatchOver = null,
  initialSuddenDeathInitiated = null,
  initialPlayerLeftAlert = null,
  initialGamePaused = null,
  initialHostOverrideOptions = [],
  initialAnswerOverrideAck = null,
  onAdvanceNextRound,
  onReplay,
  apiBaseUrl = import.meta.env.VITE_BACKEND_URL
    ? `${import.meta.env.VITE_BACKEND_URL}/api`
    : '/api',
  onStartGame,
}) => {
  const { setLanguage, t } = useTranslation();
  const { navigate } = useRouter();
  const { isFullscreen, toggleFullscreen } = useFullscreen({ enableShortcut: true });

  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => !isTtsMuted());

  const handleToggleAudio = () => {
    const nextAudio = !audioEnabled;
    setAudioEnabled(nextAudio);
    setTtsMuted(!nextAudio);
    if (!nextAudio) {
      cancelSpeech();
    } else {
      resumeAudioContext();
    }
  };

  useEffect(() => {
    const cleanup = registerAutoplayResumeListener();
    return () => cleanup();
  }, []);

  const [room, setRoom] = useState<Room | null>(initialRoom);
  const [isLoading, setIsLoading] = useState<boolean>(!initialRoom);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Live real-time socket connection for host display (US-04, US-05, US-08, US-10 & US-11)
  const {
    roomState,
    roomError,
    startGame,
    teamsAssigned: socketTeamsAssigned,
    faceOffState: socketFaceOffState,
    teamGuessingState: socketTeamGuessingState,
    strikeIssued,
    roundCleared,
    transitionStealPhase,
    mainGameBoardReveal,
    stealResolved,
    roundWinner,
    buzzerLocked,
    faceOffTimeout,
    fastMoneyHostState,
    timerTick,
    duplicateWarning,
    repeatQuestionAlert,
    revealFastMoneyAnswer,
    revealFastMoneyPoints,
    startFastMoneyRevealPhase,
    gameOver,
    startP2FastMoneyRevealPhase,
    revealP2FastMoneyAnswer,
    revealP2FastMoneyPoints,
    requestReplay,
    scoreboardState: socketScoreboardState,
    matchOver: socketMatchOver,
    suddenDeathInitiated: socketSuddenDeath,
    advanceNextRound,
    playerLeftAlert: socketPlayerLeftAlert,
    kickPlayer,
    gamePaused: socketGamePaused,
    pauseGame,
    resumeGame,
    overrideAnswer,
    hostOverrideOptions: socketHostOverrideOptions,
    answerOverrideAck: socketAnswerOverrideAck,
    requestOverrideOptions,
  } = useSocket({
    roomCode,
    isHost: true,
    autoJoin: true,
  });

  const [activePlayerLeftAlert, setActivePlayerLeftAlert] = useState<PlayerLeftAlertPayload | null>(
    initialPlayerLeftAlert ?? null
  );

  useEffect(() => {
    const alert = socketPlayerLeftAlert || initialPlayerLeftAlert;
    if (alert) {
      setActivePlayerLeftAlert(alert);
      const timer = setTimeout(() => {
        setActivePlayerLeftAlert(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [socketPlayerLeftAlert, initialPlayerLeftAlert]);

  const teamsAssigned = initialTeamsAssigned ?? socketTeamsAssigned;
  const faceOffState = initialFaceOffState ?? socketFaceOffState;
  const teamGuessingState = initialTeamGuessingState ?? socketTeamGuessingState;
  const scoreboardState = initialScoreboardState ?? socketScoreboardState;
  const matchOver = initialMatchOver ?? socketMatchOver;
  const suddenDeathInitiated = initialSuddenDeathInitiated ?? socketSuddenDeath;
  const activeGamePaused = socketGamePaused ?? initialGamePaused;
  const isPaused = Boolean(activeGamePaused);
  const pausedRemainingSeconds = activeGamePaused?.remainingTime;
  const hostOverrideOptions =
    socketHostOverrideOptions.length > 0
      ? socketHostOverrideOptions
      : initialHostOverrideOptions;
  const answerOverrideAck = socketAnswerOverrideAck ?? initialAnswerOverrideAck;

  const [isManualOverrideOpen, setIsManualOverrideOpen] = useState<boolean>(false);
  const [teamsShowcased, setTeamsShowcased] = useState<boolean>(() => Boolean(initialFaceOffState));

  const isFastMoneyRoom = room?.gameMode === 'FAST_MONEY';
  const canManualOverride = Boolean(
    !isFastMoneyRoom &&
    teamGuessingState &&
    (teamGuessingState.phase === 'TEAM_GUESSING' ||
      teamGuessingState.phase === 'STEAL_PHASE') &&
    !matchOver
  );

  useEffect(() => {
    if (!canManualOverride && isManualOverrideOpen) {
      setIsManualOverrideOpen(false);
    }
  }, [canManualOverride, isManualOverrideOpen]);

  const handleToggleManualOverride = useCallback(() => {
    setIsManualOverrideOpen((prev) => {
      const next = !prev;
      if (next) {
        requestOverrideOptions();
      }
      return next;
    });
  }, [requestOverrideOptions]);
  const isActiveGameStage = Boolean(
    (isFastMoneyRoom &&
      fastMoneyHostState &&
      !gameOver &&
      fastMoneyHostState.phase !== 'GAME_OVER') ||
    (!isFastMoneyRoom && teamGuessingState && !matchOver) ||
    (!isFastMoneyRoom && faceOffState && !matchOver) ||
    isPaused
  );

  const handleTogglePause = useCallback(() => {
    if (!room) return;
    if (isPaused) {
      resumeGame();
    } else {
      cancelSpeech();
      pauseGame();
    }
  }, [room, isPaused, pauseGame, resumeGame]);

  // US-21 Scenario 1 & DoD: Spacebar keyboard shortcut for Pause / Resume on Host display
  useEffect(() => {
    if (!isActiveGameStage || !room) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code !== 'Space' && e.key !== ' ') return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      e.preventDefault();
      handleTogglePause();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActiveGameStage, room, handleTogglePause]);

  const handleAdvanceNextRound = () => {
    if (onAdvanceNextRound) {
      onAdvanceNextRound();
    } else if (advanceNextRound && room) {
      advanceNextRound(room.roomCode);
    }
  };

  const handleReplay = () => {
    setTeamsShowcased(false);
    if (onReplay) {
      onReplay();
    } else if (requestReplay && room) {
      requestReplay(room.roomCode);
    }
  };

  const joinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/play/${roomCode}`
      : `/play/${roomCode}`;

  useEffect(() => {
    if (initialRoom) {
      setRoom(initialRoom);
      setLanguage(initialRoom.language);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetch(`${apiBaseUrl}/rooms/${roomCode}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Room not found');
        }
        return data.room;
      })
      .then((fetchedRoom: Room) => {
        if (isMounted) {
          setRoom(fetchedRoom);
          setLanguage(fetchedRoom.language);
          setIsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (isMounted) {
          setError(err.message || 'Failed to load room session');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [roomCode, initialRoom, apiBaseUrl, setLanguage]);

  // Fast-hydrate room state from socket reconnection if REST fetch is still in flight (US-20)
  useEffect(() => {
    if (roomState && !room) {
      setRoom({
        id: roomState.roomCode,
        roomCode: roomState.roomCode,
        roomName: roomState.roomName,
        language: roomState.language,
        gameMode: roomState.gameMode,
        status: roomState.status,
        players: roomState.players.map((p) => ({
          id: p.id,
          roomId: roomState.roomCode,
          nickname: p.nickname,
          team: p.team as any,
          socketId: null,
          isReady: p.isReady,
          isConnected: p.isConnected,
          totalScore: 0,
          createdAt: new Date().toISOString(),
        })),
        createdAt: new Date().toISOString(),
      });
      setLanguage(roomState.language);
      setIsLoading(false);
    }
  }, [roomState, room, setLanguage]);

  const livePlayers = roomState?.players ?? room?.players ?? [];
  const liveConnectedPlayers = livePlayers.filter((p) => p.isConnected);
  const livePlayerCount = roomState?.playerCount ?? liveConnectedPlayers.length;
  const canStartAuthoritative =
    roomState?.canStart ??
    (isFastMoneyRoom
      ? livePlayerCount === 2
      : livePlayerCount >= 2 && livePlayerCount <= 10 && livePlayerCount % 2 === 0);

  const [isStartingGame, setIsStartingGame] = useState<boolean>(false);

  useEffect(() => {
    if (roomError) {
      setIsStartingGame(false);
    }
  }, [roomError]);

  useEffect(() => {
    if (!canStartAuthoritative) {
      setIsStartingGame(false);
    }
  }, [canStartAuthoritative]);

  useEffect(() => {
    if (isActiveGameStage) {
      setIsStartingGame(false);
    }
  }, [isActiveGameStage]);

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartGame = () => {
    resumeAudioContext();
    setIsStartingGame(true);
    if (startGame) {
      startGame(roomCode);
    }
    if (onStartGame) {
      onStartGame();
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
        <Loader2 className="w-12 h-12 text-feud-gold animate-spin mb-4" />
        <p className="text-lg text-slate-300 font-medium">{t.host.loadingGameShowBoard}</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="max-w-md w-full bg-feud-slate-card/90 border border-feud-red/40 rounded-3xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-red-950/80 text-feud-red mx-auto flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-extrabold text-white mb-2">{t.host.roomUnavailable}</h2>
        <p className="text-slate-300 text-sm mb-6">{error || t.host.roomDoesNotExist}</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-feud-gold text-slate-950 font-bold hover:scale-105 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t.lobby.backHome}</span>
        </button>
      </div>
    );
  }

  const isFastMoney = room.gameMode === 'FAST_MONEY';

  const renderAlert = () =>
    activePlayerLeftAlert ? (
      <div
        data-testid="host-player-left-alert"
        role="alert"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl bg-amber-950/95 border-2 border-amber-500 text-amber-200 flex items-center gap-3 shadow-2xl backdrop-blur-md animate-bounce"
      >
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
        <span className="font-extrabold text-sm sm:text-base tracking-wide">
          {activePlayerLeftAlert.message}
        </span>
      </div>
    ) : null;

  const hasSubBoardHeader = isFastMoney || Boolean(faceOffState) || Boolean(teamGuessingState);

  const renderFullscreenToggleButton = (_variant: 'header' | 'toolbar' = 'toolbar') => (
    <button
      type="button"
      onClick={() => {
        void toggleFullscreen();
      }}
      data-testid="host-fullscreen-toggle"
      aria-pressed={isFullscreen}
      aria-label={isFullscreen ? t.host.exitFullscreen : t.host.enterFullscreen}
      title={`${isFullscreen ? t.host.exitFullscreen : t.host.enterFullscreen} (${t.host.fullscreenHint})`}
      className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
    >
      {isFullscreen ? (
        <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5 text-feud-gold" />
      ) : (
        <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5 text-feud-gold" />
      )}
      <span className="sr-only">{isFullscreen ? t.host.exitFullscreen : t.host.enterFullscreen}</span>
      <span className="sr-only">{t.host.fullscreenHint}</span>
    </button>
  );

  const renderAdminControls = () => (
    <div
      data-testid="host-admin-controls"
      className="w-full max-w-5xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] flex items-center justify-end gap-2 mb-3 px-1 flex-wrap"
    >
      {isActiveGameStage && canManualOverride && (
        <button
          type="button"
          onClick={handleToggleManualOverride}
          data-testid="host-manual-override-toggle"
          aria-expanded={isManualOverrideOpen}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider border transition-all cursor-pointer shadow-md ${isManualOverrideOpen
            ? 'bg-indigo-500 hover:bg-indigo-400 text-white border-indigo-300 shadow-indigo-500/25'
            : 'bg-slate-800/90 hover:bg-slate-700 text-indigo-300 border-indigo-500/40'
            }`}
        >
          <Gavel className="w-3.5 h-3.5" />
          <span>
            {isManualOverrideOpen ? t.admin.closeOverride : t.admin.manualOverride}
          </span>
        </button>
      )}
      {!hasSubBoardHeader && renderFullscreenToggleButton('toolbar')}
    </div>
  );

  const renderPausedBanner = () =>
    isPaused ? (
      <div
        data-testid="host-game-paused-banner"
        role="dialog"
        aria-modal="true"
        aria-live="assertive"
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fadeIn"
      >
        <div className="w-full max-w-lg p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-slate-900 via-amber-950/80 to-slate-900 border-2 border-amber-400 shadow-[0_0_50px_rgba(245,158,11,0.5)] flex flex-col items-center text-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-500/20 border-2 border-amber-400/60 text-amber-300 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(245,158,11,0.4)] animate-pulse">
            <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />
          </div>

          <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-widest text-amber-300 mb-2">
            {t.admin.gamePausedBanner}
          </h2>

          <p className="text-sm sm:text-base font-semibold text-slate-300 mb-6">
            {t.admin.gamePausedSubtitle}
            {typeof pausedRemainingSeconds === 'number' && pausedRemainingSeconds > 0 && (
              <span
                data-testid="host-paused-remaining-time"
                className="ml-2 inline-block px-3 py-1 rounded-xl bg-amber-500/25 border border-amber-400/50 text-amber-200 font-mono font-extrabold text-base sm:text-lg"
              >
                {pausedRemainingSeconds}s
              </span>
            )}
          </p>

          <button
            type="button"
            onClick={() => resumeGame()}
            data-testid="host-banner-resume-btn"
            className="inline-flex items-center gap-2.5 px-8 py-3.5 sm:px-10 sm:py-4 rounded-2xl bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500 hover:from-emerald-300 hover:to-green-300 text-slate-950 font-black text-base sm:text-lg uppercase tracking-wider shadow-[0_0_25px_rgba(52,211,153,0.5)] cursor-pointer transition-all hover:scale-105 active:scale-95"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>{t.admin.resumeTimer}</span>
          </button>
        </div>
      </div>
    ) : null;

  // Live roster and capacity state calculation (US-04)
  const players = roomState?.players ?? room.players ?? [];
  const connectedPlayers = players.filter((p) => p.isConnected);
  const playerCount = roomState?.playerCount ?? connectedPlayers.length;
  const maxPlayers = roomState?.maxPlayers ?? (isFastMoney ? 2 : 10);

  // Fast Money Host Board Screen (US-07, US-08, US-09 & US-10)
  if (isFastMoney && fastMoneyHostState) {
    const p1Nickname = connectedPlayers[0]?.nickname ?? players[0]?.nickname;
    const p2Nickname = connectedPlayers[1]?.nickname ?? players[1]?.nickname;

    return (
      <div className="w-full h-full max-h-full flex flex-col items-center justify-center overflow-hidden">
        {renderAlert()}
        {renderAdminControls()}
        {renderPausedBanner()}
        <FastMoneyHostBoard
          snapshot={fastMoneyHostState}
          timerTick={timerTick}
          duplicateWarning={duplicateWarning}
          repeatQuestionAlert={repeatQuestionAlert}
          gameOver={gameOver}
          isPaused={isPaused}
          pausedRemainingSeconds={pausedRemainingSeconds}
          language={room.language}
          roomName={room.roomName}
          roomCode={room.roomCode}
          player1Name={p1Nickname}
          player2Name={p2Nickname}
          onRevealAnswer={(slotNum) => revealFastMoneyAnswer(room.roomCode, slotNum)}
          onRevealPoints={(slotNum) => revealFastMoneyPoints(room.roomCode, slotNum)}
          onStartReveal={() => startFastMoneyRevealPhase(room.roomCode)}
          onStartP2Reveal={() => startP2FastMoneyRevealPhase(room.roomCode)}
          onRevealP2Answer={(slotNum) => revealP2FastMoneyAnswer(room.roomCode, slotNum)}
          onRevealP2Points={(slotNum) => revealP2FastMoneyPoints(room.roomCode, slotNum)}
          onReplay={() => requestReplay(room.roomCode)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onTogglePause={handleTogglePause}
        />
      </div>
    );
  }

  // Main Game Teams Stage (US-11)
  const activeTeams =
    teamsAssigned ??
    (!isFastMoney &&
      (roomState?.status === 'ACTIVE' || room.status === 'ACTIVE') &&
      players.some((p) => p.team === 'TEAM_1' || p.team === 'TEAM_2')
      ? {
        roomCode: room.roomCode,
        team1: players
          .filter((p) => p.team === 'TEAM_1')
          .map((p, idx) => ({
            id: p.id,
            nickname: p.nickname,
            team: 'TEAM_1' as const,
            battingOrder: idx + 1,
          })),
        team2: players
          .filter((p) => p.team === 'TEAM_2')
          .map((p, idx) => ({
            id: p.id,
            nickname: p.nickname,
            team: 'TEAM_2' as const,
            battingOrder: idx + 1,
          })),
      }
      : null);

  // Main Game Team Guessing Stage (US-14)
  if (!isFastMoney && teamGuessingState) {
    return (
      <div className="w-full h-full max-h-full flex flex-col items-center justify-center overflow-hidden">
        {renderAlert()}
        {renderAdminControls()}
        {renderPausedBanner()}
        <MainGameTeamGuessingBoard
          snapshot={teamGuessingState}
          timerTick={timerTick}
          isPaused={isPaused}
          pausedRemainingSeconds={pausedRemainingSeconds}
          isManualOverrideOpen={isManualOverrideOpen}
          onCloseManualOverride={() => setIsManualOverrideOpen(false)}
          hostOverrideOptions={hostOverrideOptions}
          answerOverrideAck={answerOverrideAck}
          onOverrideAnswer={(rankOrder, points, teamId) => {
            overrideAnswer(rankOrder, points, teamId);
            setIsManualOverrideOpen(false);
          }}
          strikeIssued={strikeIssued}
          roundCleared={roundCleared}
          transitionStealPhase={transitionStealPhase}
          boardReveal={mainGameBoardReveal}
          stealResolved={stealResolved}
          roundWinner={roundWinner}
          scoreboardState={scoreboardState}
          matchOver={matchOver}
          suddenDeathInitiated={suddenDeathInitiated}
          onNextRound={handleAdvanceNextRound}
          onReplay={handleReplay}
          language={room.language}
          audioEnabled={audioEnabled}
          roomName={room.roomName}
          roomCode={room.roomCode}
          onLeave={() => navigate('/')}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onTogglePause={handleTogglePause}
        />
      </div>
    );
  }

  // Main Game Team Showcase Stage (US-28)
  if (!isFastMoney && activeTeams && !teamsShowcased) {
    return (
      <div className="w-full h-full max-h-full flex flex-col items-center justify-center overflow-hidden">
        {renderAlert()}
        {renderAdminControls()}
        <MainGameTeamsStage
          roomCode={room.roomCode}
          roomName={room.roomName}
          team1={activeTeams.team1}
          team2={activeTeams.team2}
          onProceedToFaceOff={() => setTeamsShowcased(true)}
          onLeave={() => navigate('/')}
        />
      </div>
    );
  }

  // Main Game Face-Off Stage (US-12)
  if (!isFastMoney && faceOffState) {
    return (
      <div className="relative w-full h-full max-h-full flex flex-col items-center justify-center overflow-hidden">
        {renderAlert()}
        {renderAdminControls()}
        {renderPausedBanner()}
        <MainGameFaceOffBoard
          snapshot={faceOffState}
          timerTick={timerTick}
          isPaused={isPaused}
          pausedRemainingSeconds={pausedRemainingSeconds}
          buzzerLocked={buzzerLocked}
          timeoutResult={faceOffTimeout}
          scoreboardState={scoreboardState}
          language={room.language}
          roomName={room.roomName}
          roomCode={room.roomCode}
          onLeave={() => navigate('/')}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onTogglePause={handleTogglePause}
        />
        {matchOver && (
          <MainGameVictoryModal
            matchOver={matchOver}
            onReplay={handleReplay}
            onLeave={() => navigate('/')}
            isHost={true}
          />
        )}
      </div>
    );
  }

  // Authoritative start readiness
  const canStart =
    roomState?.canStart ??
    (isFastMoney
      ? playerCount === 2
      : playerCount >= 2 && playerCount <= 10 && playerCount % 2 === 0);

  // Localized start disabled reason helper
  const disabledReason = isFastMoney
    ? t.lobby.fastMoneyWaiting.replace('{count}', String(playerCount))
    : playerCount < 2
      ? t.lobby.mainGameEvenCountRequired
      : playerCount % 2 !== 0
        ? t.lobby.oddPlayerCountWarning
          .replace('{count}', String(playerCount))
          .replace('{target}', String(playerCount + 1))
        : roomState?.startDisabledReason ?? t.lobby.mainGameEvenCountRequired;

  return (
    <div
      data-testid="host-widescreen-container"
      className="w-full h-full max-h-full max-w-5xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] flex flex-col items-center justify-between gap-2.5 sm:gap-3 2xl:gap-4 overflow-hidden"
    >
      {renderAlert()}
      {/* Host TV Header Banner */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-2xl sm:rounded-3xl p-3 sm:p-4 2xl:p-5 shadow-2xl shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-feud-slate-border/80 pb-3 sm:pb-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-feud-blue-light/50 border border-feud-blue-glow/30 text-feud-gold">
              <Tv className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-feud-gold px-2 py-0.5 rounded-full bg-feud-gold/10 border border-feud-gold/20">
                  {t.host.hostBoard}
                </span>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-green-400 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                  {roomState?.status ?? room.status}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                {room.roomName}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            {renderFullscreenToggleButton('header')}

            <button
              type="button"
              onClick={handleToggleAudio}
              data-testid="host-audio-toggle"
              title={audioEnabled ? 'Mute Sounds & TTS' : 'Unmute Sounds & TTS'}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              {audioEnabled ? (
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-feud-gold" />
              ) : (
                <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              data-testid="host-back-home-btn"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t.lobby.leaveLobby}</span>
            </button>
          </div>
        </div>

        {/* Room Code Display */}
        <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-feud-blue-dark via-feud-blue to-feud-blue-dark border border-feud-gold/40 shadow-inner">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-300">
              {t.host.roomCode}
            </div>
            <div
              data-testid="host-room-code"
              className="text-2xl sm:text-4xl 2xl:text-5xl font-extrabold font-game text-transparent bg-clip-text bg-gradient-to-r from-feud-gold-light via-feud-gold to-yellow-200 tracking-wider mt-0.5 drop-shadow-md select-all"
            >
              {room.roomCode}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyLink}
              data-testid="host-copy-link-btn"
              title={t.host.shareLink}
              aria-label={t.host.shareLink}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 sm:py-2.5 rounded-xl bg-feud-gold/20 hover:bg-feud-gold/30 border border-feud-gold/50 text-feud-gold font-bold text-xs sm:text-sm transition-all cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">{t.host.linkCopied}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>{t.host.copyLink}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Room Metadata Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 mt-3 sm:mt-4">
          {/* Language Badge */}
          <div className="flex items-center gap-2.5 p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-slate-800/50 border border-slate-700/60">
            <Globe className="w-4 h-4 text-feud-gold shrink-0" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">
                {t.host.language}
              </div>
              <div data-testid="host-room-language" className="text-xs sm:text-sm font-bold text-white">
                {room.language === 'FR'
                  ? 'Français (FR)'
                  : room.language === 'ES'
                    ? 'Español (ES)'
                    : 'English (EN)'}
              </div>
            </div>
          </div>

          {/* Game Mode Badge */}
          <div className="flex items-center gap-2.5 p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-slate-800/50 border border-slate-700/60">
            {isFastMoney ? (
              <Zap className="w-4 h-4 text-feud-gold shrink-0" />
            ) : (
              <Users className="w-4 h-4 text-feud-gold shrink-0" />
            )}
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">
                {t.host.gameMode}
              </div>
              <div data-testid="host-room-mode" className="text-xs sm:text-sm font-bold text-white">
                {isFastMoney ? t.gameModes.fastMoneyTitle : t.gameModes.mainGameTitle}
              </div>
            </div>
          </div>

          {/* Player Capacity Badge */}
          <div className="col-span-2 sm:col-span-1 flex items-center gap-2.5 p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-slate-800/50 border border-slate-700/60">
            <Users className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">{t.lobby.capacity}</div>
              <div className="text-xs sm:text-sm font-bold text-white">
                {isFastMoney ? t.lobby.fastMoneyCapacity : t.lobby.mainGameCapacity}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Responsive Side-by-Side Lobby (Left: Players List, Right: QR Code) */}
      <div className="w-full flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-stretch overflow-hidden">
        {/* Left Section: Connected Players Roster & Capacity Control */}
        <div className="w-full h-full max-h-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 2xl:p-5 shadow-2xl flex flex-col justify-between overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-feud-slate-border/80 pb-2.5 mb-2.5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-feud-gold/20 text-feud-gold border border-feud-gold/30">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-extrabold text-white">{t.lobby.rosterTitle}</h3>
                  <p className="text-[11px] sm:text-xs text-slate-300">
                    {isFastMoney ? t.lobby.fastMoneyCapacity : t.lobby.mainGameCapacity}
                  </p>
                </div>
              </div>

              {/* Live Player Count Badge */}
              <div
                data-testid="host-roster-count"
                className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-feud-blue-light/50 border border-feud-blue-glow/40 text-blue-200"
              >
                {playerCount} / {maxPlayers} Players
              </div>
            </div>

            {/* Player Roster List */}
            {players.length === 0 ? (
              <div
                data-testid="host-empty-roster"
                className="text-center py-4 text-slate-400 text-xs sm:text-sm italic border border-dashed border-slate-700/60 rounded-xl mb-2"
              >
                {t.host.waitingPlayers}
              </div>
            ) : (
              <div
                data-testid="host-player-roster"
                className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto pr-1 mb-2 content-start"
              >
                {players.map((p) => (
                  <div
                    key={p.id}
                    data-testid={`host-player-card-${p.nickname}`}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${p.isConnected
                      ? 'bg-slate-800/80 border-slate-700/80 text-white shadow-md'
                      : 'bg-slate-900/40 border-red-900/30 text-slate-500 opacity-60'
                      }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 mr-1.5">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${p.isConnected
                          ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]'
                          : 'bg-red-500'
                          }`}
                      />
                      <span className="font-bold text-xs sm:text-sm truncate">{p.nickname}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${p.isConnected
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}
                      >
                        {p.isConnected ? t.lobby.statusReady : t.lobby.statusDisconnected}
                      </span>
                      <button
                        type="button"
                        title={t.lobby.removePlayer}
                        data-testid={`host-kick-player-btn-${p.nickname}`}
                        onClick={() => kickPlayer(p.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic Start Game Button */}
          <div className="flex flex-col items-center pt-1">
            <button
              type="button"
              data-testid="host-start-game-btn"
              disabled={!canStart || isStartingGame}
              onClick={handleStartGame}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-extrabold text-base uppercase tracking-wider transition-all duration-200 ${canStart && !isStartingGame
                ? 'bg-gradient-to-r from-feud-gold via-yellow-400 to-amber-500 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.5)] hover:scale-105 cursor-pointer animate-pulse'
                : isStartingGame
                  ? 'bg-gradient-to-r from-feud-gold/70 via-yellow-400/70 to-amber-500/70 text-slate-950 cursor-wait opacity-80'
                  : 'bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                }`}
            >
              {isStartingGame ? (
                <>
                  <Loader2 data-testid="host-start-game-spinner" className="w-4 h-4 animate-spin text-slate-950" />
                  <span>
                    {canStart && playerCount > 0
                      ? t.lobby.startGameWithCount.replace('{count}', String(playerCount))
                      : t.lobby.startGame}
                  </span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {canStart && playerCount > 0
                      ? t.lobby.startGameWithCount.replace('{count}', String(playerCount))
                      : t.lobby.startGame}
                  </span>
                </>
              )}
            </button>

            {!canStart && (
              <p
                data-testid="host-start-disabled-reason"
                className="text-xs text-amber-400/90 font-medium mt-2 flex items-center gap-1.5"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{disabledReason}</span>
              </p>
            )}
          </div>
        </div>

        {/* Right Section: Lobby Invitation & QR Code Screen */}
        <div className="w-full h-full max-h-full bg-feud-slate-card/70 backdrop-blur-md border border-feud-slate-border rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 2xl:p-5 text-center shadow-xl flex flex-col items-center justify-center overflow-hidden">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-1">{t.host.waitingPlayers}</h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xs mx-auto mb-2">
            {t.joinRoom.subtitle}
          </p>

          {/* High-Contrast QR Code Card */}
          <div className="p-3 sm:p-4 bg-white rounded-2xl sm:rounded-3xl shadow-2xl border-2 sm:border-4 border-feud-gold/40 flex flex-col items-center justify-center transition-transform hover:scale-105 duration-200 my-1 sm:my-2">
            <QRCodeSVG
              value={joinUrl}
              size={220}
              level="H"
              includeMargin={false}
              fgColor="#0f172a"
              bgColor="#ffffff"
              data-testid="host-qr-code"
              className="w-36 h-36 sm:w-44 sm:h-44 md:w-52 md:h-52 2xl:w-64 2xl:h-64"
            />
          </div>

          {/* Scan to Join Instruction */}
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-feud-gold px-3 py-1 rounded-full bg-feud-gold/10 border border-feud-gold/20 shrink-0">
            <Smartphone className="w-3.5 h-3.5 text-feud-gold" />
            <span data-testid="host-scan-instruction">{t.joinRoom.scanToJoin}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostBoard;
