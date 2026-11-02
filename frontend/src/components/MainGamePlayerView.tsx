import React from 'react';
import { AssignedTeamPlayer } from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { Shield, Swords, Sparkles, ArrowLeft, User, Users } from 'lucide-react';

export interface MainGamePlayerViewProps {
  roomCode: string;
  roomName: string;
  playerNickname: string;
  assignedPlayer: AssignedTeamPlayer;
  myTeam: AssignedTeamPlayer[];
  opponentTeam: AssignedTeamPlayer[];
  teamNumber: 1 | 2;
  onLeave?: () => void;
}

export const MainGamePlayerView: React.FC<MainGamePlayerViewProps> = ({
  roomCode,
  roomName,
  playerNickname,
  assignedPlayer,
  myTeam,
  opponentTeam,
  teamNumber,
  onLeave,
}) => {
  const { t } = useTranslation();

  const isTeam1 = teamNumber === 1;
  const myTeamName = isTeam1 ? t.mainGame.team1 : t.mainGame.team2;
  const opponentTeamName = isTeam1 ? t.mainGame.team2 : t.mainGame.team1;

  const teamThemeClasses = isTeam1
    ? {
        cardBorder: 'border-blue-500/50',
        cardBg: 'bg-gradient-to-b from-blue-950/70 via-slate-900/90 to-slate-900/95',
        shadow: 'shadow-[0_0_30px_rgba(59,130,246,0.25)]',
        accentBg: 'bg-blue-500/20',
        accentBorder: 'border-blue-400/40',
        accentText: 'text-blue-300',
        badgeBg: 'bg-blue-600',
        highlightBg: 'bg-blue-900/40 border-blue-500/40',
        glowDot: 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]',
      }
    : {
        cardBorder: 'border-rose-500/50',
        cardBg: 'bg-gradient-to-b from-rose-950/70 via-slate-900/90 to-slate-900/95',
        shadow: 'shadow-[0_0_30px_rgba(244,63,94,0.25)]',
        accentBg: 'bg-rose-500/20',
        accentBorder: 'border-rose-400/40',
        accentText: 'text-rose-300',
        badgeBg: 'bg-rose-600',
        highlightBg: 'bg-rose-900/40 border-rose-500/40',
        glowDot: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]',
      };

  return (
    <div
      data-testid="player-main-game-team-screen"
      className="w-full max-w-md flex flex-col items-center animate-fadeIn"
    >
      {/* Designated Team Assignment Hero Card */}
      <div
        className={`w-full ${teamThemeClasses.cardBg} border-2 ${teamThemeClasses.cardBorder} rounded-3xl p-6 sm:p-7 ${teamThemeClasses.shadow} backdrop-blur-xl mb-5 text-center relative overflow-hidden`}
      >
        <div
          className={`absolute top-0 left-0 right-0 h-1.5 ${
            isTeam1
              ? 'bg-gradient-to-r from-blue-600 via-sky-400 to-blue-500'
              : 'bg-gradient-to-r from-rose-600 via-pink-400 to-rose-500'
          }`}
        />

        {/* Room & Status Badges */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 shrink-0">
              {roomCode}
            </span>
            <span className="text-xs font-bold text-slate-300 truncate">
              {roomName}
            </span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-green-400 px-2.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 shrink-0">
            ACTIVE
          </span>
        </div>

        {/* Team Shield Emblem */}
        <div className="relative mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mb-3">
          <div
            className={`w-full h-full rounded-2xl ${teamThemeClasses.accentBg} border ${teamThemeClasses.accentBorder} flex items-center justify-center shadow-lg`}
          >
            <Shield className={`w-8 h-8 sm:w-10 sm:h-10 ${teamThemeClasses.accentText}`} />
          </div>
        </div>

        {/* Team Assignment Announcement Badge */}
        <h2
          data-testid="player-team-badge"
          className="text-2xl sm:text-3xl font-black text-white tracking-wide mb-1"
        >
          {t.mainGame.youAreOnTeam.replace('{team}', myTeamName)}
        </h2>

        {/* Player Batting Order Badge */}
        <div className="inline-flex items-center gap-2 mt-2 px-4 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 shadow-inner">
          <User className="w-4 h-4 text-feud-gold" />
          <span
            data-testid="player-batting-order"
            className="text-xs sm:text-sm font-extrabold text-feud-gold uppercase tracking-wider"
          >
            {t.mainGame.playerOrder.replace('{order}', String(assignedPlayer.battingOrder))}
          </span>
        </div>
      </div>

      {/* Your Teammates Roster */}
      <div className="w-full bg-slate-900/85 backdrop-blur-xl border border-slate-800 rounded-2xl p-5 mb-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Users className={`w-4 h-4 ${teamThemeClasses.accentText}`} />
            <h3
              data-testid="teammates-header"
              className="text-sm font-bold uppercase tracking-wider text-slate-200"
            >
              {t.mainGame.teammatesTitle}
            </h3>
          </div>
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-800 text-slate-400">
            {myTeam.length} Players
          </span>
        </div>

        <div data-testid="teammates-roster" className="flex flex-col gap-2">
          {myTeam.map((player) => {
            const isCurrent =
              player.id === assignedPlayer.id ||
              (player.nickname &&
                player.nickname.toLowerCase() === playerNickname.toLowerCase());
            return (
              <div
                key={player.id}
                data-testid={`teammate-item-${player.id}`}
                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                  isCurrent
                    ? `${teamThemeClasses.highlightBg} text-white font-bold`
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    data-testid="teammate-batting-order"
                    className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                      isCurrent
                        ? `${teamThemeClasses.accentBg} ${teamThemeClasses.accentText}`
                        : 'bg-slate-700/60 text-slate-400'
                    }`}
                  >
                    {t.mainGame.playerOrder.replace('{order}', String(player.battingOrder))}
                  </span>
                  <span data-testid="teammate-name" className="truncate">
                    {player.nickname || player.id}
                  </span>
                </div>
                {isCurrent && (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-feud-gold/20 text-feud-gold border border-feud-gold/30">
                    You
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Opponents Roster */}
      <div className="w-full bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 mb-4 text-left">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 mb-2.5">
          <h3
            data-testid="opponents-header"
            className="text-xs font-bold uppercase tracking-wider text-slate-400"
          >
            {t.mainGame.teamRoster.replace('{team}', opponentTeamName)}
          </h3>
          <span className="text-[10px] text-slate-500 font-medium">
            {opponentTeam.length} Players
          </span>
        </div>

        <div data-testid="opponents-roster" className="flex flex-col gap-1.5">
          {opponentTeam.map((player) => (
            <div
              key={player.id}
              data-testid={`opponent-item-${player.id}`}
              className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-800 text-[11px] text-slate-400"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  data-testid="opponent-batting-order"
                  className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold text-[9px]"
                >
                  {t.mainGame.playerOrder.replace('{order}', String(player.battingOrder))}
                </span>
                <span data-testid="opponent-name" className="truncate">
                  {player.nickname || player.id}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Face-Off Announcement Banner */}
      <div
        data-testid="player-face-off-banner"
        className="w-full bg-gradient-to-r from-feud-blue via-feud-blue-dark to-feud-blue border border-feud-gold/40 rounded-2xl p-4 text-center shadow-lg flex items-center justify-center gap-2.5 mb-5 animate-pulse"
      >
        <Swords className="w-5 h-5 text-feud-gold shrink-0" />
        <span className="text-xs sm:text-sm font-extrabold text-white uppercase tracking-wider">
          {t.mainGame.readyForFaceOff}
        </span>
        <Sparkles className="w-4 h-4 text-feud-gold shrink-0" />
      </div>

      {/* Leave Lobby / Back Home */}
      {onLeave && (
        <button
          type="button"
          onClick={onLeave}
          data-testid="player-leave-btn"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white px-4 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t.lobby.backHome}</span>
        </button>
      )}
    </div>
  );
};

export default MainGamePlayerView;
