import { Card, Suit, Rank } from '../../shared/types';

export class Deck {
  private cards: Card[] = [];
  private isLocked: boolean = false;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.cards = [];
    this.isLocked = false;
    const suits: Suit[] = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    for (const suit of suits) {
      for (const rank of ranks) {
        let playValue: number;
        let tossValue: number;

        if (rank === 'A') {
          playValue = 14;
          tossValue = 1; // Ace is lowest for toss dealer determination
        } else if (rank === 'K') {
          playValue = 13;
          tossValue = 13;
        } else if (rank === 'Q') {
          playValue = 12;
          tossValue = 12;
        } else if (rank === 'J') {
          playValue = 11;
          tossValue = 11;
        } else {
          const num = parseInt(rank, 10);
          playValue = num;
          tossValue = num;
        }

        this.cards.push({
          id: `${suit[0]}_${rank}`,
          suit,
          rank,
          playValue,
          tossValue,
        });
      }
    }
  }

  public setCards(cards: Card[]): void {
    this.cards = [...cards];
    this.isLocked = false;
  }

  public shuffle(): void {
    if (this.isLocked) {
      throw new Error('Deck is locked after cut and cannot be reshuffled');
    }
    // Modern Fisher-Yates shuffle
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  /**
   * Section 4.2 Interactive Deck Cut Mechanics:
   * Cutting Action: The cut player selects any card in the face-down deck pile.
   * Pile Swapping: Based on the clicked card's position, the deck is split into a Top Pile
   * and a Bottom Pile. The engine swaps the piles (placing the Bottom Pile on top of the Top Pile).
   * Deck Lock: Once swapped, the deck is locked for that Game.
   */
  public cut(cutIndex: number): void {
    if (this.isLocked) {
      throw new Error('Deck is already locked');
    }
    const index = Math.max(0, Math.min(this.cards.length - 1, cutIndex));
    const topPile = this.cards.slice(0, index + 1);
    const bottomPile = this.cards.slice(index + 1);

    // Swap: bottom pile placed on top of top pile
    this.cards = [...bottomPile, ...topPile];
    this.isLocked = true;
  }

  public getCards(): Card[] {
    return [...this.cards];
  }

  public get count(): number {
    return this.cards.length;
  }

  public get locked(): boolean {
    return this.isLocked;
  }

  /**
   * Section 4.3: First Pass Deals 5 cards to each player (20 cards total)
   * Order: Counter-clockwise starting from Dealer's Right
   */
  public dealFirstPass(playerOrder: string[]): { [playerId: string]: Card[] } {
    const hands: { [playerId: string]: Card[] } = {};
    for (const pid of playerOrder) {
      hands[pid] = [];
    }

    // 5 cards to each of the 4 players
    for (const pid of playerOrder) {
      hands[pid].push(...this.cards.splice(0, 5));
    }

    return hands;
  }

  /**
   * Section 4.3 & 5.2: Second Pass Deals the remaining 32 cards (4 cards per player per pass)
   * Pass 2: 4 cards each (16 cards)
   * Pass 3: 4 cards each (16 cards)
   * Total = 13 cards per player
   */
  public dealRemainingPasses(playerOrder: string[], existingHands: { [playerId: string]: Card[] }): { [playerId: string]: Card[] } {
    const hands = { ...existingHands };

    // Pass 2: 4 cards each
    for (const pid of playerOrder) {
      hands[pid].push(...this.cards.splice(0, 4));
    }

    // Pass 3: 4 cards each
    for (const pid of playerOrder) {
      hands[pid].push(...this.cards.splice(0, 4));
    }

    return hands;
  }
}
