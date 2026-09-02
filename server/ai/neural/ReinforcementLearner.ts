import { NeuralNetwork } from './NeuralNetwork';
import { ReplayBuffer, Transition } from './ReplayBuffer';

export class ReinforcementLearner {
  public onlineNetwork: NeuralNetwork;
  public targetNetwork: NeuralNetwork;
  public replayBuffer: ReplayBuffer;

  public gamma: number = 0.95; // Future reward discount
  public learningRate: number = 0.001;
  public batchSize: number = 32;

  constructor() {
    this.onlineNetwork = new NeuralNetwork();
    this.targetNetwork = this.onlineNetwork.clone();
    this.replayBuffer = new ReplayBuffer(30000);
  }

  /**
   * Records a game step transition into replay memory
   */
  public recordExperience(transition: Transition): void {
    this.replayBuffer.push(transition);
  }

  /**
   * Trains on a minibatch sampled from replay memory using Bellman Q-Learning
   */
  public trainBatch(): number {
    if (this.replayBuffer.size() < this.batchSize) return 0;

    const batch = this.replayBuffer.sample(this.batchSize);
    let batchLoss = 0;

    for (const item of batch) {
      // 1. Compute target Q-value
      let targetQ = item.reward;
      if (!item.done && item.legalActionsNext.length > 0) {
        const nextQValues = this.targetNetwork.forward(item.nextState);
        let maxNextQ = -Infinity;
        for (const nextAction of item.legalActionsNext) {
          if (nextQValues[nextAction] > maxNextQ) {
            maxNextQ = nextQValues[nextAction];
          }
        }
        if (maxNextQ !== -Infinity) {
          targetQ += this.gamma * maxNextQ;
        }
      }

      // 2. Target vector for action mask
      const currentQValues = this.onlineNetwork.forward(item.state);
      const targetVector = new Float32Array(currentQValues);
      targetVector[item.action] = targetQ;

      const actionMask = new Array(52).fill(false);
      actionMask[item.action] = true;

      // 3. Gradient descent step
      const loss = this.onlineNetwork.trainStep(
        item.state,
        targetVector,
        actionMask,
        this.learningRate
      );
      batchLoss += loss;
    }

    // Soft update target network towards online network
    this.targetNetwork.softUpdateFrom(this.onlineNetwork, 0.05);

    return batchLoss / batch.length;
  }
}
