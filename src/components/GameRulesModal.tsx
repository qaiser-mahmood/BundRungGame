import React from 'react';
import { motion } from 'framer-motion';
import { GameType } from '../../shared/types';
import { X, BookOpen, Crown, ShieldAlert, Sparkles, Trophy } from 'lucide-react';
import { sound } from '../utils/sound';

interface GameRulesModalProps {
  gameType: GameType;
  isOpen: boolean;
  onClose: () => void;
  onPlayBundRung?: () => void;
}

export const GameRulesModal: React.FC<GameRulesModalProps> = ({
  gameType,
  isOpen,
  onClose,
  onPlayBundRung,
}) => {
  if (!isOpen) return null;

  const content = {
    BUND_RUNG: {
      title: 'Bund Rung (Hidden Trump)',
      subtitle: 'The Premier Traditional Pakistani & Punjabi 4-Player Trick Game',
      badge: 'ACTIVE & PLAYABLE',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon: <Sparkles className="w-5 h-5 text-amber-400" />,
      sections: [
        {
          heading: '1. Objective & 2v2 Teams',
          body: '4 players sit in a circle. Opposite players form fixed teams (Team 1: South & North; Team 2: East & West). The team that wins the majority of tricks or reaches 100 scorecard points wins the match.',
        },
        {
          heading: '2. 5-4-4 Card Distribution & Secret Trump',
          body: 'The Dealer deals 5 cards to each player. The player to the dealer’s right is the Trump Caller and secretly places one card face-down as the "Bund Rung" (Hidden Trump). The remaining 32 cards are dealt in two 4-card passes (13 cards each).',
        },
        {
          heading: '3. Trick Play & Center Accumulation',
          body: 'Players must follow the lead suit. If a player is void (holds no cards of the led suit), they may request the Rung Reveal. Until the Rung is revealed or won, tricks accumulate in the center pile and are claimed together!',
        },
        {
          heading: '4. Ace Downgrade Rule',
          body: 'In Close Rung, leading consecutive Aces of the same suit causes the second Ace to downgrade in value to 2, protecting defenders from Ace-spamming before the trump is known.',
        },
        {
          heading: '5. Khoti (100 Points Match Victory)',
          body: 'Winning games accumulates points on the dealer’s scorecard. Reaching 100+ points delivers a "KHOTI" (complete match defeat) to the losing team!',
        },
      ],
    },
    BUND_RUNG_BIDDING: {
      title: 'Bund Rung (Bidding)',
      subtitle: 'Contract Trick Bidding with Secret Trump & Center Accumulation',
      badge: 'COMING SOON IN ENGINE',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon: <Sparkles className="w-5 h-5 text-amber-400" />,
      sections: [
        {
          heading: '1. Contract Trick Bidding (7 to 13)',
          body: 'After receiving their initial 5 cards, players bid clockwise on the number of tricks their partnership contracts to win (minimum bid 7, up to 13 for Grand Slam). Each player may raise the bid or pass.',
        },
        {
          heading: '2. Highest Bidder & Secret Trump',
          body: 'The highest bidder wins the contract and places their chosen trump card face-down ("Bund"). The remaining 32 cards are dealt in two 4-card passes.',
        },
        {
          heading: '3. Fulfilling the Contract',
          body: 'The contracting team must achieve or exceed their bid trick target to win the round. Meeting or exceeding the contract earns bonus match points.',
        },
        {
          heading: '4. The Penalty for Under-Tricking',
          body: 'If the declaring team fails to reach their contracted number of tricks, the defending team is awarded penalty points proportional to the deficit.',
        },
        {
          heading: '5. Center Accumulation & Ace Downgrade',
          body: 'All classic Bund Rung rules apply: tricks accumulate in the center until the secret trump is revealed, and leading consecutive Aces downgrades the second Ace to 2.',
        },
      ],
    },
    OPEN_RUNG: {
      title: 'Open Rung (Sir Rung / Court Piece)',
      subtitle: 'Classic Subcontinent Court Piece with Instant Public Trump',
      badge: 'COMING SOON IN ENGINE',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      icon: <Crown className="w-5 h-5 text-blue-400" />,
      sections: [
        {
          heading: '1. Open Trump Selection',
          body: 'After the initial 5 cards are dealt, the caller announces the Trump suit openly to the entire table. There are no secret cards or hidden trumps.',
        },
        {
          heading: '2. Instant Single-Trick Collection (Sir / Sar)',
          body: 'Unlike Bund Rung, the winner of each trick immediately collects that trick to their team’s pile. There is no center accumulation in Single Sir.',
        },
        {
          heading: '3. Follow Suit & Trumping',
          body: 'Players must follow the led suit. When void, a player may either play a trump card to win the trick or discard any off-suit card.',
        },
        {
          heading: '4. Winning 7 Tricks (Court / Goon)',
          body: 'The first team to win 7 out of 13 tricks wins the game. Winning the first 7 tricks consecutively from trick 1 achieves a "Court" (Goon)!',
        },
      ],
    },
    BHABHI_THULLA: {
      title: 'Bhabhi Thulla (Get Away)',
      subtitle: 'The Famous South Asian Trick-Shedding & Penalty Game',
      badge: 'COMING SOON IN ENGINE',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      icon: <ShieldAlert className="w-5 h-5 text-rose-400" />,
      sections: [
        {
          heading: '1. Objective: Empty Your Hand First!',
          body: 'In Bhabhi Thulla, you do NOT want to collect cards. Every player plays for themselves to get rid of all 13 cards. The last remaining player with cards in hand loses and becomes the "Bhabhi"!',
        },
        {
          heading: '2. The Ace of Spades Lead',
          body: 'The player holding the Ace of Spades must lead it in the very first turn. All other players must follow Spades.',
        },
        {
          heading: '3. The "Thulla" (Penalty Hit)',
          body: 'When a player cannot follow suit, they deliver a "Thulla" by playing any card of another suit. The player who played the highest card of the led suit must pick up ALL cards on the table!',
        },
        {
          heading: '4. Escape & Survival',
          body: 'As soon as a player runs out of cards, they safely exit the game. Tension mounts as fewer players remain, until one solitary loser is crowned the Bhabhi!',
        },
      ],
    },
  }[gameType];

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-felt-dark border-2 border-amber-500/40 rounded-2xl shadow-2xl p-6 relative overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-700/80 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-800 border border-slate-700">
              {content.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-cinzel font-bold text-white">
                  {content.title}
                </h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${content.badgeColor}`}>
                  {content.badge}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{content.subtitle}</p>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playCardSlide();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Rules Body */}
        <div className="space-y-3.5 max-h-[55vh] overflow-y-auto pr-1 text-xs text-slate-300">
          {content.sections.map((section, idx) => (
            <div key={idx} className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <h3 className="font-bold text-amber-300 text-sm mb-1">{section.heading}</h3>
              <p className="leading-relaxed text-slate-300">{section.body}</p>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              sound.playCardSlide();
              onClose();
            }}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition cursor-pointer"
          >
            Close
          </button>

          {gameType === 'BUND_RUNG' && onPlayBundRung && (
            <button
              onClick={() => {
                sound.playTrumpReveal();
                onClose();
                onPlayBundRung();
              }}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-bold text-xs font-cinzel shadow-glow-gold transition cursor-pointer"
            >
              Enter Bund Rung Table
            </button>
          )}

          {gameType !== 'BUND_RUNG' && (
            <div className="text-[11px] text-amber-400 font-medium">
              ✨ Rule engine in development — Bund Rung is currently active!
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
