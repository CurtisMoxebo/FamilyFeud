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

