import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { translations, LanguageProvider, useTranslation } from '../src/i18n';
import { Language } from '../src/types';

describe('Frontend Regression Suite: i18n Localization System (US-02, US-03 & US-04)', () => {
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
        expect(translations[lang].lobby).toBeDefined();
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

    it('defines US-04 lobby and capacity dictionary keys for all supported languages', () => {
      for (const lang of supportedLanguages) {
        const lobby = translations[lang].lobby;
        expect(lobby.rosterTitle).toBeTruthy();
        expect(lobby.waitingForHost).toBeTruthy();
        expect(lobby.roomFullTitle).toBeTruthy();
        expect(lobby.roomFullFastMoney).toBeTruthy();
        expect(lobby.roomFullMainGame).toBeTruthy();
        expect(lobby.fastMoneyCapacity).toBeTruthy();
        expect(lobby.mainGameCapacity).toBeTruthy();
        expect(lobby.startGame).toBeTruthy();
        expect(lobby.startGameWithCount).toBeTruthy();
        expect(lobby.mainGameEvenCountRequired).toBeTruthy();
        expect(lobby.mainGameCurrentWaiting).toBeTruthy();
        expect(lobby.fastMoneyWaiting).toBeTruthy();
        expect(lobby.statusHost).toBeTruthy();
        expect(lobby.statusReady).toBeTruthy();
        expect(lobby.statusWaiting).toBeTruthy();
        expect(lobby.statusDisconnected).toBeTruthy();
        expect(lobby.backHome).toBeTruthy();
      }

      // Verify specific localized US-04 capacity texts and alerts
      expect(translations.EN.lobby.leaveLobby).toBe('Leave Lobby');
      expect(translations.FR.lobby.leaveLobby).toBe('Quitter le salon');
      expect(translations.ES.lobby.leaveLobby).toBe('Salir de la sala');

      expect(translations.EN.lobby.roomFullFastMoney).toBe(
        'This Fast Money room is already full (2/2 players).'
      );
      expect(translations.FR.lobby.roomFullFastMoney).toBe(
        'Ce salon Face-à-Face Rapide est déjà complet (2/2 joueurs).'
      );
      expect(translations.ES.lobby.roomFullFastMoney).toBe(
        'Esta sala de Dinero Rápido ya está llena (2/2 jugadores).'
      );

      expect(translations.EN.lobby.mainGameEvenCountRequired).toBe(
        'Even number of players required (2, 4, 6, 8, 10) to start'
      );
      expect(translations.FR.lobby.mainGameEvenCountRequired).toBe(
        'Nombre pair de joueurs requis (2, 4, 6, 8, 10) pour commencer'
      );
      expect(translations.ES.lobby.mainGameEvenCountRequired).toBe(
        'Se requiere un número par de jugadores (2, 4, 6, 8, 10) para comenzar'
      );
    });

    it('defines US-10 Fast Money victory, defeat, and replay dictionary keys for all supported languages', () => {
      for (const lang of supportedLanguages) {
        const fm = translations[lang].fastMoney;
        expect(fm.p2RevealPhaseTitle).toBeTruthy();
        expect(fm.victoryTitle).toBeTruthy();
        expect(fm.victorySubtitle).toBeTruthy();
        expect(fm.defeatTitle).toBeTruthy();
        expect(fm.defeatSubtitle).toBeTruthy();
        expect(fm.playAgain).toBeTruthy();
        expect(fm.p1ColumnTitle).toBeTruthy();
        expect(fm.p2ColumnTitle).toBeTruthy();
        expect(fm.grandTotal).toBeTruthy();
        expect(fm.targetGoal).toBeTruthy();
        expect(fm.startP2RevealBtn).toBeTruthy();
      }

      // Exact values for Play Again button
      expect(translations.EN.fastMoney.playAgain).toBe('Play Again');
      expect(translations.FR.fastMoney.playAgain).toBe('Rejouer');
      expect(translations.ES.fastMoney.playAgain).toBe('Jugar de nuevo');

      // Exact values for Victory title
      expect(translations.EN.fastMoney.victoryTitle).toContain('200 POINTS');
      expect(translations.FR.fastMoney.victoryTitle).toContain('200 POINTS');
      expect(translations.ES.fastMoney.victoryTitle).toContain('200 PUNTOS');
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
      expect(result.current.t.lobby.startGame).toBe('Start Game');
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
      expect(result.current.t.lobby.startGame).toBe('Lancer la partie');
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
      expect(result.current.t.lobby.startGame).toBe('Iniciar partida');

      act(() => {
        result.current.setLanguage('FR');
      });

      expect(result.current.language).toBe('FR');
      expect(result.current.t.gameActions.ready).toBe('Je suis prêt');
      expect(result.current.t.joinRoom.tabJoin).toBe('Rejoindre une partie');
      expect(result.current.t.lobby.startGame).toBe('Lancer la partie');
    });

    it('defines US-11 Main Game team partitioning dictionary keys for all supported languages', () => {
      for (const lang of supportedLanguages) {
        const mg = translations[lang].mainGame;
        expect(mg).toBeDefined();
        expect(mg.team1).toBeTruthy();
        expect(mg.team2).toBeTruthy();
        expect(mg.teamsAssignedTitle).toBeTruthy();
        expect(mg.teamsAssignedSubtitle).toBeTruthy();
        expect(mg.youAreOnTeam).toBeTruthy();
        expect(mg.teammatesTitle).toBeTruthy();
        expect(mg.battingOrder).toBeTruthy();
        expect(mg.playerOrder).toBeTruthy();
        expect(mg.versus).toBeTruthy();
        expect(mg.teamRoster).toBeTruthy();
        expect(mg.readyForFaceOff).toBeTruthy();

        expect(translations[lang].lobby.oddPlayerCountWarning).toBeTruthy();
      }

      // Check specific English, French, and Spanish key values
      expect(translations.EN.mainGame.team1).toBe('Team 1');
      expect(translations.EN.mainGame.team2).toBe('Team 2');
      expect(translations.FR.mainGame.team1).toBe('Équipe 1');
      expect(translations.FR.mainGame.team2).toBe('Équipe 2');
      expect(translations.ES.mainGame.team1).toBe('Equipo 1');
      expect(translations.ES.mainGame.team2).toBe('Equipo 2');

      // Check interpolation templates
      expect(
        translations.EN.lobby.oddPlayerCountWarning
          .replace('{count}', '5')
          .replace('{target}', '6')
      ).toBe('Cannot start with an odd number of players (5). Connect 1 more player to reach 6.');

      expect(
        translations.FR.lobby.oddPlayerCountWarning
          .replace('{count}', '5')
          .replace('{target}', '6')
      ).toBe(
        'Impossible de commencer avec un nombre impair de joueurs (5). Connectez 1 joueur de plus pour atteindre 6.'
      );

      expect(
        translations.ES.lobby.oddPlayerCountWarning
          .replace('{count}', '5')
          .replace('{target}', '6')
      ).toBe(
        'No se puede iniciar con un número impar de jugadores (5). Conecta 1 jugador más para alcanzar 6.'
      );
    });

    it('defines US-12 Face-Off duel dictionary keys and interpolation strings for all supported languages', () => {
      for (const lang of supportedLanguages) {
        const mg = translations[lang].mainGame;
        expect(mg.faceOffTitle).toBeTruthy();
        expect(mg.roundNumber).toBeTruthy();
        expect(mg.faceOffContenders).toBeTruthy();
        expect(mg.imReady).toBeTruthy();
        expect(mg.waitingForOpponent).toBeTruthy();
        expect(mg.bothReady).toBeTruthy();
        expect(mg.buzzerBtn).toBeTruthy();
        expect(mg.buzzerLocked).toBeTruthy();
        expect(mg.buzzerWinner).toBeTruthy();
        expect(mg.spectatorCheer).toBeTruthy();
        expect(mg.faceOffTimeRemaining).toBeTruthy();
        expect(mg.faceOffInputPlaceholder).toBeTruthy();
        expect(mg.submitAnswer).toBeTruthy();
        expect(mg.answeringTurn).toBeTruthy();
        expect(mg.timeUpHandOff).toBeTruthy();
        expect(mg.timeUpTeammate).toBeTruthy();
        expect(mg.deadlockReset).toBeTruthy();
      }

      // Exact values
      expect(translations.EN.mainGame.buzzerBtn).toBe('BUZZ!');
      expect(translations.EN.mainGame.buzzerLocked).toBe('LOCKED OUT');
      expect(translations.EN.mainGame.imReady).toBe("I'm Ready!");

      expect(translations.FR.mainGame.buzzerBtn).toBe('BUZZER !');
      expect(translations.FR.mainGame.buzzerLocked).toBe('VERROUILLÉ');
      expect(translations.FR.mainGame.imReady).toBe('Je suis prêt !');

      expect(translations.ES.mainGame.buzzerBtn).toBe('¡ZUMBADOR!');
      expect(translations.ES.mainGame.buzzerLocked).toBe('BLOQUEADO');
      expect(translations.ES.mainGame.imReady).toBe('¡Estoy listo!');

      // Interpolation checks
      expect(translations.EN.mainGame.waitingForOpponent.replace('{opponent}', 'Sarah')).toBe(
        'Waiting for Sarah...'
      );
      expect(translations.FR.mainGame.waitingForOpponent.replace('{opponent}', 'Sarah')).toBe(
        'En attente de Sarah...'
      );
      expect(translations.ES.mainGame.waitingForOpponent.replace('{opponent}', 'Sarah')).toBe(
        'Esperando a Sarah...'
      );

      expect(translations.EN.mainGame.buzzerWinner.replace('{name}', 'Alex')).toBe('Alex buzzed first!');
      expect(translations.FR.mainGame.buzzerWinner.replace('{name}', 'Alex')).toBe('Alex a buzzé en premier !');
      expect(translations.ES.mainGame.buzzerWinner.replace('{name}', 'Alex')).toBe('¡Alex tocó primero!');

      expect(translations.EN.mainGame.youBuzzedFirst).toBe('You buzzed first!');
      expect(translations.FR.mainGame.youBuzzedFirst).toBe('Vous avez buzzé en premier !');
      expect(translations.ES.mainGame.youBuzzedFirst).toBe('¡Tocaste primero!');

      expect(translations.EN.mainGame.timeUpHandOff.replace('{next}', 'David')).toBe(
        "Time's up! Turn passed to David"
      );
      expect(translations.FR.mainGame.timeUpHandOff.replace('{next}', 'David')).toBe(
        'Temps écoulé ! La main passe à David'
      );
      expect(translations.ES.mainGame.timeUpHandOff.replace('{next}', 'David')).toBe(
        '¡Tiempo agotado! Turno para David'
      );
    });

    it('defines US-14 Team Guessing Turn, Board Flips & 3-Strike System dictionary keys and templates for all supported languages', () => {
      for (const lang of supportedLanguages) {
        const mg = translations[lang].mainGame;
        expect(mg.teamGuessingTitle).toBeTruthy();
        expect(mg.yourTurnToGuess).toBeTruthy();
        expect(mg.waitingForTeammate).toBeTruthy();
        expect(mg.controllingTeamPlaying).toBeTruthy();
        expect(mg.roundBankTitle).toBeTruthy();
        expect(mg.strikeTitle).toBeTruthy();
        expect(mg.strikesCount).toBeTruthy();
        expect(mg.duplicateAnswerWarning).toBeTruthy();
        expect(mg.notOnBoard).toBeTruthy();
        expect(mg.threeStrikes).toBeTruthy();
        expect(mg.chanceToSteal).toBeTruthy();
        expect(mg.roundClearedTitle).toBeTruthy();
        expect(mg.roundClearedSubtitle).toBeTruthy();
        expect(mg.passTurnBtn).toBeTruthy();
        expect(mg.teamGuessInputPlaceholder).toBeTruthy();
      }

      // Exact values
      expect(translations.EN.mainGame.yourTurnToGuess).toBe("It's your turn to guess!");
      expect(translations.EN.mainGame.threeStrikes).toBe('Three Strikes!');
      expect(translations.EN.mainGame.passTurnBtn).toBe('Pass Turn');

      expect(translations.FR.mainGame.yourTurnToGuess).toBe("C'est à votre tour de deviner !");
      expect(translations.FR.mainGame.threeStrikes).toBe('Trois Fautes !');
      expect(translations.FR.mainGame.passTurnBtn).toBe('Passer son tour');

      expect(translations.ES.mainGame.yourTurnToGuess).toBe('¡Es tu turno de adivinar!');
      expect(translations.ES.mainGame.threeStrikes).toBe('¡Tres Fallos!');
      expect(translations.ES.mainGame.passTurnBtn).toBe('Pasar turno');

      // Interpolations
      expect(translations.EN.mainGame.waitingForTeammate.replace('{name}', 'Bob')).toBe(
        'Waiting for Bob to guess...'
      );
      expect(translations.FR.mainGame.waitingForTeammate.replace('{name}', 'Bob')).toBe(
        'En attente de la réponse de Bob...'
      );
      expect(translations.ES.mainGame.waitingForTeammate.replace('{name}', 'Bob')).toBe(
        'Esperando la respuesta de Bob...'
      );

      expect(translations.EN.mainGame.chanceToSteal.replace('{team}', 'Team 2')).toBe(
        'Team 2 has a chance to STEAL!'
      );
      expect(translations.FR.mainGame.chanceToSteal.replace('{team}', 'Équipe 2')).toBe(
        "L'Équipe 2 a une chance de VOLER les points !"
      );
      expect(translations.ES.mainGame.chanceToSteal.replace('{team}', 'Equipo 2')).toBe(
        '¡El Equipo 2 tiene la oportunidad de ROBAR!'
      );

      expect(
        translations.EN.mainGame.roundClearedSubtitle
          .replace('{team}', 'Team 1')
          .replace('{points}', '100')
      ).toBe('Team 1 cleared the board and wins 100 points!');

      expect(
        translations.FR.mainGame.roundClearedSubtitle
          .replace('{team}', 'Équipe 1')
          .replace('{points}', '100')
      ).toBe("L'Équipe 1 a vidé le tableau et remporte 100 points !");

      expect(
        translations.ES.mainGame.roundClearedSubtitle
          .replace('{team}', 'Equipo 1')
          .replace('{points}', '100')
      ).toBe('¡El Equipo 1 despejó el tablero y gana 100 puntos!');
    });

    it('defines US-15 3-Strike Steal Phase and Round Resolution translations in all languages', () => {
      for (const lang of supportedLanguages) {
        const mg = translations[lang].mainGame;
        expect(mg.stealPhaseTitle).toBeTruthy();
        expect(mg.spokespersonTurnPrompt).toBeTruthy();
        expect(mg.teammateConsultPrompt).toBeTruthy();
        expect(mg.defendingTeamFingersCrossed).toBeTruthy();
        expect(mg.stealSuccessAnnouncement).toBeTruthy();
        expect(mg.stealFailedAnnouncement).toBeTruthy();
        expect(mg.submitStealAnswer).toBeTruthy();
        expect(mg.stealInputPlaceholder).toBeTruthy();
        expect(mg.remainingAnswersTitle).toBeTruthy();
        expect(mg.roundWinnerBanner).toBeTruthy();
      }

      // Scenario 4 Mobile View prompts
      expect(translations.EN.mainGame.spokespersonTurnPrompt).toContain('CHANCE TO STEAL!');
      expect(translations.EN.mainGame.teammateConsultPrompt.replace('{spokesperson}', 'David')).toBe(
        "🗣️ Consult together! David has the floor to submit your team's steal answer"
      );
      expect(translations.EN.mainGame.defendingTeamFingersCrossed).toBe(
        '🤞 Fingers crossed! Waiting to see if the opposing team steals your points...'
      );

      // French prompts
      expect(translations.FR.mainGame.spokespersonTurnPrompt).toContain('OCCASION DE VOLER !');
      expect(translations.FR.mainGame.teammateConsultPrompt.replace('{spokesperson}', 'David')).toBe(
        '🗣️ Concertez-vous ! David a la parole pour proposer la réponse de votre équipe'
      );
      expect(translations.FR.mainGame.defendingTeamFingersCrossed).toBe(
        "🤞 Croisons les doigts ! En attente de voir si l'équipe adverse vole vos points..."
      );

      // Spanish prompts
      expect(translations.ES.mainGame.spokespersonTurnPrompt).toContain('¡OPORTUNIDAD DE ROBAR!');
      expect(translations.ES.mainGame.teammateConsultPrompt.replace('{spokesperson}', 'David')).toBe(
        '🗣️ ¡Consúltense! David tiene la palabra para enviar la respuesta de su equipo'
      );
      expect(translations.ES.mainGame.defendingTeamFingersCrossed).toBe(
        '🤞 ¡Crucen los dedos! Esperando a ver si el equipo contrario roba sus puntos...'
      );

      // Announcement interpolations
      expect(
        translations.EN.mainGame.stealSuccessAnnouncement
          .replace('{team}', 'Team 2')
          .replace('{points}', '70')
      ).toBe('Steal Successful! Team 2 stole 70 points!');
      expect(
        translations.FR.mainGame.stealSuccessAnnouncement
          .replace('{team}', 'Équipe 2')
          .replace('{points}', '70')
      ).toBe("Vol réussi ! L'Équipe 2 a volé 70 points !");
      expect(
        translations.ES.mainGame.stealSuccessAnnouncement
          .replace('{team}', 'Equipo 2')
          .replace('{points}', '70')
      ).toBe('¡Robo exitoso! ¡El Equipo 2 robó 70 puntos!');

      expect(
        translations.EN.mainGame.stealFailedAnnouncement
          .replace('{team}', 'Team 1')
          .replace('{points}', '70')
      ).toBe('Steal Failed! Team 1 retains 70 points!');
      expect(
        translations.FR.mainGame.stealFailedAnnouncement
          .replace('{team}', 'Équipe 1')
          .replace('{points}', '70')
      ).toBe("Vol échoué ! L'Équipe 1 conserve 70 points !");
      expect(
        translations.ES.mainGame.stealFailedAnnouncement
          .replace('{team}', 'Equipo 1')
          .replace('{points}', '70')
      ).toBe('¡Robo fallido! ¡El Equipo 1 retiene 70 puntos!');
    });

    it('defines US-16 Real-Time Grand Total Scores & Match Replay dictionary keys with full trilingual parity', () => {
      for (const lang of supportedLanguages) {
        const mg = translations[lang].mainGame;
        expect(mg.grandTotalHeader).toBeTruthy();
        expect(mg.roundBank).toBeTruthy();
        expect(mg.roundProgress).toBeTruthy();
        expect(mg.yourTeam).toBeTruthy();
        expect(mg.nextRoundBtn).toBeTruthy();
        expect(mg.nextContendersBanner).toBeTruthy();
        expect(mg.matchWinnerTitle).toBeTruthy();
        expect(mg.matchTieTitle).toBeTruthy();
        expect(mg.suddenDeathTitle).toBeTruthy();
        expect(mg.suddenDeathSubtitle).toBeTruthy();
        expect(mg.playAgainBtn).toBeTruthy();
        expect(mg.exitRoomBtn).toBeTruthy();
      }

      // English specific assertions
      expect(translations.EN.mainGame.grandTotalHeader).toBe('Grand Total');
      expect(translations.EN.mainGame.roundBank).toBe('Round Bank');
      expect(translations.EN.mainGame.yourTeam).toBe('YOUR TEAM');
      expect(translations.EN.mainGame.nextRoundBtn).toBe('Next Round');
      expect(translations.EN.mainGame.playAgainBtn).toBe('Play Again');
      expect(translations.EN.mainGame.exitRoomBtn).toBe('Exit Room');
      expect(translations.EN.mainGame.matchTieTitle).toBe('Match Ended in a Tie!');
      expect(translations.EN.mainGame.suddenDeathTitle).toBe('Sudden Death Tie-Breaker!');
      expect(
        translations.EN.mainGame.roundProgress.replace('{current}', '2').replace('{total}', '3')
      ).toBe('Round 2 of 3');
      expect(
        translations.EN.mainGame.nextContendersBanner.replace('{c1}', 'Bob').replace('{c2}', 'David')
      ).toBe('Up Next at the Buzzer: Bob vs David');
      expect(
        translations.EN.mainGame.matchWinnerTitle
          .replace('{team}', 'TEAM 1')
          .replace('{t1}', '245')
          .replace('{t2}', '180')
      ).toBe('🏆 TEAM 1 WINS THE GAME! (245 vs 180)');

      // French specific assertions
      expect(translations.FR.mainGame.grandTotalHeader).toBe('Total Général');
      expect(translations.FR.mainGame.roundBank).toBe('Cagnotte de Manche');
      expect(translations.FR.mainGame.yourTeam).toBe('VOTRE ÉQUIPE');
      expect(translations.FR.mainGame.nextRoundBtn).toBe('Manche suivante');
      expect(translations.FR.mainGame.playAgainBtn).toBe('Rejouer');
      expect(translations.FR.mainGame.exitRoomBtn).toBe('Quitter la salle');
      expect(translations.FR.mainGame.matchTieTitle).toBe('Match nul !');
      expect(translations.FR.mainGame.suddenDeathTitle).toBe('Mort Subite - Égalité !');
      expect(
        translations.FR.mainGame.roundProgress.replace('{current}', '2').replace('{total}', '3')
      ).toBe('Manche 2 sur 3');
      expect(
        translations.FR.mainGame.nextContendersBanner.replace('{c1}', 'Bob').replace('{c2}', 'David')
      ).toBe('Prochains au buzzer : Bob contre David');
      expect(
        translations.FR.mainGame.matchWinnerTitle
          .replace('{team}', 'ÉQUIPE 1')
          .replace('{t1}', '245')
          .replace('{t2}', '180')
      ).toBe("🏆 L'ÉQUIPE 1 REMPORTE LA PARTIE ! (245 contre 180)");

      // Spanish specific assertions
      expect(translations.ES.mainGame.grandTotalHeader).toBe('Gran Total');
      expect(translations.ES.mainGame.roundBank).toBe('Banca de Ronda');
      expect(translations.ES.mainGame.yourTeam).toBe('TU EQUIPO');
      expect(translations.ES.mainGame.nextRoundBtn).toBe('Siguiente ronda');
      expect(translations.ES.mainGame.playAgainBtn).toBe('Jugar de nuevo');
      expect(translations.ES.mainGame.exitRoomBtn).toBe('Salir de la sala');
      expect(translations.ES.mainGame.matchTieTitle).toBe('¡Empate en la partida!');
      expect(translations.ES.mainGame.suddenDeathTitle).toBe('¡Muerte Súbita de Desempate!');
      expect(
        translations.ES.mainGame.roundProgress.replace('{current}', '2').replace('{total}', '3')
      ).toBe('Ronda 2 de 3');
      expect(
        translations.ES.mainGame.nextContendersBanner.replace('{c1}', 'Bob').replace('{c2}', 'David')
      ).toBe('Siguientes en el pulsador: Bob vs David');
      expect(
        translations.ES.mainGame.matchWinnerTitle
          .replace('{team}', 'EQUIPO 1')
          .replace('{t1}', '245')
          .replace('{t2}', '180')
      ).toBe('🏆 ¡EL EQUIPO 1 GANA EL JUEGO! (245 vs 180)');
    });

    it('gracefully falls back to English when rendered outside of LanguageProvider', () => {
      const { result } = renderHook(() => useTranslation());

      expect(result.current.language).toBe('EN');
      expect(result.current.t.gameActions.ready).toBe('Ready');
      expect(result.current.t.joinRoom.tabJoin).toBe('Join a Game');
      expect(result.current.t.lobby.startGame).toBe('Start Game');
      expect(typeof result.current.setLanguage).toBe('function');
    });

    it('provides getTranslation helper to query arbitrary languages without state change', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LanguageProvider initialLanguage="EN">{children}</LanguageProvider>
      );

      const { result } = renderHook(() => useTranslation(), { wrapper });

      expect(result.current.getTranslation('FR').gameActions.ready).toBe('Je suis prêt');
      expect(result.current.getTranslation('FR').joinRoom.tabJoin).toBe('Rejoindre une partie');
      expect(result.current.getTranslation('FR').lobby.startGame).toBe('Lancer la partie');
      expect(result.current.getTranslation('ES').gameActions.ready).toBe('¡Listo!');
      expect(result.current.getTranslation('ES').joinRoom.tabJoin).toBe('Unirse a una sala');
      expect(result.current.getTranslation('ES').lobby.startGame).toBe('Iniciar partida');
    });
  });
});
