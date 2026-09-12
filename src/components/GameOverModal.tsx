import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { TeamId } from '../../shared/types';
import { Trophy, RefreshCw, Minimize2, Maximize2 } from 'lucide-react';
import { sound } from '../utils/sound';

interface GameOverModalProps {
  losingTeamKhoti: TeamId | null;
  matchWinnerTeam?: TeamId | null;
  score?: number;
  teamNames?: { TEAM_1: string; TEAM_2: string };
  onRematchSameRoster: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  losingTeamKhoti,
  matchWinnerTeam,
  score,
  teamNames,
  onRematchSameRoster,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    sound.playFanfare();
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (e) {}
  }, []);

  const losingTeam = losingTeamKhoti || 'TEAM_1';
  const rawLosingTeamName = teamNames?.[losingTeam] || (losingTeam === 'TEAM_1' ? 'Team 1' : 'Team 2');
  const losingTeamName = rawLosingTeamName.replace(/\s*\(AI\)/gi, '').trim();

  return (
    <div className="fixed inset-x-4 top-12 sm:top-14 z-40 flex justify-center pointer-events-none">
      <motion.div
        initial={{ y: -20, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: -20, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="pointer-events-auto w-full max-w-md bg-slate-950/95 border-2 border-amber-500 rounded-2xl p-3 sm:p-3.5 shadow-2xl text-center relative overflow-hidden"
      >
        {isMinimized ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-left min-w-0">
              <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="font-cinzel font-black text-xs sm:text-sm text-amber-300 truncate">
                KHOTI: {losingTeamName}
              </span>
            </div>
            <button
              onClick={() => setIsMinimized(false)}
              className="p-1 text-slate-400 hover:text-white transition rounded hover:bg-slate-800 cursor-pointer"
              title="Expand banner"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 text-left min-w-0">
                <div className="p-1.5 bg-red-500/20 border border-red-500/40 rounded-xl text-red-400 flex-shrink-0">
                  <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-cinzel font-black text-red-400 leading-tight truncate">
                    {losingTeamName} is Khoti!
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1 text-slate-400 hover:text-white transition rounded-lg hover:bg-slate-800 cursor-pointer"
                title="Minimize banner"
              >
                <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>

            <button
              onClick={onRematchSameRoster}
              className="w-full py-1.5 sm:py-2 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-cinzel font-black text-xs sm:text-sm rounded-xl transition shadow-glow-gold flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Start New Game
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
};
