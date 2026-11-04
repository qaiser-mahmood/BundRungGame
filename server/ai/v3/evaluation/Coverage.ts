import type {DecisionObservation} from '../data/Observation';
import type {EvaluationBundle} from './Prepare';
import {winningPlay} from '../../v2/simulation/FastSimulator';
import {suit} from '../../v2/simulation/CompactState';
export function publicWinningPlay(o:DecisionObservation):{seat:number;card:number;effectivePower:number}|null{
 const plays=o.history.filter(p=>p.trick===o.currentTrick);
 // Do not guess from incomplete history, concealed identities or unknown Ace flags.
 // An unrevealed suit is ignored even if an invalid caller supplied that field.
 if(!plays.length||plays.length!==o.currentLength||plays.length>4||
    o.currentLead===null||!Number.isInteger(o.currentLead)||o.currentLead<0||o.currentLead>3||
    o.trumpRevealed&&(o.publicTrump===null||!Number.isInteger(o.publicTrump)||o.publicTrump<0||o.publicTrump>3)||
    plays.some(p=>p.card===null||!Number.isInteger(p.card)||p.card<0||p.card>=52||typeof p.aceDown!=='boolean'||!Number.isInteger(p.seat)||p.seat<0||p.seat>3)||
    new Set(plays.map(p=>p.card)).size!==plays.length||new Set(plays.map(p=>p.seat)).size!==plays.length||
    suit(plays[0].card!)!==o.currentLead||o.teams.length!==4||o.teams[0]!==0||
    o.teams.some(t=>t!==0&&t!==1)||!Number.isInteger(o.partner)||o.partner<1||o.partner>3||o.teams[o.partner]!==0)return null;
 // winningPlay is the existing compact equivalent of BundRungEngine.resolveTrick:
 // lead-suit filtering, revealed trump priority, effective Ace power and strict >
 // comparisons (earlier play retains equal power). It only reads card/seat/aceDown.
 const winner=winningPlay(plays.map(p=>({seat:p.seat,card:p.card!,aceDown:p.aceDown!,hidden:false,
  revealed:p.trumpRevealedAtPlay??false,trick:p.trick})),o.currentLead,o.trumpRevealed?o.publicTrump!:-1);
 return {seat:winner.seat,card:winner.card,effectivePower:winner.aceDown?2:winner.card%13+2};
}
export function publicControl(o:DecisionObservation):'unknown-or-leading'|'partner'|'self'|'opponent'{
 const winner=publicWinningPlay(o);return winner===null?'unknown-or-leading':winner.seat===o.partner?'partner':o.teams[winner.seat]===0?'self':'opponent';
}
export function collectionCoverage(bundle:EvaluationBundle){
 const counts:Record<string,number>={};const add=(k:string)=>counts[k]=(counts[k]??0)+1;
 for(const id of Object.keys(bundle.predictions)){const o=bundle.corpus.packets.find(p=>p.id===id)!.observation;
  add('phase:'+(o.currentTrick<=4?'early':o.currentTrick<=9?'middle':'late'));add('rung:'+(o.trumpRevealed?'revealed':'hidden'));add('position:'+(o.currentLength+1));add('call:'+bundle.context[id].callType);add('control:'+publicControl(o));
  if(o.voids.some(v=>v.some(Boolean)))add('public-void-evidence');if(o.history.some(p=>p.aceDown===true))add('public-ace-downgrade-history');
  if(o.trumpRevealed&&o.streakSeat!==null&&o.caller!==null&&o.streakCount===1&&o.teams[o.streakSeat]!==o.teams[o.caller])add('eligible-opponent-streak-context');
  if(bundle.context[id].revealOpportunitiesBeforeDecision)add('after-reveal-opportunity');
 }
 return {assigned:Object.keys(bundle.predictions).length,counts,description:'Descriptive observed collection coverage only; absent categories have zero cases. Not expert intention labels or passed strategy tests.'};
}
