import { Card, Suit, Player, PublicGameState } from '../../../shared/types';
import { CardTracker } from './CardTracker';
import { DynamicSuitEvaluator } from './DynamicSuitEvaluator';

interface SimulatedPlayer {
  id: string;
  team: 'TEAM_1' | 'TEAM_2';
  hand: Card[];
  isBot: boolean;
}

interface SimulatedPlayedCard {
  playerId: string;
  card: Card;
  isAceDowngraded?: boolean;
}

export class MonteCarloPlanner {
  /**
   * Generates a randomized deal of the unseen cards among the other 3 players,
   * strictly respecting each player's known voids from the Void Matrix.
   */
  public static generateConsistentWorld(
    publicState: PublicGameState,
    botPlayerId: string,
    myHand: Card[],
    voidMatrix: Map<string, Set<Suit>>,
    secretTrumpSuit?: Suit | null
  ): Map<string, Card[]> {
    const unseenCards = CardTracker.getUnseenCards(publicState, myHand);
    const otherPlayers = publicState.players.filter((p) => p.id !== botPlayerId);
    const handAssignments = new Map<string, Card[]>();
    for (const p of otherPlayers) {
      handAssignments.set(p.id, []);
    }

    // Shuffle unseen cards randomly (Fisher-Yates)
    const deck = [...unseenCards];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Distribute cards to players respecting void constraints & remaining hand counts
    const remainingNeeds = new Map<string, number>();
    for (const p of otherPlayers) {
      remainingNeeds.set(p.id, p.cardsInHandCount);
    }

    const unassigned: Card[] = [];

    for (const card of deck) {
      // Find players who still need cards and are NOT void in card.suit
      const eligiblePlayers = otherPlayers.filter((p) => {
        const needs = remainingNeeds.get(p.id) || 0;
        const isVoid = voidMatrix.get(p.id)?.has(card.suit) || false;
        return needs > 0 && !isVoid;
      });

      if (eligiblePlayers.length > 0) {
        // Pick one randomly
        const chosen = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
        handAssignments.get(chosen.id)!.push(card);
        remainingNeeds.set(chosen.id, (remainingNeeds.get(chosen.id) || 1) - 1);
      } else {
        unassigned.push(card);
      }
    }

    // If any cards remained unassigned due to strict void deadlocks, distribute to whoever has remaining needs
    for (const card of unassigned) {
      const needyPlayers = otherPlayers.filter((p) => (remainingNeeds.get(p.id) || 0) > 0);
      if (needyPlayers.length > 0) {
        const chosen = needyPlayers[Math.floor(Math.random() * needyPlayers.length)];
        handAssignments.get(chosen.id)!.push(card);
        remainingNeeds.set(chosen.id, (remainingNeeds.get(chosen.id) || 1) - 1);
      }
    }

    return handAssignments;
  }

  /**
   * Fast greedy rollouts forward-simulating the game to completion.
   * Returns a score representing the utility for botPlayer's team.
   */
  public static simulateRollout(
    publicState: PublicGameState,
    botPlayerId: string,
    myHand: Card[],
    firstCard: Card,
    worldHands: Map<string, Card[]>,
    activeTrumpSuit: Suit | null
  ): number {
    const me = publicState.players.find((p) => p.id === botPlayerId)!;
    const myTeam = me.team;

    // Deep clone hands for simulation
    const hands = new Map<string, Card[]>();
    hands.set(
      botPlayerId,
      myHand.filter((c) => c.id !== firstCard.id)
    );
    for (const [pid, ch] of worldHands.entries()) {
      hands.set(pid, [...ch]);
    }

    const players: SimulatedPlayer[] = publicState.players.map((p) => ({
      id: p.id,
      team: p.team,
      hand: hands.get(p.id) || [],
      isBot: p.isBot,
    }));

    // Reconstruct trick state
    let currentTrickCards: SimulatedPlayedCard[] = [];
    for (const pc of publicState.currentTrick.cards) {
      if (pc.card) {
        currentTrickCards.push({
          playerId: pc.playerId,
          card: pc.card,
          isAceDowngraded: pc.isAceDowngraded,
        });
      }
    }

    // Add firstCard played by bot
    const didIWinLastTrickWithAce =
      publicState.lastTrickWinnerPlayerId === botPlayerId &&
      publicState.lastTrickWinningCard?.rank === 'A';
    currentTrickCards.push({
      playerId: botPlayerId,
      card: firstCard,
      isAceDowngraded: didIWinLastTrickWithAce && firstCard.rank === 'A',
    });

    let leadSuit: Suit | null = publicState.currentTrick.leadSuit || firstCard.suit;
    let turnPlayerIndex = (publicState.players.findIndex((p) => p.id === botPlayerId) + 1) % 4;
    let lastWinnerPlayerId: string | null = publicState.lastTrickWinnerPlayerId;
    let lastWinningTeam: 'TEAM_1' | 'TEAM_2' | null = publicState.lastTrickWinnerTeam;
    let consecutiveTricksCount: number = publicState.consecutiveTricksCount;
    let team1TricksWon: number = publicState.team1TricksWon;
    let team2TricksWon: number = publicState.team2TricksWon;
    let isTrumpRevealed: boolean = publicState.isTrumpRevealed;
    let trumpSuit: Suit | null = activeTrumpSuit;

    // Helper: Determine winner of a 4-card trick
    const resolveSimulatedTrick = (
      cards: SimulatedPlayedCard[],
      lSuit: Suit,
      tSuit: Suit | null
    ): SimulatedPlayer => {
      let winningPlay = cards[0];
      let winningValue = winningPlay.isAceDowngraded ? 2 : winningPlay.card.playValue;
      let isWinningTrump = Boolean(tSuit && winningPlay.card.suit === tSuit);

      for (let i = 1; i < cards.length; i++) {
        const play = cards[i];
        const cardVal = play.isAceDowngraded ? 2 : play.card.playValue;
        const isTrump = Boolean(tSuit && play.card.suit === tSuit);

        if (isTrump && !isWinningTrump) {
          winningPlay = play;
          winningValue = cardVal;
          isWinningTrump = true;
        } else if (isTrump && isWinningTrump) {
          if (cardVal > winningValue) {
            winningPlay = play;
            winningValue = cardVal;
          }
        } else if (!isTrump && !isWinningTrump) {
          if (play.card.suit === lSuit && cardVal > winningValue) {
            winningPlay = play;
            winningValue = cardVal;
          }
        }
      }

      return players.find((p) => p.id === winningPlay.playerId)!;
    };

    // Helper: Pick a greedy card from hand
    const pickRolloutCard = (
      player: SimulatedPlayer,
      lSuit: Suit | null,
      tSuit: Suit | null,
      currentCards: SimulatedPlayedCard[]
    ): Card => {
      const hand = player.hand;
      if (hand.length === 0) return { id: 'dummy', suit: 'HEARTS', rank: '2', playValue: 2, tossValue: 2 };

      // If leading:
      if (!lSuit || currentCards.length === 0) {
        // Prefer cashing boss card or lowest card in shortest suit
        return hand[0];
      }

      // Following: Must follow lead suit if possible
      const inLeadSuit = hand.filter((c) => c.suit === lSuit);
      if (inLeadSuit.length > 0) {
        // If partner is currently winning, play lowest
        inLeadSuit.sort((a, b) => a.playValue - b.playValue);
        return inLeadSuit[0];
      }

      // Void in lead suit: Can cut with trump or discard
      if (tSuit) {
        const trumps = hand.filter((c) => c.suit === tSuit);
        if (trumps.length > 0) {
          trumps.sort((a, b) => a.playValue - b.playValue);
          return trumps[0]; // Cut with lowest trump
        }
      }

      // Discard weakest card to optimize hand strength and create voids via Dynamic Hand Optimization
      return DynamicSuitEvaluator.pickBestCardToShed(hand, hand, []);
    };

    // Forward simulation loop
    let tricksCompleted = 0;
    while (tricksCompleted < 13) {
      // Complete current trick
      while (currentTrickCards.length < 4) {
        const p = players[turnPlayerIndex];
        const chosenCard = pickRolloutCard(p, leadSuit, trumpSuit, currentTrickCards);

        // Remove card from hand
        const cIdx = p.hand.findIndex((c) => c.id === chosenCard.id);
        if (cIdx !== -1) p.hand.splice(cIdx, 1);

        if (!leadSuit) leadSuit = chosenCard.suit;

        currentTrickCards.push({
          playerId: p.id,
          card: chosenCard,
          isAceDowngraded: false,
        });

        turnPlayerIndex = (turnPlayerIndex + 1) % 4;
      }

      // Trick is complete! Resolve winner:
      const winner = resolveSimulatedTrick(currentTrickCards, leadSuit!, trumpSuit);
      tricksCompleted++;

      if (winner.team === 'TEAM_1') team1TricksWon++;
      else team2TricksWon++;

      // Check Bund 2-consecutive-tricks streak (if trump revealed)
      if (isTrumpRevealed) {
        if (lastWinningTeam === winner.team) {
          consecutiveTricksCount++;
          if (consecutiveTricksCount >= 2) {
            // BUND WIN!
            return winner.team === myTeam ? 150 : -150;
          }
        } else {
          consecutiveTricksCount = 1;
        }
      } else {
        // If trump was not revealed, check if someone used trump
        if (trumpSuit && currentTrickCards.some((c) => c.card.suit === trumpSuit)) {
          isTrumpRevealed = true;
          consecutiveTricksCount = 1;
        }
      }

      lastWinnerPlayerId = winner.id;
      lastWinningTeam = winner.team;

      // Prepare next trick
      currentTrickCards = [];
      leadSuit = null;
      turnPlayerIndex = players.findIndex((p) => p.id === winner.id);

      // Check if any player has run out of cards
      if (players.some((p) => p.hand.length === 0)) break;
    }

    // Normal game outcome (tricks accumulation)
    const myTeamTricks = myTeam === 'TEAM_1' ? team1TricksWon : team2TricksWon;
    const oppTeamTricks = myTeam === 'TEAM_1' ? team2TricksWon : team1TricksWon;

    if (myTeamTricks >= 7) return 50 + (myTeamTricks - oppTeamTricks) * 10;
    return -50 - (oppTeamTricks - myTeamTricks) * 10;
  }

  /**
   * Main Entry: Evaluates vetted candidate cards using 80-150 Monte Carlo rollouts.
   * Returns the best candidate with the highest expected reward.
   */
  public static evaluateCandidates(
    candidates: Card[],
    botPlayerId: string,
    myHand: Card[],
    publicState: PublicGameState,
    secretTrumpSuit?: Suit | null,
    rolloutIterations: number = 100
  ): Card {
    if (candidates.length <= 1) return candidates[0];

    const voidMatrix = CardTracker.getVoidMatrix(publicState);
    const activeTrumpSuit = publicState.isTrumpRevealed
      ? publicState.trumpSuit
      : secretTrumpSuit || null;

    const candidateScores = new Map<string, number>();
    for (const c of candidates) candidateScores.set(c.id, 0);

    for (let iter = 0; iter < rolloutIterations; iter++) {
      // Determinize one consistent world
      const worldHands = this.generateConsistentWorld(
        publicState,
        botPlayerId,
        myHand,
        voidMatrix,
        secretTrumpSuit
      );

      for (const card of candidates) {
        const score = this.simulateRollout(
          publicState,
          botPlayerId,
          myHand,
          card,
          worldHands,
          activeTrumpSuit
        );
        candidateScores.set(card.id, (candidateScores.get(card.id) || 0) + score);
      }
    }

    // Pick candidate with the highest average score
    let bestCard = candidates[0];
    let bestScore = -Infinity;

    for (const card of candidates) {
      const avgScore = (candidateScores.get(card.id) || 0) / rolloutIterations;
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestCard = card;
      }
    }

    return bestCard;
  }
}
