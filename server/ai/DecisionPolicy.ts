import {decideV2} from './v2/strategy/DecisionController';
import type {V2Options} from './v2/search/ISMCTS';
import {advancedSearch} from './planning/AdvancedSearch';
import type {StrategyOptions} from './planning/PartnershipStrategy';
import type {Card,Player,PrivatePlayerState,PublicGameState} from '../../shared/types';
import {MonteCarloPlanner,SearchOptions,searchStats} from './planning/MonteCarloPlanner';
import {LegacyMonteCarloPlanner} from './planning/LegacyMonteCarloPlanner';
import {ModelManager} from './neural/ModelManager';
import {StateVectorizer} from './neural/StateVectorizer';
import type {NeuralNetwork} from './neural/NeuralNetwork';
export type PolicyName='heuristic'|'production-legacy'|'corrected-search'|'neural-direct'|'advanced-search'|'ai-v2-ismcts';
export interface DecisionPolicy {name:PolicyName;search?:SearchOptions;network?:NeuralNetwork;strategy?:StrategyOptions;v2?:V2Options;}
export const defaultPolicy:DecisionPolicy={name:'corrected-search'};
export function selectCandidate(cards:Card[],state:PublicGameState,priv:PrivatePlayerState,id:string,players:Player[],
  policy:DecisionPolicy=defaultPolicy):Card {
  if(!cards.length)throw new Error('NO_LEGAL_CANDIDATES');
  if(cards.length===1||policy.name==='heuristic')return cards[0];
  try{
    if(policy.name==='ai-v2-ismcts')return decideV2(state,priv,cards,policy.search,policy.v2);
    if(policy.name==='advanced-search')return advancedSearch(state,priv,cards,policy.search,policy.strategy);
    if(policy.name==='corrected-search')return MonteCarloPlanner.evaluateCandidates(cards,id,priv.myHand,state,priv.secretTrumpSuit,
      policy.search?.iterations??16,priv,policy.search);
    if(policy.name==='production-legacy'){
      const iterations=policy.search?.legacyIterations??100;
      if(!Number.isSafeInteger(iterations)||iterations<1||iterations>1000)throw new Error('INVALID_LEGACY_BUDGET');
      return LegacyMonteCarloPlanner.evaluateCandidates(cards,id,priv.myHand,state,priv.secretTrumpSuit,iterations);
    }
    const network=policy.network??ModelManager.getModel();
    if(!network)throw new Error('NO_VALIDATED_NETWORK');
    const action=network.selectAction(StateVectorizer.vectorize(state,priv,id,players),cards.map(StateVectorizer.cardToIndex),0);
    searchStats.neuralUses++;
    const card=cards.find(c=>StateVectorizer.cardToIndex(c)===action);
    if(!card)throw new Error('ILLEGAL_NEURAL_ACTION');
    return card;
  }catch(error){
    searchStats.fallbacks++;
    console.error(JSON.stringify({component:'policy',policy:policy.name,reason:error instanceof Error && /^[A-Z_]+$/.test(error.message)?error.message:'POLICY_FAILURE'}));
    return cards[0];
  }
}
