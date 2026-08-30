import { Card } from '../../shared/types';
import { Deck } from './Deck';

export interface TossResult {
  isComplete: boolean;
  dealerPlayerId: string | null;
  tiedPlayerIds: string[];
  draws: { [playerId: string]: Card };
  roundNumber: number;
}

export class TossEngine {
  private remainingDeckCards: Card[] = [];
  private playerDrawHistory: { [playerId: string]: Card[] } = {};
  private currentRoundDraws: { [playerId: string]: Card } = {};
  private activeTossPlayerIds: string[] = [];
  private round: number = 1;
  private dealerPlayerId: string | null = null;
  private tiedPlayerIds: string[] = [];

  constructor() {
    this.reset();
  }

  public reset(playerIds: string[] = []): void {
    const deck = new Deck();
    deck.shuffle();
    this.remainingDeckCards = deck.getCards();
    this.playerDrawHistory = {};
    this.currentRoundDraws = {};
    this.activeTossPlayerIds = [...playerIds];
    this.round = 1;
    this.dealerPlayerId = null;
    this.tiedPlayerIds = [];
  }

  public setPlayers(playerIds: string[]): void {
    this.activeTossPlayerIds = [...playerIds];
  }

  public getRemainingCount(): number {
    return this.remainingDeckCards.length;
  }

  public getRoundNumber(): number {
    return this.round;
  }

  public getDraws(): { [playerId: string]: Card } {
    return this.getLatestDraws();
  }

  public getLatestDraws(): { [playerId: string]: Card } {
    const latest: { [playerId: string]: Card } = {};
    for (const [pid, history] of Object.entries(this.playerDrawHistory)) {
      if (history.length > 0) {
        latest[pid] = history[history.length - 1];
      }
    }
    return latest;
  }

  public getDrawHistory(): { [playerId: string]: Card[] } {
    const historyCopy: { [playerId: string]: Card[] } = {};
    for (const [pid, history] of Object.entries(this.playerDrawHistory)) {
      historyCopy[pid] = [...history];
    }
    return historyCopy;
  }

  public hasPlayerDrawnThisRound(playerId: string): boolean {
    return Boolean(this.currentRoundDraws[playerId]);
  }

  public getActivePlayerIds(): string[] {
    return [...this.activeTossPlayerIds];
  }

  public getTiedPlayerIds(): string[] {
    return [...this.tiedPlayerIds];
  }

  public drawCard(playerId: string, cardIndex: number): Card {
    if (!this.activeTossPlayerIds.includes(playerId)) {
      throw new Error(`Player ${playerId} is not in the active toss round`);
    }
    if (this.currentRoundDraws[playerId]) {
      throw new Error(`Player ${playerId} has already drawn a card for this round`);
    }
    if (cardIndex < 0 || cardIndex >= this.remainingDeckCards.length) {
      throw new Error(`Invalid card index ${cardIndex}`);
    }

    const [drawnCard] = this.remainingDeckCards.splice(cardIndex, 1);
    this.currentRoundDraws[playerId] = drawnCard;
    if (!this.playerDrawHistory[playerId]) {
      this.playerDrawHistory[playerId] = [];
    }
    this.playerDrawHistory[playerId].push(drawnCard);
    return drawnCard;
  }

  /**
   * Evaluates if all active players have drawn in this toss round.
   * Rank values: A = 1, 2-10 = 2-10, J = 11, Q = 12, K = 13.
   * Lowest value card is assigned as Dealer.
   * If two or more players draw the same lowest-value card:
   * - All previous cards stay in place and deck is NOT reshuffled.
   * - Only the tied players pick another card, which is stacked on top.
   * - Dealer is decided based on newly drawn cards between the tied players.
   */
  public evaluateRound(): TossResult {
    const activeCount = this.activeTossPlayerIds.length;
    const drawnCount = Object.keys(this.currentRoundDraws).length;

    if (drawnCount < activeCount) {
      return {
        isComplete: false,
        dealerPlayerId: null,
        tiedPlayerIds: this.round > 1 ? this.activeTossPlayerIds : [],
        draws: this.getLatestDraws(),
        roundNumber: this.round,
      };
    }

    // Find lowest tossValue for the cards drawn in THIS round
    let lowestValue = Infinity;
    for (const pid of this.activeTossPlayerIds) {
      const card = this.currentRoundDraws[pid];
      if (card.tossValue < lowestValue) {
        lowestValue = card.tossValue;
      }
    }

    const lowestPlayers = this.activeTossPlayerIds.filter(
      (pid) => this.currentRoundDraws[pid].tossValue === lowestValue
    );

    if (lowestPlayers.length === 1) {
      this.dealerPlayerId = lowestPlayers[0];
      this.tiedPlayerIds = [];
      return {
        isComplete: true,
        dealerPlayerId: this.dealerPlayerId,
        tiedPlayerIds: [],
        draws: this.getLatestDraws(),
        roundNumber: this.round,
      };
    }

    // Tie-breaker required: only the tied players continue to draw in the next round
    this.round += 1;
    this.activeTossPlayerIds = [...lowestPlayers];
    this.tiedPlayerIds = [...lowestPlayers];
    this.currentRoundDraws = {}; // Clear round draws for next round, but draw history is preserved

    return {
      isComplete: false,
      dealerPlayerId: null,
      tiedPlayerIds: lowestPlayers,
      draws: this.getLatestDraws(),
      roundNumber: this.round,
    };
  }
}
