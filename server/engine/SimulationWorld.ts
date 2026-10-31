import type {Card,Suit} from '../../shared/types';
export class SimulationWorld extends Map<string,Card[]> {
  concealed = new Map<string,Card>();
  lockedTrump: Card | null = null;
  trumpSuit: Suit | null = null;
}
