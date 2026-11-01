import type {DecisionObservation} from '../data/Observation';
import type {EvaluationBundle} from './Prepare';
export function publicControl(o:DecisionObservation):'unknown-or-leading'|'partner'|'self'|'opponent'{
 const plays=o.history.filter(p=>p.trick===o.currentTrick);if(!plays.length||plays.some(p=>p.card===null))return 'unknown-or-leading';
 let winner:number|null=null,power=-1;for(const p of plays){const suit=Math.floor(p.card!/13),value=p.aceDown?2:p.card!%13+2;if(suit!==o.currentLead&&!(o.trumpRevealed&&suit===o.publicTrump))continue;const v=value+(o.trumpRevealed&&suit===o.publicTrump?100:0);if(v>power){power=v;winner=p.seat;}}
 return winner===null?'unknown-or-leading':winner===o.partner?'partner':o.teams[winner]===0?'self':'opponent';
}
export function collectionCoverage(bundle:EvaluationBundle){
 const counts:Record<string,number>={};const add=(k:string)=>counts[k]=(counts[k]??0)+1;
 for(const id of Object.keys(bundle.predictions)){const o=bundle.corpus.packets.find(p=>p.id===id)!.observation;
  add('phase:'+(o.currentTrick<=4?'early':o.currentTrick<=9?'middle':'late'));add('rung:'+(o.trumpRevealed?'revealed':'hidden'));add('position:'+(o.currentLength+1));add('call:'+bundle.context[id].callType);add('control:'+publicControl(o));
  if(o.voids.some(v=>v.some(Boolean)))add('public-void-evidence');if(o.history.some(p=>p.aceDown===true))add('public-ace-downgrade-history');
  if(o.trumpRevealed&&o.streakSeat!==null&&o.caller!==null&&o.streakCount===1&&o.teams[o.streakSeat]!==o.teams[o.caller])add('eligible-opponent-streak-context');
  if(bundle.context[id].revealOpportunitiesBeforeDecision)add('after-reveal-opportunity');
 }
 return {assigned:Object.keys(bundle.predictions).length,counts,description:'Descriptive observed collection coverage only; absent categories have zero cases. Not expert intention labels or passed strategy tests.'};
}
