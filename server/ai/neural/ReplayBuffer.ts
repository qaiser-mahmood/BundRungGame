export interface Transition {
  roomId?: string;
  episodeId?: string;
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
    if(!Number.isSafeInteger(maxSize)||maxSize<1)throw new Error('Invalid replay capacity');
    this.maxSize = maxSize;
    this.buffer = [];
  }

  public push(transition: Transition): void {
    transition = { ...transition, state: new Float32Array(transition.state),
      nextState: new Float32Array(transition.nextState), legalActionsNext: [...transition.legalActionsNext] };
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
    if(!Number.isSafeInteger(batchSize)||batchSize<0)throw new Error('Invalid replay sample size');
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
