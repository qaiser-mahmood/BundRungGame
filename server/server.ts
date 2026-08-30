import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { BundRungEngine } from './engine/BundRungEngine';
import { BotPlayer } from './ai/BotPlayer';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  TeamId,
  SeatPosition,
  Suit,
  OpenTrumpModifier,
} from '../shared/types';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

interface GameRoom {
  id: string;
  engine: BundRungEngine;
  socketMap: { [socketId: string]: string }; // socketId -> playerId
  playerSocketMap: { [playerId: string]: string }; // playerId -> socketId
  botInterval: NodeJS.Timeout | null;
}

const rooms: { [roomId: string]: GameRoom } = {};

function getOrCreateRoom(roomId: string = 'main_room'): GameRoom {
  if (!rooms[roomId]) {
    const engine = new BundRungEngine();
    rooms[roomId] = {
      id: roomId,
      engine,
      socketMap: {},
      playerSocketMap: {},
      botInterval: null,
    };
  }
  return rooms[roomId];
}

function broadcastRoomState(room: GameRoom): void {
  const players = room.engine.getPlayers();

  for (const player of players) {
    const socketId = room.playerSocketMap[player.id];
    if (socketId) {
      const clientState = room.engine.getClientGameState(player.id);
      io.to(socketId).emit('gameStateUpdated', clientState);
    }
  }

  // Also broadcast to any spectators / lobby sockets
  for (const [sId, pId] of Object.entries(room.socketMap)) {
    if (!pId) {
      // Spectator view
      const publicState = room.engine.getPublicState();
      io.to(sId).emit('gameStateUpdated', {
        publicState,
        privateState: {
          myPlayerId: '',
          myHand: [],
          myTrumpCard: null,
          isMyTrumpCardPlayable: false,
          secretTrumpSuit: null,
          legalPlayableCardIds: [],
          canRequestRungReveal: false,
          canShowTrump: false,
          teammateFaceDownCard: null,
          partnerHand: null,
          isInspectingPartnerCards: false,
          isMyHandRevealed: false,
          hasVotedSurrender: false,
        },
      });
    }
  }

  // Trigger Bot Actions if needed
  checkAndRunBotTurns(room);
}

function checkAndRunBotTurns(room: GameRoom): void {
  if (room.botInterval) return;

  const runBotCycle = () => {
    const publicState = room.engine.getPublicState();
    const phase = publicState.phase;
    const players = room.engine.getPlayers();

    let botActionTaken = false;

    // Toss phase bots
    if (phase === 'INITIAL_TOSS' || phase === 'TOSS_TIE_BREAKER') {
      const activeBotIds = publicState.tiedPlayerIds.filter((pid) => {
        const p = players.find((pl) => pl.id === pid);
        return p?.isBot && !publicState.tossDrawnThisRound?.[pid];
      });

      if (activeBotIds.length > 0) {
        const nextBotId = activeBotIds[0];
        BotPlayer.handleBotTurn(room.engine, nextBotId);
        botActionTaken = true;
      }
    }

    // Toss Complete phase (Bot Dealer distributes after delay)
    else if (phase === 'TOSS_COMPLETE') {
      const dealer = players[publicState.dealerPlayerIndex];
      if (dealer && dealer.isBot) {
        setTimeout(() => {
          try {
            if (room.engine.getPhase() === 'TOSS_COMPLETE') {
              room.engine.dealerDistributeCards(dealer.id);
              broadcastRoomState(room);
            }
          } catch (e) {}
        }, 3000);
        return;
      }
    }

    // Game Resolved phase (Bot Dealer distributes next game after 3.5s delay if not match over)
    else if (phase === 'GAME_RESOLVED' && !publicState.isMatchOver) {
      const dealer = players[publicState.dealerPlayerIndex];
      if (dealer && dealer.isBot) {
        setTimeout(() => {
          try {
            if (room.engine.getPhase() === 'GAME_RESOLVED') {
              room.engine.dealerDistributeNextGame(dealer.id);
              broadcastRoomState(room);
            }
          } catch (e) {}
        }, 3500);
        return;
      }
    }

    // Dealer Prepare / Shuffle (Bot Dealer)
    else if (phase === 'PRE_DEAL_SHUFFLE') {
      const dealer = players[publicState.dealerPlayerIndex];
      if (dealer && dealer.isBot) {
        BotPlayer.handleBotTurn(room.engine, dealer.id);
        botActionTaken = true;
      }
    }

    // Cut Offer (Bot Cut Player)
    else if (phase === 'PRE_DEAL_CUT' && publicState.cutOfferPlayerId) {
      const cutPlayer = players.find((p) => p.id === publicState.cutOfferPlayerId);
      if (cutPlayer && cutPlayer.isBot) {
        BotPlayer.handleBotTurn(room.engine, cutPlayer.id);
        botActionTaken = true;
      }
    }

    // Bidding phase (Bot Turn with 1.2s delay so players can see turns passing)
    else if (phase === 'BIDDING_PHASE' && publicState.biddingTurnPlayerId) {
      const bidder = players.find((p) => p.id === publicState.biddingTurnPlayerId);
      if (bidder && bidder.isBot) {
        setTimeout(() => {
          try {
            if (room.engine.getPhase() === 'BIDDING_PHASE' && room.engine.getPublicState().biddingTurnPlayerId === bidder.id) {
              BotPlayer.handleBotTurn(room.engine, bidder.id);
              broadcastRoomState(room);
            }
          } catch (e) {}
        }, 1200);
        return;
      }
    }

    // Trick Playing (Bot Turn)
    else if (phase === 'TRICK_PLAYING') {
      if (publicState.isTrumpRevealPending) {
        // If Trump reveal is pending and the Rung caller is a bot, show Rung after 1.5s
        const caller = players.find((p) => p.id === publicState.trumpCallerPlayerId);
        if (caller && caller.isBot) {
          setTimeout(() => {
            try {
              if (room.engine.getPublicState().isTrumpRevealPending) {
                room.engine.showTrumpCard(caller.id);
                broadcastRoomState(room);
              }
            } catch (e) {}
          }, 1500);
          return;
        }
      } else if (publicState.isRungRevealPaused) {
        // Automatically resume after inspection delay (2.5s) if turn player is a bot
        const turnPlayer = players.find((p) => p.id === publicState.currentTurnPlayerId);
        if (turnPlayer && turnPlayer.isBot) {
          setTimeout(() => {
            try {
              if (room.engine.getPublicState().isRungRevealPaused) {
                room.engine.resumeAfterTrumpReveal();
                broadcastRoomState(room);
              }
            } catch (e) {}
          }, 2500);
          return;
        }
      } else if (publicState.faceDownLeadPending) {
        // If face-down lead challenge is pending, allow defending bots to vote/confirm
        const caller = players.find((p) => p.id === publicState.faceDownLeadPlayerId);
        if (caller) {
          const defendingBots = players.filter((p) => p.team !== caller.team && p.isBot);
          const votes = publicState.faceDownChallengeVotes || {};
          const unvotedDefendingBots = defendingBots.filter((b) => !votes[b.id]);

          if (unvotedDefendingBots.length > 0) {
            const respondingBot = unvotedDefendingBots[0];
            setTimeout(() => {
              try {
                if (room.engine.getPublicState().faceDownLeadPending) {
                  const currentVotes = room.engine.getPublicState().faceDownChallengeVotes || {};
                  const partner = players.find((p) => p.team === respondingBot.team && p.id !== respondingBot.id);
                  const partnerVote = partner ? currentVotes[partner.id] : null;
                  const willPlay = partnerVote === 'SURRENDER' ? false : true;
                  room.engine.respondToFaceDownRung(respondingBot.id, willPlay);
                  broadcastRoomState(room);
                }
              } catch (e) {}
            }, 1200);
            return;
          }
        }
      } else if (publicState.currentTurnPlayerId) {
        const turnPlayer = players.find((p) => p.id === publicState.currentTurnPlayerId);
        if (turnPlayer && turnPlayer.isBot) {
          const delay = publicState.currentTrick.trickNumber === 1 ? 1200 : 700;
          setTimeout(() => {
            try {
              if (room.engine.getPhase() === 'TRICK_PLAYING' && room.engine.getPublicState().currentTurnPlayerId === turnPlayer.id && !room.engine.getPublicState().faceDownLeadPending) {
                BotPlayer.handleBotTurn(room.engine, turnPlayer.id);
                broadcastRoomState(room);
              }
            } catch (e) {}
          }, delay);
          return;
        }
      }
    }

    if (botActionTaken) {
      broadcastRoomState(room);
      // Schedule next check
      room.botInterval = setTimeout(() => {
        room.botInterval = null;
        runBotCycle();
      }, 750);
    } else {
      room.botInterval = null;
    }
  };

  room.botInterval = setTimeout(() => {
    room.botInterval = null;
    runBotCycle();
  }, 600);
}

io.on('connection', (socket: Socket) => {
  let currentRoomId = 'main_room';
  const room = getOrCreateRoom(currentRoomId);
  room.socketMap[socket.id] = '';

  // Immediately send initial state to new connection
  const publicState = room.engine.getPublicState();
  socket.emit('gameStateUpdated', {
    publicState,
    privateState: {
      myPlayerId: '',
      myHand: [],
      myTrumpCard: null,
      isMyTrumpCardPlayable: false,
      secretTrumpSuit: null,
      legalPlayableCardIds: [],
      canRequestRungReveal: false,
      canShowTrump: false,
      teammateFaceDownCard: null,
      partnerHand: null,
      isInspectingPartnerCards: false,
      isMyHandRevealed: false,
      hasVotedSurrender: false,
    },
  });

  socket.on('joinLobby', ({ playerName, roomId }) => {
    const targetRoomId = roomId || 'main_room';
    const targetRoom = getOrCreateRoom(targetRoomId);

    try {
      // Check if this socket already has a player
      let existingPlayerId = targetRoom.socketMap[socket.id];
      if (!existingPlayerId) {
        // Generate new player
        const playerId = `player_${socket.id.substring(0, 6)}`;
        const player = targetRoom.engine.addPlayer(playerId, playerName || 'Player');
        targetRoom.socketMap[socket.id] = player.id;
        targetRoom.playerSocketMap[player.id] = socket.id;
      }
      broadcastRoomState(targetRoom);
    } catch (err: any) {
      socket.emit('notification', { message: err.message, type: 'error' });
    }
  });

  socket.on('addBot', ({ name, seat }) => {
    try {
      room.engine.fillWithBots();
      broadcastRoomState(room);
    } catch (err: any) {
      socket.emit('notification', { message: err.message, type: 'error' });
    }
  });

  socket.on('swapPlayerSeats', ({ player1Id, player2Id }: { player1Id: string; player2Id: string }) => {
    try {
      room.engine.swapPlayerSeats(player1Id, player2Id);
      broadcastRoomState(room);
    } catch (err: any) {
      socket.emit('notification', { message: err.message, type: 'error' });
    }
  });

  socket.on('assignTeams', ({ team1PlayerIds, team2PlayerIds }: { team1PlayerIds: string[]; team2PlayerIds: string[] }) => {
    try {
      room.engine.assignTeams(team1PlayerIds, team2PlayerIds);
      broadcastRoomState(room);
    } catch (err: any) {
      socket.emit('notification', { message: err.message, type: 'error' });
    }
  });

  socket.on('startMatchToss', () => {
    try {
      room.engine.startInitialToss();
      broadcastRoomState(room);
    } catch (err: any) {
      socket.emit('notification', { message: err.message, type: 'error' });
    }
  });

  socket.on('selectTeam', ({ team, seat }: { team: TeamId; seat: SeatPosition }) => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.setTeamAndSeat(playerId, team, seat);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('drawTossCard', ({ cardIndex }: { cardIndex: number }) => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.drawTossCard(playerId, cardIndex);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('dealerDistributeCards', () => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.dealerDistributeCards(playerId);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('dealerShuffle', () => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.dealerShuffle(playerId);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('dealerOfferCut', () => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.dealerOfferCut(playerId);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('performCut', ({ cardIndex }: { cardIndex: number }) => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.performCut(playerId, cardIndex);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('submitBid', ({ action, cardId, suit, modifier }) => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.submitBid(playerId, action, cardId || suit, undefined, modifier);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('selectOpenRungSuit', ({ suit }: { suit: Suit | null }) => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.selectOpenRungSuit(playerId, suit);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('declareOpenRung', ({ suit, cardId, isFaceDown }) => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.declareOpenRung(playerId, suit, cardId, isFaceDown);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('declareBwinjiLead', ({ cardId, isFaceDown }: { cardId: string; isFaceDown: boolean }) => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.declareBwinjiLead(playerId, cardId, isFaceDown);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('declareOpenTrump', ({ suit, modifier }) => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.declareOpenTrump(playerId, suit, modifier);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('toggleInspectPartnerCards', () => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.toggleInspectPartnerCards(playerId);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('respondToFaceDownRung', ({ willPlay }) => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.respondToFaceDownRung(playerId, willPlay);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('respondToFaceDownTrump', ({ willPlay }) => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.respondToFaceDownTrump({ willPlay });
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('requestTrumpReveal', () => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.requestTrumpReveal(playerId);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('showTrumpCard', () => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.showTrumpCard(playerId);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('resumeAfterTrumpReveal', () => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.resumeAfterTrumpReveal(playerId);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('playCard', ({ cardId }: { cardId: string }) => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        const result = room.engine.playCard(playerId, cardId);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('dealerDistributeNextGame', () => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.dealerDistributeNextGame(playerId);
        broadcastRoomState(room);
        checkAndRunBotTurns(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('dealerDistribute5Cards', () => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.dealerDistribute5Cards(playerId);
        broadcastRoomState(room);
        checkAndRunBotTurns(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('updateTeamName', ({ team, name }: { team: TeamId; name: string }) => {
    try {
      room.engine.setCustomTeamName(team, name);
      broadcastRoomState(room);
    } catch (err: any) {
      socket.emit('notification', { message: err.message, type: 'error' });
    }
  });

  socket.on('startNewMatch', () => {
    try {
      room.engine.startNewMatch();
      broadcastRoomState(room);
    } catch (err: any) {
      socket.emit('notification', { message: err.message, type: 'error' });
    }
  });

  socket.on('toggleShowHand', () => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.toggleShowHand(playerId);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('voteSurrender', () => {
    const playerId = room.socketMap[socket.id];
    if (playerId) {
      try {
        room.engine.voteSurrender(playerId);
        broadcastRoomState(room);
      } catch (err: any) {
        socket.emit('notification', { message: err.message, type: 'error' });
      }
    }
  });

  socket.on('disconnect', () => {
    const playerId = room.socketMap[socket.id];
    delete room.socketMap[socket.id];

    if (playerId) {
      delete room.playerSocketMap[playerId];

      // Remove player from engine and reset game state
      const result = room.engine.removePlayer(playerId);

      // Check if any human players remain in the room
      const remainingPlayers = room.engine.getPlayers();
      const hasHumanPlayers = remainingPlayers.some((p) => !p.isBot);

      if (!hasHumanPlayers) {
        // All humans left: completely reset room
        if (room.botInterval) {
          clearTimeout(room.botInterval);
          room.botInterval = null;
        }
        room.engine.resetLobby();
        room.socketMap = {};
        room.playerSocketMap = {};
      } else {
        if (room.botInterval) {
          clearTimeout(room.botInterval);
          room.botInterval = null;
        }
        // Broadcast notification to remaining players
        io.emit('notification', {
          message: `${result.removedPlayerName} left the game. Match ended. Waiting for players to join (${result.remainingCount}/4)...`,
          type: 'warning',
        });
        broadcastRoomState(room);
      }
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎴 Bund Rung Server listening on port ${PORT}`);
});
