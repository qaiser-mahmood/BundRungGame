import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {setupExperiment,publicTags,teacherCard,Teacher} from './v3-partnership-common';
import {seededRandom,withRandom,pairedBootstrap} from './ai-benchmark';
import {initialDealKey} from '../server/ai/v3/data/Corpus';
import {advanceForced} from '../server/ai/planning/MonteCarloPlanner';
import {BotPlayer} from '../server/ai/BotPlayer';
import {observePlayerDecision,vectorize,legalMask} from '../server/ai/v3/data/Observation';
import type {PolicyInference} from '../server/ai/v3/learning/MLPPolicy';
import {loadPolicy} from './v3-partnership-evaluate';
type PlayerPolicy=PolicyInference|Teacher|'heuristic';
export function game(seed:number,candidateTeam:'TEAM_1'|'TEAM_2',candidate:PlayerPolicy,baseline:PlayerPolicy){
 const engine=setupExperiment(seed),initial=engine.getPublicState(),deal=initialDealKey(engine),mode=initial.trumpMode,latencies:number[]=[],partnership={opportunities:0,overtakes:0,conserves:0,overtakeTrickWins:0,conserveTrickWins:0,overtakeGameWins:0,conserveGameWins:0},trump={known:0,used:0,highUsed:0},pending:{trick:number;overtook:boolean}[]=[];
 let decisions=0,invalid=0;const start=performance.now();
 for(let step=0;step<240&&engine.getPhase()==='TRICK_PLAYING';step++){
  if(advanceForced(engine))continue;
  const s=engine.getPublicState(),id=s.currentTurnPlayerId!,p=engine.getPrivateState(id),legal=engine.getLegalCardsForPlayer(id),candidateRole=s.players.find(p=>p.id===id)!.team===candidateTeam,policy=candidateRole?candidate:baseline,tags=candidateRole?publicTags(s,p,legal):null,decisionStart=performance.now(),random=seededRandom(seed^Math.imul(step+1,0x45d9f3b));
  const c=withRandom(random,()=>{
   if(typeof policy==='object'){const o=observePlayerDecision(s,p),action=policy.action(vectorize(o),legalMask(o));return legal.find(c=>index(c.id)===action);}
   if(policy==='heuristic'){const hand=p.myTrumpCard&&p.isMyTrumpCardPlayable?[...p.myHand,p.myTrumpCard]:p.myHand;return BotPlayer.chooseMasterCard(engine,id,legal,hand,s,p,{name:'heuristic'});}
   return teacherCard(s,p,legal,random,policy).card;
  });
  if(!c||!legal.some(a=>a.id===c.id)){invalid++;throw Error('V3_GAME_ILLEGAL');}
  if(candidateRole){
   latencies.push(performance.now()-decisionStart);decisions++;
   if(tags!.trumpKnown){trump.known++;if(tags!.trumpCards.includes(index(c.id))){trump.used++;if(c.playValue>=11)trump.highUsed++;}}
   if(tags!.partnerWinning){const overtook=tags!.overtakes.includes(index(c.id));partnership.opportunities++;partnership[overtook?'overtakes':'conserves']++;pending.push({trick:s.currentTrick.trickNumber,overtook});}
  }
  engine.playCard(id,c.id);
 }
 const final=engine.getPublicState();if(!['GAME_RESOLVED','MATCH_OVER'].includes(final.phase))throw Error('V3_GAME_INCOMPLETE');
 const won=final.lastGameWinningTeam===null?null:final.lastGameWinningTeam===candidateTeam;
 for(const event of pending){const trick=final.completedTricks.find(t=>t.trickNumber===event.trick);if(trick?.winningTeam===candidateTeam)partnership[event.overtook?'overtakeTrickWins':'conserveTrickWins']++;if(won)partnership[event.overtook?'overtakeGameWins':'conserveGameWins']++;}
 const entry=final.scorecard.history.at(-1);
 return {seed,candidateTeam,deal,mode,won,invalid,decisions,milliseconds:performance.now()-start,inferenceMs:latencies.reduce((a,b)=>a+b,0),latencies,partnership,trump,trickDifferential:(final.team1TricksWon-final.team2TricksWon)*(candidateTeam==='TEAM_1'?1:-1),score:entry?entry.scoreAdjustment*(entry.dealerTeam===candidateTeam?-1:1):0};
}
import {indexOf as index} from '../server/ai/v2/simulation/CompactState';
export function compare(seed:number,pairs:number,candidate:PlayerPolicy,baseline:PlayerPolicy){
 if(!Number.isSafeInteger(seed)||seed<0||seed+pairs>0xffffffff||!Number.isSafeInteger(pairs)||pairs<1||pairs>10000)throw Error('V3_GAME_CONFIG');
 const results:ReturnType<typeof game>[]=[],started=performance.now();
 for(let i=0;i<pairs;i++){
  for(const team of ['TEAM_1','TEAM_2'] as const)results.push(game(seed+i,team,candidate,baseline));
  if(results.at(-1)!.deal!==results.at(-2)!.deal)throw Error('V3_PAIRED_DEAL');
  if(i%25===24)console.error(`gameplay: ${i+1}/${pairs} pairs`);
 }
 const summarize=(xs:typeof results)=>{
  const values=[];for(let i=0;i<xs.length;i+=2)if(xs[i+1])values.push((Number(xs[i].won)+Number(xs[i+1].won))/2);
  const latency=xs.flatMap(r=>r.latencies).sort((a,b)=>a-b),sum=(f:(r:typeof results[number])=>number)=>xs.reduce((n,r)=>n+f(r),0),partnership=Object.fromEntries(Object.keys(xs[0]?.partnership??{}).map(k=>[k,sum(r=>r.partnership[k as keyof typeof r.partnership])])),trump=Object.fromEntries(['known','used','highUsed'].map(k=>[k,sum(r=>r.trump[k as keyof typeof r.trump])]));
  return {games:xs.length,pairs:values.length,wins:xs.filter(r=>r.won===true).length,losses:xs.filter(r=>r.won===false).length,ties:xs.filter(r=>r.won===null).length,winRate:xs.length?sum(r=>Number(r.won))/xs.length:null,paired95CI:pairedBootstrap(values,seed),invalid:sum(r=>r.invalid),meanScore:xs.length?sum(r=>r.score)/xs.length:null,meanTrickDifferential:xs.length?sum(r=>r.trickDifferential)/xs.length:null,latency:{decisions:latency.length,meanMs:latency.length?latency.reduce((a,b)=>a+b,0)/latency.length:null,p95Ms:latency[Math.ceil(latency.length*.95)-1]??null},partnership,trump};
 };
 return {seed,pairs,milliseconds:performance.now()-started,summary:summarize(results),byMode:Object.fromEntries(['CLOSE_TRUMP','OPEN_TRUMP','BWINJI'].map(m=>[m,summarize(results.filter(r=>r.mode===m))])),note:'Paired initial deals and both team assignments; CI bootstraps complete seed pairs. Outcomes after overtake/conserve are observational, not causal. Games are complete deals, not matches. Forced reveal/accept handling is shared.',results:results.map(r=>({...r,latencies:undefined}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const a=process.argv.slice(2),get=(k:string,d:string)=>a.includes(k)?a[a.indexOf(k)+1]:d,policy=(s:string):PlayerPolicy=>['weak8','selective32','selective64','heuristic'].includes(s)?s as Teacher|'heuristic':loadPolicy(s),candidate=get('--candidate','benchmarks/v3-first-training/checkpoint.json'),baseline=get('--baseline','weak8'),report={candidate,baseline,...compare(Number(get('--seed','9300000')),Number(get('--pairs','100')),policy(candidate),policy(baseline))};
 writeFileSync(get('--output','gameplay.local.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({...report,results:undefined},null,2));
}
