import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {setupCorpusGame,initialDealKey,digest,Split} from '../server/ai/v3/data/Corpus';
import {observePlayerDecision,vectorize,legalMask,PLAYER_FEATURE_SCHEMA,PLAYER_FEATURE_NAMES} from '../server/ai/v3/data/Observation';
import {advanceForced} from '../server/ai/planning/MonteCarloPlanner';
import {decideV2,v2Stats} from '../server/ai/v2/strategy/DecisionController';
import {indexOf} from '../server/ai/v2/simulation/CompactState';
import {seededRandom,withRandom} from './ai-benchmark';
import {TeacherPolicy} from '../server/ai/v3/learning/TeacherPolicy';
import {BundRungEngine} from '../server/engine/BundRungEngine';
import {BotPlayer} from '../server/ai/BotPlayer';
export interface Row {deal:string;split:Split;x:number[];mask:number[];label:number;caller:boolean;revealed:boolean;mode:string;position:number;}
export const teacherOptions={iterations:8,particles:4,timeMs:Infinity,exact:false,adaptive:false,rollout:'control' as const};
export function generate(seed:number,counts:number[],sourceCommit:string){
 const rows:Row[]=[],deals=new Map<string,Split>();let offset=0;
 for(const [j,split] of (['train','validation','holdout'] as Split[]).entries())for(let n=0;n<counts[j];n++){
  const dealSeed=seed+offset++,random=seededRandom(dealSeed^0x7633);
  withRandom(random,()=>{
   let engine:BundRungEngine;
   if(dealSeed%3===2){
    engine=new BundRungEngine();for(let i=0;i<4;i++)engine.addPlayer(`p${i}`,`Seat ${i}`,true);engine.assignTeams(['p0','p2'],['p1','p3']);engine.startInitialToss();
    for(let step=0;step<200&&!['TRICK_PLAYING','GAME_RESOLVED','MATCH_OVER'].includes(engine.getPhase());step++){
     const s=engine.getPublicState();if(s.phase==='TOSS_COMPLETE')engine.dealerDistributeCards(s.players[s.dealerPlayerIndex].id);
     else if(s.phase==='BIDDING_PHASE')engine.submitBid(s.biddingTurnPlayerId!,'BWINJI',engine.getPrivateState(s.biddingTurnPlayerId!).myHand[0].suit);
     else for(const p of s.players){if(engine.getPhase()==='TRICK_PLAYING')break;BotPlayer.handleBotTurn(engine,p.id,{roomId:'v3-synthetic',policy:{name:'heuristic'}});}
    }
   }else{
    engine=setupCorpusGame({seed,trainDeals:counts[0],validationDeals:counts[1],holdoutDeals:counts[2],positionsPerDeal:52,sourceCommit,calling:'mixed',observationVersion:2},dealSeed);
    if(dealSeed%3===1){const s=engine.getPublicState(),id=s.currentTurnPlayerId!,c=engine.getPrivateState(id).myHand[0];if(s.trumpMode==='CLOSE_TRUMP'&&!s.isTrumpRevealed)engine.declareOpenRung(id,c.suit,c.id,false);}
   }
   const deal=initialDealKey(engine);
   if(deals.has(deal))throw Error('V3_DUPLICATE_DEAL');deals.set(deal,split);
   for(let step=0;step<180&&engine.getPhase()==='TRICK_PLAYING';step++){
    if(advanceForced(engine))continue;
    const state=engine.getPublicState(),id=state.currentTurnPlayerId!,priv=engine.getPrivateState(id),legal=engine.getLegalCardsForPlayer(id),o=observePlayerDecision(state,priv);
    const selected=decideV2(state,priv,legal,{}, {...teacherOptions,random}),label=indexOf(selected.id),mask=legalMask(o);
    if(mask[label]!==1)throw Error('V3_TEACHER_ILLEGAL');
    rows.push({deal,split,x:vectorize(o),mask,label,caller:o.caller===0,revealed:o.trumpRevealed,mode:o.mode,position:o.currentLength});
    engine.playCard(id,selected.id);
   }
   if(!['GAME_RESOLVED','MATCH_OVER'].includes(engine.getPhase()))throw Error('V3_INCOMPLETE_DEAL');
  });
 }
 return rows;
}
export function metrics(model:TeacherPolicy,rows:Row[]){
 const start=performance.now();let loss=0,correct=0,legal=0;
 for(const r of rows){const p=model.probabilities(r.x,r.mask),a=model.action(r.x,r.mask);loss-=Math.log(Math.max(1e-15,p[r.label]));correct+=Number(a===r.label);legal+=r.mask[a];}
 return {samples:rows.length,deals:new Set(rows.map(r=>r.deal)).size,loss:rows.length?loss/rows.length:null,agreement:rows.length?correct/rows.length:null,legalCompliance:rows.length?legal/rows.length:null,inferenceMs:performance.now()-start};
}
export function run(args:string[]){
 const get=(k:string,d:string)=>args.includes(k)?args[args.indexOf(k)+1]:d;
 const seed=Number(get('--seed','763300')),epochs=Number(get('--epochs','20')),counts=get('--deals','80,16,24').split(',').map(Number),rate=.015;
 if(!Number.isSafeInteger(seed)||seed<0||!Number.isSafeInteger(epochs)||epochs<1||epochs>1000||counts.length!==3||counts.some(n=>!Number.isSafeInteger(n)||n<1||n>1000))throw Error('V3_CONFIG');
 const output=get('--output','server/ai/models/experiments/v3/first-training');mkdirSync(output,{recursive:true});
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),start=performance.now(),before={...v2Stats},rows=generate(seed,counts,sourceCommit),generationMs=performance.now()-start;
 writeFileSync(resolve(output,'synthetic-data.json'),JSON.stringify(rows),{flag:'wx'});
 const train=rows.filter(r=>r.split==='train'),validation=rows.filter(r=>r.split==='validation'),holdout=rows.filter(r=>r.split==='holdout');
 const model=new TeacherPolicy(),history=[],random=seededRandom(seed),trainingStart=performance.now();let best=Infinity,bestWeights=model.weights.slice(),bestBias=model.bias.slice(),bestEpoch=0;
 for(let epoch=1;epoch<=epochs;epoch++){
  const order=train.slice();for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  for(const r of order)model.step(r.x,r.mask,r.label,rate/Math.sqrt(epoch));
  const training=metrics(model,train),val=metrics(model,validation);history.push({epoch,training,val});
  if(val.loss!<best){best=val.loss!;bestEpoch=epoch;bestWeights=model.weights.slice();bestBias=model.bias.slice();}
 }
 const trainingMs=performance.now()-trainingStart,selected=new TeacherPolicy(bestWeights,bestBias),config={seed,epochs,counts,rate,architecture:'629 affine 52 masked softmax',selection:'minimum validation cross entropy'};
 const provenance={kind:'synthetic-supervision',teacher:'ai-v2-ismcts/control',teacherOptions:{...teacherOptions,timeMs:'Infinity'},sourceCommit,datasetHash:digest(rows),splitUnit:'complete initial deal',expertRecordsUsed:0,dealKeys:Object.fromEntries((['train','validation','holdout'] as Split[]).map(s=>[s,[...new Set(rows.filter(r=>r.split===s).map(r=>r.deal))]])),teacherStats:Object.fromEntries(Object.keys(before).map(k=>[k,v2Stats[k as keyof typeof before]-before[k as keyof typeof before]]))};
 const checkpoint=resolve(output,'checkpoint.json');writeFileSync(checkpoint,JSON.stringify({schema:'bundrung-v3-teacher-policy/v1',featureSchema:PLAYER_FEATURE_SCHEMA,featureNames:PLAYER_FEATURE_NAMES,inputs:629,outputs:52,epochs:bestEpoch,config,provenance,weights:selected.weights,bias:selected.bias}),{flag:'wx'});
 // A fresh Node process must load the checkpoint and reproduce every holdout action.
 const loaded=TeacherPolicy.load(checkpoint),expected=holdout.map(r=>loaded.action(r.x,r.mask));
 const probe=execFileSync(process.execPath,['--import','tsx',resolve('scripts/v3-first-training.ts'),'--probe',checkpoint,resolve(output,'synthetic-data.json')],{encoding:'utf8'}).trim();
 if(probe!==JSON.stringify(expected))throw Error('V3_RESTART_PARITY');
 const report={config,provenance,checkpoint,sha256:createHash('sha256').update(readFileSync(checkpoint)).digest('hex'),checkpointBytes:readFileSync(checkpoint).length,generationMs,trainingMs,bestEpoch,history,training:metrics(loaded,train),validation:metrics(loaded,validation),holdout:metrics(loaded,holdout),restartParity:true,slices:Object.fromEntries(['caller','noncaller','hidden','revealed',...new Set(holdout.map(r=>r.mode))].map(k=>[k,metrics(loaded,holdout.filter(r=>k==='caller'?r.caller:k==='noncaller'?!r.caller:k==='hidden'?!r.revealed:k==='revealed'?r.revealed:r.mode===k))])),limitations:['Card decisions only; authoritative advanceForced handles reveal and other forced transitions.','Teacher uses a small fixed eight-iteration budget; V2 internal fallback counts are recorded.','No human expert data used; imitation does not establish gameplay strength.']};
 writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});writeFileSync(resolve(output,'holdout-report.json'),JSON.stringify({datasetHash:provenance.datasetHash,holdout:report.holdout,slices:report.slices},null,2),{flag:'wx'});return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv[2]==='--probe'){const model=TeacherPolicy.load(process.argv[3]),rows=JSON.parse(readFileSync(process.argv[4],'utf8')) as Row[];process.stdout.write(JSON.stringify(rows.filter(r=>r.split==='holdout').map(r=>model.action(r.x,r.mask))));}
 else console.log(JSON.stringify(run(process.argv.slice(2)),null,2));
}
