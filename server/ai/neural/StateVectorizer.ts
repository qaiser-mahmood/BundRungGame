import { Card, Suit, Rank, PublicGameState, PrivatePlayerState, Player } from '../../../shared/types';

export const ALL_SUITS: Suit[] = ['SPADES', 'HEARTS', 'CLUBS', 'DIAMONDS'];
export const ALL_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export class StateVectorizer {
  public static readonly FEATURE_COUNT = 52 + 52 + 52 + 4 + 5 + 16 + 2; // 183 features

  /**
   * Maps a card to a unique index from 0 to 51
   */
  public static cardToIndex(card: Card): number {
    const suitIdx = ALL_SUITS.indexOf(card.suit);
    const rankIdx = ALL_RANKS.indexOf(card.rank);
    if (suitIdx === -1 || rankIdx === -1) return 0;
    return suitIdx * 13 + rankIdx;
  }

  /**
   * Maps a 0..51 index back to a card ID or partial card
   */
  public static indexToCard(index: number): { suit: Suit; rank: Rank } {
    const clamped = Math.max(0, Math.min(51, Math.floor(index)));
    const suit = ALL_SUITS[Math.floor(clamped / 13)];
    const rank = ALL_RANKS[clamped % 13];
    return { suit, rank };
  }

  /**
   * Vectorizes the current game state from the perspective of a specific bot player
   */
  public static vectorize(
    publicState: PublicGameState,
    privateState: PrivatePlayerState,
    botPlayerId: string,
    players: Player[]
  ): Float32Array {
    const features = new Float32Array(this.FEATURE_COUNT);
    let offset = 0;

    // 1. My Hand Cards (52 binary)
    const myHand = privateState.myHand || [];
    for (const card of myHand) {
      features[offset + this.cardToIndex(card)] = 1.0;
    }
    if (privateState.myTrumpCard && privateState.isMyTrumpCardPlayable) {
      features[offset + this.cardToIndex(privateState.myTrumpCard)] = 1.0;
    }
    offset += 52;

    // 2. Previously Played Cards in Completed Tricks (52 binary)
    for (const trick of publicState.completedTricks) {
      for (const pc of trick.cards) {
        if (pc.card) {
          features[offset + this.cardToIndex(pc.card)] = 1.0;
        }
      }
    }
    offset += 52;

    // 3. Current Trick Cards on Table (52 binary)
    const currentTrick = publicState.currentTrick?.cards || [];
    for (const tc of currentTrick) {
      if (tc.card) {
        features[offset + this.cardToIndex(tc.card)] = 1.0;
      }
    }
    offset += 52;

    // 4. Turn Position in Current Trick (4 one-hot: 0=Lead, 1=Second, 2=Third, 3=Fourth)
    const cardsPlayedInTrick = currentTrick.length;
    if (cardsPlayedInTrick >= 0 && cardsPlayedInTrick < 4) {
      features[offset + cardsPlayedInTrick] = 1.0;
    }
    offset += 4;

    // 5. Active Trump Suit (5 one-hot: Spades, Hearts, Clubs, Diamonds, or Unrevealed)
    if (publicState.isTrumpRevealed && publicState.trumpSuit) {
      const suitIdx = ALL_SUITS.indexOf(publicState.trumpSuit);
      if (suitIdx !== -1) {
        features[offset + suitIdx] = 1.0;
      }
    } else {
      features[offset + 4] = 1.0; // Unrevealed / Bund
    }
    offset += 5;

    // 6. Inferred Voids (16 binary: 4 players x 4 suits)
    // When a player didn't follow suit in past tricks, they are void in that suit
    for (let pIdx = 0; pIdx < Math.min(players.length, 4); pIdx++) {
      const player = players[pIdx];
      for (const trick of publicState.completedTricks) {
        if (!trick.leadSuit) continue;
        const playedByP = trick.cards.find((c) => c.playerId === player.id);
        if (playedByP && playedByP.card && playedByP.card.suit !== trick.leadSuit) {
          const leadSuitIdx = ALL_SUITS.indexOf(trick.leadSuit);
          if (leadSuitIdx !== -1) {
            features[offset + pIdx * 4 + leadSuitIdx] = 1.0;
          }
        }
      }
    }
    offset += 16;

    // 7. Normalized Trick Scores (2 floats)
    const botPlayer = players.find((p) => p.id === botPlayerId);
    const myTeam = botPlayer?.team || 'TEAM_1';
    const myTeamTricks = myTeam === 'TEAM_1' ? publicState.team1TricksWon : publicState.team2TricksWon;
    const oppTeamTricks = myTeam === 'TEAM_1' ? publicState.team2TricksWon : publicState.team1TricksWon;

    features[offset] = Math.min(1.0, myTeamTricks / 13.0);
    features[offset + 1] = Math.min(1.0, oppTeamTricks / 13.0);
    offset += 2;

    return features;
  }
}
