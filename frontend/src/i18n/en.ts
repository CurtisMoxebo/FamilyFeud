import { TranslationDictionary } from './types';

export const en: TranslationDictionary = {
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
};

export default en;

