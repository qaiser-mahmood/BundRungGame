import {BundRungEngine} from '../server/engine/BundRungEngine';
import {BotPlayer} from '../server/ai/BotPlayer';
import {advanceForced} from '../server/ai/planning/MonteCarloPlanner';
import {rankPartnershipActions} from '../server/ai/planning/PartnershipStrategy';
import {decideV2,v2Stats} from '../server/ai/v2/strategy/DecisionController';
import {seededRandom,withRandom} from './ai-benchmark';
import {initialDealKey} from '../server/ai/v3/data/Corpus';
import {observePlayerDecision,vectorize,legalMask} from '../server/ai/v3/data/Observation';
import {indexOf} from '../server/ai/v2/simulation/CompactState';
import type {Card,PublicGameState,PrivatePlayerState} from '../shared/types';
import type {Split} from '../server/ai/v3/data/Corpus';
export type Teacher='weak8'|'selective32'|'selective64';
export const MODES=['CLOSE_TRUMP','OPEN_TRUMP','BWINJI'] as const;
export const GENERATOR_VERSION='partnership-synthetic/v1';
export function setupExperiment(seed:number){
 return withRandom(seededRandom(seed),()=>{
  const random=seededRandom(seed^0xb1d),engine=new BundRungEngine();for(let i=0;i<4;i++)engine.addPlayer(`p${i}`,`Seat ${i}`,true);
  engine.assignTeams(['p0','p2'],['p1','p3']);engine.startInitialToss();const mode=MODES[seed%3];let selected=false;
  for(let step=0;step<200;step++){
   const s=engine.getPublicState();
   if(s.phase==='TRICK_PLAYING'){
    if(mode==='OPEN_TRUMP'){const id=s.currentTurnPlayerId!,hand=engine.getPrivateState(id).myHand,c=hand[Math.floor(random()*hand.length)];engine.declareOpenRung(id,c.suit,c.id,false);}
    if(engine.getPublicState().trumpMode!==mode)throw Error('V3_MODE_SETUP');return engine;
   }
   if(s.phase==='TOSS_COMPLETE')engine.dealerDistributeCards(s.players[s.dealerPlayerIndex].id);
   else if(s.phase==='BIDDING_PHASE'){
    const id=s.biddingTurnPlayerId!,hand=engine.getPrivateState(id).myHand;
    if(selected)engine.submitBid(id,'PASS');
    else if(s.biddingPassCount<(Math.floor(seed/3)%4))engine.submitBid(id,'PASS');
    else {const c=hand[Math.floor(random()*hand.length)];engine.submitBid(id,mode==='BWINJI'?'BWINJI':'SELECT_CARD_TRUMP',mode==='BWINJI'?c.suit:c.id);selected=true;}
   }else for(const p of s.players){if(['TRICK_PLAYING','BIDDING_PHASE'].includes(engine.getPhase()))break;BotPlayer.handleBotTurn(engine,p.id,{roomId:'v3-partnership-setup',policy:{name:'heuristic'}});}
  }
  throw Error('V3_SETUP_LIMIT');
 });
}
export function publicTags(s:PublicGameState,p:PrivatePlayerState,legal:Card[]){
 const id=p.myPlayerId,trump=s.isTrumpRevealed?s.trumpSuit:null,before=BotPlayer.evaluateCurrentTrick(s.currentTrick,trump,id,s.players);
 const overtakes=legal.filter(c=>{
  const aceDown=s.currentTrick.cards.length===0&&c.rank==='A'&&s.lastTrickWinnerPlayerId===id&&s.lastTrickWinningCard?.rank==='A';
  return BotPlayer.evaluateCurrentTrick({...s.currentTrick,leadSuit:s.currentTrick.leadSuit??c.suit,cards:[...s.currentTrick.cards,{playerId:id,card:c,playedAt:0,isAceDowngraded:aceDown}]},trump,id,s.players).winningPlayer?.id===id;
 }).map(c=>indexOf(c.id));
 const ownTrump=p.secretTrumpSuit??(s.isTrumpRevealed?s.trumpSuit:null);
 return {partnerWinning:before.isPartnerWinning,overtakes,trumpCards:ownTrump?legal.filter(c=>c.suit===ownTrump).map(c=>indexOf(c.id)):[],trumpKnown:!!ownTrump,handHigh:p.myHand.filter(c=>c.playValue>=11).length,ownSuitCounts:['SPADES','HEARTS','DIAMONDS','CLUBS'].map(suit=>p.myHand.filter(c=>c.suit===suit).length)};
}
export function teacherCard(s:PublicGameState,p:PrivatePlayerState,legal:Card[],random:()=>number,teacher:Teacher){
 const ranks=legal.length>1?rankPartnershipActions(s,p,legal):[],partner=BotPlayer.evaluateCurrentTrick(s.currentTrick,s.isTrumpRevealed?s.trumpSuit:null,p.myPlayerId,s.players).isPartnerWinning;
 const difficult=legal.length>1&&(partner||!s.isTrumpRevealed&&legal.length>=3||Math.abs((ranks[0]?.holdProbability??0)-(ranks[1]?.holdProbability??0))<.15);
 const iterations=teacher==='weak8'?8:difficult?(teacher==='selective64'?64:32):8,particles=teacher==='weak8'?4:difficult?(teacher==='selective64'?16:8):4;
 const before={...v2Stats};let root:{cardId:string;visits:number;value:number}[]=[];
 const card=decideV2(s,p,legal,{}, {iterations,particles,random,timeMs:Infinity,exact:false,adaptive:teacher!=='weak8',rollout:'control',onResult:r=>{root=r.root;}});
 if(v2Stats.fallbacks!==before.fallbacks||v2Stats.invalidWorlds!==before.invalidWorlds||v2Stats.deadlineStops!==before.deadlineStops)throw Error('V3_TEACHER_DEGRADED');
 if(!legal.some(c=>c.id===card.id))throw Error('V3_TEACHER_ILLEGAL');
 return {card,iterations,particles,difficult,root};
}
export interface PartnershipRow {
 deal:string;split:Split;seed:number;x:number[];mask:number[];label:number;visits:number[];caller:boolean;revealed:boolean;mode:string;position:number;trick:number;
 partnerWinning:boolean;overtakes:number[];trumpCards:number[];trumpKnown:boolean;handHigh:number;ownSuitCounts:number[];iterations:number;particles:number;difficult:boolean;
}
export function collectDeal(seed:number,split:Split,teacher:Teacher){
 const engine=setupExperiment(seed),deal=initialDealKey(engine),rows:PartnershipRow[]=[],random=seededRandom(seed^0x7eac4);
 withRandom(random,()=>{
  for(let step=0;step<200&&engine.getPhase()==='TRICK_PLAYING';step++){
   if(advanceForced(engine))continue;
   const s=engine.getPublicState(),id=s.currentTurnPlayerId!,p=engine.getPrivateState(id),legal=engine.getLegalCardsForPlayer(id),o=observePlayerDecision(s,p),tags=publicTags(s,p,legal),t=teacherCard(s,p,legal,random,teacher),visits=new Array(52).fill(0);
   for(const r of t.root)visits[indexOf(r.cardId)]=r.visits;
   rows.push({deal,split,seed,x:vectorize(o),mask:legalMask(o),label:indexOf(t.card.id),visits,caller:o.caller===0,revealed:o.trumpRevealed,mode:o.mode,position:o.currentLength,trick:o.currentTrick,...tags,iterations:t.iterations,particles:t.particles,difficult:t.difficult});
   engine.playCard(id,t.card.id);
  }
 });
 if(!['GAME_RESOLVED','MATCH_OVER'].includes(engine.getPhase()))throw Error('V3_DEAL_INCOMPLETE');
 return {seed,split,deal,mode:engine.getPublicState().trumpMode,rows};
}
