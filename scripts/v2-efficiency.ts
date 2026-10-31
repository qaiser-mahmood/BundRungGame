import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {setupGame,seededRandom} from './ai-benchmark';
import {advanceForced} from '../server/ai/planning/MonteCarloPlanner';
import {ismcts} from '../server/ai/v2/search/ISMCTS';
const results=[];
for(let pass=0;pass<3;pass++)for(let seed=2;seed<22;seed++){
 const engine=setupGame(seed);while(advanceForced(engine)){}
 const state=engine.getPublicState(),priv=engine.getPrivateState(state.currentTurnPlayerId!),cards=engine.getLegalCardsForPlayer(priv.myPlayerId);
 const modes=pass%2?[true,false]:[false,true],runs=[];
 for(const optimized of modes){const started=performance.now(),r=ismcts(state,priv,cards,{iterations:64,timeMs:Infinity,random:seededRandom(seed),reuseTemplates:optimized,lightRollouts:optimized});
  runs.push({optimized,ms:performance.now()-started,root:r.root,nodes:r.nodes,efficiency:r.efficiency,completed:r.completed});}
 if(JSON.stringify(runs[0].root)!==JSON.stringify(runs[1].root)||runs[0].nodes!==runs[1].nodes)throw new Error('EFFICIENCY_CHANGED_SEARCH');
 results.push({pass,seed,runs});
}
writeFileSync(process.argv[2]??'/tmp/v2-efficiency-refinement.json',JSON.stringify({schemaVersion:1,method:'Three passes, alternating order, identical seeds/work; root statistics and node counts must match exactly',results},null,2)+'\n',{flag:'wx'});
