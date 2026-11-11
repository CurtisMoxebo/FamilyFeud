import React from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import { Sparkles, Flame } from 'lucide-react';

export interface MainGameScoreboardHeaderProps {
  team1GrandTotal: number;
  team2GrandTotal: number;
  activeRoundBank?: number;
  currentRoundNumber: number;
  totalRounds: number;
  isSuddenDeath?: boolean;
  highlightTeam?: 'TEAM_1' | 'TEAM_2' | null;
  compact?: boolean;
  showYourTeamBadge?: boolean;
  className?: string;
}

export const MainGameScoreboardHeader: React.FC<MainGameScoreboardHeaderProps> = ({
  team1GrandTotal,
  team2GrandTotal,
  activeRoundBank = 0,
  currentRoundNumber,
  totalRounds,
  isSuddenDeath = false,
  highlightTeam = null,
  compact = false,
  showYourTeamBadge = !compact,
  className = '',
}) => {
  const { t } = useTranslation();

  const isTeam1Highlighted = highlightTeam === 'TEAM_1';
  const isTeam2Highlighted = highlightTeam === 'TEAM_2';

  return (
    <div
      data-testid="grand-total-header"
      className={`w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-xl backdrop-blur-md select-none ${
        compact ? 'p-2.5 sm:p-3' : 'p-3.5 sm:p-4'
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Team 1 Cumulative Total Card */}
        <div
          data-testid="team1-grand-total-card"
          className={`flex-1 flex items-center gap-2 sm:gap-3 rounded-xl transition-all duration-300 ${
            compact ? 'p-2' : 'px-3.5 py-2.5'
          } ${
            isTeam1Highlighted
              ? 'bg-gradient-to-r from-blue-900/80 to-blue-800/60 border-2 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)] ring-2 ring-blue-400/40'
              : 'bg-gradient-to-r from-blue-950/70 to-slate-900/60 border border-blue-600/30'
          }`}
        >
          <div
            className={`rounded-full flex items-center justify-center font-black text-white shrink-0 ${
              compact ? 'w-7 h-7 text-xs bg-blue-600' : 'w-9 h-9 text-sm bg-blue-500 shadow'
            }`}
          >
            1
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-blue-300 truncate">
                {t.mainGame.team1}
              </span>
              {isTeam1Highlighted && showYourTeamBadge && (
                <span
                  data-testid="your-team-badge"
                  className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-blue-400 text-slate-950 tracking-wider shadow"
                >
                  {t.mainGame.yourTeam}
                </span>
              )}
            </div>
            <div
              className={`font-black text-white tracking-tight flex items-baseline gap-1 ${
                compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
              }`}
            >
              <span data-testid="team1-grand-total">{team1GrandTotal}</span>
              <span className="text-[10px] font-semibold text-blue-300/80">PTS</span>
            </div>
          </div>
        </div>

        {/* Center Round Bank & Round Progress Indicator (Scenario 2 Dual Tally) */}
        <div className="flex flex-col items-center justify-center shrink-0 text-center px-1">
          <span
            data-testid="round-progress-indicator"
            className={`font-black uppercase tracking-wider rounded-full border shadow-sm ${
              compact ? 'text-[10px] px-2 py-0.5' : 'text-xs px-3 py-1'
            } ${
              isSuddenDeath
                ? 'bg-red-600/30 border-red-500 text-red-300 animate-pulse'
                : 'bg-indigo-600/30 border-indigo-500/70 text-indigo-300'
            }`}
          >
            {isSuddenDeath ? (
              <span className="flex items-center gap-1">
                <Flame className="w-3 h-3 text-red-400 animate-bounce" />
                {t.mainGame.suddenDeathTitle}
              </span>
            ) : (
              t.mainGame.roundProgress
                .replace('{current}', String(currentRoundNumber))
                .replace('{total}', String(totalRounds))
            )}
          </span>

          {/* Active Round Bank Distinction */}
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t.mainGame.roundBank}:
            </span>
            <span
              data-testid="header-round-bank"
              className="text-xs sm:text-sm font-black text-yellow-400 flex items-center gap-0.5"
            >
              <Sparkles className="w-3 h-3 text-yellow-400" />
              <span data-testid="active-round-bank">{activeRoundBank}</span> PTS
            </span>
          </div>
        </div>

        {/* Team 2 Cumulative Total Card */}
        <div
          data-testid="team2-grand-total-card"
          className={`flex-1 flex items-center justify-end gap-2 sm:gap-3 rounded-xl text-right transition-all duration-300 ${
            compact ? 'p-2' : 'px-3.5 py-2.5'
          } ${
            isTeam2Highlighted
              ? 'bg-gradient-to-l from-emerald-900/80 to-emerald-800/60 border-2 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)] ring-2 ring-emerald-400/40'
              : 'bg-gradient-to-l from-emerald-950/70 to-slate-900/60 border border-emerald-600/30'
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-end gap-1.5 flex-wrap">
              {isTeam2Highlighted && showYourTeamBadge && (
                <span
                  data-testid="your-team-badge"
                  className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-emerald-400 text-slate-950 tracking-wider shadow"
                >
                  {t.mainGame.yourTeam}
                </span>
              )}
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-300 truncate">
                {t.mainGame.team2}
              </span>
            </div>
            <div
              className={`font-black text-white tracking-tight flex items-baseline justify-end gap-1 ${
                compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
              }`}
            >
              <span data-testid="team2-grand-total">{team2GrandTotal}</span>
              <span className="text-[10px] font-semibold text-emerald-300/80">PTS</span>
            </div>
          </div>
          <div
            className={`rounded-full flex items-center justify-center font-black text-white shrink-0 ${
              compact ? 'w-7 h-7 text-xs bg-emerald-600' : 'w-9 h-9 text-sm bg-emerald-500 shadow'
            }`}
          >
            2
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainGameScoreboardHeader;

