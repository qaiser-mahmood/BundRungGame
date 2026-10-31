import type {Card,PrivatePlayerState,PublicGameState,Suit} from '../../../shared/types';
import {CardTracker} from './CardTracker';
import {sampleWorld} from './WorldSampler';
import type {SimulationWorld} from '../../engine/SimulationWorld';

/** Decision-local posterior samples. Hard constraints belong to WorldSampler;
 * empirical frequencies are estimates under its non-uniform matching prior. */
export class OpponentBeliefs {
  private particles:SimulationWorld[]=[];
  private eligibleCache=new Map<string,Card[]>();
  readonly voids:Map<string,Set<Suit>>;
  constructor(readonly state:PublicGameState,readonly privateState:PrivatePlayerState) {
    this.voids=CardTracker.getVoidMatrix(state);
  }
  sample(random:()=>number=Math.random):SimulationWorld {
    const world=sampleWorld(this.state,this.privateState.myPlayerId,this.privateState.myHand,this.voids,this.privateState,random);
    if(this.particles.length<64)this.particles.push(world);
    return world;
  }
  get sampleCount():number{return this.particles.length;}
  knownHand(id:string):Card[]|null {
    if(id===this.privateState.myPlayerId)return [...this.privateState.myHand,...(this.privateState.myTrumpCard?[this.privateState.myTrumpCard]:[])];
    const partner=this.state.players.find(p=>p.id!==this.privateState.myPlayerId&&p.team===this.state.players.find(x=>x.id===this.privateState.myPlayerId)?.team);
    if(partner?.id===id&&this.privateState.partnerHand)return this.privateState.partnerHand;
    const shown=this.state.revealedHands[id];
    const locked=id===this.state.trumpCallerPlayerId?this.state.revealedTrumpCard:null;
    const cards=[...(shown??[]),...(locked&&!shown?.some(c=>c.id===locked.id)?[locked]:[])];
    return cards.length===this.state.players.find(p=>p.id===id)?.cardsInHandCount?cards:null;
  }
  /** Probability of at least one matching held card. Analytic fallback is a
   * marginal approximation, never a new ownership or void constraint. */
  probability(id:string,predicate:(card:Card)=>boolean):number {
    const known=this.knownHand(id);if(known)return Number(known.some(predicate));
    if(this.particles.length)return this.particles.filter(w=>w.get(id)?.some(predicate)).length/this.particles.length;
    let eligible=this.eligibleCache.get(id);
    if(!eligible){eligible=CardTracker.getUnseenCards(this.state,[...this.privateState.myHand,...(this.privateState.myTrumpCard?[this.privateState.myTrumpCard]:[])])
      .filter(c=>!this.voids.get(id)?.has(c.suit)&&!this.state.players.some(p=>p.id!==id&&this.knownHand(p.id)?.some(k=>k.id===c.id)));
      this.eligibleCache.set(id,eligible);
    }
    const count=this.state.players.find(p=>p.id===id)?.cardsInHandCount??0;
    const hits=eligible.filter(predicate).length;
    let miss=1;for(let i=0;i<Math.min(count,eligible.length);i++)miss*=Math.max(0,eligible.length-hits-i)/(eligible.length-i);
    return 1-miss;
  }
  voidProbability(id:string,suit:Suit):number{return 1-this.probability(id,c=>c.suit===suit);}
  higherCardProbability(id:string,card:Card):number{return this.probability(id,c=>c.suit===card.suit&&c.playValue>card.playValue);}
  expectedSuitCount(id:string,suit:Suit):number {
    const known=this.knownHand(id);if(known)return known.filter(c=>c.suit===suit).length;
    if(this.voids.get(id)?.has(suit))return 0;
    if(this.particles.length)return this.particles.reduce((n,w)=>n+(w.get(id)?.filter(c=>c.suit===suit).length??0),0)/this.particles.length;
    // No calibrated count estimate before particles; callers can explicitly
    // distinguish missing estimation from a proven zero.
    return NaN;
  }
  trumpProbability(suit:Suit):number {
    if(this.state.isTrumpRevealed)return Number(this.state.trumpSuit===suit);
    if(this.privateState.secretTrumpSuit)return Number(this.privateState.secretTrumpSuit===suit);
    return this.particles.length?this.particles.filter(w=>w.trumpSuit===suit).length/this.particles.length:0.25;
  }
}
