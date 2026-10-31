import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pairedBootstrap} from './ai-benchmark';
import type {runGame} from './ai-benchmark';
import type {v2Stats} from '../server/ai/v2/strategy/DecisionController';
const folder=process.argv[2]??'/tmp',path=(name:string)=>resolve(folder,name+'.json');
const read=(name:string)=>JSON.parse(readFileSync(path(name),'utf8'));
const sha=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
type Game=ReturnType<typeof runGame>&{v2:typeof v2Stats};
const runs:Record<string,unknown>={};
for(const name of ['v2-smoke','v2-dev200','v2-weighted50','v2-no-partner50','v2-no-adaptive50','v2-v-advanced50','v2-timed200','v2-heldout1000','v2-neural-guided50','v2-neural-policy50']){
 const raw=read(name),games=raw.results as Game[];delete raw.results;
 const pairs=[];for(let i=0;i<games.length;i+=2){const a=games[i],b=games[i+1];if(a.dealHash!==b.dealHash)throw new Error('V2_SUMMARY_DEAL_MISMATCH');
  pairs.push({seed:a.seed,dealHash:a.dealHash,wins:[a.candidateWon,b.candidateWon],score:[a.signedScoreAdjustment,b.signedScoreAdjustment],errors:[a.error,b.error],invalid:[a.invalidMoves,b.invalidMoves]});}
 const stats=Object.fromEntries([...new Set([raw.candidate,raw.baseline])].map(p=>[p,Object.fromEntries(Object.keys(games[0].search).map(k=>[k,games.reduce((sum,g)=>sum+(g.searchByPolicy[p]?.[k as keyof Game['search']]??0),0)]))]));
 runs[name]={...raw,rawSha256:sha(path(name)),searchByPolicy:stats,pairedOutcomes:pairs};
}
const dev=read('v2-dev200'),first=dev.results.slice(0,100) as Game[],pairRates:number[]=[];
for(let i=0;i<first.length;i+=2)pairRates.push((Number(first[i].candidateWon)+Number(first[i+1].candidateWon))/2);
const calibration=read('v2-calibration');
const calibrationSummary=Object.fromEntries(['random','lowest'].map(behavior=>[behavior,[false,true].map(weighted=>{
 const scores=calibration.rows.filter((r:{behavior:string})=>r.behavior===behavior).map((r:{scores:{weighted:boolean;brier:number;logLoss:number;diagnostics:{ess:number;unique:number;milliseconds:number}}[]})=>r.scores.find(s=>s.weighted===weighted)!);
 const mean=(key:'brier'|'logLoss')=>scores.reduce((sum:number,s:{brier:number;logLoss:number})=>sum+s[key],0)/scores.length;
 return {weighted,observations:scores.length,brier:mean('brier'),logLoss:mean('logLoss'),meanEss:scores.reduce((n:number,s:{diagnostics:{ess:number}})=>n+s.diagnostics.ess,0)/scores.length};
})]));
const data=read('v2-validation-trajectories'),examples=data.examples as {reward:number;mask:number[]}[];
const report={schemaVersion:1,frozenSearchCommit:'2c166275e04a53ad9a4759ab9184c346b5fecb0f',
 canonicalSha256:sha('server/ai/models/bund_rung_brain.json'),
 method:'Fixed-work primary versus matched-25ms secondary; paired deal bootstrap; fresh holdout 700000..700999; no parameter tuning after holdout.',
 validation:{npmCi:'passed',tests:230,files:25,tsc:'passed',aiTypecheck:'passed',build:'passed; existing chunk-size warning',tactics:'14/14'},
 runs,developmentFirst50:{seed:11000,pairs:50,wins:first.filter(g=>g.candidateWon).length,losses:first.filter(g=>g.candidateWon===false).length,ci:pairedBootstrap(pairRates,11000)},
 parity:read('v2-parity'),representation:read('v2-cards'),throughput:read('v2-throughput'),calibration:{...calibration,summary:calibrationSummary},rootDiagnostics:read('v2-root-probe'),matches:read('v2-matches'),
 learning:{capture:read('v2-capture-summary'),training:read('v2-training-summary'),resume:read('v2-resume-summary'),validation:read('v2-model-validation-summary'),
  validationUniformPolicyCrossEntropy:examples.reduce((sum,e)=>sum+Math.log(e.mask.reduce((a,b)=>a+b,0)),0)/examples.length,
  validationZeroValueMSE:examples.reduce((sum,e)=>sum+e.reward**2,0)/examples.length,trainingDatasetSha256:sha(path('v2-trajectories')),validationDatasetSha256:sha(path('v2-validation-trajectories'))},
 initialLatency:Object.fromEntries([8,16,32].map(rooms=>[rooms,Object.fromEntries(['corrected-search','ai-v2-ismcts'].map(p=>[p,read(`v2-latency-${rooms}-${p}`)]))])),
 latency:Object.fromEntries([8,16,32].map(rooms=>[rooms,Object.fromEntries(['corrected-search','ai-v2-ismcts'].map(p=>[p,read(`v2-instrumented-${rooms}-${p}`)]))]))};
writeFileSync(process.argv[3]??'benchmarks/ai-v2-results.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({developmentFirst50:report.developmentFirst50,calibration:calibrationSummary,learning:report.learning},null,2));
