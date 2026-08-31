import { describe, it, expect } from 'vitest';
import { BundRungEngine } from '../server/engine/BundRungEngine';
import { Card } from '../shared/types';

describe('Close Rung Ace Downgrade & Trick 13 Resolution Tests', () => {
  const createCard = (suit: any, rank: any, playValue: number): Card => ({
    id: `${suit[0]}_${rank}`,
    suit,
    rank,
    playValue,
    tossValue: playValue === 14 ? 1 : playValue,
  });

  it('downgrades second consecutive lead Ace to 2 in Close Rung even when Rung is not yet revealed', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice'); // Team 1
    engine.addPlayer('p2', 'Bob');   // Team 2
    engine.addPlayer('p3', 'Charlie');// Team 1
    engine.addPlayer('p4', 'Diana');  // Team 2

    (engine as any).phase = 'BIDDING_PHASE';
    (engine as any).dealerIndex = 3;
    (engine as any).biddingTurnPlayerIndex = 0;

    const secretRungCard = createCard('CLUBS', 'K', 13);
    (engine as any).hands['p1'] = [
      secretRungCard,
      createCard('SPADES', 'A', 14),
      createCard('HEARTS', 'A', 14),
      createCard('DIAMONDS', '2', 2),
      createCard('DIAMONDS', '3', 3),
    ];
    (engine as any).hands['p2'] = [
      createCard('SPADES', '2', 2),
      createCard('HEARTS', '3', 3),
      createCard('DIAMONDS', '4', 4),
      createCard('DIAMONDS', '5', 5),
      createCard('DIAMONDS', '6', 6),
    ];
    (engine as any).hands['p3'] = [
      createCard('SPADES', '3', 3),
      createCard('HEARTS', '4', 4),
      createCard('DIAMONDS', '7', 7),
      createCard('DIAMONDS', '8', 8),
      createCard('DIAMONDS', '9', 9),
    ];
    (engine as any).hands['p4'] = [
      createCard('SPADES', '4', 4),
      createCard('HEARTS', '5', 5),
      createCard('DIAMONDS', '10', 10),
      createCard('DIAMONDS', 'J', 11),
      createCard('DIAMONDS', 'Q', 12),
    ];

    // P1 selects Secret Rung Card
    engine.submitBid('p1', 'SELECT_CARD_TRUMP', secretRungCard.id);
    engine.submitBid('p2', 'PASS');
    engine.submitBid('p3', 'PASS');
    engine.submitBid('p4', 'PASS');

    expect(engine.getPhase()).toBe('TRICK_PLAYING');
    expect(engine.getPublicState().isTrumpRevealed).toBe(false);

    // --- Trick 1: P1 leads Spades Ace (S_A) ---
    engine.playCard('p1', 'S_A');
    engine.playCard('p2', 'S_2');
    engine.playCard('p3', 'S_3');
    const t1Result = engine.playCard('p4', 'S_4');

    expect(t1Result.trickCompleted).toBe(true);
    expect(t1Result.trickWinner?.id).toBe('p1');
    expect(engine.getPublicState().lastTrickWinnerPlayerId).toBe('p1');

    // --- Trick 2: P1 leads with another Ace: Hearts Ace (H_A) ---
    // Under the consecutive lead Ace rule, this second Ace MUST be downgraded to 2 value!
    engine.playCard('p1', 'H_A');
    const trickCards = (engine as any).currentTrick.cards;
    expect(trickCards[0].isAceDowngraded).toBe(true);

    engine.playCard('p2', 'H_3'); // playValue 3 > downgraded Ace (2)
    engine.playCard('p3', 'H_4'); // playValue 4
    const t2Result = engine.playCard('p4', 'H_5'); // playValue 5

    expect(t2Result.trickCompleted).toBe(true);
    // Diana (P4) with H_5 beats Alice's downgraded H_A!
    expect(t2Result.trickWinner?.id).toBe('p4');
  });

  it('allows Rung caller to play Rung card on Trick 13 when Rung was never revealed, and resolves game cleanly', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice'); // Team 1
    engine.addPlayer('p2', 'Bob');   // Team 2
    engine.addPlayer('p3', 'Charlie');// Team 1
    engine.addPlayer('p4', 'Diana');  // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).dealerIndex = 3;
    (engine as any).trumpMode = 'CLOSE_TRUMP';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = false;
    (engine as any).trumpCallerPlayerId = 'p1';

    // Rung Caller has secret trump card (S_A) and 1 normal card (H_2)
    const secretRungCard = createCard('SPADES', 'A', 14);
    (engine as any).trumpCard = secretRungCard;
    (engine as any).hands['p1'] = [createCard('HEARTS', '2', 2)];
    (engine as any).hands['p2'] = [createCard('HEARTS', '3', 3), createCard('DIAMONDS', '3', 3)];
    (engine as any).hands['p3'] = [createCard('HEARTS', '4', 4), createCard('DIAMONDS', '4', 4)];
    (engine as any).hands['p4'] = [createCard('HEARTS', '5', 5), createCard('DIAMONDS', '5', 5)];

    // Set Trick 12 state
    (engine as any).currentTurnPlayerIndex = 0; // P1 starts Trick 12
    (engine as any).resetCurrentTrick(12, 'p1');

    // Play Trick 12
    engine.playCard('p1', 'H_2');
    engine.playCard('p2', 'H_3');
    engine.playCard('p3', 'H_4');
    const t12Result = engine.playCard('p4', 'H_5');

    expect(t12Result.trickCompleted).toBe(true);
    expect(t12Result.trickWinner?.id).toBe('p4');
    expect(engine.getPublicState().isTrumpRevealed).toBe(false);

    // --- Trick 13 (Final Turn): Rung was never revealed! ---
    // P1 now has 0 cards in hands['p1'], only the secret trumpCard (S_A)
    expect((engine as any).hands['p1'].length).toBe(0);

    // Diana (P4) leads Trick 13 with Diamonds 5
    (engine as any).currentTurnPlayerIndex = 3;
    engine.playCard('p4', 'D_5');

    // Next is Alice (P1). Legal cards must include the secret Rung card!
    const p1LegalCards = engine.getLegalCardsForPlayer('p1');
    expect(p1LegalCards.length).toBe(1);
    expect(p1LegalCards[0].id).toBe('S_A');

    const p1Private = engine.getPrivateState('p1');
    expect(p1Private.isMyTrumpCardPlayable).toBe(true);

    // P1 plays her secret Rung card on Trick 13
    engine.playCard('p1', 'S_A');
    expect(engine.getPublicState().isTrumpRevealed).toBe(true);

    // Bob (P2) and Charlie (P3) play their remaining cards
    engine.playCard('p2', 'D_3');
    const t13Result = engine.playCard('p3', 'D_4');

    expect(t13Result.trickCompleted).toBe(true);
    // Since Rung is now revealed as Spades, Alice's S_A wins Trick 13 as trump card!
    expect(t13Result.trickWinner?.id).toBe('p1');

    // Game is resolved and Team 1 wins Game 1!
    expect(engine.getPhase()).toBe('GAME_RESOLVED');
    expect(engine.getPublicState().lastGameWinningTeam).toBe('TEAM_1');
  });
});
