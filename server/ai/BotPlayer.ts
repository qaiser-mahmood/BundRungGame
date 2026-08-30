import { Card, Suit, Player, FullClientGameState } from '../../shared/types';
import { BundRungEngine } from '../engine/BundRungEngine';

export class BotPlayer {
  public static handleBotTurn(engine: BundRungEngine, botPlayerId: string): void {
    const player = engine.getPlayers().find((p) => p.id === botPlayerId);
    if (!player || !player.isBot) return;

    const phase = engine.getPhase();
    const publicState = engine.getPublicState();
    const privateState = engine.getPrivateState(botPlayerId);

    // 1. Initial Toss & Tie-Breaker
    if (phase === 'INITIAL_TOSS' || phase === 'TOSS_TIE_BREAKER') {
      const remainingCount = publicState.tossCardsRemaining;
      const isEligible = publicState.tiedPlayerIds.includes(botPlayerId);
      const alreadyDrawn = publicState.tossDrawnThisRound?.[botPlayerId];
      if (remainingCount > 0 && isEligible && !alreadyDrawn) {
        const randomIndex = Math.floor(Math.random() * remainingCount);
        engine.drawTossCard(botPlayerId, randomIndex);
      }
      return;
    }

    // 2. Pre-deal shuffle / offer cut (if dealer is bot)
    if (phase === 'PRE_DEAL_SHUFFLE' && player.isDealer) {
      engine.dealerShuffle(botPlayerId);
      engine.dealerOfferCut(botPlayerId);
      return;
    }

    // 3. Pre-deal cut (if bot is the cut offer recipient)
    if (phase === 'PRE_DEAL_CUT' && publicState.cutOfferPlayerId === botPlayerId) {
      // Pick a random card index to cut the deck (between 10 and 42)
      const cutIndex = 10 + Math.floor(Math.random() * 30);
      engine.performCut(botPlayerId, cutIndex);
      return;
    }

    // 4. Bidding phase (5 cards)
    if (phase === 'BIDDING_PHASE' && publicState.biddingTurnPlayerId === botPlayerId) {
      const hand = privateState.myHand;
      const suitCounts: Record<Suit, number> = {
        HEARTS: 0,
        DIAMONDS: 0,
        CLUBS: 0,
        SPADES: 0,
      };

      for (const card of hand) {
        suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
      }

      let bestSuit: Suit = 'SPADES';
      let maxCount = 0;
      for (const [s, count] of Object.entries(suitCounts)) {
        if (count > maxCount) {
          maxCount = count;
          bestSuit = s as Suit;
        }
      }

      // Pick the strongest card of the best suit
      const cardsOfBestSuit = hand.filter((c) => c.suit === bestSuit);
      cardsOfBestSuit.sort((a, b) => b.playValue - a.playValue);
      const chosenCard = cardsOfBestSuit[0] || hand[0];

      const isLastBidder = publicState.biddingPassCount === 3;
      const isRungAlreadyChosen = publicState.trumpMode === 'CLOSE_TRUMP';

      if (isRungAlreadyChosen) {
        // A player already selected a Secret Rung card: bot can only Call BWINJI or Pass
        if (maxCount >= 4) {
          // Strong 4+ cards of a suit: Call BWINJI to override!
          engine.submitBid(botPlayerId, 'BWINJI', chosenCard?.id || bestSuit);
        } else {
          // Decline Bwinji challenge and Pass
          engine.submitBid(botPlayerId, 'PASS');
        }
        return;
      }

      // No Rung chosen yet:
      if (maxCount >= 4) {
        // Strong 4+ cards: declare BWINJI
        engine.submitBid(botPlayerId, 'BWINJI', chosenCard?.id || bestSuit);
      } else if (maxCount >= 3 || isLastBidder) {
        // 3 cards of a suit or forced dealer: select Secret Rung Card
        engine.submitBid(botPlayerId, 'SELECT_CARD_TRUMP', chosenCard?.id || bestSuit);
      } else {
        // Weak hand (less than 3 in any suit): Pass to next player
        engine.submitBid(botPlayerId, 'PASS');
      }
      return;
    }

    // 5. Respond to face-down Open Rung challenge (if pending and bot is on defending team)
    if (publicState.faceDownLeadPending && publicState.faceDownLeadPlayerId) {
      const caller = engine.getPlayers().find((p) => p.id === publicState.faceDownLeadPlayerId);
      if (caller && player.team !== caller.team) {
        // Bot accepts challenge to play
        engine.respondToFaceDownRung(botPlayerId, true);
        return;
      }
    }

    // 6. Rung Reveal Actions
    if (privateState.canShowTrump) {
      engine.showTrumpCard(botPlayerId);
      return;
    }

    if (publicState.isRungRevealPaused || publicState.isTrumpRevealPending) {
      return;
    }

    // 7. Trick playing
    if (phase === 'TRICK_PLAYING' && publicState.currentTurnPlayerId === botPlayerId && !publicState.faceDownLeadPending) {
      // If Rung is unrevealed and bot has no cards of the lead suit, bot asks to reveal Rung!
      if (!publicState.isTrumpRevealed && privateState.canRequestRungReveal) {
        engine.requestTrumpReveal(botPlayerId);
        return;
      }

      const legalCardIds = privateState.legalPlayableCardIds;
      if (legalCardIds.length === 0) return;

      const allCards = privateState.myTrumpCard && privateState.isMyTrumpCardPlayable
        ? [...privateState.myHand, privateState.myTrumpCard]
        : privateState.myHand;

      const legalCards = allCards.filter((c) => legalCardIds.includes(c.id));
      if (legalCards.length === 0) return;

      const trick = publicState.currentTrick;

      // Smart Card Choice Strategy
      let chosenCard: Card;

      if (trick.cards.length === 0) {
        // Leading trick: Lead highest non-trump card or Ace if available
        const aces = legalCards.filter((c) => c.rank === 'A');
        if (aces.length > 0) {
          chosenCard = aces[0];
        } else {
          // Play highest card in hand
          chosenCard = legalCards.reduce((prev, curr) =>
            curr.playValue > prev.playValue ? curr : prev
          );
        }
      } else {
        // Following trick
        const leadSuit = trick.leadSuit;
        const matchingSuitCards = legalCards.filter((c) => c.suit === leadSuit);

        if (matchingSuitCards.length > 0) {
          // Must follow suit: play highest if we can win, or lowest to conserve
          const currentWinningCard = trick.cards.reduce((prev, curr) =>
            curr.card.suit === leadSuit && curr.card.playValue > prev.card.playValue ? curr : prev
          );

          const winningCandidates = matchingSuitCards.filter(
            (c) => c.playValue > currentWinningCard.card.playValue
          );

          if (winningCandidates.length > 0) {
            // Play lowest winning card
            chosenCard = winningCandidates.reduce((prev, curr) =>
              curr.playValue < prev.playValue ? curr : prev
            );
          } else {
            // Cannot win: play lowest card in suit
            chosenCard = matchingSuitCards.reduce((prev, curr) =>
              curr.playValue < prev.playValue ? curr : prev
            );
          }
        } else {
          // Off suit: trump if revealed and available, or throw lowest card
          const trumpCards = publicState.isTrumpRevealed && publicState.trumpSuit
            ? legalCards.filter((c) => c.suit === publicState.trumpSuit)
            : [];

          if (trumpCards.length > 0) {
            chosenCard = trumpCards.reduce((prev, curr) =>
              curr.playValue < prev.playValue ? curr : prev
            );
          } else {
            // Throw lowest value card
            chosenCard = legalCards.reduce((prev, curr) =>
              curr.playValue < prev.playValue ? curr : prev
            );
          }
        }
      }

      engine.playCard(botPlayerId, chosenCard.id);
    }
  }
}
