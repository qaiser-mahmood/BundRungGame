import {verifyCorpus,digest,type Corpus,type DecisionPacket} from '../data/Corpus';
import {publicControl} from './Coverage';
export const PILOT_TARGETS:Record<string,number>={
 'phase:early':5,'phase:middle':5,'phase:late':5,
 'position:1':3,'position:2':3,'position:3':3,'position:4':3,
 'rung:hidden':5,'rung:revealed':5,'call:forced':5,'call:voluntary':5,
 'control:partner':3,'control:opponent':4,'own-strong-suit':5,'own-weak-suit':5,
 'public-void-evidence':5,'current-ace-downgrade':1,'next-ace-lead-risk':1,
 'ace-downgrade-history':2,'opponent-streak-threat':2,'protect-partner-choice':3,
 'split:train':5,'split:validation':5,'split:holdout':5,'choices:3-plus':10,
};
export interface PilotPlan {version:'targeted-expert-pilot/v1';packetIds:string[];targets:Record<string,number>;counts:Record<string,number>;insufficient:{category:string;target:number;actual:number}[];selectionHash:string;}
export function pilotTags(p:DecisionPacket,split:string,forced:boolean):string[]{
 const o=p.observation,counts=[0,0,0,0],high=[0,0,0,0];
 for(const c of o.ownCards){const suit=Math.floor(c/13);counts[suit]++;high[suit]=Math.max(high[suit],c%13+2);}
 const control=publicControl(o),tags=[`phase:${o.currentTrick<=4?'early':o.currentTrick<=9?'middle':'late'}`,`position:${o.currentLength+1}`,`rung:${o.trumpRevealed?'revealed':'hidden'}`,`call:${forced?'forced':'voluntary'}`,`split:${split}`,`control:${control}`];
 // Descriptive collection proxies only, never intention labels or action rules.
 if(counts.some((n,s)=>n>=2&&high[s]>=12))tags.push('own-strong-suit');
 if(counts.some((n,s)=>n>0&&high[s]<=9))tags.push('own-weak-suit');
 if(o.voids.some(v=>v.some(Boolean)))tags.push('public-void-evidence');
 if(o.history.some(h=>h.aceDown===true))tags.push('ace-downgrade-history');
 if(o.history.some(h=>h.trick===o.currentTrick&&h.aceDown===true))tags.push('current-ace-downgrade');
 const previous=o.history.find(h=>h.trick===o.currentTrick-1&&h.seat===0);
 if(o.currentLength===0&&o.completedWinners.at(-1)===0&&previous?.card!==null&&previous?.card!==undefined&&previous.card%13===12&&o.legal.some(c=>c%13===12))tags.push('next-ace-lead-risk');
 if(o.trumpRevealed&&o.streakSeat!==null&&o.caller!==null&&o.streakCount===1&&o.teams[o.streakSeat]!==o.teams[o.caller])tags.push('opponent-streak-threat');
 if(control==='partner'&&o.legal.length>=2)tags.push('protect-partner-choice');
 if(o.legal.length>=3)tags.push('choices:3-plus');
 return tags;
}
export function coverageShortfalls(counts:Record<string,number>){return Object.entries(PILOT_TARGETS).filter(([key,n])=>(counts[key]??0)<n).map(([category,target])=>({category,target,actual:counts[category]??0}));}
export function selectPilot(corpus:Corpus):PilotPlan {
 verifyCorpus(corpus);
 const sources=new Map(corpus.manifest.sources.map(s=>[s.packetId,s]));
 // Forcedness is captured from actual official bidding replay, not dealer identity.
 // generateCorpus records it for targeted cohorts; older corpora cannot be guessed.
 const candidates=corpus.packets.map(p=>{const s=sources.get(p.id)!;if(s.forcedCall===undefined)throw new Error('PILOT_CALL_PROVENANCE_REQUIRED');return {p,tags:pilotTags(p,s.split,s.forcedCall)};}).sort((a,b)=>a.p.id.localeCompare(b.p.id));
 const supply=new Map<string,number>();for(const tag of Object.keys(PILOT_TARGETS))supply.set(tag,new Set(candidates.filter(c=>c.tags.includes(tag)).map(c=>c.p.dealKey)).size);
 const selected:typeof candidates=[],usedDeals=new Set<string>(),usedObservations=new Set<string>(),counts:Record<string,number>={};
 for(let index=0;index<15;index++){
  let best:typeof candidates[number]|undefined,bestScore=-Infinity;
  for(const c of candidates){if(usedDeals.has(c.p.dealKey)||usedObservations.has(c.p.observationHash))continue;
   if(c.tags.some(t=>(t.startsWith('phase:')||t.startsWith('split:'))&&(counts[t]??0)>=5)||c.tags.some(t=>t.startsWith('position:')&&(counts[t]??0)>=4))continue;
   // Bound binary-choice cases; this avoids filling a cohort with near-forced moves.
   if(c.p.observation.legal.length<3&&(counts['binary-choice']??0)>=5)continue;
   const score=c.tags.reduce((sum,t)=>{const deficit=Math.max(0,(PILOT_TARGETS[t]??0)-(counts[t]??0));return sum+(deficit?100*deficit/Math.max(1,supply.get(t)??1):0);},0);
   if(score>bestScore){best=c;bestScore=score;}
  }
  if(!best)throw new Error('PILOT_COVERAGE_POOL_INSUFFICIENT: use a larger fresh pool or seed before collecting labels');
  selected.push(best);usedDeals.add(best.p.dealKey);usedObservations.add(best.p.observationHash);for(const t of best.tags)counts[t]=(counts[t]??0)+1;
  if(best.p.observation.legal.length===2)counts['binary-choice']=(counts['binary-choice']??0)+1;
 }
 const packetIds=selected.map(c=>c.p.id),targets={...PILOT_TARGETS};
 return {version:'targeted-expert-pilot/v1',packetIds,targets,counts,insufficient:coverageShortfalls(counts),selectionHash:digest({manifestHash:corpus.manifest.manifestHash,packetIds,targets})};
}
export function pilotPackets(corpus:Corpus,plan:PilotPlan):DecisionPacket[]{
 if(digest(plan)!==digest(selectPilot(corpus)))throw new Error('PILOT_SELECTION_INTEGRITY');
 return plan.packetIds.map(id=>corpus.packets.find(p=>p.id===id)!);
}
