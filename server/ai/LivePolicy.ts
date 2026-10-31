import type {DecisionPolicy,PolicyName} from './DecisionPolicy';
/** Server-local opt-in, never controlled by an unauthenticated socket payload. */
export function livePolicyFromEnvironment(value:string|undefined):DecisionPolicy {
  const name=value??'corrected-search';
  if(!['corrected-search','advanced-search','heuristic','production-legacy','neural-direct'].includes(name))throw new Error('INVALID_BOT_DECISION_POLICY');
  return {name:name as PolicyName};
}
