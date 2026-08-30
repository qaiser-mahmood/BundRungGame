import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Player, TeamId } from '../../shared/types';
import { Users, Bot, Play, Sparkles, Copy, Check, Shield, ArrowRightLeft, UserCheck, Shuffle, Pencil, X } from 'lucide-react';
import { sound } from '../utils/sound';

interface LobbyViewProps {
  players: Player[];
  myPlayerId: string;
  teamNames?: { TEAM_1: string; TEAM_2: string };
  onJoinLobby: (name: string) => void;
  onAddBots: () => void;
  onStartToss: () => void;
  onSwapSeats: (player1Id: string, player2Id: string) => void;
  onUpdateTeamName?: (team: TeamId, name: string) => void;
  statusMessage: string;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  players,
  myPlayerId,
  teamNames,
  onJoinLobby,
  onAddBots,
  onStartToss,
  onSwapSeats,
  onUpdateTeamName,
  statusMessage,
}) => {
  const [nameInput, setNameInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedForSwap, setSelectedForSwap] = useState<string | null>(null);

  const [editingTeam1, setEditingTeam1] = useState(false);
  const [editingTeam2, setEditingTeam2] = useState(false);
  const [team1NameInput, setTeam1NameInput] = useState('');
  const [team2NameInput, setTeam2NameInput] = useState('');

  useEffect(() => {
    if (teamNames?.TEAM_1) setTeam1NameInput(teamNames.TEAM_1);
    if (teamNames?.TEAM_2) setTeam2NameInput(teamNames.TEAM_2);
  }, [teamNames]);

  const me = players.find((p) => p.id === myPlayerId);
  const totalPlayers = players.length;
  const isFull = totalPlayers === 4;

  // Split into Team 1 and Team 2 based on seating
  const team1Players = players.filter((p) => p.team === 'TEAM_1');
  const team2Players = players.filter((p) => p.team === 'TEAM_2');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    onJoinLobby(nameInput.trim());
    sound.playCardPlace();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlayerSlotClick = (clickedPlayerId: string) => {
    if (!isFull) return;

    if (!selectedForSwap) {
      setSelectedForSwap(clickedPlayerId);
      sound.playCardSlide();
    } else if (selectedForSwap === clickedPlayerId) {
      setSelectedForSwap(null);
    } else {
      // Perform swap between selectedForSwap and clickedPlayerId
      sound.playCardPlace();
      onSwapSeats(selectedForSwap, clickedPlayerId);
      setSelectedForSwap(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-felt-dark border-2 border-amber-500/40 rounded-2xl shadow-2xl p-5 sm:p-7 relative my-auto overflow-hidden"
      >
        {/* Decorative Golden Corner Accents */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-amber-400 m-2 rounded-tl pointer-events-none" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-amber-400 m-2 rounded-tr pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-amber-400 m-2 rounded-bl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-amber-400 m-2 rounded-br pointer-events-none" />

        {/* Title Header */}
        <div className="text-center mb-5">
          <h1 className="text-3xl sm:text-4xl font-cinzel font-black gold-gradient-text tracking-wide mb-1">
            BUND RUNG
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            {isFull
              ? 'Select or swap players to configure 2v2 Teams (Opposite Seating).'
              : 'Waiting for 4 players to join.'}
          </p>
        </div>

        {/* Player Name Form if not yet joined */}
        {!me && (
          <form onSubmit={handleJoin} className="mb-5 bg-slate-800/80 p-4 rounded-xl border border-slate-700 shadow-inner">
            <label className="block text-xs font-bold text-amber-300 uppercase tracking-wider mb-2">
              Enter Your Player Name to Join Table
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Qaiser, Alex, Raja..."
                maxLength={20}
                required
                className="flex-1 px-4 py-2.5 bg-slate-950 border border-amber-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
              />
              <button
                type="submit"
                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg text-sm transition shadow-lg cursor-pointer"
              >
                Join Game
              </button>
            </div>
          </form>
        )}

        {/* Status Bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 px-4 py-2.5 rounded-xl">
          <div className="flex items-center gap-2 text-xs">
            <Users className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-white">Players: {totalPlayers}/4</span>
            <span className="text-slate-400">|</span>
            <span className="text-amber-300 font-medium">{statusMessage}</span>
          </div>

          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs border border-slate-600 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied Link' : 'Invite via URL'}
          </button>
        </div>

        {/* Section 2.2: Interactive Team Formation & Seating Selection */}
        {isFull ? (
          <div className="mb-5 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-amber-300">
              <span className="flex items-center gap-1.5 uppercase tracking-wider">
                <UserCheck className="w-4 h-4 text-emerald-400" /> Team Formation (2 vs 2)
              </span>
              <span className="text-[11px] font-normal text-slate-400">
                💡 Click any player to swap their team/seat
              </span>
            </div>

            {selectedForSwap && (
              <div className="p-2.5 bg-amber-500/20 border border-amber-400 rounded-lg text-xs text-amber-200 text-center animate-pulse">
                Click another player below to swap positions with <strong>{players.find((p) => p.id === selectedForSwap)?.name}</strong>!
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* --- TEAM 1 (Blue) --- */}
              <div className="p-3.5 rounded-xl bg-blue-950/30 border-2 border-blue-500/40 flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-blue-500/30 pb-1.5 gap-2">
                  {editingTeam1 ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (team1NameInput.trim()) {
                          onUpdateTeamName?.('TEAM_1', team1NameInput.trim());
                        }
                        setEditingTeam1(false);
                      }}
                      className="flex items-center gap-1.5 flex-1"
                    >
                      <input
                        type="text"
                        value={team1NameInput}
                        onChange={(e) => setTeam1NameInput(e.target.value)}
                        placeholder="Team 1 Name"
                        maxLength={25}
                        autoFocus
                        className="px-2 py-0.5 bg-slate-950 border border-blue-400 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-400 flex-1"
                      />
                      <button
                        type="submit"
                        className="p-1 bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer"
                        title="Save Team Name"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTeam1(false)}
                        className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1.5 font-cinzel font-bold text-blue-400 text-sm min-w-0">
                      <span className="w-3 h-3 rounded-full bg-blue-500 inline-block flex-shrink-0" />
                      <span className="truncate">{teamNames?.TEAM_1 || 'TEAM 1'}</span>
                      <button
                        onClick={() => {
                          setTeam1NameInput(teamNames?.TEAM_1 || '');
                          setEditingTeam1(true);
                        }}
                        className="p-1 hover:bg-blue-900/40 rounded text-blue-400/70 hover:text-blue-300 transition cursor-pointer"
                        title="Edit Team Name"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                    Seated: Bottom & Top
                  </span>
                </div>

                <div className="space-y-2">
                  {players
                    .filter((p) => p.seat === 'BOTTOM' || p.seat === 'TOP')
                    .map((p) => {
                      const isMe = p.id === myPlayerId;
                      const isSelected = selectedForSwap === p.id;

                      return (
                        <div
                          key={p.id}
                          onClick={() => handlePlayerSlotClick(p.id)}
                          className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-amber-500/30 border-amber-400 ring-2 ring-amber-400 shadow-glow-gold'
                              : isMe
                              ? 'bg-blue-900/50 border-blue-400'
                              : 'bg-slate-800/80 border-slate-700 hover:border-blue-400'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${p.isBot ? 'bg-indigo-600 text-white' : 'bg-blue-600 text-white'}`}>
                              {p.isBot ? <Bot className="w-3.5 h-3.5" /> : p.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                {p.name} {isMe && <span className="text-amber-400 text-[10px]">(You)</span>}
                              </div>
                              <div className="text-[10px] text-blue-300/80">
                                Position: {p.seat === 'BOTTOM' ? 'Bottom (South)' : 'Top (North)'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-1 bg-slate-900/60 rounded border border-slate-700">
                            <ArrowRightLeft className="w-3 h-3" />
                            <span>Swap</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* --- TEAM 2 (Rose) --- */}
              <div className="p-3.5 rounded-xl bg-rose-950/30 border-2 border-rose-500/40 flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-rose-500/30 pb-1.5 gap-2">
                  {editingTeam2 ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (team2NameInput.trim()) {
                          onUpdateTeamName?.('TEAM_2', team2NameInput.trim());
                        }
                        setEditingTeam2(false);
                      }}
                      className="flex items-center gap-1.5 flex-1"
                    >
                      <input
                        type="text"
                        value={team2NameInput}
                        onChange={(e) => setTeam2NameInput(e.target.value)}
                        placeholder="Team 2 Name"
                        maxLength={25}
                        autoFocus
                        className="px-2 py-0.5 bg-slate-950 border border-rose-400 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-rose-400 flex-1"
                      />
                      <button
                        type="submit"
                        className="p-1 bg-rose-600 hover:bg-rose-500 text-white rounded cursor-pointer"
                        title="Save Team Name"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTeam2(false)}
                        className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1.5 font-cinzel font-bold text-rose-400 text-sm min-w-0">
                      <span className="w-3 h-3 rounded-full bg-rose-500 inline-block flex-shrink-0" />
                      <span className="truncate">{teamNames?.TEAM_2 || 'TEAM 2'}</span>
                      <button
                        onClick={() => {
                          setTeam2NameInput(teamNames?.TEAM_2 || '');
                          setEditingTeam2(true);
                        }}
                        className="p-1 hover:bg-rose-900/40 rounded text-rose-400/70 hover:text-rose-300 transition cursor-pointer"
                        title="Edit Team Name"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                    Seated: Right & Left
                  </span>
                </div>

                <div className="space-y-2">
                  {players
                    .filter((p) => p.seat === 'RIGHT' || p.seat === 'LEFT')
                    .map((p) => {
                      const isMe = p.id === myPlayerId;
                      const isSelected = selectedForSwap === p.id;

                      return (
                        <div
                          key={p.id}
                          onClick={() => handlePlayerSlotClick(p.id)}
                          className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-amber-500/30 border-amber-400 ring-2 ring-amber-400 shadow-glow-gold'
                              : isMe
                              ? 'bg-rose-900/50 border-rose-400'
                              : 'bg-slate-800/80 border-slate-700 hover:border-rose-400'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${p.isBot ? 'bg-indigo-600 text-white' : 'bg-rose-600 text-white'}`}>
                              {p.isBot ? <Bot className="w-3.5 h-3.5" /> : p.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                {p.name} {isMe && <span className="text-amber-400 text-[10px]">(You)</span>}
                              </div>
                              <div className="text-[10px] text-rose-300/80">
                                Position: {p.seat === 'RIGHT' ? 'Right (East)' : 'Left (West)'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-1 bg-slate-900/60 rounded border border-slate-700">
                            <ArrowRightLeft className="w-3 h-3" />
                            <span>Swap</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Waiting Grid when less than 4 players */
          <div className="mb-5">
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((idx) => {
                const p = players[idx];
                const seatName = ['Bottom (Team 1)', 'Right (Team 2)', 'Top (Team 1)', 'Left (Team 2)'][idx];

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex items-center gap-3 ${
                      p
                        ? 'bg-slate-800/80 border-slate-600'
                        : 'bg-slate-900/40 border-dashed border-slate-700 opacity-60'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-slate-800 text-slate-400">
                      {p ? (p.isBot ? <Bot className="w-4 h-4" /> : p.name.charAt(0).toUpperCase()) : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {p ? p.name : 'Waiting for player...'}
                      </div>
                      <div className="text-[10px] text-slate-400">{seatName}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row gap-3 justify-end pt-2 border-t border-slate-800">
          {!isFull && (
            <button
              onClick={() => {
                sound.playCardSlide();
                onAddBots();
              }}
              className="px-5 py-3 bg-indigo-600/90 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-lg cursor-pointer"
            >
              <Bot className="w-4 h-4" /> Fill with Smart AI Bots
            </button>
          )}

          {isFull && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                sound.playTrumpReveal();
                onStartToss();
              }}
              className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-cinzel font-bold text-base rounded-xl transition shadow-glow-gold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" /> Begin Toss
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
