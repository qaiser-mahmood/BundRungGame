import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameType } from '../../shared/types';
import {
  Sparkles,
  Crown,
  ShieldAlert,
  Mic,
  MicOff,
  Volume2,
  Play,
  BookOpen,
  CheckCircle2,
  Users,
  Radio,
} from 'lucide-react';
import { sound } from '../utils/sound';
import { GameRulesModal } from './GameRulesModal';

interface WelcomePortalProps {
  initialPlayerName?: string;
  isMicMuted: boolean;
  onToggleMic: () => void;
  onSelectGameAndJoin: (playerName: string, gameType: GameType) => void;
  activePlayerCount?: number;
}

export const WelcomePortal: React.FC<WelcomePortalProps> = ({
  initialPlayerName = '',
  isMicMuted,
  onToggleMic,
  onSelectGameAndJoin,
  activePlayerCount = 0,
}) => {
  const [name, setName] = useState<string>(() => {
    return localStorage.getItem('bund_rung_player_name') || initialPlayerName || '';
  });
  const [selectedRulesModal, setSelectedRulesModal] = useState<GameType | null>(null);
  const [hasMicPermission, setHasMicPermission] = useState<boolean>(!isMicMuted);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const audioStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Monitor live microphone volume level if mic is enabled
  useEffect(() => {
    if (isMicMuted) {
      setHasMicPermission(false);
      setAudioLevel(0);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    let isSubscribed = true;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        if (!isSubscribed) return;
        audioStreamRef.current = stream;
        setHasMicPermission(true);

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (!isSubscribed) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          setAudioLevel(Math.min(100, Math.round((average / 128) * 100)));
          animationFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      })
      .catch((err) => {
        console.warn('Microphone permission request error:', err);
        setHasMicPermission(false);
      });

    return () => {
      isSubscribed = false;
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isMicMuted]);

  const handleGrantMic = () => {
    sound.playCardSlide();
    onToggleMic();
  };

  const handleStartGame = (gameType: GameType) => {
    if (!name.trim()) {
      sound.playCardSlide();
      setErrorNotice('Please enter your player name to begin.');
      return;
    }
    setErrorNotice(null);
    localStorage.setItem('bund_rung_player_name', name.trim());
    sound.playTrumpReveal();
    onSelectGameAndJoin(name.trim(), gameType);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-lg overflow-y-auto select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-5xl bg-gradient-to-b from-slate-900 via-slate-900 to-felt-dark border-2 border-amber-500/50 rounded-3xl shadow-2xl p-5 sm:p-8 relative my-auto overflow-hidden"
      >
        {/* Decorative Golden Corners */}
        <div className="absolute top-0 left-0 w-10 h-10 border-t-2 border-l-2 border-amber-400 m-3 rounded-tl pointer-events-none" />
        <div className="absolute top-0 right-0 w-10 h-10 border-t-2 border-r-2 border-amber-400 m-3 rounded-tr pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-10 h-10 border-b-2 border-l-2 border-amber-400 m-3 rounded-bl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-10 h-10 border-b-2 border-r-2 border-amber-400 m-3 rounded-br pointer-events-none" />

        {/* Portal Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold tracking-wider uppercase mb-2">
            <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>4-Player Live Audio Card Arena</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-cinzel font-black gold-gradient-text tracking-wider">
            BUND RUNG & COURT PIECE
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto mt-1">
            Choose your game variant, set up your microphone for real-time table talk, and enjoy authentic 2v2 card battles with friends and smart AI bots.
          </p>
        </div>

        {/* Player Profile & Audio Setup Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6 bg-slate-950/70 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-inner">
          {/* Name Input */}
          <div className="md:col-span-7 flex flex-col justify-center">
            <label className="block text-xs font-bold text-amber-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Your Player Name</span>
              {name.trim() && (
                <span className="text-emerald-400 text-[11px] font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                </span>
              )}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorNotice) setErrorNotice(null);
              }}
              placeholder="e.g. Qaiser, Raja, Tariq..."
              maxLength={20}
              className="w-full px-4 py-3 bg-slate-900 border-2 border-amber-500/40 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm font-semibold transition"
            />
            {errorNotice && (
              <p className="text-red-400 text-xs mt-1.5 font-medium animate-pulse">
                {errorNotice}
              </p>
            )}
          </div>

          {/* Microphone & Voice Permissions Setup */}
          <div className="md:col-span-5 flex flex-col justify-center p-3 rounded-xl bg-slate-900/90 border border-slate-700/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-emerald-400" />
                <span>Table Voice Chat</span>
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                !isMicMuted ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
              }`}>
                {!isMicMuted ? 'Mic Enabled' : 'Mic Off'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGrantMic}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  !isMicMuted
                    ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] border border-emerald-400'
                    : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-md font-extrabold'
                }`}
              >
                {!isMicMuted ? (
                  <>
                    <Mic className="w-3.5 h-3.5 animate-pulse text-white" />
                    <span>Microphone On</span>
                  </>
                ) : (
                  <>
                    <MicOff className="w-3.5 h-3.5 text-slate-950" />
                    <span>Enable Microphone</span>
                  </>
                )}
              </button>

              {/* Live Audio Level Meter */}
              {!isMicMuted && (
                <div className="flex items-center gap-0.5 px-2 py-2 bg-slate-950 rounded-lg border border-slate-800" title={`Live Mic Volume: ${audioLevel}%`}>
                  {[1, 2, 3, 4, 5].map((barIdx) => {
                    const threshold = barIdx * 18;
                    const isActive = audioLevel >= threshold;
                    return (
                      <div
                        key={barIdx}
                        className={`w-1 rounded-full transition-all duration-75 ${
                          isActive
                            ? barIdx > 3
                              ? 'bg-amber-400 h-4'
                              : 'bg-emerald-400 h-3'
                            : 'bg-slate-800 h-1.5'
                        }`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              {!isMicMuted
                ? 'Speak now — live audio meter tests your input level!'
                : 'Tap to grant microphone permission for live table communication.'}
            </p>
          </div>
        </div>

        {/* Game Mode Selection Tiles */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs font-bold text-amber-300 uppercase tracking-wider mb-3">
            <span>Select Game Variant</span>
            <span className="text-slate-400 font-normal text-[11px]">
              {activePlayerCount > 0 ? `${activePlayerCount} player(s) waiting at table` : '4 players needed to play'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Tile 1: Bund Rung */}
            <div className="relative p-5 rounded-2xl bg-gradient-to-b from-amber-950/40 via-slate-900 to-slate-900 border-2 border-amber-500 shadow-glow-gold flex flex-col justify-between group hover:border-amber-400 transition-all">
              <div className="absolute top-3 right-3">
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 shadow">
                  PLAY NOW
                </span>
              </div>

              <div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="font-cinzel font-black text-lg text-amber-200 mb-1">
                  BUND RUNG
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  Hidden trump card, table trick accumulation, Ace downgrade tactics, and Khoti match scoring.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => handleStartGame('BUND_RUNG')}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-cinzel font-black text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition transform active:scale-95"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Enter Table</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sound.playCardSlide();
                    setSelectedRulesModal('BUND_RUNG');
                  }}
                  className="w-full py-1.5 rounded-lg text-slate-400 hover:text-amber-300 text-[11px] font-semibold flex items-center justify-center gap-1 transition"
                >
                  <BookOpen className="w-3 h-3" />
                  <span>Read Rules</span>
                </button>
              </div>
            </div>

            {/* Tile 2: Bund Rung (Bidding) */}
            <div className="relative p-5 rounded-2xl bg-gradient-to-b from-amber-950/20 via-slate-900 to-slate-900 border border-slate-800 hover:border-amber-500/50 transition-all flex flex-col justify-between opacity-85 hover:opacity-100">
              <div className="absolute top-3 right-3">
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-500/40">
                  COMING SOON
                </span>
              </div>

              <div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="font-cinzel font-bold text-lg text-amber-200 mb-1">
                  BUND RUNG (BIDDING)
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Contract trick bidding (7 to 13) with secret trump, trick bonuses, under-tricking penalties, and accumulation.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => {
                    sound.playCardSlide();
                    setSelectedRulesModal('BUND_RUNG_BIDDING');
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Rules & Preview</span>
                </button>
              </div>
            </div>

            {/* Tile 2: Open Rung */}
            <div className="relative p-5 rounded-2xl bg-gradient-to-b from-blue-950/20 via-slate-900 to-slate-900 border border-slate-800 hover:border-blue-500/50 transition-all flex flex-col justify-between opacity-85 hover:opacity-100">
              <div className="absolute top-3 right-3">
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-950 text-blue-300 border border-blue-500/40">
                  COMING SOON
                </span>
              </div>

              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-3">
                  <Crown className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="font-cinzel font-bold text-lg text-blue-200 mb-1">
                  OPEN RUNG
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Sir Rung / Court Piece. Public trump announced from first 5 cards with immediate single trick claiming.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => {
                    sound.playCardSlide();
                    setSelectedRulesModal('OPEN_RUNG');
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Rules & Preview</span>
                </button>
              </div>
            </div>

            {/* Tile 3: Bhabhi Thulla */}
            <div className="relative p-5 rounded-2xl bg-gradient-to-b from-rose-950/20 via-slate-900 to-slate-900 border border-slate-800 hover:border-rose-500/50 transition-all flex flex-col justify-between opacity-85 hover:opacity-100">
              <div className="absolute top-3 right-3">
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-950 text-rose-300 border border-rose-500/40">
                  COMING SOON
                </span>
              </div>

              <div>
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-3">
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                </div>
                <h3 className="font-cinzel font-bold text-lg text-rose-200 mb-1">
                  BHABHI THULLA
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  The famous trick-shedding card game. Empty your hand, avoid the Thulla penalty, and don't be the Bhabhi!
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => {
                    sound.playCardSlide();
                    setSelectedRulesModal('BHABHI_THULLA');
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Rules & Preview</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Rules Modal for selected game */}
      {selectedRulesModal && (
        <GameRulesModal
          gameType={selectedRulesModal}
          isOpen={true}
          onClose={() => setSelectedRulesModal(null)}
          onPlayBundRung={() => handleStartGame('BUND_RUNG')}
        />
      )}
    </div>
  );
};
