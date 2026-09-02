export interface Transition {
  state: Float32Array;
  action: number;
  reward: number;
  nextState: Float32Array;
  done: boolean;
  legalActionsNext: number[];
}

export class ReplayBuffer {
  private buffer: Transition[];
  private maxSize: number;
  private pointer: number = 0;

  constructor(maxSize: number = 20000) {
    this.maxSize = maxSize;
    this.buffer = [];
  }

  public push(transition: Transition): void {
    if (this.buffer.length < this.maxSize) {
      this.buffer.push(transition);
    } else {
      this.buffer[this.pointer] = transition;
    }
    this.pointer = (this.pointer + 1) % this.maxSize;
  }

  public size(): number {
    return this.buffer.length;
  }

  public sample(batchSize: number): Transition[] {
    const samples: Transition[] = [];
    const len = this.buffer.length;
    if (len === 0) return samples;

    const count = Math.min(batchSize, len);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * len);
      samples.push(this.buffer[idx]);
    }
    return samples;
  }
}
