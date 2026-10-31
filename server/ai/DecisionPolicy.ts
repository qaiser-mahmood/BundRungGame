import type {Card,Player,PrivatePlayerState,PublicGameState} from '../../shared/types';
import {MonteCarloPlanner,SearchOptions,searchStats} from './planning/MonteCarloPlanner';
import {LegacyMonteCarloPlanner} from './planning/LegacyMonteCarloPlanner';
import {ModelManager} from './neural/ModelManager';
import {StateVectorizer} from './neural/StateVectorizer';
import type {NeuralNetwork} from './neural/NeuralNetwork';
export type PolicyName='heuristic'|'production-legacy'|'corrected-search'|'neural-direct';
export interface DecisionPolicy {name:PolicyName;search?:SearchOptions;network?:NeuralNetwork;}
export const defaultPolicy:DecisionPolicy={name:'corrected-search'};
export function selectCandidate(cards:Card[],state:PublicGameState,priv:PrivatePlayerState,id:string,players:Player[],
  policy:DecisionPolicy=defaultPolicy):Card {
  if(!cards.length)throw new Error('NO_LEGAL_CANDIDATES');
  if(cards.length===1||policy.name==='heuristic')return cards[0];
  try{
    if(policy.name==='corrected-search')return MonteCarloPlanner.evaluateCandidates(cards,id,priv.myHand,state,priv.secretTrumpSuit,
      policy.search?.iterations??16,priv,policy.search);
    if(policy.name==='production-legacy'){
      return LegacyMonteCarloPlanner.evaluateCandidates(cards,id,priv.myHand,state,priv.secretTrumpSuit,policy.search?.legacyIterations??100);
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
    console.error(JSON.stringify({component:'policy',policy:policy.name,reason:error instanceof Error?error.message:'POLICY_FAILURE'}));
    return cards[0];
  }
}
