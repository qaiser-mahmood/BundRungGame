import { BundRungEngine } from '../server/engine/BundRungEngine';
import { ReinforcementLearner } from '../server/ai/neural/ReinforcementLearner';
import { StateVectorizer } from '../server/ai/neural/StateVectorizer';
import { ModelManager } from '../server/ai/neural/ModelManager';
import { BotPlayer } from '../server/ai/BotPlayer';

async function trainSelfPlay(totalGames: number = 1000) {
  console.log(`=======================================================`);
  console.log(`🚀 Starting Bund Rung Autonomous AI Self-Play Training`);
  console.log(`Target Games: ${totalGames} matches`);
  console.log(`Tip: Press Ctrl + C at any time to safely stop & save!`);
  console.log(`=======================================================\n`);

  const learner = new ReinforcementLearner();

  // 1. Resume from existing trained model if available
  const existingBrain = ModelManager.getModel();
  let epsilon = 1.0;
  if (existingBrain) {
    learner.onlineNetwork = existingBrain.clone();
    learner.targetNetwork = existingBrain.clone();
    epsilon = 0.25; // Lower exploration since it already has learned foundations
    console.log(`📥 Resumed training from existing bund_rung_brain.json! Starting exploration: ${(epsilon * 100).toFixed(0)}%\n`);
  }

  // Graceful Ctrl + C handler so user can stop anytime without losing progress
  let isTerminating = false;
  process.on('SIGINT', () => {
    if (isTerminating) process.exit(0);
    isTerminating = true;
    console.log(`\n\n🛑 Training interrupted by user (Ctrl+C).`);
    console.log(`💾 Saving learned weights to bund_rung_brain.json...`);
    ModelManager.saveModel(learner.onlineNetwork);
    console.log(`✅ Brain safely saved! You can run training again anytime to continue.`);
    process.exit(0);
  });
  const minEpsilon = 0.05;
  const epsilonDecay = Math.exp(Math.log(minEpsilon / 1.0) / (totalGames * 0.8));

  let team1Wins = 0;
  let team2Wins = 0;
  const startTime = Date.now();

  for (let gameIdx = 1; gameIdx <= totalGames; gameIdx++) {
    const engine = new BundRungEngine();

    // Register 4 autonomous bot players
    const botIds = ['bot_south', 'bot_east', 'bot_north', 'bot_west'];
    botIds.forEach((id, idx) => {
      engine.addPlayer(id, `Bot_${idx}`, true);
    });

    engine.assignTeams(['bot_south', 'bot_north'], ['bot_east', 'bot_west']);
    engine.startInitialToss();

    // Setup Phases (Toss, Dealer Shuffle, Cut, 5-Card Deal, Bidding, Remaining Deal)
    let setupSafety = 0;
    while (engine.getPhase() !== 'TRICK_PLAYING' && !engine.getPublicState().isMatchOver && setupSafety < 60) {
      setupSafety++;
      const currentPhase = engine.getPhase();
      const pState = engine.getPublicState();
      const dealer = engine.getPlayers()[pState.dealerPlayerIndex];

      if (currentPhase === 'TOSS_COMPLETE' && dealer) {
        engine.dealerDistributeCards(dealer.id);
        continue;
      }
      if (currentPhase === 'DEALING_PASS_1' && dealer) {
        engine.dealerDistribute5Cards(dealer.id);
        continue;
      }
      if (currentPhase === 'DEALING_PASS_2' && dealer) {
        engine.dealerDistributeRemainingCards(dealer.id);
        continue;
      }

      for (const p of engine.getPlayers()) {
        BotPlayer.handleBotTurn(engine, p.id);
      }
    }

    // Track state transitions per trick
    // Track state transitions per bot player independently (True Multi-Agent MDP)
    interface PendingTransition {
      state: Float32Array;
      actionIndex: number;
      cardPlayed: Card;
      wasAceDowngrade: boolean;
    }
    const pendingTransitions: Record<string, PendingTransition | null> = {
      bot_south: null,
      bot_east: null,
      bot_north: null,
      bot_west: null,
    };
    const playerAccumulatedReward: Record<string, number> = {
      bot_south: 0,
      bot_east: 0,
      bot_north: 0,
      bot_west: 0,
    };

    // Main Trick Playing Loop
    let tricksPlayed = 0;
    while (engine.getPhase() === 'TRICK_PLAYING' && tricksPlayed < 13) {
      const publicState = engine.getPublicState();
      const turnPlayerId = publicState.currentTurnPlayerId;
      if (!turnPlayerId) break;

      const privateState = engine.getPrivateState(turnPlayerId);

      if (publicState.isRungRevealPaused) {
        engine.resumeAfterTrumpReveal();
        continue;
      }
      if (privateState.canShowTrump) {
        engine.showTrumpCard(turnPlayerId);
        continue;
      }
      if (privateState.canRequestRungReveal && !publicState.isTrumpRevealed) {
        engine.requestTrumpReveal(turnPlayerId);
        continue;
      }

      const legalCards = privateState.legalPlayableCardIds || [];
      if (legalCards.length === 0) break;

      const players = engine.getPlayers();
      const stateVector = StateVectorizer.vectorize(publicState, privateState, turnPlayerId, players);
      const legalIndices = legalCards.map((cid) => {
        const c = [...privateState.myHand, privateState.myTrumpCard].find((x) => x?.id === cid);
        return c ? StateVectorizer.cardToIndex(c) : 0;
      });

      // Close this player's PREVIOUS transition now that we have their TRUE next state (s') & legal actions (a')
      const prevTransition = pendingTransitions[turnPlayerId];
      if (prevTransition) {
        learner.recordExperience({
          state: prevTransition.state,
          action: prevTransition.actionIndex,
          reward: playerAccumulatedReward[turnPlayerId],
          nextState: stateVector,
          done: false,
          legalActionsNext: legalIndices,
        });
        playerAccumulatedReward[turnPlayerId] = 0;
      }

      // Action selection (Hybrid: Guided exploitation of Master Bot heuristics with epsilon exploration)
      let chosenActionIndex: number;
      if (Math.random() < epsilon) {
        chosenActionIndex = legalIndices[Math.floor(Math.random() * legalIndices.length)];
      } else {
        // Evaluate candidate cards using Master heuristics + Neural evaluation
        const masterCard = BotPlayer.chooseMasterCard(
          engine,
          turnPlayerId,
          [...privateState.myHand, privateState.myTrumpCard].filter((c): c is Card => c !== null && legalCards.includes(c.id)),
          [...privateState.myHand, privateState.myTrumpCard].filter((c): c is Card => c !== null),
          publicState,
          privateState
        );
        chosenActionIndex = StateVectorizer.cardToIndex(masterCard);
        if (!legalIndices.includes(chosenActionIndex)) {
          chosenActionIndex = learner.onlineNetwork.selectAction(stateVector, legalIndices, 0.0);
        }
      }

      const chosenCardData = StateVectorizer.indexToCard(chosenActionIndex);

      // Find the card ID matching the chosen action
      const cardToPlay = [...privateState.myHand, privateState.myTrumpCard].find(
        (c) => c && c.suit === chosenCardData.suit && c.rank === chosenCardData.rank && legalCards.includes(c.id)
      ) || [...privateState.myHand, privateState.myTrumpCard].find((c) => c && legalCards.includes(c.id));

      if (cardToPlay) {
        const lastTrickBefore = publicState.completedTricks[publicState.completedTricks.length - 1];
        const isConsecutiveAceLead = publicState.currentTrick.cards.length === 0 &&
          cardToPlay.rank === 'A' &&
          lastTrickBefore &&
          lastTrickBefore.leadPlayerId === turnPlayerId &&
          lastTrickBefore.cards[0]?.card?.rank === 'A';

        pendingTransitions[turnPlayerId] = {
          state: stateVector,
          actionIndex: chosenActionIndex,
          cardPlayed: cardToPlay,
          wasAceDowngrade: isConsecutiveAceLead,
        };

        const completedBefore = publicState.completedTricks.length;
        engine.playCard(turnPlayerId, cardToPlay.id);
        const stateAfter = engine.getPublicState();

        // Check if trick completed
        if (stateAfter.completedTricks.length > completedBefore) {
          tricksPlayed++;
          const lastTrick = stateAfter.completedTricks[stateAfter.completedTricks.length - 1];
          const trickWinnerId = lastTrick.winnerPlayerId;
          const winnerPlayer = players.find((p) => p.id === trickWinnerId);
          const winnerTeam = winnerPlayer?.team;

          // Check if this trick scored a consecutive streak Hand!
          const trickNum = stateAfter.completedTricks.length;
          const wasStreakSecured = trickNum >= 2 &&
            stateAfter.lastTrickWinnerPlayerId !== null &&
            (publicState.lastTrickWinnerPlayerId === trickWinnerId ||
             (publicState.lastTrickWinnerPlayerId && players.find((p) => p.id === publicState.lastTrickWinnerPlayerId)?.team === winnerTeam));

          // Assign rewards to all 4 participants of this trick
          for (const botId of botIds) {
            const p = players.find((pl) => pl.id === botId);
            const isWinner = botId === trickWinnerId;
            const isPartner = p?.team === winnerTeam && !isWinner;
            const isOurTeamWin = p?.team === winnerTeam;

            let trickReward = isWinner ? 1.0 : isPartner ? 0.8 : -1.0;
            if (isOurTeamWin && wasStreakSecured) {
              trickReward += 2.5; // Strategic 2-streak Hand Reward!
            }

            const pending = pendingTransitions[botId];
            if (pending) {
              // Penalty for Ace Downgrade blunder
              if (pending.wasAceDowngrade) {
                trickReward -= 2.0;
              }
              // Penalty for prematurely squandering Trump on non-streak trick
              const activeTrump = stateAfter.trumpSuit || stateAfter.secretTrumpSuit;
              const wasTrump = activeTrump && pending.cardPlayed.suit === activeTrump;
              if (wasTrump && !isOurTeamWin && !wasStreakSecured && trickNum < 9) {
                trickReward -= 1.5;
              }

              // Penalty for Caller violating Trump Quarantine: leading trump in tricks 1-5 while holding outside cards
              const isCaller = botId === stateAfter.trumpCallerPlayerId;
              const isLeadCard = lastTrick.leadPlayerId === botId;
              if (isCaller && isLeadCard && wasTrump && trickNum <= 5) {
                trickReward -= 2.5; // Strict penalty for early trump lead by caller
              }

              // Reward for caller/partner cashing outside Aces early
              if (isOurTeamWin && isLeadCard && pending.cardPlayed.rank === 'A' && !wasTrump && trickNum <= 5) {
                trickReward += 1.5; // Solid reward for establishing outside boss Aces
              }
            }

            playerAccumulatedReward[botId] = (playerAccumulatedReward[botId] || 0) + trickReward;
          }

          learner.trainBatch();
        }
      } else {
        break;
      }
    }

    // Match completed - tally match-level rewards (+10 win / -10 loss)
    const finalPublicState = engine.getPublicState();
    const team1WonMatch = finalPublicState.team1TricksWon > finalPublicState.team2TricksWon;

    const players = engine.getPlayers();
    for (const botId of botIds) {
      const p = players.find((pl) => pl.id === botId);
      const isTeam1 = p?.team === 'TEAM_1';
      const isMatchWinner = (isTeam1 && team1WonMatch) || (!isTeam1 && !team1WonMatch);
      const matchReward = isMatchWinner ? 10.0 : -10.0;

      const prev = pendingTransitions[botId];
      if (prev) {
        learner.recordExperience({
          state: prev.state,
          action: prev.actionIndex,
          reward: (playerAccumulatedReward[botId] || 0) + matchReward,
          nextState: prev.state,
          done: true,
          legalActionsNext: [],
        });
      }
    }

    if (team1WonMatch) {
      team1Wins++;
    } else {
      team2Wins++;
    }

    // Decay exploration epsilon
    epsilon = Math.max(minEpsilon, epsilon * epsilonDecay);

    // Logging
    if (gameIdx % 25 === 0 || gameIdx === totalGames) {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const replaySize = learner.replayBuffer.size();
      console.log(
        `[Game ${gameIdx.toString().padStart(4, ' ')}/${totalGames}] ` +
        `T1 Wins: ${team1Wins} | T2 Wins: ${team2Wins} | ` +
        `ε (explore): ${(epsilon * 100).toFixed(1)}% | ` +
        `Memory: ${replaySize} steps | Time: ${elapsedSec}s`
      );
    }

    // Periodic checkpoint auto-save every 500 games
    if (gameIdx % 500 === 0 && gameIdx !== totalGames) {
      ModelManager.saveModel(learner.onlineNetwork);
    }
  }

  console.log(`\n=======================================================`);
  console.log(` Training Finished in ${((Date.now() - startTime) / 1000).toFixed(1)}s!`);
  console.log(` Saving optimized neural weights to bund_rung_brain.json...`);
  ModelManager.saveModel(learner.onlineNetwork);
  console.log(` Autonomous Neural AI is ready for live play!`);
  console.log(`=======================================================\n`);
}

// Parse optional CLI arguments (default 5,000 matches)
const args = process.argv.slice(2);
const gamesCount = args.includes('--games') ? parseInt(args[args.indexOf('--games') + 1], 10) : 5000;
trainSelfPlay(isNaN(gamesCount) ? 5000 : gamesCount);
