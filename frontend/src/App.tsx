import React, { useState } from 'react';
import { LanguageProvider } from './i18n/LanguageContext';
import { RouterProvider, useRouter, matchRoute } from './router/router';
import { useVirtualKeyboard } from './hooks/useVirtualKeyboard';
import { HomePage } from './pages/HomePage';
import { HostBoard } from './pages/HostBoard';
import { PlayerJoin } from './pages/PlayerJoin';
import { Room } from './types';

export const AppContent: React.FC = () => {
  const { path } = useRouter();
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);
  const { isKeyboardOpen, viewportHeight } = useVirtualKeyboard();

  // Match routes
  const hostMatch = matchRoute('/host/:roomCode', path);
  const playMatch = matchRoute('/play/:roomCode', path);

  const isHostDisplay = Boolean(hostMatch && hostMatch.roomCode);
  const isPlayerController = Boolean(playMatch && playMatch.roomCode);
  const displayMode = isHostDisplay ? 'host' : isPlayerController ? 'player' : 'home';

  const shellLayoutClassName = isHostDisplay
    ? 'min-h-screen min-h-dvh-safe w-full bg-gradient-to-b from-feud-blue-dark via-feud-blue to-feud-slate text-white flex flex-col items-center justify-center px-4 sm:px-6 lg:px-10 2xl:px-14 3xl:px-20 py-2 sm:py-3 lg:py-4 overflow-x-hidden'
    : isPlayerController
    ? `min-h-screen min-h-dvh-safe w-full max-w-[100vw] bg-gradient-to-b from-feud-blue-dark via-feud-blue to-feud-slate text-white flex flex-col items-center ${
        isKeyboardOpen ? 'justify-start px-3 py-2' : 'justify-center px-4 py-4 sm:p-6'
      } pt-safe pb-safe px-safe overflow-x-hidden`
    : 'min-h-screen min-h-dvh-safe w-full bg-gradient-to-b from-feud-blue-dark via-feud-blue to-feud-slate text-white flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 pt-safe pb-safe px-safe overflow-x-hidden';

  const shellInlineStyle =
    isPlayerController && isKeyboardOpen && viewportHeight > 0
      ? { minHeight: `${viewportHeight}px` }
      : undefined;

  return (
    <div
      data-testid="app-display-shell"
      data-display-mode={displayMode}
      data-keyboard-open={isKeyboardOpen ? 'true' : 'false'}
      style={shellInlineStyle}
      className={shellLayoutClassName}
    >
      {hostMatch && hostMatch.roomCode ? (
        <HostBoard
          roomCode={hostMatch.roomCode}
          initialRoom={
            createdRoom && createdRoom.roomCode === hostMatch.roomCode ? createdRoom : null
          }
        />
      ) : playMatch && playMatch.roomCode ? (
        <PlayerJoin roomCode={playMatch.roomCode} />
      ) : (
        <HomePage onRoomCreated={(room) => setCreatedRoom(room)} />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <LanguageProvider>
      <RouterProvider>
        <AppContent />
      </RouterProvider>
    </LanguageProvider>
  );
};

export default App;
