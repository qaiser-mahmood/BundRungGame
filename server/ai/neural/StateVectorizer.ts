import { Card, Suit, Rank, PublicGameState, PrivatePlayerState, Player } from '../../../shared/types';

export const ALL_SUITS: Suit[] = ['SPADES', 'HEARTS', 'CLUBS', 'DIAMONDS'];
export const ALL_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export class StateVectorizer {
  public static readonly BASE_FEATURE_COUNT = 52 + 52 + 52 + 4 + 5 + 16 + 2; // 183 base features
  public static readonly TACTICAL_FEATURE_COUNT = 9 + 10 + 9 + 2 + 3 + 5 + 4 + 4; // 46 concept-rich features
  public static readonly FEATURE_COUNT = StateVectorizer.BASE_FEATURE_COUNT + StateVectorizer.TACTICAL_FEATURE_COUNT; // 229 features

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
   * into a 229-feature normalized float array.
   */
  public static vectorize(
    publicState: PublicGameState,
    privateState: PrivatePlayerState,
    botPlayerId: string,
    players: Player[]
  ): Float32Array {
    const features = new Float32Array(this.FEATURE_COUNT);
    let offset = 0;

    // --- BASE FEATURES (183) ---

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
    const playedCards: Card[] = [];
    for (const trick of publicState.completedTricks) {
      for (const pc of trick.cards) {
        if (pc.card) {
          features[offset + this.cardToIndex(pc.card)] = 1.0;
          playedCards.push(pc.card);
        }
      }
    }
    offset += 52;

    // 3. Current Trick Cards on Table (52 binary)
    const currentTrickCards = publicState.currentTrick?.cards || [];
    for (const tc of currentTrickCards) {
      if (tc.card) {
        features[offset + this.cardToIndex(tc.card)] = 1.0;
      }
    }
    offset += 52;

    // 4. Turn Position in Current Trick (4 one-hot: 0=Lead, 1=Second, 2=Third, 3=Fourth)
    const cardsPlayedInTrick = currentTrickCards.length;
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
    const partner = players.find((p) => p.team === myTeam && p.id !== botPlayerId);
    const partnerId = partner?.id || '';

    const myTeamTricks = myTeam === 'TEAM_1' ? publicState.team1TricksWon : publicState.team2TricksWon;
    const oppTeamTricks = myTeam === 'TEAM_1' ? publicState.team2TricksWon : publicState.team1TricksWon;

    features[offset] = Math.min(1.0, myTeamTricks / 13.0);
    features[offset + 1] = Math.min(1.0, oppTeamTricks / 13.0);
    offset += 2;

    // --- CONCEPT-RICH TACTICAL FEATURES (+46) ---

    // 8. Partner Void Fishing & Trick Dynamics (9 features)
    const trick = publicState.currentTrick;
    const activeTrumpSuit = publicState.isTrumpRevealed ? publicState.trumpSuit : null;

    let isPartnerWinning = 0;
    let isPartnerWinningWithBoss = 0;
    let isOpponentWinning = 0;
    let partnerLeadCardRankPower = 0;
    let partnerLeadIsSmallOrMid = 0;
    let partnerLeadIsHighHonor = 0;
    let winningCardRankPower = 0;
    let winningCardIsTrump = 0;

    if (currentTrickCards.length > 0 && trick.leadSuit) {
      // Evaluate current trick winner
      const leadSuit = trick.leadSuit;
      let winningCard = currentTrickCards[0];
      let highestPower = winningCard.isAceDowngraded ? 2 : winningCard.card.playValue;

      for (let i = 1; i < currentTrickCards.length; i++) {
        const cand = currentTrickCards[i];
        const candPower = cand.isAceDowngraded ? 2 : cand.card.playValue;
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

      winningCardRankPower = highestPower / 14.0;
      winningCardIsTrump = activeTrumpSuit && winningCard.card.suit === activeTrumpSuit ? 1.0 : 0.0;

      const winningPlayer = players.find((p) => p.id === winningCard.playerId);
      if (winningPlayer) {
        if (winningPlayer.id === partnerId) {
          isPartnerWinning = 1.0;
          // Check if partner's winning card is an unbeatable Boss
          const playedInSuit = playedCards.filter((c) => c.suit === winningCard.card.suit);
          const handInSuit = myHand.filter((c) => c.suit === winningCard.card.suit);
          let isBoss = true;
          for (let pv = winningCard.card.playValue + 1; pv <= 14; pv++) {
            const seen = playedInSuit.some((c) => c.playValue === pv);
            const inHand = handInSuit.some((c) => c.playValue === pv);
            if (!seen && !inHand) {
              isBoss = false;
              break;
            }
          }
          if (isBoss) isPartnerWinningWithBoss = 1.0;
        } else if (winningPlayer.team !== myTeam) {
          isOpponentWinning = 1.0;
        }
      }

      // Partner Lead Fishing check (small/mid vs honor lead)
      if (currentTrickCards[0].playerId === partnerId) {
        const partnerCard = currentTrickCards[0].card;
        partnerLeadCardRankPower = partnerCard.playValue / 14.0;
        if (partnerCard.playValue <= 9) {
          partnerLeadIsSmallOrMid = 1.0; // Fishing attempt! Overtake and return!
        } else {
          partnerLeadIsHighHonor = 1.0; // Partner holding strength! Let them win!
        }
      }
    }

    const playedIdsInTrick = new Set(currentTrickCards.map((c) => c.playerId));
    playedIdsInTrick.add(botPlayerId);
    const opponentsBehindMe = players.filter((p) => p.team !== myTeam && !playedIdsInTrick.has(p.id)).length;
    const opponentsBehindMeNorm = opponentsBehindMe / 2.0;

    features[offset++] = isPartnerWinning;
    features[offset++] = isPartnerWinningWithBoss;
    features[offset++] = isOpponentWinning;
    features[offset++] = partnerLeadCardRankPower;
    features[offset++] = partnerLeadIsSmallOrMid;
    features[offset++] = partnerLeadIsHighHonor;
    features[offset++] = winningCardRankPower;
    features[offset++] = winningCardIsTrump;
    features[offset++] = opponentsBehindMeNorm;

    // 9. Boss Honors & Tenace Tracking (10 features)
    let totalHCP = 0;
    let aceCount = 0;

    for (const suit of ALL_SUITS) {
      const handInSuit = myHand.filter((c) => c.suit === suit);
      const playedInSuit = playedCards.filter((c) => c.suit === suit);

      let holdsBoss = 0;
      let holdsSecond = 0;

      if (handInSuit.length > 0) {
        // Find highest unplayed power
        for (let pv = 14; pv >= 2; pv--) {
          const wasPlayed = playedInSuit.some((c) => c.playValue === pv);
          if (!wasPlayed) {
            if (handInSuit.some((c) => c.playValue === pv)) {
              holdsBoss = 1.0;
            } else {
              // 2nd highest check
              for (let pv2 = pv - 1; pv2 >= 2; pv2--) {
                const wasPlayed2 = playedInSuit.some((c) => c.playValue === pv2);
                if (!wasPlayed2) {
                  if (handInSuit.some((c) => c.playValue === pv2)) {
                    holdsSecond = 1.0;
                  }
                  break;
                }
              }
            }
            break;
          }
        }
      }

      features[offset++] = holdsBoss;
      features[offset++] = holdsSecond;
    }

    for (const card of myHand) {
      if (card.rank === 'A') {
        totalHCP += 4;
        aceCount++;
      } else if (card.rank === 'K') totalHCP += 3;
      else if (card.rank === 'Q') totalHCP += 2;
      else if (card.rank === 'J') totalHCP += 1;
      else if (card.rank === '10') totalHCP += 0.5;
    }

    features[offset++] = Math.min(1.0, totalHCP / 37.0);
    features[offset++] = Math.min(1.0, aceCount / 4.0);

    // 10. Suit Exhaustion & 5–6 Card Long Suit Attack (9 features)
    let maxSuitLen = 0;
    for (const suit of ALL_SUITS) {
      const len = myHand.filter((c) => c.suit === suit).length;
      if (len > maxSuitLen) maxSuitLen = len;
      features[offset++] = len / 13.0;
    }
    features[offset++] = maxSuitLen / 13.0;

    for (const suit of ALL_SUITS) {
      const playedInSuit = playedCards.filter((c) => c.suit === suit).length;
      const myInSuit = myHand.filter((c) => c.suit === suit).length;
      const unplayed = Math.max(0, 13 - playedInSuit - myInSuit);
      features[offset++] = unplayed / 13.0; // The smaller this is, the faster voids appear!
    }

    // 11. Caller Sloughing Weakness Alert (2 features)
    const callerId = publicState.trumpCallerPlayerId;
    let callerFaceDownCount = 0;
    if (callerId) {
      for (const trick of publicState.completedTricks) {
        const callerCard = trick.cards.find((c) => c.playerId === callerId);
        if (callerCard && callerCard.card && callerCard.card.suit !== activeTrumpSuit) {
          if (trick.leadSuit && callerCard.card.suit !== trick.leadSuit) {
            callerFaceDownCount++;
          }
        }
      }
    }
    const callerSloughNorm = Math.min(1.0, callerFaceDownCount / 5.0);
    const callerSloughAlert = !publicState.isTrumpRevealed && callerFaceDownCount >= 2 ? 1.0 : 0.0;
    features[offset++] = callerSloughNorm;
    features[offset++] = callerSloughAlert;

    // 12. Caller Weak Trump Under-Lead & Control (3 features)
    const isBotCaller = botPlayerId === publicState.trumpCallerPlayerId;
    const trumpSuit = publicState.trumpSuit;
    let callerLacksTrumpAce = 0;
    let myTrumpCount = 0;
    let estimatedTrumpsRemaining = 0;

    if (trumpSuit) {
      const trumpInHand = myHand.filter((c) => c.suit === trumpSuit);
      myTrumpCount = trumpInHand.length / 13.0;
      if (isBotCaller && !trumpInHand.some((c) => c.rank === 'A')) {
        callerLacksTrumpAce = 1.0;
      }
      const playedTrumps = playedCards.filter((c) => c.suit === trumpSuit).length;
      estimatedTrumpsRemaining = Math.max(0, 13 - playedTrumps - trumpInHand.length) / 13.0;
    }
    features[offset++] = callerLacksTrumpAce;
    features[offset++] = myTrumpCount;
    features[offset++] = estimatedTrumpsRemaining;

    // 13. Open Rung Partner Deference (5 features)
    const partnerIsOpenTrumpCaller = Boolean(
      partnerId &&
      publicState.trumpCallerPlayerId === partnerId &&
      publicState.trumpMode === 'OPEN_TRUMP'
    ) ? 1.0 : 0.0;
    features[offset++] = partnerIsOpenTrumpCaller;

    for (const suit of ALL_SUITS) {
      let partnerLed = 0;
      for (const trick of publicState.completedTricks) {
        if (trick.leadPlayerId === partnerId && trick.leadSuit === suit) {
          partnerLed = 1.0;
          break;
        }
      }
      features[offset++] = partnerLed;
    }

    // 14. Bund Rung Streaks & Ace Downgrade Hazard (4 features)
    const lastTrick = publicState.completedTricks[publicState.completedTricks.length - 1];
    let twoStreakOpportunity = 0;
    let opponentTwoStreakThreat = 0;
    if (lastTrick && lastTrick.winnerPlayerId) {
      const lastWinner = players.find((p) => p.id === lastTrick.winnerPlayerId);
      if (lastWinner) {
        if (lastWinner.team === myTeam) twoStreakOpportunity = 1.0;
        else opponentTwoStreakThreat = 1.0;
      }
    }

    // Ace Downgrade Hazard: Did this bot lead an Ace in immediately preceding trick?
    let consecutiveAceHazard = 0;
    if (lastTrick && lastTrick.leadPlayerId === botPlayerId && lastTrick.cards.length > 0) {
      if (lastTrick.cards[0].card.rank === 'A') {
        consecutiveAceHazard = 1.0;
      }
    }

    const tricksNeeded = Math.max(0, 7 - myTeamTricks) / 7.0;
    features[offset++] = twoStreakOpportunity;
    features[offset++] = opponentTwoStreakThreat;
    features[offset++] = consecutiveAceHazard;
    features[offset++] = tricksNeeded;

    // 15. Game Phase (4 features)
    const trickNum = publicState.completedTricks.length + 1;
    features[offset++] = trickNum <= 4 ? 1.0 : 0.0;
    features[offset++] = trickNum >= 5 && trickNum <= 8 ? 1.0 : 0.0;
    features[offset++] = trickNum >= 9 ? 1.0 : 0.0;
    features[offset++] = Math.min(1.0, trickNum / 13.0);

    return features;
  }
}
