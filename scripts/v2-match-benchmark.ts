import {writeFileSync} from 'node:fs';
import {setupGame,seededRandom,withRandom,pairedBootstrap} from './ai-benchmark';
import {BotPlayer} from '../server/ai/BotPlayer';
import {advanceForced} from '../server/ai/planning/MonteCarloPlanner';
import type {TeamId} from '../shared/types';
const results=[];
console.log=(...x)=>console.error(...x);
for(let seed=15000;seed<15010;seed++)for(const candidateTeam of ['TEAM_1','TEAM_2'] as const){
 const e=setupGame(seed);let hands=1,decisions=0,setupSteps=0,error:string|null=null;
 try{
  for(let step=0;step<6000;step++){
   const s=e.getPublicState();if(s.phase==='MATCH_OVER')break;
   if(s.phase==='GAME_RESOLVED'){
    if(++hands>40)throw new Error('V2_MATCH_HAND_LIMIT');setupSteps=0;
    withRandom(seededRandom(seed+hands*999),()=>e.dealerDistributeNextGame(s.players[s.dealerPlayerIndex].id));continue;
   }
   if(s.phase!=='TRICK_PLAYING'){
    for(const p of s.players)withRandom(seededRandom(seed+hands*999+setupSteps++),()=>BotPlayer.handleBotTurn(e,p.id,{roomId:'match-setup',learning:false,policy:{name:'heuristic'}}));continue;
   }
   if(advanceForced(e))continue;
   const id=s.currentTurnPlayerId!,name=s.players.find(p=>p.id===id)!.team===candidateTeam?'ai-v2-ismcts':'corrected-search';
   const random=seededRandom(seed^++decisions);
   BotPlayer.handleBotTurn(e,id,{roomId:`match:${seed}:${candidateTeam}`,learning:false,policy:{name,search:{timeMs:Infinity,random},v2:{random}}});
  }
  if(e.getPhase()!=='MATCH_OVER')throw new Error('V2_MATCH_STEP_LIMIT');
 }catch(err){error=err instanceof Error?err.message:String(err);}
 const final=e.getPublicState(),winner=final.matchWinnerTeam;
 const score=final.scorecard.history.reduce((sum,entry)=>sum+entry.scoreAdjustment*(entry.dealerTeam===candidateTeam?-1:1),0);
 results.push({seed,candidateTeam,hands,decisions,winner,candidateWon:winner?winner===candidateTeam:null,score,error});
}
const rates:number[]=[];for(let i=0;i<results.length;i+=2)if(results[i].candidateWon!==null&&results[i+1].candidateWon!==null)rates.push((Number(results[i].candidateWon)+Number(results[i+1].candidateWon))/2);
const report={schemaVersion:1,method:'Ten paired complete matches. Identical initial seeded deal; subsequent dealers and positions legitimately diverge. Exploratory, separate from paired-hand evidence.',seed:15000,pairs:10,
 summary:{wins:results.filter(r=>r.candidateWon).length,losses:results.filter(r=>r.candidateWon===false).length,ci:pairedBootstrap(rates,15000),aborted:results.filter(r=>r.error).length,hands:results.reduce((n,r)=>n+r.hands,0)},results};
writeFileSync('/tmp/v2-matches.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});process.stdout.write(JSON.stringify(report.summary)+'\n');if(report.summary.aborted)process.exitCode=1;
