import { BundRungEngine } from '../../engine/BundRungEngine';
import { StateVectorizer } from './StateVectorizer';
import { ReinforcementLearner } from './ReinforcementLearner';
import { ModelManager } from './ModelManager';
import { Card } from '../../../shared/types';

interface PendingMoveSnapshot {
  playerId: string;
  isHuman: boolean;
  stateVector: Float32Array;
  actionIndex: number;
}

export class LiveLearningEngine {
  private static learner: ReinforcementLearner = new ReinforcementLearner();
  private static roomMoveHistory: Map<string, PendingMoveSnapshot[]> = new Map();
  private static isInitialized: boolean = false;
  private static completedTricksCount: Map<string, number> = new Map();

  /**
   * Initializes learner with existing brain if available
   */
  public static init(): void {
    if (this.isInitialized) return;
    const existing = ModelManager.getModel();
    if (existing) {
      this.learner.onlineNetwork = existing.clone();
      this.learner.targetNetwork = existing.clone();
      console.log('🧠 [Live Learning] Initialized with existing bund_rung_brain.json weights.');
    }
    this.isInitialized = true;
  }

  /**
   * Captures the board state right before a card is played
   */
  public static onBeforeCardPlayed(engine: BundRungEngine, roomId: string, playerId: string, cardId: string): void {
    try {
      this.init();
      const publicState = engine.getPublicState();
      const privateState = engine.getPrivateState(playerId);
      const players = engine.getPlayers();
      const player = players.find((p) => p.id === playerId);
      if (!player) return;

      const allCards = [...privateState.myHand, privateState.myTrumpCard].filter((c): c is Card => Boolean(c));
      const card = allCards.find((c) => c.id === cardId);
      if (!card) return;

      const stateVector = StateVectorizer.vectorize(publicState, privateState, playerId, players);
      const actionIndex = StateVectorizer.cardToIndex(card);

      if (!this.roomMoveHistory.has(roomId)) {
        this.roomMoveHistory.set(roomId, []);
      }

      this.roomMoveHistory.get(roomId)!.push({
        playerId,
        isHuman: !player.isBot,
        stateVector,
        actionIndex,
      });

      // Keep track of trick count for completion detection
      if (!this.completedTricksCount.has(roomId)) {
        this.completedTricksCount.set(roomId, publicState.completedTricks.length);
      }
    } catch (err) {
      // Non-critical, never crash game
    }
  }

  /**
   * Evaluates after a card is played to detect trick or game completion and trigger learning
   */
  public static onAfterCardPlayed(engine: BundRungEngine, roomId: string): void {
    try {
      const publicState = engine.getPublicState();
      const prevTrickCount = this.completedTricksCount.get(roomId) || 0;
      const currentTrickCount = publicState.completedTricks.length;

      // Detect trick completed
      if (currentTrickCount > prevTrickCount) {
        this.completedTricksCount.set(roomId, currentTrickCount);
        const lastTrick = publicState.completedTricks[currentTrickCount - 1];
        const trickWinnerId = lastTrick.winnerPlayerId;
        const players = engine.getPlayers();
        const winnerPlayer = players.find((p) => p.id === trickWinnerId);
        const winnerTeam = winnerPlayer?.team;

        const history = this.roomMoveHistory.get(roomId) || [];
        const isGameDone = publicState.isMatchOver || currentTrickCount >= 13;

        // Feed each of the 4 plays from this trick into the experience replay buffer
        for (const item of history) {
          const player = players.find((p) => p.id === item.playerId);
          const isWinner = item.playerId === trickWinnerId;
          const isPartner = player?.team === winnerTeam && !isWinner;

          // Reward formula with bonus for successful human demonstration
          let reward = isWinner ? 1.0 : isPartner ? 0.8 : -1.0;
          if (item.isHuman && isWinner) {
            reward += 0.5; // Extra weight to learn from human master moves!
          }

          const privateState = engine.getPrivateState(item.playerId);
          const nextLegal = (privateState.legalPlayableCardIds || []).map((cid) => {
            const c = [...privateState.myHand, privateState.myTrumpCard].find((x) => x?.id === cid);
            return c ? StateVectorizer.cardToIndex(c) : 0;
          });

          this.learner.recordExperience({
            state: item.stateVector,
            action: item.actionIndex,
            reward,
            nextState: item.stateVector,
            done: isGameDone,
            legalActionsNext: nextLegal,
          });
        }

        // Clear history for next trick
        this.roomMoveHistory.set(roomId, []);

        // Background non-blocking training step
        setImmediate(() => {
          this.learner.trainBatch();
        });
      }

      // Detect match completion: save updated weights to disk!
      if (publicState.isMatchOver) {
        setImmediate(() => {
          this.learner.trainBatch();
          ModelManager.saveModel(this.learner.onlineNetwork);
          console.log(`🧠 [Live Learning] Absorbed complete live game from Room "${roomId}". Saved updated neural brain to disk!`);
        });
        this.roomMoveHistory.delete(roomId);
        this.completedTricksCount.delete(roomId);
      }
    } catch (err) {
      // Non-critical, never crash game
    }
  }
}
