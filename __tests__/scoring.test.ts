import { describe, it, expect, beforeEach } from 'vitest';
import { ScoringEngine } from '../server/engine/ScoringEngine';
import { TeamId, TrumpMode } from '../shared/types';

describe('Master Scoring Matrix (Section 6.2)', () => {
  let engine: ScoringEngine;

  beforeEach(() => {
    engine = new ScoringEngine();
  });

  // 1. Close Trump tests
  it('Close Trump: Color by Other Team, Dealer Team Wins => -26 pts', () => {
    const adj = ScoringEngine.calculateAdjustment('CLOSE_TRUMP', 'STANDARD', 'TEAM_2', 'TEAM_1', 'TEAM_1');
    expect(adj).toBe(-26);
  });

  it('Close Trump: Color by Other Team, Other Team Wins => +13 pts', () => {
    const adj = ScoringEngine.calculateAdjustment('CLOSE_TRUMP', 'STANDARD', 'TEAM_2', 'TEAM_1', 'TEAM_2');
    expect(adj).toBe(13);
  });

  it('Close Trump: Color by Dealer Team, Dealer Team Wins => -13 pts', () => {
    const adj = ScoringEngine.calculateAdjustment('CLOSE_TRUMP', 'STANDARD', 'TEAM_1', 'TEAM_1', 'TEAM_1');
    expect(adj).toBe(-13);
  });

  it('Close Trump: Color by Dealer Team, Other Team Wins => +26 pts', () => {
    const adj = ScoringEngine.calculateAdjustment('CLOSE_TRUMP', 'STANDARD', 'TEAM_1', 'TEAM_1', 'TEAM_2');
    expect(adj).toBe(26);
  });

  // 2. Open Trump tests
  it('Open Trump Face Up: Color by Other, Dealer Wins => -52; Other Wins => +26', () => {
    expect(ScoringEngine.calculateAdjustment('OPEN_TRUMP', 'FACE_UP', 'TEAM_2', 'TEAM_1', 'TEAM_1')).toBe(-52);
    expect(ScoringEngine.calculateAdjustment('OPEN_TRUMP', 'FACE_UP', 'TEAM_2', 'TEAM_1', 'TEAM_2')).toBe(26);
  });

  it('Open Trump Face Up: Color by Dealer, Dealer Wins => -26; Other Wins => +52', () => {
    expect(ScoringEngine.calculateAdjustment('OPEN_TRUMP', 'FACE_UP', 'TEAM_1', 'TEAM_1', 'TEAM_1')).toBe(-26);
    expect(ScoringEngine.calculateAdjustment('OPEN_TRUMP', 'FACE_UP', 'TEAM_1', 'TEAM_1', 'TEAM_2')).toBe(52);
  });

  it('Open Trump Face Down (No Play): Other => +26; Dealer => -26', () => {
    expect(ScoringEngine.calculateAdjustment('OPEN_TRUMP', 'FACE_DOWN_NO_PLAY', 'TEAM_2', 'TEAM_1', 'TEAM_2')).toBe(26);
    expect(ScoringEngine.calculateAdjustment('OPEN_TRUMP', 'FACE_DOWN_NO_PLAY', 'TEAM_1', 'TEAM_1', 'TEAM_1')).toBe(-26);
  });

  it('Open Trump Face Down (Play): Other Team Color => Dealer Wins -104, Other Wins +52', () => {
    expect(ScoringEngine.calculateAdjustment('OPEN_TRUMP', 'FACE_DOWN_PLAY', 'TEAM_2', 'TEAM_1', 'TEAM_1')).toBe(-104);
    expect(ScoringEngine.calculateAdjustment('OPEN_TRUMP', 'FACE_DOWN_PLAY', 'TEAM_2', 'TEAM_1', 'TEAM_2')).toBe(52);
  });

  it('Open Trump Face Down (Play): Dealer Team Color => Dealer Wins -52, Other Wins +104', () => {
    expect(ScoringEngine.calculateAdjustment('OPEN_TRUMP', 'FACE_DOWN_PLAY', 'TEAM_1', 'TEAM_1', 'TEAM_1')).toBe(-52);
    expect(ScoringEngine.calculateAdjustment('OPEN_TRUMP', 'FACE_DOWN_PLAY', 'TEAM_1', 'TEAM_1', 'TEAM_2')).toBe(104);
  });

  // 3. Bwinji tests
  it('Bwinji Face Up: Other Team Color => Dealer Wins -104, Other Wins +52', () => {
    expect(ScoringEngine.calculateAdjustment('BWINJI', 'FACE_UP', 'TEAM_2', 'TEAM_1', 'TEAM_1')).toBe(-104);
    expect(ScoringEngine.calculateAdjustment('BWINJI', 'FACE_UP', 'TEAM_2', 'TEAM_1', 'TEAM_2')).toBe(52);
  });

  it('Bwinji Face Up: Dealer Team Color => Dealer Wins -52, Other Wins +104', () => {
    expect(ScoringEngine.calculateAdjustment('BWINJI', 'FACE_UP', 'TEAM_1', 'TEAM_1', 'TEAM_1')).toBe(-52);
    expect(ScoringEngine.calculateAdjustment('BWINJI', 'FACE_UP', 'TEAM_1', 'TEAM_1', 'TEAM_2')).toBe(104);
  });

  it('Bwinji Face Down (No Play): Other => +52, Dealer => -52', () => {
    expect(ScoringEngine.calculateAdjustment('BWINJI', 'FACE_DOWN_NO_PLAY', 'TEAM_2', 'TEAM_1', 'TEAM_2')).toBe(52);
    expect(ScoringEngine.calculateAdjustment('BWINJI', 'FACE_DOWN_NO_PLAY', 'TEAM_1', 'TEAM_1', 'TEAM_1')).toBe(-52);
  });

  it('Bwinji Face Down (Play): Other Team Color => Dealer Wins -208, Other Wins +104', () => {
    expect(ScoringEngine.calculateAdjustment('BWINJI', 'FACE_DOWN_PLAY', 'TEAM_2', 'TEAM_1', 'TEAM_1')).toBe(-208);
    expect(ScoringEngine.calculateAdjustment('BWINJI', 'FACE_DOWN_PLAY', 'TEAM_2', 'TEAM_1', 'TEAM_2')).toBe(104);
  });

  it('Bwinji Face Down (Play): Dealer Team Color => Dealer Wins -104, Other Wins +208', () => {
    expect(ScoringEngine.calculateAdjustment('BWINJI', 'FACE_DOWN_PLAY', 'TEAM_1', 'TEAM_1', 'TEAM_1')).toBe(-104);
    expect(ScoringEngine.calculateAdjustment('BWINJI', 'FACE_DOWN_PLAY', 'TEAM_1', 'TEAM_1', 'TEAM_2')).toBe(208);
  });
});

describe('Scorecard Dealership Transfer and KHOTI (Sections 6.1 & 7)', () => {
  it('transfers dealership when score falls below 0 and new dealer inherits absolute positive points', () => {
    const engine = new ScoringEngine();
    // Starting score is 0
    expect(engine.getState().dealerScore).toBe(0);

    // Dealer Team 1 wins Close Trump (Color by other team: -26) => 0 - 26 = -26
    const res = engine.applyGameResult({
      gameIndex: 1,
      dealerPlayerId: 'p1',
      dealerTeam: 'TEAM_1',
      trumpMode: 'CLOSE_TRUMP',
      colorChosenByTeam: 'TEAM_2',
      colorChosenByPlayerId: 'p2',
      winningTeam: 'TEAM_1',
    });

    expect(res.dealerTransferred).toBe(true);
    expect(res.inheritedPositiveScore).toBe(26);
    expect(res.newDealerScore).toBe(26);
    expect(engine.getState().dealerScore).toBe(26);
  });

  it('declares KHOTI when cumulative score reaches or exceeds 100 points (Dealer Team loses)', () => {
    const engine = new ScoringEngine();

    // Game 1: Other team wins Bwinji (+104 points) => Score reaches 104
    const res = engine.applyGameResult({
      gameIndex: 1,
      dealerPlayerId: 'p1',
      dealerTeam: 'TEAM_1',
      trumpMode: 'BWINJI',
      modifier: 'FACE_UP',
      colorChosenByTeam: 'TEAM_1',
      colorChosenByPlayerId: 'p1',
      winningTeam: 'TEAM_2',
    });

    expect(res.scoreAdjustment).toBe(104);
    expect(res.newDealerScore).toBe(104);
    expect(res.isKhoti).toBe(true);
    expect(res.losingTeam).toBe('TEAM_1'); // Dealer team is KHOTI!
    expect(res.winningTeam).toBe('TEAM_2');
  });

  it('declares KHOTI when score drops below or equal to -100 points (Opponent Team loses)', () => {
    const engine = new ScoringEngine();

    // Game 1: Dealer team wins Bwinji against opponent color (-104 points) => Score reaches -104
    const res = engine.applyGameResult({
      gameIndex: 1,
      dealerPlayerId: 'p1',
      dealerTeam: 'TEAM_1',
      trumpMode: 'BWINJI',
      modifier: 'FACE_UP',
      colorChosenByTeam: 'TEAM_2',
      colorChosenByPlayerId: 'p2',
      winningTeam: 'TEAM_1',
    });

    expect(res.scoreAdjustment).toBe(-104);
    expect(res.newDealerScore).toBe(-104);
    expect(res.isKhoti).toBe(true);
    expect(res.losingTeam).toBe('TEAM_2'); // Opponent team is KHOTI!
    expect(res.winningTeam).toBe('TEAM_1');
  });

  it('transfers dealership without KHOTI when score is between 0 and -100 (e.g. -52)', () => {
    const engine = new ScoringEngine();

    // Game 1: Dealer team wins Open Rung Face Up (-26 points) => Score reaches -26
    const res = engine.applyGameResult({
      gameIndex: 1,
      dealerPlayerId: 'p1',
      dealerTeam: 'TEAM_1',
      trumpMode: 'OPEN_TRUMP',
      modifier: 'FACE_UP',
      colorChosenByTeam: 'TEAM_1',
      colorChosenByPlayerId: 'p1',
      winningTeam: 'TEAM_1',
    });

    expect(res.scoreAdjustment).toBe(-26);
    expect(res.newDealerScore).toBe(26); // Absolute value inherited
    expect(res.isKhoti).toBe(false); // No KHOTI
    expect(res.dealerTransferred).toBe(true);
    expect(res.inheritedPositiveScore).toBe(26);
  });
});
