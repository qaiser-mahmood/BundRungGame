import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import type {runGame} from './ai-benchmark';
const folder=process.argv[2]??'/tmp',read=(name:string)=>JSON.parse(readFileSync(resolve(folder,name+'.json'),'utf8'));
const sha=(name:string)=>createHash('sha256').update(readFileSync(resolve(folder,name+'.json'))).digest('hex');
type Game=ReturnType<typeof runGame>;
const runs:Record<string,unknown>={};
for(const name of ['v2-refine-legacy200','v2-refine-control200','v2-refine-allocation200','v2-refine-heldout1000','v2-refine-duel200','v2-refine-filled-5','v2-refine-filled-10','v2-refine-filled-25']){
 const raw=read(name),games=raw.results as Game[];delete raw.results;
 const pairs=[];
 for(let i=0;i<games.length;i+=2){const a=games[i],b=games[i+1];if(a.dealHash!==b.dealHash)throw new Error('REFINEMENT_DEAL_MISMATCH');
  pairs.push({seed:a.seed,dealHash:a.dealHash,wins:[a.candidateWon,b.candidateWon],scores:[a.signedScoreAdjustment,b.signedScoreAdjustment],invalid:[a.invalidMoves,b.invalidMoves],errors:[a.error,b.error]});}
 const searchByPolicy=Object.fromEntries([...new Set([raw.candidate,raw.baseline])].map(policy=>[policy,Object.fromEntries(Object.keys(games[0].search).map(k=>[k,games.reduce((n,g)=>n+(g.searchByPolicy[policy]?.[k as keyof Game['search']]??0),0)]))]));
 runs[name]={...raw,searchByPolicy,rawSha256:sha(name),pairedOutcomes:pairs};
}
const efficiency=read('v2-efficiency-final3'),modes=[false,true].map(optimized=>{
 const rows=efficiency.results.flatMap((r:{runs:{optimized:boolean;ms:number;efficiency:{templateBuilds:number;fullObservations:number;lightObservations:number}}[]})=>r.runs.filter(x=>x.optimized===optimized));
 return {optimized,count:rows.length,totalMs:rows.reduce((n:number,r:{ms:number})=>n+r.ms,0),templateBuilds:rows.reduce((n:number,r:{efficiency:{templateBuilds:number}})=>n+r.efficiency.templateBuilds,0),
  fullObservations:rows.reduce((n:number,r:{efficiency:{fullObservations:number}})=>n+r.efficiency.fullObservations,0),lightObservations:rows.reduce((n:number,r:{efficiency:{lightObservations:number}})=>n+r.efficiency.lightObservations,0)};
});
const report={schemaVersion:1,frozenCommit:'8bb74a988a6ff4ff2f1570e3b7f31874d5e6d78c',method:'Matched 25 ms paired deals; independent frozen control-vs-corrected holdout 900000..900999 and direct rollout duel 910000..910199; 5000 paired bootstrap replicates. No neural training or checkpoint guidance.',
 canonicalSha256:createHash('sha256').update(readFileSync('server/ai/models/bund_rung_brain.json')).digest('hex'),
 validation:{tests:256,files:27,tsc:'passed',aiTypecheck:'passed',build:'passed; existing chunk warning',tactics:'14/14',parity:'18664 seeded transitions plus targeted fixtures'},
 runs,efficiency:{...efficiency,summary:modes,rawSha256:sha('v2-efficiency-final3')},
 latency:Object.fromEntries([8,16,32].map(rooms=>[rooms,Object.fromEntries(['corrected','legacy','control'].map(variant=>[variant,read(`v2-refine-load-${rooms}-${variant}`)]))])),
 notes:['Exploratory prototype 50-pair runs preceded final disclosure-aware control code and are not pooled with final evaluation.',
 'Pure allocation ablations retain identical fixed-work root statistics in the probe; time-limited outcomes can differ because completion before deadlines changes.',
 'In direct same-policy duels, v2 diagnostic counters pool both teams; latency labels distinguish candidate control from baseline legacy by player/team membership.',
 'Default production policy stays corrected-search; the retained V2 rollout stays default inside ai-v2-ismcts; control remains explicitly experimental.']};
writeFileSync(process.argv[3]??'benchmarks/ai-v2-search-refinement.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(modes,null,2));
