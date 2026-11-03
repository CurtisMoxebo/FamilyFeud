import React, { useState } from 'react';
import { resumeAudioContext } from '../utils/soundEffects';
import { saveHostSecret } from '../utils/sessionStorage';
import { Language, GameMode, Room } from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { LanguageSelector } from './LanguageSelector';
import { GameModeCard } from './GameModeCard';
import { Sparkles, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

export interface RoomCreateFormProps {
  onRoomCreated?: (room: Room) => void;
  apiBaseUrl?: string;
  defaultLanguage?: Language;
  defaultGameMode?: GameMode;
}

export const RoomCreateForm: React.FC<RoomCreateFormProps> = ({
  onRoomCreated,
  apiBaseUrl = import.meta.env.VITE_BACKEND_URL
    ? `${import.meta.env.VITE_BACKEND_URL}/api`
    : '/api',
  defaultLanguage = 'EN',
  defaultGameMode = 'FAST_MONEY',
}) => {
  const { language, setLanguage, t } = useTranslation();

  const [selectedLanguage, setSelectedLanguage] = useState<Language>(
    language || defaultLanguage
  );
  const [selectedGameMode, setSelectedGameMode] = useState<GameMode>(defaultGameMode);
  const [roomName, setRoomName] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // When language is selected, update both local state and global i18n context
  const handleLanguageChange = (newLanguage: Language) => {
    setSelectedLanguage(newLanguage);
    setLanguage(newLanguage);
  };

  const validateInput = (): boolean => {
    const trimmed = roomName.trim();
    if (!trimmed || trimmed.length < 3 || trimmed.length > 50) {
      setErrorMessage(t.createRoom.validationErrorEmpty);
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resumeAudioContext();

    if (!validateInput()) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomName: roomName.trim(),
          language: selectedLanguage,
          gameMode: selectedGameMode,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to create room');
      }

      const secret = data.hostSecret || data.room?.hostSecret;
      if (secret) {
        saveHostSecret(secret, data.room?.roomCode);
      }

      if (onRoomCreated) {
        onRoomCreated(data.room);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected network error occurred';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-3xl p-6 sm:p-8 shadow-2xl">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-feud-gold-light via-feud-gold to-yellow-200">
          {t.createRoom.heading}
        </h2>
        <p className="text-sm text-slate-300 mt-2">{t.createRoom.subheading}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {/* Step 1: Language Selection */}
        <section aria-labelledby="step-language-title">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-feud-gold/20 text-feud-gold font-bold text-xs flex items-center justify-center border border-feud-gold/40">
              1
            </span>
            <h3 id="step-language-title" className="text-base font-bold text-white uppercase tracking-wider">
              {t.createRoom.step1Title}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mb-3 ml-8">{t.createRoom.step1Desc}</p>
          <LanguageSelector
            selectedLanguage={selectedLanguage}
            onSelectLanguage={handleLanguageChange}
            disabled={isLoading}
          />
        </section>

        {/* Step 2: Game Mode Selection */}
        <section aria-labelledby="step-mode-title">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-feud-gold/20 text-feud-gold font-bold text-xs flex items-center justify-center border border-feud-gold/40">
              2
            </span>
            <h3 id="step-mode-title" className="text-base font-bold text-white uppercase tracking-wider">
              {t.createRoom.step2Title}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mb-3 ml-8">{t.createRoom.step2Desc}</p>

          <div
            role="radiogroup"
            aria-label="Game mode selection"
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <GameModeCard
              mode="FAST_MONEY"
              title={t.gameModes.fastMoneyTitle}
              badge={t.gameModes.fastMoneyBadge}
              description={t.gameModes.fastMoneyDesc}
              isSelected={selectedGameMode === 'FAST_MONEY'}
              onSelect={setSelectedGameMode}
              disabled={isLoading}
            />

            <GameModeCard
              mode="MAIN_GAME"
              title={t.gameModes.mainGameTitle}
              badge={t.gameModes.mainGameBadge}
              description={t.gameModes.mainGameDesc}
              isSelected={selectedGameMode === 'MAIN_GAME'}
              onSelect={setSelectedGameMode}
              disabled={isLoading}
            />
          </div>
        </section>

        {/* Step 3: Room Name */}
        <section aria-labelledby="step-name-title">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-feud-gold/20 text-feud-gold font-bold text-xs flex items-center justify-center border border-feud-gold/40">
              3
            </span>
            <h3 id="step-name-title" className="text-base font-bold text-white uppercase tracking-wider">
              {t.createRoom.step3Title}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mb-3 ml-8">{t.createRoom.step3Desc}</p>

          <div className="space-y-2">
            <label htmlFor="room-name-input" className="block text-sm font-medium text-slate-200">
              {t.createRoom.roomNameLabel}
            </label>
            <input
              id="room-name-input"
              type="text"
              name="roomName"
              value={roomName}
              disabled={isLoading}
              onChange={(e) => {
                setRoomName(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder={t.createRoom.roomNamePlaceholder}
              data-testid="room-name-input"
              maxLength={50}
              className={`w-full px-4 py-3.5 rounded-xl bg-feud-slate border text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                errorMessage
                  ? 'border-feud-red focus:ring-feud-red/50'
                  : 'border-feud-slate-border focus:border-feud-gold focus:ring-feud-gold/40'
              }`}
            />
            <div className="flex justify-between items-center text-xs text-slate-400 px-1">
              <span>{t.createRoom.roomNameHelp}</span>
              <span>{roomName.length}/50</span>
            </div>
          </div>
        </section>

        {/* Error Alert Box */}
        {errorMessage && (
          <div
            role="alert"
            data-testid="room-create-error"
            className="flex items-center gap-3 p-4 rounded-xl bg-red-950/80 border border-feud-red/50 text-red-200 animate-strike-shake"
          >
            <AlertCircle className="w-5 h-5 text-feud-red shrink-0" />
            <span className="text-sm font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          data-testid="create-room-submit-btn"
          className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-gradient-to-r from-feud-gold via-feud-gold-light to-amber-400 text-slate-950 font-extrabold text-lg tracking-wider uppercase shadow-xl shadow-feud-gold/20 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-slate-950" />
              <span>{t.createRoom.submitting}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              <span>{t.createRoom.submitButton}</span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default RoomCreateForm;

