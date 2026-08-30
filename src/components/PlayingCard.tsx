import React from 'react';
import { motion } from 'framer-motion';
import { Card, Suit } from '../../shared/types';
import { sound } from '../utils/sound';

interface PlayingCardProps {
  card?: Card | null;
  faceDown?: boolean;
  isPlayable?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'toss';
  style?: React.CSSProperties;
  badge?: string;
}

export const SuitIcon: React.FC<{ suit: Suit; className?: string }> = ({
  suit,
  className = 'w-3.5 h-3.5',
}) => {
  switch (suit) {
    case 'SPADES':
      return (
        <svg viewBox="0 0 100 100" fill="currentColor" className={className}>
          <path d="M50 10 C46 24 22 48 22 66 C22 78 31 84 41 84 C46 84 49 81 50 78 C51 81 54 84 59 84 C69 84 78 78 78 66 C78 48 54 24 50 10 Z M46 76 C46 86 38 92 34 92 L66 92 C62 92 54 86 54 76 Z" />
        </svg>
      );
    case 'CLUBS':
      return (
        <svg viewBox="0 0 100 100" fill="currentColor" className={className}>
          <circle cx="50" cy="30" r="18" />
          <circle cx="32" cy="58" r="18" />
          <circle cx="68" cy="58" r="18" />
          <path d="M46 54 C46 75 36 92 32 92 L68 92 C64 92 54 75 54 54 Z" />
        </svg>
      );
    case 'HEARTS':
      return (
        <svg viewBox="0 0 100 100" fill="currentColor" className={className}>
          <path d="M50 88 C20 62 10 44 10 28 C10 16 20 8 32 8 C40 8 47 13 50 20 C53 13 60 8 68 8 C80 8 90 16 90 28 C90 44 80 62 50 88 Z" />
        </svg>
      );
    case 'DIAMONDS':
      return (
        <svg viewBox="0 0 100 100" fill="currentColor" className={className}>
          <path d="M50 8 L84 50 L50 92 L16 50 Z" />
        </svg>
      );
  }
};

export const suitSymbols: Record<Suit, string> = {
  HEARTS: '♥',
  DIAMONDS: '♦',
  CLUBS: '♣',
  SPADES: '♠',
};

// Standard Professional Colors: Spades & Clubs in Midnight Black, Hearts & Diamonds in Classic Red
export const suitColors: Record<Suit, { text: string; bg: string; border: string }> = {
  HEARTS: { text: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  DIAMONDS: { text: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  CLUBS: { text: 'text-slate-950', bg: 'bg-slate-900/10', border: 'border-slate-800/30' },
  SPADES: { text: 'text-slate-950', bg: 'bg-slate-900/10', border: 'border-slate-800/30' },
};

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  faceDown = false,
  isPlayable = false,
  isSelected = false,
  onClick,
  className = '',
  size = 'md',
  style,
  badge,
}) => {
  // Standard Authentic Card Aspect Ratio: 5 / 7 (width : height)
  const sizeClasses = {
    xs: 'w-8 sm:w-9 aspect-[5/7] text-[10px] rounded p-0.5',
    sm: 'w-12 sm:w-14 aspect-[5/7] text-xs rounded-md p-1',
    md: 'w-16 sm:w-20 aspect-[5/7] text-sm sm:text-base rounded-md p-1 sm:p-1.5',
    lg: 'w-20 sm:w-24 aspect-[5/7] text-base sm:text-lg rounded-lg p-1.5 sm:p-2',
    toss: 'w-10 sm:w-12 aspect-[5/7] text-xs rounded p-1',
  };

  const iconSizes = {
    xs: 'w-2.5 h-2.5',
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5 sm:w-4 sm:h-4',
    lg: 'w-4 h-4 sm:w-5 sm:h-5',
    toss: 'w-3 h-3',
  };

  const centerIconSizes = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-5 h-5',
    md: 'w-7 h-7 sm:w-8 sm:h-8',
    lg: 'w-8 h-8 sm:w-10 sm:h-10',
    toss: 'w-4 h-4',
  };

  const handleClick = () => {
    if (onClick) {
      sound.playCardPlace();
      onClick();
    }
  };

  const isClickable = Boolean(onClick) || isPlayable || className.includes('cursor-pointer');

  if (faceDown || !card) {
    return (
      <motion.div
        whileHover={onClick ? { scale: 1.05, y: -2 } : {}}
        whileTap={onClick ? { scale: 0.96 } : {}}
        onClick={handleClick}
        style={style}
        className={`relative flex-shrink-0 flex items-center justify-center border border-amber-900/60 bg-gradient-to-br from-red-950 via-red-900 to-amber-950 shadow-card ${
          isClickable ? 'cursor-pointer' : 'cursor-default'
        } ${sizeClasses[size]} ${className}`}
      >
        {/* Royal card back pattern */}
        <div className="absolute inset-1 border border-amber-500/30 rounded flex flex-col items-center justify-center overflow-hidden pointer-events-none">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#eab308_1px,transparent_1px)] [background-size:5px_5px]" />
          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-amber-400/50 flex items-center justify-center text-[9px] sm:text-[11px] text-amber-300 font-cinzel font-bold shadow-inner">
            ♠
          </div>
        </div>
        {badge && (
          <span className="absolute -top-2 -right-2 bg-amber-500 text-slate-950 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
            {badge}
          </span>
        )}
      </motion.div>
    );
  }

  const color = suitColors[card.suit];

  return (
    <motion.div
      whileHover={isPlayable ? { scale: 1.04, y: -4 } : isClickable ? { scale: 1.02, y: -2 } : {}}
      whileTap={isPlayable || isClickable ? { scale: 0.98 } : {}}
      onClick={handleClick}
      style={style}
      className={`relative flex-shrink-0 flex flex-col justify-between bg-gradient-to-b from-white via-slate-50 to-slate-100 border border-slate-300 shadow-card transition-all duration-150 overflow-hidden ${
        isPlayable
          ? 'cursor-pointer ring-4 ring-amber-400 border-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.9)] hover:ring-amber-300 hover:shadow-[0_0_22px_rgba(251,191,36,1)]'
          : isClickable
          ? 'cursor-pointer'
          : 'cursor-default'
      } ${isSelected ? 'ring-4 ring-emerald-400 -translate-y-3' : ''} ${sizeClasses[size]} ${className}`}
    >
      {/* Top Left Corner */}
      <div className="flex flex-col items-center leading-none">
        <span className={`font-bold font-cinzel leading-none ${color.text}`}>{card.rank}</span>
        <div className={`mt-0.5 ${color.text}`}>
          <SuitIcon suit={card.suit} className={iconSizes[size]} />
        </div>
      </div>

      {/* Center Symbol / Emblem (Crisp Vector SVG or Face Character) */}
      <div className="flex items-center justify-center my-auto leading-none select-none">
        {['J', 'Q', 'K'].includes(card.rank) ? (
          <span className={`text-base sm:text-2xl filter drop-shadow-sm font-cinzel font-black opacity-90 leading-none ${color.text}`}>
            {card.rank}
          </span>
        ) : (
          <div className={`${color.text} filter drop-shadow-sm opacity-90 flex items-center justify-center`}>
            <SuitIcon suit={card.suit} className={centerIconSizes[size]} />
          </div>
        )}
      </div>

      {/* Bottom Right Corner (Inverted) */}
      <div className="flex flex-col items-center leading-none rotate-180">
        <span className={`font-bold font-cinzel leading-none ${color.text}`}>{card.rank}</span>
        <div className={`mt-0.5 ${color.text}`}>
          <SuitIcon suit={card.suit} className={iconSizes[size]} />
        </div>
      </div>

      {badge && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 bg-slate-950/90 text-amber-300 text-[8px] sm:text-[9px] font-semibold px-1 py-0.2 rounded border border-amber-500/40 shadow-sm pointer-events-none whitespace-nowrap z-20">
          {badge}
        </span>
      )}
    </motion.div>
  );
};

export const RungSuitCard: React.FC<{
  suit: Suit;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}> = ({ suit, size = 'sm', className = '' }) => {
  const sizeClasses = {
    xs: 'w-8 sm:w-9 aspect-[5/7] rounded p-1',
    sm: 'w-12 sm:w-14 aspect-[5/7] rounded-md p-1.5',
    md: 'w-16 sm:w-20 aspect-[5/7] rounded-md p-2',
    lg: 'w-20 sm:w-24 aspect-[5/7] rounded-lg p-2.5',
  };

  const centerIconSizes = {
    xs: 'w-6 h-6',
    sm: 'w-9 h-9 sm:w-11 sm:h-11',
    md: 'w-12 h-12 sm:w-16 sm:h-16',
    lg: 'w-16 h-16 sm:w-20 sm:h-20',
  };

  const color = suitColors[suit];

  return (
    <div
      className={`relative flex-shrink-0 flex items-center justify-center bg-gradient-to-b from-white via-slate-50 to-slate-100 border border-slate-300 shadow-card transition-all duration-150 overflow-hidden select-none ${sizeClasses[size]} ${className}`}
    >
      {/* Center Really Big Suit Symbol */}
      <div className={`${color.text} filter drop-shadow-md flex items-center justify-center w-full h-full`}>
        <SuitIcon suit={suit} className={`${centerIconSizes[size]} transition-transform`} />
      </div>
    </div>
  );
};
