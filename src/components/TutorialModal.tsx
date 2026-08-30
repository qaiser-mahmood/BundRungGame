import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Users,
  Shuffle,
  Crown,
  Eye,
  Flag,
  Play,
  ClipboardList,
  Layers,
  HelpCircle,
  Megaphone,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Shield,
} from 'lucide-react';
import { PlayingCard, SuitIcon, suitColors } from './PlayingCard';
import { Card, Suit } from '../../shared/types';
import { sound } from '../utils/sound';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TutorialStep {
  id: string;
  title: string;
  badge: string;
  icon: React.ElementType;
  description: string;
  highlights: { title: string; text: string }[];
  interactiveType: 'SEATING' | 'TOSS_CUT' | 'BIDDING' | 'HAND_PLAY' | 'RUNG_REVEAL' | 'FACE_DOWN' | 'SCORECARD';
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Interactive demo states
  const [demoSelectedCardId, setDemoSelectedCardId] = useState<string | null>('S_A');
  const [demoBwinjiSuit, setDemoBwinjiSuit] = useState<Suit | null>(null);
  const [demoPlayedCardId, setDemoPlayedCardId] = useState<string | null>(null);
  const [demoInspectOpen, setDemoInspectOpen] = useState(false);
  const [demoRevealedRung, setDemoRevealedRung] = useState(false);
  const [demoChallengeVote, setDemoChallengeVote] = useState<'ACCEPT' | 'SURRENDER' | null>(null);

  const demoHand: Card[] = [
    { id: 'S_A', suit: 'SPADES', rank: 'A', playValue: 14, tossValue: 1 },
    { id: 'S_K', suit: 'SPADES', rank: 'K', playValue: 13, tossValue: 13 },
    { id: 'H_10', suit: 'HEARTS', rank: '10', playValue: 10, tossValue: 10 },
    { id: 'C_J', suit: 'CLUBS', rank: 'J', playValue: 11, tossValue: 11 },
    { id: 'D_Q', suit: 'DIAMONDS', rank: 'Q', playValue: 12, tossValue: 12 },
  ];

  const demoPartnerHand: Card[] = [
    { id: 'H_A', suit: 'HEARTS', rank: 'A', playValue: 14, tossValue: 1 },
    { id: 'H_K', suit: 'HEARTS', rank: 'K', playValue: 13, tossValue: 13 },
    { id: 'C_A', suit: 'CLUBS', rank: 'A', playValue: 14, tossValue: 1 },
    { id: 'D_A', suit: 'DIAMONDS', rank: 'A', playValue: 14, tossValue: 1 },
  ];

  const steps: TutorialStep[] = [
    {
      id: 'seating',
      title: 'Seating & Team Formation',
      badge: 'LOBBY & TEAMS',
      icon: Users,
      description: 'Court Piece (Bund Rung) is a 4-player partnership game played in 2 teams of 2 players.',
      highlights: [
        {
          title: 'Partner Seating',
          text: 'Teammates sit opposite each other across the table (North-South for Team 1, East-West for Team 2).',
        },
        {
          title: 'Seat Swapping',
          text: 'In the lobby, click any two player cards to swap seats with your desired partner before beginning.',
        },
        {
          title: 'Smart Bots & Team Names',
          text: 'Fill empty seats instantly with AI Bots if playing with 2 or 3 friends, and customize team names with the pencil icon.',
        },
      ],
      interactiveType: 'SEATING',
    },
    {
      id: 'toss_cut',
      title: 'Toss for Dealer & Deck Cut',
      badge: 'PHASE 1 & 2',
      icon: Shuffle,
      description: 'The game begins with an automatic toss round to determine the Dealer, followed by the deck cut.',
      highlights: [
        {
          title: 'Ace is Low (Ace = 1)',
          text: 'During the toss, Ace is the lowest card (1 pt) and King is highest (13 pts). The player with the lowest card becomes Dealer.',
        },
        {
          title: 'Ties & Redraws',
          text: 'If players tie on the lowest card, only the tied players redraw until a unique dealer is decided.',
        },
        {
          title: 'Deck Cut',
          text: 'The Dealer shuffles and offers the deck to the opponent on their right, who slides to cut the cards.',
        },
      ],
      interactiveType: 'TOSS_CUT',
    },
    {
      id: 'bidding',
      title: '5-Card Bidding & Bwinji',
      badge: 'PHASE 3',
      icon: Crown,
      description: 'After the first 5 cards are dealt, players sequentially choose to declare a Secret Rung, call Bwinji, or Pass.',
      highlights: [
        {
          title: 'Secret Rung Card (Close Rung)',
          text: 'Click any card from your first 5 cards to lock it away as the hidden Rung card. It remains secret until an opponent is void.',
        },
        {
          title: 'Bwinji (Open Trump)',
          text: 'Declare Bwinji by picking a suit (♠, ♣, ♥, ♦). All 5 cards stay in your hand, and the Rung suit is public immediately.',
        },
        {
          title: 'Passing & Overriding',
          text: 'If you pass, you lose the chance to call Bwinji. If another player establishes Close Rung, subsequent players who have not passed can still override with Bwinji.',
        },
      ],
      interactiveType: 'BIDDING',
    },
    {
      id: 'hand_play',
      title: 'Hand Controls & Mobile Interface',
      badge: 'TRICK PLAYING',
      icon: Smartphone,
      description: 'Experience responsive desktop and mobile controls optimized for smooth, fast trick playing.',
      highlights: [
        {
          title: 'Golden Glow = Legal Cards',
          text: 'Playable cards highlight with a pulsing golden ring. You must follow the lead suit if you have cards of that suit in hand.',
        },
        {
          title: 'Mobile 2-Row Layout',
          text: 'On mobile screens, your hand automatically arranges into two neat rows for comfortable tapping without clipping.',
        },
        {
          title: 'Previous Trick Inspection',
          text: 'Between tricks, all 4 played cards remain on the table face-up with the winning card highlighted until the next lead is played.',
        },
      ],
      interactiveType: 'HAND_PLAY',
    },
    {
      id: 'rung_reveal',
      title: 'Secret Rung & Reveal Process',
      badge: 'RULE MECHANICS',
      icon: Eye,
      description: 'In Close Rung, the Rung card stays hidden until an opponent is void in the lead suit.',
      highlights: [
        {
          title: 'Asking to Reveal',
          text: 'When an opponent has no cards of the lead suit, the system prompts them with "Ask to Reveal Rung". Clicking cards also triggers the request.',
        },
        {
          title: 'Revealing the Trump',
          text: 'The Rung Caller clicks "Show Secret Rung Card", flipping the card face-up for all 4 players to inspect.',
        },
        {
          title: 'Dedicated Rung Slot',
          text: 'Your Rung card is housed in a separate slot on the bottom right of your screen, safely separated from normal hand cards.',
        },
      ],
      interactiveType: 'RUNG_REVEAL',
    },
    {
      id: 'face_down',
      title: 'Open Rung & Face-Down Challenge',
      badge: 'SPECIAL MOVES',
      icon: Shield,
      description: 'On Trick 1 of Open Rung or Bwinji, the caller can lead a card Face-Down to initiate a Challenge.',
      highlights: [
        {
          title: 'Partner Card Inspection',
          text: 'The defending team can click "Inspect Partner\'s Cards" to view each other\'s complete 13-card hands in a dedicated window.',
        },
        {
          title: 'Private Peeking for Callers',
          text: 'The caller and their teammate can click the face-down card on the table to privately peek at its rank and suit.',
        },
        {
          title: 'Mutual 2-Player Consensus',
          text: 'Both defending teammates must confirm the SAME choice (both Accept Challenge or both Surrender) before the round proceeds.',
        },
      ],
      interactiveType: 'FACE_DOWN',
    },
    {
      id: 'scorecard',
      title: 'Scorecard & 52-Point Khoti',
      badge: 'SCORING & WIN',
      icon: ClipboardList,
      description: 'Track team tricks, Bund streaks, and dealer handicap points through the authentic scorecard.',
      highlights: [
        {
          title: '52-Point Handicap',
          text: 'The Dealer starts with 52 points. When opponents win tricks or games, points are deducted from the dealer scorecard.',
        },
        {
          title: 'KHOTI! (Match Victory)',
          text: 'If the dealer team\'s score drops below 0 points, the opposing team wins the match and declares KHOTI on the losers!',
        },
        {
          title: 'Rotational Dealership',
          text: 'Dealership rotates counter-clockwise after each game. Click the top "📋 Scorecard" button anytime to view match history.',
        },
      ],
      interactiveType: 'SCORECARD',
    },
  ];

  const currentStep = steps[currentStepIndex];

  const handleNext = () => {
    sound.playCardSlide();
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    sound.playCardSlide();
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleJumpToStep = (index: number) => {
    sound.playCardSlide();
    setCurrentStepIndex(index);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/90 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        className="w-full max-w-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-felt-dark border-2 border-amber-500/50 rounded-2xl shadow-2xl p-4 sm:p-6 relative my-auto overflow-hidden text-slate-200"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-amber-500/30 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <currentStep.icon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-[11px] font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/30 uppercase tracking-wider">
                  {currentStep.badge}
                </span>
                <span className="text-xs text-slate-400 font-semibold">
                  Step {currentStepIndex + 1} of {steps.length}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-cinzel font-black gold-gradient-text">
                {currentStep.title}
              </h2>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playCardSlide();
              onClose();
            }}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer border border-slate-700"
            title="Close Tutorial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Navigation Pill Tabs */}
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-thin">
          {steps.map((step, idx) => {
            const isActive = idx === currentStepIndex;
            const isCompleted = idx < currentStepIndex;
            return (
              <button
                key={step.id}
                onClick={() => handleJumpToStep(idx)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 border-amber-300 shadow-glow-gold'
                    : isCompleted
                    ? 'bg-slate-900 text-amber-300/80 border-slate-700 hover:bg-slate-800'
                    : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                <span>{idx + 1}.</span>
                <span>{step.title.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-5">
          {/* Left Column: Explanations & Highlights */}
          <div className="md:col-span-7 flex flex-col justify-between">
            <div>
              <p className="text-xs sm:text-sm text-slate-300 mb-3 leading-relaxed">
                {currentStep.description}
              </p>

              <div className="space-y-2.5">
                {currentStep.highlights.map((h, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-2.5 shadow-sm"
                  >
                    <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-amber-300">{h.title}</div>
                      <div className="text-[11px] sm:text-xs text-slate-300 leading-snug mt-0.5">
                        {h.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive Demo Box */}
          <div className="md:col-span-5 bg-slate-950/90 rounded-2xl border-2 border-amber-500/30 p-3 sm:p-4 flex flex-col justify-center items-center shadow-inner relative min-h-[220px]">
            <div className="absolute top-2 left-3 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-400/80">
              <Sparkles className="w-3 h-3 text-amber-400" /> Interactive Try-It-Out
            </div>

            {/* 1. SEATING DEMO */}
            {currentStep.interactiveType === 'SEATING' && (
              <div className="w-full flex flex-col items-center mt-3">
                <div className="text-[10px] text-slate-400 mb-2">Team Seating Layout:</div>
                <div className="relative w-40 h-36 bg-felt-dark rounded-xl border border-felt-border flex items-center justify-center shadow-inner p-1">
                  {/* Top: Partner (Team 1) */}
                  <div className="absolute top-1 text-[9px] font-bold text-amber-300 bg-amber-950/90 px-2 py-0.5 rounded border border-amber-500/40">
                    Partner (Team 1)
                  </div>
                  {/* Bottom: You (Team 1) */}
                  <div className="absolute bottom-1 text-[9px] font-bold text-amber-300 bg-amber-950/90 px-2 py-0.5 rounded border border-amber-500/40">
                    You (Team 1)
                  </div>
                  {/* Left: Opponent 2 (Team 2) */}
                  <div className="absolute left-1 text-[8px] font-bold text-purple-300 bg-purple-950/90 px-1 py-0.5 rounded border border-purple-500/40">
                    Opp. 2
                  </div>
                  {/* Right: Opponent 1 (Team 2) */}
                  <div className="absolute right-1 text-[8px] font-bold text-purple-300 bg-purple-950/90 px-1 py-0.5 rounded border border-purple-500/40">
                    Opp. 1
                  </div>
                  <div className="text-[10px] font-cinzel font-black text-amber-400/60">BUND RUNG</div>
                </div>
              </div>
            )}

            {/* 2. TOSS & CUT DEMO */}
            {currentStep.interactiveType === 'TOSS_CUT' && (
              <div className="w-full flex flex-col items-center mt-2 text-center">
                <div className="text-[11px] font-semibold text-amber-300 mb-1">
                  Toss Card Ranking:
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex flex-col items-center">
                    <PlayingCard
                      card={{ id: 'demo_a', suit: 'SPADES', rank: 'A', playValue: 14, tossValue: 1 }}
                      size="xs"
                    />
                    <span className="text-[9px] font-bold text-emerald-400 mt-1">Ace = 1 (Lowest)</span>
                  </div>
                  <div className="text-xs font-bold text-slate-500">vs</div>
                  <div className="flex flex-col items-center">
                    <PlayingCard
                      card={{ id: 'demo_k', suit: 'HEARTS', rank: 'K', playValue: 13, tossValue: 13 }}
                      size="xs"
                    />
                    <span className="text-[9px] font-bold text-rose-400 mt-1">King = 13</span>
                  </div>
                </div>
                <div className="text-[10px] text-amber-300/90 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                  👑 Lowest card wins DEALERSHIP!
                </div>
              </div>
            )}

            {/* 3. BIDDING DEMO */}
            {currentStep.interactiveType === 'BIDDING' && (
              <div className="w-full flex flex-col items-center mt-2">
                <div className="text-[10px] text-slate-300 mb-1.5">
                  👉 Click a card to select for Secret Rung, or pick a Bwinji suit:
                </div>
                <div className="flex gap-1.5 mb-2">
                  {demoHand.slice(0, 3).map((card) => {
                    const isSelected = demoSelectedCardId === card.id;
                    return (
                      <div
                        key={card.id}
                        onClick={() => {
                          sound.playCardSlide();
                          setDemoSelectedCardId(card.id);
                          setDemoBwinjiSuit(null);
                        }}
                        className={`cursor-pointer transition-transform ${
                          isSelected ? 'scale-110 -translate-y-1.5 ring-2 ring-amber-400 rounded-md' : 'hover:scale-105'
                        }`}
                      >
                        <PlayingCard card={card} size="xs" isSelected={isSelected} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-1">
                  {(['SPADES', 'HEARTS', 'CLUBS', 'DIAMONDS'] as Suit[]).map((suit) => {
                    const isSuitActive = demoBwinjiSuit === suit;
                    return (
                      <button
                        key={suit}
                        onClick={() => {
                          sound.playCardSlide();
                          setDemoBwinjiSuit(suit);
                          setDemoSelectedCardId(null);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition cursor-pointer ${
                          isSuitActive
                            ? 'bg-purple-600 text-white border-purple-300 ring-2 ring-purple-400'
                            : 'bg-slate-900 text-purple-300 border-slate-700 hover:border-purple-400'
                        }`}
                      >
                        {suit === 'SPADES' ? '♠' : suit === 'HEARTS' ? '♥' : suit === 'CLUBS' ? '♣' : '♦'} Bwinji
                      </button>
                    );
                  })}
                </div>
                <div className="text-[9px] text-amber-300 mt-2 font-semibold">
                  {demoSelectedCardId
                    ? `Selected Secret Card: ${demoSelectedCardId}`
                    : demoBwinjiSuit
                    ? `Selected Bwinji: ${demoBwinjiSuit}`
                    : 'Select a choice above'}
                </div>
              </div>
            )}

            {/* 4. HAND PLAY DEMO */}
            {currentStep.interactiveType === 'HAND_PLAY' && (
              <div className="w-full flex flex-col items-center mt-2">
                <div className="text-[10px] text-slate-300 mb-1.5">
                  Lead suit is <strong className="text-amber-400">SPADES</strong> (Spades highlighted):
                </div>
                <div className="flex gap-1.5 mb-2">
                  {demoHand.slice(0, 4).map((card) => {
                    const isPlayable = card.suit === 'SPADES';
                    const isPlayed = demoPlayedCardId === card.id;
                    return (
                      <div
                        key={card.id}
                        onClick={() => {
                          if (isPlayable) {
                            sound.playCardPlace();
                            setDemoPlayedCardId(card.id);
                          }
                        }}
                        className={`transition-transform ${
                          isPlayable ? 'cursor-pointer hover:scale-105' : 'opacity-40 cursor-not-allowed'
                        }`}
                      >
                        <PlayingCard
                          card={card}
                          size="xs"
                          isPlayable={isPlayable}
                          isSelected={isPlayed}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="text-[10px] text-slate-300">
                  {demoPlayedCardId ? (
                    <span className="text-emerald-400 font-bold">✓ Played {demoPlayedCardId}!</span>
                  ) : (
                    <span>👉 Click a highlighted Spades card to play</span>
                  )}
                </div>
              </div>
            )}

            {/* 5. RUNG REVEAL DEMO */}
            {currentStep.interactiveType === 'RUNG_REVEAL' && (
              <div className="w-full flex flex-col items-center mt-2 text-center">
                <div className="text-[10px] text-slate-300 mb-2">
                  When void in lead suit, click to Ask to Reveal:
                </div>
                <button
                  onClick={() => {
                    sound.playTrumpReveal();
                    setDemoRevealedRung(!demoRevealedRung);
                  }}
                  className="px-3 py-1.5 bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-bold text-xs rounded-xl shadow-glow-gold flex items-center gap-1.5 mb-2.5 cursor-pointer animate-pulse"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {demoRevealedRung ? 'Hide Rung Card' : 'Ask to Reveal Rung'}
                </button>
                {demoRevealedRung && (
                  <div className="p-2 bg-slate-900 rounded-xl border border-amber-400/60 shadow-glow-gold flex items-center gap-2">
                    <PlayingCard
                      card={{ id: 'demo_rung', suit: 'SPADES', rank: 'A', playValue: 14, tossValue: 1 }}
                      size="xs"
                    />
                    <div className="text-left text-[10px] text-amber-300">
                      <div className="font-bold">Rung Revealed!</div>
                      <div className="text-[9px] text-slate-400">Trump suit is Spades ♠</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 6. FACE-DOWN CHALLENGE DEMO */}
            {currentStep.interactiveType === 'FACE_DOWN' && (
              <div className="w-full flex flex-col items-center mt-1 text-center">
                <div className="text-[10px] text-slate-300 mb-1.5">
                  Defending Team Consensus Demo:
                </div>
                <div className="flex gap-1.5 mb-2">
                  <button
                    onClick={() => {
                      sound.playCardSlide();
                      setDemoInspectOpen(!demoInspectOpen);
                    }}
                    className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Users className="w-3 h-3" />
                    {demoInspectOpen ? 'Hide Cards' : 'Inspect Partner'}
                  </button>
                  <button
                    onClick={() => {
                      sound.playCardPlace();
                      setDemoChallengeVote('ACCEPT');
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
                      demoChallengeVote === 'ACCEPT'
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                        : 'bg-emerald-700 text-slate-100 hover:bg-emerald-600'
                    }`}
                  >
                    <Play className="w-3 h-3 fill-current" /> Accept
                  </button>
                  <button
                    onClick={() => {
                      sound.playCardPlace();
                      setDemoChallengeVote('SURRENDER');
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
                      demoChallengeVote === 'SURRENDER'
                        ? 'bg-red-800 text-white ring-2 ring-red-300'
                        : 'bg-red-950 text-red-200 border border-red-500/40 hover:bg-red-900'
                    }`}
                  >
                    <Flag className="w-3 h-3" /> Surrender
                  </button>
                </div>

                {demoInspectOpen && (
                  <div className="p-1.5 bg-slate-900/90 rounded-lg border border-slate-800 flex gap-1 mb-1">
                    {demoPartnerHand.map((c) => (
                      <PlayingCard key={c.id} card={c} size="xs" />
                    ))}
                  </div>
                )}

                <div className="text-[9px] text-amber-300 font-semibold">
                  {demoChallengeVote
                    ? `You voted to ${demoChallengeVote}! Requires partner confirmation.`
                    : 'Click Accept or Surrender to try voting.'}
                </div>
              </div>
            )}

            {/* 7. SCORECARD DEMO */}
            {currentStep.interactiveType === 'SCORECARD' && (
              <div className="w-full flex flex-col items-center mt-1 text-center">
                <div className="text-[10px] text-slate-300 mb-1.5">52-Point Handicap Preview:</div>
                <div className="w-full bg-slate-900 rounded-xl border border-slate-800 p-2 text-left text-[10px] space-y-1">
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-slate-400">Current Dealer:</span>
                    <span className="text-amber-300 font-bold">Jehangir (Team 1)</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-slate-400">Dealer Scorecard:</span>
                    <span className="text-emerald-400 font-extrabold">+52 Points</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Winning Target:</span>
                    <span className="text-amber-400 font-bold">7 Tricks (Game) / 0 Pts (Khoti)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Navigation Controls */}
        <div className="flex items-center justify-between border-t border-amber-500/30 pt-3">
          <button
            onClick={handlePrev}
            disabled={currentStepIndex === 0}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              currentStepIndex === 0
                ? 'opacity-40 cursor-not-allowed text-slate-600 bg-slate-900'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer border border-slate-700'
            }`}
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>

          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentStepIndex
                    ? 'w-6 bg-amber-400 shadow-glow-gold'
                    : i < currentStepIndex
                    ? 'bg-amber-400/60'
                    : 'bg-slate-700'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            className="px-4 py-1.5 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:from-amber-300 text-slate-950 font-cinzel font-black text-xs sm:text-sm rounded-xl shadow-glow-gold border-2 border-yellow-200 cursor-pointer flex items-center gap-1.5"
          >
            {currentStepIndex === steps.length - 1 ? (
              <>
                <CheckCircle2 className="w-4 h-4" /> Start Playing!
              </>
            ) : (
              <>
                Next <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
