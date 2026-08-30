export type Suit = 'HEARTS' | 'DIAMONDS' | 'CLUBS' | 'SPADES';

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  id: string; // e.g. "H_A", "S_10"
  suit: Suit;
  rank: Rank;
  playValue: number; // 2=2 ... 10=10, J=11, Q=12, K=13, A=14 (Standard in-game hierarchy: A > K > Q > J > 10..2)
  tossValue: number; // A=1, 2=2 ... 10=10, J=11, Q=12, K=13 (Toss hierarchy: Ace is lowest)
}

export type SeatPosition = 'BOTTOM' | 'RIGHT' | 'TOP' | 'LEFT';

export type TeamId = 'TEAM_1' | 'TEAM_2'; // Team 1: BOTTOM & TOP; Team 2: RIGHT & LEFT

export interface Player {
  id: string;
  name: string;
  seat: SeatPosition;
  team: TeamId;
  isBot: boolean;
  isDealer: boolean;
  cardsInHandCount: number;
  isConnected: boolean;
}

export type GamePhase =
  | 'WAITING_FOR_PLAYERS' // 2.1 Lobby waiting screen until 4 players connected
  | 'TEAM_FORMATION'      // 2.2 Form 2 teams of 2 players
  | 'INITIAL_TOSS'        // 3.1 52 face-down cards toss to choose dealer
  | 'TOSS_TIE_BREAKER'    // 3.1 Tie breaker for tied lowest cards
  | 'TOSS_COMPLETE'       // 3.1 All 4 cards revealed, lowest card player distributes
  | 'PRE_DEAL_SHUFFLE'    // 4.1 Dealer shuffles & offers cut
  | 'PRE_DEAL_CUT'        // 4.2 Counter-clockwise player cuts deck & swaps piles
  | 'DEALING_PASS_1'      // 4.3 Deal 5 cards each
  | 'BIDDING_PHASE'       // 5.1 & 5.2 Bidding (Close Trump, Bwinji, or Pass)
  | 'DEALING_PASS_2'      // 5.2 Deal remaining 32 cards (4 per player x 2 passes)
  | 'TRICK_PLAYING'       // Play 13 tricks
  | 'GAME_RESOLVED'       // Game finished, calculate scorecard points
  | 'MATCH_OVER';         // Team reached 100+ points (KHOTI)

export type TrumpMode = 'CLOSE_TRUMP' | 'OPEN_TRUMP' | 'BWINJI';

export type OpenTrumpModifier =
  | 'FACE_UP'
  | 'FACE_DOWN_PLAY'
  | 'FACE_DOWN_NO_PLAY';

export type BwinjiModifier =
  | 'FACE_UP'
  | 'FACE_DOWN_PLAY'
  | 'FACE_DOWN_NO_PLAY';

export interface TossDraw {
  playerId: string;
  cardIndex: number;
  card: Card | null; // null if face down
}

export interface FaceDownCallerCard {
  id: string;
  card: Card;
  trickNumber: number;
  isRevealed: boolean;
}

export interface PlayedCard {
  playerId: string;
  card: Card;
  playedAt: number;
  isFaceDown?: boolean;
  isAceDowngraded?: boolean; // When player won previous trick with an Ace and leads this trick with an Ace, it is treated as value 2
}

export interface Trick {
  trickNumber: number; // 1 to 13
  leadPlayerId: string;
  leadSuit: Suit | null;
  cards: PlayedCard[];
  winnerPlayerId: string | null;
  winningTeam: TeamId | null;
}

export interface ScorecardEntry {
  gameIndex: number;
  dealerPlayerId: string;
  dealerTeam: TeamId;
  trumpMode: TrumpMode;
  modifier: string;
  colorChosenByTeam: TeamId;
  colorChosenByPlayerId: string;
  winningTeam: TeamId;
  scoreAdjustment: number; // e.g. -26, +13, +52, -104, etc.
  scorecardAfter: number;
  dealerTransferred: boolean;
  notes: string;
}

export interface ScorecardState {
  dealerScore: number; // Starts at 0, single shared scorecard assigned to active dealer
  history: ScorecardEntry[];
  team1CumulativeKhotiPoints: number;
  team2CumulativeKhotiPoints: number;
}

export interface PublicGameState {
  phase: GamePhase;
  players: Player[];
  activePlayerIndex: number;
  dealerPlayerIndex: number;
  currentTurnPlayerId: string | null;

  // Toss
  tossCardsRemaining: number;
  tossDraws: { [playerId: string]: Card };
  tossDrawHistory: { [playerId: string]: Card[] };
  tossDrawnThisRound: { [playerId: string]: boolean };
  tossRound: number;
  tiedPlayerIds: string[];

  // Cut & Controlled Shuffle
  cutOfferPlayerId: string | null;
  cutDone: boolean;
  shuffleCount: number;

  // Deal & Rung
  trumpMode: TrumpMode | null;
  trumpSuit: Suit | null; // Hidden for Close Rung until revealed
  isTrumpRevealed: boolean;
  trumpCallerPlayerId: string | null;
  trumpCardPlaced: boolean;
  trumpCardPlayerId: string | null;
  revealedTrumpCard: Card | null;
  openTrumpModifier: OpenTrumpModifier | null;
  bwinjiModifier: BwinjiModifier | null;
  firstRoundOpenTrumpAvailable: boolean;
  pendingOpenRungSuit?: Suit | null;
  pendingOpenRungPlayerId?: string | null;

  // Face-down Rung Lead & Inspection (Section 5.3)
  faceDownLeadPending: boolean;
  faceDownLeadPlayerId: string | null;
  faceDownLeadCardFaceDown: boolean;
  opponentsInspectingCards: boolean;
  faceDownChallengeVotes?: { [playerId: string]: 'ACCEPT' | 'SURRENDER' };

  // Normal Play (Close Rung) Face-down Caller Cards & Pause
  faceDownCallerCards: FaceDownCallerCard[];
  isRungRevealPaused: boolean;
  isTrumpRevealPending: boolean;
  trumpRevealRequesterId: string | null;

  // Bidding
  biddingTurnPlayerId: string | null;
  biddingPassCount: number;

  // Trick play
  gameIndex: number;
  currentTrick: Trick;
  previousTrickCards: PlayedCard[] | null;
  completedTricks: Trick[];
  team1TricksWon: number;
  team2TricksWon: number;
  consecutiveTricksCount: number;
  lastTrickWinnerTeam: TeamId | null;
  lastTrickWinnerPlayerId: string | null;
  lastTrickWinningCard: Card | null;

  // Show Cards & Surrender
  revealedHands: { [playerId: string]: Card[] };
  surrenderVotes: { TEAM_1: string[]; TEAM_2: string[] };

  // Scorecard
  scorecard: ScorecardState;

  // Match & KHOTI
  isMatchOver: boolean;
  losingTeamKhoti: TeamId | null;
  matchWinnerTeam: TeamId | null;
  lastGameWinningTeam: TeamId | null;

  // Status message & Dynamic Team Names
  teamNames: { TEAM_1: string; TEAM_2: string };
  statusMessage: string;
}

export interface PrivatePlayerState {
  myPlayerId: string;
  myHand: Card[];
  myTrumpCard: Card | null; // The separate rung card if this player is the rung caller
  isMyTrumpCardPlayable: boolean;
  secretTrumpSuit: Suit | null; // Visible only to the rung caller if Close Rung
  legalPlayableCardIds: string[];
  canRequestRungReveal: boolean; // True if player has no lead suit cards & rung is unrevealed
  canShowTrump: boolean; // True for the rung caller when an opponent has requested rung reveal
  teammateFaceDownCard: Card | null; // Visible face-up to player & teammate when face-down rung is led
  partnerHand: Card[] | null; // Available when opposing team swaps & inspects cards
  isInspectingPartnerCards: boolean;
  isMyHandRevealed: boolean; // True if player has toggled show hand to other players
  hasVotedSurrender: boolean; // True if player has voted to surrender current game
}

export interface FullClientGameState {
  publicState: PublicGameState;
  privateState: PrivatePlayerState;
}

// Socket Events
export interface ClientToServerEvents {
  joinLobby: (data: { playerName: string; roomId?: string }) => void;
  selectTeam: (data: { team: TeamId; seat: SeatPosition }) => void;
  swapPlayerSeats: (data: { player1Id: string; player2Id: string }) => void;
  updateTeamName: (data: { team: TeamId; name: string }) => void;
  assignTeams: (data: { team1PlayerIds: string[]; team2PlayerIds: string[] }) => void;
  startMatchToss: () => void;
  dealerDistributeCards: () => void;
  dealerDistributeNextGame: () => void;
  dealerDistribute5Cards: () => void;
  addBot: (data: { name?: string; seat?: SeatPosition }) => void;
  drawTossCard: (data: { cardIndex: number }) => void;
  dealerShuffle: () => void;
  dealerOfferCut: () => void;
  performCut: (data: { cardIndex: number }) => void;
  submitBid: (data: { action: 'SELECT_CARD_TRUMP' | 'BWINJI' | 'PASS'; cardId?: string; suit?: Suit; modifier?: 'FACE_UP' | 'FACE_DOWN_PLAY' }) => void;
  selectOpenRungSuit: (data: { suit: Suit | null }) => void;
  declareOpenRung: (data: { suit: Suit; cardId: string; isFaceDown: boolean }) => void;
  declareBwinjiLead: (data: { cardId: string; isFaceDown: boolean }) => void;
  toggleInspectPartnerCards: () => void;
  respondToFaceDownTrump: (data: { willPlay: boolean }) => void;
  respondToFaceDownRung: (data: { willPlay: boolean }) => void;
  playCard: (data: { cardId: string }) => void;
  requestTrumpReveal: () => void;
  showTrumpCard: () => void;
  resumeAfterTrumpReveal: () => void;
  startNewMatch: () => void;
  toggleShowHand: () => void;
  voteSurrender: () => void;
}

export interface ServerToClientEvents {
  gameStateUpdated: (state: FullClientGameState) => void;
  notification: (data: { message: string; type?: 'info' | 'success' | 'warning' | 'error' }) => void;
  cardPlayedAnimation: (data: { playerId: string; card: Card }) => void;
  trickWonAnimation: (data: { winnerPlayerId: string; team: TeamId }) => void;
  khotiAnimation: (data: { losingTeam: TeamId }) => void;
}
