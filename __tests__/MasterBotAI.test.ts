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
});
