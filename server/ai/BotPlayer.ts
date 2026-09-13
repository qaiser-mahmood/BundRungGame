import { Card, Suit, Player, PublicGameState, PrivatePlayerState, Trick, PlayedCard } from '../../shared/types';
import { BundRungEngine } from '../engine/BundRungEngine';
import { ModelManager } from './neural/ModelManager';
import { StateVectorizer } from './neural/StateVectorizer';
import { LiveLearningEngine } from './neural/LiveLearningEngine';
import { CardTracker } from './planning/CardTracker';
import { MonteCarloPlanner } from './planning/MonteCarloPlanner';
import { DynamicSuitEvaluator } from './planning/DynamicSuitEvaluator';

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

    // 4. Bidding phase (5 cards) — Dynamic 13-Weight Rank Scaling & Threshold Optimization
    if (phase === 'BIDDING_PHASE' && publicState.biddingTurnPlayerId === botPlayerId) {
      const hand = privateState.myHand;
      const isLastBidder = publicState.biddingPassCount === 3;
      const isRungAlreadyChosen = publicState.trumpMode === 'CLOSE_TRUMP';

      const decision = DynamicSuitEvaluator.evaluateBidding(hand, isLastBidder, isRungAlreadyChosen);

      if (decision.action === 'BWINJI') {
        engine.submitBid(botPlayerId, 'BWINJI', decision.chosenCard?.id || decision.bestSuit);
      } else if (decision.action === 'SELECT_CARD_TRUMP') {
        engine.submitBid(botPlayerId, 'SELECT_CARD_TRUMP', decision.chosenCard?.id || decision.bestSuit);
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
        const players = engine.getPlayers();
        const callerId = publicState.trumpCallerPlayerId;
        const caller = players.find((p) => p.id === callerId);
        const me = players.find((p) => p.id === botPlayerId);
        const isOpponentCaller = caller && me && caller.team !== me.team;

        if (isOpponentCaller) {
          // MISSION 1: Opponent called Trump! EXPOSE IT IMMEDIATELY!
          console.log(`🎯 [Strategic Intent] ${player.name} (${player.team}): EXPOSING OPPONENT TRUMP! Requesting reveal.`);
          engine.requestTrumpReveal(botPlayerId);
          return;
        } else {
          // MISSION 2: Our team called Trump! PROTECT IT!
          // Only reveal if opponent is about to win trick with an unchallengeable Ace or high honor
          const trick = publicState.currentTrick;
          const isOpponentWinningWithAce = trick.cards.some((c) => c.card.rank === 'A' && c.playerId !== botPlayerId);
          if (isOpponentWinningWithAce) {
            console.log(`🛡️ [Strategic Intent] ${player.name} (${player.team}): Opponent winning with Ace, revealing trump to cut!`);
            engine.requestTrumpReveal(botPlayerId);
            return;
          }
          // Otherwise do not reveal; keep it secret!
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
   * Evaluates multiple tactically-vetted candidate cards.
   * If Neural Policy is enabled, scores only these safe candidate cards using the Dueling DQN.
   * Otherwise defaults to the highest/first vetted candidate.
   */
  public static pickBestFromCandidates(
    candidates: Card[],
    publicState: PublicGameState,
    privateState: PrivatePlayerState,
    botPlayerId: string,
    players: Player[],
    myHand: Card[] = [],
    secretTrumpSuit?: Suit | null
  ): Card {
    if (candidates.length <= 1) return candidates[0];

    // --- 1. Deep Monte Carlo Planning & Rollout Simulation ---
    try {
      const bestMctsCard = MonteCarloPlanner.evaluateCandidates(
        candidates,
        botPlayerId,
        myHand.length > 0 ? myHand : privateState.myHand,
        publicState,
        secretTrumpSuit,
        100 // 100 deep multi-trick rollouts
      );
      if (bestMctsCard) return bestMctsCard;
    } catch (e) {
      // Graceful fallback
    }

    if (BotPlayer.useNeuralPolicy) {
      const neuralBrain = ModelManager.getModel();
      if (neuralBrain) {
        try {
          const stateVector = StateVectorizer.vectorize(publicState, privateState, botPlayerId, players);
          const candidateIndices = candidates.map((c) => StateVectorizer.cardToIndex(c));
          const chosenAction = neuralBrain.selectAction(stateVector, candidateIndices, 0.0);
          const chosenCardInfo = StateVectorizer.indexToCard(chosenAction);
          const matched = candidates.find((c) => c.suit === chosenCardInfo.suit && c.rank === chosenCardInfo.rank);
          if (matched) return matched;
        } catch (err) {
          // Gracefully falls back
        }
      }
    }

    return candidates[0];
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
      const secretTrumpSuit = privateState.secretTrumpSuit || (isCaller ? ((engine as any).trumpSuit || publicState.trumpSuit) : null);

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

      // 1. Filter out Aces if consecutive Ace downgrade would trigger (STRICT INVARIANT)
      let eligibleLeadCards = legalCards;
      if (didIWinLastTrickWithAce) {
        const nonAces = legalCards.filter((c) => c.rank !== 'A');
        if (nonAces.length > 0) {
          eligibleLeadCards = nonAces;
        }
      }

      // 2. Universal Ace of Rung Protection (STRICT INVARIANT across all modes & seats):
      // If ANY player holds the Ace of Rung (and Rung is revealed or caller holds it in Close Rung),
      // they MUST NEVER lead a Rung card if they have ANY non-trump card in hand!
      const knownTrumpSuit = publicState.isTrumpRevealed ? publicState.trumpSuit : (isCaller ? secretTrumpSuit : null);
      if (knownTrumpSuit) {
        const hasAceOfRung = myHand.some((c) => c.suit === knownTrumpSuit && c.rank === 'A');
        const nonTrumpLeads = eligibleLeadCards.filter((c) => c.suit !== knownTrumpSuit);
        if (hasAceOfRung && nonTrumpLeads.length > 0) {
          eligibleLeadCards = nonTrumpLeads;
        }
      }

      // =========================================================================
      // --- PHASE 1: CLOSE RUNG (UNREVEALED TRUMP) - TWO OPPOSING STRATEGIES ---
      // =========================================================================
      if (!publicState.isTrumpRevealed) {
        if (isCallerTeam) {
          // =======================================================================
          // STRATEGIC MISSION: STOP RUNG FROM OPENING (PROTECT THE SECRET TRUMP)
          // "When you are stopping it to open then it should not return partner's suit"
          // =======================================================================

          // 1. Master Trump Lead & Quarantine Rule (Caller with/without Ace of Rung):
          // User Requirement:
          // - If caller holds the Ace of Rung: Quarantine active! Do NOT lead trump early; preserve it to control the endgame.
          // - If caller DOES NOT hold the Ace of Rung:
          //   Start with the Rung suit to flush opponents' Ace of Rung out of the game early!
          if (isCaller && secretTrumpSuit) {
            const myTrumps = myHand.filter((c) => c.suit === secretTrumpSuit);
            const hasTrumpAce = myTrumps.some((c) => c.rank === 'A');
            const nonTrumpHandCards = myHand.filter((c) => c.suit !== secretTrumpSuit);

            // If caller has NO off-suit cards at all, it must lead trump
            if (nonTrumpHandCards.length === 0) {
              const trumpLead = eligibleLeadCards.filter((c) => c.suit === secretTrumpSuit);
              if (trumpLead.length > 0) {
                trumpLead.sort((a, b) => b.playValue - a.playValue);
                return BotPlayer.pickBestFromCandidates(trumpLead, publicState, privateState, botPlayerId, players);
              }
            }

            // When Caller DOES NOT hold the Ace of Trump:
            // "if the ai has called the rung ... it should start with rung card if it does not hold the ace of rung"
            if (!hasTrumpAce && myTrumps.length >= 1) {
              const trumpLead = eligibleLeadCards.filter((c) => c.suit === secretTrumpSuit);
              if (trumpLead.length > 0) {
                trumpLead.sort((a, b) => a.playValue - b.playValue); // Start with smaller/mid trump to draw out Ace
                return BotPlayer.pickBestFromCandidates(trumpLead, publicState, privateState, botPlayerId, players);
              }
            }
          }

          // 2. Minimize Rung Reveal Risk & Under-lead Ace+Smalls:
          // In Close Rung, if caller holds an outside Ace with small cards (e.g. Ace + 4 + 2),
          // under-lead a small card (<=9) to clear weak cards and preserve the Ace stopper!
          // If holding a singleton Ace or Ace with only high honors, cash the Ace directly.
          // Lead suits where others have plenty of unseen cards, strictly avoiding partner's suits AND secret trump suit
          const safeOffSuits = (['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'] as Suit[]).filter(
            (s) => s !== secretTrumpSuit && !partnerLedSuits.includes(s)
          );
          const candidateSuits = safeOffSuits.some((s) => eligibleLeadCards.some((c) => c.suit === s))
            ? safeOffSuits
            : (['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'] as Suit[]).filter((s) => s !== secretTrumpSuit);

          const suitStats = candidateSuits
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

          if (suitStats.length > 0) {
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
                return BotPlayer.pickBestFromCandidates(chosenSuitStat.smallCards, publicState, privateState, botPlayerId, players);
              }
              chosenSuitStat.myCards.sort((a, b) => a.playValue - b.playValue);
              return BotPlayer.pickBestFromCandidates(chosenSuitStat.myCards, publicState, privateState, botPlayerId, players);
            }
          }

          // 4. Fallback for caller: any non-trump card in eligible leads
          const nonTrumpLeads = eligibleLeadCards.filter((c) => !secretTrumpSuit || c.suit !== secretTrumpSuit);
          if (nonTrumpLeads.length > 0) {
            nonTrumpLeads.sort((a, b) => a.playValue - b.playValue);
            return BotPlayer.pickBestFromCandidates(nonTrumpLeads, publicState, privateState, botPlayerId, players);
          }
        } else {
          // =======================================================================
          // STRATEGIC MISSION: OPEN THE RUNG (EXPOSE OPPONENTS' TRUMP)
          // =======================================================================

          // 1. Remember and Return Partner's Void-Fishing / Initiated Suit from Past Tricks
          // "For example if one ai has won the trick and played a suit that it thinks the can void it to reaveal the rung
          // then the partner ai should return that trick whenever they won the trick"
          const partnerAttackedSuits: Suit[] = [];
          for (let i = publicState.completedTricks.length - 1; i >= 0; i--) {
            const t = publicState.completedTricks[i];
            if (t.leadPlayerId === partnerId && t.leadSuit) {
              const wasAfterPartnerWin = i === 0 || publicState.completedTricks[i - 1]?.winnerPlayerId === partnerId;
              if (wasAfterPartnerWin && !partnerAttackedSuits.includes(t.leadSuit)) {
                partnerAttackedSuits.push(t.leadSuit);
              }
            }
          }

          let partnerFishingSuit: Suit | null = null;
          for (const suit of partnerAttackedSuits) {
            const myCardsInSuit = eligibleLeadCards.filter((c) => c.suit === suit);
            if (myCardsInSuit.length > 0) {
              partnerFishingSuit = suit;
              break;
            }
          }

          if (partnerFishingSuit) {
            const myCardsInFishingSuit = eligibleLeadCards.filter((c) => c.suit === partnerFishingSuit);
            if (myCardsInFishingSuit.length > 0) {
              // If bot has boss/Ace in that suit, lead it to keep control and repeat, otherwise play low
              const bossOrAces = myCardsInFishingSuit.filter(
                (c) => c.rank === 'A' || BotPlayer.isBossCard(c, playedCards, myHand)
              );
              if (bossOrAces.length > 0) {
                bossOrAces.sort((a, b) => b.playValue - a.playValue);
                return BotPlayer.pickBestFromCandidates(bossOrAces, publicState, privateState, botPlayerId, players);
              }
              myCardsInFishingSuit.sort((a, b) => a.playValue - b.playValue);
              return BotPlayer.pickBestFromCandidates(myCardsInFishingSuit, publicState, privateState, botPlayerId, players);
            }
          }

          // 2. 5-6 Card Long Suit Relentless Attack (Force Opponents to Void and Reveal)
          // "If I am holding lets say 5, 6 cards of a suit then I can start with the high card of that suit so that I can repeat 2, 3 tricks so my partner can ask to reveal the rung"
          const longSuits = (['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'] as Suit[])
            .map((suit) => {
              const inHand = eligibleLeadCards.filter((c) => c.suit === suit);
              const playedCount = playedCards.filter((c) => c.suit === suit).length;
              const unseenInOthers = 13 - playedCount - inHand.length;
              return { suit, inHand, length: inHand.length, unseenInOthers };
            })
            .filter((s) => s.length >= 4 && s.inHand.length > 0)
            .sort((a, b) => b.length - a.length || a.unseenInOthers - b.unseenInOthers);

          if (longSuits.length > 0) {
            const targetSuit = longSuits[0];
            const callerId = publicState.trumpCallerPlayerId;
            let callerSloughedInSuit = 0;
            if (callerId) {
              for (const t of publicState.completedTricks) {
                const callerC = t.cards.find((c) => c.playerId === callerId);
                if (callerC && t.leadSuit === targetSuit.suit && callerC.card.suit !== targetSuit.suit) {
                  callerSloughedInSuit++;
                }
              }
            }

            if (callerSloughedInSuit < 2) {
              const bossOrAces = targetSuit.inHand.filter((c) => c.rank === 'A' || BotPlayer.isBossCard(c, playedCards, myHand));
              if (bossOrAces.length > 0) {
                bossOrAces.sort((a, b) => b.playValue - a.playValue);
                return BotPlayer.pickBestFromCandidates(bossOrAces, publicState, privateState, botPlayerId, players);
              }
              targetSuit.inHand.sort((a, b) => b.playValue - a.playValue);
              return BotPlayer.pickBestFromCandidates(targetSuit.inHand, publicState, privateState, botPlayerId, players);
            }
          }

          // 3. Maximize Rung Reveal Probability (Target suits with fewest unseen cards among opponents)
          const allSuits: Suit[] = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
          const suitStats = allSuits
            .map((suit) => {
              const playedInSuit = playedCards.filter((c) => c.suit === suit).length;
              const myInSuit = myHand.filter((c) => c.suit === suit);
              const myCards = eligibleLeadCards.filter((c) => c.suit === suit);
              const unseenInOtherHands = 13 - playedInSuit - myInSuit.length;
              return { suit, myCount: myInSuit.length, unseenInOtherHands, myCards };
            })
            .filter((s) => s.myCards.length > 0);

          if (suitStats.length > 0) {
            suitStats.sort((a, b) => b.myCount - a.myCount || a.unseenInOtherHands - b.unseenInOtherHands);
            const chosenSuitStat = suitStats[0];
            if (chosenSuitStat) {
              const aces = chosenSuitStat.myCards.filter((c) => c.rank === 'A');
              if (aces.length > 0) return BotPlayer.pickBestFromCandidates(aces, publicState, privateState, botPlayerId, players);
              chosenSuitStat.myCards.sort((a, b) => b.playValue - a.playValue);
              return BotPlayer.pickBestFromCandidates(chosenSuitStat.myCards, publicState, privateState, botPlayerId, players);
            }
          }
        }
      }

      // =========================================================================
      // --- PHASE 2: TRUMP IS REVEALED - NORMAL TRICK & STREAK TACTICS ---
      // =========================================================================
      if (publicState.isTrumpRevealed && activeTrumpSuit) {
        const isCaller = me.id === publicState.trumpCallerPlayerId;
        const isCallerTeam = isCaller || (partnerId === publicState.trumpCallerPlayerId);
        const isOpponentTeam = !isCallerTeam;

        const myTrumpCards = eligibleLeadCards.filter((c) => c.suit === activeTrumpSuit);
        const hasTrumpAce = myHand.some((c) => c.suit === activeTrumpSuit && c.rank === 'A');
        const nonTrumpLeadCards = eligibleLeadCards.filter((c) => c.suit !== activeTrumpSuit);
        const isTrumpAcePlayed = playedCards.some((c) => c.suit === activeTrumpSuit && c.rank === 'A');

        // -----------------------------------------------------------------------
        // MASTER RULE 1: PROTECT RUNG CARDS WHEN HOLDING ACE OF RUNG
        // "if the ai has called the rung and it has ace of rung in hand ... you should
        // not start the trick with the rung suit and then it keep running rung cards
        // and looses at the end game ... So if the ai has called the rung it should
        // protect it / keep it for later use ... but if they [opponents] keep the ace
        // of rung then they should avoid to start the trick with rung card."
        //
        // INVARIANT: ANY player holding the Ace of Rung MUST NEVER lead a Rung card
        // as long as they hold ANY non-trump card in hand!
        // -----------------------------------------------------------------------
        if (hasTrumpAce && nonTrumpLeadCards.length > 0) {
          // A. Cash Outside Boss Aces
          const outsideBossAces = nonTrumpLeadCards.filter((c) => c.rank === 'A');
          if (outsideBossAces.length > 0) {
            return BotPlayer.pickBestFromCandidates(outsideBossAces, publicState, privateState, botPlayerId, players);
          }

          // B. Cash Outside Boss Cards
          const outsideBossCards = nonTrumpLeadCards.filter((c) => BotPlayer.isBossCard(c, playedCards, myHand));
          if (outsideBossCards.length > 0) {
            outsideBossCards.sort((a, b) => b.playValue - a.playValue);
            return BotPlayer.pickBestFromCandidates(outsideBossCards, publicState, privateState, botPlayerId, players);
          }

          // C. Cross-Ruff Partner: Lead low card in suit where partner is known to be void
          if (partnerId && voids.get(partnerId)) {
            const partnerVoids = voids.get(partnerId)!;
            for (const suit of Array.from(partnerVoids)) {
              if (suit !== activeTrumpSuit) {
                const cardsInPartnerVoidSuit = nonTrumpLeadCards.filter((c) => c.suit === suit);
                if (cardsInPartnerVoidSuit.length > 0) {
                  cardsInPartnerVoidSuit.sort((a, b) => a.playValue - b.playValue);
                  return BotPlayer.pickBestFromCandidates(cardsInPartnerVoidSuit, publicState, privateState, botPlayerId, players);
                }
              }
            }
          }

          // D. Return Partner's Established Lead Suit (if holding 1-2 cards)
          for (const pSuit of partnerLedSuits) {
            if (pSuit !== activeTrumpSuit) {
              const cardsInPSuit = nonTrumpLeadCards.filter((c) => c.suit === pSuit);
              if (cardsInPSuit.length > 0 && cardsInPSuit.length <= 2) {
                cardsInPSuit.sort((a, b) => a.playValue - b.playValue);
                return BotPlayer.pickBestFromCandidates(cardsInPSuit, publicState, privateState, botPlayerId, players);
              }
            }
          }

          // E. Mathematically shed low-weight cards from weak suits to strengthen hand & create voids
          const bestShed = DynamicSuitEvaluator.pickBestCardToShed(nonTrumpLeadCards, myHand, playedCards);
          return BotPlayer.pickBestFromCandidates(
            [bestShed, ...nonTrumpLeadCards.filter((c) => c.id !== bestShed.id)],
            publicState,
            privateState,
            botPlayerId,
            players
          );
        }

        // -----------------------------------------------------------------------
        // MASTER RULE 2: RUNG CALLER WITHOUT ACE OF RUNG FLUSHES ENEMY ACE
        // "it should start with rung card if it does not hold the ace of rung."
        // -----------------------------------------------------------------------
        if (isCaller && !hasTrumpAce && !isTrumpAcePlayed && myTrumpCards.length > 0) {
          // Time to flush opponents' Ace of Trump out of the game!
          myTrumpCards.sort((a, b) => a.playValue - b.playValue); // Start with smaller/mid trump to draw out Ace
          return BotPlayer.pickBestFromCandidates(myTrumpCards, publicState, privateState, botPlayerId, players);
        }

        // -----------------------------------------------------------------------
        // MASTER RULE 3: OPPONENT AI WITHOUT ACE OF RUNG RUNS RUNG CARDS
        // "For the opponent ai they shoould try to run rung cards to weaken the rung
        // caller if they don't hold the ace of rung"
        // -----------------------------------------------------------------------
        if (isOpponentTeam && !hasTrumpAce && myTrumpCards.length > 0) {
          // If hunting 2-streak and holding a non-trump Boss Ace, cashing that Ace guarantees the streak
          if (isHunting2Streak) {
            const outsideBossAces = nonTrumpLeadCards.filter((c) => c.rank === 'A');
            if (outsideBossAces.length > 0) {
              return BotPlayer.pickBestFromCandidates(outsideBossAces, publicState, privateState, botPlayerId, players, myHand, activeTrumpSuit);
            }
          }

          // A. If holding non-trump Boss cards or Boss Aces, cashing them is high priority
          const bossAces = nonTrumpLeadCards.filter((c) => c.rank === 'A');
          if (bossAces.length > 0) {
            return BotPlayer.pickBestFromCandidates(bossAces, publicState, privateState, botPlayerId, players, myHand, activeTrumpSuit);
          }
          const outsideBossCards = nonTrumpLeadCards.filter((c) => BotPlayer.isBossCard(c, playedCards, myHand));
          if (outsideBossCards.length > 0) {
            outsideBossCards.sort((a, b) => b.playValue - a.playValue);
            return BotPlayer.pickBestFromCandidates(outsideBossCards, publicState, privateState, botPlayerId, players, myHand, activeTrumpSuit);
          }

          // B. Otherwise run Rung cards to bleed and weaken the Rung caller!
          myTrumpCards.sort((a, b) => a.playValue - b.playValue);
          return BotPlayer.pickBestFromCandidates(myTrumpCards, publicState, privateState, botPlayerId, players, myHand, activeTrumpSuit);
        }

        // -----------------------------------------------------------------------
        // STANDARD PHASE 2 TRICK & STREAK TACTICS (When neither Rule 1, 2, or 3 led trump)
        // -----------------------------------------------------------------------
        // 1. Offense: Hunting 2-Streak Bund Victory!
        if (isHunting2Streak) {
          // A. Non-trump Boss Aces
          const bossAces = nonTrumpLeadCards.filter((c) => c.rank === 'A');
          if (bossAces.length > 0) return BotPlayer.pickBestFromCandidates(bossAces, publicState, privateState, botPlayerId, players, myHand, activeTrumpSuit);

          // B. Non-trump Boss Cards
          const nonTrumpBossCards = nonTrumpLeadCards.filter((c) => BotPlayer.isBossCard(c, playedCards, myHand));
          if (nonTrumpBossCards.length > 0) {
            nonTrumpBossCards.sort((a, b) => b.playValue - a.playValue);
            return BotPlayer.pickBestFromCandidates(nonTrumpBossCards, publicState, privateState, botPlayerId, players, myHand, activeTrumpSuit);
          }

          // C. Absolute Boss Trump to lock in 2-streak Bund ONLY if:
          // 1) Ace of Trump was already played or bot does not hold Ace (covered above), AND
          // 2) Bot has no outside non-trump cards, OR trick is late in game (>=8 and not holding Ace)
          const trickNum = publicState.completedTricks.length + 1;
          if (nonTrumpLeadCards.length === 0 || (trickNum >= 8 && !hasTrumpAce)) {
            const bossTrumps = myTrumpCards.filter((c) => BotPlayer.isBossCard(c, playedCards, myHand));
            if (bossTrumps.length > 0) {
              bossTrumps.sort((a, b) => b.playValue - a.playValue);
              return BotPlayer.pickBestFromCandidates(bossTrumps, publicState, privateState, botPlayerId, players, myHand, activeTrumpSuit);
            }
          }
        }

        // 2. Defense: Break Opponent Streak!
        if (isDefendingOpponentStreak) {
          // A. Non-trump Boss cards first!
          const nonTrumpBoss = nonTrumpLeadCards.filter((c) => BotPlayer.isBossCard(c, playedCards, myHand));
          if (nonTrumpBoss.length > 0) {
            nonTrumpBoss.sort((a, b) => b.playValue - a.playValue);
            return BotPlayer.pickBestFromCandidates(nonTrumpBoss, publicState, privateState, botPlayerId, players, myHand, activeTrumpSuit);
          }

          // B. Boss Trump only if non-trump cards are unavailable or trick >= 8 (and not holding Ace)
          const trickNum = publicState.completedTricks.length + 1;
          if (nonTrumpLeadCards.length === 0 || (trickNum >= 8 && !hasTrumpAce)) {
            const bossTrumps = myTrumpCards.filter((c) => BotPlayer.isBossCard(c, playedCards, myHand));
            if (bossTrumps.length > 0) {
              bossTrumps.sort((a, b) => b.playValue - a.playValue);
              return BotPlayer.pickBestFromCandidates(bossTrumps, publicState, privateState, botPlayerId, players, myHand, activeTrumpSuit);
            }
          }
        }

        // 3. Partner Loyalty (Open Rung caller support): Return partner's established lead suit (off-suit)
        if (isPartnerOpenRungCaller) {
          for (const suit of partnerLedSuits) {
            if (suit !== activeTrumpSuit) {
              const cardsInPartnerSuit = nonTrumpLeadCards.filter((c) => c.suit === suit);
              if (cardsInPartnerSuit.length > 0) {
                cardsInPartnerSuit.sort((a, b) => a.playValue - b.playValue);
                return BotPlayer.pickBestFromCandidates(cardsInPartnerSuit, publicState, privateState, botPlayerId, players);
              }
            }
          }
        }

        // 4. Cross-Ruff Partner: Lead low card in suit where partner is known to be void
        if (partnerId && voids.get(partnerId)) {
          const partnerVoids = voids.get(partnerId)!;
          for (const suit of Array.from(partnerVoids)) {
            if (suit !== activeTrumpSuit) {
              const cardsInPartnerVoidSuit = nonTrumpLeadCards.filter((c) => c.suit === suit);
              if (cardsInPartnerVoidSuit.length > 0) {
                cardsInPartnerVoidSuit.sort((a, b) => a.playValue - b.playValue);
                return BotPlayer.pickBestFromCandidates(cardsInPartnerVoidSuit, publicState, privateState, botPlayerId, players);
              }
            }
          }
        }

        // 5. Return Partner's Established Suit (When weak/holding 1-2 cards in partner's suit):
        for (const pSuit of partnerLedSuits) {
          if (pSuit !== activeTrumpSuit) {
            const cardsInPSuit = nonTrumpLeadCards.filter((c) => c.suit === pSuit);
            if (cardsInPSuit.length > 0 && cardsInPSuit.length <= 2) {
              cardsInPSuit.sort((a, b) => a.playValue - b.playValue);
              return BotPlayer.pickBestFromCandidates(cardsInPSuit, publicState, privateState, botPlayerId, players);
            }
          }
        }

        // 6. Ace Follow-Through / Big Honor Extraction:
        const allSuits: Suit[] = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
        for (const suit of allSuits) {
          if (suit !== activeTrumpSuit) {
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
                const myFollowThroughCards = nonTrumpLeadCards.filter((c) => c.suit === suit);
                if (myFollowThroughCards.length > 0) {
                  myFollowThroughCards.sort((a, b) => a.playValue - b.playValue);
                  return BotPlayer.pickBestFromCandidates(myFollowThroughCards, publicState, privateState, botPlayerId, players);
                }
              }
            }
          }
        }

        // 7. Non-Trump Boss Honors:
        const nonTrumpBossCards = nonTrumpLeadCards.filter((c) => BotPlayer.isBossCard(c, playedCards, myHand));
        if (nonTrumpBossCards.length > 0) {
          nonTrumpBossCards.sort((a, b) => b.playValue - a.playValue);
          return BotPlayer.pickBestFromCandidates(nonTrumpBossCards, publicState, privateState, botPlayerId, players);
        }

        // 8. TACTICAL MASTER POINT: Mathematically shed low-weight cards from weak suits to purify hand strength!
        if (nonTrumpLeadCards.length > 0) {
          const bestShed = DynamicSuitEvaluator.pickBestCardToShed(nonTrumpLeadCards, myHand, playedCards);
          return BotPlayer.pickBestFromCandidates(
            [bestShed, ...nonTrumpLeadCards.filter((c) => c.id !== bestShed.id)],
            publicState,
            privateState,
            botPlayerId,
            players
          );
        }

        // 9. If ONLY Trump cards remain in hand:
        if (myTrumpCards.length > 0) {
          myTrumpCards.sort((a, b) => b.playValue - a.playValue);
          return BotPlayer.pickBestFromCandidates(myTrumpCards, publicState, privateState, botPlayerId, players);
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

      // Preserve Trump: Always prefer leading non-trump cards over trumps
      const nonTrumpPool = eligibleLeadCards.filter((c) => !activeTrumpSuit || c.suit !== activeTrumpSuit);
      const poolToUse = nonTrumpPool.length > 0 ? nonTrumpPool : eligibleLeadCards;

      const nonTrumpLengths: Record<Suit, number> = { HEARTS: 0, DIAMONDS: 0, CLUBS: 0, SPADES: 0 };
      for (const c of myHand) nonTrumpLengths[c.suit] += 1;

      poolToUse.sort((a, b) => {
        // Shortest suit first to create voids and dump losers
        const lenDiff = nonTrumpLengths[a.suit] - nonTrumpLengths[b.suit];
        if (lenDiff !== 0) return lenDiff;
        return a.playValue - b.playValue;
      });

      return poolToUse[0];
    }

    // --- CASE 2: Bot is FOLLOWING in the trick ---
    const leadSuit = trick.leadSuit;
    const matchingSuitCards = legalCards.filter((c) => c.suit === leadSuit);
    const evalResult = BotPlayer.evaluateCurrentTrick(trick, activeTrumpSuit, botPlayerId, players);

    // SUB-CASE 2A: Must Follow Lead Suit
    if (matchingSuitCards.length > 0) {
      // 1. If Teammate is currently winning:
      if (evalResult.isPartnerWinning && evalResult.winningCard) {
        const isPartnerLead = trick.leadPlayerId === partnerId;
        const isCaller = me.id === publicState.trumpCallerPlayerId;
        const isCallerTeam = isCaller || (partnerId === publicState.trumpCallerPlayerId);

        // --- TACTICAL POINT 4: Partner Void-Fishing Overtake vs Honor Hold ---
        // "If partner has played spade (small or mid range card) ... win by playing big card and return it with same suit so partner can ask to reveal rung"
        // "but if partner has played a big spade card ... wait for partner to win so he can play one more spade then I will win"
        if (isPartnerLead && !isCallerTeam && !publicState.isTrumpRevealed) {
          const partnerCard = trick.cards[0]?.card;
          if (partnerCard) {
            if (partnerCard.playValue <= 9) {
              // Partner led small/mid! FISHING ATTEMPT!
              // Overtake with high honor so bot wins and returns suit next trick!
              const bigWinningCards = matchingSuitCards.filter(
                (c) => c.playValue > partnerCard.playValue && (c.playValue >= 11 || BotPlayer.isBossCard(c, playedCards, myHand))
              );
              if (bigWinningCards.length > 0) {
                bigWinningCards.sort((a, b) => b.playValue - a.playValue);
                return BotPlayer.pickBestFromCandidates(bigWinningCards, publicState, privateState, botPlayerId, players);
              }
            } else if (partnerCard.playValue >= 10) {
              // Partner led big honor! Let partner win!
              const lowerCards = matchingSuitCards.filter((c) => c.playValue < partnerCard.playValue);
              if (lowerCards.length > 0) {
                lowerCards.sort((a, b) => a.playValue - b.playValue);
                return BotPlayer.pickBestFromCandidates(lowerCards, publicState, privateState, botPlayerId, players);
              }
            }
          }
        }

        // TACTIC: Partner started the suit & Bot is Strong in that suit -> Overtake to change suit & take control!
        // "If you are strong in those suits then you change the suit by playing higher card and taking the control"
        const strongWinningCards = matchingSuitCards.filter(
          (c) => c.playValue > evalResult.winningCard!.card.playValue && (c.rank === 'A' || BotPlayer.isBossCard(c, playedCards, myHand))
        );
        // If bot has strong cards in OTHER suits to lead next, overtake to switch suits!
        const hasOtherStrongSuits = myHand.some((c) => c.suit !== leadSuit && (c.rank === 'A' || c.suit === activeTrumpSuit));
        if (isPartnerLead && strongWinningCards.length > 0 && hasOtherStrongSuits && evalResult.winningCard.card.playValue < 12) {
          strongWinningCards.sort((a, b) => a.playValue - b.playValue);
          return strongWinningCards[0];
        }

        // TEAMWORK INTEL:
        // If bot started previous trick, partner won it and changed the suit, partner likely holds boss honors in this suit!
        // Throw the lowest card to let partner win and preserve bot's strength.
        const lastCompletedTrick2A = publicState.completedTricks[publicState.completedTricks.length - 1];
        const isPartnerChangedSuitAfterBotStart2A = Boolean(
          lastCompletedTrick2A &&
          lastCompletedTrick2A.leadPlayerId === botPlayerId &&
          lastCompletedTrick2A.winnerPlayerId === partnerId &&
          trick.leadPlayerId === partnerId &&
          trick.leadSuit !== lastCompletedTrick2A.leadSuit
        );

        const isPartnerCardUnbeatable =
          isPartnerChangedSuitAfterBotStart2A ||
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
          // TEAMWORK: "Second Hand Low"
          // If bot is playing 2nd (cards.length === 1) and partner plays 4th (last to play):
          // Duck with a low card on low/mid leads (<= 9) unless bot holds a boss Ace, allowing partner to win cheaply!
          const isSecondSeat = trick.cards.length === 1;
          const partnerPlaysFourth = isSecondSeat && players.length === 4;
          const opponentCardIsSmall = winningPower <= 9;
          const holdsBoss = matchingSuitCards.some((c) => c.rank === 'A' || BotPlayer.isBossCard(c, playedCards, myHand));

          if (isSecondSeat && partnerPlaysFourth && opponentCardIsSmall && !holdsBoss && matchingSuitCards.length >= 2) {
            matchingSuitCards.sort((a, b) => a.playValue - b.playValue);
            return matchingSuitCards[0]; // Second hand low!
          }

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
        const partnerWinningVal = evalResult.winningCard.card.playValue;

        // TEAMWORK INTEL:
        // "if the ai has started the trick and partner has won that trick and changed the suit then
        // there is a good chance that partner holds the high card of that suit so ai can look for other weak cards to get rid of"
        const lastCompletedTrick = publicState.completedTricks[publicState.completedTricks.length - 1];
        const isPartnerChangedSuitAfterBotStart = Boolean(
          lastCompletedTrick &&
          lastCompletedTrick.leadPlayerId === botPlayerId &&
          lastCompletedTrick.winnerPlayerId === partnerId &&
          trick.leadPlayerId === partnerId &&
          trick.leadSuit !== lastCompletedTrick.leadSuit
        );

        const isPartnerSecure =
          isPartnerChangedSuitAfterBotStart || // Partner switched suits after winning bot's lead -> partner is strong!
          evalResult.opponentsLeftToPlay === 0 ||
          partnerWinningVal >= 9 ||
          evalResult.winningCard.card.suit === activeTrumpSuit ||
          BotPlayer.isBossCard(evalResult.winningCard.card, playedCards, myHand);

        // DISCARD LOSER: When partner is winning, slough lowest weight card from weakest suit via Dynamic Hand Optimization!
        if (nonTrumpCards.length > 0) {
          if (isPartnerSecure || trumpCards.length === 0) {
            return DynamicSuitEvaluator.pickBestCardToShed(nonTrumpCards, myHand, playedCards);
          }
        }

        // Only trump partner if partner's winning card is very weak (< 9) and opponent is still to play
        if (trumpCards.length > 0) {
          trumpCards.sort((a, b) => a.playValue - b.playValue);
          return trumpCards[0];
        }

        if (nonTrumpCards.length > 0) {
          nonTrumpCards.sort((a, b) => a.playValue - b.playValue);
          return nonTrumpCards[0];
        }
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
          // Opponent has non-trump:
          // STRATEGIC TRUMP PRESERVATION & WHOLE-GAME PLANNING:
          // Do NOT blindly dump trumps on isolated low-value tricks when holding off-suit losers!
          const trickNum = publicState.completedTricks.length + 1;
          const isDefendingStreak =
            publicState.currentTrick.trickNumber >= 2 &&
            publicState.lastTrickWinnerPlayerId !== null &&
            publicState.lastTrickWinnerPlayerId !== botPlayerId &&
            publicState.lastTrickWinnerPlayerId !== partnerId;
          const isConvertingStreak =
            publicState.currentTrick.trickNumber >= 2 &&
            (publicState.lastTrickWinnerPlayerId === botPlayerId || publicState.lastTrickWinnerPlayerId === partnerId);
          const isHighHonor = winningPower >= 13; // Ace or King
          const isEndgame = trickNum >= 9;

          const shouldRuff =
            isDefendingStreak || // MUST break opponent streak!
            isConvertingStreak || // MUST lock in our team's 2-streak Hand!
            isHighHonor || // Deny high Ace/King
            isEndgame || // Late game accumulation
            nonTrumpCards.length === 0; // No off-suit losers left to dump

          if (shouldRuff && trumpCards.length > 0) {
            trumpCards.sort((a, b) => a.playValue - b.playValue);
            return trumpCards[0];
          }

          // Otherwise, PRESERVE TRUMPS! Slough off-suit loser via Dynamic Hand Optimization to establish a void:
          if (nonTrumpCards.length > 0) {
            return DynamicSuitEvaluator.pickBestCardToShed(nonTrumpCards, myHand, playedCards);
          }

          if (trumpCards.length > 0) {
            trumpCards.sort((a, b) => a.playValue - b.playValue);
            return trumpCards[0];
          }
        }

        // Cannot win: discard lowest weight card from weakest suit
        if (nonTrumpCards.length > 0) {
          return DynamicSuitEvaluator.pickBestCardToShed(nonTrumpCards, myHand, playedCards);
        }
      }
    }

    // Default fallback: play optimal card via Dynamic Suit Evaluation
    return DynamicSuitEvaluator.pickBestCardToShed(legalCards, myHand, playedCards);
  }
}
