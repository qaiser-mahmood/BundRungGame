import { describe, it, expect } from 'vitest';
import { StateVectorizer } from '../server/ai/neural/StateVectorizer';
import { NeuralNetwork } from '../server/ai/neural/NeuralNetwork';
import { ReplayBuffer } from '../server/ai/neural/ReplayBuffer';
import { ReinforcementLearner } from '../server/ai/neural/ReinforcementLearner';
import { BundRungEngine } from '../server/engine/BundRungEngine';
import { Card } from '../shared/types';

describe('Neural AI & Reinforcement Learning Architecture', () => {
  it('maps all 52 cards to unique indices 0..51 and back', () => {
    const seenIndices = new Set<number>();
    const suits = ['SPADES', 'HEARTS', 'CLUBS', 'DIAMONDS'] as const;
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

    for (const suit of suits) {
      for (const rank of ranks) {
        const card: Card = {
          id: `${suit}_${rank}`,
          suit,
          rank,
          playValue: 2,
          tossValue: 2,
        };
        const idx = StateVectorizer.cardToIndex(card);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(52);
        expect(seenIndices.has(idx)).toBe(false);
        seenIndices.add(idx);

        const decoded = StateVectorizer.indexToCard(idx);
        expect(decoded.suit).toBe(suit);
        expect(decoded.rank).toBe(rank);
      }
    }
    expect(seenIndices.size).toBe(52);
  });

  it('correctly vectorizes game state into 183 normalized features', () => {
    const engine = new BundRungEngine();
    engine.addPlayer('p1', 'Alice');
    engine.addPlayer('p2', 'Bob');
    engine.addPlayer('p3', 'Charlie');
    engine.addPlayer('p4', 'David');

    const publicState = engine.getPublicState();
    const privateState = engine.getPrivateState('p1');
    const players = engine.getPlayers();

    const vector = StateVectorizer.vectorize(publicState, privateState, 'p1', players);
    expect(vector.length).toBe(StateVectorizer.FEATURE_COUNT);
    expect(vector.length).toBe(229);

    // All values must be finite and within reasonable bounds
    for (let i = 0; i < vector.length; i++) {
      expect(Number.isFinite(vector[i])).toBe(true);
      expect(vector[i]).toBeGreaterThanOrEqual(0);
      expect(vector[i]).toBeLessThanOrEqual(1);
    }
  });

  it('dueling neural network computes 52 Q-values and masks illegal actions', () => {
    const net = new NeuralNetwork(229);
    const input = new Float32Array(229);
    input[0] = 1.0;
    input[10] = 0.5;

    const qValues = net.forward(input);
    expect(qValues.length).toBe(52);

    // Legal action masking: only actions [3, 7, 12] are legal
    const legalActions = [3, 7, 12];
    const chosenAction = net.selectAction(input, legalActions, 0.0); // 0 epsilon = pure exploitation
    expect(legalActions).toContain(chosenAction);
  });

  it('performs backpropagation step and reduces loss', () => {
    const net = new NeuralNetwork(10, 8, 8, 4);
    const input = new Float32Array([1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
    const targetQ = new Float32Array([2.5, 0, 0, 0]);
    const mask = [true, false, false, false];

    const initialLoss = net.trainStep(input, targetQ, mask, 0.05);
    let finalLoss = initialLoss;

    // Train for 20 steps on this sample
    for (let step = 0; step < 20; step++) {
      finalLoss = net.trainStep(input, targetQ, mask, 0.05);
    }

    expect(finalLoss).toBeLessThan(initialLoss);
  });

  it('replay buffer stores and samples transitions', () => {
    const buffer = new ReplayBuffer(100);
    const state = new Float32Array(10);
    const nextState = new Float32Array(10);

    buffer.push({
      state,
      action: 2,
      reward: 1.0,
      nextState,
      done: false,
      legalActionsNext: [1, 2],
    });

    expect(buffer.size()).toBe(1);
    const sample = buffer.sample(1);
    expect(sample.length).toBe(1);
    expect(sample[0].action).toBe(2);
    expect(sample[0].reward).toBe(1.0);
  });

  it('serializes and deserializes neural weights identically', () => {
    const originalNet = new NeuralNetwork(229);
    const json = originalNet.toJSON();
    const loadedNet = NeuralNetwork.fromJSON(json);

    const testInput = new Float32Array(229);
    for (let i = 0; i < 229; i++) testInput[i] = Math.sin(i);

    const outOriginal = originalNet.forward(testInput);
    const outLoaded = loadedNet.forward(testInput);

    for (let i = 0; i < 52; i++) {
      expect(outOriginal[i]).toBeCloseTo(outLoaded[i], 5);
    }
  });
});
