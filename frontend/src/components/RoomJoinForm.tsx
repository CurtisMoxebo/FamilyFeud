import React, { useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import { useRouter } from '../router/router';
import { Hash, User, ArrowRight, AlertCircle, LogIn } from 'lucide-react';

export interface RoomJoinFormProps {
  onJoinSubmitted?: (data: { roomCode: string; nickname: string }) => void;
  defaultRoomCode?: string;
}

export const ROOM_CODE_REGEX = /^FEUD-[2-9A-HJ-NP-Z]{4}$/i;

/**
 * Normalizes input: if user enters 4 alphanumeric characters directly (e.g. "8293"),
 * automatically prepends "FEUD-".
 */
export function normalizeRoomCodeInput(input: string): string {
  const clean = input.trim().toUpperCase();
  if (/^[A-Z0-9]{4}$/i.test(clean)) {
    return `FEUD-${clean}`;
  }
  return clean;
}

export const RoomJoinForm: React.FC<RoomJoinFormProps> = ({
  onJoinSubmitted,
  defaultRoomCode = '',
}) => {
  const { t } = useTranslation();
  const { navigate } = useRouter();

  const [roomCode, setRoomCode] = useState<string>(defaultRoomCode);
  const [nickname, setNickname] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedCode = normalizeRoomCodeInput(roomCode);
    const trimmedNickname = nickname.trim();

    // 1. Validate Room Code Format
    if (!normalizedCode || !ROOM_CODE_REGEX.test(normalizedCode)) {
      setErrorMessage(t.joinRoom.validationErrorRoomCode);
      return;
    }

    // 2. Validate Nickname Length
    if (trimmedNickname.length < 2 || trimmedNickname.length > 20) {
      setErrorMessage(t.joinRoom.validationErrorNickname);
      return;
    }

    setErrorMessage(null);

    // Persist nickname for room session
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`feud_nickname_${normalizedCode}`, trimmedNickname);
    }

    if (onJoinSubmitted) {
      onJoinSubmitted({ roomCode: normalizedCode, nickname: trimmedNickname });
    }

    navigate(`/play/${normalizedCode}`);
  };

  return (
    <div className="w-full max-w-xl bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 shadow-2xl animate-fade-in">
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide">
          {t.joinRoom.title}
        </h2>
        <p className="text-sm text-slate-300 mt-1">{t.joinRoom.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Room Code Input */}
        <div>
          <label
            htmlFor="join-room-code-input"
            className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2"
          >
            {t.joinRoom.roomCodeLabel}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Hash className="w-5 h-5 text-feud-gold" />
            </div>
            <input
              id="join-room-code-input"
              type="text"
              data-testid="join-room-code-input"
              value={roomCode}
              onChange={(e) => {
                setRoomCode(e.target.value.toUpperCase());
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder={t.joinRoom.roomCodePlaceholder}
              maxLength={9}
              autoComplete="off"
              className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white placeholder-slate-500 font-mono font-bold text-lg tracking-wider focus:outline-none focus:ring-2 focus:ring-feud-gold/50 focus:border-feud-gold transition-all uppercase"
            />
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Format: FEUD-XXXX (e.g. FEUD-8293)
          </span>
        </div>

        {/* Nickname Input */}
        <div>
          <label
            htmlFor="join-nickname-input"
            className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2"
          >
            {t.joinRoom.nicknameLabel}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-5 h-5 text-feud-gold" />
            </div>
            <input
              id="join-nickname-input"
              type="text"
              data-testid="join-nickname-input"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder={t.joinRoom.nicknamePlaceholder}
              maxLength={20}
              autoComplete="off"
              className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white placeholder-slate-500 font-medium text-base focus:outline-none focus:ring-2 focus:ring-feud-gold/50 focus:border-feud-gold transition-all"
            />
          </div>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div
            data-testid="join-form-error-banner"
            className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-950/80 border border-feud-red/50 text-red-200 text-xs font-medium animate-shake"
          >
            <AlertCircle className="w-4 h-4 text-feud-red shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          data-testid="join-form-submit-btn"
          className="w-full mt-2 flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-extrabold text-base uppercase tracking-wider bg-gradient-to-r from-feud-gold to-yellow-500 hover:from-yellow-400 hover:to-feud-gold text-slate-950 shadow-lg shadow-feud-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
        >
          <LogIn className="w-5 h-5" />
          <span>{t.joinRoom.joinButton}</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
};

export default RoomJoinForm;
