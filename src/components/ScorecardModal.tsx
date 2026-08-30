import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ScorecardState, ScorecardEntry, TeamId } from '../../shared/types';
import { Award, BookOpen, Clock, AlertTriangle, X } from 'lucide-react';

interface ScorecardModalProps {
  scorecard: ScorecardState;
  activeDealerName: string;
  activeDealerTeam: TeamId;
  teamNames?: { TEAM_1: string; TEAM_2: string };
  onClose: () => void;
}

export const ScorecardModal: React.FC<ScorecardModalProps> = ({
  scorecard,
  activeDealerName,
  activeDealerTeam,
  teamNames,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'current' | 'matrix' | 'history'>('current');

  const dealerScore = scorecard.dealerScore;
  const progressPercent = Math.min(100, Math.max(0, (dealerScore / 100) * 100));
  const activeDealerTeamName = activeDealerTeam === 'TEAM_1' ? (teamNames?.TEAM_1 || 'Team 1') : (teamNames?.TEAM_2 || 'Team 2');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl max-h-[90vh] bg-slate-900 border-2 border-amber-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-850 to-felt-dark border-b border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-400">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-cinzel font-bold gold-gradient-text">
                OFFICIAL SCORECARD ENGINE
              </h2>
              <p className="text-xs text-slate-400">
                Assigned to Active Dealer: <span className="text-amber-300 font-bold">{activeDealerName}</span> ({activeDealerTeamName})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 pt-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('current')}
            className={`px-4 py-2 rounded-t-lg transition ${
              activeTab === 'current'
                ? 'bg-slate-900 text-amber-300 border-t-2 border-amber-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Match Score & KHOTI Gauge
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-t-lg transition ${
              activeTab === 'history'
                ? 'bg-slate-900 text-amber-300 border-t-2 border-amber-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Game Log History ({scorecard.history.length})
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-4 py-2 rounded-t-lg transition ${
              activeTab === 'matrix'
                ? 'bg-slate-900 text-amber-300 border-t-2 border-amber-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Master 24-Rule Matrix Reference
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto flex-1 text-slate-200 text-sm">
          {activeTab === 'current' && (
            <div className="space-y-6">
              {/* Score Card Display */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-800/80 border border-amber-500/30">
                  <div className="text-xs uppercase font-bold text-slate-400 mb-1">
                    Dealer's Active Scorecard
                  </div>
                  <div className="text-4xl font-cinzel font-black text-amber-400 mb-1">
                    {dealerScore} <span className="text-sm font-normal text-slate-400">Pts</span>
                  </div>
                  <div className="text-xs text-slate-300">
                    Starts at 0. Positive points accumulate towards dealer KHOTI (loss).
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700">
                  <div className="text-xs uppercase font-bold text-slate-400 mb-1">
                    KHOTI & Dealership Rules
                  </div>
                  <div className="text-xs text-slate-300 space-y-1">
                    <div>• <strong>Score &ge; 100:</strong> Dealer team is <strong>KHOTI</strong> &rarr; Dealership transfers to <strong>second player of dealer team</strong> (0 score).</div>
                    <div>• <strong>Score &le; -100:</strong> Opponent team is <strong>KHOTI</strong> &rarr; Dealership transfers to <strong>player right of dealer</strong> (0 score).</div>
                    <div>• <strong>Score between 0 and -100:</strong> Dealership transfers to <strong>player right of dealer</strong> with <strong>absolute value</strong> (+pts). No KHOTI.</div>
                  </div>
                </div>
              </div>

              {/* KHOTI Progress Gauge */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold uppercase text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Match Loss Thresholds (KHOTI)
                  </span>
                  <span className="text-xs font-bold text-slate-300">Current: {dealerScore} Points</span>
                </div>
                <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                  <div
                    style={{ width: `${progressPercent}%` }}
                    className={`h-full rounded-full transition-all duration-500 ${
                      dealerScore >= 80
                        ? 'bg-gradient-to-r from-amber-500 to-red-500'
                        : dealerScore >= 50
                        ? 'bg-gradient-to-r from-yellow-500 to-amber-500'
                        : 'bg-gradient-to-r from-emerald-500 to-amber-400'
                    }`}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>0 Pts (Start)</span>
                  <span>50 Pts</span>
                  <span className="text-red-400 font-bold">&ge; 100 Pts (Dealer Team KHOTI)</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              {scorecard.history.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  No completed games in this match yet. Play rounds to generate scorecard history.
                </div>
              ) : (
                <div className="space-y-2">
                  {scorecard.history.map((entry, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-800/60 rounded-lg border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2"
                    >
                      <div>
                        <div className="font-bold text-white">
                          Game #{entry.gameIndex}: {entry.trumpMode} ({entry.modifier})
                        </div>
                        <div className="text-slate-400">{entry.notes}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`font-bold font-cinzel text-sm px-2 py-0.5 rounded ${
                            entry.scoreAdjustment >= 0
                              ? 'text-red-400 bg-red-950/40'
                              : 'text-emerald-400 bg-emerald-950/40'
                          }`}
                        >
                          {entry.scoreAdjustment > 0 ? `+${entry.scoreAdjustment}` : entry.scoreAdjustment} pts
                        </span>
                        <span className="text-amber-300 font-bold">Total: {entry.scorecardAfter} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'matrix' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-amber-300 border-b border-slate-700">
                    <th className="p-2">Game Type</th>
                    <th className="p-2">Rung Called By</th>
                    <th className="p-2">Who Won</th>
                    <th className="p-2">Dealer Scorecard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {/* Close Rung */}
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Close Rung</td><td className="p-2">Dealer team</td><td className="p-2 text-emerald-400">Dealer team</td><td className="p-2 font-bold text-emerald-400">-13</td></tr>
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Close Rung</td><td className="p-2">Dealer team</td><td className="p-2 text-red-400">Opponent team</td><td className="p-2 font-bold text-red-400">+26</td></tr>
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Close Rung</td><td className="p-2">Opponent team</td><td className="p-2 text-red-400">Opponent team</td><td className="p-2 font-bold text-red-400">+13</td></tr>
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Close Rung</td><td className="p-2">Opponent team</td><td className="p-2 text-emerald-400">Dealer team</td><td className="p-2 font-bold text-emerald-400">-26</td></tr>

                  {/* Open Rung Face Up */}
                  <tr className="bg-slate-850/60 hover:bg-slate-800/40"><td className="p-2">Open Rung Face Up</td><td className="p-2">Dealer team</td><td className="p-2 text-emerald-400">Dealer team</td><td className="p-2 font-bold text-emerald-400">-26</td></tr>
                  <tr className="bg-slate-850/60 hover:bg-slate-800/40"><td className="p-2">Open Rung Face Up</td><td className="p-2">Dealer team</td><td className="p-2 text-red-400">Opponent team</td><td className="p-2 font-bold text-red-400">+52</td></tr>
                  <tr className="bg-slate-850/60 hover:bg-slate-800/40"><td className="p-2">Open Rung Face Up</td><td className="p-2">Opponent team</td><td className="p-2 text-red-400">Opponent team</td><td className="p-2 font-bold text-red-400">+26</td></tr>
                  <tr className="bg-slate-850/60 hover:bg-slate-800/40"><td className="p-2">Open Rung Face Up</td><td className="p-2">Opponent team</td><td className="p-2 text-emerald-400">Dealer team</td><td className="p-2 font-bold text-emerald-400">-52</td></tr>

                  {/* Open Rung Face Down Surrender */}
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Open Rung Face Down Surrender</td><td className="p-2">Dealer team</td><td className="p-2 text-emerald-400">Dealer team</td><td className="p-2 font-bold text-emerald-400">-26</td></tr>
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Open Rung Face Down Surrender</td><td className="p-2">Opponent team</td><td className="p-2 text-red-400">Opponent team</td><td className="p-2 font-bold text-red-400">+26</td></tr>

                  {/* Open Rung Face Down Accepted */}
                  <tr className="bg-slate-850/60 hover:bg-slate-800/40"><td className="p-2">Open Rung Face Down</td><td className="p-2">Dealer team</td><td className="p-2 text-emerald-400">Dealer team</td><td className="p-2 font-bold text-emerald-400">-52</td></tr>
                  <tr className="bg-slate-850/60 hover:bg-slate-800/40"><td className="p-2">Open Rung Face Down</td><td className="p-2">Dealer team</td><td className="p-2 text-red-400">Opponent team</td><td className="p-2 font-bold text-red-400">+104</td></tr>
                  <tr className="bg-slate-850/60 hover:bg-slate-800/40"><td className="p-2">Open Rung Face Down</td><td className="p-2">Opponent team</td><td className="p-2 text-red-400">Opponent team</td><td className="p-2 font-bold text-red-400">+52</td></tr>
                  <tr className="bg-slate-850/60 hover:bg-slate-800/40"><td className="p-2">Open Rung Face Down</td><td className="p-2">Opponent team</td><td className="p-2 text-emerald-400">Dealer team</td><td className="p-2 font-bold text-emerald-400">-104</td></tr>

                  {/* Bwinji Face Up */}
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Bwinji Face Up</td><td className="p-2">Dealer team</td><td className="p-2 text-emerald-400">Dealer team</td><td className="p-2 font-bold text-emerald-400">-52</td></tr>
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Bwinji Face Up</td><td className="p-2">Dealer team</td><td className="p-2 text-red-400">Opponent team</td><td className="p-2 font-bold text-red-400">+104</td></tr>
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Bwinji Face Up</td><td className="p-2">Opponent team</td><td className="p-2 text-red-400">Opponent team</td><td className="p-2 font-bold text-red-400">+52</td></tr>
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Bwinji Face Up</td><td className="p-2">Opponent team</td><td className="p-2 text-emerald-400">Dealer team</td><td className="p-2 font-bold text-emerald-400">-104</td></tr>

                  {/* Bwinji Face Down Surrender */}
                  <tr className="bg-slate-850/60 hover:bg-slate-800/40"><td className="p-2">Bwinji Face Down Surrender</td><td className="p-2">Dealer team</td><td className="p-2 text-emerald-400">Dealer team</td><td className="p-2 font-bold text-emerald-400">-52</td></tr>
                  <tr className="bg-slate-850/60 hover:bg-slate-800/40"><td className="p-2">Bwinji Face Down Surrender</td><td className="p-2">Opponent team</td><td className="p-2 text-red-400">Opponent team</td><td className="p-2 font-bold text-red-400">+52</td></tr>

                  {/* Bwinji Face Down Accepted */}
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Bwinji Face Down</td><td className="p-2">Dealer team</td><td className="p-2 text-emerald-400">Dealer team</td><td className="p-2 font-bold text-emerald-400">-104</td></tr>
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Bwinji Face Down</td><td className="p-2">Dealer team</td><td className="p-2 text-red-400">Opponent team</td><td className="p-2 font-bold text-red-400">+208</td></tr>
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Bwinji Face Down</td><td className="p-2">Opponent team</td><td className="p-2 text-red-400">Opponent team</td><td className="p-2 font-bold text-red-400">+104</td></tr>
                  <tr className="hover:bg-slate-800/40"><td className="p-2">Bwinji Face Down</td><td className="p-2">Opponent team</td><td className="p-2 text-emerald-400">Dealer team</td><td className="p-2 font-bold text-emerald-400">-208</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
