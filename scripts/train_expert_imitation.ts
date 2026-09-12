import { BundRungEngine } from '../server/engine/BundRungEngine';
import { NeuralNetwork } from '../server/ai/neural/NeuralNetwork';
import { StateVectorizer } from '../server/ai/neural/StateVectorizer';
import { ModelManager } from '../server/ai/neural/ModelManager';
import { BotPlayer } from '../server/ai/BotPlayer';
import { Card } from '../shared/types';

async function trainExpertImitation(totalGames: number = 5000) {
  console.log(`=======================================================`);
  console.log(`🎓 Bund Rung Expert Demonstration & Imitation Trainer`);
  console.log(`Target: 5,000 matches using Master Tactical Rule Heuristics`);
  console.log(`Goal: Bootstrap Neural Brain to 85th+ percentile play`);
  console.log(`Tip: Press Ctrl + C at any time to safely stop & save!`);
  console.log(`=======================================================\n`);

  // Initialize fresh neural brain with upgraded 241 features
  const network = new NeuralNetwork(StateVectorizer.FEATURE_COUNT);

  let isTerminating = false;
  process.on('SIGINT', () => {
    if (isTerminating) process.exit(0);
    isTerminating = true;
    console.log(`\n\n🛑 Training stopped by user (Ctrl+C).`);
    console.log(`💾 Saving learned weights to bund_rung_brain.json...`);
    ModelManager.saveModel(network);
    console.log(`✅ Brain safely saved!`);
    process.exit(0);
  });

  const startTime = Date.now();
  let totalDecisions = 0;
  let correctPredictions = 0;
  let runningLoss = 0;
  let lossCount = 0;

  for (let gameIdx = 1; gameIdx <= totalGames; gameIdx++) {
    const engine = new BundRungEngine();
    const botIds = ['bot_south', 'bot_east', 'bot_north', 'bot_west'];
    botIds.forEach((id, idx) => {
      engine.addPlayer(id, `MasterBot_${idx}`, true);
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

    // Play all 13 tricks using Master Rule Heuristics and train network by demonstration
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
      const allHandCards = [...privateState.myHand, privateState.myTrumpCard].filter((c): c is Card => c !== null);
      const legalCardObjects = allHandCards.filter((c) => legalCards.includes(c.id));

      // 1. Compute Master Card using full Tactical Engine
      const masterChosenCard = BotPlayer.chooseMasterCard(
        engine,
        turnPlayerId,
        legalCardObjects,
        allHandCards,
        publicState,
        privateState
      );

      const stateVector = StateVectorizer.vectorize(publicState, privateState, turnPlayerId, players);
      const targetActionIndex = StateVectorizer.cardToIndex(masterChosenCard);
      const legalIndices = legalCardObjects.map((c) => StateVectorizer.cardToIndex(c));

      // 2. Measure prediction accuracy before training step
      const predictedAction = network.selectAction(stateVector, legalIndices, 0.0);
      if (predictedAction === targetActionIndex) {
        correctPredictions++;
      }
      totalDecisions++;

      // 3. Supervised Gradient Step: Boost master action (+2.0) and penalize sub-optimal legal alternatives (-1.0)
      const currentQ = network.forward(stateVector);
      const targetVector = new Float32Array(currentQ);
      const actionMask = new Array(52).fill(false);

      for (const act of legalIndices) {
        actionMask[act] = true;
        targetVector[act] = act === targetActionIndex ? 2.0 : -1.0;
      }

      const loss = network.trainStep(stateVector, targetVector, actionMask, 0.002);
      runningLoss += loss;
      lossCount++;

      // 4. Play the master card in the engine
      const completedBefore = publicState.completedTricks.length;
      engine.playCard(turnPlayerId, masterChosenCard.id);
      if (engine.getPublicState().completedTricks.length > completedBefore) {
        tricksPlayed++;
      }
    }

    // Periodic Progress Logging
    if (gameIdx % 50 === 0 || gameIdx === totalGames) {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const accuracy = ((correctPredictions / totalDecisions) * 100).toFixed(1);
      const avgLoss = (runningLoss / Math.max(1, lossCount)).toFixed(3);
      console.log(
        `[Match ${gameIdx.toString().padStart(4, ' ')}/${totalGames}] ` +
        `Master Accuracy: ${accuracy}% | ` +
        `Avg Loss: ${avgLoss} | ` +
        `Decisions: ${totalDecisions} | ` +
        `Time: ${elapsedSec}s`
      );
      runningLoss = 0;
      lossCount = 0;
    }

    // Periodic checkpoint save every 500 games
    if (gameIdx % 500 === 0 && gameIdx !== totalGames) {
      ModelManager.saveModel(network);
    }
  }

  console.log(`\n=======================================================`);
  console.log(`🎉 Master Imitation Training Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s!`);
  console.log(` Final Model Accuracy: ${((correctPredictions / totalDecisions) * 100).toFixed(1)}% agreement with Master Bot.`);
  console.log(` Saving master neural weights to bund_rung_brain.json...`);
  ModelManager.saveModel(network);
  console.log(` Upgraded 241-feature Neural AI Brain is ready!`);
  console.log(`=======================================================\n`);
}

const args = process.argv.slice(2);
const gamesCount = args.includes('--games') ? parseInt(args[args.indexOf('--games') + 1], 10) : 5000;
trainExpertImitation(isNaN(gamesCount) ? 5000 : gamesCount);
