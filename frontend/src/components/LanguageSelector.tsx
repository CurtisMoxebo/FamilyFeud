import React from 'react';
import { Language } from '../types';
import { Globe, Check } from 'lucide-react';

export interface LanguageOption {
  code: Language;
  label: string;
  nativeName: string;
  flag: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'EN', label: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'FR', label: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'ES', label: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
];

export interface LanguageSelectorProps {
  selectedLanguage: Language;
  onSelectLanguage: (lang: Language) => void;
  disabled?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  selectedLanguage,
  onSelectLanguage,
  disabled = false,
}) => {
  return (
    <div
      role="radiogroup"
      aria-label="Language selection"
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full"
    >
      {LANGUAGE_OPTIONS.map((option) => {
        const isSelected = selectedLanguage === option.code;
        return (
          <button
            key={option.code}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onSelectLanguage(option.code)}
            data-testid={`language-option-${option.code}`}
            className={`relative flex items-center justify-between p-4 rounded-xl border transition-all duration-200 text-left ${
              isSelected
                ? 'bg-gradient-to-r from-feud-blue-light to-feud-blue-dark border-feud-gold shadow-lg shadow-feud-gold/10 ring-2 ring-feud-gold/50'
                : 'bg-feud-slate-card/70 border-feud-slate-border text-slate-300 hover:bg-feud-slate hover:border-slate-500'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02]'}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl select-none" role="img" aria-label={option.label}>
                {option.flag}
              </span>
              <div>
                <div
                  className={`font-bold text-base ${
                    isSelected ? 'text-feud-gold-light' : 'text-white'
                  }`}
                >
                  {option.nativeName}
                </div>
                <div className="text-xs text-slate-400">{option.label}</div>
              </div>
            </div>

            {isSelected && (
              <div className="w-6 h-6 rounded-full bg-feud-gold text-slate-900 flex items-center justify-center shadow-md animate-scale-in">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default LanguageSelector;

