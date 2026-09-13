import { Card, Suit, Rank } from '../../../shared/types';
import { ALL_52_CARDS } from './CardTracker';

export const ALL_SUITS: Suit[] = ['SPADES', 'HEARTS', 'CLUBS', 'DIAMONDS'];
export const ALL_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/**
 * 13 Base Rank Weights (Ace = 13 maximum weight, 2 = 1 minimum weight)
 */
export const BASE_RANK_WEIGHTS: Record<Rank, number> = {
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
  '6': 5,
  '7': 6,
  '8': 7,
  '9': 8,
  '10': 9,
  'J': 10,
  'Q': 11,
  'K': 12,
  'A': 13,
};

export interface SuitStrengthProfile {
  suit: Suit;
  cardCount: number;
  totalDynamicWeight: number;
  averageWeight: number;
  cardsPlayedInSuit: number;
  unseenSuperiorTotal: number;
  hasBossCard: boolean;
  isVoid: boolean;
}

export interface HandStrengthAnalysis {
  totalStrength: number;
  suitProfiles: Record<Suit, SuitStrengthProfile>;
  voidCount: number;
  polarizationScore: number;
  averageCardWeight: number;
}

export interface BiddingRecommendation {
  action: 'BWINJI' | 'SELECT_CARD_TRUMP' | 'PASS';
  bestSuit: Suit;
  chosenCard: Card;
  suitScore: number;
  isForcedByRules: boolean;
}

/**
 * DynamicSuitEvaluator: Mathematical dynamic valuation and optimization engine.
 *
 * Implements pure mathematical utility optimization:
 * - 13 weights per suit, dynamically elevated as superior cards are played out.
 * - Dynamic suit strength and hand strength continuous functions.
 * - Delta Hand Strength (ΔH) optimization: sheds low-weight cards and eliminates weak suits
 *   to maximize resulting hand strength without hardcoded if/else rules.
 */
export class DynamicSuitEvaluator {
  public static readonly VOID_TACTICAL_VALUE = 15.0; // Equity gained by having a void (enables ruff / reveal)
  public static readonly POLARIZATION_WEIGHT = 1.5;  // Reward for concentration in fewer, stronger suits

  /**
   * Calculates the dynamic weight of a card (1 to 13 scale, elevated by cards played).
   * If all cards in this suit higher than this card are already played (or in hand),
   * the card is elevated to 13 (effective Ace / Boss power).
   */
  public static calculateDynamicCardWeight(
    card: Card,
    playedCards: Card[],
    myHand: Card[]
  ): number {
    const baseWeight = BASE_RANK_WEIGHTS[card.rank] || 1;
    const suit = card.suit;
    const playValue = card.playValue;

    // Count how many cards in this suit with higher rank remain unseen (held by opponents/partner)
    let unseenSuperiorCount = 0;
    const playedCardIds = new Set(playedCards.map((c) => c.id));
    const myHandCardIds = new Set(myHand.map((c) => c.id));

    for (const c of ALL_52_CARDS) {
      if (c.suit === suit && c.playValue > playValue) {
        if (!playedCardIds.has(c.id) && !myHandCardIds.has(c.id)) {
          unseenSuperiorCount++;
        }
      }
    }

    // Dynamic promotion: Effective rank = 13 - unseenSuperiorCount
    // If unseenSuperiorCount === 0, effective rank is 13 (maximum weight)!
    const promotedWeight = Math.max(1, 13 - unseenSuperiorCount);

    // Cards played in suit exhaustion multiplier (surviving cards become more dominant)
    const playedInSuit = playedCards.filter((c) => c.suit === suit).length;
    const exhaustionFactor = 1.0 + (playedInSuit / 26.0); // Up to 1.5x as suit depletes

    return promotedWeight * exhaustionFactor;
  }

  /**
   * Computes the dynamic strength profile for a given suit.
   */
  public static calculateSuitProfile(
    suit: Suit,
    myHand: Card[],
    playedCards: Card[]
  ): SuitStrengthProfile {
    const cardsInSuit = myHand.filter((c) => c.suit === suit);
    const cardsPlayedInSuit = playedCards.filter((c) => c.suit === suit).length;

    if (cardsInSuit.length === 0) {
      return {
        suit,
        cardCount: 0,
        totalDynamicWeight: 0,
        averageWeight: 0,
        cardsPlayedInSuit,
        unseenSuperiorTotal: 0,
        hasBossCard: false,
        isVoid: true,
      };
    }

    let totalDynamicWeight = 0;
    let unseenSuperiorTotal = 0;
    let hasBossCard = false;

    for (const card of cardsInSuit) {
      const weight = this.calculateDynamicCardWeight(card, playedCards, myHand);
      totalDynamicWeight += weight;

      // Check if boss (weight >= 13)
      if (weight >= 13.0) {
        hasBossCard = true;
      }
    }

    return {
      suit,
      cardCount: cardsInSuit.length,
      totalDynamicWeight,
      averageWeight: totalDynamicWeight / cardsInSuit.length,
      cardsPlayedInSuit,
      unseenSuperiorTotal,
      hasBossCard,
      isVoid: false,
    };
  }

  /**
   * Evaluates the overall strength of a hand combining all suit strengths,
   * void bonuses, and hand polarization (concentration of power).
   */
  public static calculateHandStrength(
    myHand: Card[],
    playedCards: Card[]
  ): HandStrengthAnalysis {
    const suitProfiles: Record<Suit, SuitStrengthProfile> = {
      SPADES: this.calculateSuitProfile('SPADES', myHand, playedCards),
      HEARTS: this.calculateSuitProfile('HEARTS', myHand, playedCards),
      CLUBS: this.calculateSuitProfile('CLUBS', myHand, playedCards),
      DIAMONDS: this.calculateSuitProfile('DIAMONDS', myHand, playedCards),
    };

    let totalCardWeight = 0;
    let voidCount = 0;
    const lengths: number[] = [];

    for (const suit of ALL_SUITS) {
      const profile = suitProfiles[suit];
      totalCardWeight += profile.totalDynamicWeight;
      lengths.push(profile.cardCount);
      if (profile.isVoid) {
        voidCount++;
      }
    }

    // Polarization: variance of suit lengths
    // A hand with [6, 4, 0, 0] has high polarization and low entropy (tactically strong).
    // A hand with [3, 3, 2, 2] has low polarization and high entropy (tactically weak).
    const meanLength = myHand.length / 4.0;
    let variance = 0;
    for (const len of lengths) {
      variance += Math.pow(len - meanLength, 2);
    }
    const polarizationScore = Math.sqrt(variance / 4.0) * this.POLARIZATION_WEIGHT;

    // Total Hand Strength = Card Weights + Void Tactical Equity + Polarization Bonus
    const voidEquity = voidCount * this.VOID_TACTICAL_VALUE;
    const totalStrength = totalCardWeight + voidEquity + polarizationScore;

    return {
      totalStrength,
      suitProfiles,
      voidCount,
      polarizationScore,
      averageCardWeight: myHand.length > 0 ? totalCardWeight / myHand.length : 0,
    };
  }

  /**
   * Computes the Delta Hand Strength ΔH(c) resulting from shedding candidate card c:
   *   ΔH(c) = HandStrength(hand \ {c}) - HandStrength(hand)
   *
   * High (positive or less negative) ΔH means the hand retains maximum strength
   * and sheds minimum equity, while rewarding the creation of new voids!
   */
  public static evaluateDiscardUtilities(
    candidates: Card[],
    myHand: Card[],
    playedCards: Card[]
  ): Map<string, number> {
    const currentStrength = this.calculateHandStrength(myHand, playedCards).totalStrength;
    const utilityMap = new Map<string, number>();

    for (const card of candidates) {
      // Remaining hand if this card is played
      const nextHand = myHand.filter((c) => c.id !== card.id);
      const nextStrength = this.calculateHandStrength(nextHand, playedCards).totalStrength;

      // ΔH = change in hand strength
      let deltaH = nextStrength - currentStrength;

      // Honor Guard Protection Penalty:
      // If shedding this card leaves an unpromoted King or Queen unguarded (bare singleton honor),
      // apply a protection penalty proportional to the risk of honor capture.
      const cardsInSuit = myHand.filter((c) => c.suit === card.suit);
      if (cardsInSuit.length === 2) {
        const otherCard = cardsInSuit.find((c) => c.id !== card.id);
        if (otherCard) {
          const otherWeight = this.calculateDynamicCardWeight(otherCard, playedCards, myHand);
          // If the remaining card is an unpromoted honor (e.g. King when Ace is still unplayed)
          if (otherWeight >= 11.0 && otherWeight < 13.0) {
            deltaH -= 8.0; // Honor guard penalty
          }
        }
      }

      utilityMap.set(card.id, deltaH);
    }

    return utilityMap;
  }

  /**
   * Selects the optimal card to shed/discard based on mathematical utility maximization:
   *   c* = argmax_{c in candidates} Utility(c)
   */
  public static pickBestCardToShed(
    candidates: Card[],
    myHand: Card[],
    playedCards: Card[]
  ): Card {
    if (candidates.length <= 1) return candidates[0];

    const utilities = this.evaluateDiscardUtilities(candidates, myHand, playedCards);

    let bestCard = candidates[0];
    let bestUtility = -Infinity;

    for (const card of candidates) {
      const u = utilities.get(card.id) ?? -Infinity;
      if (u > bestUtility) {
        bestUtility = u;
        bestCard = card;
      }
    }

    return bestCard;
  }

  /**
   * Softmax probability distribution over candidates for neural or stochastic sampling.
   */
  public static computeSoftmaxProbabilities(
    candidates: Card[],
    myHand: Card[],
    playedCards: Card[],
    temperature: number = 1.0
  ): Map<string, number> {
    const utilities = this.evaluateDiscardUtilities(candidates, myHand, playedCards);
    const temp = Math.max(0.01, temperature);

    let maxU = -Infinity;
    for (const card of candidates) {
      const u = utilities.get(card.id) ?? 0;
      if (u > maxU) maxU = u;
    }

    let sumExp = 0;
    const expMap = new Map<string, number>();
    for (const card of candidates) {
      const expVal = Math.exp(((utilities.get(card.id) ?? 0) - maxU) / temp);
      expMap.set(card.id, expVal);
      sumExp += expVal;
    }

    const probMap = new Map<string, number>();
    for (const card of candidates) {
      const expVal = expMap.get(card.id) ?? 0;
      probMap.set(card.id, sumExp > 0 ? expVal / sumExp : 1.0 / candidates.length);
    }

    return probMap;
  }

  /**
   * Evaluates the first 5 cards for bidding using 13-weight rank scaling, length multipliers,
   * and honor bonuses.
   *
   * Rules:
   * - Bots do not choose a suit/color unless they hold the right cards (score >= threshold).
   * - If the bot does not have strong enough cards, it PASSES.
   * - Only if forced by game rules (isLastBidder === true, i.e. 4th bidder after 3 passes),
   *   does it pick the best available suit even with a weak hand.
   */
  public static evaluateBidding(
    hand: Card[],
    isLastBidder: boolean = false,
    isRungAlreadyChosen: boolean = false
  ): BiddingRecommendation {
    const suitCards: Record<Suit, Card[]> = {
      SPADES: [],
      HEARTS: [],
      CLUBS: [],
      DIAMONDS: [],
    };

    for (const card of hand) {
      suitCards[card.suit].push(card);
    }

    let bestSuit: Suit = 'SPADES';
    let highestScore = -1;

    for (const suit of ALL_SUITS) {
      const cards = suitCards[suit];
      if (cards.length === 0) continue;

      // 1. Sum of 13-rank weights
      let rankWeightSum = 0;
      let hasAce = false;
      let hasKing = false;
      let hasQueen = false;
      let hasJack = false;

      for (const c of cards) {
        const w = BASE_RANK_WEIGHTS[c.rank] || 1;
        rankWeightSum += w;
        if (c.rank === 'A') hasAce = true;
        if (c.rank === 'K') hasKing = true;
        if (c.rank === 'Q') hasQueen = true;
        if (c.rank === 'J') hasJack = true;
      }

      // 2. Length Multiplier (Length is crucial in a 5-card distribution)
      // 1 card: 0.5x, 2 cards: 1.0x, 3 cards: 1.5x, 4 cards: 2.4x, 5 cards: 3.2x
      const lengthMultipliers: Record<number, number> = {
        1: 0.5,
        2: 1.0,
        3: 1.5,
        4: 2.4,
        5: 3.2,
      };
      const lenMult = lengthMultipliers[cards.length] || (cards.length >= 5 ? 3.2 : 0.5);

      // 3. High Honor Bonuses
      let honorBonus = 0;
      if (hasAce) honorBonus += 8.0;
      if (hasKing) honorBonus += 5.0;
      if (hasQueen) honorBonus += 3.0;
      if (hasJack) honorBonus += 1.5;

      let score = (rankWeightSum * lenMult) + honorBonus;

      // Master Tactical Rule: In 5-card bidding, 3 cards without the Ace (like K, J, 9)
      // does NOT provide sufficient strength or master control to voluntarily choose Rung.
      // Suits with fewer than 4 cards MUST possess the Ace to be considered strong enough.
      if (cards.length < 4 && !hasAce) {
        score *= 0.5; // Significant lack-of-control penalty for short suits without the master card
      }

      if (score > highestScore) {
        highestScore = score;
        bestSuit = suit;
      }
    }

    const bestCards = suitCards[bestSuit].length > 0 ? suitCards[bestSuit] : hand;
    const bestCount = bestCards.length;
    const totalAces = hand.filter((c) => c.rank === 'A').length;

    // Pick card to lock as secret trump:
    // Preserving boss honors: Place the Ace face down so it cannot be forced into play
    // before the Rung is revealed (e.g. if an opponent leads that suit in early tricks).
    // If no Ace is held in the chosen suit, place the highest card face down to protect it.
    const sortedDesc = [...bestCards].sort((a, b) => b.playValue - a.playValue);
    const aceCard = sortedDesc.find((c) => c.rank === 'A');
    const chosenCard = aceCard || sortedDesc[0] || hand[0];

    // BWINJI threshold: Extraordinary dominance
    const isBwinji =
      (bestCount >= 5) ||
      (bestCount >= 4 && highestScore >= 90.0) ||
      (bestCount >= 4 && highestScore >= 65.0 && totalAces >= 2);

    if (isRungAlreadyChosen) {
      if (isBwinji) {
        return { action: 'BWINJI', bestSuit, chosenCard, suitScore: highestScore, isForcedByRules: false };
      }
      return { action: 'PASS', bestSuit, chosenCard, suitScore: highestScore, isForcedByRules: false };
    }

    if (isBwinji) {
      return { action: 'BWINJI', bestSuit, chosenCard, suitScore: highestScore, isForcedByRules: false };
    }

    // Voluntary Close Rung threshold:
    // Score >= 50.0 ensures player has substantial strength/length in the suit
    const RUNG_VOLUNTARY_THRESHOLD = 50.0;

    if (highestScore >= RUNG_VOLUNTARY_THRESHOLD) {
      return { action: 'SELECT_CARD_TRUMP', bestSuit, chosenCard, suitScore: highestScore, isForcedByRules: false };
    }

    // If score is below threshold, player does NOT pick a suit unless forced by game rules (4th bidder)
    if (isLastBidder) {
      return { action: 'SELECT_CARD_TRUMP', bestSuit, chosenCard, suitScore: highestScore, isForcedByRules: true };
    }

    // Otherwise PASS!
    return { action: 'PASS', bestSuit, chosenCard, suitScore: highestScore, isForcedByRules: false };
  }
}
