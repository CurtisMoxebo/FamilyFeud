import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Language } from '../types';
import { translations, TranslationDictionary } from './translations';

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationDictionary;
  getTranslation: (lang: Language) => TranslationDictionary;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export interface LanguageProviderProps {
  children: ReactNode;
  initialLanguage?: Language;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({
  children,
  initialLanguage = 'EN',
}) => {
  const [language, setLanguage] = useState<Language>(initialLanguage);

  const t = translations[language] || translations.EN;

  const getTranslation = (lang: Language): TranslationDictionary => {
    return translations[lang] || translations.EN;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, getTranslation }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    // Graceful fallback for non-wrapped components or tests
    return {
      language: 'EN',
      setLanguage: () => {},
      t: translations.EN,
      getTranslation: (lang: Language) => translations[lang] || translations.EN,
    };
  }
  return context;
};

