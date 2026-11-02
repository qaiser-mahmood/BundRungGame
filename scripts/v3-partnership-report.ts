import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pairedBootstrap} from './ai-benchmark';
const root='benchmarks/v3-partnership-training',local='server/ai/models/experiments/v3',read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const full=read(`${local}/partnership-full/manifest.json`),fresh=read(`${local}/partnership-audited-holdout/manifest.json`),trainingDeals=new Set<string>(full.shards.map((s:{deal:string})=>s.deal));
const probeDeals=new Set<string>(['weak','32','64'].flatMap(t=>read(`${local}/partnership-throughput-${t}/manifest.json`).shards.map((s:{deal:string})=>s.deal)));
for(const s of read(`${local}/partnership-pilot/manifest.json`).shards)probeDeals.add(s.deal);
for(const xs of Object.values(read('benchmarks/v3-first-training/checkpoint.json').provenance.dealKeys) as string[][])for(const d of xs)probeDeals.add(d);
for(const s of fresh.shards)if(trainingDeals.has(s.deal)||probeDeals.has(s.deal))throw Error('V3_FINAL_HOLDOUT_OVERLAP');
const names=['v2','original','heuristic','retrained-linear','original-control','teacher-diagnostic'];
const reports=Object.fromEntries(names.map(name=>{const summary=read(`${root}/games-${name}.json`);return [name,summary.results?summary:read(`${local}/partnership-game-records/games-${name}.json`)];}));
const evidence:unknown[]=[],gameDeals=new Set<string>(),dealBySeed=new Map<number,string>();
for(const [name,r] of Object.entries(reports)){
 const xs=r.results;if(!xs||xs.length!==r.pairs*2||r.summary.invalid)throw Error('V3_GAME_REPORT');
 for(let i=0;i<xs.length;i+=2){
  const a=xs[i],b=xs[i+1];if(a.deal!==b.deal||a.seed!==b.seed||a.candidateTeam===b.candidateTeam||trainingDeals.has(a.deal)||probeDeals.has(a.deal)||fresh.shards.some((s:{deal:string})=>s.deal===a.deal))throw Error('V3_GAME_SPLIT_OR_PAIR');
  if(dealBySeed.has(a.seed)&&dealBySeed.get(a.seed)!==a.deal)throw Error('V3_COMPARISON_DEAL_MISMATCH');dealBySeed.set(a.seed,a.deal);
  gameDeals.add(a.deal);evidence.push({comparison:name,seed:a.seed,deal:a.deal,mode:a.mode,won:[a.won,b.won],score:[a.score,b.score],trickDifferential:[a.trickDifferential,b.trickDifferential],partnership:[a.partnership,b.partnership],trump:[a.trump,b.trump]});
 }
}
const selected=reports.v2.results,control=reports['original-control'].results,deltas:number[]=[];
for(let i=0;i<selected.length;i+=2){if(selected[i].seed!==control[i].seed)throw Error('V3_CONTROL_SEEDS');deltas.push((Number(selected[i].won)+Number(selected[i+1].won)-Number(control[i].won)-Number(control[i+1].won))/2);}
const teacher=Object.fromEntries(['weak','32','64'].map(t=>{const m=read(`${local}/partnership-throughput-${t}/manifest.json`),g=t==='weak'?null:read(`${local}/partnership-throughput-${t}/teacher-games.json`);return [t,{teacher:m.teacher,deals:m.generated,generationMs:m.generationMs,dealsPerSecond:m.generated/(m.generationMs/1000),games:g?{summary:g.summary,byMode:g.byMode,seed:g.seed,pairs:g.pairs}:null}];}));
const fits=Object.fromEntries(['pilot-mlp','pilot-visits','full-mlp','full-linear','full-mlp-regularized'].map(name=>[name,read(`${local}/partnership-${name}/training-report.json`)]));
const report={schema:'bundrung-v3-partnership-experiment/v1',decision:'Do not replace the incumbent policy: better imitation did not demonstrate better gameplay.',selection:read(`${root}/selection.json`),teacherBenchmark:teacher,pilotBaseline:read(`${local}/partnership-pilot/original-linear-baseline.json`),developmentDataset:read(`${local}/partnership-full/dataset-summary.json`),finalDataset:read(`${local}/partnership-audited-holdout/dataset-summary.json`),fits,originalValidationBaseline:read(`${local}/partnership-full/original-linear-validation.json`),validation:{mlp:read(`${local}/partnership-full-mlp-regularized/validation-slices.json`),retrainedLinear:read(`${local}/partnership-full-linear/validation-slices.json`)},holdout:{mlp:read(`${root}/final-holdout-mlp.json`),original:read(`${root}/final-holdout-original.json`),retrainedLinear:read(`${root}/final-holdout-retrained-linear.json`)},games:Object.fromEntries(Object.entries(reports).map(([name,r])=>[name,{...r,results:undefined}])),improvementAgainstSameV2:{differenceInWinRate:deltas.reduce((a,b)=>a+b,0)/deltas.length,paired95CI:pairedBootstrap(deltas,9300000),pairs:deltas.length},integrity:{trainingValidationAndFinalHoldoutOverlap:0,gameplayAndDataOverlap:0,finalHoldoutDeals:fresh.shards.length,distinctGameplayDeals:gameDeals.size,originalCheckpointSHA256:createHash('sha256').update(readFileSync('benchmarks/v3-first-training/checkpoint.json')).digest('hex'),selectedCheckpointSHA256:createHash('sha256').update(readFileSync(`${root}/checkpoint.json`)).digest('hex'),checkpointBytes:readFileSync(`${root}/checkpoint.json`).length,holdoutAudit:'Early throughput probe reused three development holdout deals. The development holdout reports are exploratory only. Final results use 250 freshly generated deals at seeds 4600300-4600549 after weights and selection were locked; no further fitting or model selection occurred.'}};
if(report.integrity.originalCheckpointSHA256!=='56050bbcd02a6e30b2832c69170f2483e41f78461181545d92f0cc252cf77d66'||report.integrity.selectedCheckpointSHA256!==report.selection.checkpointSHA256)throw Error('V3_CHECKPOINT_CHANGED');
if(process.argv.includes('--verify-only')){console.log(JSON.stringify({verified:true,integrity:report.integrity},null,2));process.exit(0);}
const flag=process.argv.includes('--refresh')?'w':'wx';
writeFileSync(`${root}/experiment.json`,JSON.stringify(report,null,2),{flag});
writeFileSync(`${root}/paired-games.jsonl`,evidence.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag});
// Preserve full local execution records, publish concise summaries and paired evidence.
const archive=resolve(local,'partnership-game-records');mkdirSync(archive,{recursive:true});
for(const [name,r] of Object.entries(reports)){writeFileSync(resolve(archive,`games-${name}.json`),JSON.stringify(r,null,2));writeFileSync(`${root}/games-${name}.json`,JSON.stringify({...r,results:undefined},null,2));}
console.log(JSON.stringify({integrity:report.integrity,improvementAgainstSameV2:report.improvementAgainstSameV2},null,2));
