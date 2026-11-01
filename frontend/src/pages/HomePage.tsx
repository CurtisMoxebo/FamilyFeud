import React from 'react';
import { Room } from '../types';
import { useRouter } from '../router/router';
import { useTranslation } from '../i18n/LanguageContext';
import { useSocket } from '../hooks/useSocket';
import { RoomCreateForm } from '../components/RoomCreateForm';
import { Sparkles } from 'lucide-react';

export interface HomePageProps {
  onRoomCreated?: (room: Room) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onRoomCreated }) => {
  const { navigate } = useRouter();
  const { t } = useTranslation();
  const { isConnected } = useSocket();

  const handleRoomCreated = (room: Room) => {
    if (onRoomCreated) {
      onRoomCreated(room);
    }
    navigate(`/host/${room.roomCode}`);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Header Bar */}
      <header className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-feud-gold/20 border border-feud-gold/40 text-feud-gold text-sm font-semibold tracking-wide uppercase mb-4 animate-pulse">
          <Sparkles className="w-4 h-4" />
          {t.app.poweredBy}
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-wider uppercase font-game text-transparent bg-clip-text bg-gradient-to-r from-feud-gold-light via-feud-gold to-yellow-200 drop-shadow-[0_4px_12px_rgba(245,158,11,0.5)]">
          {t.app.title}
        </h1>
        <p className="text-base md:text-xl text-blue-200 mt-2 font-medium">
          {t.app.subtitle}
        </p>

        {/* Real-time WebSocket Status Pill */}
        <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900/60 border border-slate-700/60 text-xs font-semibold">
          {isConnected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
              <span className="text-green-400">{t.app.connected}</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              <span className="text-yellow-400">{t.app.connecting}</span>
            </>
          )}
        </div>
      </header>

      {/* Main Room Creation Form Card */}
      <main className="w-full flex justify-center">
        <RoomCreateForm onRoomCreated={handleRoomCreated} />
      </main>
    </div>
  );
};

export default HomePage;
