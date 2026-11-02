import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Room } from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { useRouter } from '../router/router';
import { useSocket } from '../hooks/useSocket';
import {
  Tv,
  Users,
  Zap,
  Globe,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Sparkles,
  Smartphone,
  Play,
} from 'lucide-react';

export interface HostBoardProps {
  roomCode: string;
  initialRoom?: Room | null;
  apiBaseUrl?: string;
  onStartGame?: () => void;
}

export const HostBoard: React.FC<HostBoardProps> = ({
  roomCode,
  initialRoom = null,
  apiBaseUrl = import.meta.env.VITE_BACKEND_URL
    ? `${import.meta.env.VITE_BACKEND_URL}/api`
    : '/api',
  onStartGame,
}) => {
  const { setLanguage, t } = useTranslation();
  const { navigate } = useRouter();

  const [room, setRoom] = useState<Room | null>(initialRoom);
  const [isLoading, setIsLoading] = useState<boolean>(!initialRoom);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Live real-time socket connection for host display (US-04)
  const { roomState } = useSocket({
    roomCode,
    isHost: true,
    autoJoin: true,
  });

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

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  // Live roster and capacity state calculation (US-04)
  const players = roomState?.players ?? room.players ?? [];
  const connectedPlayers = players.filter((p) => p.isConnected);
  const playerCount = roomState?.playerCount ?? connectedPlayers.length;
  const maxPlayers = roomState?.maxPlayers ?? (isFastMoney ? 2 : 10);

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
    ? t.lobby.mainGameCurrentWaiting.replace('{count}', String(playerCount))
    : t.lobby.mainGameEvenCountRequired;

  return (
    <div className="w-full max-w-4xl flex flex-col items-center gap-8">
      {/* Host TV Header Banner */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-feud-slate-border/80 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-feud-blue-light/50 border border-feud-blue-glow/30 text-feud-gold">
              <Tv className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-feud-gold px-2.5 py-0.5 rounded-full bg-feud-gold/10 border border-feud-gold/20">
                  {t.host.hostBoard}
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-green-400 px-2.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                  {roomState?.status ?? room.status}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                {room.roomName}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/')}
            data-testid="host-back-home-btn"
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Leave Lobby</span>
          </button>
        </div>

        {/* Room Code Display */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-6 p-6 rounded-2xl bg-gradient-to-r from-feud-blue-dark via-feud-blue to-feud-blue-dark border border-feud-gold/40 shadow-inner">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-300">
              {t.host.roomCode}
            </div>
            <div
              data-testid="host-room-code"
              className="text-4xl sm:text-6xl font-extrabold font-game text-transparent bg-clip-text bg-gradient-to-r from-feud-gold-light via-feud-gold to-yellow-200 tracking-wider mt-1 drop-shadow-md select-all"
            >
              {room.roomCode}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyLink}
              data-testid="host-copy-link-btn"
              title={t.host.shareLink}
              aria-label={t.host.shareLink}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-feud-gold/20 hover:bg-feud-gold/30 border border-feud-gold/50 text-feud-gold font-bold text-sm transition-all cursor-pointer"
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
          {/* Language Badge */}
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60">
            <Globe className="w-5 h-5 text-feud-gold shrink-0" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">
                {t.host.language}
              </div>
              <div data-testid="host-room-language" className="text-sm font-bold text-white">
                {room.language === 'FR'
                  ? 'Français (FR)'
                  : room.language === 'ES'
                  ? 'Español (ES)'
                  : 'English (EN)'}
              </div>
            </div>
          </div>

          {/* Game Mode Badge */}
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60">
            {isFastMoney ? (
              <Zap className="w-5 h-5 text-feud-gold shrink-0" />
            ) : (
              <Users className="w-5 h-5 text-feud-gold shrink-0" />
            )}
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">
                {t.host.gameMode}
              </div>
              <div data-testid="host-room-mode" className="text-sm font-bold text-white">
                {isFastMoney ? t.gameModes.fastMoneyTitle : t.gameModes.mainGameTitle}
              </div>
            </div>
          </div>

          {/* Player Capacity Badge */}
          <div className="col-span-2 sm:col-span-1 flex items-center gap-3 p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60">
            <Users className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Capacity</div>
              <div className="text-sm font-bold text-white">
                {isFastMoney ? t.lobby.fastMoneyCapacity : t.lobby.mainGameCapacity}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connected Players Roster & Capacity Control (US-04) */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-feud-slate-border/80 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-feud-gold/20 text-feud-gold border border-feud-gold/30">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-white">{t.lobby.rosterTitle}</h3>
              <p className="text-xs text-slate-300">
                {isFastMoney ? t.lobby.fastMoneyCapacity : t.lobby.mainGameCapacity}
              </p>
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
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6"
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
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                    p.isConnected
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {p.isConnected ? t.lobby.statusReady : t.lobby.statusDisconnected}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Dynamic Start Game Button (Scenario 3) */}
        <div className="flex flex-col items-center pt-2">
          <button
            type="button"
            data-testid="host-start-game-btn"
            disabled={!canStart}
            onClick={onStartGame}
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

          {/* Helper tip explaining why start is locked */}
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
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t.app.poweredBy}</span>
        </div>
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
            className="w-40 h-40 sm:w-44 sm:h-44"
          />
        </div>

        {/* Scan to Join Instruction */}
        <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-feud-gold px-4 py-2 rounded-full bg-feud-gold/10 border border-feud-gold/20">
          <Smartphone className="w-4 h-4 text-feud-gold" />
          <span data-testid="host-scan-instruction">{t.joinRoom.scanToJoin}</span>
        </div>

        {/* Direct Link Share Pill */}
        <div className="mt-4 flex items-center gap-2 max-w-md w-full justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs font-mono text-slate-300">
          <span className="truncate">{joinUrl}</span>
          <button
            type="button"
            onClick={handleCopyLink}
            data-testid="host-direct-link-copy-btn"
            className="shrink-0 p-1.5 rounded-lg hover:bg-slate-800 text-feud-gold transition-colors cursor-pointer"
            title={t.host.copyLink}
            aria-label={t.host.copyLink}
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HostBoard;
