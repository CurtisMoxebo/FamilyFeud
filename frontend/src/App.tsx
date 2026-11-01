import React from 'react';
import { useSocket } from './hooks/useSocket';
import { Tv, Smartphone, Wifi, WifiOff, Sparkles, Trophy } from 'lucide-react';

export const App: React.FC = () => {
  const { isConnected, socketId } = useSocket();

  return (
    <div className="min-h-screen bg-gradient-to-b from-feud-blue-dark via-feud-blue to-feud-slate text-white flex flex-col items-center justify-center p-6">
      {/* Header Bar */}
      <header className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-feud-gold/20 border border-feud-gold/40 text-feud-gold text-sm font-semibold tracking-wide uppercase mb-4 animate-pulse">
          <Sparkles className="w-4 h-4" />
          Powered by Google Gemini AI
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-wider uppercase font-game text-transparent bg-clip-text bg-gradient-to-r from-feud-gold-light via-feud-gold to-yellow-200 drop-shadow-[0_4px_12px_rgba(245,158,11,0.5)]">
          Family Feud
        </h1>
        <p className="text-lg md:text-xl text-blue-200 mt-2 font-medium">
          Multiplayer Game Show & Real-Time Duel
        </p>
      </header>

      {/* Connection Status Card */}
      <div className="bg-feud-slate-card/90 backdrop-blur-md border border-feud-slate-border rounded-2xl p-6 shadow-2xl max-w-md w-full mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isConnected ? (
              <div className="p-2.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                <Wifi className="w-6 h-6 animate-pulse" />
              </div>
            ) : (
              <div className="p-2.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                <WifiOff className="w-6 h-6" />
              </div>
            )}
            <div>
              <h2 className="text-sm uppercase tracking-wider text-slate-400 font-semibold">
                WebSocket Engine
              </h2>
              <p className="text-lg font-bold flex items-center gap-2">
                {isConnected ? (
                  <span className="text-green-400">Connected</span>
                ) : (
                  <span className="text-yellow-400">Connecting to Server...</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {isConnected && socketId && (
          <div className="mt-4 pt-4 border-t border-feud-slate-border/50 text-xs text-slate-400 flex items-center justify-between">
            <span>Socket Client ID:</span>
            <span className="font-mono bg-slate-900/80 px-2 py-1 rounded text-blue-300">
              {socketId}
            </span>
          </div>
        )}
      </div>

      {/* Navigation / Mode Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full">
        {/* Host TV Display */}
        <div className="group relative bg-gradient-to-br from-blue-900/60 to-slate-900/80 border border-blue-500/30 hover:border-feud-gold/70 rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] shadow-xl hover:shadow-feud-gold/10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-600/30 text-feud-gold-light rounded-xl border border-blue-500/40 group-hover:bg-feud-gold/20 group-hover:text-feud-gold transition-colors">
              <Tv className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold font-game tracking-wide text-white group-hover:text-feud-gold transition-colors">
                Host TV Board
              </h3>
              <p className="text-sm text-slate-300">
                Main arena display with big-screen scoreboard & sound effects
              </p>
            </div>
          </div>
          <button
            type="button"
            className="w-full mt-2 py-3 px-4 rounded-xl bg-feud-gold hover:bg-feud-gold-light text-feud-blue-dark font-extrabold uppercase tracking-wider transition-colors shadow-lg hover:shadow-feud-gold/30 flex items-center justify-center gap-2"
          >
            <Trophy className="w-5 h-5" />
            Launch Host Screen
          </button>
        </div>

        {/* Player Controller */}
        <div className="group relative bg-gradient-to-br from-blue-900/60 to-slate-900/80 border border-blue-500/30 hover:border-red-500/70 rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] shadow-xl hover:shadow-red-500/10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-red-600/30 text-red-400 rounded-xl border border-red-500/40 group-hover:bg-red-500/20 group-hover:text-red-300 transition-colors">
              <Smartphone className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold font-game tracking-wide text-white group-hover:text-red-400 transition-colors">
                Player Controller
              </h3>
              <p className="text-sm text-slate-300">
                Join a room, buzz in, and submit your answers on mobile
              </p>
            </div>
          </div>
          <button
            type="button"
            className="w-full mt-2 py-3 px-4 rounded-xl bg-feud-red hover:bg-red-500 text-white font-extrabold uppercase tracking-wider transition-colors shadow-lg hover:shadow-red-500/30 flex items-center justify-center gap-2"
          >
            Join Game Room
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-slate-500">
        Family Feud AI Showdown • Fast Money & Main Game Modes • Real-time Socket.io Sync
      </footer>
    </div>
  );
};

export default App;

