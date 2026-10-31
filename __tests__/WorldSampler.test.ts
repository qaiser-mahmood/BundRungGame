import {describe,it,expect} from 'vitest';
import {BundRungEngine} from '../server/engine/BundRungEngine';
import {sampleWorld} from '../server/ai/planning/WorldSampler';
import {ALL_52_CARDS} from '../server/ai/planning/CardTracker';
import {setupGame,seededRandom} from '../scripts/ai-benchmark';
import type {Suit} from '../shared/types';
describe('constraint-preserving matching sampler',()=>{
  it('preserves ownership, voids, exact counts and unique cards across 200 seeds',()=>{
    const engine=new BundRungEngine();for(let i=0;i<4;i++)engine.addPlayer(`p${i}`,`P${i}`);
    const state=engine.getPublicState();state.players.forEach(p=>p.cardsInHandCount=13);
    const hand=ALL_52_CARDS.filter(c=>c.suit==='HEARTS'),known=ALL_52_CARDS.find(c=>c.id==='S_A')!;
    state.revealedHands={p2:[known]};const voids=new Map<string,Set<Suit>>([['p1',new Set(['SPADES'])]]);
    for(let seed=0;seed<200;seed++){
      const world=sampleWorld(state,'p0',hand,voids,undefined,seededRandom(seed));
      expect([...world.values()].every(h=>h.length===13)).toBe(true);
      expect(new Set([...world.values()].flat().map(c=>c.id)).size).toBe(52);
      expect(world.get('p1')!.every(c=>c.suit!=='SPADES')).toBe(true);
      expect(world.get('p2')).toContain(known);expect(world.get('p0')).toEqual(hand);
    }
    const impossible=new Map<string,Set<Suit>>([['p1',new Set(['HEARTS','DIAMONDS','CLUBS','SPADES'])]]);
    expect(()=>sampleWorld(state,'p0',hand,impossible)).toThrow('INFEASIBLE_VOIDS');
    expect(()=>sampleWorld({...state,players:state.players.map(p=>({...p,cardsInHandCount:0}))},'p0',hand,voids)).toThrow();
  });
});

describe('locked slot ownership',()=>{
  it('never uses a publicly shown ordinary hand card as an unknown locked trump',()=>{
    const engine=setupGame(2),state=engine.getPublicState(),caller=state.trumpCallerPlayerId!;
    const shown=engine.getPrivateState(caller).myHand;
    state.revealedHands[caller]=shown;
    const actor=state.players.find(p=>p.id!==caller)!.id,priv=engine.getPrivateState(actor);
    for(let seed=0;seed<30;seed++){
      const world=sampleWorld(state,actor,priv.myHand,new Map(),priv,seededRandom(seed));
      expect(world.lockedTrump).not.toBeNull();expect(shown.some(c=>c.id===world.lockedTrump!.id)).toBe(false);
    }
  });
});
