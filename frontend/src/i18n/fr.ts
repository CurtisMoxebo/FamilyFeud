import { TranslationDictionary } from './types';

export const fr: TranslationDictionary = {
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
};

export default fr;

