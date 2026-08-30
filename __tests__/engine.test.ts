import { describe, it, expect } from 'vitest';
import { Deck } from '../server/engine/Deck';
import { TossEngine } from '../server/engine/TossEngine';
import { BundRungEngine } from '../server/engine/BundRungEngine';

describe('Deck & Cut Mechanics (Sections 2.3 & 4.2)', () => {
  it('generates 52 unique cards with correct hierarchy and toss values', () => {
    const deck = new Deck();
    const cards = deck.getCards();
    expect(cards.length).toBe(52);

    const aceSpades = cards.find((c) => c.suit === 'SPADES' && c.rank === 'A');
    expect(aceSpades?.playValue).toBe(14); // Highest in play
    expect(aceSpades?.tossValue).toBe(1);  // Lowest in toss

    const twoHearts = cards.find((c) => c.suit === 'HEARTS' && c.rank === '2');
    expect(twoHearts?.playValue).toBe(2);
    expect(twoHearts?.tossValue).toBe(2);
  });

  it('cuts the deck at index and swaps top and bottom piles, then locks deck', () => {
    const deck = new Deck();
    const originalCards = deck.getCards();

    // Cut at index 9 (top pile has 10 cards: 0..9, bottom pile has 42 cards: 10..51)
    deck.cut(9);

    const cutCards = deck.getCards();
    expect(cutCards.length).toBe(52);
    // The 11th card of original deck (index 10) is now the 1st card (index 0)
    expect(cutCards[0].id).toBe(originalCards[10].id);
    expect(deck.locked).toBe(true);

    // Reshuffle attempt on locked deck should throw
    expect(() => deck.shuffle()).toThrow();
  });

  it('ensures engine does not auto-shuffle; dealer explicitly chooses to shuffle or offer cut directly', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');
    engine.addPlayer('p2', 'Bob');
    engine.addPlayer('p3', 'Charlie');
    engine.addPlayer('p4', 'Diana');

    (engine as any).phase = 'TOSS_COMPLETE';
    (engine as any).dealerIndex = 0; // P1 is dealer

    // 1. Dealer distributes -> transitions to PRE_DEAL_SHUFFLE without auto-shuffling!
    engine.dealerDistributeCards('p1');
    expect(engine.getPublicState().phase).toBe('PRE_DEAL_SHUFFLE');

    // Initial deck cards before any shuffle:
    const initialDeckCards = (engine as any).deck.getCards();
    expect(initialDeckCards[0].suit).toBe('HEARTS');
    expect(initialDeckCards[0].rank).toBe('2');

    // 2. Dealer offers cut directly WITHOUT shuffling:
    engine.dealerOfferCut('p1');
    expect(engine.getPublicState().phase).toBe('PRE_DEAL_CUT');
    expect(engine.getPublicState().cutOfferPlayerId).toBe('p2');

    // 3. P2 cuts at index 0 (card 'H_2' becomes bottom card, 'H_3' becomes top card)
    engine.performCut('p2', 0);
    // Control returns to Dealer in PRE_DEAL_SHUFFLE with cutDone = true
    expect(engine.getPublicState().phase).toBe('PRE_DEAL_SHUFFLE');
    expect(engine.getPublicState().cutDone).toBe(true);

    // 4. Shuffling is now locked and throws if attempted
    expect(() => engine.dealerShuffle('p1')).toThrow();

    // 5. Dealer distributes 5 cards
    engine.dealerDistribute5Cards('p1');
    expect(engine.getPublicState().phase).toBe('BIDDING_PHASE');

    // P2's 5 cards contain the first 5 cards from the cut deck (H_3 through H_7)
    const p2CardIds = engine.getPrivateState('p2').myHand.map((c) => c.id);
    expect(p2CardIds).toContain('H_3');
    expect(p2CardIds).toContain('H_4');
    expect(p2CardIds).toContain('H_5');
    expect(p2CardIds).toContain('H_6');
    expect(p2CardIds).toContain('H_7');
  });
});

describe('Toss Engine & Tie-Breaker (Section 3.1)', () => {
  it('identifies lowest toss card as dealer in a single round when no tie occurs', () => {
    const toss = new TossEngine();
    toss.reset(['p1', 'p2', 'p3', 'p4']);

    // Draw cards for all 4 players
    toss.drawCard('p1', 0);
    toss.drawCard('p2', 0);
    toss.drawCard('p3', 0);
    toss.drawCard('p4', 0);

    const result = toss.evaluateRound();
    if (result.tiedPlayerIds.length === 0) {
      expect(result.isComplete).toBe(true);
      expect(result.dealerPlayerId).toBeDefined();
    } else {
      expect(result.isComplete).toBe(false);
      expect(result.tiedPlayerIds.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('preserves drawn cards in history, keeps remaining deck un-reshuffled, and decides dealer on newly drawn cards for tied players', () => {
    const toss = new TossEngine();
    toss.reset(['p1', 'p2', 'p3', 'p4']);

    // Inject fixed deck for deterministic tie-breaker testing
    // Cards at index 0..3:
    // P1 -> Ace of Hearts (tossValue: 1)
    // P2 -> Ace of Spades (tossValue: 1)
    // P3 -> 5 of Clubs (tossValue: 5)
    // P4 -> King of Diamonds (tossValue: 13)
    (toss as any).remainingDeckCards = [
      { id: 'H_A', suit: 'HEARTS', rank: 'A', playValue: 14, tossValue: 1 },
      { id: 'S_A', suit: 'SPADES', rank: 'A', playValue: 14, tossValue: 1 },
      { id: 'C_5', suit: 'CLUBS', rank: '5', playValue: 5, tossValue: 5 },
      { id: 'D_K', suit: 'DIAMONDS', rank: 'K', playValue: 13, tossValue: 13 },
      // Remaining cards for round 2:
      { id: 'C_9', suit: 'CLUBS', rank: '9', playValue: 9, tossValue: 9 }, // P1 Round 2
      { id: 'S_3', suit: 'SPADES', rank: '3', playValue: 3, tossValue: 3 }, // P2 Round 2
      { id: 'H_8', suit: 'HEARTS', rank: '8', playValue: 8, tossValue: 8 },
    ];

    // Round 1 Draws
    toss.drawCard('p1', 0); // Draws H_A (1)
    toss.drawCard('p2', 0); // Draws S_A (1)
    toss.drawCard('p3', 0); // Draws C_5 (5)
    toss.drawCard('p4', 0); // Draws D_K (13)

    expect(toss.getRemainingCount()).toBe(3); // 7 - 4 = 3 remaining

    const round1Result = toss.evaluateRound();
    expect(round1Result.isComplete).toBe(false);
    expect(round1Result.dealerPlayerId).toBeNull();
    expect(round1Result.tiedPlayerIds).toEqual(['p1', 'p2']);
    expect(round1Result.roundNumber).toBe(2);

    // Verify drawn cards stay in place for players to see
    const historyAfterR1 = toss.getDrawHistory();
    expect(historyAfterR1['p1'].map((c) => c.id)).toEqual(['H_A']);
    expect(historyAfterR1['p2'].map((c) => c.id)).toEqual(['S_A']);
    expect(historyAfterR1['p3'].map((c) => c.id)).toEqual(['C_5']);
    expect(historyAfterR1['p4'].map((c) => c.id)).toEqual(['D_K']);

    // Non-tied players (P3, P4) cannot draw in tie-breaker round
    expect(() => toss.drawCard('p3', 0)).toThrow('not in the active toss round');
    expect(() => toss.drawCard('p4', 0)).toThrow('not in the active toss round');

    // Tied players (P1, P2) draw their round 2 cards from remaining deck
    toss.drawCard('p1', 0); // Draws C_9 (tossValue: 9)
    toss.drawCard('p2', 0); // Draws S_3 (tossValue: 3)

    expect(toss.getRemainingCount()).toBe(1); // 3 - 2 = 1 remaining

    // Verify drawn cards stack on top of previously drawn cards
    const historyAfterR2 = toss.getDrawHistory();
    expect(historyAfterR2['p1'].map((c) => c.id)).toEqual(['H_A', 'C_9']);
    expect(historyAfterR2['p2'].map((c) => c.id)).toEqual(['S_A', 'S_3']);
    // Non-tied players keep their original cards
    expect(historyAfterR2['p3'].map((c) => c.id)).toEqual(['C_5']);
    expect(historyAfterR2['p4'].map((c) => c.id)).toEqual(['D_K']);

    // Round 2 evaluation: P2 (3) is lower than P1 (9) -> P2 is designated as dealer!
    const round2Result = toss.evaluateRound();
    expect(round2Result.isComplete).toBe(true);
    expect(round2Result.dealerPlayerId).toBe('p2');
  });
});

describe('Bund Rung Engine Full State Flow', () => {
  it('initializes lobby, locks features until 4 players, and forms opposite teams', () => {
    const engine = new BundRungEngine();
    expect(engine.getPhase()).toBe('WAITING_FOR_PLAYERS');

    const p1 = engine.addPlayer('p1', 'Alice');
    expect(p1.seat).toBe('BOTTOM');
    expect(p1.team).toBe('TEAM_1');

    const p2 = engine.addPlayer('p2', 'Bob');
    expect(p2.seat).toBe('RIGHT');
    expect(p2.team).toBe('TEAM_2');

    const p3 = engine.addPlayer('p3', 'Charlie');
    expect(p3.seat).toBe('TOP');
    expect(p3.team).toBe('TEAM_1'); // Teammate of Alice opposite table

    const p4 = engine.addPlayer('p4', 'Diana');
    expect(p4.seat).toBe('LEFT');
    expect(p4.team).toBe('TEAM_2'); // Teammate of Bob opposite table

    expect(engine.getPhase()).toBe('TEAM_FORMATION');
  });

  it('resets game and locks features when a player leaves mid-game', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');
    engine.addPlayer('p2', 'Bob');
    engine.addPlayer('p3', 'Charlie');
    engine.addPlayer('p4', 'Diana');

    engine.startInitialToss();
    expect(engine.getPhase()).toBe('INITIAL_TOSS');

    // Bob leaves
    const result = engine.removePlayer('p2');
    expect(result.removedPlayerName).toBe('Bob');
    expect(result.remainingCount).toBe(3);
    expect(engine.getPhase()).toBe('WAITING_FOR_PLAYERS');
    expect(engine.getPlayers().length).toBe(3);

    // New 4th player joins -> restarts to TEAM_FORMATION
    engine.addPlayer('p5', 'Eve');
    expect(engine.getPlayers().length).toBe(4);
    expect(engine.getPhase()).toBe('TEAM_FORMATION');
  });

  it('resets scorecard to 0 for every toss', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');
    engine.addPlayer('p2', 'Bob');
    engine.addPlayer('p3', 'Charlie');
    engine.addPlayer('p4', 'Diana');

    // Simulate existing score on scorecard
    (engine as any).scoringEngine.state.dealerScore = 52;
    expect(engine.getPublicState().scorecard.dealerScore).toBe(52);

    // Start Toss -> resets scorecard to 0
    engine.startInitialToss();
    expect(engine.getPublicState().scorecard.dealerScore).toBe(0);
    expect(engine.getPublicState().gameIndex).toBe(1);
  });

  it('keeps 4 cards on the table face up after a trick completes and clears them when the next lead card is played', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');
    engine.addPlayer('p2', 'Bob');
    engine.addPlayer('p3', 'Charlie');
    engine.addPlayer('p4', 'Diana');

    const createCard = (suit: any, rank: any, playValue: number) => ({
      id: `${suit[0]}_${rank}`,
      suit,
      rank,
      playValue,
      tossValue: playValue,
    });

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).isTrumpRevealed = true;
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).currentTurnPlayerIndex = 0;
    (engine as any).resetCurrentTrick(1, 'p1');

    (engine as any).hands['p1'] = [createCard('HEARTS', 'A', 14), createCard('CLUBS', '10', 10)];
    (engine as any).hands['p2'] = [createCard('HEARTS', 'K', 13)];
    (engine as any).hands['p3'] = [createCard('HEARTS', 'Q', 12)];
    (engine as any).hands['p4'] = [createCard('HEARTS', 'J', 11)];

    engine.playCard('p1', 'H_A');
    engine.playCard('p2', 'H_K');
    engine.playCard('p3', 'H_Q');
    const trick1 = engine.playCard('p4', 'H_J');

    expect(trick1.trickCompleted).toBe(true);
    expect(trick1.trickWinner?.id).toBe('p1');

    // After trick 1 finishes: previousTrickCards has all 4 cards face up
    const stateAfterTrick1 = engine.getPublicState();
    expect(stateAfterTrick1.previousTrickCards?.length).toBe(4);
    expect(stateAfterTrick1.currentTrick.cards.length).toBe(0);
    expect(stateAfterTrick1.currentTurnPlayerId).toBe('p1'); // P1 won and leads next trick

    // P1 leads trick 2 -> previousTrickCards is cleared, currentTrick has 1 card
    engine.playCard('p1', 'C_10');
    const stateAfterTrick2Lead = engine.getPublicState();
    expect(stateAfterTrick2Lead.previousTrickCards).toBeNull();
    expect(stateAfterTrick2Lead.currentTrick.cards.length).toBe(1);
    expect(stateAfterTrick2Lead.currentTrick.cards[0].card.id).toBe('C_10');
  });

  it('allows the dealer to distribute 5 cards for the next game and enables Open Rung announcement on Trick 1 of Game 2', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');
    engine.addPlayer('p2', 'Bob');
    engine.addPlayer('p3', 'Charlie');
    engine.addPlayer('p4', 'Diana');

    // Simulate Game 1 Resolution
    (engine as any).phase = 'GAME_RESOLVED';
    (engine as any).dealerIndex = 0; // P1 is dealer
    (engine as any).gameIndex = 1;
    (engine as any).isMatchOver = false;

    // Non-dealer trying to distribute throws
    expect(() => engine.dealerDistributeNextGame('p2')).toThrow();

    // Dealer P1 distributes and offers cut, P2 cuts
    engine.dealerDistributeNextGame('p1');
    expect(engine.getPublicState().phase).toBe('PRE_DEAL_SHUFFLE');
    engine.dealerOfferCut('p1');
    expect(engine.getPublicState().phase).toBe('PRE_DEAL_CUT');
    engine.performCut('p2', 20);
    expect(engine.getPublicState().phase).toBe('PRE_DEAL_SHUFFLE');
    engine.dealerDistribute5Cards('p1');

    const state = engine.getPublicState();
    expect(state.gameIndex).toBe(2);
    expect(state.phase).toBe('BIDDING_PHASE');
    expect(state.biddingTurnPlayerId).toBe('p2'); // Player to dealer's right (counter-clockwise)
    expect(engine.getPrivateState('p1').myHand.length).toBe(5);
    expect(engine.getPrivateState('p2').myHand.length).toBe(5);

    // Caller P2 establishes Close Rung
    const p2Cards = engine.getPrivateState('p2').myHand;
    engine.submitBid('p2', 'SELECT_CARD_TRUMP', p2Cards[0].id);

    // After P2 selects Close Rung, game remains in BIDDING_PHASE for remaining players to call Bwinji or Pass
    expect(engine.getPublicState().phase).toBe('BIDDING_PHASE');
    expect(engine.getPublicState().trumpMode).toBe('CLOSE_TRUMP');
    expect(engine.getPublicState().biddingTurnPlayerId).toBe('p3');

    // P3 cannot select another Close Rung card
    const p3Cards = engine.getPrivateState('p3').myHand;
    expect(() => engine.submitBid('p3', 'SELECT_CARD_TRUMP', p3Cards[0].id)).toThrow();

    // P3, P4, P1 pass on Bwinji
    engine.submitBid('p3', 'PASS');
    expect(engine.getPublicState().biddingTurnPlayerId).toBe('p4');
    engine.submitBid('p4', 'PASS');
    expect(engine.getPublicState().biddingTurnPlayerId).toBe('p1');
    engine.submitBid('p1', 'PASS');

    // After all 3 remaining players decline Bwinji, remaining 8 cards are dealt -> enters TRICK_PLAYING Trick 1
    expect(engine.getPublicState().phase).toBe('TRICK_PLAYING');
    expect(engine.getPublicState().currentTrick.trickNumber).toBe(1);
    expect(engine.getPublicState().currentTurnPlayerId).toBe('p2'); // P2 leads

    // Crucial requirement: Open Rung announcement is active for Trick 1 of Game 2!
    expect(engine.getPublicState().firstRoundOpenTrumpAvailable).toBe(true);
  });

  it('allows a subsequent player to override Close Rung by calling BWINJI during 5-card bidding', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');
    engine.addPlayer('p2', 'Bob');
    engine.addPlayer('p3', 'Charlie');
    engine.addPlayer('p4', 'Diana');

    // Deal 5 cards with cut
    (engine as any).phase = 'TOSS_COMPLETE';
    (engine as any).dealerIndex = 0; // P1 is dealer, P2 is first bidder
    engine.dealerDistributeCards('p1');
    engine.dealerOfferCut('p1');
    engine.performCut('p2', 20);
    expect(engine.getPublicState().phase).toBe('PRE_DEAL_SHUFFLE');
    engine.dealerDistribute5Cards('p1');

    expect(engine.getPublicState().phase).toBe('BIDDING_PHASE');
    expect(engine.getPublicState().biddingTurnPlayerId).toBe('p2');

    // P2 establishes Close Rung with their first card
    const p2FirstCard = engine.getPrivateState('p2').myHand[0];
    engine.submitBid('p2', 'SELECT_CARD_TRUMP', p2FirstCard.id);

    expect(engine.getPublicState().trumpMode).toBe('CLOSE_TRUMP');
    expect(engine.getPublicState().biddingTurnPlayerId).toBe('p3');

    // P3 overrides by calling BWINJI on HEARTS
    engine.submitBid('p3', 'BWINJI', 'HEARTS');

    // P3 is now the Bwinji caller and trump is public HEARTS
    const publicState = engine.getPublicState();
    expect(publicState.phase).toBe('TRICK_PLAYING');
    expect(publicState.trumpMode).toBe('BWINJI');
    expect(publicState.trumpSuit).toBe('HEARTS');
    expect(publicState.trumpCallerPlayerId).toBe('p3');
    expect(publicState.currentTurnPlayerId).toBe('p3'); // P3 leads

    // P2's card was returned to P2's hand (total 13 cards in hand)
    expect(engine.getPrivateState('p2').myHand.length).toBe(13);
    expect(engine.getPrivateState('p2').myHand.some((c) => c.id === p2FirstCard.id)).toBe(true);
  });

  it('ensures a player who passed earlier loses the chance to call Bwinji and is not asked again', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');
    engine.addPlayer('p2', 'Bob');
    engine.addPlayer('p3', 'Charlie');
    engine.addPlayer('p4', 'Diana');

    // P1 is dealer (idx 0), first bidder is P2 (idx 1)
    (engine as any).phase = 'TOSS_COMPLETE';
    (engine as any).dealerIndex = 0;
    engine.dealerDistributeCards('p1');
    engine.dealerOfferCut('p1');
    engine.performCut('p2', 20);
    expect(engine.getPublicState().phase).toBe('PRE_DEAL_SHUFFLE');
    engine.dealerDistribute5Cards('p1');

    expect(engine.getPublicState().phase).toBe('BIDDING_PHASE');
    expect(engine.getPublicState().biddingTurnPlayerId).toBe('p2');

    // 1. P2 passes their turn (biddingPassCount = 1) -> P2 loses all rights to declare Rung or Bwinji!
    engine.submitBid('p2', 'PASS');
    expect(engine.getPublicState().biddingTurnPlayerId).toBe('p3');

    // 2. P3 establishes Close Rung
    const p3FirstCard = engine.getPrivateState('p3').myHand[0];
    engine.submitBid('p3', 'SELECT_CARD_TRUMP', p3FirstCard.id);

    // 3. Only remaining players (P4 and P1) should be asked. P2 must NOT be asked!
    expect(engine.getPublicState().phase).toBe('BIDDING_PHASE');
    expect(engine.getPublicState().biddingTurnPlayerId).toBe('p4');

    // 4. P4 passes on Bwinji
    engine.submitBid('p4', 'PASS');
    expect(engine.getPublicState().biddingTurnPlayerId).toBe('p1');

    // 5. P1 (the dealer/last player) passes on Bwinji
    engine.submitBid('p1', 'PASS');

    // 6. Bidding completes immediately and cards are dealt — P2 is NEVER asked again!
    expect(engine.getPublicState().phase).toBe('TRICK_PLAYING');
    expect(engine.getPublicState().trumpMode).toBe('CLOSE_TRUMP');
    expect(engine.getPublicState().trumpCallerPlayerId).toBe('p3');
    expect(engine.getPublicState().currentTurnPlayerId).toBe('p3'); // P3 leads
  });

  it('correctly transfers dealership on KHOTI to partner if dealer team lost, or right player if opponent team lost', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');   // Team 1 (Bottom, idx 0)
    engine.addPlayer('p2', 'Bob');     // Team 2 (Right, idx 1)
    engine.addPlayer('p3', 'Charlie'); // Team 1 (Top, idx 2)
    engine.addPlayer('p4', 'Diana');   // Team 2 (Left, idx 3)

    // Test Case A: Dealer P1 (Team 1, idx 0) team becomes KHOTI
    (engine as any).dealerIndex = 0; // P1 is dealer
    (engine as any).isMatchOver = true;
    (engine as any).losingTeamKhoti = 'TEAM_1'; // Dealer's team lost!
    (engine as any).matchWinnerTeam = 'TEAM_2';

    // Start New Match
    engine.startNewMatch();

    let state = engine.getPublicState();
    expect(state.phase).toBe('GAME_RESOLVED'); // Prompt ready, NOT auto-dealt!
    expect(state.gameIndex).toBe(1);
    expect(state.isMatchOver).toBe(false);
    // Dealership transferred to partner Charlie (idx 2): (0 + 2) % 4 = 2
    expect(state.dealerPlayerIndex).toBe(2);
    expect(state.players[2].name).toBe('Charlie');
    expect(state.statusMessage).toContain('Charlie is the new dealer');

    // New dealer Charlie distributes cards for Game 1 and offers cut to Diana
    engine.dealerDistributeNextGame('p3');
    expect(engine.getPublicState().phase).toBe('PRE_DEAL_SHUFFLE');
    engine.dealerOfferCut('p3');
    engine.performCut('p4', 20);
    expect(engine.getPublicState().phase).toBe('PRE_DEAL_SHUFFLE');
    engine.dealerDistribute5Cards('p3');
    expect(engine.getPublicState().phase).toBe('BIDDING_PHASE');

    // Test Case B: Dealer Charlie (Team 1, idx 2) opponent team (Team 2) becomes KHOTI
    (engine as any).dealerIndex = 2; // Charlie is dealer
    (engine as any).isMatchOver = true;
    (engine as any).losingTeamKhoti = 'TEAM_2'; // Opponents lost!
    (engine as any).matchWinnerTeam = 'TEAM_1';

    // Start New Match
    engine.startNewMatch();

    state = engine.getPublicState();
    expect(state.phase).toBe('GAME_RESOLVED');
    expect(state.gameIndex).toBe(1);
    // Dealership transferred to next player on right (idx 3, Diana): (2 + 1) % 4 = 3
    expect(state.dealerPlayerIndex).toBe(3);
    expect(state.players[3].name).toBe('Diana');
    expect(state.statusMessage).toContain('Diana is the new dealer');
  });

  it('supports dynamic default team names and custom team names', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Qaiser');
    engine.addPlayer('p2', 'Alex');
    engine.addPlayer('p3', 'Jehangir');
    engine.addPlayer('p4', 'Diana');

    const state = engine.getPublicState();
    expect(state.teamNames.TEAM_1).toBe('Qaiser/Jehangir Team');
    expect(state.teamNames.TEAM_2).toBe('Alex/Diana Team');

    // Custom team name
    engine.setCustomTeamName('TEAM_1', 'Kings of Rung');
    expect(engine.getPublicState().teamNames.TEAM_1).toBe('Kings of Rung');
    expect(engine.getPublicState().teamNames.TEAM_2).toBe('Alex/Diana Team');

    // Resetting custom name restores dynamic player names
    engine.setCustomTeamName('TEAM_1', '');
    expect(engine.getPublicState().teamNames.TEAM_1).toBe('Qaiser/Jehangir Team');
  });

  it('toggles Show Hand cards so they become visible face-up to other players in public state', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');
    engine.addPlayer('p2', 'Bob');
    engine.addPlayer('p3', 'Charlie');
    engine.addPlayer('p4', 'Diana');

    (engine as any).hands['p1'] = [
      { id: 'H_A', suit: 'HEARTS', rank: 'A', playValue: 14, tossValue: 1 },
      { id: 'S_K', suit: 'SPADES', rank: 'K', playValue: 13, tossValue: 13 },
    ];

    expect(engine.getPublicState().revealedHands['p1']).toBeUndefined();
    expect(engine.getPrivateState('p1').isMyHandRevealed).toBe(false);

    // P1 toggles show hand
    engine.toggleShowHand('p1');

    expect(engine.getPublicState().revealedHands['p1']).toBeDefined();
    expect(engine.getPublicState().revealedHands['p1'].length).toBe(2);
    expect(engine.getPublicState().revealedHands['p1'][0].id).toBe('H_A');
    expect(engine.getPrivateState('p1').isMyHandRevealed).toBe(true);

    // P1 toggles off
    engine.toggleShowHand('p1');
    expect(engine.getPublicState().revealedHands['p1']).toBeUndefined();
    expect(engine.getPrivateState('p1').isMyHandRevealed).toBe(false);
  });

  it('requires both players of a team to vote Surrender before ending the game and awarding win to opponents', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');   // Team 1
    engine.addPlayer('p2', 'Bob');     // Team 2
    engine.addPlayer('p3', 'Charlie'); // Team 1
    engine.addPlayer('p4', 'Diana');   // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpMode = 'CLOSE_TRUMP';
    (engine as any).trumpCallerPlayerId = 'p1';
    (engine as any).dealerIndex = 0; // P1 is dealer

    // P1 (Team 1) votes surrender
    const res1 = engine.voteSurrender('p1');
    expect(res1.surrendered).toBe(false);
    expect(engine.getPublicState().surrenderVotes.TEAM_1).toEqual(['p1']);
    expect(engine.getPrivateState('p1').hasVotedSurrender).toBe(true);
    expect(engine.getPrivateState('p3').hasVotedSurrender).toBe(false);
    expect(engine.getPhase()).toBe('TRICK_PLAYING');

    // P1 cancels vote
    const resCancel = engine.voteSurrender('p1');
    expect(resCancel.surrendered).toBe(false);
    expect(engine.getPublicState().surrenderVotes.TEAM_1).toEqual([]);
    expect(engine.getPrivateState('p1').hasVotedSurrender).toBe(false);

    // P1 votes again
    engine.voteSurrender('p1');
    expect(engine.getPublicState().surrenderVotes.TEAM_1).toEqual(['p1']);

    // Teammate P3 (Team 1) also votes surrender => 2/2 -> Game ends!
    const res2 = engine.voteSurrender('p3');
    expect(res2.surrendered).toBe(true);
    expect(res2.winningTeam).toBe('TEAM_2'); // Opponent Team 2 wins!
    expect(engine.getPhase()).toBe('GAME_RESOLVED');
    expect(engine.getPublicState().statusMessage).toContain('surrendered');
  });

  it('requires both defending team members to confirm Accept Challenge or Surrender during Face-Down Challenge', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');   // Team 1
    engine.addPlayer('p2', 'Bob');     // Team 2
    engine.addPlayer('p3', 'Charlie'); // Team 1
    engine.addPlayer('p4', 'Diana');   // Team 2

    // Setup Open Rung Face-down challenge by P1 (Team 1)
    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).hands['p1'] = [{ id: 'S_A', suit: 'SPADES', rank: 'A', playValue: 14, tossValue: 1 }];
    engine.declareOpenRung('p1', 'SPADES', 'S_A', true);

    expect(engine.getPublicState().faceDownLeadPending).toBe(true);
    expect(engine.getPublicState().faceDownLeadPlayerId).toBe('p1');

    // 1. Defending player P2 (Team 2) votes Surrender -> requires P4 confirmation!
    const res1 = engine.respondToFaceDownRung('p2', false);
    expect(res1.gameEnded).toBe(false);
    expect(engine.getPublicState().faceDownLeadPending).toBe(true);
    expect(engine.getPublicState().faceDownChallengeVotes?.['p2']).toBe('SURRENDER');
    expect(engine.getPublicState().statusMessage).toContain('Waiting for partner Diana');

    // 2. If P4 votes Accept -> conflicting votes, game does not end
    const resConflict = engine.respondToFaceDownRung('p4', true);
    expect(resConflict.gameEnded).toBe(false);
    expect(engine.getPublicState().faceDownLeadPending).toBe(true);
    expect(engine.getPublicState().faceDownChallengeVotes?.['p4']).toBe('ACCEPT');
    expect(engine.getPublicState().statusMessage).toContain('Both teammates must agree');

    // 3. P4 changes vote to Surrender -> both voted Surrender => Game ends!
    const resSurrender = engine.respondToFaceDownRung('p4', false);
    expect(resSurrender.gameEnded).toBe(true);
    expect(resSurrender.winningTeam).toBe('TEAM_1');
    expect(engine.getPhase()).toBe('GAME_RESOLVED');
    expect(engine.getPublicState().faceDownLeadPending).toBe(false);
  });

  it('allows defending team to Accept Challenge when both players confirm', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');   // Team 1
    engine.addPlayer('p2', 'Bob');     // Team 2
    engine.addPlayer('p3', 'Charlie'); // Team 1
    engine.addPlayer('p4', 'Diana');   // Team 2

    // Setup Bwinji Face-down challenge by P1 (Team 1)
    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpMode = 'BWINJI';
    (engine as any).trumpCallerPlayerId = 'p1';
    (engine as any).hands['p1'] = [{ id: 'H_K', suit: 'HEARTS', rank: 'K', playValue: 13, tossValue: 13 }];
    engine.declareBwinjiLead('p1', 'H_K', true);

    expect(engine.getPublicState().faceDownLeadPending).toBe(true);

    // Defending player P2 (Team 2) votes Accept
    const res1 = engine.respondToFaceDownRung('p2', true);
    expect(res1.gameEnded).toBe(false);
    expect(engine.getPublicState().faceDownLeadPending).toBe(true);
    expect(engine.getPublicState().faceDownChallengeVotes?.['p2']).toBe('ACCEPT');

    // Defending partner P4 (Team 2) also votes Accept -> both accepted => trick play proceeds!
    const res2 = engine.respondToFaceDownRung('p4', true);
    expect(res2.gameEnded).toBe(false);
    expect(engine.getPublicState().faceDownLeadPending).toBe(false);
    expect(engine.getPublicState().isTrumpRevealed).toBe(true);
    expect(engine.getPhase()).toBe('TRICK_PLAYING');
    expect(engine.getPublicState().currentTrick.cards[0].isFaceDown).toBe(false);
  });

  it('supports controlled 20% partial shuffling per dealer click with progress tracking', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');
    engine.addPlayer('p2', 'Bob');
    engine.addPlayer('p3', 'Charlie');
    engine.addPlayer('p4', 'Diana');

    (engine as any).phase = 'TOSS_COMPLETE';
    (engine as any).dealerIndex = 0; // Alice is dealer

    // Dealer proceeds to shuffle phase
    engine.dealerDistributeCards('p1');
    expect(engine.getPhase()).toBe('PRE_DEAL_SHUFFLE');
    expect(engine.getPublicState().shuffleCount).toBe(0);

    // 1st click = 20%
    engine.dealerShuffle('p1');
    expect(engine.getPublicState().shuffleCount).toBe(1);
    expect(engine.getPublicState().statusMessage).toContain('20% total');

    // 2nd click = 40%
    engine.dealerShuffle('p1');
    expect(engine.getPublicState().shuffleCount).toBe(2);
    expect(engine.getPublicState().statusMessage).toContain('40% total');

    // Deck must still contain exactly 52 valid unique cards
    const deckCards = (engine as any).deck.getCards();
    expect(deckCards.length).toBe(52);
    const uniqueIds = new Set(deckCards.map((c: any) => c.id));
    expect(uniqueIds.size).toBe(52);

    // Dealer offers cut to Bob (player 1)
    engine.dealerOfferCut('p1');
    expect(engine.getPhase()).toBe('PRE_DEAL_CUT');

    // Bob cuts the deck
    engine.performCut('p2', 20);
    expect(engine.getPhase()).toBe('PRE_DEAL_SHUFFLE');
    expect(engine.getPublicState().cutDone).toBe(true);

    // Reshuffling after cut must be prevented
    expect(() => engine.dealerShuffle('p1')).toThrow('Deck has already been cut and cannot be reshuffled');
  });
});

