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
  joinRoom: {
    title: string;
    subtitle: string;
    tabHost: string;
    tabJoin: string;
    roomCodeLabel: string;
    roomCodePlaceholder: string;
    nicknameLabel: string;
    nicknamePlaceholder: string;
    joinButton: string;
    joining: string;
    scanToJoin: string;
    validationErrorNickname: string;
    validationErrorRoomCode: string;
    roomNotFound: string;
  };
  lobby: {
    rosterTitle: string;
    waitingForHost: string;
    roomFullTitle: string;
    roomFullFastMoney: string;
    roomFullMainGame: string;
    fastMoneyCapacity: string;
    mainGameCapacity: string;
    startGame: string;
    startGameWithCount: string;
    mainGameEvenCountRequired: string;
    mainGameCurrentWaiting: string;
    fastMoneyWaiting: string;
    statusHost: string;
    statusReady: string;
    statusWaiting: string;
    statusDisconnected: string;
    backHome: string;
  };
  fastMoney: {
    p1ReadyTitle: string;
    p1ReadySubtitle: string;
    imReady: string;
    questionProgress: string;
    answerPlaceholder: string;
    passButton: string;
    submitButton: string;
    secondsLeft: string;
    turnCompleteTitle: string;
    turnCompleteSubtitle: string;
    answeredCount: string;
    player2IsolationTitle: string;
    player2IsolationSubtitle: string;
  };
}
