import { describe, it, expect } from 'vitest';
import { Card, Suit, Rank } from '../shared/types';
import {
  DynamicSuitEvaluator,
  BASE_RANK_WEIGHTS,
} from '../server/ai/planning/DynamicSuitEvaluator';

function makeCard(suit: Suit, rank: Rank): Card {
  const playValueMap: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    J: 11, Q: 12, K: 13, A: 14,
  };
  return {
    id: `${suit[0]}_${rank}`,
    suit,
    rank,
    playValue: playValueMap[rank],
    tossValue: rank === 'A' ? 1 : playValueMap[rank],
  };
}

describe('DynamicSuitEvaluator', () => {
  it('assigns 13 distinct base rank weights where Ace is maximum and 2 is minimum', () => {
    expect(BASE_RANK_WEIGHTS['A']).toBe(13);
    expect(BASE_RANK_WEIGHTS['K']).toBe(12);
    expect(BASE_RANK_WEIGHTS['Q']).toBe(11);
    expect(BASE_RANK_WEIGHTS['2']).toBe(1);
    expect(BASE_RANK_WEIGHTS['A']).toBeGreaterThan(BASE_RANK_WEIGHTS['K']);
    expect(BASE_RANK_WEIGHTS['3']).toBeGreaterThan(BASE_RANK_WEIGHTS['2']);
  });

  it('dynamically elevates a King to effective Ace (weight 13) when the Ace is already played', () => {
    const kingOfHearts = makeCard('HEARTS', 'K');
    const aceOfHearts = makeCard('HEARTS', 'A');

    // Scenario A: Ace of Hearts is unplayed
    const weightBefore = DynamicSuitEvaluator.calculateDynamicCardWeight(
      kingOfHearts,
      [],
      [kingOfHearts]
    );
    expect(weightBefore).toBeCloseTo(12.0, 1);

    // Scenario B: Ace of Hearts is played
    const weightAfter = DynamicSuitEvaluator.calculateDynamicCardWeight(
      kingOfHearts,
      [aceOfHearts],
      [kingOfHearts]
    );
    // King is now boss (effective rank 13) with exhaustion factor (1 + 1/26)
    expect(weightAfter).toBeGreaterThanOrEqual(13.0);
  });

  it('calculates hand strength and awards void tactical bonus when a suit has 0 cards', () => {
    const handWithVoid = [
      makeCard('SPADES', 'A'),
      makeCard('SPADES', 'K'),
      makeCard('CLUBS', '10'),
    ]; // HEARTS and DIAMONDS are void

    const analysis = DynamicSuitEvaluator.calculateHandStrength(handWithVoid, []);
    expect(analysis.voidCount).toBe(2);
    expect(analysis.suitProfiles.HEARTS.isVoid).toBe(true);
    expect(analysis.suitProfiles.DIAMONDS.isVoid).toBe(true);
    expect(analysis.totalStrength).toBeGreaterThan(
      2 * DynamicSuitEvaluator.VOID_TACTICAL_VALUE
    );
  });

  it('mathematically selects weak singleton card to shed and gain void strength (no if/else)', () => {
    const strongSpadeAce = makeCard('SPADES', 'A');
    const strongSpadeKing = makeCard('SPADES', 'K');
    const weakHeartTwo = makeCard('HEARTS', '2'); // Weak singleton
    const diamondTen = makeCard('DIAMONDS', '10');
    const diamondNine = makeCard('DIAMONDS', '9');

    const hand = [strongSpadeAce, strongSpadeKing, weakHeartTwo, diamondTen, diamondNine];
    const candidates = [strongSpadeKing, weakHeartTwo, diamondNine];

    // Evaluate utility of shedding each card
    const utilities = DynamicSuitEvaluator.evaluateDiscardUtilities(candidates, hand, []);

    // Shedding H_2 creates a void in Hearts (+15 void bonus) and sheds only ~1 card weight
    // whereas shedding D_9 or S_K loses significant card weight and does not create a void
    const bestCard = DynamicSuitEvaluator.pickBestCardToShed(candidates, hand, []);
    expect(bestCard.id).toBe('H_2');
    expect(utilities.get('H_2')!).toBeGreaterThan(utilities.get('D_9')!);
    expect(utilities.get('H_2')!).toBeGreaterThan(utilities.get('S_K')!);
  });

  it('avoids shedding protective guard cards that would leave an unpromoted King unguarded', () => {
    // Hand has King + 3 of Diamonds (King is unpromoted because Diamond Ace is unplayed)
    // and a singleton 4 of Clubs
    const diamondKing = makeCard('DIAMONDS', 'K');
    const diamondThree = makeCard('DIAMONDS', '3'); // Guards the King
    const clubFour = makeCard('CLUBS', '4'); // Weak singleton

    const hand = [diamondKing, diamondThree, clubFour];
    const candidates = [diamondThree, clubFour];

    const bestCard = DynamicSuitEvaluator.pickBestCardToShed(candidates, hand, []);
    // AI should prefer shedding clubFour to create a Club void and keep diamondThree as guard
    expect(bestCard.id).toBe('C_4');
  });

  it('generates valid softmax probability distribution across candidate cards', () => {
    const c1 = makeCard('SPADES', '2');
    const c2 = makeCard('HEARTS', 'A');
    const candidates = [c1, c2];
    const hand = [c1, c2];

    const probs = DynamicSuitEvaluator.computeSoftmaxProbabilities(candidates, hand, []);
    const p1 = probs.get(c1.id)!;
    const p2 = probs.get(c2.id)!;

    expect(p1).toBeGreaterThan(p2); // c1 (low card) has higher discard probability than c2 (Ace)
    expect(p1 + p2).toBeCloseTo(1.0, 5);
  });

  describe('evaluateBidding', () => {
    it('passes when holding weak, scattered cards without a strong suit (not last bidder)', () => {
      // Weak hand: 2, 4, 7 of Hearts, 3 of Diamonds, 8 of Clubs
      const weakHand = [
        makeCard('HEARTS', '2'),
        makeCard('HEARTS', '4'),
        makeCard('HEARTS', '7'),
        makeCard('DIAMONDS', '3'),
        makeCard('CLUBS', '8'),
      ];

      const decision = DynamicSuitEvaluator.evaluateBidding(weakHand, false, false);
      expect(decision.action).toBe('PASS');
      expect(decision.suitScore).toBeLessThan(48.0);
    });

    it('passes with K, J, 9 of a suit because 3 cards without the Ace is not enough strength unless forced', () => {
      // 3 cards without Ace: K, J, 9 of Spades, 4 of Hearts, 2 of Clubs
      const kj9Hand = [
        makeCard('SPADES', 'K'),
        makeCard('SPADES', 'J'),
        makeCard('SPADES', '9'),
        makeCard('HEARTS', '4'),
        makeCard('CLUBS', '2'),
      ];

      // Voluntary: must PASS because 3 cards without Ace lacks master control
      const voluntaryDecision = DynamicSuitEvaluator.evaluateBidding(kj9Hand, false, false);
      expect(voluntaryDecision.action).toBe('PASS');
      expect(voluntaryDecision.suitScore).toBeLessThan(50.0);

      // Forced (isLastBidder === true): MUST pick a suit per game rules
      const forcedDecision = DynamicSuitEvaluator.evaluateBidding(kj9Hand, true, false);
      expect(forcedDecision.action).toBe('SELECT_CARD_TRUMP');
      expect(forcedDecision.bestSuit).toBe('SPADES');
      expect(forcedDecision.isForcedByRules).toBe(true);
      // Since no Ace is held, the highest card (King) is preserved face down
      expect(forcedDecision.chosenCard.rank).toBe('K');
    });

    it('declares SELECT_CARD_TRUMP when holding a strong suit with honors and places Ace face-down', () => {
      // Strong hand: A, K, 6 of Spades, 10 of Diamonds, 2 of Clubs
      const strongHand = [
        makeCard('SPADES', 'A'),
        makeCard('SPADES', 'K'),
        makeCard('SPADES', '6'),
        makeCard('DIAMONDS', '10'),
        makeCard('CLUBS', '2'),
      ];

      const decision = DynamicSuitEvaluator.evaluateBidding(strongHand, false, false);
      expect(decision.action).toBe('SELECT_CARD_TRUMP');
      expect(decision.bestSuit).toBe('SPADES');
      expect(decision.suitScore).toBeGreaterThanOrEqual(50.0);
      // Preserves Ace face-down so it cannot be forced into play before Rung is revealed!
      expect(decision.chosenCard.rank).toBe('A');
    });

    it('forces SELECT_CARD_TRUMP even with weak cards if isLastBidder is true by game rules', () => {
      // Weak hand: J, 6, 2 of Spades, 5 of Hearts, 3 of Clubs
      const weakHand = [
        makeCard('SPADES', 'J'),
        makeCard('SPADES', '6'),
        makeCard('SPADES', '2'),
        makeCard('HEARTS', '5'),
        makeCard('CLUBS', '3'),
      ];

      // As non-last bidder: should PASS
      const voluntaryDecision = DynamicSuitEvaluator.evaluateBidding(weakHand, false, false);
      expect(voluntaryDecision.action).toBe('PASS');

      // As 4th bidder (isLastBidder === true): MUST pick a suit per game rules
      const forcedDecision = DynamicSuitEvaluator.evaluateBidding(weakHand, true, false);
      expect(forcedDecision.action).toBe('SELECT_CARD_TRUMP');
      expect(forcedDecision.bestSuit).toBe('SPADES');
      expect(forcedDecision.isForcedByRules).toBe(true);
    });

    it('declares BWINJI when holding an overwhelmingly dominant suit (e.g. 5 of a suit or 4 high honors)', () => {
      const bwinjiHand = [
        makeCard('SPADES', 'A'),
        makeCard('SPADES', 'K'),
        makeCard('SPADES', 'Q'),
        makeCard('SPADES', 'J'),
        makeCard('SPADES', '10'),
      ];

      const decision = DynamicSuitEvaluator.evaluateBidding(bwinjiHand, false, false);
      expect(decision.action).toBe('BWINJI');
      expect(decision.bestSuit).toBe('SPADES');
      expect(decision.chosenCard.rank).toBe('A');
    });
  });
});
