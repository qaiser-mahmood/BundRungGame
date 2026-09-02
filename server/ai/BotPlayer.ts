import { Card, Suit, Player, PublicGameState, PrivatePlayerState, Trick, PlayedCard } from '../../shared/types';
import { BundRungEngine } from '../engine/BundRungEngine';
import { ModelManager } from './neural/ModelManager';
import { StateVectorizer } from './neural/StateVectorizer';
import { LiveLearningEngine } from './neural/LiveLearningEngine';

export class BotPlayer {
  /**
   * Set to true in live games to activate autonomous learned neural policy
   */
  public static useNeuralPolicy: boolean = false;

  // --- Master AI Card Counting & Memory Helpers ---

  /**
   * Returns all cards that have been played so far in completed tricks and the active trick.
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
   * Returns a list of suits that the partner has led in previous completed tricks.
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
   * Checks if a card is currently the "Boss" card of its suit (highest remaining unplayed card in the game).
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
   * Infers which players are void in which suits based on past reneges/off-suit plays.
   */
  public static inferPlayerVoids(publicState: PublicGameState): Map<string, Set<Suit>> {
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
   * Evaluates who is currently winning the trick, whether teammate is winning, and how many opponents are yet to play.
   */
  public static evaluateCurrentTrick(
    trick: Trick,
    activeTrumpSuit: Suit | null,
    myPlayerId: string,
    players: Player[]
  ): {
    winningCard: PlayedCard | null;
    winningPlayer: Player | null;
    isPartnerWinning: boolean;
    isOpponentWinning: boolean;
    opponentsLeftToPlay: number;
  } {
    if (trick.cards.length === 0 || !trick.leadSuit) {
      return {
        winningCard: null,
        winningPlayer: null,
        isPartnerWinning: false,
        isOpponentWinning: false,
        opponentsLeftToPlay: 0,
      };
    }

    const leadSuit = trick.leadSuit;
    const getCardPower = (pc: PlayedCard) => (pc.isAceDowngraded ? 2 : pc.card.playValue);

    let winningCard: PlayedCard = trick.cards[0];
    let highestPower = getCardPower(winningCard);

    for (let i = 1; i < trick.cards.length; i++) {
      const cand = trick.cards[i];
      const candPower = getCardPower(cand);

      const winIsTrump = activeTrumpSuit && winningCard.card.suit === activeTrumpSuit;
      const candIsTrump = activeTrumpSuit && cand.card.suit === activeTrumpSuit;

      if (candIsTrump && !winIsTrump) {
        winningCard = cand;
        highestPower = candPower;
      } else if (candIsTrump && winIsTrump) {
        if (candPower > highestPower) {
          winningCard = cand;
          highestPower = candPower;
        }
      } else if (!candIsTrump && !winIsTrump) {
        if (cand.card.suit === leadSuit && candPower > highestPower) {
          winningCard = cand;
          highestPower = candPower;
        }
      }
    }

    const me = players.find((p) => p.id === myPlayerId);
    const winningPlayer = players.find((p) => p.id === winningCard.playerId) || null;
    const isPartnerWinning = Boolean(me && winningPlayer && winningPlayer.team === me.team && winningPlayer.id !== myPlayerId);
    const isOpponentWinning = Boolean(me && winningPlayer && winningPlayer.team !== me.team);

    const playedPlayerIds = new Set(trick.cards.map((c) => c.playerId));
    playedPlayerIds.add(myPlayerId);
    const opponentsLeftToPlay = players.filter((p) => me && p.team !== me.team && !playedPlayerIds.has(p.id)).length;

    return {
      winningCard,
      winningPlayer,
      isPartnerWinning,
      isOpponentWinning,
      opponentsLeftToPlay,
    };
  }

  /**
   * Calculates High-Card Points (HCP): A=4, K=3, Q=2, J=1, 10=0.5
   */
  public static calculateHCP(cards: Card[]): number {
    let pts = 0;
    for (const c of cards) {
      if (c.rank === 'A') pts += 4;
      else if (c.rank === 'K') pts += 3;
      else if (c.rank === 'Q') pts += 2;
      else if (c.rank === 'J') pts += 1;
      else if (c.rank === '10') pts += 0.5;
    }
    return pts;
  }

  // --- Main Turn Handler ---

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

    // 2. Pre-deal shuffle / offer cut / distribute 5 cards (if dealer is bot)
    if (phase === 'PRE_DEAL_SHUFFLE' && player.isDealer) {
      if (publicState.cutDone) {
        engine.dealerDistribute5Cards(botPlayerId);
      } else {
        const shuffleClicks = Math.floor(Math.random() * 2);
        for (let i = 0; i < shuffleClicks; i++) {
          engine.dealerShuffle(botPlayerId);
        }
        engine.dealerOfferCut(botPlayerId);
      }
      return;
    }

    // 3. Pre-deal cut (if bot is the cut offer recipient)
    if (phase === 'PRE_DEAL_CUT' && publicState.cutOfferPlayerId === botPlayerId) {
      const cutIndex = 10 + Math.floor(Math.random() * 30);
      engine.performCut(botPlayerId, cutIndex);
      return;
    }

    // 4. Bidding phase (5 cards) — Master Evaluation with Multi-Ace Synergy
    if (phase === 'BIDDING_PHASE' && publicState.biddingTurnPlayerId === botPlayerId) {
      const hand = privateState.myHand;
      const suitCounts: Record<Suit, Card[]> = {
        HEARTS: [],
        DIAMONDS: [],
        CLUBS: [],
        SPADES: [],
      };

      for (const card of hand) {
        suitCounts[card.suit].push(card);
      }

      let bestSuit: Suit = 'SPADES';
      let highestSuitScore = -1;

      for (const [s, cards] of Object.entries(suitCounts)) {
        const suit = s as Suit;
        const hcp = BotPlayer.calculateHCP(cards);
        const count = cards.length;
        const score = count * 3 + hcp * 2.5;
        if (score > highestSuitScore) {
          highestSuitScore = score;
          bestSuit = suit;
        }
      }

      const bestSuitCards = suitCounts[bestSuit];
      bestSuitCards.sort((a, b) => b.playValue - a.playValue);
      const chosenCard = bestSuitCards[0] || hand[0];
      const bestCount = bestSuitCards.length;
      const bestHCP = BotPlayer.calculateHCP(bestSuitCards);
      const totalAces = hand.filter((c) => c.rank === 'A').length;

      const isLastBidder = publicState.biddingPassCount === 3;
      const isRungAlreadyChosen = publicState.trumpMode === 'CLOSE_TRUMP';

      if (isRungAlreadyChosen) {
        // Multi-Ace partnership gamble or strong 4+ cards with top honors
        if ((bestCount >= 4 && bestHCP >= 5) || (bestCount >= 4 && totalAces >= 2)) {
          engine.submitBid(botPlayerId, 'BWINJI', chosenCard?.id || bestSuit);
        } else {
          engine.submitBid(botPlayerId, 'PASS');
        }
        return;
      }

      // No Rung chosen yet:
      if ((bestCount >= 4 && bestHCP >= 4) || bestCount >= 5 || (bestCount >= 4 && totalAces >= 2)) {
        engine.submitBid(botPlayerId, 'BWINJI', chosenCard?.id || bestSuit);
      } else if (bestCount >= 3 || bestHCP >= 6 || totalAces >= 2 || isLastBidder) {
        engine.submitBid(botPlayerId, 'SELECT_CARD_TRUMP', chosenCard?.id || bestSuit);
      } else {
        engine.submitBid(botPlayerId, 'PASS');
      }
      return;
    }

    // 5. Respond to face-down Open Rung challenge (if pending and bot is on defending team)
    if (publicState.faceDownLeadPending && publicState.faceDownLeadPlayerId) {
      const caller = engine.getPlayers().find((p) => p.id === publicState.faceDownLeadPlayerId);
      if (caller && player.team !== caller.team) {
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

    // 7. Trick Playing — Master Strategy
    if (phase === 'TRICK_PLAYING' && publicState.currentTurnPlayerId === botPlayerId && !publicState.faceDownLeadPending) {
      // If Rung is unrevealed and bot has no cards of the lead suit, evaluate asking for reveal
      if (!publicState.isTrumpRevealed && privateState.canRequestRungReveal) {
        const myHand = privateState.myHand;
        const hcp = BotPlayer.calculateHCP(myHand);
        const trick = publicState.currentTrick;
        const isOpponentWinningWithAce = trick.cards.some((c) => c.card.rank === 'A' && c.playerId !== botPlayerId);
        if (hcp >= 4 || isOpponentWinningWithAce || publicState.currentTrick.trickNumber >= 3) {
          engine.requestTrumpReveal(botPlayerId);
          return;
        }
      }

      const legalCardIds = privateState.legalPlayableCardIds;
      if (legalCardIds.length === 0) return;

      const allCards = privateState.myTrumpCard && privateState.isMyTrumpCardPlayable
        ? [...privateState.myHand, privateState.myTrumpCard]
        : privateState.myHand;

      const legalCards = allCards.filter((c) => legalCardIds.includes(c.id));
      if (legalCards.length === 0) return;

      const chosenCard = BotPlayer.chooseMasterCard(
        engine,
        botPlayerId,
        legalCards,
        allCards,
        publicState,
        privateState
      );

      if (BotPlayer.useNeuralPolicy) {
        LiveLearningEngine.onBeforeCardPlayed(engine, (engine as any).roomId || 'main_room', botPlayerId, chosenCard.id);
        engine.playCard(botPlayerId, chosenCard.id);
        LiveLearningEngine.onAfterCardPlayed(engine, (engine as any).roomId || 'main_room');
      } else {
        engine.playCard(botPlayerId, chosenCard.id);
      }
    }
  }

  /**
   * Master Card Decision Engine
   */
  public static chooseMasterCard(
    engine: BundRungEngine,
    botPlayerId: string,
    legalCards: Card[],
    myHand: Card[],
    publicState: PublicGameState,
    privateState: PrivatePlayerState
  ): Card {
    const players = engine.getPlayers();
    const me = players.find((p) => p.id === botPlayerId)!;

    // --- Autonomous Neural AI Inference ---
    if (BotPlayer.useNeuralPolicy && legalCards.length > 1) {
      const neuralBrain = ModelManager.getModel();
      if (neuralBrain) {
        try {
          const stateVector = StateVectorizer.vectorize(publicState, privateState, botPlayerId, players);
          const legalIndices = legalCards.map((c) => StateVectorizer.cardToIndex(c));
          const chosenAction = neuralBrain.selectAction(stateVector, legalIndices, 0.0);
          const chosenCardInfo = StateVectorizer.indexToCard(chosenAction);
          const matched = legalCards.find((c) => c.suit === chosenCardInfo.suit && c.rank === chosenCardInfo.rank);
          if (matched) {
            console.log(`🧠 [Neural AI Brain] ${me.name} (${me.team}): Evaluated 183 features -> Played ${matched.rank} of ${matched.suit}`);
            return matched;
          }
        } catch (err) {
          // Gracefully falls back to heuristic rules
        }
      }
    }
    const partner = players.find((p) => p.team === me.team && p.id !== me.id);
    const partnerId = partner?.id || '';
    const trick = publicState.currentTrick;
    const playedCards = BotPlayer.getPlayedCards(publicState);
    const voids = BotPlayer.inferPlayerVoids(publicState);
    const activeTrumpSuit = publicState.isTrumpRevealed ? publicState.trumpSuit : null;
    const partnerLedSuits = BotPlayer.getPartnerLedSuits(publicState, partnerId);
    const isPartnerOpenRungCaller = Boolean(
      partnerId &&
      publicState.trumpCallerPlayerId === partnerId &&
      publicState.trumpMode === 'OPEN_TRUMP'
    );

    // --- CASE 1: Bot is LEADING the trick (0 cards played) ---
    if (trick.cards.length === 0 || !trick.leadSuit) {
      const isCaller = me.id === publicState.trumpCallerPlayerId;
      const isCallerTeam = isCaller || (partnerId === publicState.trumpCallerPlayerId);
      const secretTrumpSuit = privateState.secretTrumpSuit;

      const isHunting2Streak =
        publicState.isTrumpRevealed &&
        publicState.currentTrick.trickNumber >= 2 &&
        (publicState.lastTrickWinnerPlayerId === botPlayerId || publicState.lastTrickWinnerPlayerId === partnerId);

      const isDefendingOpponentStreak =
        publicState.isTrumpRevealed &&
        publicState.currentTrick.trickNumber >= 2 &&
        publicState.lastTrickWinnerPlayerId !== null &&
        publicState.lastTrickWinnerPlayerId !== botPlayerId &&
        publicState.lastTrickWinnerPlayerId !== partnerId;

      const didIWinLastTrickWithAce =
        publicState.lastTrickWinnerPlayerId === botPlayerId &&
        publicState.lastTrickWinningCard?.rank === 'A';

      // 1. Filter out Aces if consecutive Ace downgrade would trigger
      let eligibleLeadCards = legalCards;
      if (didIWinLastTrickWithAce) {
        const nonAces = legalCards.filter((c) => c.rank !== 'A');
        if (nonAces.length > 0) {
          eligibleLeadCards = nonAces;
        }
      }

      // 2. Offense: Hunting 2-Streak Bund Victory! (When Rung is revealed)
      if (isHunting2Streak) {
        const bossAces = eligibleLeadCards.filter((c) => c.rank === 'A' && c.suit !== activeTrumpSuit);
        if (bossAces.length > 0) return bossAces[0];

        if (activeTrumpSuit) {
          const trumpCards = eligibleLeadCards.filter((c) => c.suit === activeTrumpSuit);
          if (trumpCards.length > 0) {
            trumpCards.sort((a, b) => b.playValue - a.playValue);
            return trumpCards[0];
          }
        }

        const bossCards = eligibleLeadCards.filter((c) => BotPlayer.isBossCard(c, playedCards, myHand));
        if (bossCards.length > 0) {
          bossCards.sort((a, b) => b.playValue - a.playValue);
          return bossCards[0];
        }

        eligibleLeadCards.sort((a, b) => b.playValue - a.playValue);
        return eligibleLeadCards[0];
      }

      // 3. Defense: Break Opponent Streak! (When Rung is revealed)
      if (isDefendingOpponentStreak) {
        const bossCards = eligibleLeadCards.filter((c) => BotPlayer.isBossCard(c, playedCards, myHand));
        if (bossCards.length > 0) {
          bossCards.sort((a, b) => b.playValue - a.playValue);
          return bossCards[0];
        }

        if (activeTrumpSuit) {
          const trumpCards = eligibleLeadCards.filter((c) => c.suit === activeTrumpSuit);
          if (trumpCards.length > 0) {
            trumpCards.sort((a, b) => b.playValue - a.playValue);
            return trumpCards[0];
          }
        }
      }

      // 4. Partner Loyalty (Open Rung caller support):
      // "If your partner has called open rung then you should follow partner like return his suit tricks whenever you win the trick"
      if (isPartnerOpenRungCaller && activeTrumpSuit) {
        // A. Return partner's established lead suit
        for (const suit of partnerLedSuits) {
          const cardsInPartnerSuit = eligibleLeadCards.filter((c) => c.suit === suit);
          if (cardsInPartnerSuit.length > 0) {
            cardsInPartnerSuit.sort((a, b) => a.playValue - b.playValue);
            return cardsInPartnerSuit[0];
          }
        }
        // B. Lead small card in partner's Open Trump suit
        const trumpCards = eligibleLeadCards.filter((c) => c.suit === activeTrumpSuit);
        if (trumpCards.length > 0) {
          trumpCards.sort((a, b) => a.playValue - b.playValue);
          return trumpCards[0];
        }
      }

      // 5. Cross-Ruff Partner: Lead low card in suit where partner is known to be void
      if (activeTrumpSuit && partnerId && voids.get(partnerId)) {
        const partnerVoids = voids.get(partnerId)!;
        for (const suit of Array.from(partnerVoids)) {
          if (suit !== activeTrumpSuit) {
            const cardsInPartnerVoidSuit = eligibleLeadCards.filter((c) => c.suit === suit);
            if (cardsInPartnerVoidSuit.length > 0) {
              cardsInPartnerVoidSuit.sort((a, b) => a.playValue - b.playValue);
              return cardsInPartnerVoidSuit[0];
            }
          }
        }
      }

      // 6. Return Partner's Established Suit (When weak/holding 1-2 cards in partner's suit):
      // "if you are weak and not holding a lot of that suit cards then you can return the play with the partner suit so he can get rid of his weak cards"
      for (const pSuit of partnerLedSuits) {
        if (pSuit !== activeTrumpSuit) {
          const cardsInPSuit = eligibleLeadCards.filter((c) => c.suit === pSuit);
          if (cardsInPSuit.length > 0 && cardsInPSuit.length <= 2) {
            cardsInPSuit.sort((a, b) => a.playValue - b.playValue);
            return cardsInPSuit[0];
          }
        }
      }

      // 7. Ace Follow-Through / Big Honor Extraction:
      // "If you have played ace of a suit and you know other big cards of the suit are still in opponents hands
      // then you can play the same suit in second turn so others big cards also get on to the table."
      const allSuits: Suit[] = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
      for (const suit of allSuits) {
        const isAcePlayedByMe = publicState.completedTricks.some((t) =>
          t.cards.some((c) => c.playerId === botPlayerId && c.card.suit === suit && c.card.rank === 'A')
        );
        if (isAcePlayedByMe) {
          const honorsStillUnseen = [13, 12, 11].some(
            (pv) =>
              !playedCards.some((c) => c.suit === suit && c.playValue === pv) &&
              !myHand.some((c) => c.suit === suit && c.playValue === pv)
          );
          if (honorsStillUnseen) {
            const myFollowThroughCards = eligibleLeadCards.filter((c) => c.suit === suit);
            if (myFollowThroughCards.length > 0) {
              myFollowThroughCards.sort((a, b) => a.playValue - b.playValue);
              return myFollowThroughCards[0];
            }
          }
        }
      }

      // =========================================================================
      // --- ADVANCED CLOSE RUNG & SUIT LENGTH REVEAL PROBABILITY STRATEGIES ---
      // =========================================================================
      if (!publicState.isTrumpRevealed) {
        // --- Weak Rung Flush-off (Caller only) ---
        if (isCaller && secretTrumpSuit) {
          const myTrumps = myHand.filter((c) => c.suit === secretTrumpSuit);
          const hasTrumpAce = myTrumps.some((c) => c.rank === 'A');
          const isWeakRungHolding = !hasTrumpAce && myTrumps.length <= 5 && myTrumps.length >= 1;

          if (isWeakRungHolding) {
            const secretTrumpLeadCards = eligibleLeadCards.filter((c) => c.suit === secretTrumpSuit);
            if (secretTrumpLeadCards.length > 0) {
              secretTrumpLeadCards.sort((a, b) => b.playValue - a.playValue);
              return secretTrumpLeadCards[0];
            }
          }
        }

        // --- Suit Length vs Rung Reveal Probability ---
        const suitStats = allSuits
          .map((suit) => {
            const playedInSuit = playedCards.filter((c) => c.suit === suit).length;
            const myInSuit = myHand.filter((c) => c.suit === suit);
            const myCards = eligibleLeadCards.filter((c) => c.suit === suit);
            const unseenInOtherHands = 13 - playedInSuit - myInSuit.length;
            const hasAce = myInSuit.some((c) => c.rank === 'A');
            const smallCards = myCards.filter((c) => c.playValue <= 9);

            return {
              suit,
              myCount: myInSuit.length,
              unseenInOtherHands,
              myCards,
              hasAce,
              smallCards,
            };
          })
          .filter((s) => s.myCards.length > 0);

        if (isCallerTeam) {
          // Caller Team: Minimize Rung Reveal Probability
          suitStats.sort((a, b) => {
            const aRisk = a.myCount >= 4 ? 1 : 0;
            const bRisk = b.myCount >= 4 ? 1 : 0;
            if (aRisk !== bRisk) return aRisk - bRisk;
            return b.unseenInOtherHands - a.unseenInOtherHands;
          });

          const chosenSuitStat = suitStats[0];
          if (chosenSuitStat) {
            if (chosenSuitStat.hasAce && chosenSuitStat.smallCards.length > 0) {
              chosenSuitStat.smallCards.sort((a, b) => a.playValue - b.playValue);
              return chosenSuitStat.smallCards[0];
            }
            chosenSuitStat.myCards.sort((a, b) => a.playValue - b.playValue);
            return chosenSuitStat.myCards[0];
          }
        } else {
          // Opponent Team: Maximize Rung Reveal Probability
          suitStats.sort((a, b) => {
            return b.myCount - a.myCount || a.unseenInOtherHands - b.unseenInOtherHands;
          });

          const chosenSuitStat = suitStats[0];
          if (chosenSuitStat) {
            const aces = chosenSuitStat.myCards.filter((c) => c.rank === 'A');
            if (aces.length > 0) return aces[0];
            chosenSuitStat.myCards.sort((a, b) => b.playValue - a.playValue);
            return chosenSuitStat.myCards[0];
          }
        }

        // --- The Ace Gambit ---
        if (isCaller) {
          const myAces = eligibleLeadCards.filter((c) => c.rank === 'A');
          if (myAces.length >= 2) {
            return myAces[0];
          }
        }
      }

      // 8. Standard Master Lead (Rung Revealed or fallback):
      const bossAces = eligibleLeadCards.filter((c) => c.rank === 'A' && c.suit !== activeTrumpSuit);
      if (bossAces.length > 0) return bossAces[0];

      const nonTrumpBossCards = eligibleLeadCards.filter(
        (c) => c.suit !== activeTrumpSuit && BotPlayer.isBossCard(c, playedCards, myHand)
      );
      if (nonTrumpBossCards.length > 0) {
        nonTrumpBossCards.sort((a, b) => b.playValue - a.playValue);
        return nonTrumpBossCards[0];
      }

      const safeLeadCards = eligibleLeadCards.filter((c) => {
        if (!activeTrumpSuit || c.suit === activeTrumpSuit) return true;
        const opponentVoids = players
          .filter((p) => p.team !== me.team)
          .some((opp) => voids.get(opp.id)?.has(c.suit));
        return !opponentVoids;
      });

      const candidatePool = safeLeadCards.length > 0 ? safeLeadCards : eligibleLeadCards;

      const suitLengths: Record<Suit, number> = { HEARTS: 0, DIAMONDS: 0, CLUBS: 0, SPADES: 0 };
      for (const c of myHand) suitLengths[c.suit] += 1;

      candidatePool.sort((a, b) => {
        const lenDiff = suitLengths[b.suit] - suitLengths[a.suit];
        if (lenDiff !== 0) return lenDiff;
        return a.playValue - b.playValue;
      });

      return candidatePool[0];
    }

    // --- CASE 2: Bot is FOLLOWING in the trick ---
    const leadSuit = trick.leadSuit;
    const matchingSuitCards = legalCards.filter((c) => c.suit === leadSuit);
    const evalResult = BotPlayer.evaluateCurrentTrick(trick, activeTrumpSuit, botPlayerId, players);

    // SUB-CASE 2A: Must Follow Lead Suit
    if (matchingSuitCards.length > 0) {
      // 1. If Teammate is currently winning:
      if (evalResult.isPartnerWinning && evalResult.winningCard) {
        // TACTIC: Partner started the suit & Bot is Strong in that suit -> Overtake to change suit & take control!
        // "If you are strong in those suits then you change the suit by playing higher card and taking the control"
        const isPartnerLead = trick.leadPlayerId === partnerId;
        const strongWinningCards = matchingSuitCards.filter(
          (c) => c.playValue > evalResult.winningCard!.card.playValue && (c.rank === 'A' || BotPlayer.isBossCard(c, playedCards, myHand))
        );
        // If bot has strong cards in OTHER suits to lead next, overtake to switch suits!
        const hasOtherStrongSuits = myHand.some((c) => c.suit !== leadSuit && (c.rank === 'A' || c.suit === activeTrumpSuit));
        if (isPartnerLead && strongWinningCards.length > 0 && hasOtherStrongSuits && evalResult.winningCard.card.playValue < 12) {
          strongWinningCards.sort((a, b) => a.playValue - b.playValue);
          return strongWinningCards[0];
        }

        const isPartnerCardUnbeatable =
          evalResult.opponentsLeftToPlay === 0 ||
          BotPlayer.isBossCard(evalResult.winningCard.card, playedCards, myHand) ||
          (activeTrumpSuit && evalResult.winningCard.card.suit === activeTrumpSuit) ||
          evalResult.winningCard.card.rank === 'A';

        if (isPartnerCardUnbeatable) {
          // SLOUGH / DISCARD: Partner has it locked! Throw lowest card in suit.
          matchingSuitCards.sort((a, b) => a.playValue - b.playValue);
          return matchingSuitCards[0];
        }

        // Teammate's card is vulnerable and opponents still have turns:
        // Try to protect with high honor if available, otherwise lowest card
        const highProtectCards = matchingSuitCards.filter(
          (c) => c.playValue > evalResult.winningCard!.card.playValue && c.playValue >= 11
        );
        if (highProtectCards.length > 0) {
          highProtectCards.sort((a, b) => a.playValue - b.playValue);
          return highProtectCards[0];
        }

        matchingSuitCards.sort((a, b) => a.playValue - b.playValue);
        return matchingSuitCards[0];
      }

      // 2. If Opponent is currently winning (or partner is losing):
      if (evalResult.winningCard) {
        const winningPower = evalResult.winningCard.isAceDowngraded ? 2 : evalResult.winningCard.card.playValue;
        const isWinTrump = activeTrumpSuit && evalResult.winningCard.card.suit === activeTrumpSuit;

        if (!isWinTrump) {
          // Opponent winning with lead suit card: find all cards that beat it
          const winningCandidates = matchingSuitCards.filter((c) => c.playValue > winningPower);
          if (winningCandidates.length > 0) {
            // WIN CHEAPLY: Play the lowest card that beats opponent's card!
            winningCandidates.sort((a, b) => a.playValue - b.playValue);
            return winningCandidates[0];
          }
        }

        // Cannot beat opponent: dump lowest card in suit
        matchingSuitCards.sort((a, b) => a.playValue - b.playValue);
        return matchingSuitCards[0];
      }

      matchingSuitCards.sort((a, b) => a.playValue - b.playValue);
      return matchingSuitCards[0];
    }

    // SUB-CASE 2B: Void in Lead Suit (Off-Suit Play)
    // 1. If Rung is revealed:
    if (activeTrumpSuit) {
      const trumpCards = legalCards.filter((c) => c.suit === activeTrumpSuit);
      const nonTrumpCards = legalCards.filter((c) => c.suit !== activeTrumpSuit);

      // Teammate is winning:
      if (evalResult.isPartnerWinning && evalResult.winningCard) {
        const isPartnerCardUnbeatable =
          evalResult.opponentsLeftToPlay === 0 ||
          (evalResult.winningCard.card.suit === activeTrumpSuit && evalResult.winningCard.card.playValue >= 12) ||
          BotPlayer.isBossCard(evalResult.winningCard.card, playedCards, myHand);

        if (isPartnerCardUnbeatable || trumpCards.length === 0) {
          // DISCARD JUNK: Slough lowest non-trump card
          if (nonTrumpCards.length > 0) {
            nonTrumpCards.sort((a, b) => a.playValue - b.playValue);
            return nonTrumpCards[0];
          }
          trumpCards.sort((a, b) => a.playValue - b.playValue);
          return trumpCards[0];
        }

        // Partner vulnerable: trump with lowest trump
        trumpCards.sort((a, b) => a.playValue - b.playValue);
        return trumpCards[0];
      }

      // Opponent is winning:
      if (evalResult.winningCard) {
        const isOpponentTrump = evalResult.winningCard.card.suit === activeTrumpSuit;
        const winningPower = evalResult.winningCard.isAceDowngraded ? 2 : evalResult.winningCard.card.playValue;

        if (isOpponentTrump) {
          // Opponent already trumped: over-trump if possible!
          const overTrumps = trumpCards.filter((c) => c.playValue > winningPower);
          if (overTrumps.length > 0) {
            overTrumps.sort((a, b) => a.playValue - b.playValue); // cheap over-trump
            return overTrumps[0];
          }
        } else {
          // Opponent has non-trump: cheap ruff!
          if (trumpCards.length > 0) {
            trumpCards.sort((a, b) => a.playValue - b.playValue);
            return trumpCards[0];
          }
        }

        // Cannot win: discard lowest non-trump junk card
        if (nonTrumpCards.length > 0) {
          nonTrumpCards.sort((a, b) => a.playValue - b.playValue);
          return nonTrumpCards[0];
        }
      }
    }

    // Default fallback: play lowest card in legalCards
    legalCards.sort((a, b) => a.playValue - b.playValue);
    return legalCards[0];
  }
}
