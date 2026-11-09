import React from 'react';
import { Language } from '../types';
import { Check } from 'lucide-react';

export interface LanguageOption {
  code: Language;
  label: string;
  nativeName: string;
  flag: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'EN', label: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'FR', label: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'ES', label: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
];

export const FlagIcon: React.FC<{ code: Language; className?: string }> = ({
  code,
  className = 'w-8 h-5.5',
}) => {
  switch (code) {
    case 'EN':
      return (
        <svg
          viewBox="0 0 640 480"
          className={`${className} rounded shadow-sm shrink-0 overflow-hidden`}
          aria-hidden="true"
        >
          <path fill="#012169" d="M0 0h640v480H0z" />
          <path
            fill="#ffffff"
            d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-179L0 64V0h75z"
          />
          <path
            fill="#c8102e"
            d="m424 281 216 159v40L369 281h55zm-184-82L23 39V0l270 199h-53zM640 0v3L391 191l2-44L580 0h60zM0 480v-5l249-187-2 44L60 480H0z"
          />
          <path fill="#ffffff" d="M241 0v480h160V0H241zM0 160v160h640V160H0z" />
          <path fill="#c8102e" d="M267 0v480h107V0H267zM0 187v107h640V187H0z" />
        </svg>
      );
    case 'FR':
      return (
        <svg
          viewBox="0 0 640 480"
          className={`${className} rounded shadow-sm shrink-0 overflow-hidden`}
          aria-hidden="true"
        >
          <rect width="213.3" height="480" fill="#002654" />
          <rect x="213.3" width="213.4" height="480" fill="#ffffff" />
          <rect x="426.7" width="213.3" height="480" fill="#ce1126" />
        </svg>
      );
    case 'ES':
      return (
        <svg
          viewBox="0 0 640 480"
          className={`${className} rounded shadow-sm shrink-0 overflow-hidden`}
          aria-hidden="true"
        >
          <rect width="640" height="480" fill="#aa151b" />
          <rect y="120" width="640" height="240" fill="#f1bf00" />
          <g transform="translate(155, 175) scale(1.4)">
            <path
              d="M10 20 h35 v30 c0 15 -18 25 -18 25 s-17 -10 -17 -25 z"
              fill="#aa151b"
              stroke="#f1bf00"
              strokeWidth="2.5"
            />
            <path d="M12 12 l6 -8 l9 5 l9 -5 l6 8 z" fill="#f1bf00" />
            <circle cx="27" cy="40" r="7" fill="#f1bf00" />
          </g>
        </svg>
      );
    default:
      return null;
  }
};

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
              <FlagIcon
                code={option.code}
                className="w-8 h-5.5 rounded shadow border border-white/20 shrink-0"
              />
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

