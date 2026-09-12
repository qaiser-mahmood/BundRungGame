import { Card, Suit, Rank, PublicGameState, Player } from '../../../shared/types';

const SUITS: Suit[] = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
const RANKS: { rank: Rank; playValue: number; tossValue: number }[] = [
  { rank: '2', playValue: 2, tossValue: 2 },
  { rank: '3', playValue: 3, tossValue: 3 },
  { rank: '4', playValue: 4, tossValue: 4 },
  { rank: '5', playValue: 5, tossValue: 5 },
  { rank: '6', playValue: 6, tossValue: 6 },
  { rank: '7', playValue: 7, tossValue: 7 },
  { rank: '8', playValue: 8, tossValue: 8 },
  { rank: '9', playValue: 9, tossValue: 9 },
  { rank: '10', playValue: 10, tossValue: 10 },
  { rank: 'J', playValue: 11, tossValue: 11 },
  { rank: 'Q', playValue: 12, tossValue: 12 },
  { rank: 'K', playValue: 13, tossValue: 13 },
  { rank: 'A', playValue: 14, tossValue: 1 },
];

export const ALL_52_CARDS: Card[] = [];
for (const s of SUITS) {
  for (const r of RANKS) {
    ALL_52_CARDS.push({
      id: `${s[0]}_${r.rank}`,
      suit: s,
      rank: r.rank,
      playValue: r.playValue,
      tossValue: r.tossValue,
    });
  }
}

export interface TrumpAnalysis {
  activeTrumpSuit: Suit | null;
  isRevealed: boolean;
  totalTrumpsRemaining: number;
  trumpsInMyHand: Card[];
  unseenTrumpsCount: number;
  highestUnseenTrumpValue: number;
  isTrumpAcePlayed: boolean;
  isTrumpAceInMyHand: boolean;
}

export class CardTracker {
  /**
   * Returns all cards that have been played in completed tricks and the active trick.
   */
  public static getPlayedCards(publicState: PublicGameState): Card[] {
    const played: Card[] = [];
    for (const trick of publicState.completedTricks) {
      for (const pc of trick.cards) {
        if (pc.card) played.push(pc.card);
      }
    }
    for (const pc of publicState.currentTrick.cards) {
      if (pc.card) played.push(pc.card);
    }
    return played;
  }

  /**
   * Returns all cards in the 52-card deck that have neither been played nor exist in myHand.
   * These are the cards currently held by partner and opponents.
   */
  public static getUnseenCards(publicState: PublicGameState, myHand: Card[]): Card[] {
    const playedCards = this.getPlayedCards(publicState);
    const knownCardIds = new Set<string>();
    for (const c of playedCards) knownCardIds.add(c.id);
    for (const c of myHand) knownCardIds.add(c.id);

    return ALL_52_CARDS.filter((c) => !knownCardIds.has(c.id));
  }

  /**
   * In-depth 4x4 player void deduction matrix.
   * Maps each player ID to the set of suits they have reneged on (proven 0 cards).
   */
  public static getVoidMatrix(publicState: PublicGameState): Map<string, Set<Suit>> {
    const voids = new Map<string, Set<Suit>>();
    for (const p of publicState.players) {
      voids.set(p.id, new Set<Suit>());
    }

    const allTricks = [...publicState.completedTricks, publicState.currentTrick];
    for (const trick of allTricks) {
      if (!trick.leadSuit) continue;
      const leadSuit = trick.leadSuit;
      for (const pc of trick.cards) {
        if (pc.card && pc.card.suit !== leadSuit && !pc.isFaceDown) {
          voids.get(pc.playerId)?.add(leadSuit);
        }
      }
    }

    return voids;
  }

  /**
   * Evaluates whether a card is currently the highest unplayed card of its suit.
   * E.g. If the Ace of Hearts has been played, the King of Hearts is the new Boss card.
   */
  public static isBossCard(card: Card, playedCards: Card[], myHand: Card[]): boolean {
    const playedInSuit = playedCards.filter((c) => c.suit === card.suit);
    const myHandInSuit = myHand.filter((c) => c.suit === card.suit);

    for (let pv = card.playValue + 1; pv <= 14; pv++) {
      const isPlayed = playedInSuit.some((c) => c.playValue === pv);
      const inMyHand = myHandInSuit.some((c) => c.playValue === pv);
      if (!isPlayed && !inMyHand) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns list of suits that the partner has led in previous completed tricks.
   */
  public static getPartnerLedSuits(publicState: PublicGameState, partnerId: string): Suit[] {
    const suits: Suit[] = [];
    for (const trick of publicState.completedTricks) {
      if (trick.leadPlayerId === partnerId && trick.leadSuit) {
        if (!suits.includes(trick.leadSuit)) {
          suits.push(trick.leadSuit);
        }
      }
    }
    return suits;
  }

  /**
   * Deep analysis of remaining trumps in the game.
   */
  public static analyzeTrump(
    publicState: PublicGameState,
    myHand: Card[],
    secretTrumpSuit?: Suit | null
  ): TrumpAnalysis {
    const activeTrumpSuit = publicState.isTrumpRevealed
      ? publicState.trumpSuit
      : secretTrumpSuit || null;

    if (!activeTrumpSuit) {
      return {
        activeTrumpSuit: null,
        isRevealed: false,
        totalTrumpsRemaining: 0,
        trumpsInMyHand: [],
        unseenTrumpsCount: 0,
        highestUnseenTrumpValue: 0,
        isTrumpAcePlayed: false,
        isTrumpAceInMyHand: false,
      };
    }

    const playedCards = this.getPlayedCards(publicState);
    const playedTrumps = playedCards.filter((c) => c.suit === activeTrumpSuit);
    const trumpsInMyHand = myHand.filter((c) => c.suit === activeTrumpSuit);
    const unseenCards = this.getUnseenCards(publicState, myHand);
    const unseenTrumps = unseenCards.filter((c) => c.suit === activeTrumpSuit);

    const isTrumpAcePlayed = playedTrumps.some((c) => c.rank === 'A');
    const isTrumpAceInMyHand = trumpsInMyHand.some((c) => c.rank === 'A');

    let highestUnseenTrumpValue = 0;
    for (const t of unseenTrumps) {
      if (t.playValue > highestUnseenTrumpValue) {
        highestUnseenTrumpValue = t.playValue;
      }
    }

    return {
      activeTrumpSuit,
      isRevealed: publicState.isTrumpRevealed,
      totalTrumpsRemaining: 13 - playedTrumps.length,
      trumpsInMyHand,
      unseenTrumpsCount: unseenTrumps.length,
      highestUnseenTrumpValue,
      isTrumpAcePlayed,
      isTrumpAceInMyHand,
    };
  }
}
