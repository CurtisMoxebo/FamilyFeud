import React, { useState } from 'react';
import { LanguageProvider } from './i18n/LanguageContext';
import { RouterProvider, useRouter, matchRoute } from './router/router';
import { HomePage } from './pages/HomePage';
import { HostBoard } from './pages/HostBoard';
import { Room } from './types';

export const AppContent: React.FC = () => {
  const { path } = useRouter();
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);

  // Match /host/:roomCode
  const hostMatch = matchRoute('/host/:roomCode', path);

  return (
    <div className="min-h-screen bg-gradient-to-b from-feud-blue-dark via-feud-blue to-feud-slate text-white flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      {hostMatch && hostMatch.roomCode ? (
        <HostBoard
          roomCode={hostMatch.roomCode}
          initialRoom={
            createdRoom && createdRoom.roomCode === hostMatch.roomCode ? createdRoom : null
          }
        />
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
