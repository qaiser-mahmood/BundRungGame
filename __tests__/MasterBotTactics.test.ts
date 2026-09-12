import { describe, it, expect } from 'vitest';
import { BotPlayer } from '../server/ai/BotPlayer';
import { BundRungEngine } from '../server/engine/BundRungEngine';
import { Card } from '../shared/types';

describe('Bund Rung Master Tactical Invariants & Strategy', () => {
  const createCard = (suit: any, rank: any, playValue: number): Card => ({
    id: `${suit[0]}_${rank}`,
    suit,
    rank,
    playValue,
    tossValue: playValue === 14 ? 1 : playValue,
  });

  it('Opponent Trump: Bot with void immediately calls for Trump Reveal', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');         // Team 1
    engine.addPlayer('p2', 'Bob', true);     // Team 2 (Opponent Caller)
    engine.addPlayer('p3', 'Charlie');       // Team 1 (Bot teammate)
    engine.addPlayer('p4', 'David', true);   // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p2'; // Opponents called trump!
    (engine as any).isTrumpRevealed = false;    // Hidden Trump (Bund)
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).currentTurnPlayerIndex = 0; // P1's turn

    // Trick 1: P2 leads with Diamonds, P1 has NO Diamonds (Void)
    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p2',
      leadSuit: 'DIAMONDS',
      cards: [
        { playerId: 'p2', card: createCard('DIAMONDS', '10', 10), playedAt: Date.now() },
      ],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // P1's hand has only Hearts (void in Diamonds)
    const p1Hand = [createCard('HEARTS', '2', 2), createCard('HEARTS', '3', 3)];
    (engine as any).hands['p1'] = p1Hand;
    (engine.getPlayers()[0] as any).isBot = true;

    // Trigger bot turn
    BotPlayer.handleBotTurn(engine, 'p1');

    // Engine should have transitioned to Rung reveal pending!
    expect(engine.getPublicState().isTrumpRevealPending).toBe(true);
    expect(engine.getPublicState().isTrumpRevealed).toBe(false); // Waiting for caller to show
  });

  it('Anti-Ace Downgrade: Strictly forbids leading an Ace if last trick was won with an Ace lead', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true); // Team 1 (Bot)
    engine.addPlayer('p2', 'Bob');
    engine.addPlayer('p3', 'Charlie');
    engine.addPlayer('p4', 'Diana');

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).isTrumpRevealed = true;
    (engine as any).trumpSuit = 'CLUBS';

    // Last trick won by P1 with Ace of Hearts
    (engine as any).completedTricks = [
      {
        trickNumber: 1,
        leadPlayerId: 'p1',
        leadSuit: 'HEARTS',
        winnerPlayerId: 'p1',
        winningTeam: 'TEAM_1',
        cards: [
          { playerId: 'p1', card: createCard('HEARTS', 'A', 14), playedAt: 1 },
          { playerId: 'p2', card: createCard('HEARTS', '8', 8), playedAt: 2 },
          { playerId: 'p3', card: createCard('HEARTS', '2', 2), playedAt: 3 },
          { playerId: 'p4', card: createCard('HEARTS', '5', 5), playedAt: 4 },
        ],
      },
    ];
    (engine as any).lastTrickWinnerPlayerId = 'p1';
    (engine as any).lastTrickWinningCard = createCard('HEARTS', 'A', 14);

    // Current Trick: P1 is leading
    (engine as any).currentTrick = {
      trickNumber: 2,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // P1 holds Ace of Spades (14) AND King of Spades (13)
    const p1Hand = [
      createCard('SPADES', 'A', 14),
      createCard('SPADES', 'K', 13),
    ];
    (engine as any).hands['p1'] = p1Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // MUST NOT lead Ace of Spades! Must lead King to avoid downgrade to 2!
    expect(chosen.rank).not.toBe('A');
    expect(chosen.id).toBe('S_K');
  });

  it('Partner Void-Fishing Overtake: Overtakes partner small lead (<=9) when opponent is caller to take trick and return suit', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');        // Team 1 (Partner)
    engine.addPlayer('p2', 'Bob');          // Team 2 (Opponent Caller)
    engine.addPlayer('p3', 'Charlie', true);// Team 1 (Bot)
    engine.addPlayer('p4', 'Diana');        // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p2';
    (engine as any).isTrumpRevealed = false; // Hidden Trump

    // P1 (Partner) leads with small 4 of Hearts
    (engine as any).currentTrick = {
      trickNumber: 2,
      leadPlayerId: 'p1',
      leadSuit: 'HEARTS',
      cards: [
        { playerId: 'p1', card: createCard('HEARTS', '4', 4), playedAt: 1 },
        { playerId: 'p2', card: createCard('HEARTS', '7', 7), playedAt: 2 },
      ],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot P3 holds Ace of Hearts (14) and 3 of Hearts (3)
    const p3Hand = [createCard('HEARTS', 'A', 14), createCard('HEARTS', '3', 3)];
    (engine as any).hands['p3'] = p3Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p3',
      p3Hand,
      p3Hand,
      engine.getPublicState(),
      engine.getPrivateState('p3')
    );

    // Bot must overtake with Ace of Hearts so it wins and can return Hearts!
    expect(chosen.id).toBe('H_A');
  });

  it('Partner Honor Hold: Lets partner hold trick when partner leads high honor (>=10)', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');        // Team 1 (Partner)
    engine.addPlayer('p2', 'Bob');          // Team 2 (Opponent Caller)
    engine.addPlayer('p3', 'Charlie', true);// Team 1 (Bot)
    engine.addPlayer('p4', 'Diana');        // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p2';
    (engine as any).isTrumpRevealed = false;

    // P1 (Partner) leads with Ace of Hearts (14)
    (engine as any).currentTrick = {
      trickNumber: 2,
      leadPlayerId: 'p1',
      leadSuit: 'HEARTS',
      cards: [
        { playerId: 'p1', card: createCard('HEARTS', 'A', 14), playedAt: 1 },
        { playerId: 'p2', card: createCard('HEARTS', '7', 7), playedAt: 2 },
      ],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot P3 holds King of Hearts (13) and 3 of Hearts (3)
    const p3Hand = [createCard('HEARTS', 'K', 13), createCard('HEARTS', '3', 3)];
    (engine as any).hands['p3'] = p3Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p3',
      p3Hand,
      p3Hand,
      engine.getPublicState(),
      engine.getPrivateState('p3')
    );

    // Bot MUST NOT waste King of Hearts! Must play low 3 of Hearts.
    expect(chosen.id).toBe('H_3');
  });

  it('5-Card Long Suit Relentless Attack: Repeatedly attacks long suit to force voids and reveal Rung', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true);  // Team 1 (Bot Leader)
    engine.addPlayer('p2', 'Bob');          // Team 2 (Opponent Caller)
    engine.addPlayer('p3', 'Charlie');      // Team 1
    engine.addPlayer('p4', 'Diana');        // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p2';
    (engine as any).isTrumpRevealed = false;

    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot holds 5 Spades (A, K, 9, 8, 4) and 2 Clubs (2, 3)
    const p1Hand = [
      createCard('SPADES', 'A', 14),
      createCard('SPADES', 'K', 13),
      createCard('SPADES', '9', 9),
      createCard('SPADES', '8', 8),
      createCard('SPADES', '4', 4),
      createCard('CLUBS', '3', 3),
      createCard('CLUBS', '2', 2),
    ];
    (engine as any).hands['p1'] = p1Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Bot must lead from its 5-card Spades suit with highest card (Ace of Spades)!
    expect(chosen.suit).toBe('SPADES');
    expect(chosen.rank).toBe('A');
  });

  it('Protecting Rung: When stopping Rung from opening (caller team), bot must NOT return partner suit on next turn', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');         // Team 1 (Partner & Caller)
    engine.addPlayer('p2', 'Bob');           // Team 2
    engine.addPlayer('p3', 'Charlie', true); // Team 1 (Bot)
    engine.addPlayer('p4', 'Diana');         // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p1'; // OWN TEAM IS CALLER!
    (engine as any).isTrumpRevealed = false;    // STOPPING IT FROM OPENING!
    (engine as any).trumpSuit = 'SPADES';

    // Trick 1: Partner p1 led HEARTS
    (engine as any).completedTricks = [
      {
        trickNumber: 1,
        leadPlayerId: 'p1',
        leadSuit: 'HEARTS',
        winnerPlayerId: 'p3',
        winningTeam: 'TEAM_1',
        cards: [
          { playerId: 'p1', card: createCard('HEARTS', '8', 8), playedAt: 1 },
          { playerId: 'p2', card: createCard('HEARTS', '7', 7), playedAt: 2 },
          { playerId: 'p3', card: createCard('HEARTS', 'K', 13), playedAt: 3 },
          { playerId: 'p4', card: createCard('HEARTS', '4', 4), playedAt: 4 },
        ],
      },
    ];
    (engine as any).lastTrickWinnerPlayerId = 'p3';
    (engine as any).lastTrickWinningCard = createCard('HEARTS', 'K', 13);

    // Trick 2: Bot p3 is leading!
    (engine as any).currentTrick = {
      trickNumber: 2,
      leadPlayerId: 'p3',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot holds 1 card in partner's suit (HEARTS 3) and safe CLUBS cards
    const p3Hand = [
      createCard('HEARTS', '3', 3),     // Partner's suit! MUST NOT RETURN!
      createCard('CLUBS', 'A', 14),     // Safe Ace in another suit
      createCard('CLUBS', '8', 8),
    ];
    (engine as any).hands['p3'] = p3Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p3',
      p3Hand,
      p3Hand,
      engine.getPublicState(),
      engine.getPrivateState('p3')
    );

    // When protecting Rung, bot MUST NOT return partner's Hearts!
    expect(chosen.suit).not.toBe('HEARTS');
    expect(chosen.suit).toBe('CLUBS');
  });

  it('Trump Preservation & Off-Suit Clearing: Bot holding trumps and off-suit losers clears off-suit losers first to establish voids', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true); // Team 1 (Bot)
    engine.addPlayer('p2', 'Bob');          // Team 2
    engine.addPlayer('p3', 'Charlie');      // Team 1
    engine.addPlayer('p4', 'Diana');        // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true; // Trump is revealed (e.g. Bwinji or standard)

    // Current Trick: Bot is leading
    (engine as any).currentTrick = {
      trickNumber: 3,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot holds strong Trumps (SPADES A, K, 10, 8, 4), 1 singleton HEARTS 3, and 2 CLUBS (5, 7)
    const p1Hand = [
      createCard('SPADES', 'A', 14),   // Strong Trump
      createCard('SPADES', 'K', 13),   // Strong Trump
      createCard('SPADES', '10', 10),  // Trump
      createCard('SPADES', '8', 8),    // Trump
      createCard('SPADES', '4', 4),    // Trump
      createCard('HEARTS', '3', 3),    // Off-suit loser (singleton) -> MUST CLEAR THIS!
      createCard('CLUBS', '5', 5),     // Off-suit
      createCard('CLUBS', '7', 7),     // Off-suit
    ];
    (engine as any).hands['p1'] = p1Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Bot MUST NOT waste Trump cards early! Must discard off-suit loser (HEARTS 3) to create a void!
    expect(chosen.suit).not.toBe('SPADES');
    expect(chosen.suit).toBe('HEARTS');
    expect(chosen.rank).toBe('3');
  });

  it('Partner Initiated Suit Memory: Remembers suit partner started after winning in past tricks and returns it to reveal Rung', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');         // Team 1 (Partner)
    engine.addPlayer('p2', 'Bob');           // Team 2 (Opponent Caller)
    engine.addPlayer('p3', 'Charlie', true); // Team 1 (Bot)
    engine.addPlayer('p4', 'Diana');         // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p2'; // Opponents are caller!
    (engine as any).isTrumpRevealed = false;    // Rung is unrevealed

    // Trick 1: Partner (P1) won with Ace of Clubs
    // Trick 2: Partner (P1), having won Trick 1, started HEARTS (small 4 of Hearts to fish).
    // Opponent P2 won Trick 2 with King of Hearts. Bot P3 was not senior on Trick 2.
    // Trick 3: Opponent P2 led Diamonds. Bot P3 won Trick 3 with Ace of Diamonds!
    (engine as any).completedTricks = [
      {
        trickNumber: 1,
        leadPlayerId: 'p4',
        leadSuit: 'CLUBS',
        winnerPlayerId: 'p1', // Partner won trick 1!
        winningTeam: 'TEAM_1',
        cards: [
          { playerId: 'p4', card: createCard('CLUBS', '9', 9), playedAt: 1 },
          { playerId: 'p1', card: createCard('CLUBS', 'A', 14), playedAt: 2 },
          { playerId: 'p2', card: createCard('CLUBS', '7', 7), playedAt: 3 },
          { playerId: 'p3', card: createCard('CLUBS', '2', 2), playedAt: 4 },
        ],
      },
      {
        trickNumber: 2,
        leadPlayerId: 'p1',   // Partner started this trick after winning trick 1!
        leadSuit: 'HEARTS',
        winnerPlayerId: 'p2', // Opponent won trick 2 (Bot was not senior)
        winningTeam: 'TEAM_2',
        cards: [
          { playerId: 'p1', card: createCard('HEARTS', '4', 4), playedAt: 5 },
          { playerId: 'p2', card: createCard('HEARTS', 'K', 13), playedAt: 6 },
          { playerId: 'p3', card: createCard('HEARTS', '8', 8), playedAt: 7 },
          { playerId: 'p4', card: createCard('HEARTS', '2', 2), playedAt: 8 },
        ],
      },
      {
        trickNumber: 3,
        leadPlayerId: 'p2',
        leadSuit: 'DIAMONDS',
        winnerPlayerId: 'p3', // Bot won trick 3!
        winningTeam: 'TEAM_1',
        cards: [
          { playerId: 'p2', card: createCard('DIAMONDS', '10', 10), playedAt: 9 },
          { playerId: 'p3', card: createCard('DIAMONDS', 'A', 14), playedAt: 10 },
          { playerId: 'p4', card: createCard('DIAMONDS', '3', 3), playedAt: 11 },
          { playerId: 'p1', card: createCard('DIAMONDS', '5', 5), playedAt: 12 },
        ],
      },
    ];

    (engine as any).lastTrickWinnerPlayerId = 'p3';
    (engine as any).lastTrickWinningCard = createCard('DIAMONDS', 'A', 14);

    // Trick 4: Bot P3 is leading!
    (engine as any).currentTrick = {
      trickNumber: 4,
      leadPlayerId: 'p3',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot holds HEARTS 9 (partner's initiated suit) and other suits
    const p3Hand = [
      createCard('HEARTS', '9', 9),     // Partner's initiated fishing suit!
      createCard('CLUBS', '3', 3),
      createCard('DIAMONDS', '8', 8),
    ];
    (engine as any).hands['p3'] = p3Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p3',
      p3Hand,
      p3Hand,
      engine.getPublicState(),
      engine.getPrivateState('p3')
    );

    // Bot MUST remember partner started HEARTS after winning trick 1, and return HEARTS now!
    expect(chosen.suit).toBe('HEARTS');
    expect(chosen.rank).toBe('9');
  });

  it('Strategic Trump Preservation: Sloughs off-suit loser instead of burning Trump on low-value non-streak trick', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');        // Team 1
    engine.addPlayer('p2', 'Bob');          // Team 2 (Opponent)
    engine.addPlayer('p3', 'Charlie');      // Team 1
    engine.addPlayer('p4', 'Diana', true);  // Team 2 (Bot)

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true;

    // Trick 1 was won by Team 1, but then Trick 1 was completed and no streak is pending
    (engine as any).completedTricks = [
      {
        trickNumber: 1,
        leadPlayerId: 'p1',
        leadSuit: 'HEARTS',
        winnerPlayerId: null, // Table pile or no current streak
        winningTeam: null,
        cards: [
          { playerId: 'p1', card: createCard('HEARTS', 'A', 14), playedAt: 1 },
          { playerId: 'p2', card: createCard('HEARTS', 'K', 13), playedAt: 2 },
          { playerId: 'p3', card: createCard('HEARTS', '4', 4), playedAt: 3 },
          { playerId: 'p4', card: createCard('HEARTS', '2', 2), playedAt: 4 },
        ],
      },
    ];
    (engine as any).lastTrickWinnerPlayerId = null; // No streak pending!

    // Trick 2: Opponent P1 leads low 7 of DIAMONDS. P2 played 4 of DIAMONDS.
    (engine as any).currentTrick = {
      trickNumber: 2,
      leadPlayerId: 'p1',
      leadSuit: 'DIAMONDS',
      cards: [
        { playerId: 'p1', card: createCard('DIAMONDS', '7', 7), playedAt: 5 },
        { playerId: 'p2', card: createCard('DIAMONDS', '4', 4), playedAt: 6 },
        { playerId: 'p3', card: createCard('DIAMONDS', '5', 5), playedAt: 7 },
      ],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot P4 is void in Diamonds. It holds:
    // Trump: SPADES 10 (10)
    // Non-trump losers: CLUBS 3 (3), CLUBS 8 (8)
    const p4Hand = [
      createCard('SPADES', '10', 10), // Trump! Must preserve this!
      createCard('CLUBS', '3', 3),    // Off-suit loser -> slough this!
      createCard('CLUBS', '8', 8),
    ];
    (engine as any).hands['p4'] = p4Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p4',
      p4Hand,
      p4Hand,
      engine.getPublicState(),
      engine.getPrivateState('p4')
    );

    // Bot must preserve Trump (Spades 10) and slough off-suit loser (Clubs 3)!
    expect(chosen.suit).not.toBe('SPADES');
    expect(chosen.suit).toBe('CLUBS');
    expect(chosen.rank).toBe('3');
  });

  it('Streak Defense Trump Cut: Strictly cuts with Trump to break opponent 2-streak Hand threat', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');        // Team 1 (Opponent)
    engine.addPlayer('p2', 'Bob', true);    // Team 2 (Bot)
    engine.addPlayer('p3', 'Charlie');      // Team 1 (Opponent)
    engine.addPlayer('p4', 'Diana');        // Team 2 (Partner)

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true;

    // Opponent P1 WON Trick 1! (Threatening to complete a 2-streak Hand on Trick 2!)
    (engine as any).completedTricks = [
      {
        trickNumber: 1,
        leadPlayerId: 'p1',
        leadSuit: 'HEARTS',
        winnerPlayerId: 'p1',
        winningTeam: 'TEAM_1',
        cards: [
          { playerId: 'p1', card: createCard('HEARTS', 'A', 14), playedAt: 1 },
          { playerId: 'p2', card: createCard('HEARTS', '2', 2), playedAt: 2 },
          { playerId: 'p3', card: createCard('HEARTS', '4', 4), playedAt: 3 },
          { playerId: 'p4', card: createCard('HEARTS', '3', 3), playedAt: 4 },
        ],
      },
    ];
    (engine as any).lastTrickWinnerPlayerId = 'p1'; // Opponent winning streak active!

    // Trick 2: Opponent P1 leads DIAMONDS 8.
    (engine as any).currentTrick = {
      trickNumber: 2,
      leadPlayerId: 'p1',
      leadSuit: 'DIAMONDS',
      cards: [
        { playerId: 'p1', card: createCard('DIAMONDS', '8', 8), playedAt: 5 },
      ],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot P2 is void in Diamonds. It holds:
    // Trump: SPADES 5 (5)
    // Non-trump: CLUBS 3 (3)
    const p2Hand = [
      createCard('SPADES', '5', 5),  // Trump -> MUST CUT to defend streak!
      createCard('CLUBS', '3', 3),   // Off-suit
    ];
    (engine as any).hands['p2'] = p2Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p2',
      p2Hand,
      p2Hand,
      engine.getPublicState(),
      engine.getPrivateState('p2')
    );

    // Bot MUST cut with Trump (Spades 5) to deny opponent the 2-trick streak Hand!
    expect(chosen.suit).toBe('SPADES');
    expect(chosen.rank).toBe('5');
  });

  it('Second Hand Low Teamwork: Ducks with low card when playing 2nd and partner plays 4th on small lead', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');        // Team 1 (Opponent 1st)
    engine.addPlayer('p2', 'Bob', true);    // Team 2 (Bot 2nd)
    engine.addPlayer('p3', 'Charlie');      // Team 1 (Opponent 3rd)
    engine.addPlayer('p4', 'Diana');        // Team 2 (Partner 4th)

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true;

    // Trick 1: Opponent P1 leads small 5 of CLUBS
    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p1',
      leadSuit: 'CLUBS',
      cards: [
        { playerId: 'p1', card: createCard('CLUBS', '5', 5), playedAt: 1 },
      ],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot holds CLUBS Q (12) and CLUBS 3 (3)
    const p2Hand = [
      createCard('CLUBS', 'Q', 12),  // Queen (not boss, Ace & King unseen)
      createCard('CLUBS', '3', 3),   // Low card -> duck!
    ];
    (engine as any).hands['p2'] = p2Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p2',
      p2Hand,
      p2Hand,
      engine.getPublicState(),
      engine.getPrivateState('p2')
    );

    // Second Hand Low: Bot ducks with 3 of Clubs to let partner in 4th seat contest!
    expect(chosen.id).toBe('C_3');
  });

  it('Trump Quarantine Invariant: Caller holding Ace of Trump and Outside Ace leads Outside Ace, NOT Trump', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true);   // Team 1 (Bot Caller)
    engine.addPlayer('p2', 'Bob');           // Team 2
    engine.addPlayer('p3', 'Charlie');       // Team 1 (Partner)
    engine.addPlayer('p4', 'Diana');         // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p1';
    (engine as any).secretTrumpSuit = 'SPADES'; // Caller selected Spades!
    (engine as any).isTrumpRevealed = false;    // Close Rung

    // Trick 1: P1 is leading
    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // P1 holds Ace of Trump (Spades A) + Outside Ace (Hearts A) + small cards
    const p1Hand = [
      createCard('SPADES', 'A', 14),   // Secret Trump Ace -> MUST BE PRESERVED!
      createCard('SPADES', 'K', 13),   // Secret Trump King
      createCard('HEARTS', 'A', 14),   // Outside Ace -> Cash this!
      createCard('DIAMONDS', '5', 5),  // Outside small
    ];
    (engine as any).hands['p1'] = p1Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Bot MUST lead the Outside Ace (Hearts A), NEVER the Trump Ace!
    expect(chosen.suit).toBe('HEARTS');
    expect(chosen.rank).toBe('A');
  });

  it('Trump Quarantine Invariant: Caller in Close Rung never leads secret Trump suit if holding off-suit cards', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true);   // Team 1 (Bot Caller)
    engine.addPlayer('p2', 'Bob');           // Team 2
    engine.addPlayer('p3', 'Charlie');       // Team 1 (Partner)
    engine.addPlayer('p4', 'Diana');         // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p1';
    (engine as any).secretTrumpSuit = 'HEARTS';
    (engine as any).isTrumpRevealed = false;

    // Trick 1: P1 leads
    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // P1 holds 5 Hearts (Trump) including Ace, and 2 Clubs (off-suit)
    const p1Hand = [
      createCard('HEARTS', 'A', 14),
      createCard('HEARTS', 'K', 13),
      createCard('HEARTS', 'Q', 12),
      createCard('HEARTS', '9', 9),
      createCard('HEARTS', '6', 6),
      createCard('CLUBS', '7', 7),     // Off-suit
      createCard('CLUBS', '4', 4),     // Off-suit
    ];
    (engine as any).hands['p1'] = p1Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Bot MUST NOT lead Hearts (the secret trump)! It must lead from Clubs!
    expect(chosen.suit).toBe('CLUBS');
  });

  it('Caller without Ace of Trump leads Trump suit to flush opponents Ace out of game', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true);   // Team 1 (Bot Caller)
    engine.addPlayer('p2', 'Bob');           // Team 2
    engine.addPlayer('p3', 'Charlie');       // Team 1 (Partner)
    engine.addPlayer('p4', 'Diana');         // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p1';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).secretTrumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = false;

    // Trick 1: P1 leads
    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Caller holds trumps WITHOUT Ace (e.g. King, 9, 3) and off-suits (Hearts 7, Diamonds 8)
    const p1Hand = [
      createCard('SPADES', 'K', 13),
      createCard('SPADES', '9', 9),
      createCard('SPADES', '3', 3),
      createCard('HEARTS', '7', 7),
      createCard('DIAMONDS', '8', 8),
    ];
    (engine as any).hands['p1'] = p1Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Bot DOES NOT hold Ace of Trump, so it starts with SPADES to get opponents' Ace out of the game!
    expect(chosen.suit).toBe('SPADES');
  });

  it('Caller without Ace of Trump leads Trump suit to flush opponents Ace out of game early', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true);   // Team 1 (Bot Caller)
    engine.addPlayer('p2', 'Bob');           // Team 2
    engine.addPlayer('p3', 'Charlie');       // Team 1 (Partner)
    engine.addPlayer('p4', 'Diana');         // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p1';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).secretTrumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = false;

    // Trick 1: P1 leads
    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Caller holds 4 high trumps (King, Queen, Jack, 10) WITHOUT Ace, and an outside off-suit
    const p1Hand = [
      createCard('SPADES', 'K', 13),
      createCard('SPADES', 'Q', 12),
      createCard('SPADES', 'J', 11),
      createCard('SPADES', '10', 10),
      createCard('HEARTS', '5', 5), // Off-suit
    ];
    (engine as any).hands['p1'] = p1Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Bot does not hold Ace of Trump, so it starts with SPADES to flush opponents' Ace out of the game!
    expect(chosen.suit).toBe('SPADES');
  });

  it('Partner Suit-Change Trust: Bot sloughs weak card when partner won previous bot-led trick and changed suit', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true);   // Team 1 (Bot)
    engine.addPlayer('p2', 'Bob');           // Team 2
    engine.addPlayer('p3', 'Charlie');       // Team 1 (Partner)
    engine.addPlayer('p4', 'Diana');         // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true;

    // Trick 1: Bot P1 led CLUBS, Partner P3 won it with CLUBS Ace!
    (engine as any).completedTricks = [
      {
        trickNumber: 1,
        leadPlayerId: 'p1',
        leadSuit: 'CLUBS',
        winnerPlayerId: 'p3',
        winningTeam: 'TEAM_1',
        cards: [
          { playerId: 'p1', card: createCard('CLUBS', '5', 5), playedAt: 1 },
          { playerId: 'p2', card: createCard('CLUBS', '8', 8), playedAt: 2 },
          { playerId: 'p3', card: createCard('CLUBS', 'A', 14), playedAt: 3 },
          { playerId: 'p4', card: createCard('CLUBS', '2', 2), playedAt: 4 },
        ],
      },
    ];

    // Trick 2: Partner P3 changed suit and leads DIAMONDS 9 (9)!
    (engine as any).currentTrick = {
      trickNumber: 2,
      leadPlayerId: 'p3',
      leadSuit: 'DIAMONDS',
      cards: [
        { playerId: 'p3', card: createCard('DIAMONDS', '9', 9), playedAt: 5 },
        { playerId: 'p4', card: createCard('DIAMONDS', '4', 4), playedAt: 6 },
      ],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bot P1 holds DIAMONDS King (13) and DIAMONDS 3 (3)
    const p1Hand = [
      createCard('DIAMONDS', 'K', 13),
      createCard('DIAMONDS', '3', 3),
    ];
    (engine as any).hands['p1'] = p1Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Partner changed suit -> Partner holds high honors! Bot trusts partner and dumps the low 3 of Diamonds!
    expect(chosen.id).toBe('D_3');
  });

  it('Revealed Trump: Caller holding Ace of Rung NEVER starts trick with Rung suit even when hunting 2-streak', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true);   // Team 1 (Caller Bot)
    engine.addPlayer('p2', 'Bob');           // Team 2
    engine.addPlayer('p3', 'Charlie');       // Team 1 (Partner)
    engine.addPlayer('p4', 'Diana');         // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p1';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true;

    // Caller won Trick 1 with King of Clubs! Hunting 2-streak Bund!
    (engine as any).completedTricks = [
      {
        trickNumber: 1,
        leadPlayerId: 'p1',
        leadSuit: 'CLUBS',
        winnerPlayerId: 'p1',
        winningTeam: 'TEAM_1',
        cards: [
          { playerId: 'p1', card: createCard('CLUBS', 'K', 13), playedAt: 1 },
          { playerId: 'p2', card: createCard('CLUBS', '8', 8), playedAt: 2 },
          { playerId: 'p3', card: createCard('CLUBS', '4', 4), playedAt: 3 },
          { playerId: 'p4', card: createCard('CLUBS', '2', 2), playedAt: 4 },
        ],
      },
    ];
    (engine as any).lastTrickWinnerPlayerId = 'p1';

    // Trick 2: Caller P1 is leading!
    (engine as any).currentTrick = {
      trickNumber: 2,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Caller holds Ace of Trump + other trumps, and non-trump cards (Hearts 7, Diamonds 4)
    const p1Hand = [
      createCard('SPADES', 'A', 14),   // Trump Ace! MUST PROTECT!
      createCard('SPADES', 'K', 13),   // Trump King
      createCard('SPADES', '10', 10),  // Trump 10
      createCard('HEARTS', '7', 7),    // Non-trump
      createCard('DIAMONDS', '4', 4),  // Non-trump
    ];
    (engine as any).hands['p1'] = p1Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Caller MUST NOT start with Spades (Trump)! Must protect Trump and lead non-trump!
    expect(chosen.suit).not.toBe('SPADES');
  });

  it('Revealed Trump: Caller without Ace of Rung starts with Rung card to flush opponents Ace', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice', true);   // Team 1 (Caller Bot)
    engine.addPlayer('p2', 'Bob');           // Team 2
    engine.addPlayer('p3', 'Charlie');       // Team 1 (Partner)
    engine.addPlayer('p4', 'Diana');         // Team 2

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p1';
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true;

    // Trick 1: P1 leads
    (engine as any).currentTrick = {
      trickNumber: 1,
      leadPlayerId: 'p1',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Caller holds trumps WITHOUT Ace (King, Queen, 8), and off-suits
    const p1Hand = [
      createCard('SPADES', 'K', 13),
      createCard('SPADES', 'Q', 12),
      createCard('SPADES', '8', 8),
      createCard('HEARTS', '7', 7),
      createCard('CLUBS', '5', 5),
    ];
    (engine as any).hands['p1'] = p1Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p1',
      p1Hand,
      p1Hand,
      engine.getPublicState(),
      engine.getPrivateState('p1')
    );

    // Caller DOES NOT hold Ace of Trump -> MUST start with Spades (Trump) to flush opponents' Ace!
    expect(chosen.suit).toBe('SPADES');
  });

  it('Revealed Trump: Opponent AI holding Ace of Rung avoids leading Rung card to preserve stopper', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');         // Team 1 (Caller)
    engine.addPlayer('p2', 'Bob', true);     // Team 2 (Opponent Bot)
    engine.addPlayer('p3', 'Charlie');       // Team 1
    engine.addPlayer('p4', 'Diana');         // Team 2 (Partner)

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p1'; // Alice is caller
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true;

    // Trick 2: Opponent Bob is leading
    (engine as any).currentTrick = {
      trickNumber: 2,
      leadPlayerId: 'p2',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bob holds Ace of Trump (Spades A) and off-suit cards including Outside Boss Ace
    const p2Hand = [
      createCard('SPADES', 'A', 14),   // Ace of Trump! MUST KEEP FOR DEFENSE!
      createCard('HEARTS', 'A', 14),   // Outside Boss Ace -> Cash this!
      createCard('DIAMONDS', '6', 6),
    ];
    (engine as any).hands['p2'] = p2Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p2',
      p2Hand,
      p2Hand,
      engine.getPublicState(),
      engine.getPrivateState('p2')
    );

    // Opponent holding Ace of Trump MUST NOT lead Spades!
    expect(chosen.suit).not.toBe('SPADES');
    expect(chosen.suit).toBe('HEARTS');
  });

  it('Revealed Trump: Opponent AI without Ace of Rung runs Rung cards to weaken the Rung caller', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');         // Team 1 (Caller)
    engine.addPlayer('p2', 'Bob', true);     // Team 2 (Opponent Bot)
    engine.addPlayer('p3', 'Charlie');       // Team 1
    engine.addPlayer('p4', 'Diana');         // Team 2 (Partner)

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p1'; // Alice is caller
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = true;

    // Trick 2: Opponent Bob is leading
    (engine as any).currentTrick = {
      trickNumber: 2,
      leadPlayerId: 'p2',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Bob holds low/mid trumps WITHOUT Ace (Spades 7, Spades 4) and off-suits
    const p2Hand = [
      createCard('SPADES', '7', 7),    // Trump
      createCard('SPADES', '4', 4),    // Trump
      createCard('HEARTS', '8', 8),    // Off-suit non-boss
      createCard('DIAMONDS', '5', 5),  // Off-suit non-boss
    ];
    (engine as any).hands['p2'] = p2Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p2',
      p2Hand,
      p2Hand,
      engine.getPublicState(),
      engine.getPrivateState('p2')
    );

    // Opponent DOES NOT hold Ace of Trump -> MUST lead Spades (Trump) to bleed caller's trumps!
    expect(chosen.suit).toBe('SPADES');
  });

  it('Close Rung Teamwork: Opponent partner returns teammates attack suit whenever they win a trick to force reveal', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');         // Team 1 (Caller)
    engine.addPlayer('p2', 'Bob');           // Team 2 (Opponent Partner)
    engine.addPlayer('p3', 'Charlie');       // Team 1
    engine.addPlayer('p4', 'Diana', true);   // Team 2 (Opponent Bot)

    (engine as any).phase = 'TRICK_PLAYING';
    (engine as any).trumpCallerPlayerId = 'p1'; // Alice is caller
    (engine as any).trumpSuit = 'SPADES';
    (engine as any).isTrumpRevealed = false;    // Close Rung

    // Trick 1: Teammate Bob won Trick 1 with Ace of Clubs!
    // Trick 2: Teammate Bob started DIAMONDS (playing King of Diamonds) to attack and void opponents.
    // Caller Alice won Trick 2 with a high card.
    // Trick 3: Caller Alice led Hearts, Diana (bot) won Trick 3 with Ace of Hearts!
    (engine as any).completedTricks = [
      {
        trickNumber: 1,
        leadPlayerId: 'p2',
        leadSuit: 'CLUBS',
        winnerPlayerId: 'p2', // Bob won trick 1
        winningTeam: 'TEAM_2',
        cards: [
          { playerId: 'p2', card: createCard('CLUBS', 'A', 14), playedAt: 1 },
          { playerId: 'p3', card: createCard('CLUBS', '8', 8), playedAt: 2 },
          { playerId: 'p4', card: createCard('CLUBS', '4', 4), playedAt: 3 },
          { playerId: 'p1', card: createCard('CLUBS', '2', 2), playedAt: 4 },
        ],
      },
      {
        trickNumber: 2,
        leadPlayerId: 'p2',   // Bob led Diamonds after winning Trick 1! Attack suit!
        leadSuit: 'DIAMONDS',
        winnerPlayerId: 'p1', // Alice won
        winningTeam: 'TEAM_1',
        cards: [
          { playerId: 'p2', card: createCard('DIAMONDS', 'K', 13), playedAt: 5 },
          { playerId: 'p3', card: createCard('DIAMONDS', '3', 3), playedAt: 6 },
          { playerId: 'p4', card: createCard('DIAMONDS', '8', 8), playedAt: 7 },
          { playerId: 'p1', card: createCard('DIAMONDS', 'A', 14), playedAt: 8 },
        ],
      },
      {
        trickNumber: 3,
        leadPlayerId: 'p1',
        leadSuit: 'HEARTS',
        winnerPlayerId: 'p4', // Diana won Trick 3!
        winningTeam: 'TEAM_2',
        cards: [
          { playerId: 'p1', card: createCard('HEARTS', 'K', 13), playedAt: 9 },
          { playerId: 'p2', card: createCard('HEARTS', '3', 3), playedAt: 10 },
          { playerId: 'p3', card: createCard('HEARTS', '5', 5), playedAt: 11 },
          { playerId: 'p4', card: createCard('HEARTS', 'A', 14), playedAt: 12 },
        ],
      },
    ];

    (engine as any).lastTrickWinnerPlayerId = 'p4';

    // Trick 4: Diana (bot) is leading!
    (engine as any).currentTrick = {
      trickNumber: 4,
      leadPlayerId: 'p4',
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };

    // Diana holds Diamonds (partner Bob's attack suit) and other suits
    const p4Hand = [
      createCard('DIAMONDS', '5', 5),  // Partner's attack suit!
      createCard('HEARTS', '9', 9),
      createCard('CLUBS', '7', 7),
    ];
    (engine as any).hands['p4'] = p4Hand;

    const chosen = BotPlayer.chooseMasterCard(
      engine,
      'p4',
      p4Hand,
      p4Hand,
      engine.getPublicState(),
      engine.getPrivateState('p4')
    );

    // Diana MUST return Bob's attack suit (DIAMONDS) to void caller and force reveal!
    expect(chosen.suit).toBe('DIAMONDS');
    expect(chosen.rank).toBe('5');
  });
});
