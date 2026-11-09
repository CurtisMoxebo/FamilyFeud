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

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartGame = () => {
    resumeAudioContext();
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
        <p className="text-lg text-slate-300 font-medium">Loading Game Show Board...</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="max-w-md w-full bg-feud-slate-card/90 border border-feud-red/40 rounded-3xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-red-950/80 text-feud-red mx-auto flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-extrabold text-white mb-2">Room Unavailable</h2>
        <p className="text-slate-300 text-sm mb-6">{error || 'This room does not exist.'}</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-feud-gold text-slate-950 font-bold hover:scale-105 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
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

  const renderFullscreenToggleButton = (variant: 'header' | 'toolbar' = 'toolbar') => (
    <button
      type="button"
      onClick={() => {
        void toggleFullscreen();
      }}
      data-testid="host-fullscreen-toggle"
      aria-pressed={isFullscreen}
      aria-label={isFullscreen ? t.host.exitFullscreen : t.host.enterFullscreen}
      title={`${isFullscreen ? t.host.exitFullscreen : t.host.enterFullscreen} (${t.host.fullscreenHint})`}
      className={
        variant === 'header'
          ? `inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider border transition-all cursor-pointer ${
              isFullscreen
                ? 'bg-feud-gold/20 hover:bg-feud-gold/30 text-feud-gold border-feud-gold/50 shadow-md'
                : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 hover:text-white border-slate-700'
            }`
          : `inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider border transition-all cursor-pointer shadow-md ${
              isFullscreen
                ? 'bg-feud-gold/20 hover:bg-feud-gold/30 text-feud-gold border-feud-gold/50'
                : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-600/60'
            }`
      }
    >
      {isFullscreen ? (
        <Minimize2 className="w-4 h-4 text-feud-gold" />
      ) : (
        <Maximize2 className="w-4 h-4 text-feud-gold" />
      )}
      <span>{isFullscreen ? t.host.exitFullscreen : t.host.enterFullscreen}</span>
      <kbd className="hidden sm:inline-block ml-0.5 px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-950/60 border border-white/15 opacity-80">
        {t.host.fullscreenHint}
      </kbd>
    </button>
  );

  const renderAdminControls = () =>
    isActiveGameStage ? (
      <div
        data-testid="host-admin-controls"
        className="w-full max-w-5xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] flex items-center justify-end gap-2 mb-3 px-1 flex-wrap"
      >
        {canManualOverride && (
          <button
            type="button"
            onClick={handleToggleManualOverride}
            data-testid="host-manual-override-toggle"
            aria-expanded={isManualOverrideOpen}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider border transition-all cursor-pointer shadow-md ${
              isManualOverrideOpen
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
        <button
          type="button"
          onClick={handleTogglePause}
          data-testid="host-pause-resume-btn"
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider border transition-all cursor-pointer shadow-md ${
            isPaused
              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-300 shadow-emerald-500/25'
              : 'bg-slate-800/90 hover:bg-slate-700 text-amber-300 border-amber-500/40'
          }`}
        >
          {isPaused ? (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{t.admin.resumeTimer}</span>
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>{t.admin.pauseTimer}</span>
            </>
          )}
          <kbd className="ml-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-950/50 border border-white/15 opacity-80">
            {t.admin.spacebarShortcutHint}
          </kbd>
        </button>
        {renderFullscreenToggleButton('toolbar')}
      </div>
    ) : (
      <div
        data-testid="host-stage-display-controls"
        className="w-full max-w-5xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] flex items-center justify-end gap-2 mb-1.5 sm:mb-2 px-1 flex-wrap"
      >
        {renderFullscreenToggleButton('toolbar')}
      </div>
    );

  const renderPausedBanner = () =>
    isPaused ? (
      <div
        data-testid="host-game-paused-banner"
        role="status"
        aria-live="assertive"
        className="w-full max-w-5xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] mb-4 p-5 rounded-3xl bg-gradient-to-r from-amber-950/95 via-slate-900/95 to-amber-950/95 border-2 border-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.45)] flex flex-col sm:flex-row items-center justify-between gap-4 z-40"
      >
        <div className="flex items-center gap-3.5 text-center sm:text-left">
          <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-400/50 text-amber-300">
            <Pause className="w-7 h-7" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black uppercase tracking-widest text-amber-300">
              {t.admin.gamePausedBanner}
            </div>
            <p className="text-xs sm:text-sm font-semibold text-slate-300 mt-0.5">
              {t.admin.gamePausedSubtitle}
              {typeof pausedRemainingSeconds === 'number' && pausedRemainingSeconds > 0 && (
                <span
                  data-testid="host-paused-remaining-time"
                  className="ml-2 inline-block px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-200 font-mono font-bold"
                >
                  {pausedRemainingSeconds}s
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => resumeGame()}
          data-testid="host-banner-resume-btn"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-300 hover:to-green-400 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg cursor-pointer transition-all hover:scale-105"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>{t.admin.resumeTimer}</span>
        </button>
      </div>
    ) : null;

  // Fast Money Host Board Screen (US-07, US-08, US-09 & US-10)
  if (isFastMoney && fastMoneyHostState) {
    return (
      <div className="w-full flex flex-col items-center justify-center">
        {renderAlert()}
        {renderAdminControls()}
        {renderPausedBanner()}
        <FastMoneyHostBoard
          snapshot={fastMoneyHostState}
          timerTick={timerTick}
          duplicateWarning={duplicateWarning}
          gameOver={gameOver}
          isPaused={isPaused}
          pausedRemainingSeconds={pausedRemainingSeconds}
          language={room.language}
          roomName={room.roomName}
          roomCode={room.roomCode}
          onRevealAnswer={(slotNum) => revealFastMoneyAnswer(room.roomCode, slotNum)}
          onRevealPoints={(slotNum) => revealFastMoneyPoints(room.roomCode, slotNum)}
          onStartReveal={() => startFastMoneyRevealPhase(room.roomCode)}
          onStartP2Reveal={() => startP2FastMoneyRevealPhase(room.roomCode)}
          onRevealP2Answer={(slotNum) => revealP2FastMoneyAnswer(room.roomCode, slotNum)}
          onRevealP2Points={(slotNum) => revealP2FastMoneyPoints(room.roomCode, slotNum)}
          onReplay={() => requestReplay(room.roomCode)}
        />
      </div>
    );
  }

  // Live roster and capacity state calculation (US-04)
  const players = roomState?.players ?? room.players ?? [];
  const connectedPlayers = players.filter((p) => p.isConnected);
  const playerCount = roomState?.playerCount ?? connectedPlayers.length;
  const maxPlayers = roomState?.maxPlayers ?? (isFastMoney ? 2 : 10);

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
      <div className="w-full flex flex-col items-center">
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
          roomName={room.roomName}
          roomCode={room.roomCode}
          onLeave={() => navigate('/')}
        />
      </div>
    );
  }

  // Main Game Face-Off Stage (US-12)
  if (!isFastMoney && faceOffState) {
    return (
      <div className="relative w-full flex flex-col items-center">
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

  if (!isFastMoney && activeTeams) {
    return (
      <div className="w-full flex flex-col items-center">
        {renderAlert()}
        {renderAdminControls()}
        <MainGameTeamsStage
          roomCode={room.roomCode}
          roomName={room.roomName}
          team1={activeTeams.team1}
          team2={activeTeams.team2}
          onLeave={() => navigate('/')}
        />
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
      className="w-full max-w-5xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] flex flex-col items-center gap-3 sm:gap-4 2xl:gap-5"
    >
      {renderAlert()}
      {/* Host TV Header Banner */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-2xl sm:rounded-3xl p-4 sm:p-5 2xl:p-6 shadow-2xl">
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
              <span>Leave Lobby</span>
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
              <div className="text-[10px] uppercase font-bold text-slate-400">Capacity</div>
              <div className="text-xs sm:text-sm font-bold text-white">
                {isFastMoney ? t.lobby.fastMoneyCapacity : t.lobby.mainGameCapacity}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fast Money Mode: Responsive Side-by-Side Lobby (Left: Players List, Right: QR Code) */}
      {isFastMoney ? (
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-stretch">
          {/* Left Section: Connected Players Roster & Capacity Control */}
          <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-2xl sm:rounded-3xl p-4 sm:p-5 2xl:p-6 shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-feud-slate-border/80 pb-3 mb-3 sm:mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-feud-gold/20 text-feud-gold border border-feud-gold/30">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-extrabold text-white">{t.lobby.rosterTitle}</h3>
                    <p className="text-[11px] sm:text-xs text-slate-300">{t.lobby.fastMoneyCapacity}</p>
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

              {/* Player Roster List (Vertical List for Fast Money) */}
              {players.length === 0 ? (
                <div
                  data-testid="host-empty-roster"
                  className="text-center py-5 sm:py-6 text-slate-400 text-xs sm:text-sm italic border border-dashed border-slate-700/60 rounded-xl mb-4"
                >
                  {t.host.waitingPlayers}
                </div>
              ) : (
                <div data-testid="host-player-roster" className="flex flex-col gap-2.5 mb-4">
                  {players.map((p) => (
                    <div
                      key={p.id}
                      data-testid={`host-player-card-${p.nickname}`}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        p.isConnected
                          ? 'bg-slate-800/80 border-slate-700/80 text-white shadow-md'
                          : 'bg-slate-900/40 border-red-900/30 text-slate-500 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            p.isConnected
                              ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]'
                              : 'bg-red-500'
                          }`}
                        />
                        <span className="font-bold text-sm truncate">{p.nickname}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                            p.isConnected
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
                disabled={!canStart}
                onClick={handleStartGame}
                className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-extrabold text-base uppercase tracking-wider transition-all duration-200 ${
                  canStart
                    ? 'bg-gradient-to-r from-feud-gold via-yellow-400 to-amber-500 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.5)] hover:scale-105 cursor-pointer animate-pulse'
                    : 'bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {canStart && playerCount > 0
                    ? t.lobby.startGameWithCount.replace('{count}', String(playerCount))
                    : t.lobby.startGame}
                </span>
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
          <div className="w-full bg-feud-slate-card/70 backdrop-blur-md border border-feud-slate-border rounded-2xl sm:rounded-3xl p-4 sm:p-5 2xl:p-6 text-center shadow-xl flex flex-col items-center justify-center">
            <h3 className="text-lg sm:text-xl font-bold text-white mb-1">{t.host.waitingPlayers}</h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xs mx-auto mb-3">
              {t.joinRoom.subtitle}
            </p>

            {/* High-Contrast QR Code Card */}
            <div className="p-2.5 sm:p-3 bg-white rounded-xl shadow-xl border-2 sm:border-3 border-feud-gold/40 flex flex-col items-center justify-center transition-transform hover:scale-105 duration-200">
              <QRCodeSVG
                value={joinUrl}
                size={140}
                level="H"
                includeMargin={false}
                fgColor="#0f172a"
                bgColor="#ffffff"
                data-testid="host-qr-code"
                className="w-28 h-28 sm:w-32 sm:h-32 2xl:w-36 2xl:h-36"
              />
            </div>

            {/* Scan to Join Instruction */}
            <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-feud-gold px-3 py-1 rounded-full bg-feud-gold/10 border border-feud-gold/20">
              <Smartphone className="w-3.5 h-3.5 text-feud-gold" />
              <span data-testid="host-scan-instruction">{t.joinRoom.scanToJoin}</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Main Game Mode: Standard full-width blocks */}
          <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-feud-slate-border/80 pb-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-feud-gold/20 text-feud-gold border border-feud-gold/30">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white">{t.lobby.rosterTitle}</h3>
                  <p className="text-xs text-slate-300">{t.lobby.mainGameCapacity}</p>
                </div>
              </div>

              {/* Live Player Count Badge */}
              <div
                data-testid="host-roster-count"
                className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-feud-blue-light/50 border border-feud-blue-glow/40 text-blue-200"
              >
                {playerCount} / {maxPlayers} Players
              </div>
            </div>

            {/* Player Roster Grid */}
            {players.length === 0 ? (
              <div
                data-testid="host-empty-roster"
                className="text-center py-8 text-slate-400 text-sm italic border border-dashed border-slate-700/60 rounded-2xl mb-6"
              >
                {t.host.waitingPlayers}
              </div>
            ) : (
              <div
                data-testid="host-player-roster"
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 gap-3 mb-6"
              >
                {players.map((p) => (
                  <div
                    key={p.id}
                    data-testid={`host-player-card-${p.nickname}`}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                      p.isConnected
                        ? 'bg-slate-800/80 border-slate-700/80 text-white shadow-md'
                        : 'bg-slate-900/40 border-red-900/30 text-slate-500 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-3 h-3 rounded-full shrink-0 ${
                          p.isConnected
                            ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]'
                            : 'bg-red-500'
                        }`}
                      />
                      <span className="font-bold text-sm truncate">{p.nickname}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                          p.isConnected
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
                        <UserX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Dynamic Start Game Button */}
            <div className="flex flex-col items-center pt-2">
              <button
                type="button"
                data-testid="host-start-game-btn"
                disabled={!canStart}
                onClick={handleStartGame}
                className={`w-full sm:w-auto min-w-[280px] flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-extrabold text-lg uppercase tracking-wider transition-all duration-200 ${
                  canStart
                    ? 'bg-gradient-to-r from-feud-gold via-yellow-400 to-amber-500 text-slate-950 shadow-[0_0_25px_rgba(245,158,11,0.5)] hover:scale-105 cursor-pointer animate-pulse'
                    : 'bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                }`}
              >
                <Play className="w-5 h-5 fill-current" />
                <span>
                  {canStart && playerCount > 0
                    ? t.lobby.startGameWithCount.replace('{count}', String(playerCount))
                    : t.lobby.startGame}
                </span>
              </button>

              {!canStart && (
                <p
                  data-testid="host-start-disabled-reason"
                  className="text-xs text-amber-400/90 font-medium mt-3 flex items-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{disabledReason}</span>
                </p>
              )}
            </div>
          </div>

          {/* Lobby Invitation & QR Code Screen */}
          <div className="w-full bg-feud-slate-card/70 backdrop-blur-md border border-feud-slate-border rounded-3xl p-8 text-center shadow-xl flex flex-col items-center">
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">{t.host.waitingPlayers}</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
              {t.joinRoom.subtitle}
            </p>

            {/* High-Contrast QR Code Card */}
            <div className="p-4 bg-white rounded-2xl shadow-2xl border-4 border-feud-gold/40 flex flex-col items-center justify-center transition-transform hover:scale-105 duration-200">
              <QRCodeSVG
                value={joinUrl}
                size={180}
                level="H"
                includeMargin={false}
                fgColor="#0f172a"
                bgColor="#ffffff"
                data-testid="host-qr-code"
                className="w-40 h-40 sm:w-44 sm:h-44 2xl:w-52 2xl:h-52 3xl:w-60 3xl:h-60"
              />
            </div>

            {/* Scan to Join Instruction */}
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-feud-gold px-4 py-2 rounded-full bg-feud-gold/10 border border-feud-gold/20">
              <Smartphone className="w-4 h-4 text-feud-gold" />
              <span data-testid="host-scan-instruction">{t.joinRoom.scanToJoin}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HostBoard;
