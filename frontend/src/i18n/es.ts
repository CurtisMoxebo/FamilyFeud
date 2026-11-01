import { TranslationDictionary } from './types';

export const es: TranslationDictionary = {
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
    step1Desc: 'Las questions y la voz del anfitrión se generarán en este idioma',
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
};

export default es;

