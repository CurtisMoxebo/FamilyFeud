import React from 'react';
import { GameMode } from '../types';
import { Zap, Users, Check } from 'lucide-react';

export interface GameModeCardProps {
  mode: GameMode;
  title: string;
  badge: string;
  description: string;
  isSelected: boolean;
  onSelect: (mode: GameMode) => void;
  disabled?: boolean;
}

export const GameModeCard: React.FC<GameModeCardProps> = ({
  mode,
  title,
  badge,
  description,
  isSelected,
  onSelect,
  disabled = false,
}) => {
  const isFastMoney = mode === 'FAST_MONEY';

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      disabled={disabled}
      onClick={() => onSelect(mode)}
      data-testid={`gamemode-card-${mode.toLowerCase()}`}
      className={`relative flex flex-col p-5 rounded-2xl border text-left transition-all duration-200 ${
        isSelected
          ? 'bg-gradient-to-b from-feud-blue-light/80 via-feud-blue to-feud-blue-dark border-feud-gold shadow-xl shadow-feud-gold/10 ring-2 ring-feud-gold/50'
          : 'bg-feud-slate-card/70 border-feud-slate-border text-slate-300 hover:bg-feud-slate hover:border-slate-500'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02]'}`}
    >
      {/* Header with Icon and Badge */}
      <div className="flex items-center justify-between mb-3 w-full">
        <div
          className={`p-2.5 rounded-xl ${
            isSelected
              ? 'bg-feud-gold/20 text-feud-gold border border-feud-gold/30'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}
        >
          {isFastMoney ? <Zap className="w-5 h-5" /> : <Users className="w-5 h-5" />}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              isSelected
                ? 'bg-feud-gold text-slate-900 font-bold'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {badge}
          </span>
          {isSelected && (
            <div className="w-6 h-6 rounded-full bg-feud-gold text-slate-900 flex items-center justify-center shadow-md">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          )}
        </div>
      </div>

      {/* Mode Title */}
      <h3
        className={`text-lg font-bold tracking-wide uppercase ${
          isSelected ? 'text-feud-gold-light' : 'text-white'
        }`}
      >
        {title}
      </h3>

      {/* Mode Description */}
      <p className="text-sm text-slate-300 mt-1 leading-relaxed">{description}</p>
    </button>
  );
};

export default GameModeCard;

