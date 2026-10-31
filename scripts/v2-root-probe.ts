import {writeFileSync} from 'node:fs';
import {setupGame,seededRandom} from './ai-benchmark';
import {advanceForced} from '../server/ai/planning/MonteCarloPlanner';
import {ismcts} from '../server/ai/v2/search/ISMCTS';
const records=[];
for(let seed=2;seed<10;seed++){
 const e=setupGame(seed);while(advanceForced(e)){}
 const s=e.getPublicState(),p=e.getPrivateState(s.currentTurnPlayerId!),cards=e.getLegalCardsForPlayer(p.myPlayerId);
 if(cards.length>1)records.push({seed,actor:p.myPlayerId,diagnostic:ismcts(s,p,cards,{timeMs:Infinity,random:seededRandom(seed)})});
}
writeFileSync('/tmp/v2-root-probe.json',JSON.stringify({schemaVersion:1,records},null,2)+'\n',{flag:'wx'});
