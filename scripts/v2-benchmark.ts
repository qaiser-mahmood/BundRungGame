import {loadCheckpoint} from '../server/ai/v2/learning/Checkpoint';
import {features,legalMask} from '../server/ai/v2/learning/Features';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runGame,pairedBootstrap,Policy} from './ai-benchmark';
import {v2Stats} from '../server/ai/v2/strategy/DecisionController';
import type {V2Options} from '../server/ai/v2/search/ISMCTS';
const args=process.argv.slice(2),get=(k:string,d:string)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const seed=Number(get('--seed','10000')),pairs=Number(get('--pairs','50')),time=Number(get('--time-ms','Infinity'));
const candidate=get('--candidate','ai-v2-ismcts') as Policy,baseline=get('--baseline','corrected-search') as Policy;
const options:V2Options={iterations:Number(get('--iterations','64')),particles:Number(get('--particles','16')),weighted:get('--weighted','false')==='true',
 partnership:get('--partnership','true')==='true',adaptive:get('--adaptive','true')==='true',exact:true};
if(![candidate,baseline].every(p=>['ai-v2-ismcts','corrected-search','advanced-search','heuristic','production-legacy','neural-direct','production','neural'].includes(p)))throw new Error('V2_UNKNOWN_POLICY');
for(const flag of ['--weighted','--partnership','--adaptive'])if(!['true','false'].includes(get(flag,'false')))throw new Error('V2_BOOLEAN_CONFIG');
if(!Number.isSafeInteger(options.iterations)||options.iterations!<1||options.iterations!>10000||!Number.isSafeInteger(options.particles)||options.particles!<1||options.particles!>128)throw new Error('V2_SEARCH_CONFIG');
const checkpoint=get('--checkpoint',''),neuralMode=get('--neural-mode','guided');
if(!['guided','policy'].includes(neuralMode)||checkpoint&&candidate!=='ai-v2-ismcts')throw new Error('V2_NEURAL_CONFIG');
if(checkpoint){const model=loadCheckpoint(checkpoint);options.prior=(s,p,cards)=>model.predict(features(s,p),legalMask(cards)).policy;options.policyOnly=neuralMode==='policy';}
if(!Number.isSafeInteger(seed)||seed<0||!Number.isSafeInteger(pairs)||pairs<1||pairs>10000||!(time>0))throw new Error('V2_BENCHMARK_CONFIG');
const model=()=>createHash('sha256').update(readFileSync('server/ai/models/bund_rung_brain.json')).digest('hex'),before=model();
const results:(ReturnType<typeof runGame>&{v2:typeof v2Stats})[]=[];console.log=(...x)=>console.error(...x);
for(let i=0;i<pairs;i++)for(const team of ['TEAM_1','TEAM_2'] as const){
 const initial={...v2Stats};const game=runGame(seed+i,team,candidate,baseline,{iterations:16,timeMs:time},{},options);
 const delta={...v2Stats};for(const key of Object.keys(delta) as (keyof typeof delta)[])delta[key]-=initial[key];
 results.push({...game,v2:delta});
}
const pairRates=[];for(let i=0;i<results.length;i+=2){if(results[i].dealHash!==results[i+1].dealHash)throw new Error('V2_DEAL_MISMATCH');
 if(results[i].candidateWon!==null&&results[i+1].candidateWon!==null)pairRates.push((Number(results[i].candidateWon)+Number(results[i+1].candidateWon))/2);}
const latency=(p:Policy)=>{const xs=results.flatMap(r=>r.decisions.filter(d=>d.policy===p).map(d=>d.milliseconds)).sort((a,b)=>a-b);return {count:xs.length,meanMs:xs.reduce((a,b)=>a+b,0)/(xs.length||1),p95Ms:xs[Math.ceil(xs.length*.95)-1]??0,maxMs:xs.at(-1)??0};};
const result={schemaVersion:1,seed,pairs,candidate,baseline,options,checkpoint:checkpoint||null,neuralMode:checkpoint?neuralMode:null,timeMs:Number.isFinite(time)?time:null,node:process.version,canonicalBefore:before,canonicalAfter:model(),
 summary:{wins:results.filter(r=>r.candidateWon).length,losses:results.filter(r=>r.candidateWon===false).length,ci:pairedBootstrap(pairRates,seed),
  invalid:results.reduce((n,r)=>n+r.invalidMoves,0),aborted:results.filter(r=>r.error||r.candidateWon===null).length,score:results.reduce((n,r)=>n+(r.signedScoreAdjustment??0),0),
  v2:Object.fromEntries(Object.keys(v2Stats).map(k=>[k,results.reduce((n,r)=>n+r.v2[k as keyof typeof v2Stats],0)])),latency:{[candidate]:latency(candidate),[baseline]:latency(baseline)}},results};
if(result.canonicalBefore!==result.canonicalAfter)throw new Error('V2_MODEL_CHANGED');
const output=get('--output','/tmp/v2-benchmark.json');if(output.includes('bund_rung_brain'))throw new Error('V2_CANONICAL_PATH');writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify({...result,results:undefined},null,2)+'\n');if(result.summary.invalid||result.summary.aborted)process.exitCode=1;
