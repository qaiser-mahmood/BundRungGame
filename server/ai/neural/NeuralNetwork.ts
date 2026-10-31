import { FEATURE_COUNT, FEATURE_SCHEMA_VERSION, ARCHITECTURE_VERSION } from './FeatureSchema';
export interface DuelingNetworkWeights {
  inputSize: number;
  sharedSize1: number;
  sharedSize2: number;
  valHiddenSize: number;
  advHiddenSize: number;
  outputSize: number;
  w_shared1: number[];
  b_shared1: number[];
  w_shared2: number[];
  b_shared2: number[];
  w_val1: number[];
  b_val1: number[];
  w_val2: number[];
  b_val2: number[];
  w_adv1: number[];
  b_adv1: number[];
  w_adv2: number[];
  b_adv2: number[];
}

export class NeuralNetwork {
  public inputSize: number;
  public sharedSize1: number;
  public sharedSize2: number;
  public valHiddenSize: number;
  public advHiddenSize: number;
  public outputSize: number;

  // Shared feature extractor
  public w_shared1: Float32Array; // [inputSize * sharedSize1]
  public b_shared1: Float32Array; // [sharedSize1]
  public w_shared2: Float32Array; // [sharedSize1 * sharedSize2]
  public b_shared2: Float32Array; // [sharedSize2]

  // Value stream (evaluates overall board situation)
  public w_val1: Float32Array; // [sharedSize2 * valHiddenSize]
  public b_val1: Float32Array; // [valHiddenSize]
  public w_val2: Float32Array; // [valHiddenSize * 1]
  public b_val2: Float32Array; // [1]

  // Advantage stream (evaluates relative benefit of each card)
  public w_adv1: Float32Array; // [sharedSize2 * advHiddenSize]
  public b_adv1: Float32Array; // [advHiddenSize]
  public w_adv2: Float32Array; // [advHiddenSize * outputSize]
  public b_adv2: Float32Array; // [outputSize]

  constructor(
    inputSize: number = FEATURE_COUNT,
    sharedSize1: number = 256,
    sharedSize2: number = 128,
    valHiddenSize: number = 64,
    advHiddenSize: number = 64,
    outputSize: number = 52
  ) {
    this.inputSize = inputSize;
    this.sharedSize1 = sharedSize1;
    this.sharedSize2 = sharedSize2;
    this.valHiddenSize = valHiddenSize;
    this.advHiddenSize = advHiddenSize;
    this.outputSize = outputSize;

    this.w_shared1 = new Float32Array(inputSize * sharedSize1);
    this.b_shared1 = new Float32Array(sharedSize1);
    this.w_shared2 = new Float32Array(sharedSize1 * sharedSize2);
    this.b_shared2 = new Float32Array(sharedSize2);

    this.w_val1 = new Float32Array(sharedSize2 * valHiddenSize);
    this.b_val1 = new Float32Array(valHiddenSize);
    this.w_val2 = new Float32Array(valHiddenSize * 1);
    this.b_val2 = new Float32Array(1);

    this.w_adv1 = new Float32Array(sharedSize2 * advHiddenSize);
    this.b_adv1 = new Float32Array(advHiddenSize);
    this.w_adv2 = new Float32Array(advHiddenSize * outputSize);
    this.b_adv2 = new Float32Array(outputSize);

    this.initializeWeights();
  }

  /**
   * Xavier / He initialization
   */
  private initializeWeights(): void {
    const initMatrix = (arr: Float32Array, fanIn: number, fanOut: number) => {
      const limit = Math.sqrt(6 / (fanIn + fanOut));
      for (let i = 0; i < arr.length; i++) {
        arr[i] = (Math.random() * 2 - 1) * limit;
      }
    };

    initMatrix(this.w_shared1, this.inputSize, this.sharedSize1);
    initMatrix(this.w_shared2, this.sharedSize1, this.sharedSize2);

    initMatrix(this.w_val1, this.sharedSize2, this.valHiddenSize);
    initMatrix(this.w_val2, this.valHiddenSize, 1);

    initMatrix(this.w_adv1, this.sharedSize2, this.advHiddenSize);
    initMatrix(this.w_adv2, this.advHiddenSize, this.outputSize);
  }

  /**
   * LeakyReLU activation function
   */
  private static leakyRelu(x: number): number {
    return x > 0 ? x : 0.01 * x;
  }

  private static leakyReluGrad(x: number): number {
    return x > 0 ? 1.0 : 0.01;
  }

  /**
   * Layer Normalization
   */
  private static layerNorm(arr: Float32Array): Float32Array {
    let sum = 0;
    const len = arr.length;
    for (let i = 0; i < len; i++) sum += arr[i];
    const mean = sum / len;

    let varSum = 0;
    for (let i = 0; i < len; i++) {
      const diff = arr[i] - mean;
      varSum += diff * diff;
    }
    const invStd = 1.0 / Math.sqrt(varSum / len + 1e-5);

    const norm = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      norm[i] = (arr[i] - mean) * invStd;
    }
    return norm;
  }

  private static layerNormBackward(input: Float32Array, upstream: Float32Array): Float32Array {
    const n = input.length;
    const mean = input.reduce((a,b) => a+b, 0) / n;
    const variance = input.reduce((a,b) => a+(b-mean)**2, 0) / n;
    const inv = 1 / Math.sqrt(variance + 1e-5);
    const normalized = Array.from(input, x => (x-mean)*inv);
    const avg = upstream.reduce((a,b) => a+b, 0) / n;
    const projection = normalized.reduce((a,b,i) => a+b*upstream[i], 0) / n;
    return Float32Array.from(upstream, (g,i) => inv*(g-avg-normalized[i]*projection));
  }

  /**
   * Forward pass: computes Dueling Q-values:
   * Q(s, a) = V(s) + (A(s, a) - mean(A(s, a')))
   */
  public forward(input: Float32Array): Float32Array {
    this.validateInput(input);
    // 1. Shared Layer 1 (input -> 256)
    const z1 = new Float32Array(this.sharedSize1);
    for (let j = 0; j < this.sharedSize1; j++) {
      let sum = this.b_shared1[j];
      const offset = j * this.inputSize;
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.w_shared1[offset + i];
      }
      z1[j] = sum;
    }
    const norm1 = NeuralNetwork.layerNorm(z1);
    const h1 = new Float32Array(this.sharedSize1);
    for (let j = 0; j < this.sharedSize1; j++) h1[j] = NeuralNetwork.leakyRelu(norm1[j]);

    // 2. Shared Layer 2 (256 -> 128)
    const z2 = new Float32Array(this.sharedSize2);
    for (let k = 0; k < this.sharedSize2; k++) {
      let sum = this.b_shared2[k];
      const offset = k * this.sharedSize1;
      for (let j = 0; j < this.sharedSize1; j++) {
        sum += h1[j] * this.w_shared2[offset + j];
      }
      z2[k] = sum;
    }
    const norm2 = NeuralNetwork.layerNorm(z2);
    const h2 = new Float32Array(this.sharedSize2);
    for (let k = 0; k < this.sharedSize2; k++) h2[k] = NeuralNetwork.leakyRelu(norm2[k]);

    // 3. Value Stream (128 -> 64 -> 1)
    const z_val1 = new Float32Array(this.valHiddenSize);
    for (let v = 0; v < this.valHiddenSize; v++) {
      let sum = this.b_val1[v];
      const offset = v * this.sharedSize2;
      for (let k = 0; k < this.sharedSize2; k++) {
        sum += h2[k] * this.w_val1[offset + k];
      }
      z_val1[v] = NeuralNetwork.leakyRelu(sum);
    }
    let value = this.b_val2[0];
    for (let v = 0; v < this.valHiddenSize; v++) {
      value += z_val1[v] * this.w_val2[v];
    }

    // 4. Advantage Stream (128 -> 64 -> 52)
    const z_adv1 = new Float32Array(this.advHiddenSize);
    for (let a = 0; a < this.advHiddenSize; a++) {
      let sum = this.b_adv1[a];
      const offset = a * this.sharedSize2;
      for (let k = 0; k < this.sharedSize2; k++) {
        sum += h2[k] * this.w_adv1[offset + k];
      }
      z_adv1[a] = NeuralNetwork.leakyRelu(sum);
    }

    const rawAdv = new Float32Array(this.outputSize);
    let advSum = 0;
    for (let m = 0; m < this.outputSize; m++) {
      let sum = this.b_adv2[m];
      const offset = m * this.advHiddenSize;
      for (let a = 0; a < this.advHiddenSize; a++) {
        sum += z_adv1[a] * this.w_adv2[offset + a];
      }
      rawAdv[m] = sum;
      advSum += sum;
    }
    const meanAdv = advSum / this.outputSize;

    // 5. Dueling Aggregator: Q(s, a) = V(s) + (A(s, a) - mean(A))
    const qValues = new Float32Array(this.outputSize);
    for (let m = 0; m < this.outputSize; m++) {
      qValues[m] = value + (rawAdv[m] - meanAdv);
    }

    return qValues;
  }

  /**
   * Action selection with strict legal move masking and epsilon-greedy exploration
   */
  public selectAction(
    input: Float32Array,
    legalActionIndices: number[],
    epsilon: number = 0
  ): number {
    if (!legalActionIndices.length || legalActionIndices.some(a => !Number.isInteger(a) || a < 0 || a >= this.outputSize)) throw new Error('Invalid legal action mask');
    if (legalActionIndices.length === 1) return legalActionIndices[0];

    // Exploration
    if (Math.random() < epsilon) {
      const randIdx = Math.floor(Math.random() * legalActionIndices.length);
      return legalActionIndices[randIdx];
    }

    // Exploitation with legal action masking
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
   * Single gradient descent training step on Dueling architecture with Huber gradient clipping
   */
  public trainStep(
    input: Float32Array,
    targetQValues: Float32Array,
    actionMask: boolean[],
    learningRate: number = 0.001
  ): number {
    this.validateInput(input);
    if (targetQValues.length !== this.outputSize || actionMask.length !== this.outputSize ||
        !Array.from(targetQValues).every(Number.isFinite) || !Number.isFinite(learningRate) || learningRate < 0) {
      throw new Error('Invalid training target, mask or learning rate');
    }
    // 1. Forward Pass with activation caching
    const z1 = new Float32Array(this.sharedSize1);
    for (let j = 0; j < this.sharedSize1; j++) {
      let sum = this.b_shared1[j];
      const offset = j * this.inputSize;
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.w_shared1[offset + i];
      }
      z1[j] = sum;
    }
    const norm1 = NeuralNetwork.layerNorm(z1);
    const h1 = new Float32Array(this.sharedSize1);
    for (let j = 0; j < this.sharedSize1; j++) h1[j] = NeuralNetwork.leakyRelu(norm1[j]);

    const z2 = new Float32Array(this.sharedSize2);
    for (let k = 0; k < this.sharedSize2; k++) {
      let sum = this.b_shared2[k];
      const offset = k * this.sharedSize1;
      for (let j = 0; j < this.sharedSize1; j++) {
        sum += h1[j] * this.w_shared2[offset + j];
      }
      z2[k] = sum;
    }
    const norm2 = NeuralNetwork.layerNorm(z2);
    const h2 = new Float32Array(this.sharedSize2);
    for (let k = 0; k < this.sharedSize2; k++) h2[k] = NeuralNetwork.leakyRelu(norm2[k]);

    // Value Stream
    const z_val1 = new Float32Array(this.valHiddenSize);
    for (let v = 0; v < this.valHiddenSize; v++) {
      let sum = this.b_val1[v];
      const offset = v * this.sharedSize2;
      for (let k = 0; k < this.sharedSize2; k++) {
        sum += h2[k] * this.w_val1[offset + k];
      }
      z_val1[v] = NeuralNetwork.leakyRelu(sum);
    }
    let value = this.b_val2[0];
    for (let v = 0; v < this.valHiddenSize; v++) {
      value += z_val1[v] * this.w_val2[v];
    }

    // Advantage Stream
    const z_adv1 = new Float32Array(this.advHiddenSize);
    for (let a = 0; a < this.advHiddenSize; a++) {
      let sum = this.b_adv1[a];
      const offset = a * this.sharedSize2;
      for (let k = 0; k < this.sharedSize2; k++) {
        sum += h2[k] * this.w_adv1[offset + k];
      }
      z_adv1[a] = NeuralNetwork.leakyRelu(sum);
    }

    const rawAdv = new Float32Array(this.outputSize);
    let advSum = 0;
    for (let m = 0; m < this.outputSize; m++) {
      let sum = this.b_adv2[m];
      const offset = m * this.advHiddenSize;
      for (let a = 0; a < this.advHiddenSize; a++) {
        sum += z_adv1[a] * this.w_adv2[offset + a];
      }
      rawAdv[m] = sum;
      advSum += sum;
    }
    const meanAdv = advSum / this.outputSize;

    // Dueling Q-values
    const qOut = new Float32Array(this.outputSize);
    for (let m = 0; m < this.outputSize; m++) {
      qOut[m] = value + (rawAdv[m] - meanAdv);
    }

    // 2. Output Error (Huber clipped gradient on masked actions)
    const dQ = new Float32Array(this.outputSize);
    let totalLoss = 0;
    let maskedCount = 0;
    for (let m = 0; m < this.outputSize; m++) {
      if (actionMask[m]) {
        const diff = qOut[m] - targetQValues[m];
        const clipped = Math.max(-1.0, Math.min(1.0, diff));
        dQ[m] = clipped;
        totalLoss += Math.abs(diff) <= 1 ? .5*diff*diff : Math.abs(diff)-.5;
        maskedCount++;
      }
    }

    if (maskedCount === 0) return 0;

    // 3. Backprop through Dueling Aggregator
    // dL/dV = sum(dQ)
    let dVal = 0;
    for (let m = 0; m < this.outputSize; m++) {
      if (actionMask[m]) dVal += dQ[m];
    }

    // dL/dA[m] = dQ[m] - (1/N)*sum(dQ)
    const dAdv = new Float32Array(this.outputSize);
    const mean_dQ = dVal / this.outputSize;
    for (let m = 0; m < this.outputSize; m++) {
      dAdv[m] = dQ[m] - mean_dQ;
    }

    // 4. Backprop through Advantage Stream
    const d_z_adv1 = new Float32Array(this.advHiddenSize);
    for (let m = 0; m < this.outputSize; m++) {
      const grad = dAdv[m];
      this.b_adv2[m] -= learningRate * grad;
      const offset = m * this.advHiddenSize;
      for (let a = 0; a < this.advHiddenSize; a++) {
        d_z_adv1[a] += grad * this.w_adv2[offset + a];
        this.w_adv2[offset + a] -= learningRate * grad * z_adv1[a];
      }
    }

    const dH2_adv = new Float32Array(this.sharedSize2);
    for (let a = 0; a < this.advHiddenSize; a++) {
      const grad = d_z_adv1[a] * NeuralNetwork.leakyReluGrad(z_adv1[a]);
      this.b_adv1[a] -= learningRate * grad;
      const offset = a * this.sharedSize2;
      for (let k = 0; k < this.sharedSize2; k++) {
        dH2_adv[k] += grad * this.w_adv1[offset + k];
        this.w_adv1[offset + k] -= learningRate * grad * h2[k];
      }
    }

    // 5. Backprop through Value Stream
    this.b_val2[0] -= learningRate * dVal;
    const d_z_val1 = new Float32Array(this.valHiddenSize);
    for (let v = 0; v < this.valHiddenSize; v++) {
      d_z_val1[v] = dVal * this.w_val2[v];
      this.w_val2[v] -= learningRate * dVal * z_val1[v];
    }

    const dH2_val = new Float32Array(this.sharedSize2);
    for (let v = 0; v < this.valHiddenSize; v++) {
      const grad = d_z_val1[v] * NeuralNetwork.leakyReluGrad(z_val1[v]);
      this.b_val1[v] -= learningRate * grad;
      const offset = v * this.sharedSize2;
      for (let k = 0; k < this.sharedSize2; k++) {
        dH2_val[k] += grad * this.w_val1[offset + k];
        this.w_val1[offset + k] -= learningRate * grad * h2[k];
      }
    }

    // 6. Merge Gradients at Shared Layer 2
    const dH2 = new Float32Array(this.sharedSize2);
    for (let k = 0; k < this.sharedSize2; k++) {
      dH2[k] = dH2_adv[k] + dH2_val[k];
    }

    // 7. Backprop through Shared Layer 2
    const dNorm2 = Float32Array.from(dH2, (g,k) => g * NeuralNetwork.leakyReluGrad(norm2[k]));
    const dZ2 = NeuralNetwork.layerNormBackward(z2, dNorm2);
    const dH1 = new Float32Array(this.sharedSize1);
    for (let k = 0; k < this.sharedSize2; k++) {
      const grad = dZ2[k];
      this.b_shared2[k] -= learningRate * grad;
      const offset = k * this.sharedSize1;
      for (let j = 0; j < this.sharedSize1; j++) {
        dH1[j] += grad * this.w_shared2[offset + j];
        this.w_shared2[offset + j] -= learningRate * grad * h1[j];
      }
    }

    // 8. Backprop through Shared Layer 1
    const dNorm1 = Float32Array.from(dH1, (g,j) => g * NeuralNetwork.leakyReluGrad(norm1[j]));
    const dZ1 = NeuralNetwork.layerNormBackward(z1, dNorm1);
    for (let j = 0; j < this.sharedSize1; j++) {
      const grad = dZ1[j];
      this.b_shared1[j] -= learningRate * grad;
      const offset = j * this.inputSize;
      for (let i = 0; i < this.inputSize; i++) {
        this.w_shared1[offset + i] -= learningRate * grad * input[i];
      }
    }

    return totalLoss;
  }

  /**
   * Clone network parameters
   */
  public clone(): NeuralNetwork {
    const copy = new NeuralNetwork(
      this.inputSize,
      this.sharedSize1,
      this.sharedSize2,
      this.valHiddenSize,
      this.advHiddenSize,
      this.outputSize
    );
    copy.w_shared1.set(this.w_shared1);
    copy.b_shared1.set(this.b_shared1);
    copy.w_shared2.set(this.w_shared2);
    copy.b_shared2.set(this.b_shared2);

    copy.w_val1.set(this.w_val1);
    copy.b_val1.set(this.b_val1);
    copy.w_val2.set(this.w_val2);
    copy.b_val2.set(this.b_val2);

    copy.w_adv1.set(this.w_adv1);
    copy.b_adv1.set(this.b_adv1);
    copy.w_adv2.set(this.w_adv2);
    copy.b_adv2.set(this.b_adv2);
    return copy;
  }

  /**
   * Soft target update: target = tau * source + (1 - tau) * target
   */
  public softUpdateFrom(source: NeuralNetwork, tau: number = 0.05): void {
    const blend = (target: Float32Array, src: Float32Array) => {
      for (let i = 0; i < target.length; i++) {
        target[i] = tau * src[i] + (1 - tau) * target[i];
      }
    };
    blend(this.w_shared1, source.w_shared1);
    blend(this.b_shared1, source.b_shared1);
    blend(this.w_shared2, source.w_shared2);
    blend(this.b_shared2, source.b_shared2);

    blend(this.w_val1, source.w_val1);
    blend(this.b_val1, source.b_val1);
    blend(this.w_val2, source.w_val2);
    blend(this.b_val2, source.b_val2);

    blend(this.w_adv1, source.w_adv1);
    blend(this.b_adv1, source.b_adv1);
    blend(this.w_adv2, source.w_adv2);
    blend(this.b_adv2, source.b_adv2);
  }

  /**
   * Serializes weights to JSON object
   */
  public toJSON(): object {
    return {
      formatVersion: 1,
      architecture: ARCHITECTURE_VERSION,
      featureSchema: FEATURE_SCHEMA_VERSION,
      inputSize: this.inputSize,
      sharedSize1: this.sharedSize1,
      sharedSize2: this.sharedSize2,
      valHiddenSize: this.valHiddenSize,
      advHiddenSize: this.advHiddenSize,
      outputSize: this.outputSize,
      w_shared1: Array.from(this.w_shared1),
      b_shared1: Array.from(this.b_shared1),
      w_shared2: Array.from(this.w_shared2),
      b_shared2: Array.from(this.b_shared2),
      w_val1: Array.from(this.w_val1),
      b_val1: Array.from(this.b_val1),
      w_val2: Array.from(this.w_val2),
      b_val2: Array.from(this.b_val2),
      w_adv1: Array.from(this.w_adv1),
      b_adv1: Array.from(this.b_adv1),
      w_adv2: Array.from(this.w_adv2),
      b_adv2: Array.from(this.b_adv2),
    };
  }

  /**
   * Deserializes weights from JSON object
   */
  public static fromJSON(value: unknown, allowLegacy = false): NeuralNetwork {
    if (!value || typeof value !== 'object') throw new Error('Checkpoint must be an object');
    const data = value as Record<string, unknown>;
    if (!(allowLegacy && data.formatVersion === undefined) &&
        (data.formatVersion !== 1 || data.architecture !== ARCHITECTURE_VERSION || data.featureSchema !== FEATURE_SCHEMA_VERSION)) {
      throw new Error('Unsupported checkpoint architecture or feature schema');
    }
    const dimension = (key: string): number => {
      const n = data[key];
      if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1 || n > 4096) throw new Error(`Invalid dimension ${key}`);
      return n;
    };
    const dims = ['inputSize','sharedSize1','sharedSize2','valHiddenSize','advHiddenSize','outputSize'].map(dimension);
    const [input,h1,h2,v,a,out] = dims;
    const lengths: Record<string, number> = {w_shared1:input*h1,b_shared1:h1,w_shared2:h1*h2,b_shared2:h2,
      w_val1:h2*v,b_val1:v,w_val2:v,b_val2:1,w_adv1:h2*a,b_adv1:a,w_adv2:a*out,b_adv2:out};
    for (const [key, length] of Object.entries(lengths)) {
      const tensor = data[key];
      if (!Array.isArray(tensor) || tensor.length !== length || !tensor.every(x => typeof x === 'number' && Number.isFinite(x) && Number.isFinite(Math.fround(x)))) {
        throw new Error(`Invalid checkpoint tensor ${key}`);
      }
    }
    const net = new NeuralNetwork(input,h1,h2,v,a,out);
    for (const key of Object.keys(lengths)) {
      // Tensor names are validated against the fixed architecture above.
      const target = net[key as keyof NeuralNetwork];
      if (!(target instanceof Float32Array)) throw new Error('Unsupported tensor');
      target.set(data[key] as number[]);
    }
    return net;
  }

  private validateInput(input: Float32Array): void {
    if (input.length !== this.inputSize || !Array.from(input).every(Number.isFinite)) throw new Error('Invalid network input');
  }
}
