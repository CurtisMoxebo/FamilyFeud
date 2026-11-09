import React, { useState } from 'react';
import { Room } from '../types';
import { useRouter } from '../router/router';
import { useTranslation } from '../i18n/LanguageContext';
import { RoomCreateForm } from '../components/RoomCreateForm';
import { RoomJoinForm } from '../components/RoomJoinForm';
import { Tv, LogIn } from 'lucide-react';

export interface HomePageProps {
  onRoomCreated?: (room: Room) => void;
  defaultTab?: 'host' | 'join';
}

export const HomePage: React.FC<HomePageProps> = ({ onRoomCreated, defaultTab = 'host' }) => {
  const { navigate } = useRouter();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'host' | 'join'>(defaultTab);

  const handleRoomCreated = (room: Room) => {
    if (onRoomCreated) {
      onRoomCreated(room);
    }
    navigate(`/host/${room.roomCode}`);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Header Bar */}
      <header className="text-center mb-6">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-wider uppercase font-game text-transparent bg-clip-text bg-gradient-to-r from-feud-gold-light via-feud-gold to-yellow-200 drop-shadow-[0_4px_12px_rgba(245,158,11,0.5)]">
          {t.app.title}
        </h1>
        <p className="text-base md:text-xl text-blue-200 mt-2 font-medium">
          {t.app.subtitle}
        </p>
      </header>

      {/* Mode Selector Tabs (Host a Game vs. Join a Game) */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-900/80 border border-slate-700/80 rounded-2xl mb-8 shadow-lg">
        <button
          type="button"
          data-testid="tab-host-btn"
          onClick={() => setActiveTab('host')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm tracking-wide transition-all cursor-pointer ${
            activeTab === 'host'
              ? 'bg-feud-gold text-slate-950 shadow-md shadow-feud-gold/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>{t.joinRoom.tabHost}</span>
        </button>
        <button
          type="button"
          data-testid="tab-join-btn"
          onClick={() => setActiveTab('join')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm tracking-wide transition-all cursor-pointer ${
            activeTab === 'join'
              ? 'bg-feud-gold text-slate-950 shadow-md shadow-feud-gold/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <LogIn className="w-4 h-4" />
          <span>{t.joinRoom.tabJoin}</span>
        </button>
      </div>

      {/* Main Form Display */}
      <main className="w-full flex justify-center">
        {activeTab === 'host' ? (
          <RoomCreateForm onRoomCreated={handleRoomCreated} />
        ) : (
          <RoomJoinForm />
        )}
      </main>
    </div>
  );
};

export default HomePage;
