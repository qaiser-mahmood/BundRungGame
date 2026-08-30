import {
  Card,
  Player,
  GamePhase,
  SeatPosition,
  TeamId,
  TrumpMode,
  OpenTrumpModifier,
  BwinjiModifier,
  Trick,
  PlayedCard,
  Suit,
  PublicGameState,
  PrivatePlayerState,
  FullClientGameState,
  FaceDownCallerCard,
} from '../../shared/types';
import { Deck } from './Deck';
import { TossEngine } from './TossEngine';
import { ScoringEngine, ScoreCalculationInput } from './ScoringEngine';

export class BundRungEngine {
  private players: Player[] = [];
  private hands: { [playerId: string]: Card[] } = {};
  private phase: GamePhase = 'WAITING_FOR_PLAYERS';

  private deck: Deck = new Deck();
  private tossEngine: TossEngine = new TossEngine();
  private scoringEngine: ScoringEngine = new ScoringEngine();

  private dealerIndex: number = 0;
  private currentTurnPlayerIndex: number = 0;
  private gameIndex: number = 1;

  // Cut
  private cutOfferPlayerId: string | null = null;
  private cutDone: boolean = false;

  // Rung & Bidding
  private trumpMode: TrumpMode | null = null;
  private trumpSuit: Suit | null = null;
  private isTrumpRevealed: boolean = false;
  private trumpCallerPlayerId: string | null = null;
  private trumpCard: Card | null = null;
  private openTrumpModifier: OpenTrumpModifier | null = null;
  private bwinjiModifier: BwinjiModifier | null = null;
  private biddingPassCount: number = 0;
  private bwinjiChallengePassedCount: number = 0;
  private biddingTurnPlayerIndex: number = 0;
  private openTrumpDeclaredInRound1: boolean = false;

  // Face-down Rung Lead & Inspection State (Section 5.3)
  private faceDownLeadPending: boolean = false;
  private faceDownLeadPlayerId: string | null = null;
  private faceDownLeadCard: Card | null = null;
  private faceDownLeadCardFaceDown: boolean = false;
  private opponentsInspectingCards: boolean = false;
  private faceDownChallengeVotes: Map<string, 'ACCEPT' | 'SURRENDER'> = new Map();

  // Normal Play (Close Rung) Face-down Caller Cards & Pause
  private faceDownCallerCards: FaceDownCallerCard[] = [];
  private isRungRevealPaused: boolean = false;
  private isTrumpRevealPending: boolean = false;
  private trumpRevealRequesterId: string | null = null;
  private rungRevealerPlayerId: string | null = null;
  private previousTrickCards: PlayedCard[] | null = null;
  private chosenTrumpCard: Card | null = null; // Stays persistent for the entire game even when played

  // Trick Play
  private currentTrick: Trick = {
    trickNumber: 1,
    leadPlayerId: '',
    leadSuit: null,
    cards: [],
    winnerPlayerId: null,
    winningTeam: null,
  };
  private completedTricks: Trick[] = [];
  private team1TricksWon: number = 0;
  private team2TricksWon: number = 0;
  private consecutiveTricksCount: number = 0;
  private lastTrickWinnerTeam: TeamId | null = null;
  private lastTrickWinnerPlayerId: string | null = null;
  private lastTrickWinningCard: Card | null = null;
  private playerConsecutiveTricksCount: number = 0;

  // Show Cards & Surrender
  private shownHandPlayerIds: Set<string> = new Set();
  private surrenderVotes: { TEAM_1: Set<string>; TEAM_2: Set<string> } = {
    TEAM_1: new Set(),
    TEAM_2: new Set(),
  };

  // Match / KHOTI
  private isMatchOver: boolean = false;
  private isStartingNewMatch: boolean = false;
  private losingTeamKhoti: TeamId | null = null;
  private matchWinnerTeam: TeamId | null = null;
  private lastGameWinningTeam: TeamId | null = null;
  private statusMessage: string = 'Waiting for other players to join...';
  private customTeamNames: { [team in TeamId]?: string } = {};

  // Pending Open Rung Selection
  private pendingOpenRungSuit: Suit | null = null;
  private pendingOpenRungPlayerId: string | null = null;

  constructor() {
    this.resetLobby();
  }

  public resetLobby(): void {
    this.players = [];
    this.hands = {};
    this.phase = 'WAITING_FOR_PLAYERS';
    this.deck = new Deck();
    this.tossEngine = new TossEngine();
    this.scoringEngine = new ScoringEngine();
    this.dealerIndex = 0;
    this.currentTurnPlayerIndex = 0;
    this.gameIndex = 1;
    this.cutOfferPlayerId = null;
    this.cutDone = false;
    this.trumpMode = null;
    this.trumpSuit = null;
    this.isTrumpRevealed = false;
    this.trumpCallerPlayerId = null;
    this.trumpCard = null;
    this.openTrumpModifier = null;
    this.bwinjiModifier = null;
    this.biddingPassCount = 0;
    this.bwinjiChallengePassedCount = 0;
    this.openTrumpDeclaredInRound1 = false;
    this.pendingOpenRungSuit = null;
    this.pendingOpenRungPlayerId = null;
    this.faceDownLeadPending = false;
    this.faceDownLeadPlayerId = null;
    this.faceDownLeadCard = null;
    this.faceDownLeadCardFaceDown = false;
    this.opponentsInspectingCards = false;
    this.faceDownCallerCards = [];
    this.isRungRevealPaused = false;
    this.rungRevealerPlayerId = null;
    this.previousTrickCards = null;
    this.completedTricks = [];
    this.team1TricksWon = 0;
    this.team2TricksWon = 0;
    this.consecutiveTricksCount = 0;
    this.lastTrickWinnerTeam = null;
    this.lastTrickWinnerPlayerId = null;
    this.lastTrickWinningCard = null;
    this.playerConsecutiveTricksCount = 0;
    this.shownHandPlayerIds.clear();
    this.surrenderVotes.TEAM_1.clear();
    this.surrenderVotes.TEAM_2.clear();
    this.isMatchOver = false;
    this.losingTeamKhoti = null;
    this.matchWinnerTeam = null;
    this.statusMessage = 'Waiting for other players to join...';
    this.resetCurrentTrick(1, '');
  }

  // --- Seat & Player Management ---
  public addPlayer(id: string, name: string, isBot: boolean = false): Player {
    if (this.players.length >= 4) {
      throw new Error('Game room is full (4 players already joined)');
    }
    const existingIndex = this.players.findIndex((p) => p.id === id);
    if (existingIndex !== -1) {
      this.players[existingIndex].name = name;
      this.players[existingIndex].isConnected = true;
      return this.players[existingIndex];
    }

    const seats: SeatPosition[] = ['BOTTOM', 'RIGHT', 'TOP', 'LEFT'];
    const seat = seats[this.players.length];
    // Section 2.2: Opposite Seating Requirement (Team 1 at Top/Bottom; Team 2 at Left/Right)
    const team: TeamId = seat === 'BOTTOM' || seat === 'TOP' ? 'TEAM_1' : 'TEAM_2';

    const player: Player = {
      id,
      name: name || `Player ${this.players.length + 1}`,
      seat,
      team,
      isBot,
      isDealer: false,
      cardsInHandCount: 0,
      isConnected: true,
    };

    this.players.push(player);
    this.hands[id] = [];

    if (this.players.length === 4) {
      this.phase = 'TEAM_FORMATION';
      this.statusMessage = 'All 4 players connected. Form teams or proceed to Toss!';
    } else {
      this.statusMessage = `Waiting for players to join (${this.players.length}/4)...`;
    }

    return player;
  }

  public removePlayer(playerId: string): { removedPlayerName: string; remainingCount: number } {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx === -1) {
      return { removedPlayerName: 'A player', remainingCount: this.players.length };
    }

    const removedPlayer = this.players[idx];
    this.players.splice(idx, 1);
    delete this.hands[playerId];

    // Reset entire game / match state back to waiting lobby
    this.deck.reset();
    this.tossEngine.reset(this.players.map((p) => p.id));
    this.dealerIndex = 0;
    this.currentTurnPlayerIndex = 0;
    this.cutOfferPlayerId = null;
    this.cutDone = false;
    this.trumpMode = null;
    this.trumpSuit = null;
    this.isTrumpRevealed = false;
    this.trumpCallerPlayerId = null;
    this.trumpCard = null;
    this.openTrumpModifier = null;
    this.bwinjiModifier = null;
    this.biddingPassCount = 0;
    this.openTrumpDeclaredInRound1 = false;
    this.faceDownCallerCards = [];
    this.isRungRevealPaused = false;
    this.rungRevealerPlayerId = null;
    this.previousTrickCards = null;
    this.completedTricks = [];
    this.team1TricksWon = 0;
    this.team2TricksWon = 0;
    this.consecutiveTricksCount = 0;
    this.lastTrickWinnerTeam = null;
    this.lastTrickWinnerPlayerId = null;
    this.playerConsecutiveTricksCount = 0;
    this.isMatchOver = false;
    this.losingTeamKhoti = null;
    this.matchWinnerTeam = null;
    this.gameIndex = 1;
    this.scoringEngine.resetMatch();
    this.resetCurrentTrick(1, '');

    // Reset hands and dealer status for remaining players
    for (const p of this.players) {
      this.hands[p.id] = [];
      p.cardsInHandCount = 0;
      p.isDealer = false;
    }

    // Re-align remaining players to seats and teams
    this.refreshSeatsAndTeams();

    this.phase = 'WAITING_FOR_PLAYERS';
    this.statusMessage = `${removedPlayer.name} has left the match. Waiting for players to join (${this.players.length}/4)...`;

    return {
      removedPlayerName: removedPlayer.name,
      remainingCount: this.players.length,
    };
  }

  public fillWithBots(): void {
    const botNames = ['Zara (AI)', 'Arjun (AI)', 'Bilal (AI)'];
    let nameIdx = 0;
    while (this.players.length < 4) {
      const botId = `bot_${Date.now()}_${this.players.length + 1}`;
      this.addPlayer(botId, botNames[nameIdx++] || `Bot ${this.players.length + 1}`, true);
    }
  }

  public swapPlayerSeats(player1Id: string, player2Id: string): void {
    const idx1 = this.players.findIndex((p) => p.id === player1Id);
    const idx2 = this.players.findIndex((p) => p.id === player2Id);
    if (idx1 === -1 || idx2 === -1) {
      throw new Error('One or both players not found');
    }

    [this.players[idx1], this.players[idx2]] = [this.players[idx2], this.players[idx1]];
    this.refreshSeatsAndTeams();
  }

  public assignTeams(team1PlayerIds: string[], team2PlayerIds: string[]): void {
    if (team1PlayerIds.length !== 2 || team2PlayerIds.length !== 2) {
      throw new Error('Each team must have exactly 2 players');
    }

    const p1 = this.players.find((p) => p.id === team1PlayerIds[0]);
    const p2 = this.players.find((p) => p.id === team2PlayerIds[0]);
    const p3 = this.players.find((p) => p.id === team1PlayerIds[1]);
    const p4 = this.players.find((p) => p.id === team2PlayerIds[1]);

    if (!p1 || !p2 || !p3 || !p4) {
      throw new Error('Invalid player IDs for team assignment');
    }

    // Set order: P1 (Bottom, Team 1), P2 (Right, Team 2), P3 (Top, Team 1), P4 (Left, Team 2)
    this.players = [p1, p2, p3, p4];
    this.refreshSeatsAndTeams();
  }

  private refreshSeatsAndTeams(): void {
    const seats: SeatPosition[] = ['BOTTOM', 'RIGHT', 'TOP', 'LEFT'];
    this.players.forEach((p, idx) => {
      p.seat = seats[idx];
      p.team = idx === 0 || idx === 2 ? 'TEAM_1' : 'TEAM_2';
    });
  }

  public setTeamAndSeat(playerId: string, team: TeamId, seat: SeatPosition): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error('Player not found');
    player.team = team;
    player.seat = seat;
  }

  // --- Phase 3: Interactive Toss Mechanics ---
  public startInitialToss(): void {
    if (this.players.length !== 4) {
      throw new Error('Cannot start toss without 4 players');
    }
    this.phase = 'INITIAL_TOSS';
    this.scoringEngine.resetMatch(); // Reset scorecard to 0 for every toss
    this.gameIndex = 1;
    this.previousTrickCards = null;
    this.openTrumpDeclaredInRound1 = false;
    this.tossEngine.reset(this.players.map((p) => p.id));
    this.statusMessage = 'Match Toss: Pick a card to determine the Dealer (Lowest card deals)';
  }

  public drawTossCard(playerId: string, cardIndex: number): Card {
    if (this.phase !== 'INITIAL_TOSS' && this.phase !== 'TOSS_TIE_BREAKER') {
      throw new Error('Not in toss phase');
    }
    const card = this.tossEngine.drawCard(playerId, cardIndex);
    const result = this.tossEngine.evaluateRound();

    if (result.isComplete && result.dealerPlayerId) {
      const dealerId = result.dealerPlayerId;
      this.dealerIndex = this.players.findIndex((p) => p.id === dealerId);
      this.players.forEach((p, idx) => (p.isDealer = idx === this.dealerIndex));

      this.phase = 'TOSS_COMPLETE';
      const dealer = this.players[this.dealerIndex];
      const winningDraw = result.draws[dealerId];
      const cardDesc = winningDraw ? ` (${winningDraw.rank} of ${winningDraw.suit})` : '';
      const tieNote = result.roundNumber > 1 ? ` (after Round ${result.roundNumber} tie-breaker)` : '';
      this.statusMessage = `${dealer.name} drew the lowest card${cardDesc}${tieNote} and is the dealer. ${dealer.name} must click 'Distribute 5 Cards' to deal.`;
    } else if (result.tiedPlayerIds.length > 1) {
      this.phase = 'TOSS_TIE_BREAKER';
      const tiedNames = result.tiedPlayerIds
        .map((pid) => this.players.find((p) => p.id === pid)?.name)
        .join(' & ');
      const tiedCard = result.draws[result.tiedPlayerIds[0]];
      const cardDesc = tiedCard ? ` (${tiedCard.rank} of ${tiedCard.suit})` : '';
      this.statusMessage = `Toss Tie! ${tiedNames} drew identical lowest cards${cardDesc}! Only ${tiedNames} must draw another card from the deck to decide the Dealer.`;
    } else if (this.phase === 'TOSS_TIE_BREAKER') {
      const pendingTied = this.tossEngine.getActivePlayerIds()
        .filter((pid) => !this.tossEngine.hasPlayerDrawnThisRound(pid))
        .map((pid) => this.players.find((p) => p.id === pid)?.name)
        .join(' & ');
      if (pendingTied) {
        this.statusMessage = `Tie-Breaker in progress: Waiting for ${pendingTied} to pick their card from the deck...`;
      }
    }
    return card;
  }

  public dealerDistributeCards(playerId: string): void {
    const dealer = this.players[this.dealerIndex];
    if (!dealer || dealer.id !== playerId) {
      throw new Error('Only the designated dealer can distribute cards');
    }
    if (this.phase !== 'TOSS_COMPLETE') {
      throw new Error('Not in toss complete phase');
    }
    this.deck.reset();
    // Do NOT auto-shuffle: Dealer decides whether to shuffle or offer cut directly
    this.phase = 'PRE_DEAL_SHUFFLE';
    this.cutDone = false;
    this.cutOfferPlayerId = null;
    this.statusMessage = `${dealer.name} is the dealer. You may shuffle the deck or offer cut directly.`;
  }

  // --- Phase 4: Shuffling, Cutting & Card Distribution ---
  public dealerShuffle(playerId: string): void {
    const dealer = this.players[this.dealerIndex];
    if (dealer.id !== playerId) {
      throw new Error('Only the active dealer can shuffle the deck');
    }
    if (this.phase !== 'PRE_DEAL_SHUFFLE') {
      throw new Error('Not in shuffle phase');
    }
    if (this.cutDone) {
      throw new Error('Deck has already been cut and cannot be reshuffled');
    }
    this.deck.reset();
    this.deck.shuffle();
    this.statusMessage = `${dealer.name} shuffled the deck. Dealer must click "Offer Cut".`;
  }

  public dealerOfferCut(playerId: string): void {
    const dealer = this.players[this.dealerIndex];
    if (dealer.id !== playerId) {
      throw new Error('Only the active dealer can offer cut');
    }
    // Section 4.2: Cut player is the player to the Dealer's Right / counter-clockwise
    // (dealerIndex + 1) % 4
    const cutPlayerIndex = (this.dealerIndex + 1) % 4;
    this.cutOfferPlayerId = this.players[cutPlayerIndex].id;
    this.cutDone = false;
    this.phase = 'PRE_DEAL_CUT';
    this.statusMessage = `Cut Offered: ${this.players[cutPlayerIndex].name} must select a card to cut and swap the deck.`;
  }

  public performCut(playerId: string, cardIndex: number): void {
    if (this.phase !== 'PRE_DEAL_CUT' || this.cutOfferPlayerId !== playerId) {
      throw new Error('Not your turn to cut the deck');
    }
    this.deck.cut(cardIndex);
    this.cutDone = true;
    this.phase = 'PRE_DEAL_SHUFFLE'; // Return control to Dealer
    const dealer = this.players[this.dealerIndex];
    const cutPlayer = this.players.find((p) => p.id === playerId);
    this.statusMessage = `${cutPlayer?.name || 'Opponent'} cut the deck. ${dealer.name} must now distribute 5 cards.`;
  }

  public dealerDistribute5Cards(playerId: string): void {
    const dealer = this.players[this.dealerIndex];
    if (!dealer || dealer.id !== playerId) {
      throw new Error('Only the designated dealer can distribute cards');
    }
    if (this.phase !== 'PRE_DEAL_SHUFFLE' || !this.cutDone) {
      throw new Error('Deck must be cut before distributing cards');
    }
    this.statusMessage = `${dealer.name} distributed 5 cards each.`;
    this.dealFirstPass();
  }

  private getCounterClockwiseOrder(fromIndex: number): string[] {
    const order: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const idx = (fromIndex + i) % 4;
      order.push(this.players[idx].id);
    }
    return order;
  }

  public static sortHand(cards: Card[]): Card[] {
    const suitOrder: Record<Suit, number> = {
      SPADES: 0,
      HEARTS: 1,
      CLUBS: 2,
      DIAMONDS: 3,
    };

    return [...cards].sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return b.playValue - a.playValue; // High to low (Ace -> King -> ... -> 2)
    });
  }

  public dealFirstPass(): void {
    this.phase = 'DEALING_PASS_1';
    const order = this.getCounterClockwiseOrder(this.dealerIndex);
    this.hands = this.deck.dealFirstPass(order);

    for (const p of this.players) {
      if (this.hands[p.id]) {
        this.hands[p.id] = BundRungEngine.sortHand(this.hands[p.id]);
      }
      p.cardsInHandCount = this.hands[p.id]?.length || 0;
    }

    // Move to Bidding Phase starting from player to Dealer's Right
    this.phase = 'BIDDING_PHASE';
    this.biddingTurnPlayerIndex = (this.dealerIndex + 1) % 4;
    this.biddingPassCount = 0;
    this.bwinjiChallengePassedCount = 0;
    const firstBidder = this.players[this.biddingTurnPlayerIndex];
    this.statusMessage = `5 cards dealt. ${firstBidder.name}'s turn to declare Rung (Close Rung, Bwinji, or Pass).`;
  }

  // --- Phase 5: Bidding & Rung Selection ---
  public submitBid(
    playerId: string,
    action: 'SELECT_CARD_TRUMP' | 'BWINJI' | 'PASS',
    cardIdOrSuit?: string,
    fallbackSuit?: Suit,
    modifier?: 'FACE_UP' | 'FACE_DOWN_PLAY'
  ): void {
    if (this.phase !== 'BIDDING_PHASE') {
      throw new Error('Game is not in bidding phase');
    }
    const currentBidder = this.players[this.biddingTurnPlayerIndex];
    if (currentBidder.id !== playerId) {
      throw new Error('Not your turn to declare rung or pass');
    }

    if (action === 'PASS') {
      if (this.trumpMode === 'CLOSE_TRUMP') {
        // A Rung card was already selected by a previous player; this pass declines to call Bwinji!
        this.bwinjiChallengePassedCount += 1;
        const remainingPlayersToChallenge = 3 - this.biddingPassCount;

        if (this.bwinjiChallengePassedCount >= remainingPlayersToChallenge) {
          // All remaining players who had not passed yet declined to call Bwinji. Close Rung is confirmed!
          const caller = this.players.find((p) => p.id === this.trumpCallerPlayerId);
          this.statusMessage = `All remaining players passed on Bwinji. ${caller?.name || 'Caller'}'s Secret Rung is locked! Dealing remaining cards...`;
          this.dealRemainingPasses();
          return;
        }
        this.biddingTurnPlayerIndex = (this.biddingTurnPlayerIndex + 1) % 4;
        const nextBidder = this.players[this.biddingTurnPlayerIndex];
        this.statusMessage = `${currentBidder.name} passed on Bwinji. ${nextBidder.name} can Call BWINJI or Pass.`;
        return;
      }

      // Normal Pass (No Rung chosen yet)
      const isLastBidderMustChoose = this.biddingPassCount === 3;
      if (isLastBidderMustChoose) {
        throw new Error('Dealer is the 4th bidder and MUST declare a rung card or Bwinji');
      }
      this.biddingPassCount += 1;
      this.biddingTurnPlayerIndex = (this.biddingTurnPlayerIndex + 1) % 4;
      const nextBidder = this.players[this.biddingTurnPlayerIndex];
      const mustDeclareText = this.biddingPassCount === 3 ? ' (MUST declare rung)' : '';
      this.statusMessage = `${currentBidder.name} passed. ${nextBidder.name}'s turn${mustDeclareText}.`;
      return;
    }

    const hand = this.hands[playerId] || [];

    if (action === 'BWINJI') {
      // If a previous player had selected a secret Close Rung card, return it to their hand!
      if (this.trumpCard && this.trumpCallerPlayerId && this.trumpCallerPlayerId !== playerId) {
        if (this.hands[this.trumpCallerPlayerId]) {
          const alreadyInHand = this.hands[this.trumpCallerPlayerId].some((c) => c.id === this.trumpCard!.id);
          if (!alreadyInHand) {
            this.hands[this.trumpCallerPlayerId].push(this.trumpCard);
            this.hands[this.trumpCallerPlayerId] = BundRungEngine.sortHand(this.hands[this.trumpCallerPlayerId]);
          }
        }
      }

      // Authentic Bwinji Rule:
      // Player declares the SUIT of the Bwinji, NOT an actual card.
      // All 5 cards remain in the player's hand!
      let bwinjiSuit: Suit = 'SPADES';
      if (cardIdOrSuit === 'HEARTS' || cardIdOrSuit === 'DIAMONDS' || cardIdOrSuit === 'CLUBS' || cardIdOrSuit === 'SPADES') {
        bwinjiSuit = cardIdOrSuit as Suit;
      } else if (fallbackSuit) {
        bwinjiSuit = fallbackSuit;
      } else if (cardIdOrSuit) {
        const foundCard = hand.find((c) => c.id === cardIdOrSuit);
        if (foundCard) bwinjiSuit = foundCard.suit;
      }

      this.trumpMode = 'BWINJI';
      this.trumpSuit = bwinjiSuit;
      this.trumpCard = null; // No card locked away
      this.chosenTrumpCard = null;
      this.isTrumpRevealed = true; // Bwinji is public immediately to everyone
      this.openTrumpDeclaredInRound1 = true; // Lock further open rung announcements in Round 1
      this.trumpCallerPlayerId = playerId;
      this.bwinjiModifier = 'FACE_UP';
      this.statusMessage = `${currentBidder.name} declared BWINJI with Rung: ${bwinjiSuit}! Dealing remaining cards...`;

      // Deal remaining 32 cards (Pass 2 and Pass 3: 4 cards each)
      this.dealRemainingPasses();
      return;
    }

    // Otherwise, Close Rung: player selects a specific card from hand to lock away
    if (this.trumpMode === 'CLOSE_TRUMP') {
      throw new Error('A secret Rung card has already been selected. You can only call Bwinji or Pass.');
    }

    let selectedCard: Card | undefined;
    if (cardIdOrSuit) {
      selectedCard = hand.find((c) => c.id === cardIdOrSuit);
    }
    if (!selectedCard && fallbackSuit) {
      selectedCard = hand.find((c) => c.suit === fallbackSuit);
    }
    if (!selectedCard && hand.length > 0) {
      selectedCard = hand[0];
    }
    if (!selectedCard) {
      throw new Error('Must select a valid card from hand to establish secret rung');
    }

    // Remove the selected rung card from the player's hand array
    const cardIndex = hand.findIndex((c) => c.id === selectedCard!.id);
    if (cardIndex !== -1) {
      hand.splice(cardIndex, 1);
    }

    this.trumpCard = selectedCard;
    this.chosenTrumpCard = { ...selectedCard };
    this.trumpSuit = selectedCard.suit;
    this.trumpCallerPlayerId = playerId;
    this.trumpMode = 'CLOSE_TRUMP';
    this.isTrumpRevealed = false; // Hidden until uncovered

    const remainingPlayersToChallenge = 3 - this.biddingPassCount;

    // If there are no remaining players who haven't passed yet (e.g. dealer or all prior bidders passed):
    if (remainingPlayersToChallenge <= 0) {
      this.statusMessage = `${currentBidder.name} selected a Secret Rung Card! Dealing remaining cards...`;
      this.dealRemainingPasses();
    } else {
      // Remaining players who have not passed yet can call Bwinji!
      this.bwinjiChallengePassedCount = 0;
      this.biddingTurnPlayerIndex = (this.biddingTurnPlayerIndex + 1) % 4;
      const nextBidder = this.players[this.biddingTurnPlayerIndex];
      this.statusMessage = `${currentBidder.name} selected a Secret Rung Card! ${nextBidder.name} can Call BWINJI to override or Pass.`;
    }
  }

  public dealRemainingPasses(): void {
    this.phase = 'DEALING_PASS_2';
    const order = this.getCounterClockwiseOrder(this.dealerIndex);
    this.hands = this.deck.dealRemainingPasses(order, this.hands);

    for (const p of this.players) {
      if (this.hands[p.id]) {
        this.hands[p.id] = BundRungEngine.sortHand(this.hands[p.id]);
      }
      const isCaller = this.trumpCallerPlayerId === p.id;
      p.cardsInHandCount = (this.hands[p.id]?.length || 0) + (isCaller && this.trumpCard ? 1 : 0);
    }

    // Start playing tricks
    this.phase = 'TRICK_PLAYING';
    // User requirement: The player who selects the trump leads / starts the game!
    if (this.trumpCallerPlayerId) {
      const callerIdx = this.players.findIndex((p) => p.id === this.trumpCallerPlayerId);
      this.currentTurnPlayerIndex = callerIdx !== -1 ? callerIdx : (this.dealerIndex + 1) % 4;
    } else {
      this.currentTurnPlayerIndex = (this.dealerIndex + 1) % 4;
    }
    const leadPlayer = this.players[this.currentTurnPlayerIndex];
    this.resetCurrentTrick(1, leadPlayer.id);
    this.statusMessage = `All cards dealt (13 each). Trick 1: ${leadPlayer.name} (Rung Caller) leads.`;
  }

  // --- Bwinji Trick 1 Lead Choice (Face-Up or Face-Down Challenge) ---
  public declareBwinjiLead(
    playerId: string,
    cardId: string,
    isFaceDown: boolean
  ): { trickCompleted: boolean; trickWinner: Player | null } {
    if (this.phase !== 'TRICK_PLAYING' || this.currentTrick.trickNumber !== 1 || this.currentTrick.cards.length !== 0) {
      throw new Error('Bwinji lead can only be chosen on Trick 1 before any card is played');
    }
    if (this.trumpMode !== 'BWINJI' || this.trumpCallerPlayerId !== playerId) {
      throw new Error('Only the Bwinji caller can choose Bwinji lead');
    }
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error('Player not found');

    const hand = this.hands[playerId] || [];
    const cardIndex = hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) {
      throw new Error('Card not found in player hand');
    }
    const [playedCard] = hand.splice(cardIndex, 1);
    player.cardsInHandCount = hand.length;

    this.currentTrick.leadSuit = playedCard.suit;
    this.currentTrick.leadPlayerId = playerId;

    if (isFaceDown) {
      this.bwinjiModifier = 'FACE_DOWN_PLAY';
      this.faceDownLeadPending = true;
      this.opponentsInspectingCards = false;
      this.faceDownChallengeVotes.clear();
      this.faceDownLeadPlayerId = playerId;
      this.faceDownLeadCard = playedCard;
      this.faceDownLeadCardFaceDown = true;
      this.currentTrick.cards = [
        {
          playerId,
          card: playedCard,
          playedAt: Date.now(),
          isFaceDown: true,
        },
      ];
      this.statusMessage = `${player.name} led a FACE-DOWN challenge card in BWINJI (${this.trumpSuit})! Opponents may inspect partner cards and choose to Play or Surrender.`;
      return { trickCompleted: false, trickWinner: null };
    } else {
      this.bwinjiModifier = 'FACE_UP';
      this.faceDownLeadPending = false;
      this.faceDownLeadCard = null;
      this.faceDownLeadCardFaceDown = false;
      this.currentTrick.cards = [
        {
          playerId,
          card: playedCard,
          playedAt: Date.now(),
          isFaceDown: false,
        },
      ];
      this.currentTurnPlayerIndex = (this.currentTurnPlayerIndex + 1) % 4;
      const nextPlayer = this.players[this.currentTurnPlayerIndex];
      this.statusMessage = `${player.name} led ${playedCard.rank} of ${playedCard.suit} (BWINJI: ${this.trumpSuit}). ${nextPlayer.name}'s turn.`;
      return { trickCompleted: false, trickWinner: null };
    }
  }

  // --- Section 5.3: Open Rung Announcement on Trick 1 & Face-Down Inspection ---
  public declareOpenRung(
    playerId: string,
    suit: Suit,
    cardId: string,
    isFaceDown: boolean
  ): { trickCompleted: boolean; trickWinner: Player | null } {
    if (this.phase !== 'TRICK_PLAYING' || this.currentTrick.trickNumber !== 1) {
      throw new Error('Open Rung can only be announced during Trick 1 on your turn');
    }
    if (this.openTrumpDeclaredInRound1) {
      throw new Error('A Rung has already been announced for this game');
    }
    const player = this.players[this.currentTurnPlayerIndex];
    if (player.id !== playerId) {
      throw new Error('Not your turn to announce Open Rung');
    }
    if (this.trumpMode === 'BWINJI') {
      throw new Error('Cannot declare Open Rung: Bwinji was already declared');
    }

    // 1. If there are already played cards in the current trick, return them to their respective players' hands
    if (this.currentTrick.cards.length > 0) {
      for (const played of this.currentTrick.cards) {
        if (this.hands[played.playerId]) {
          this.hands[played.playerId].push(played.card);
          this.hands[played.playerId] = BundRungEngine.sortHand(this.hands[played.playerId]);
        }
      }
      this.currentTrick.cards = [];
    }

    // 2. Put any previous separate secret 5-card rung card back into that previous caller's regular hand
    if (this.trumpCard && this.trumpCallerPlayerId) {
      if (this.hands[this.trumpCallerPlayerId]) {
        const alreadyInHand = this.hands[this.trumpCallerPlayerId].some((c) => c.id === this.trumpCard!.id);
        if (!alreadyInHand) {
          this.hands[this.trumpCallerPlayerId].push(this.trumpCard);
          this.hands[this.trumpCallerPlayerId] = BundRungEngine.sortHand(this.hands[this.trumpCallerPlayerId]);
        }
      }
      this.trumpCard = null;
    }

    // 3. Remove the newly selected lead card from the announcer's hand
    const hand = this.hands[playerId] || [];
    const cardIndex = hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) {
      throw new Error('Card not found in player hand');
    }
    const [playedCard] = hand.splice(cardIndex, 1);

    // 4. Set newly selected suit as authoritative Rung (visible to everyone) and lock further announcements
    this.trumpMode = 'OPEN_TRUMP';
    this.trumpSuit = suit;
    this.chosenTrumpCard = null; // Open Rung establishes the declared SUIT as Rung; playedCard is the lead card of Trick 1
    this.isTrumpRevealed = true; // Everyone sees the suit of the newly selected Rung
    this.trumpCallerPlayerId = playerId;
    this.openTrumpDeclaredInRound1 = true; // Once announced, no other players in the first turn have the option to announce
    this.pendingOpenRungSuit = null;
    this.pendingOpenRungPlayerId = null;

    // 5. Update card counts for all players
    for (const p of this.players) {
      p.cardsInHandCount = this.hands[p.id]?.length || 0;
    }

    // 6. Reset Trick 1: game is now led by the card that the player selected while announcing the Rung
    const playerIdx = this.players.findIndex((p) => p.id === playerId);
    this.currentTurnPlayerIndex = playerIdx;
    this.resetCurrentTrick(1, playerId);
    this.currentTrick.leadSuit = playedCard.suit;
    this.currentTrick.leadPlayerId = playerId;

    if (isFaceDown) {
      this.openTrumpModifier = 'FACE_DOWN_PLAY';
      this.faceDownLeadPending = true;
      this.opponentsInspectingCards = false;
      this.faceDownChallengeVotes.clear();
      this.faceDownLeadPlayerId = playerId;
      this.faceDownLeadCard = playedCard;
      this.faceDownLeadCardFaceDown = true;

      this.currentTrick.cards = [
        {
          playerId,
          card: playedCard,
          playedAt: Date.now(),
        },
      ];

      this.statusMessage = `${player.name} announced RUNG as ${suit} and led a FACE-DOWN card! Opposing team may inspect cards and choose to Play or Surrender.`;
      return { trickCompleted: false, trickWinner: null };
    } else {
      this.openTrumpModifier = 'FACE_UP';
      this.faceDownLeadPending = false;
      this.faceDownLeadCard = null;
      this.faceDownLeadCardFaceDown = false;

      this.currentTrick.cards = [
        {
          playerId,
          card: playedCard,
          playedAt: Date.now(),
        },
      ];

      // Turn advances to next player clockwise from the Rung announcer
      this.currentTurnPlayerIndex = (playerIdx + 1) % 4;
      const nextPlayer = this.players[this.currentTurnPlayerIndex];
      this.statusMessage = `${player.name} announced RUNG as ${suit} and led ${playedCard.rank} of ${playedCard.suit}. ${nextPlayer.name}'s turn.`;
      return { trickCompleted: false, trickWinner: null };
    }
  }

  public selectOpenRungSuit(playerId: string, suit: Suit | null): void {
    if (this.phase !== 'TRICK_PLAYING' || this.currentTrick.trickNumber !== 1 || this.openTrumpDeclaredInRound1) {
      throw new Error('Cannot select open rung suit at this time');
    }
    const currentTurnPlayer = this.players[this.currentTurnPlayerIndex];
    if (currentTurnPlayer && currentTurnPlayer.id !== playerId) {
      throw new Error('Not your turn to select open rung');
    }
    this.pendingOpenRungSuit = suit;
    this.pendingOpenRungPlayerId = suit ? playerId : null;
    if (suit && currentTurnPlayer) {
      this.statusMessage = `${currentTurnPlayer.name} has declared ${suit} Rung. Waiting for ${currentTurnPlayer.name} to play the card...`;
    }
  }

  public declareOpenTrump(playerId: string, suit: Suit, modifier: OpenTrumpModifier = 'FACE_UP'): void {
    const hand = this.hands[playerId] || [];
    const firstCard = hand[0];
    if (firstCard) {
      this.declareOpenRung(playerId, suit, firstCard.id, modifier === 'FACE_DOWN_PLAY');
    }
  }

  public toggleInspectPartnerCards(playerId: string): void {
    if (!this.faceDownLeadPending) {
      throw new Error('No face-down rung challenge is pending');
    }
    const player = this.players.find((p) => p.id === playerId);
    const caller = this.players.find((p) => p.id === this.faceDownLeadPlayerId);
    if (!player || !caller || player.team === caller.team) {
      throw new Error('Only the defending/opposing team can inspect cards');
    }

    this.opponentsInspectingCards = !this.opponentsInspectingCards;
    this.statusMessage = this.opponentsInspectingCards
      ? `${player.name} opened partner card inspection. Both defending teammates can see each other's cards.`
      : `Inspection closed. Defending team must now choose to Accept Challenge or Surrender.`;
  }

  public respondToFaceDownRung(
    playerId: string,
    willPlay: boolean
  ): { gameEnded: boolean; winningTeam: TeamId | null } {
    if (!this.faceDownLeadPending) {
      throw new Error('No face-down rung challenge is pending');
    }
    const player = this.players.find((p) => p.id === playerId);
    const caller = this.players.find((p) => p.id === this.faceDownLeadPlayerId);
    if (!player || !caller || player.team === caller.team) {
      throw new Error('Only the defending team can respond');
    }

    const vote = willPlay ? 'ACCEPT' : 'SURRENDER';
    this.faceDownChallengeVotes.set(playerId, vote);

    const defendingPlayers = this.players.filter((p) => p.team !== caller.team);
    const partner = defendingPlayers.find((p) => p.id !== playerId);

    const playerVote = this.faceDownChallengeVotes.get(playerId);
    const partnerVote = partner ? this.faceDownChallengeVotes.get(partner.id) : null;

    // Both teammates must confirm the SAME action before executing:
    const isSingleDefender = defendingPlayers.length <= 1;
    const isBothConfirmed = isSingleDefender || (Boolean(partner && partnerVote) && playerVote === partnerVote);

    if (isBothConfirmed) {
      this.opponentsInspectingCards = false;
      this.faceDownChallengeVotes.clear();

      if (playerVote === 'ACCEPT') {
        // Defending team accepts challenge to play -> flip lead card to face-up on table!
        this.faceDownLeadPending = false;
        this.faceDownLeadCardFaceDown = false;
        this.isTrumpRevealed = true;
        if (this.currentTrick.cards.length > 0) {
          this.currentTrick.cards.forEach((c) => {
            c.isFaceDown = false;
          });
        }
        if (this.trumpMode === 'BWINJI') {
          this.bwinjiModifier = 'FACE_DOWN_PLAY';
        } else {
          this.openTrumpModifier = 'FACE_DOWN_PLAY';
        }

        this.currentTurnPlayerIndex = (this.currentTurnPlayerIndex + 1) % 4;
        const nextPlayer = this.players[this.currentTurnPlayerIndex];
        this.statusMessage = `Both defending teammates accepted challenge! Face-down card revealed as ${this.faceDownLeadCard?.rank} of ${this.faceDownLeadCard?.suit}. ${nextPlayer.name}'s turn.`;
        return { gameEnded: false, winningTeam: null };
      } else {
        // Defending team Surrenders!
        this.faceDownLeadPending = false;
        this.faceDownLeadCardFaceDown = false;
        if (this.trumpMode === 'BWINJI') {
          this.bwinjiModifier = 'FACE_DOWN_NO_PLAY';
        } else {
          this.openTrumpModifier = 'FACE_DOWN_NO_PLAY';
        }

        const callerTeam = caller.team;
        const dealer = this.players[this.dealerIndex];

        const input: ScoreCalculationInput = {
          gameIndex: this.gameIndex,
          dealerPlayerId: dealer.id,
          dealerTeam: dealer.team,
          trumpMode: this.trumpMode || 'OPEN_TRUMP',
          modifier: (this.trumpMode === 'BWINJI' ? this.bwinjiModifier : this.openTrumpModifier) || 'FACE_DOWN_NO_PLAY',
          colorChosenByTeam: callerTeam,
          colorChosenByPlayerId: caller.id,
          winningTeam: callerTeam,
        };

        const result = this.scoringEngine.applyGameResult(input);
        this.phase = 'GAME_RESOLVED';
        this.lastGameWinningTeam = callerTeam;

        if (result.isKhoti) {
          this.phase = 'MATCH_OVER';
          this.isMatchOver = true;
          this.losingTeamKhoti = result.losingTeam;
          this.matchWinnerTeam = result.winningTeam;
          this.statusMessage = `MATCH OVER: Defending team surrendered! ${this.getTeamName(result.losingTeam || 'TEAM_1')} reached ${result.newDealerScore} pts (KHOTI)!`;
        } else {
          if (result.dealerTransferred) {
            this.dealerIndex = (this.dealerIndex + 1) % 4;
            this.players.forEach((p, idx) => (p.isDealer = idx === this.dealerIndex));
            this.statusMessage = `Defending team surrendered! ${this.getTeamName(callerTeam)} wins round. Dealership transferred to ${this.players[this.dealerIndex].name}.`;
          } else {
            this.statusMessage = `Defending team surrendered! ${this.getTeamName(callerTeam)} wins round (Dealer scorecard: ${result.newDealerScore} pts).`;
          }
        }

        return { gameEnded: true, winningTeam: callerTeam };
      }
    } else {
      // Waiting for partner or partner voted differently
      if (partner && partnerVote && playerVote !== partnerVote) {
        this.statusMessage = `${player.name} voted to ${playerVote === 'ACCEPT' ? 'Accept' : 'Surrender'}, but ${partner.name} voted to ${partnerVote === 'ACCEPT' ? 'Accept' : 'Surrender'}. Both teammates must agree to proceed.`;
      } else {
        this.statusMessage = `${player.name} voted to ${playerVote === 'ACCEPT' ? 'Accept Challenge' : 'Surrender'}. Waiting for partner ${partner?.name || 'teammate'} to confirm...`;
      }
      return { gameEnded: false, winningTeam: null };
    }
  }

  public respondToFaceDownTrump(data: { willPlay: boolean }): void {
    const caller = this.players.find((p) => p.id === this.faceDownLeadPlayerId);
    const defPlayer = this.players.find((p) => caller && p.team !== caller.team) || this.players[0];
    this.respondToFaceDownRung(defPlayer.id, data.willPlay);
  }

  // --- Phase 6: Trick Playing & Bund Rules ---
  private resetCurrentTrick(trickNumber: number, leadPlayerId: string): void {
    this.currentTrick = {
      trickNumber,
      leadPlayerId,
      leadSuit: null,
      cards: [],
      winnerPlayerId: null,
      winningTeam: null,
    };
  }

  public getLegalCardsForPlayer(playerId: string): Card[] {
    const hand = this.hands[playerId] || [];
    if (this.phase !== 'TRICK_PLAYING' || this.isRungRevealPaused || this.isTrumpRevealPending) return [];
    if (this.players[this.currentTurnPlayerIndex]?.id !== playerId) return [];

    const isTrumpCaller = playerId === this.trumpCallerPlayerId;
    // Rung caller cannot play the chosen separate trump card until Rung is revealed
    const canPlayTrumpCard = isTrumpCaller && this.trumpCard && this.isTrumpRevealed;
    const allAvailableCards = canPlayTrumpCard ? [...hand, this.trumpCard!] : [...hand];

    // If leading, any card in hand (or revealed trump card) is legal
    if (this.currentTrick.cards.length === 0 || !this.currentTrick.leadSuit) {
      return allAvailableCards;
    }

    const leadSuit = this.currentTrick.leadSuit;
    const matchingSuitCards = allAvailableCards.filter((c) => c.suit === leadSuit);

    // If player has cards of the lead suit, player MUST follow suit
    if (matchingSuitCards.length > 0) {
      return matchingSuitCards;
    }

    // Rule: "once the rung reveal state arrives the player who has the reveal option he can not play the card from his hand until the rung is not revealed."
    // If player is on opponent team, Rung is unrevealed, and player is void in lead suit -> they must reveal Rung before playing!
    const caller = this.players.find((p) => p.id === this.trumpCallerPlayerId);
    const player = this.players.find((p) => p.id === playerId);
    const isOpponentTeam = caller && player ? player.team !== caller.team : true;
    if (!this.isTrumpRevealed && isOpponentTeam) {
      return [];
    }

    // If this player just asked to reveal the Rung:
    // If he has Rung cards in his hand, he MUST play a Rung card!
    if (this.rungRevealerPlayerId === playerId && this.isTrumpRevealed && this.trumpSuit) {
      const trumpCards = allAvailableCards.filter((c) => c.suit === this.trumpSuit);
      if (trumpCards.length > 0) {
        return trumpCards;
      }
    }

    // Otherwise, player can play any available card (trump or any other suit)
    return allAvailableCards;
  }

  public playCard(playerId: string, cardId: string): { trickCompleted: boolean; trickWinner: Player | null } {
    if (this.phase !== 'TRICK_PLAYING') {
      throw new Error('Game is not in trick playing phase');
    }
    if (this.isRungRevealPaused || this.isTrumpRevealPending) {
      throw new Error('Game is paused for Rung reveal. Please complete the reveal first.');
    }
    const player = this.players[this.currentTurnPlayerIndex];
    if (player.id !== playerId) {
      throw new Error('Not your turn to play');
    }

    const legalCards = this.getLegalCardsForPlayer(playerId);
    if (!legalCards.some((c) => c.id === cardId)) {
      throw new Error('Illegal card play: must follow lead suit, reveal Rung if void, or play Rung card if requested reveal');
    }

    let playedCard: Card;

    // If starting a new trick (currentTrick has 0 cards), clear previous trick cards from table
    if (this.currentTrick.cards.length === 0) {
      this.previousTrickCards = null;
    }

    // Check if caller is playing their separate revealed rung card
    if (this.trumpCard && this.trumpCard.id === cardId && playerId === this.trumpCallerPlayerId) {
      if (!this.isTrumpRevealed) {
        throw new Error('Cannot play chosen Rung card until Rung is revealed');
      }
      playedCard = this.trumpCard;
      this.trumpCard = null;
      this.statusMessage = `${player.name} played their Rung Card (${playedCard.rank} of ${playedCard.suit})!`;
    } else {
      const hand = this.hands[playerId] || [];
      const cardIndex = hand.findIndex((c) => c.id === cardId);
      if (cardIndex === -1) {
        throw new Error('Card not in player hand');
      }
      [playedCard] = hand.splice(cardIndex, 1);
    }

    // If the revealer (or if reveal just took place) played their card, clear the inspected faceDownCallerCards side panel
    if (playerId === this.rungRevealerPlayerId || this.faceDownCallerCards.some((c) => c.isRevealed)) {
      this.faceDownCallerCards = [];
      this.rungRevealerPlayerId = null;
    }

    player.cardsInHandCount = (this.hands[playerId]?.length || 0) + (this.trumpCard && playerId === this.trumpCallerPlayerId ? 1 : 0);

    // Set lead suit on first card of trick
    if (this.currentTrick.cards.length === 0) {
      this.currentTrick.leadSuit = playedCard.suit;
      this.currentTrick.leadPlayerId = playerId;
    }

    // Normal play rule: If Rung is unrevealed and Rung caller doesn't have the lead suit, whatever card caller plays is placed face down
    const isCallerVoidFaceDown =
      !this.isTrumpRevealed &&
      playerId === this.trumpCallerPlayerId &&
      Boolean(this.currentTrick.leadSuit && playedCard.suit !== this.currentTrick.leadSuit);

    if (isCallerVoidFaceDown) {
      this.faceDownCallerCards.push({
        id: playedCard.id,
        card: playedCard,
        trickNumber: this.currentTrick.trickNumber,
        isRevealed: false,
      });
    }

    // Consecutive Lead Ace Downgrade Rule:
    // "Both consecutive win streaks cannot be won with Aces. If a player won the previous turn with an Ace
    // and starts the next turn with an Ace again, the second Ace is considered like a 2 in value of that suit."
    const isConsecutiveLeadAce =
      this.currentTrick.cards.length === 0 &&
      this.currentTrick.trickNumber > 1 &&
      this.lastTrickWinnerPlayerId === playerId &&
      this.lastTrickWinningCard?.rank === 'A' &&
      playedCard.rank === 'A';

    this.currentTrick.cards.push({
      playerId,
      card: playedCard,
      playedAt: Date.now(),
      isFaceDown: isCallerVoidFaceDown,
      isAceDowngraded: isConsecutiveLeadAce,
    });

    // Check if 4 cards have been played in this trick
    if (this.currentTrick.cards.length === 4) {
      return this.resolveTrick();
    } else {
      this.currentTurnPlayerIndex = (this.currentTurnPlayerIndex + 1) % 4;
      const nextPlayer = this.players[this.currentTurnPlayerIndex];
      const cardDisplay = isCallerVoidFaceDown ? 'a Face-Down card' : `${playedCard.rank} of ${playedCard.suit}`;
      const aceDowngradeNote = isConsecutiveLeadAce ? ' (Ace downgraded to 2 value for this trick)' : '';
      this.statusMessage = `${player.name} played ${cardDisplay}${aceDowngradeNote}. ${nextPlayer.name}'s turn.`;
      return { trickCompleted: false, trickWinner: null };
    }
  }

  // --- Rung Reveal Mechanism ---
  public requestTrumpReveal(playerId: string): void {
    if (this.phase !== 'TRICK_PLAYING') {
      throw new Error('Can only request Rung reveal during trick play');
    }
    if (this.isTrumpRevealed) {
      throw new Error('Rung is already revealed');
    }
    if (this.isTrumpRevealPending) {
      throw new Error('Rung reveal is already pending');
    }
    if (this.isRungRevealPaused) {
      throw new Error('Game is currently paused');
    }
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error('Player not found');

    const caller = this.players.find((p) => p.id === this.trumpCallerPlayerId);
    if (caller && player.team === caller.team) {
      throw new Error('Only the opponent team can ask to reveal Rung');
    }

    this.isTrumpRevealPending = true;
    this.trumpRevealRequesterId = playerId;
    this.rungRevealerPlayerId = playerId;

    const callerName = caller?.name || 'Rung Caller';
    this.statusMessage = `${player.name} asked to reveal RUNG! Waiting for ${callerName} to show the Rung card.`;
  }

  public showTrumpCard(playerId: string): void {
    if (this.phase !== 'TRICK_PLAYING') {
      throw new Error('Can only show Rung during trick play');
    }
    if (!this.isTrumpRevealPending) {
      throw new Error('No Rung reveal has been requested');
    }
    if (playerId !== this.trumpCallerPlayerId) {
      throw new Error('Only the Rung caller can show the Rung card');
    }

    this.isTrumpRevealPending = false;
    this.isTrumpRevealed = true;

    // Flip all accumulated face-down caller cards in side panel to face-up
    this.faceDownCallerCards.forEach((c) => {
      c.isRevealed = true;
    });

    // Also reveal any face-down card in the active trick and lingering previous trick
    this.currentTrick.cards.forEach((c) => {
      if (c.isFaceDown) c.isFaceDown = false;
    });
    if (this.previousTrickCards) {
      this.previousTrickCards.forEach((c) => {
        if (c.isFaceDown) c.isFaceDown = false;
      });
    }

    const caller = this.players.find((p) => p.id === playerId);
    const requester = this.players.find((p) => p.id === this.trumpRevealRequesterId);
    const rungSuitName = this.trumpSuit || 'Trump';
    const activeTrumpCard = this.chosenTrumpCard || this.trumpCard;
    const trumpCardDesc = activeTrumpCard ? ` (${activeTrumpCard.rank} of ${activeTrumpCard.suit})` : '';

    this.statusMessage = `${caller?.name || 'Caller'} showed RUNG: ${rungSuitName}${trumpCardDesc}! ${requester?.name || 'Requester'} must now play a card.`;
  }

  public resumeAfterTrumpReveal(playerId?: string): void {
    if (!this.isRungRevealPaused) {
      return;
    }
    this.isRungRevealPaused = false;
    // Clear the inspected face-down cards from the table
    this.faceDownCallerCards = [];
    const currentTurnPlayer = this.players[this.currentTurnPlayerIndex];
    this.statusMessage = `Play resumed! Active Rung: ${this.trumpSuit}. ${currentTurnPlayer?.name}'s turn.`;
  }

  private resolveTrick(): { trickCompleted: boolean; trickWinner: Player } {
    const leadSuit = this.currentTrick.leadSuit!;
    // Until Rung is revealed, trump cards have no superiority over other cards
    const activeTrumpSuit = this.isTrumpRevealed ? this.trumpSuit : null;

    const getCardPower = (pc: PlayedCard) => (pc.isAceDowngraded ? 2 : pc.card.playValue);

    let winningCard: PlayedCard = this.currentTrick.cards[0];
    let highestValue = getCardPower(winningCard);

    for (let i = 1; i < this.currentTrick.cards.length; i++) {
      const candidate = this.currentTrick.cards[i];
      const candidatePower = getCardPower(candidate);

      const winIsTrump = activeTrumpSuit && winningCard.card.suit === activeTrumpSuit;
      const candIsTrump = activeTrumpSuit && candidate.card.suit === activeTrumpSuit;

      if (candIsTrump && !winIsTrump) {
        winningCard = candidate;
        highestValue = candidatePower;
      } else if (candIsTrump && winIsTrump) {
        if (candidatePower > highestValue) {
          winningCard = candidate;
          highestValue = candidatePower;
        }
      } else if (!candIsTrump && !winIsTrump) {
        if (
          candidate.card.suit === leadSuit &&
          candidatePower > highestValue
        ) {
          winningCard = candidate;
          highestValue = candidatePower;
        }
      }
    }

    const winner = this.players.find((p) => p.id === winningCard.playerId)!;
    this.currentTrick.winnerPlayerId = winner.id;
    this.currentTrick.winningTeam = winner.team;

    // Track winning card to enforce Consecutive Lead Ace rule on next trick
    this.lastTrickWinningCard = winningCard.card;

    if (winner.team === 'TEAM_1') {
      this.team1TricksWon += 1;
    } else {
      this.team2TricksWon += 1;
    }

    // Bund Consecutive Trick Tracking for teams
    if (this.lastTrickWinnerTeam === winner.team) {
      this.consecutiveTricksCount += 1;
    } else {
      this.lastTrickWinnerTeam = winner.team;
      this.consecutiveTricksCount = 1;
    }

    // Individual Player Consecutive Trick Tracking for Win Condition:
    // User rule: "in open rung or close rung first turn does not count to decide the consecutive 2 streaks win.
    // For example if a player has won number 1 streak he must win next two (number 2 and 3) streaks to win the game in case of open rung.
    // Similarly if rung has been revealed in very first turn then to win the game the player must win turn 2 and 3.
    // After that any two consecutive win streaks will decide the win of the game from the opponent players."
    const currentTrickNum = this.currentTrick.trickNumber;
    const caller = this.players.find((p) => p.id === this.trumpCallerPlayerId);
    const isOpponentTeam = caller ? winner.team !== caller.team : true;

    if (!this.isTrumpRevealed || currentTrickNum === 1) {
      // Trick 1 NEVER counts towards the 2-consecutive-win streak condition in any mode.
      // Also, prior to Rung reveal, streaks do not count.
      this.lastTrickWinnerPlayerId = null;
      this.playerConsecutiveTricksCount = 0;
    } else {
      // Trick 2 onwards AND Rung is revealed:
      if (this.lastTrickWinnerPlayerId === winner.id) {
        this.playerConsecutiveTricksCount += 1;
      } else {
        this.lastTrickWinnerPlayerId = winner.id;
        this.playerConsecutiveTricksCount = 1;
      }
    }

    this.completedTricks.push({ ...this.currentTrick });

    // Winner leads next trick
    this.currentTurnPlayerIndex = this.players.findIndex((p) => p.id === winner.id);

    // Save cards of completed trick so they remain visible until the winner plays the lead card of the next trick.
    // Face-down caller cards remain face-down until Rung is revealed!
    this.previousTrickCards = this.currentTrick.cards.map((c) => ({
      ...c,
      isFaceDown: !this.isTrumpRevealed && Boolean(c.isFaceDown),
    }));

    // Early Win Condition (2 consecutive tricks won by same opponent player starting from Trick 2 onward after Rung reveal):
    const isOpponentEarlyWin =
      this.isTrumpRevealed &&
      isOpponentTeam &&
      currentTrickNum >= 2 &&
      this.playerConsecutiveTricksCount >= 2;

    if (isOpponentEarlyWin) {
      this.resolveGame(winner.team);
      this.statusMessage = `BUND! ${winner.name} won 2 consecutive tricks (Tricks ${currentTrickNum - 1} & ${currentTrickNum}) after Rung reveal! ${winner.team === 'TEAM_1' ? 'Team 1' : 'Team 2'} WINS Game ${this.gameIndex}!`;
      return { trickCompleted: true, trickWinner: winner };
    }

    if (currentTrickNum < 13) {
      this.resetCurrentTrick(currentTrickNum + 1, winner.id);
      this.statusMessage = `${winner.name} won Trick ${currentTrickNum} with ${winningCard.card.rank} of ${winningCard.card.suit}.`;
      return { trickCompleted: true, trickWinner: winner };
    } else {
      // 13 tricks completed: If no team achieved 2 consecutive tricks streak, the team winning the final (13th) trick wins the game!
      this.resolveGame(winner.team);
      return { trickCompleted: true, trickWinner: winner };
    }
  }

  // --- Phase 7: Game Resolution & Scorecard Engine ---
  public resolveGame(forcedWinningTeam?: TeamId): void {
    this.phase = 'GAME_RESOLVED';
    const winningTeam: TeamId = forcedWinningTeam || (this.team1TricksWon >= 7 ? 'TEAM_1' : 'TEAM_2');
    this.lastGameWinningTeam = winningTeam;
    const dealer = this.players[this.dealerIndex];
    const caller = this.players.find((p) => p.id === this.trumpCallerPlayerId) || this.players[0];

    const input: ScoreCalculationInput = {
      gameIndex: this.gameIndex,
      dealerPlayerId: dealer.id,
      dealerTeam: dealer.team,
      trumpMode: this.trumpMode || 'CLOSE_TRUMP',
      modifier: (this.openTrumpModifier || this.bwinjiModifier || 'STANDARD') as any,
      colorChosenByTeam: caller.team,
      colorChosenByPlayerId: caller.id,
      winningTeam,
    };

    const result = this.scoringEngine.applyGameResult(input);

    if (result.isKhoti) {
      this.phase = 'MATCH_OVER';
      this.isMatchOver = true;
      this.losingTeamKhoti = result.losingTeam;
      this.matchWinnerTeam = result.winningTeam;
      this.statusMessage = `MATCH OVER: ${this.getTeamName(result.losingTeam || 'TEAM_1')} reached ${result.newDealerScore} points and is declared KHOTI!`;
    } else {
      const nextGame = this.gameIndex + 1;
      if (result.dealerTransferred) {
        // Section 6.1: Dealership rotates counter-clockwise
        this.dealerIndex = (this.dealerIndex + 1) % 4;
        this.players.forEach((p, idx) => (p.isDealer = idx === this.dealerIndex));
        const newDealer = this.players[this.dealerIndex];
        this.statusMessage = `Game ${this.gameIndex} Over! ${this.getTeamName(winningTeam)} won. Score fell below 0: ${newDealer.name} is the new dealer (Score: +${result.newDealerScore} pts). ${newDealer.name} must click 'Distribute 5 Cards' to deal Game ${nextGame}.`;
      } else {
        const currentDealer = this.players[this.dealerIndex];
        this.statusMessage = `Game ${this.gameIndex} Over! ${this.getTeamName(winningTeam)} won with ${winningTeam === 'TEAM_1' ? this.team1TricksWon : this.team2TricksWon} tricks. Dealer scorecard: ${result.newDealerScore} pts. ${currentDealer.name} must click 'Distribute 5 Cards' to deal Game ${nextGame}.`;
      }
    }
  }

  public dealerDistributeNextGame(playerId: string): void {
    const dealer = this.players[this.dealerIndex];
    if (!dealer || dealer.id !== playerId) {
      throw new Error('Only the active dealer can distribute cards for the next game');
    }
    if (this.phase !== 'GAME_RESOLVED') {
      throw new Error('Game is not in game resolved phase');
    }
    if (this.isMatchOver) {
      throw new Error('Match is over. Please start a new match.');
    }

    if (this.isStartingNewMatch) {
      this.gameIndex = 1;
      this.isStartingNewMatch = false;
    } else {
      this.gameIndex += 1;
    }
    this.deck.reset();
    // Do NOT auto-shuffle: Dealer decides whether to shuffle or not
    this.hands = {};
    for (const p of this.players) {
      this.hands[p.id] = [];
      p.cardsInHandCount = 0;
    }

    this.cutOfferPlayerId = null;
    this.cutDone = false;
    this.trumpMode = null;
    this.trumpSuit = null;
    this.isTrumpRevealed = false;
    this.trumpCallerPlayerId = null;
    this.trumpCard = null;
    this.openTrumpModifier = null;
    this.bwinjiModifier = null;
    this.biddingPassCount = 0;
    this.openTrumpDeclaredInRound1 = false; // Open Rung is active for Trick 1 of this new game!
    this.faceDownLeadPending = false;
    this.faceDownLeadPlayerId = null;
    this.faceDownLeadCard = null;
    this.faceDownLeadCardFaceDown = false;
    this.opponentsInspectingCards = false;
    this.faceDownCallerCards = [];
    this.isRungRevealPaused = false;
    this.rungRevealerPlayerId = null;
    this.previousTrickCards = null;
    this.completedTricks = [];
    this.team1TricksWon = 0;
    this.team2TricksWon = 0;
    this.consecutiveTricksCount = 0;
    this.lastTrickWinnerTeam = null;
    this.lastTrickWinnerPlayerId = null;
    this.lastTrickWinningCard = null;
    this.playerConsecutiveTricksCount = 0;
    this.shownHandPlayerIds.clear();
    this.surrenderVotes.TEAM_1.clear();
    this.surrenderVotes.TEAM_2.clear();
    this.resetCurrentTrick(1, '');

    this.phase = 'PRE_DEAL_SHUFFLE';
    this.statusMessage = `${dealer.name} is the dealer. You may shuffle the deck or offer cut directly.`;
  }

  public getTeamName(team: TeamId): string {
    if (this.customTeamNames[team]) {
      return this.customTeamNames[team]!;
    }
    const teamPlayers = this.players.filter((p) => p.team === team);
    if (teamPlayers.length === 2) {
      return `${teamPlayers[0].name}/${teamPlayers[1].name} Team`;
    } else if (teamPlayers.length === 1) {
      return `${teamPlayers[0].name}'s Team`;
    }
    return team === 'TEAM_1' ? 'Team 1' : 'Team 2';
  }

  public setCustomTeamName(team: TeamId, name: string): void {
    if (name && name.trim()) {
      this.customTeamNames[team] = name.trim();
    } else {
      delete this.customTeamNames[team];
    }
  }

  public startNextGameWithSameRoster(): void {
    if (this.isMatchOver) {
      this.startNewMatch();
      return;
    }

    this.gameIndex += 1;
    this.deck.reset();
    // Do NOT auto-shuffle
    this.hands = {};
    for (const p of this.players) {
      this.hands[p.id] = [];
      p.cardsInHandCount = 0;
    }

    this.cutOfferPlayerId = null;
    this.cutDone = false;
    this.trumpMode = null;
    this.trumpSuit = null;
    this.isTrumpRevealed = false;
    this.trumpCallerPlayerId = null;
    this.trumpCard = null;
    this.chosenTrumpCard = null;
    this.openTrumpModifier = null;
    this.bwinjiModifier = null;
    this.biddingPassCount = 0;
    this.openTrumpDeclaredInRound1 = false;
    this.faceDownLeadPending = false;
    this.faceDownLeadPlayerId = null;
    this.faceDownLeadCard = null;
    this.faceDownLeadCardFaceDown = false;
    this.opponentsInspectingCards = false;
    this.faceDownCallerCards = [];
    this.isRungRevealPaused = false;
    this.rungRevealerPlayerId = null;
    this.previousTrickCards = null;
    this.completedTricks = [];
    this.team1TricksWon = 0;
    this.team2TricksWon = 0;
    this.consecutiveTricksCount = 0;
    this.lastTrickWinnerTeam = null;
    this.lastTrickWinnerPlayerId = null;
    this.playerConsecutiveTricksCount = 0;
    this.resetCurrentTrick(1, '');

    this.dealFirstPass();
  }

  public startNewMatch(): void {
    const currentDealer = this.players[this.dealerIndex];
    const isDealerTeamKhoti = this.losingTeamKhoti === currentDealer?.team;

    if (isDealerTeamKhoti) {
      // User rule: When dealer team becomes KHOTI -> dealership transfers to second player of dealer team (partner sitting opposite)
      this.dealerIndex = (this.dealerIndex + 2) % 4;
    } else {
      // User rule: When opponent team becomes KHOTI -> dealership transfers to next player on right side of dealer from opponent team
      this.dealerIndex = (this.dealerIndex + 1) % 4;
    }
    this.players.forEach((p, idx) => (p.isDealer = idx === this.dealerIndex));

    this.scoringEngine.resetMatch();
    this.isMatchOver = false;
    this.isStartingNewMatch = true;
    this.losingTeamKhoti = null;
    this.matchWinnerTeam = null;
    this.gameIndex = 1;

    this.deck.reset();
    // Do NOT auto-shuffle
    this.hands = {};
    for (const p of this.players) {
      this.hands[p.id] = [];
      p.cardsInHandCount = 0;
    }

    this.cutOfferPlayerId = null;
    this.cutDone = false;
    this.trumpMode = null;
    this.trumpSuit = null;
    this.isTrumpRevealed = false;
    this.trumpCallerPlayerId = null;
    this.trumpCard = null;
    this.chosenTrumpCard = null;
    this.openTrumpModifier = null;
    this.bwinjiModifier = null;
    this.biddingPassCount = 0;
    this.openTrumpDeclaredInRound1 = false;
    this.faceDownLeadPending = false;
    this.faceDownLeadPlayerId = null;
    this.faceDownLeadCard = null;
    this.faceDownLeadCardFaceDown = false;
    this.opponentsInspectingCards = false;
    this.faceDownCallerCards = [];
    this.isRungRevealPaused = false;
    this.rungRevealerPlayerId = null;
    this.previousTrickCards = null;
    this.completedTricks = [];
    this.team1TricksWon = 0;
    this.team2TricksWon = 0;
    this.consecutiveTricksCount = 0;
    this.lastTrickWinnerTeam = null;
    this.lastTrickWinnerPlayerId = null;
    this.lastTrickWinningCard = null;
    this.playerConsecutiveTricksCount = 0;
    this.resetCurrentTrick(1, '');
    this.shownHandPlayerIds.clear();
    this.surrenderVotes.TEAM_1.clear();
    this.surrenderVotes.TEAM_2.clear();

    // User requirement: Do NOT distribute 5 cards automatically. Transition to GAME_RESOLVED so the New Dealer clicks to deal!
    this.phase = 'GAME_RESOLVED';
    const newDealer = this.players[this.dealerIndex];
    this.statusMessage = `New Match Ready! ${newDealer.name} is the new dealer. ${newDealer.name} must click 'Distribute 5 Cards' to start Game 1.`;
  }

  // --- Show Hand & Team Surrender ---
  public toggleShowHand(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error('Player not found');

    if (this.shownHandPlayerIds.has(playerId)) {
      this.shownHandPlayerIds.delete(playerId);
      this.statusMessage = `${player.name} hid their hand cards.`;
    } else {
      this.shownHandPlayerIds.add(playerId);
      this.statusMessage = `${player.name} is showing their hand cards to everyone.`;
    }
  }

  public voteSurrender(playerId: string): { surrendered: boolean; winningTeam: TeamId | null } {
    if (this.phase !== 'TRICK_PLAYING' && this.phase !== 'BIDDING_PHASE') {
      throw new Error('Can only vote to surrender during an active game');
    }
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error('Player not found');

    const team = player.team;
    const isAlreadyVoted = this.surrenderVotes[team].has(playerId);

    if (isAlreadyVoted) {
      this.surrenderVotes[team].delete(playerId);
      this.statusMessage = `${player.name} cancelled their surrender vote (${this.surrenderVotes[team].size}/2).`;
      return { surrendered: false, winningTeam: null };
    } else {
      this.surrenderVotes[team].add(playerId);
      if (this.surrenderVotes[team].size >= 2) {
        // Both teammates agreed to surrender!
        const opposingTeam: TeamId = team === 'TEAM_1' ? 'TEAM_2' : 'TEAM_1';
        this.resolveGame(opposingTeam);
        this.statusMessage = `${this.getTeamName(team)} surrendered! ${this.getTeamName(opposingTeam)} wins Game ${this.gameIndex}.`;
        return { surrendered: true, winningTeam: opposingTeam };
      } else {
        this.statusMessage = `${player.name} voted to surrender (${this.surrenderVotes[team].size}/2). Teammate must also click Surrender to concede.`;
        return { surrendered: false, winningTeam: null };
      }
    }
  }

  // --- Client State Serialization ---
  public getPublicState(): PublicGameState {
    return {
      phase: this.phase,
      players: this.players.map((p) => ({ ...p })),
      teamNames: {
        TEAM_1: this.getTeamName('TEAM_1'),
        TEAM_2: this.getTeamName('TEAM_2'),
      },
      activePlayerIndex: this.currentTurnPlayerIndex,
      dealerPlayerIndex: this.dealerIndex,
      currentTurnPlayerId:
        this.phase === 'TRICK_PLAYING'
          ? this.players[this.currentTurnPlayerIndex]?.id || null
          : this.phase === 'BIDDING_PHASE'
          ? this.players[this.biddingTurnPlayerIndex]?.id || null
          : null,
      tossCardsRemaining: this.tossEngine.getRemainingCount(),
      tossDraws: this.tossEngine.getLatestDraws(),
      tossDrawHistory: this.tossEngine.getDrawHistory(),
      tossDrawnThisRound: this.players.reduce((acc, p) => {
        acc[p.id] = this.tossEngine.hasPlayerDrawnThisRound(p.id);
        return acc;
      }, {} as { [playerId: string]: boolean }),
      tossRound: this.tossEngine.getRoundNumber(),
      tiedPlayerIds: this.tossEngine.getActivePlayerIds(),
      cutOfferPlayerId: this.cutOfferPlayerId,
      cutDone: this.cutDone,
      trumpMode: this.trumpMode,
      trumpSuit: this.isTrumpRevealed ? this.trumpSuit : null,
      isTrumpRevealed: this.isTrumpRevealed,
      trumpCallerPlayerId: this.trumpCallerPlayerId,
      trumpCardPlaced: this.trumpCard !== null,
      trumpCardPlayerId: this.trumpCallerPlayerId,
      revealedTrumpCard: this.isTrumpRevealed && (this.chosenTrumpCard || this.trumpCard) ? { ...(this.chosenTrumpCard || this.trumpCard)! } : null,
      openTrumpModifier: this.openTrumpModifier,
      bwinjiModifier: this.bwinjiModifier,
      firstRoundOpenTrumpAvailable:
        this.phase === 'TRICK_PLAYING' &&
        this.currentTrick.trickNumber === 1 &&
        !this.openTrumpDeclaredInRound1 &&
        this.trumpMode !== 'BWINJI',
      pendingOpenRungSuit: this.pendingOpenRungSuit,
      pendingOpenRungPlayerId: this.pendingOpenRungPlayerId,
      faceDownLeadPending: this.faceDownLeadPending,
      faceDownLeadPlayerId: this.faceDownLeadPlayerId,
      faceDownLeadCardFaceDown: this.faceDownLeadCardFaceDown,
      opponentsInspectingCards: this.opponentsInspectingCards,
      faceDownChallengeVotes: Object.fromEntries(this.faceDownChallengeVotes.entries()),
      faceDownCallerCards: this.faceDownCallerCards.map((c) => ({ ...c })),
      isRungRevealPaused: this.isRungRevealPaused,
      isTrumpRevealPending: this.isTrumpRevealPending,
      trumpRevealRequesterId: this.trumpRevealRequesterId,
      biddingTurnPlayerId:
        this.phase === 'BIDDING_PHASE'
          ? this.players[this.biddingTurnPlayerIndex]?.id || null
          : null,
      biddingPassCount: this.biddingPassCount,
      gameIndex: this.gameIndex,
      currentTrick: { ...this.currentTrick, cards: [...this.currentTrick.cards] },
      previousTrickCards: this.previousTrickCards ? this.previousTrickCards.map((c) => ({ ...c })) : null,
      completedTricks: [...this.completedTricks],
      team1TricksWon: this.team1TricksWon,
      team2TricksWon: this.team2TricksWon,
      consecutiveTricksCount: this.consecutiveTricksCount,
      lastTrickWinnerTeam: this.lastTrickWinnerTeam,
      lastTrickWinnerPlayerId: this.lastTrickWinnerPlayerId,
      lastTrickWinningCard: this.lastTrickWinningCard ? { ...this.lastTrickWinningCard } : null,
      revealedHands: Array.from(this.shownHandPlayerIds).reduce((acc, pid) => {
        if (this.hands[pid]) {
          acc[pid] = this.hands[pid].map((c) => ({ ...c }));
        }
        return acc;
      }, {} as { [playerId: string]: Card[] }),
      surrenderVotes: {
        TEAM_1: Array.from(this.surrenderVotes.TEAM_1),
        TEAM_2: Array.from(this.surrenderVotes.TEAM_2),
      },
      scorecard: this.scoringEngine.getState(),
      isMatchOver: this.isMatchOver,
      losingTeamKhoti: this.losingTeamKhoti,
      matchWinnerTeam: this.matchWinnerTeam,
      lastGameWinningTeam: this.lastGameWinningTeam,
      statusMessage: this.statusMessage,
    };
  }

  public getPrivateState(playerId: string): PrivatePlayerState {
    const player = this.players.find((p) => p.id === playerId);
    const myHand = this.hands[playerId] || [];
    const sortedHand = BundRungEngine.sortHand(myHand);
    const isCaller = this.trumpCallerPlayerId === playerId;
    const secretTrumpSuit = isCaller ? this.trumpSuit : null;
    const myTrumpCard = isCaller && this.trumpCard ? { ...this.trumpCard } : null;
    const legalCards = this.getLegalCardsForPlayer(playerId);
    const isMyTrumpCardPlayable = isCaller && this.trumpCard && this.isTrumpRevealed ? legalCards.some((c) => c.id === this.trumpCard!.id) : false;

    // Check if player can request Rung reveal:
    // Only opponent team can ask! Must be this player's turn, Rung unrevealed, not pending, not paused, leadSuit exists, and player is void in leadSuit
    const isCurrentTurn = this.phase === 'TRICK_PLAYING' && this.players[this.currentTurnPlayerIndex]?.id === playerId;
    const caller = this.players.find((p) => p.id === this.trumpCallerPlayerId);
    const isOpponentTeam = caller && player ? player.team !== caller.team : true;
    const leadSuit = this.currentTrick.leadSuit;
    const hasLeadSuit = leadSuit ? myHand.some((c) => c.suit === leadSuit) : true;
    const isVoidInLead = Boolean(leadSuit && !hasLeadSuit);

    const canRequestRungReveal =
      this.phase === 'TRICK_PLAYING' &&
      !this.isTrumpRevealed &&
      !this.isTrumpRevealPending &&
      !this.isRungRevealPaused &&
      isCurrentTurn &&
      isOpponentTeam &&
      isVoidInLead;

    const canShowTrump =
      this.phase === 'TRICK_PLAYING' &&
      this.isTrumpRevealPending &&
      playerId === this.trumpCallerPlayerId;

    // Teammate face-down card (visible face-up to caller & teammate)
    let teammateFaceDownCard: Card | null = null;
    if (this.faceDownLeadPending && this.faceDownLeadCard && this.faceDownLeadPlayerId) {
      const caller = this.players.find((p) => p.id === this.faceDownLeadPlayerId);
      if (player && caller && player.team === caller.team) {
        teammateFaceDownCard = { ...this.faceDownLeadCard };
      }
    }

    // Partner hand: Defending team can inspect partner's hand during faceDownLeadPending
    let partnerHand: Card[] | null = null;
    if (this.faceDownLeadPending && player && this.faceDownLeadPlayerId) {
      const caller = this.players.find((p) => p.id === this.faceDownLeadPlayerId);
      if (caller && player.team !== caller.team) {
        const partner = this.players.find((p) => p.team === player.team && p.id !== player.id);
        if (partner && this.hands[partner.id]) {
          partnerHand = BundRungEngine.sortHand(this.hands[partner.id]);
        }
      }
    }

    return {
      myPlayerId: playerId,
      myHand: sortedHand,
      myTrumpCard,
      isMyTrumpCardPlayable,
      secretTrumpSuit,
      legalPlayableCardIds: this.faceDownLeadPending || this.isRungRevealPaused || this.isTrumpRevealPending || canRequestRungReveal ? [] : legalCards.map((c) => c.id),
      canRequestRungReveal,
      canShowTrump,
      teammateFaceDownCard,
      partnerHand,
      isInspectingPartnerCards: this.opponentsInspectingCards && partnerHand !== null,
      isMyHandRevealed: this.shownHandPlayerIds.has(playerId),
      hasVotedSurrender: Boolean(player && this.surrenderVotes[player.team]?.has(playerId)),
    };
  }

  public getClientGameState(playerId: string): FullClientGameState {
    return {
      publicState: this.getPublicState(),
      privateState: this.getPrivateState(playerId),
    };
  }

  public getPlayers(): Player[] {
    return this.players;
  }

  public getHands(): { [playerId: string]: Card[] } {
    return this.hands;
  }

  public getPhase(): GamePhase {
    return this.phase;
  }
}
