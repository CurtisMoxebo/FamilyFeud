import React, { useEffect, useState } from 'react';
import { AssignedTeamPlayer } from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { Tv, Swords, ArrowLeft, Sparkles, Shield, Play } from 'lucide-react';

export interface MainGameTeamsStageProps {
  roomCode: string;
  roomName: string;
  team1: AssignedTeamPlayer[];
  team2: AssignedTeamPlayer[];
  onLeave?: () => void;
  onProceedToFaceOff?: () => void;
}

export const MainGameTeamsStage: React.FC<MainGameTeamsStageProps> = ({
  roomCode,
  roomName,
  team1,
  team2,
  onLeave,
  onProceedToFaceOff,
}) => {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState<number>(10);

  useEffect(() => {
    if (!onProceedToFaceOff) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onProceedToFaceOff();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onProceedToFaceOff]);

  return (
    <div
      data-testid="main-game-teams-stage"
      className="w-full h-full max-h-full max-w-5xl 2xl:max-w-7xl 3xl:max-w-[1600px] 4k:max-w-[2000px] flex flex-col items-center justify-between overflow-hidden animate-fadeIn"
    >
      {/* Stage Header Banner */}
      <div className="w-full bg-feud-slate-card/90 backdrop-blur-xl border border-feud-slate-border rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 2xl:p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-feud-slate-border/80 pb-2 sm:pb-2.5">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="p-1.5 sm:p-2 rounded-xl bg-feud-blue-light/50 border border-feud-blue-glow/30 text-feud-gold">
              <Tv className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-feud-gold px-2.5 py-0.5 rounded-full bg-feud-gold/10 border border-feud-gold/20">
                  {t.host.hostBoard}
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-green-400 px-2.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                  ACTIVE
                </span>
                <span
                  data-testid="teams-stage-room-code"
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

          {onLeave && (
            <button
              type="button"
              onClick={onLeave}
              data-testid="teams-stage-back-btn"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t.lobby.leaveLobby}</span>
            </button>
          )}
        </div>

        {/* Stage Title and Announcement */}
        <div className="mt-2 text-center">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-feud-gold/10 border border-feud-gold/30 text-feud-gold text-[10px] font-bold uppercase tracking-widest mb-1">
            <Sparkles className="w-3 h-3" />
            <span>{t.lobby.rosterTitle}</span>
          </div>
          <h2
            data-testid="teams-assigned-title"
            className="text-xl sm:text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-feud-gold-light via-feud-gold to-yellow-200 tracking-wide drop-shadow-md"
          >
            {t.mainGame.teamsAssignedTitle}
          </h2>
          <p
            data-testid="teams-assigned-subtitle"
            className="text-slate-300 text-xs mt-0.5 max-w-xl mx-auto"
          >
            {t.mainGame.teamsAssignedSubtitle}
          </p>
        </div>
      </div>

      {/* Dual Column Teams Grid with VS Emblem */}
      <div className="w-full flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-2.5 sm:gap-4 overflow-hidden my-1">
        {/* Team 1 Column (Blue Accent) */}
        <div
          data-testid="team-1-column"
          className="flex flex-col bg-slate-900/85 border-2 border-blue-500/40 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 shadow-[0_0_30px_rgba(59,130,246,0.15)] backdrop-blur-xl relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 via-sky-400 to-blue-500" />
          
          <div className="flex items-center justify-between border-b border-blue-500/20 pb-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3
                  data-testid="team-1-title"
                  className="text-lg sm:text-xl font-black text-blue-400 tracking-wide"
                >
                  {t.mainGame.team1}
                </h3>
                <span className="text-[11px] text-blue-300/80 font-medium">
                  {team1.length} Players
                </span>
              </div>
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
          </div>

          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto justify-start pr-1">
            {team1.map((player) => (
              <div
                key={player.id}
                data-testid={`team-1-player-${player.id}`}
                className="flex items-center justify-between p-2 sm:p-2.5 rounded-xl bg-slate-800/90 border border-blue-500/30 shadow-md transition-all hover:border-blue-400/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    data-testid="team-1-batting-order"
                    className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-extrabold text-xs uppercase tracking-wider border border-blue-400/30 shrink-0"
                  >
                    {t.mainGame.playerOrder.replace('{order}', String(player.battingOrder))}
                  </span>
                  <span
                    data-testid="team-1-player-name"
                    className="text-white font-extrabold text-sm sm:text-base truncate"
                  >
                    {player.nickname || player.id}
                  </span>
                </div>
                <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Center VS Emblem */}
        <div
          data-testid="versus-emblem"
          className="flex md:flex-col items-center justify-center my-1 md:my-0"
        >
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-feud-gold/20 blur-xl animate-pulse" />
            <div className="relative w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-feud-gold via-yellow-400 to-amber-500 flex items-center justify-center shadow-[0_0_25px_rgba(245,158,11,0.6)] border-3 border-slate-950">
              <span className="text-lg sm:text-2xl font-black font-game text-slate-950 tracking-wider">
                {t.mainGame.versus}
              </span>
            </div>
          </div>
        </div>

        {/* Team 2 Column (Red/Rose Accent) */}
        <div
          data-testid="team-2-column"
          className="flex flex-col bg-slate-900/85 border-2 border-rose-500/40 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 shadow-[0_0_30px_rgba(244,63,94,0.15)] backdrop-blur-xl relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-600 via-pink-400 to-rose-500" />

          <div className="flex items-center justify-between border-b border-rose-500/20 pb-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3
                  data-testid="team-2-title"
                  className="text-lg sm:text-xl font-black text-rose-400 tracking-wide"
                >
                  {t.mainGame.team2}
                </h3>
                <span className="text-[11px] text-rose-300/80 font-medium">
                  {team2.length} Players
                </span>
              </div>
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]" />
          </div>

          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto justify-start pr-1">
            {team2.map((player) => (
              <div
                key={player.id}
                data-testid={`team-2-player-${player.id}`}
                className="flex items-center justify-between p-2 sm:p-2.5 rounded-xl bg-slate-800/90 border border-rose-500/30 shadow-md transition-all hover:border-rose-400/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    data-testid="team-2-batting-order"
                    className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-extrabold text-xs uppercase tracking-wider border border-rose-400/30 shrink-0"
                  >
                    {t.mainGame.playerOrder.replace('{order}', String(player.battingOrder))}
                  </span>
                  <span
                    data-testid="team-2-player-name"
                    className="text-white font-extrabold text-sm sm:text-base truncate"
                  >
                    {player.nickname || player.id}
                  </span>
                </div>
                <div className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Face-Off Banner & Start Face-Off Action */}
      <div
        data-testid="face-off-banner"
        className="w-full bg-gradient-to-r from-feud-blue via-feud-blue-dark to-feud-blue border border-feud-gold/40 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-center shadow-xl flex flex-col sm:flex-row items-center justify-between gap-2.5"
      >
        <div className="flex items-center gap-2.5">
          <Swords className="w-5 h-5 text-feud-gold animate-pulse" />
          <span className="text-sm sm:text-base font-black text-white uppercase tracking-wider drop-shadow-md">
            {t.mainGame.readyForFaceOff}
          </span>
          <Sparkles className="w-4 h-4 text-feud-gold" />
        </div>

        {onProceedToFaceOff && (
          <button
            type="button"
            data-testid="start-face-off-btn"
            onClick={onProceedToFaceOff}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-feud-gold via-yellow-400 to-amber-500 text-slate-950 font-extrabold text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.5)] hover:scale-105 transition-all duration-200 cursor-pointer animate-pulse"
          >
            <Play className="w-3.5 h-3.5 fill-slate-950" />
            <span>{t.mainGame.startFaceOffBtn} ({countdown}s)</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default MainGameTeamsStage;
