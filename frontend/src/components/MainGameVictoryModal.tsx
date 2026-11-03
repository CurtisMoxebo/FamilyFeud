import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { MatchOverPayload } from '../types';
import { useTranslation } from '../i18n/LanguageContext';
import { playVictoryFanfare } from '../utils/soundEffects';
import { Trophy, RefreshCw, LogOut, Award } from 'lucide-react';

export interface MainGameVictoryModalProps {
  matchOver: MatchOverPayload;
  onReplay?: () => void;
  onLeave?: () => void;
  isHost?: boolean;
}

export const MainGameVictoryModal: React.FC<MainGameVictoryModalProps> = ({
  matchOver,
  onReplay,
  onLeave,
  isHost = true,
}) => {
  const { t } = useTranslation();
  const hasCelebrated = useRef(false);

  useEffect(() => {
    if (!hasCelebrated.current) {
      hasCelebrated.current = true;
      playVictoryFanfare();
      try {
        const testCanvas = document.createElement('canvas');
        if (testCanvas.getContext && testCanvas.getContext('2d')) {
          confetti({
            particleCount: 180,
            spread: 100,
            origin: { y: 0.5 },
            colors: ['#f59e0b', '#fbbf24', '#3b82f6', '#10b981', '#ef4444', '#a855f7'],
          });
        }
      } catch {
        // Ignore environments where canvas-confetti canvas is unavailable (e.g. happy-dom/jsdom)
      }
    }
  }, []);

  const winningTeamName =
    matchOver.winningTeam === 'TEAM_1' ? t.mainGame.team1 : t.mainGame.team2;

  const displayMessage =
    matchOver.message ||
    t.mainGame.matchWinnerTitle
      .replace('{team}', winningTeamName)
      .replace('{t1}', String(matchOver.team1GrandTotal))
      .replace('{t2}', String(matchOver.team2GrandTotal));

  return (
    <div
      data-testid="match-over-modal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 md:p-6 animate-fade-in select-none"
    >
      <div className="max-w-2xl w-full bg-gradient-to-b from-yellow-500 via-amber-600 to-yellow-700 p-1 rounded-3xl shadow-[0_0_80px_rgba(250,204,21,0.5)]">
        <div className="bg-slate-950 rounded-[22px] p-6 sm:p-8 md:p-10 text-center flex flex-col items-center">
          {/* Trophy Header Icon */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-yellow-400/20 border-2 border-yellow-400 flex items-center justify-center mb-5 animate-bounce shadow-xl">
            <Trophy className="w-12 h-12 sm:w-14 sm:h-14 text-yellow-400" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 text-xs font-black uppercase tracking-widest mb-3">
            <Award className="w-4 h-4" />
            <span>Match Champions</span>
          </div>

          {/* Winning Announcement Headline (Scenario 4) */}
          <h2
            data-testid="match-winner-headline"
            className="text-2xl sm:text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-200 uppercase tracking-tight mb-4 drop-shadow"
          >
            {displayMessage}
          </h2>

          {/* Final Cumulative Score Breakdown */}
          <div className="w-full grid grid-cols-2 gap-3 sm:gap-4 my-6">
            <div
              className={`p-4 rounded-2xl border text-center ${
                matchOver.winningTeam === 'TEAM_1'
                  ? 'bg-blue-900/40 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                  : 'bg-slate-900/60 border-slate-700'
              }`}
            >
              <div className="text-xs uppercase font-bold text-blue-300 mb-1">
                {t.mainGame.team1}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white">
                {matchOver.team1GrandTotal} <span className="text-sm font-semibold text-blue-300">PTS</span>
              </div>
            </div>

            <div
              className={`p-4 rounded-2xl border text-center ${
                matchOver.winningTeam === 'TEAM_2'
                  ? 'bg-emerald-900/40 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                  : 'bg-slate-900/60 border-slate-700'
              }`}
            >
              <div className="text-xs uppercase font-bold text-emerald-300 mb-1">
                {t.mainGame.team2}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white">
                {matchOver.team2GrandTotal} <span className="text-sm font-semibold text-emerald-300">PTS</span>
              </div>
            </div>
          </div>

          {/* Host Replay and Exit Controls (Scenario 5) */}
          {isHost ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full mt-2">
              <button
                type="button"
                data-testid="play-again-btn"
                onClick={onReplay}
                className="w-full sm:w-auto flex-1 touch-target min-h-touch inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-slate-950 font-black text-base shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCw className="w-5 h-5" />
                <span>{t.mainGame.playAgainBtn}</span>
              </button>

              <button
                type="button"
                data-testid="exit-room-btn"
                onClick={onLeave}
                className="w-full sm:w-auto touch-target min-h-touch inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-base hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <LogOut className="w-5 h-5" />
                <span>{t.mainGame.exitRoomBtn}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 w-full mt-2">
              <p className="text-sm font-semibold text-slate-400">
                Waiting for the host to launch a replay or exit the room...
              </p>
              {onLeave && (
                <button
                  type="button"
                  data-testid="exit-room-btn"
                  onClick={onLeave}
                  className="w-full sm:w-auto touch-target min-h-touch inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t.mainGame.exitRoomBtn}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MainGameVictoryModal;

