import { describe, it, expect } from 'vitest';
import { BotPlayer } from '../server/ai/BotPlayer';
import { BundRungEngine } from '../server/engine/BundRungEngine';
import { Card } from '../shared/types';

describe('Master / Pro Level AI Bot Tests', () => {
  const createCard = (suit: any, rank: any, playValue: number): Card => ({
    id: `${suit[0]}_${rank}`,
    suit,
    rank,
    playValue,
    tossValue: playValue === 14 ? 1 : playValue,
  });

  it('detects Boss cards accurately based on played card memory', () => {
    const kingOfHearts = createCard('HEARTS', 'K', 13);
    const aceOfHearts = createCard('HEARTS', 'A', 14);

    // Ace of Hearts is not played yet -> King is NOT boss
    expect(BotPlayer.isBossCard(kingOfHearts, [], [kingOfHearts])).toBe(false);

    // Ace of Hearts is in played cards -> King IS boss!
    expect(BotPlayer.isBossCard(kingOfHearts, [aceOfHearts], [kingOfHearts])).toBe(true);

    // Ace of Hearts is in bot's own hand -> Ace is boss!
    expect(BotPlayer.isBossCard(aceOfHearts, [], [aceOfHearts, kingOfHearts])).toBe(true);
  });

  it('sloughs lowest card when teammate has already secured the trick with Boss Ace', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice'); // Team 1
    engine.addPlayer('p2', 'Bob');   // Team 2
    engine.addPlayer('p3', 'Charlie', true); // Team 1 (Bot)
    engine.addPlayer('p4', 'Diana');  // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).dealerIndex = 3;
    (engine as any).trumpMode = 'OPEN_TRUMP';
    (engine as any).trumpSuit = 'CLUBS';
    (engine as any).isTrumpRevealed = true;

    // Trick 1: P1 (Teammate) leads with Boss Ace of Hearts (H_A)
    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p1',
      leadSuit: 'HEARTS',
      cards: [
        { playerId: 'p1', card: createCard('HEARTS', 'A', 14), playedAt: Date.now() },
        { playerId: 'p2', card: createCard('HEARTS', '9', 9), playedAt: Date.now() },
      ],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot P3 has Hearts: King (13), Queen (12), 3 (3)
    const p3Hand = [
      createCard('HEARTS', 'K', 13),
      createCard('HEARTS', 'Q', 12),
      createCard('HEARTS', '3', 3),
    ];
    (engine as any).hands['p3'] = p3Hand;
    (engine as any).currentTurnPlayerIndex = 2; // P3's turn

    const chosenCard = BotPlayer.chooseMasterCard(
      engine,
      'p3',
      p3Hand,
      p3Hand,
      engine.getPublicState(),
      engine.getPrivateState('p3')
    );

    // Because teammate Alice (P1) is already winning with Ace of Hearts,
    // Bot must NOT waste King or Queen; it must play the lowest 3 of Hearts!
    expect(chosenCard.id).toBe('H_3');
  });

  it('wins cheaply against opponent without wasting highest honors', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice'); // Team 1
    engine.addPlayer('p2', 'Bob');   // Team 2
    engine.addPlayer('p3', 'Charlie', true); // Team 1 (Bot)
    engine.addPlayer('p4', 'Diana');  // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).dealerIndex = 3;
    (engine as any).trumpMode = 'OPEN_TRUMP';
    (engine as any).trumpSuit = 'CLUBS';
    (engine as any).isTrumpRevealed = true;

    // Trick 1: P2 (Opponent) leads Spades 8
    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p2',
      leadSuit: 'SPADES',
      cards: [
        { playerId: 'p2', card: createCard('SPADES', '8', 8), playedAt: Date.now() },
      ],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot P3 has Spades: 10 (10), King (13), Ace (14)
    const p3Hand = [
      createCard('SPADES', 'A', 14),
      createCard('SPADES', 'K', 13),
      createCard('SPADES', '10', 10),
    ];
    (engine as any).hands['p3'] = p3Hand;
    (engine as any).currentTurnPlayerIndex = 2;

    const chosenCard = BotPlayer.chooseMasterCard(
      engine,
      'p3',
      p3Hand,
      p3Hand,
      engine.getPublicState(),
      engine.getPrivateState('p3')
    );

    // Bot must win CHEAPLY with the 10 of Spades (10 > 8), preserving Ace and King!
    expect(chosenCard.id).toBe('S_10');
  });

  it('avoids leading a second consecutive Ace to prevent the Ace downgrade rule', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true); // Team 1 (Bot)
    engine.addPlayer('p2', 'Bob');   // Team 2
    engine.addPlayer('p3', 'Charlie');// Team 1
    engine.addPlayer('p4', 'Diana');  // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).dealerIndex = 3;
    (engine as any).trumpMode = 'OPEN_TRUMP';
    (engine as any).trumpSuit = 'CLUBS';
    (engine as any).isTrumpRevealed = true;

    // Bot P1 won Trick 1 with Ace of Spades
    (engine as any).lastTrickWinnerPlayerId = 'p1';
    (engine as any).lastTrickWinningCard = createCard('SPADES', 'A', 14);

    // Starting Trick 2
    (engine as any).currentTrick = {
      trickNumber: 2,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot P1 has Ace of Hearts and 10 of Diamonds
    const p1Hand = [
      createCard('HEARTS', 'A', 14),
      createCard('DIAMONDS', '10', 10),
    ];
    (engine as any).hands['p1'] = p1Hand;
    (engine as any).currentTurnPlayerIndex = 0;

    const chosenCard = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Bot avoids leading Ace of Hearts (which would be downgraded to 2), choosing Diamonds 10!
    expect(chosenCard.id).toBe('D_10');
  });

  it('hunts 2-streak Bund victory aggressively by leading Boss cards when team won previous trick', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true); // Team 1 (Bot)
    engine.addPlayer('p2', 'Bob');   // Team 2
    engine.addPlayer('p3', 'Charlie');// Team 1
    engine.addPlayer('p4', 'Diana');  // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).dealerIndex = 3;
    (engine as any).trumpMode = 'OPEN_TRUMP';
    (engine as any).trumpSuit = 'CLUBS';
    (engine as any).isTrumpRevealed = true;

    // Team 1 won Trick 2 with King of Spades
    (engine as any).lastTrickWinnerPlayerId = 'p1';
    (engine as any).lastTrickWinningCard = createCard('SPADES', 'K', 13);

    // Starting Trick 3 (Offensive Hunt for 2-Streak Victory!)
    (engine as any).currentTrick = {
      trickNumber: 3,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot P1 holds Boss Ace of Hearts and low 2 of Diamonds
    const p1Hand = [
      createCard('DIAMONDS', '2', 2),
      createCard('HEARTS', 'A', 14),
    ];
    (engine as any).hands['p1'] = p1Hand;
    (engine as any).currentTurnPlayerIndex = 0;

    const chosenCard = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Bot leads Boss Ace of Hearts to lock in the 2nd streak and win the game!
    expect(chosenCard.id).toBe('H_A');
  });

  it('Caller with weak trump holding starts with secret Rung suit to flush out opponents big trumps before reveal', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true); // Team 1 (Bot Caller)
    engine.addPlayer('p2', 'Bob');   // Team 2
    engine.addPlayer('p3', 'Charlie');// Team 1
    engine.addPlayer('p4', 'Diana');  // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).dealerIndex = 3;
    (engine as any).trumpMode = 'CLOSE_TRUMP';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = false;
    (engine as any).trumpCallerPlayerId = 'p1';

    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // P1 (Caller) has weak Spades holding (King, 9, 3 - no Ace, only 3 trumps)
    const p1Hand = [
      createCard('SPADES', 'K', 13),
      createCard('SPADES', '9', 9),
      createCard('SPADES', '3', 3),
      createCard('HEARTS', '7', 7),
      createCard('DIAMONDS', '8', 8),
    ];
    (engine as any).hands['p1'] = p1Hand;
    (engine as any).currentTurnPlayerIndex = 0;

    const chosenCard = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Bot must lead from SPADES (its secret Rung suit) to flush opponents' Ace/big trumps before reveal!
    expect(chosenCard.suit).toBe('SPADES');
  });

  it('Caller under-leads small card from Ace + smalls to clear weak cards and preserve Ace stopper', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true); // Team 1 (Bot Caller)
    engine.addPlayer('p2', 'Bob');   // Team 2
    engine.addPlayer('p3', 'Charlie');// Team 1
    engine.addPlayer('p4', 'Diana');  // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).dealerIndex = 3;
    (engine as any).trumpMode = 'CLOSE_TRUMP';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = false;
    (engine as any).trumpCallerPlayerId = 'p1';

    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // P1 holds Ace of Spades (strong trumps) and in Hearts holds Ace + 4 + 2
    const p1Hand = [
      createCard('SPADES', 'A', 14),
      createCard('SPADES', 'K', 13),
      createCard('SPADES', 'Q', 12),
      createCard('HEARTS', 'A', 14),
      createCard('HEARTS', '4', 4),
      createCard('HEARTS', '2', 2),
    ];
    (engine as any).hands['p1'] = p1Hand;
    (engine as any).currentTurnPlayerIndex = 0;

    const chosenCard = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Bot avoids leading H_A directly; it under-leads H_2 to clear weak cards & preserve H_A!
    expect(chosenCard.suit).toBe('HEARTS');
    expect(chosenCard.playValue).toBeLessThanOrEqual(9);
  });

  it('Opponent leads longest suit to maximize void probability and force early Rung reveal', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice'); // Team 1 (Caller)
    engine.addPlayer('p2', 'Bob', true);   // Team 2 (Bot Opponent)
    engine.addPlayer('p3', 'Charlie');// Team 1
    engine.addPlayer('p4', 'Diana');  // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).dealerIndex = 3;
    (engine as any).trumpMode = 'CLOSE_TRUMP';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = false;
    (engine as any).trumpCallerPlayerId = 'p1';

    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p2',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bob (Opponent) has a long suit in DIAMONDS (5 cards) and only 1 Club
    const p2Hand = [
      createCard('DIAMONDS', 'A', 14),
      createCard('DIAMONDS', 'K', 13),
      createCard('DIAMONDS', '10', 10),
      createCard('DIAMONDS', '7', 7),
      createCard('DIAMONDS', '3', 3),
      createCard('CLUBS', '2', 2),
    ];
    (engine as any).hands['p2'] = p2Hand;
    (engine as any).currentTurnPlayerIndex = 1;

    const chosenCard = BotPlayer.chooseMasterCard(
      engine,
      'p2',
      p2Hand,
      p2Hand,
      engine.getPublicState(),
      engine.getPrivateState('p2')
    );

    // Opponent leads from its longest suit (DIAMONDS) to catch caller/partner void and force reveal!
    expect(chosenCard.suit).toBe('DIAMONDS');
  });
});
