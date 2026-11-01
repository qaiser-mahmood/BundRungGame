import {publicControl} from './Coverage';
import type {ReviewRecord} from './Store';
import type {EvaluationBundle} from './Prepare';
export function evaluationReport(records:ReviewRecord[],bundle:EvaluationBundle){
 // First independent label per actor/case; revisions after comparisons are not held-out evidence.
 const blind=records.filter(r=>r.blindAtSubmission&&r.submission.status==='reviewed'&&r.submission.selected!==null);
 const byKey=new Map<string,ReviewRecord>();for(const r of blind)byKey.set(r.annotatorId+':'+r.packetId,r);const rows=[...byKey.values()];
 const score=(xs:ReviewRecord[])=>Object.fromEntries(['v2','v3'].map(k=>{let available=0,agrees=0,ranked=0,top2=0;for(const r of xs){const p=r.predictions[k as 'v2'|'v3'];if(p.status!=='available')continue;available++;agrees+=Number(p.action===r.submission.selected);const ranks=[[r.submission.selected!],...r.submission.rankedAlternatives],flat=ranks.flat();if(ranks.length>=2&&flat.includes(p.action!)){ranked++;top2+=Number(ranks.slice(0,2).flat().includes(p.action!));}}return [k,{available,topRankedAgreementRate:available?agrees/available:null,disagreements:available-agrees,agreementCount:agrees,conditionalTop2Tiers:{compared:ranked,rate:ranked?top2/ranked:null}}];}));
 const groups:Record<string,ReviewRecord[]>={};for(const r of rows){const o=bundle.corpus.packets.find(p=>p.id===r.packetId)!.observation,control=publicControl(o);
  const tags=[`split:${r.split}`,`phase:${o.currentTrick<=4?'early':o.currentTrick<=9?'middle':'late'}`,`rung:${o.trumpRevealed?'revealed':'hidden'}`,`control:${control}`,...r.submission.principles.map(p=>'principle:'+p)];
  for(const t of tags){(groups[t]??=[]).push(r);}
 }
 return {schema:'bundrung-expert-evaluation-report/v1',manifestHash:bundle.corpus.manifest.manifestHash,totalRevisionRecords:records.length,reviewedSituations:rows.length,excludedPostComparisonOrUnlabelled:records.length-rows.length,countsByStatus:Object.fromEntries(['reviewed','ambiguous','insufficient','skipped'].map(s=>[s,records.filter(r=>r.submission.status===s).length])),models:score(rows),groups:Object.fromEntries(Object.entries(groups).map(([k,xs])=>[k,{count:xs.length,models:score(xs)}])),claim:'Descriptive expert agreement, not playing strength or improvement. Conditional top-two rank tiers compare only genuinely ranked alternatives containing the AI action. Splits are reported separately; holdout must never be used for model selection.',trainingPerformed:false,confidenceInterval:null};
}
