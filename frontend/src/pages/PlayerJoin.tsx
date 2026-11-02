import React, { useState, useEffect } from 'react';
import { Room } from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { useRouter } from '../router/router';
import {
  User,
  ArrowRight,
  AlertCircle,
  Loader2,
  Globe,
  Zap,
  Users,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

export interface PlayerJoinProps {
  roomCode: string;
  initialRoom?: Room | null;
  apiBaseUrl?: string;
  onJoined?: (playerData: { room: Room; nickname: string }) => void;
}

export const PlayerJoin: React.FC<PlayerJoinProps> = ({
  roomCode,
  initialRoom = null,
  apiBaseUrl = import.meta.env.VITE_BACKEND_URL
    ? `${import.meta.env.VITE_BACKEND_URL}/api`
    : '/api',
  onJoined,
}) => {
  const { setLanguage, t } = useTranslation();
  const { navigate } = useRouter();

  const [room, setRoom] = useState<Room | null>(initialRoom);
  const [isLoading, setIsLoading] = useState<boolean>(!initialRoom);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [isJoined, setIsJoined] = useState<boolean>(false);

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
          throw new Error(data.error || 'Room not found or session has ended');
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
          setError(err.message || 'Room not found or session has ended');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [roomCode, initialRoom, apiBaseUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nickname.trim();

    if (trimmed.length < 2 || trimmed.length > 20) {
      setValidationError(t.joinRoom.validationErrorNickname);
      return;
    }

    setValidationError(null);
    setIsJoining(true);

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`feud_nickname_${roomCode.toUpperCase()}`, trimmed);
    }

    if (room && onJoined) {
      onJoined({ room, nickname: trimmed });
    }

    setTimeout(() => {
      setIsJoining(false);
      setIsJoined(true);
    }, 250);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
        <Loader2 className="w-12 h-12 text-feud-gold animate-spin mb-4" />
        <p className="text-lg text-slate-300 font-medium">Connecting to Room...</p>
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
        <p className="text-slate-300 text-sm mb-6">{error || t.joinRoom.roomNotFound}</p>
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

  if (isJoined) {
    return (
      <div className="max-w-md w-full bg-feud-slate-card/90 backdrop-blur-xl border border-green-500/30 rounded-3xl p-8 text-center shadow-2xl animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-green-500/20 text-green-400 mx-auto flex items-center justify-center mb-4">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-extrabold text-white mb-2">Welcome, {nickname.trim()}!</h2>
        <p className="text-slate-300 text-sm mb-4">
          You are now registered for <span className="font-bold text-feud-gold">{room.roomName}</span>.
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-300 mb-6">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
          <span>Waiting for Host to begin...</span>
        </div>
      </div>
    );
  }

  const isFastMoney = room.gameMode === 'FAST_MONEY';

  return (
    <div className="w-full max-w-md flex flex-col items-center">
      {/* Room Header Card */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 shadow-2xl mb-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-feud-gold/20 border border-feud-gold/40 text-feud-gold text-xs font-bold tracking-widest uppercase mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{room.roomCode}</span>
          </div>
          <h1
            data-testid="player-room-name"
            className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide"
          >
            {room.roomName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">{t.joinRoom.subtitle}</p>
        </div>

        {/* Room Badges Row */}
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <Globe className="w-4 h-4 text-feud-gold shrink-0" />
            <div className="truncate">
              <div className="text-[10px] uppercase font-bold text-slate-400">
                {t.host.language}
              </div>
              <div
                data-testid="player-room-language"
                className="text-xs font-bold text-white truncate"
              >
                {room.language === 'FR'
                  ? 'Français (FR)'
                  : room.language === 'ES'
                  ? 'Español (ES)'
                  : 'English (EN)'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
            {isFastMoney ? (
              <Zap className="w-4 h-4 text-feud-gold shrink-0" />
            ) : (
              <Users className="w-4 h-4 text-feud-gold shrink-0" />
            )}
            <div className="truncate">
              <div className="text-[10px] uppercase font-bold text-slate-400">
                {t.host.gameMode}
              </div>
              <div data-testid="player-room-mode" className="text-xs font-bold text-white truncate">
                {isFastMoney ? t.gameModes.fastMoneyTitle : t.gameModes.mainGameTitle}
              </div>
            </div>
          </div>
        </div>

        {/* Join Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="nickname-input"
              className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2"
            >
              {t.joinRoom.nicknameLabel}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-5 h-5 text-feud-gold" />
              </div>
              <input
                id="nickname-input"
                type="text"
                data-testid="player-nickname-input"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                maxLength={20}
                autoFocus
                autoComplete="off"
                placeholder={t.joinRoom.nicknamePlaceholder}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700 text-white placeholder-slate-500 font-medium text-base focus:outline-none focus:ring-2 focus:ring-feud-gold/50 focus:border-feud-gold transition-all"
              />
            </div>
          </div>

          {/* Validation Error Banner */}
          {validationError && (
            <div
              data-testid="player-validation-error"
              className="flex items-center gap-2.5 p-3 rounded-xl bg-red-950/80 border border-feud-red/50 text-red-200 text-xs font-medium animate-shake"
            >
              <AlertCircle className="w-4 h-4 text-feud-red shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isJoining}
            data-testid="player-join-submit-btn"
            className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-extrabold text-base uppercase tracking-wider bg-gradient-to-r from-feud-gold to-yellow-500 hover:from-yellow-400 hover:to-feud-gold text-slate-950 shadow-lg shadow-feud-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isJoining ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{t.joinRoom.joining}</span>
              </>
            ) : (
              <>
                <span>{t.joinRoom.joinButton}</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PlayerJoin;
