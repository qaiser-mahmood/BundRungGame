export interface NeuralNetworkWeights {
  w1: number[][]; // [183][128]
  b1: number[];   // [128]
  w2: number[][]; // [128][64]
  b2: number[];   // [64]
  w3: number[][]; // [64][52]
  b3: number[];   // [52]
}

export class NeuralNetwork {
  public inputSize: number;
  public hidden1Size: number;
  public hidden2Size: number;
  public outputSize: number;

  public w1: Float32Array; // Flattened [inputSize * hidden1Size]
  public b1: Float32Array; // [hidden1Size]
  public w2: Float32Array; // [hidden1Size * hidden2Size]
  public b2: Float32Array; // [hidden2Size]
  public w3: Float32Array; // [hidden2Size * outputSize]
  public b3: Float32Array; // [outputSize]

  constructor(
    inputSize: number = 183,
    hidden1Size: number = 128,
    hidden2Size: number = 64,
    outputSize: number = 52
  ) {
    this.inputSize = inputSize;
    this.hidden1Size = hidden1Size;
    this.hidden2Size = hidden2Size;
    this.outputSize = outputSize;

    this.w1 = new Float32Array(inputSize * hidden1Size);
    this.b1 = new Float32Array(hidden1Size);
    this.w2 = new Float32Array(hidden1Size * hidden2Size);
    this.b2 = new Float32Array(hidden2Size);
    this.w3 = new Float32Array(hidden2Size * outputSize);
    this.b3 = new Float32Array(outputSize);

    this.initializeWeights();
  }

  /**
   * Xavier (Glorot) Uniform initialization
   */
  private initializeWeights(): void {
    const initMatrix = (arr: Float32Array, fanIn: number, fanOut: number) => {
      const limit = Math.sqrt(6 / (fanIn + fanOut));
      for (let i = 0; i < arr.length; i++) {
        arr[i] = (Math.random() * 2 - 1) * limit;
      }
    };

    initMatrix(this.w1, this.inputSize, this.hidden1Size);
    initMatrix(this.w2, this.hidden1Size, this.hidden2Size);
    initMatrix(this.w3, this.hidden2Size, this.outputSize);
  }

  /**
   * Forward pass: returns raw Q-values for all 52 card actions
   */
  public forward(input: Float32Array): Float32Array {
    const h1 = new Float32Array(this.hidden1Size);
    for (let j = 0; j < this.hidden1Size; j++) {
      let sum = this.b1[j];
      const offset = j * this.inputSize;
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.w1[offset + i];
      }
      h1[j] = Math.max(0, sum); // ReLU
    }

    const h2 = new Float32Array(this.hidden2Size);
    for (let k = 0; k < this.hidden2Size; k++) {
      let sum = this.b2[k];
      const offset = k * this.hidden1Size;
      for (let j = 0; j < this.hidden1Size; j++) {
        sum += h1[j] * this.w2[offset + j];
      }
      h2[k] = Math.max(0, sum); // ReLU
    }

    const out = new Float32Array(this.outputSize);
    for (let m = 0; m < this.outputSize; m++) {
      let sum = this.b3[m];
      const offset = m * this.hidden2Size;
      for (let k = 0; k < this.hidden2Size; k++) {
        sum += h2[k] * this.w3[offset + k];
      }
      out[m] = sum; // Linear output (Q-values)
    }

    return out;
  }

  /**
   * Evaluates legal moves and selects the best action with optional epsilon-greedy exploration
   */
  public selectAction(
    input: Float32Array,
    legalActionIndices: number[],
    epsilon: number = 0
  ): number {
    if (legalActionIndices.length === 0) return 0;
    if (legalActionIndices.length === 1) return legalActionIndices[0];

    // Exploration: pick random legal action
    if (Math.random() < epsilon) {
      const randIdx = Math.floor(Math.random() * legalActionIndices.length);
      return legalActionIndices[randIdx];
    }

    // Exploitation: pick highest Q-value among legal actions
    const qValues = this.forward(input);
    let bestAction = legalActionIndices[0];
    let bestQ = -Infinity;

    for (const action of legalActionIndices) {
      if (qValues[action] > bestQ) {
        bestQ = qValues[action];
        bestAction = action;
      }
    }

    return bestAction;
  }

  /**
   * One gradient descent update step with learning rate and gradient clipping
   */
  public trainStep(
    input: Float32Array,
    targetQValues: Float32Array,
    actionMask: boolean[],
    learningRate: number = 0.001
  ): number {
    // 1. Forward pass with activation caching
    const h1 = new Float32Array(this.hidden1Size);
    const z1 = new Float32Array(this.hidden1Size);
    for (let j = 0; j < this.hidden1Size; j++) {
      let sum = this.b1[j];
      const offset = j * this.inputSize;
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.w1[offset + i];
      }
      z1[j] = sum;
      h1[j] = Math.max(0, sum);
    }

    const h2 = new Float32Array(this.hidden2Size);
    const z2 = new Float32Array(this.hidden2Size);
    for (let k = 0; k < this.hidden2Size; k++) {
      let sum = this.b2[k];
      const offset = k * this.hidden1Size;
      for (let j = 0; j < this.hidden1Size; j++) {
        sum += h1[j] * this.w2[offset + j];
      }
      z2[k] = sum;
      h2[k] = Math.max(0, sum);
    }

    const out = new Float32Array(this.outputSize);
    for (let m = 0; m < this.outputSize; m++) {
      let sum = this.b3[m];
      const offset = m * this.hidden2Size;
      for (let k = 0; k < this.hidden2Size; k++) {
        sum += h2[k] * this.w3[offset + k];
      }
      out[m] = sum;
    }

    // 2. Output error (MSE loss only on masked active actions)
    const dOut = new Float32Array(this.outputSize);
    let totalLoss = 0;
    for (let m = 0; m < this.outputSize; m++) {
      if (actionMask[m]) {
        const diff = out[m] - targetQValues[m];
        // Huber / gradient clip
        const clippedDiff = Math.max(-1.0, Math.min(1.0, diff));
        dOut[m] = clippedDiff;
        totalLoss += diff * diff;
      }
    }

    // 3. Backprop through Layer 3
    const dH2 = new Float32Array(this.hidden2Size);
    for (let m = 0; m < this.outputSize; m++) {
      if (!actionMask[m]) continue;
      const grad = dOut[m];
      this.b3[m] -= learningRate * grad;
      const offset = m * this.hidden2Size;
      for (let k = 0; k < this.hidden2Size; k++) {
        dH2[k] += grad * this.w3[offset + k];
        this.w3[offset + k] -= learningRate * grad * h2[k];
      }
    }

    // 4. Backprop through Layer 2 (ReLU derivative)
    const dH1 = new Float32Array(this.hidden1Size);
    for (let k = 0; k < this.hidden2Size; k++) {
      if (z2[k] <= 0) continue; // ReLU derivative = 0
      const grad = dH2[k];
      this.b2[k] -= learningRate * grad;
      const offset = k * this.hidden1Size;
      for (let j = 0; j < this.hidden1Size; j++) {
        dH1[j] += grad * this.w2[offset + j];
        this.w2[offset + j] -= learningRate * grad * h1[j];
      }
    }

    // 5. Backprop through Layer 1
    for (let j = 0; j < this.hidden1Size; j++) {
      if (z1[j] <= 0) continue;
      const grad = dH1[j];
      this.b1[j] -= learningRate * grad;
      const offset = j * this.inputSize;
      for (let i = 0; i < this.inputSize; i++) {
        this.w1[offset + i] -= learningRate * grad * input[i];
      }
    }

    return totalLoss;
  }

  /**
   * Clone network parameters
   */
  public clone(): NeuralNetwork {
    const copy = new NeuralNetwork(this.inputSize, this.hidden1Size, this.hidden2Size, this.outputSize);
    copy.w1.set(this.w1);
    copy.b1.set(this.b1);
    copy.w2.set(this.w2);
    copy.b2.set(this.b2);
    copy.w3.set(this.w3);
    copy.b3.set(this.b3);
    return copy;
  }

  /**
   * Soft target update: target = tau * online + (1 - tau) * target
   */
  public softUpdateFrom(source: NeuralNetwork, tau: number = 0.05): void {
    const blend = (target: Float32Array, src: Float32Array) => {
      for (let i = 0; i < target.length; i++) {
        target[i] = tau * src[i] + (1 - tau) * target[i];
      }
    };
    blend(this.w1, source.w1);
    blend(this.b1, source.b1);
    blend(this.w2, source.w2);
    blend(this.b2, source.b2);
    blend(this.w3, source.w3);
    blend(this.b3, source.b3);
  }

  /**
   * Serializes weights to JSON object
   */
  public toJSON(): object {
    return {
      inputSize: this.inputSize,
      hidden1Size: this.hidden1Size,
      hidden2Size: this.hidden2Size,
      outputSize: this.outputSize,
      w1: Array.from(this.w1),
      b1: Array.from(this.b1),
      w2: Array.from(this.w2),
      b2: Array.from(this.b2),
      w3: Array.from(this.w3),
      b3: Array.from(this.b3),
    };
  }

  /**
   * Deserializes weights from JSON object
   */
  public static fromJSON(data: any): NeuralNetwork {
    const net = new NeuralNetwork(data.inputSize, data.hidden1Size, data.hidden2Size, data.outputSize);
    net.w1.set(data.w1);
    net.b1.set(data.b1);
    net.w2.set(data.w2);
    net.b2.set(data.b2);
    net.w3.set(data.w3);
    net.b3.set(data.b3);
    return net;
  }
}
