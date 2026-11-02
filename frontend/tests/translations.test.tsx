import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { translations, LanguageProvider, useTranslation } from '../src/i18n';
import { Language } from '../src/types';

describe('Frontend Regression Suite: i18n Localization System (US-02 & US-03)', () => {
  const supportedLanguages: Language[] = ['EN', 'FR', 'ES'];

  describe('Translation Dictionary Integrity', () => {
    it('defines dictionaries for all supported languages (EN, FR, ES)', () => {
      for (const lang of supportedLanguages) {
        expect(translations[lang]).toBeDefined();
        expect(translations[lang].app).toBeDefined();
        expect(translations[lang].createRoom).toBeDefined();
        expect(translations[lang].gameModes).toBeDefined();
        expect(translations[lang].gameActions).toBeDefined();
        expect(translations[lang].host).toBeDefined();
        expect(translations[lang].joinRoom).toBeDefined();
      }
    });

    it('matches US-02 Scenario 4 core game action translations exactly', () => {
      // English
      expect(translations.EN.gameActions.ready).toBe('Ready');
      expect(translations.EN.gameActions.submit).toBe('Submit');
      expect(translations.EN.gameActions.pass).toBe('Pass');
      expect(translations.EN.gameActions.play).toBe('Play');
      expect(translations.EN.gameActions.duplicateAnswer).toBe('Duplicate Answer! Try Again');

      // French
      expect(translations.FR.gameActions.ready).toBe('Je suis prêt');
      expect(translations.FR.gameActions.submit).toBe('Valider');
      expect(translations.FR.gameActions.pass).toBe('Passer');
      expect(translations.FR.gameActions.play).toBe('Jouer');
      expect(translations.FR.gameActions.duplicateAnswer).toBe('Réponse déjà donnée ! Réessayez');

      // Spanish
      expect(translations.ES.gameActions.ready).toBe('¡Listo!');
      expect(translations.ES.gameActions.submit).toBe('Enviar');
      expect(translations.ES.gameActions.pass).toBe('Pasar');
      expect(translations.ES.gameActions.play).toBe('Jugar');
      expect(translations.ES.gameActions.duplicateAnswer).toBe('¡Respuesta repetida! Intenta de nuevo');
    });

    it('contains matching US-02 Scenario 2 validation error message', () => {
      expect(translations.EN.createRoom.validationErrorEmpty).toBe(
        'Please enter a room name (3-50 characters)'
      );
      expect(translations.FR.createRoom.validationErrorEmpty).toBe(
        'Please enter a room name (3-50 characters)'
      );
      expect(translations.ES.createRoom.validationErrorEmpty).toBe(
        'Please enter a room name (3-50 characters)'
      );
    });

    it('defines distinct titles and descriptions for both Fast Money and Main Game modes', () => {
      for (const lang of supportedLanguages) {
        const mode = translations[lang].gameModes;
        expect(mode.fastMoneyTitle).toBeTruthy();
        expect(mode.fastMoneyBadge).toBeTruthy();
        expect(mode.fastMoneyDesc).toBeTruthy();
        expect(mode.mainGameTitle).toBeTruthy();
        expect(mode.mainGameBadge).toBeTruthy();
        expect(mode.mainGameDesc).toBeTruthy();
      }
    });

    it('defines US-03 join room dictionary keys for all supported languages', () => {
      for (const lang of supportedLanguages) {
        const join = translations[lang].joinRoom;
        expect(join.title).toBeTruthy();
        expect(join.subtitle).toBeTruthy();
        expect(join.tabHost).toBeTruthy();
        expect(join.tabJoin).toBeTruthy();
        expect(join.roomCodeLabel).toBeTruthy();
        expect(join.roomCodePlaceholder).toBeTruthy();
        expect(join.nicknameLabel).toBeTruthy();
        expect(join.nicknamePlaceholder).toBeTruthy();
        expect(join.joinButton).toBeTruthy();
        expect(join.joining).toBeTruthy();
        expect(join.scanToJoin).toBeTruthy();
        expect(join.validationErrorNickname).toBeTruthy();
        expect(join.validationErrorRoomCode).toBeTruthy();
        expect(join.roomNotFound).toBeTruthy();
      }

      // Verify specific localized tab and button values
      expect(translations.EN.joinRoom.tabHost).toBe('Host a Game');
      expect(translations.EN.joinRoom.tabJoin).toBe('Join a Game');
      expect(translations.FR.joinRoom.tabHost).toBe('Animer une partie');
      expect(translations.FR.joinRoom.tabJoin).toBe('Rejoindre une partie');
      expect(translations.ES.joinRoom.tabHost).toBe('Crear sala');
      expect(translations.ES.joinRoom.tabJoin).toBe('Unirse a una sala');
    });
  });

  describe('useTranslation Hook & LanguageContext', () => {
    it('returns English translations by default when wrapped in LanguageProvider', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LanguageProvider>{children}</LanguageProvider>
      );

      const { result } = renderHook(() => useTranslation(), { wrapper });

      expect(result.current.language).toBe('EN');
      expect(result.current.t.gameActions.ready).toBe('Ready');
      expect(result.current.t.createRoom.submitButton).toBe('Create Room');
      expect(result.current.t.joinRoom.tabJoin).toBe('Join a Game');
    });

    it('supports custom initialLanguage in LanguageProvider', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LanguageProvider initialLanguage="FR">{children}</LanguageProvider>
      );

      const { result } = renderHook(() => useTranslation(), { wrapper });

      expect(result.current.language).toBe('FR');
      expect(result.current.t.gameActions.ready).toBe('Je suis prêt');
      expect(result.current.t.createRoom.submitButton).toBe('Créer le salon');
      expect(result.current.t.joinRoom.tabJoin).toBe('Rejoindre une partie');
    });

    it('updates translations dynamically when setLanguage is called', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LanguageProvider>{children}</LanguageProvider>
      );

      const { result } = renderHook(() => useTranslation(), { wrapper });

      expect(result.current.language).toBe('EN');

      act(() => {
        result.current.setLanguage('ES');
      });

      expect(result.current.language).toBe('ES');
      expect(result.current.t.gameActions.ready).toBe('¡Listo!');
      expect(result.current.t.createRoom.submitButton).toBe('Crear sala');
      expect(result.current.t.joinRoom.tabJoin).toBe('Unirse a una sala');

      act(() => {
        result.current.setLanguage('FR');
      });

      expect(result.current.language).toBe('FR');
      expect(result.current.t.gameActions.ready).toBe('Je suis prêt');
      expect(result.current.t.joinRoom.tabJoin).toBe('Rejoindre une partie');
    });

    it('gracefully falls back to English when rendered outside of LanguageProvider', () => {
      const { result } = renderHook(() => useTranslation());

      expect(result.current.language).toBe('EN');
      expect(result.current.t.gameActions.ready).toBe('Ready');
      expect(result.current.t.joinRoom.tabJoin).toBe('Join a Game');
      expect(typeof result.current.setLanguage).toBe('function');
    });

    it('provides getTranslation helper to query arbitrary languages without state change', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LanguageProvider initialLanguage="EN">{children}</LanguageProvider>
      );

      const { result } = renderHook(() => useTranslation(), { wrapper });

      expect(result.current.getTranslation('FR').gameActions.ready).toBe('Je suis prêt');
      expect(result.current.getTranslation('FR').joinRoom.tabJoin).toBe('Rejoindre une partie');
      expect(result.current.getTranslation('ES').gameActions.ready).toBe('¡Listo!');
      expect(result.current.getTranslation('ES').joinRoom.tabJoin).toBe('Unirse a una sala');
    });
  });
});
