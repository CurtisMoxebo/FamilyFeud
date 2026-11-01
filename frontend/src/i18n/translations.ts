import { Language } from '../types';

export interface TranslationDictionary {
  app: {
    title: string;
    subtitle: string;
    poweredBy: string;
    connectionStatus: string;
    connected: string;
    connecting: string;
    disconnected: string;
  };
  createRoom: {
    heading: string;
    subheading: string;
    step1Title: string;
    step1Desc: string;
    step2Title: string;
    step2Desc: string;
    step3Title: string;
    step3Desc: string;
    roomNameLabel: string;
    roomNamePlaceholder: string;
    roomNameHelp: string;
    submitButton: string;
    submitting: string;
    validationErrorEmpty: string;
    validationErrorLength: string;
  };
  gameModes: {
    fastMoneyTitle: string;
    fastMoneyBadge: string;
    fastMoneyDesc: string;
    mainGameTitle: string;
    mainGameBadge: string;
    mainGameDesc: string;
  };
  gameActions: {
    ready: string;
    submit: string;
    pass: string;
    play: string;
    duplicateAnswer: string;
  };
  host: {
    hostBoard: string;
    roomCode: string;
    waitingPlayers: string;
    shareLink: string;
    copyLink: string;
    linkCopied: string;
    gameMode: string;
    language: string;
  };
}

export const translations: Record<Language, TranslationDictionary> = {
  EN: {
    app: {
      title: 'Family Feud',
      subtitle: 'Multiplayer Game Show & Real-Time Duel',
      poweredBy: 'Powered by Google Gemini AI',
      connectionStatus: 'WebSocket Engine',
      connected: 'Connected',
      connecting: 'Connecting to Server...',
      disconnected: 'Disconnected',
    },
    createRoom: {
      heading: 'Host a Game Show',
      subheading: 'Setup your room and invite your friends or family to play!',
      step1Title: 'Select Language',
      step1Desc: 'Questions and host commentary will be delivered in this language',
      step2Title: 'Choose Game Mode',
      step2Desc: 'Pick between Fast Money duel or the classic Main Game tournament',
      step3Title: 'Name Your Room',
      step3Desc: 'Give your game room an exciting, memorable name',
      roomNameLabel: 'Room Name',
      roomNamePlaceholder: 'e.g. Family Game Night',
      roomNameHelp: 'Must be between 3 and 50 characters',
      submitButton: 'Create Room',
      submitting: 'Creating Room...',
      validationErrorEmpty: 'Please enter a room name (3-50 characters)',
      validationErrorLength: 'Please enter a room name (3-50 characters)',
    },
    gameModes: {
      fastMoneyTitle: 'Fast Money',
      fastMoneyBadge: '2 Players',
      fastMoneyDesc: '2 players face the clock for 200 points to win!',
      mainGameTitle: 'Main Game',
      mainGameBadge: '2-10 Players (Teams)',
      mainGameDesc: 'Classic family duel with face-offs, strikes, and steals across 2 teams!',
    },
    gameActions: {
      ready: 'Ready',
      submit: 'Submit',
      pass: 'Pass',
      play: 'Play',
      duplicateAnswer: 'Duplicate Answer! Try Again',
    },
    host: {
      hostBoard: 'Host TV Board',
      roomCode: 'Room Code',
      waitingPlayers: 'Waiting for players to join...',
      shareLink: 'Share Join Link',
      copyLink: 'Copy Link',
      linkCopied: 'Copied!',
      gameMode: 'Game Mode',
      language: 'Language',
    },
  },

  FR: {
    app: {
      title: 'Une Famille en Or',
      subtitle: 'Jeu télévisé multijoueur en temps réel',
      poweredBy: 'Propulsé par Google Gemini AI',
      connectionStatus: 'Moteur WebSocket',
      connected: 'Connecté',
      connecting: 'Connexion au serveur...',
      disconnected: 'Déconnecté',
    },
    createRoom: {
      heading: 'Animer une partie',
      subheading: 'Créez votre salon et invitez vos amis ou votre famille à jouer !',
      step1Title: 'Choisir la langue',
      step1Desc: 'Les questions et les voix seront générées dans cette langue',
      step2Title: 'Choisir le mode de jeu',
      step2Desc: 'Choisissez entre le Face-à-Face Rapide ou le Jeu Principal classique',
      step3Title: 'Nommer votre salon',
      step3Desc: 'Donnez un nom convivial à votre partie',
      roomNameLabel: 'Nom du salon',
      roomNamePlaceholder: 'ex. Soirée Famille',
      roomNameHelp: 'Doit comporter entre 3 et 50 caractères',
      submitButton: 'Créer le salon',
      submitting: 'Création en cours...',
      validationErrorEmpty: 'Please enter a room name (3-50 characters)',
      validationErrorLength: 'Please enter a room name (3-50 characters)',
    },
    gameModes: {
      fastMoneyTitle: 'Face-à-Face Rapide',
      fastMoneyBadge: '2 Joueurs',
      fastMoneyDesc: '2 joueurs affrontent le chrono pour marquer 200 points et remporter la victoire !',
      mainGameTitle: 'Jeu Principal',
      mainGameBadge: '2-10 Joueurs (Équipes)',
      mainGameDesc: 'Duel classique avec face-à-face, croix d’erreurs et vols de points entre 2 équipes !',
    },
    gameActions: {
      ready: 'Je suis prêt',
      submit: 'Valider',
      pass: 'Passer',
      play: 'Jouer',
      duplicateAnswer: 'Réponse déjà donnée ! Réessayez',
    },
    host: {
      hostBoard: 'Écran de l’animateur',
      roomCode: 'Code de salon',
      waitingPlayers: 'En attente des joueurs...',
      shareLink: 'Partager le lien',
      copyLink: 'Copier le lien',
      linkCopied: 'Copié !',
      gameMode: 'Mode de jeu',
      language: 'Langue',
    },
  },

  ES: {
    app: {
      title: '100 Mexicanos Dijeron',
      subtitle: 'Programa de juegos multijugador en tiempo real',
      poweredBy: 'Impulsado por Google Gemini AI',
      connectionStatus: 'Motor WebSocket',
      connected: 'Conectado',
      connecting: 'Conectando al servidor...',
      disconnected: 'Desconectado',
    },
    createRoom: {
      heading: 'Presentar una partida',
      subheading: '¡Crea tu sala e invita a tu familia o amigos a participar!',
      step1Title: 'Elige un idioma',
      step1Desc: 'Las preguntas y la voz del anfitrión se generarán en este idioma',
      step2Title: 'Elige el modo de juego',
      step2Desc: 'Elige entre Dinero Rápido o el clásico Juego Principal',
      step3Title: 'Nombre de la sala',
      step3Desc: 'Ponle un nombre memorable y divertido a tu partida',
      roomNameLabel: 'Nombre de la sala',
      roomNamePlaceholder: 'ej. Noche Familiar',
      roomNameHelp: 'Debe contener entre 3 y 50 caracteres',
      submitButton: 'Crear sala',
      submitting: 'Creando sala...',
      validationErrorEmpty: 'Please enter a room name (3-50 characters)',
      validationErrorLength: 'Please enter a room name (3-50 characters)',
    },
    gameModes: {
      fastMoneyTitle: 'Dinero Rápido',
      fastMoneyBadge: '2 Jugadores',
      fastMoneyDesc: '¡2 jugadores contra el reloj para alcanzar 200 puntos y ganar!',
      mainGameTitle: 'Juego Principal',
      mainGameBadge: '2-10 Jugadores (Equipos)',
      mainGameDesc: '¡Duelo clásico por equipos con pulsador, strikes y robos de puntos!',
    },
    gameActions: {
      ready: '¡Listo!',
      submit: 'Enviar',
      pass: 'Pasar',
      play: 'Jugar',
      duplicateAnswer: '¡Respuesta repetida! Intenta de nuevo',
    },
    host: {
      hostBoard: 'Pantalla del anfitrión',
      roomCode: 'Código de sala',
      waitingPlayers: 'Esperando a que los jugadores se unan...',
      shareLink: 'Compartir enlace',
      copyLink: 'Copiar enlace',
      linkCopied: '¡Copiado!',
      gameMode: 'Modo de juego',
      language: 'Idioma',
    },
  },
};

