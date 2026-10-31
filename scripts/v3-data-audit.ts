import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {readCorpus,verifyReplay} from './v3-expert-data';
import {vectorize,FEATURE_COUNT,strategicFacts} from '../server/ai/v3/data/Observation';
import {supervisionStatus} from '../server/ai/v3/learning/Rows';
const dir=process.argv[2]??'/tmp/v3-expert-corpus',corpus=readCorpus(dir);verifyReplay(corpus);
const times:number[]=[],coverage:Record<string,number>={lowPartnerLeadAfterWin:0,highPartnerLead:0,repeatedPartnerLead:0,ambiguousHighWinDifferentLow:0,ourCaller:0,opponentCaller:0,revealedIndividualStreak:0,unrevealedTrump:0};
for(const p of corpus.packets){const o=p.observation,f=strategicFacts(o),lead=f.partnerLead;
 if(lead?.afterWin&&lead.strength!==null&&lead.strength<=6/14)coverage.lowPartnerLeadAfterWin++;
 if(lead?.strength!==null&&lead&&lead.strength>=10/14)coverage.highPartnerLead++;
 if(lead?.repeated)coverage.repeatedPartnerLead++;
 if(lead?.strength!==null&&lead&&lead.strength<=6/14&&f.partnerPreviousWin?.strength!==null&&f.partnerPreviousWin&&f.partnerPreviousWin.strength>=10/14&&f.partnerPreviousWin.suit!==lead.suit)coverage.ambiguousHighWinDifferentLow++;
 if(o.caller!==null)coverage[o.teams[o.caller]===0?'ourCaller':'opponentCaller']++;
 if(o.trumpRevealed&&o.currentTrick>2&&o.streakCount&&o.streakSeat!==null&&o.caller!==null&&o.teams[o.streakSeat]!==o.teams[o.caller])coverage.revealedIndividualStreak++;
 if(!o.trumpRevealed)coverage.unrevealedTrump++;
}
for(let pass=0;pass<5;pass++)for(const p of corpus.packets){const start=performance.now();vectorize(p.observation);times.push(performance.now()-start);}times.sort((a,b)=>a-b);
const report={schemaVersion:1,manifestHash:corpus.manifest.manifestHash,positions:corpus.packets.length,features:FEATURE_COUNT,opponentStyles:[...new Set(corpus.manifest.sources.map(s=>s.opponentStyle))],
 coverage:{...coverage,note:'Observable descriptive thresholds for collection coverage, never intention labels or expected actions.'},
 dataLatency:{scope:'feature validation/vectorization only; excludes generation, packets, inference, search and queue',count:times.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p50Ms:times[Math.ceil(times.length*.5)-1],p95Ms:times[Math.ceil(times.length*.95)-1],maxMs:times.at(-1)},
 status:supervisionStatus(corpus),modelEvaluation:null,tournamentResults:null,policyLatency8_16_32Rooms:null};
writeFileSync(process.argv[3]??'/tmp/v3-data-audit.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
