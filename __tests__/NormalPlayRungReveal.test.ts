import { describe, it, expect } from 'vitest';
import { BundRungEngine } from '../server/engine/BundRungEngine';
import { Card } from '../shared/types';

describe('Normal Play (Close Rung) & Rung Reveal Game Mechanics', () => {
  function setupGameWithFixedHands() {
    const engine = new BundRungEngine();
    const p1 = engine.addPlayer('p1', 'Alice'); // TEAM_1, Seat 0 (Caller)
    const p2 = engine.addPlayer('p2', 'Bob');   // TEAM_2, Seat 1
    const p3 = engine.addPlayer('p3', 'Charlie');// TEAM_1, Seat 2
    const p4 = engine.addPlayer('p4', 'Diana');  // TEAM_2, Seat 3

    // Manually setup hands for precise deterministic testing
    const createCard = (suit: any, rank: any, playValue: number): Card => ({
      id: `${suit[0]}_${rank}`,
      suit,
      rank,
      playValue,
      tossValue: playValue === 14 ? 1 : playValue,
    });

    // P1 (Dealer is P4, so P1 bids first)
    (engine as any).phase = 'BIDDING_PHASE';
    (engine as any).dealerIndex = 3;
    (engine as any).biddingTurnPlayerIndex = 0;

    const p1RungCard = createCard('SPADES', 'A', 14);
    (engine as any).hands['p1'] = [
      p1RungCard,
      createCard('HEARTS', '2', 2),
      createCard('DIAMONDS', '5', 5),
      createCard('CLUBS', '7', 7),
      createCard('CLUBS', '8', 8),
    ];
    (engine as any).hands['p2'] = [
      createCard('SPADES', 'K', 13),
      createCard('HEARTS', '9', 9),
      createCard('DIAMONDS', '10', 10),
      createCard('CLUBS', '2', 2),
      createCard('CLUBS', '3', 3),
    ];
    (engine as any).hands['p3'] = [
      createCard('HEARTS', '10', 10),
      createCard('HEARTS', 'J', 11),
      createCard('DIAMONDS', 'Q', 12),
      createCard('CLUBS', '4', 4),
      createCard('CLUBS', '5', 5),
    ];
    (engine as any).hands['p4'] = [
      createCard('HEARTS', '3', 3),
      createCard('HEARTS', '4', 4),
      createCard('DIAMONDS', 'K', 13),
      createCard('CLUBS', '9', 9),
      createCard('CLUBS', '10', 10),
    ];

    // P1 declares CLOSE_TRUMP with Spades Ace
    engine.submitBid('p1', 'SELECT_CARD_TRUMP', p1RungCard.id);
    engine.submitBid('p2', 'PASS');
    engine.submitBid('p3', 'PASS');
    engine.submitBid('p4', 'PASS');

    return { engine, createCard, p1, p2, p3, p4, p1RungCard };
  }

  it('locks the chosen Rung card so the caller cannot play it until Rung is revealed', () => {
    const { engine, p1RungCard } = setupGameWithFixedHands();
    const publicState = engine.getPublicState();
    expect(publicState.isTrumpRevealed).toBe(false);
    expect(publicState.trumpMode).toBe('CLOSE_TRUMP');

    const p1Private = engine.getPrivateState('p1');
    expect(p1Private.myTrumpCard?.id).toBe(p1RungCard.id);
    expect(p1Private.isMyTrumpCardPlayable).toBe(false);
    expect(p1Private.legalPlayableCardIds.includes(p1RungCard.id)).toBe(false);

    // Attempting to play the secret trump card directly throws an error
    expect(() => engine.playCard('p1', p1RungCard.id)).toThrow();
  });

  it('treats secret trump suit cards as normal cards before reveal (no trump superiority and no auto-reveal)', () => {
    const { engine, createCard } = setupGameWithFixedHands();

    // Setup specific hands for Trick 1
    // P1 leads H_2
    // P2 plays H_9 (follows lead suit)
    // P3 (caller teammate, has no Hearts, plays S_K off-suit secret trump suit!)
    // P4 plays H_3 (follows lead suit)
    (engine as any).hands['p1'] = [createCard('HEARTS', '2', 2)];
    (engine as any).hands['p2'] = [createCard('HEARTS', '9', 9)];
    (engine as any).hands['p3'] = [createCard('SPADES', 'K', 13)]; // Teammate has no hearts
    (engine as any).hands['p4'] = [createCard('HEARTS', '3', 3)];

    (engine as any).currentTurnPlayerIndex = 0;
    (engine as any).phase = 'TRICK_PLAYING';

    engine.playCard('p1', 'H_2');
    engine.playCard('p2', 'H_9');
    engine.playCard('p3', 'S_K');

    // Verify Rung is still NOT revealed even though a secret trump suit card was played off-suit
    expect(engine.getPublicState().isTrumpRevealed).toBe(false);

    const trickResult = engine.playCard('p4', 'H_3');

    // P2 (Bob) won with H_9 because S_K has no trump power before reveal!
    expect(trickResult.trickCompleted).toBe(true);
    expect(trickResult.trickWinner?.id).toBe('p2');
    expect(engine.getPublicState().isTrumpRevealed).toBe(false);
  });

  it('places caller cards face-down when caller is void in lead suit before reveal, and persists them across tricks', () => {
    const { engine, createCard } = setupGameWithFixedHands();

    // P2 leads C_2 (Clubs)
    // P3 plays C_4
    // P4 plays C_9
    // P1 (Caller) is void in Clubs and plays D_5
    (engine as any).currentTurnPlayerIndex = 1; // P2 leads
    (engine as any).resetCurrentTrick(1, 'p2');
    (engine as any).hands['p1'] = [createCard('DIAMONDS', '5', 5)]; // P1 has no clubs
    (engine as any).hands['p2'] = [createCard('CLUBS', '2', 2)];
    (engine as any).hands['p3'] = [createCard('CLUBS', '4', 4)];
    (engine as any).hands['p4'] = [createCard('CLUBS', '9', 9)];

    engine.playCard('p2', 'C_2');
    engine.playCard('p3', 'C_4');
    engine.playCard('p4', 'C_9');

    // P1 plays D_5
    const trickResult = engine.playCard('p1', 'D_5');
    expect(trickResult.trickCompleted).toBe(true);

    // Verify face-down tracking: caller card in previousTrickCards is still face-down!
    const publicState = engine.getPublicState();
    expect(publicState.previousTrickCards?.find((c) => c.playerId === 'p1')?.isFaceDown).toBe(true);
    expect(publicState.faceDownCallerCards.length).toBe(1);
    expect(publicState.faceDownCallerCards[0].card.id).toBe('D_5');
    expect(publicState.faceDownCallerCards[0].isRevealed).toBe(false);
    expect(publicState.faceDownCallerCards[0].trickNumber).toBe(1);

    // Starting Trick 2: faceDownCallerCards must still be present on table
    expect(engine.getPublicState().faceDownCallerCards.length).toBe(1);
  });

  it('blocks card plays for opponent void in lead until asking for Rung reveal, then allows caller to show Rung and returns control to opponent', () => {
    const { engine, createCard, p1RungCard } = setupGameWithFixedHands();

    // Have 1 face-down card already from Trick 1
    (engine as any).faceDownCallerCards = [
      { id: 'D_5', card: createCard('DIAMONDS', '5', 5), trickNumber: 1, isRevealed: false },
    ];

    // Trick 2: P1 leads H_2
    (engine as any).currentTurnPlayerIndex = 0;
    (engine as any).resetCurrentTrick(2, 'p1');
    (engine as any).hands['p1'] = [createCard('HEARTS', '2', 2), createCard('SPADES', '10', 10)];
    (engine as any).hands['p2'] = [createCard('SPADES', 'K', 13)]; // P2 has NO hearts!
    (engine as any).hands['p3'] = [createCard('HEARTS', '10', 10)];
    (engine as any).hands['p4'] = [createCard('HEARTS', '4', 4)];

    engine.playCard('p1', 'H_2');

    // It is now P2's turn, P2 is void in Hearts
    const p2Private = engine.getPrivateState('p2');
    expect(p2Private.canRequestRungReveal).toBe(true);
    // Crucial rule: P2 CANNOT play card from hand until Rung is revealed!
    expect(p2Private.legalPlayableCardIds.length).toBe(0);
    expect(() => engine.playCard('p2', 'S_K')).toThrow();

    // P2 asks to reveal Rung
    engine.requestTrumpReveal('p2');

    const pendingState = engine.getPublicState();
    expect(pendingState.isTrumpRevealPending).toBe(true);
    expect(pendingState.isTrumpRevealed).toBe(false);
    expect(engine.getPrivateState('p1').canShowTrump).toBe(true);
    expect(engine.getPrivateState('p2').canShowTrump).toBe(false);

    // Non-caller P2 cannot show trump
    expect(() => engine.showTrumpCard('p2')).toThrow();

    // Rung Caller P1 shows the Rung card!
    engine.showTrumpCard('p1');

    const revealedState = engine.getPublicState();
    expect(revealedState.isTrumpRevealPending).toBe(false);
    expect(revealedState.isTrumpRevealed).toBe(true);
    expect(revealedState.trumpSuit).toBe('SPADES');
    expect(revealedState.revealedTrumpCard?.id).toBe(p1RungCard.id);
    // Face-down card from trick 1 flips face-up in side panel and stays there for inspection!
    expect(revealedState.faceDownCallerCards.length).toBe(1);
    expect(revealedState.faceDownCallerCards[0].isRevealed).toBe(true);

    // Control returns to P2! P2 can now play S_K (active trump)
    const p2PrivateAfter = engine.getPrivateState('p2');
    expect(p2PrivateAfter.legalPlayableCardIds.includes('S_K')).toBe(true);

    engine.playCard('p2', 'S_K');
    // Once P2 (requester) plays their card, the side panel face-down cards are removed!
    expect(engine.getPublicState().faceDownCallerCards.length).toBe(0);

    engine.playCard('p3', 'H_10');
    const trick2Result = engine.playCard('p4', 'H_4');

    // P2 wins Trick 2 because Spades is now active trump!
    expect(trick2Result.trickCompleted).toBe(true);
    expect(trick2Result.trickWinner?.id).toBe('p2');

    // In subsequent turns when it is P1's turn, caller P1 can now play the chosen Rung Card
    (engine as any).currentTurnPlayerIndex = 0; // P1's turn
    (engine as any).resetCurrentTrick(3, 'p1');
    const p1PrivateAfter = engine.getPrivateState('p1');
    expect(p1PrivateAfter.isMyTrumpCardPlayable).toBe(true);
    expect(p1PrivateAfter.legalPlayableCardIds.includes(p1RungCard.id)).toBe(true);

    // Caller plays their chosen Rung card into trick 3
    engine.playCard('p1', p1RungCard.id);
    // Even after playing, revealedTrumpCard stays persistent for the whole game!
    expect(engine.getPublicState().revealedTrumpCard?.id).toBe(p1RungCard.id);
  });

  it('restricts Rung reveal requests to the opponent team only (caller teammate cannot ask)', () => {
    const { engine, createCard } = setupGameWithFixedHands();

    // P1 (TEAM 1) is Caller. P3 (TEAM 1) is teammate of P1.
    // Trick 1: P1 leads H_2, P2 plays H_9.
    // P3 (teammate) has NO hearts and only Diamonds/Clubs.
    (engine as any).hands['p1'] = [createCard('HEARTS', '2', 2)];
    (engine as any).hands['p2'] = [createCard('HEARTS', '9', 9)];
    (engine as any).hands['p3'] = [createCard('CLUBS', '4', 4)]; // No hearts!
    (engine as any).currentTurnPlayerIndex = 2; // P3's turn
    (engine as any).resetCurrentTrick(1, 'p1');
    (engine as any).currentTrick.cards = [
      { playerId: 'p1', card: createCard('HEARTS', '2', 2), playedAt: Date.now() },
      { playerId: 'p2', card: createCard('HEARTS', '9', 9), playedAt: Date.now() },
    ];
    (engine as any).currentTrick.leadSuit = 'HEARTS';

    const p3Private = engine.getPrivateState('p3');
    // P3 is on the caller's team, so P3 CANNOT request Rung reveal
    expect(p3Private.canRequestRungReveal).toBe(false);
    expect(() => engine.requestTrumpReveal('p3')).toThrow('Only the opponent team can ask to reveal Rung');
  });

  it('forces the revealer to play a Rung card if they have one, and allows subsequent players to over-trump', () => {
    const { engine, createCard } = setupGameWithFixedHands();

    // Trick: P1 leads H_2.
    // P2 (opponent) is void in Hearts, holds S_10 (Rung card) and C_2 (non-Rung).
    // P3 follows with H_10.
    // P4 (opponent) is also void in Hearts, holds S_K (higher Rung card).
    (engine as any).currentTurnPlayerIndex = 1; // P2's turn
    (engine as any).resetCurrentTrick(1, 'p1');
    (engine as any).currentTrick.leadSuit = 'HEARTS';
    (engine as any).currentTrick.cards = [
      { playerId: 'p1', card: createCard('HEARTS', '2', 2), playedAt: Date.now() },
    ];

    (engine as any).hands['p1'] = [];
    (engine as any).hands['p2'] = [createCard('SPADES', '10', 10), createCard('CLUBS', '2', 2)];
    (engine as any).hands['p3'] = [createCard('HEARTS', '10', 10)];
    (engine as any).hands['p4'] = [createCard('SPADES', 'K', 13)];

    // P2 asks to reveal Rung
    engine.requestTrumpReveal('p2');
    // Caller P1 shows Rung card
    engine.showTrumpCard('p1');

    // P2's legal cards MUST only be Rung cards (S_10), not C_2!
    const p2Legal = engine.getLegalCardsForPlayer('p2');
    expect(p2Legal.length).toBe(1);
    expect(p2Legal[0].id).toBe('S_10');

    // Attempting to play non-Rung card C_2 throws error
    expect(() => engine.playCard('p2', 'C_2')).toThrow();

    // P2 plays S_10 (Rung card)
    engine.playCard('p2', 'S_10');

    // P3 plays H_10 (following lead suit)
    engine.playCard('p3', 'H_10');

    // P4 also has no Hearts and plays higher Rung S_K
    const trickResult = engine.playCard('p4', 'S_K');

    // P4 won with higher Rung card (S_K beats S_10 and H_10) and takes lead for next trick!
    expect(trickResult.trickCompleted).toBe(true);
    expect(trickResult.trickWinner?.id).toBe('p4');
    expect(engine.getPublicState().currentTurnPlayerId).toBe('p4');
  });

  it('awards instant game win when the same opponent player wins 2 consecutive tricks starting from the trick Rung is revealed', () => {
    const { engine, createCard, p1RungCard } = setupGameWithFixedHands();

    // Trick 1: P1 leads H_A and wins Trick 1 (Rung unrevealed)
    (engine as any).currentTurnPlayerIndex = 0;
    (engine as any).resetCurrentTrick(1, 'p1');
    (engine as any).hands['p1'] = [createCard('HEARTS', 'A', 14), createCard('CLUBS', '2', 2), createCard('DIAMONDS', '2', 2)];
    (engine as any).hands['p2'] = [createCard('HEARTS', '5', 5), createCard('SPADES', 'A', 14), createCard('SPADES', 'K', 13)];
    (engine as any).hands['p3'] = [createCard('HEARTS', '2', 2), createCard('CLUBS', '3', 3), createCard('DIAMONDS', '3', 3)];
    (engine as any).hands['p4'] = [createCard('HEARTS', '3', 3), createCard('CLUBS', '4', 4), createCard('DIAMONDS', '4', 4)];

    engine.playCard('p1', 'H_A');
    engine.playCard('p2', 'H_5');
    engine.playCard('p3', 'H_2');
    const t1 = engine.playCard('p4', 'H_3');
    expect(t1.trickWinner?.id).toBe('p1');
    expect(engine.getPublicState().phase).toBe('TRICK_PLAYING');

    // Trick 2: P1 leads C_2. P2 is void in Clubs, asks to reveal Rung (Spades), caller shows Rung.
    // P2 plays S_A and wins Trick 2! (Trick 2 is the trick where Rung was revealed -> Streak = 1 for P2)
    engine.playCard('p1', 'C_2');
    engine.requestTrumpReveal('p2');
    engine.showTrumpCard('p1');
    engine.playCard('p2', 'S_A');
    engine.playCard('p3', 'C_3');
    const t2 = engine.playCard('p4', 'C_4');
    expect(t2.trickWinner?.id).toBe('p2');
    expect(engine.getPublicState().phase).toBe('TRICK_PLAYING'); // Streak = 1, game continues

    // Trick 3: P2 leads D_10 (Diamonds). P3 plays D_3, P4 plays D_4, P1 plays D_2.
    // P2 wins Trick 3! (Streak = 2)
    (engine as any).hands['p2'] = [createCard('DIAMONDS', '10', 10)];
    engine.playCard('p2', 'D_10');
    engine.playCard('p3', 'D_3');
    engine.playCard('p4', 'D_4');
    const t3 = engine.playCard('p1', 'D_2');

    // 2 consecutive tricks won by same opponent player (P2) starting from Rung reveal trick -> INSTANT GAME WIN!
    expect(t3.trickCompleted).toBe(true);
    expect(t3.trickWinner?.id).toBe('p2');
    expect(engine.getPublicState().phase).toBe('GAME_RESOLVED');
    expect(engine.getPublicState().statusMessage).toContain('BUND!');
    expect(engine.getPublicState().statusMessage).toContain('Team 2 WINS');
  });

  it('does NOT count tricks won BEFORE Rung is revealed towards the 2 consecutive streak', () => {
    const { engine, createCard } = setupGameWithFixedHands();

    // Close Rung mode (unrevealed)
    (engine as any).trumpMode = 'CLOSE_TRUMP';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = false;
    (engine as any).trumpCallerPlayerId = 'p1'; // P1 Team 1 is Caller, P2 Team 2 is Opponent

    (engine as any).currentTurnPlayerIndex = 0;
    (engine as any).resetCurrentTrick(1, 'p1');
    (engine as any).hands['p1'] = [createCard('HEARTS', '2', 2), createCard('HEARTS', '4', 4)];
    (engine as any).hands['p2'] = [createCard('HEARTS', 'A', 14), createCard('HEARTS', 'K', 13)];
    (engine as any).hands['p3'] = [createCard('HEARTS', '3', 3), createCard('HEARTS', '5', 5)];
    (engine as any).hands['p4'] = [createCard('HEARTS', '6', 6), createCard('HEARTS', '7', 7)];

    // Trick 1: P2 wins with H_A (Rung unrevealed -> Streak not active)
    engine.playCard('p1', 'H_2');
    engine.playCard('p2', 'H_A');
    engine.playCard('p3', 'H_3');
    const t1 = engine.playCard('p4', 'H_6');
    expect(t1.trickWinner?.id).toBe('p2');
    expect(engine.getPublicState().phase).toBe('TRICK_PLAYING');

    // Trick 2: P2 wins with H_K (Rung still unrevealed -> Streak remains 0)
    engine.playCard('p2', 'H_K');
    engine.playCard('p3', 'H_5');
    engine.playCard('p4', 'H_7');
    const t2 = engine.playCard('p1', 'H_4');
    expect(t2.trickWinner?.id).toBe('p2');

    // Game must NOT resolve because Rung was not revealed; it continues!
    expect(engine.getPublicState().phase).toBe('TRICK_PLAYING');
  });

  it('does NOT award early win when two different players on opponent team win consecutive tricks', () => {
    const { engine, createCard } = setupGameWithFixedHands();

    (engine as any).trumpMode = 'OPEN_TRUMP';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true;
    (engine as any).trumpCallerPlayerId = 'p1'; // P1/P3 Team 1. P2/P4 Team 2 (Opponent).

    (engine as any).currentTurnPlayerIndex = 0;
    (engine as any).resetCurrentTrick(2, 'p1'); // Starting Trick 2
    (engine as any).hands['p1'] = [createCard('HEARTS', '2', 2), createCard('CLUBS', '2', 2)];
    (engine as any).hands['p2'] = [createCard('HEARTS', 'A', 14), createCard('CLUBS', '3', 3)];
    (engine as any).hands['p3'] = [createCard('HEARTS', '3', 3), createCard('CLUBS', '4', 4)];
    (engine as any).hands['p4'] = [createCard('HEARTS', '4', 4), createCard('CLUBS', 'A', 14)];

    // Trick 2: P2 (Opponent) wins
    engine.playCard('p1', 'H_2');
    engine.playCard('p2', 'H_A');
    engine.playCard('p3', 'H_3');
    const t2 = engine.playCard('p4', 'H_4');
    expect(t2.trickWinner?.id).toBe('p2');
    expect(engine.getPublicState().phase).toBe('TRICK_PLAYING');

    // Trick 3: P4 (Different player on Opponent Team 2) wins
    engine.playCard('p2', 'C_3');
    engine.playCard('p3', 'C_4');
    engine.playCard('p4', 'C_A');
    const t3 = engine.playCard('p1', 'C_2');
    expect(t3.trickWinner?.id).toBe('p4');

    // Must be the SAME player to win 2 consecutive tricks! Game continues!
    expect(engine.getPublicState().phase).toBe('TRICK_PLAYING');
  });

  it('awards game victory to the team of the player who wins the 13th (final) trick when no team achieved a 2-streak', () => {
    const { engine, createCard } = setupGameWithFixedHands();

    (engine as any).trumpMode = 'CLOSE_TRUMP';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true;
    (engine as any).trumpCallerPlayerId = 'p1'; // P1/P3 Team 1, P2/P4 Team 2
    (engine as any).team1TricksWon = 8; // Team 1 has won 8 tricks previously
    (engine as any).team2TricksWon = 4; // Team 2 has won 4 tricks previously

    // 13th Trick is in progress: P1 leads H_2, P2 plays H_A, P3 plays H_3, P4 plays H_4
    // P2 (Team 2) wins the 13th trick!
    (engine as any).currentTurnPlayerIndex = 0;
    (engine as any).resetCurrentTrick(13, 'p1');
    (engine as any).hands['p1'] = [createCard('HEARTS', '2', 2)];
    (engine as any).hands['p2'] = [createCard('HEARTS', 'A', 14)];
    (engine as any).hands['p3'] = [createCard('HEARTS', '3', 3)];
    (engine as any).hands['p4'] = [createCard('HEARTS', '4', 4)];

    engine.playCard('p1', 'H_2');
    engine.playCard('p2', 'H_A');
    engine.playCard('p3', 'H_3');
    const t13 = engine.playCard('p4', 'H_4');

    expect(t13.trickCompleted).toBe(true);
    expect(t13.trickWinner?.id).toBe('p2');
    // Because P2 won the final (13th) trick, P2's team (Team 2) WINS Game 1!
    expect(engine.getPublicState().phase).toBe('GAME_RESOLVED');
    expect(engine.getPublicState().lastGameWinningTeam).toBe('TEAM_2');
    expect(engine.getPublicState().statusMessage).toContain('Game 1 Over!');
  });

  it('does NOT count Trick 1 toward 2-streak early win; player must win Tricks 2 & 3 to win game early', () => {
    const { engine, createCard } = setupGameWithFixedHands();

    (engine as any).trumpMode = 'OPEN_TRUMP';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true;
    (engine as any).trumpCallerPlayerId = 'p1'; // P1/P3 Team 1, P2/P4 Team 2 (Opponents)

    (engine as any).currentTurnPlayerIndex = 0;
    (engine as any).resetCurrentTrick(1, 'p1');
    (engine as any).hands['p1'] = [createCard('HEARTS', '2', 2), createCard('CLUBS', '2', 2), createCard('DIAMONDS', '2', 2)];
    (engine as any).hands['p2'] = [createCard('HEARTS', 'K', 13), createCard('CLUBS', 'K', 13), createCard('DIAMONDS', 'K', 13)];
    (engine as any).hands['p3'] = [createCard('HEARTS', '3', 3), createCard('CLUBS', '3', 3), createCard('DIAMONDS', '3', 3)];
    (engine as any).hands['p4'] = [createCard('HEARTS', '4', 4), createCard('CLUBS', '4', 4), createCard('DIAMONDS', '4', 4)];

    // Trick 1: P2 wins Trick 1
    engine.playCard('p1', 'H_2');
    engine.playCard('p2', 'H_K');
    engine.playCard('p3', 'H_3');
    const t1 = engine.playCard('p4', 'H_4');
    expect(t1.trickWinner?.id).toBe('p2');
    // Trick 1 does NOT count towards the 2-streak!
    expect((engine as any).playerConsecutiveTricksCount).toBe(0);
    expect(engine.getPublicState().phase).toBe('TRICK_PLAYING');

    // Trick 2: P2 wins Trick 2 (Streak count = 1)
    engine.playCard('p2', 'C_K');
    engine.playCard('p3', 'C_3');
    engine.playCard('p4', 'C_4');
    const t2 = engine.playCard('p1', 'C_2');
    expect(t2.trickWinner?.id).toBe('p2');
    expect((engine as any).playerConsecutiveTricksCount).toBe(1);
    expect(engine.getPublicState().phase).toBe('TRICK_PLAYING');

    // Trick 3: P2 wins Trick 3 (Streak count = 2 -> BUND! Early Game Win!)
    engine.playCard('p2', 'D_K');
    engine.playCard('p3', 'D_3');
    engine.playCard('p4', 'D_4');
    const t3 = engine.playCard('p1', 'D_2');
    expect(t3.trickWinner?.id).toBe('p2');
    expect(engine.getPublicState().phase).toBe('GAME_RESOLVED');
    expect(engine.getPublicState().statusMessage).toContain('BUND! Bob won 2 consecutive tricks (Tricks 2 & 3)');
  });

  it('enforces Consecutive Lead Ace Downgrade rule (second consecutive Ace is downgraded to value 2 and loses to a 3)', () => {
    const { engine, createCard } = setupGameWithFixedHands();

    (engine as any).trumpMode = 'OPEN_TRUMP';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true;
    (engine as any).trumpCallerPlayerId = 'p1';

    (engine as any).currentTurnPlayerIndex = 0;
    (engine as any).resetCurrentTrick(2, 'p1');
    (engine as any).hands['p1'] = [createCard('HEARTS', 'A', 14), createCard('CLUBS', 'A', 14)];
    (engine as any).hands['p2'] = [createCard('HEARTS', '2', 2), createCard('CLUBS', '3', 3)];
    (engine as any).hands['p3'] = [createCard('HEARTS', '3', 3), createCard('CLUBS', '2', 2)];
    (engine as any).hands['p4'] = [createCard('HEARTS', '4', 4), createCard('CLUBS', '2', 2)];

    // Trick 2: P1 wins with Ace of Hearts (rank 'A')
    engine.playCard('p1', 'H_A');
    engine.playCard('p2', 'H_2');
    engine.playCard('p3', 'H_3');
    const t2 = engine.playCard('p4', 'H_4');
    expect(t2.trickWinner?.id).toBe('p1');

    // Trick 3: P1 starts next trick with an Ace again (Ace of Clubs)
    // Rule: "if some player has played an Ace in a turn and if he starts the next turn with an Ace again then his second Ace will be considered like a 2 in value"
    engine.playCard('p1', 'C_A');
    // Verify that the played card has isAceDowngraded = true
    const currentTrick = engine.getPublicState().currentTrick;
    expect(currentTrick.cards[0].isAceDowngraded).toBe(true);

    // P2 follows with 3 of Clubs (value 3). P3 follows with 2 of Clubs. P4 follows with 2 of Clubs.
    engine.playCard('p2', 'C_3');
    engine.playCard('p3', 'C_2');
    const t3 = engine.playCard('p4', 'C_2');

    // Because P1's Ace was downgraded to value 2, P2's 3 of Clubs (value 3) BEATS the downgraded Ace!
    expect(t3.trickCompleted).toBe(true);
    expect(t3.trickWinner?.id).toBe('p2');
  });

  it('declares Bwinji with suit only during 5-card bidding without removing cards from hand, and leads face-down on Trick 1', () => {
    const { engine, createCard } = setupGameWithFixedHands();

    (engine as any).phase = 'BIDDING_PHASE';
    (engine as any).biddingTurnPlayerIndex = 0; // P1's turn to declare
    (engine as any).hands['p1'] = [
      createCard('HEARTS', 'A', 14),
      createCard('HEARTS', 'K', 13),
      createCard('HEARTS', 'Q', 12),
      createCard('HEARTS', 'J', 11),
      createCard('HEARTS', '10', 10),
    ];

    // P1 declares BWINJI with suit HEARTS (no card removed from hand!)
    engine.submitBid('p1', 'BWINJI', 'HEARTS', 'HEARTS');

    const publicState = engine.getPublicState();
    expect(publicState.trumpMode).toBe('BWINJI');
    expect(publicState.trumpSuit).toBe('HEARTS');
    expect(publicState.isTrumpRevealed).toBe(true);
    expect(publicState.trumpCardPlaced).toBe(false); // No card locked away
    expect(publicState.revealedTrumpCard).toBe(null); // Suit only
    expect(publicState.firstRoundOpenTrumpAvailable).toBe(false); // Locked

    // All cards are dealt, now Trick 1 begins
    expect(publicState.phase).toBe('TRICK_PLAYING');
    expect(publicState.currentTurnPlayerId).toBe('p1');

    // P1 leads Trick 1 face-down as a challenge
    const leadCard = engine.getPrivateState('p1').myHand[0];
    engine.declareBwinjiLead('p1', leadCard.id, true);

    const challengeState = engine.getPublicState();
    expect(challengeState.faceDownLeadPending).toBe(true);
    expect(challengeState.faceDownLeadPlayerId).toBe('p1');
    expect(challengeState.faceDownLeadCardFaceDown).toBe(true);

    // Defending team (P2/P4) accepts challenge to play (both players confirm)
    engine.respondToFaceDownRung('p2', true);
    expect(engine.getPublicState().faceDownLeadPending).toBe(true);
    engine.respondToFaceDownRung('p4', true);
    expect(engine.getPublicState().faceDownLeadPending).toBe(false);
    expect(engine.getPublicState().bwinjiModifier).toBe('FACE_DOWN_PLAY');
    // Verify that the card on the table is flipped to face-up!
    expect(engine.getPublicState().currentTrick.cards[0].isFaceDown).toBe(false);
  });
});

