import {ActorObservation} from '../simulation/observation';
import {suit,value,Play} from '../simulation/CompactState';
import {winningPlay} from '../simulation/FastSimulator';
/** Soft uniform-marginal forecast, never a sampled opponent-hand oracle. */
export interface ControlSummary {higher:Uint8Array;counts:Uint8Array;voids:number[];}
export function controlSummary(o:ActorObservation):ControlSummary {
 const seen=o.knowledge?.seen.slice()??new Uint8Array(52),counts=new Uint8Array(4),higher=new Uint8Array(60),voids=o.knowledge?.voids.slice()??[0,0,0,0];
 for(const cards of o.knownHands??[])for(const c of cards??[])seen[c]=1;
 for(const c of o.hand)seen[c]=1;if(o.actor===o.caller&&o.locked>=0)seen[o.locked]=1;
 let trick=-1,lead=-1;
 for(const p of o.knowledge?[]:[...o.history,...o.plays]){
  if(p.trick!==trick){trick=p.trick;lead=p.card>=0?suit(p.card):-1;}
  if(p.card<0)continue;seen[p.card]=1;
  if(lead>=0&&suit(p.card)!==lead&&!(p.seat===o.caller&&o.lockedPlaced&&(!p.revealed||o.trump===lead)))voids[p.seat]|=1<<lead;
 }
 for(let c=0;c<52;c++)if(!seen[c]){counts[suit(c)]++;for(let power=2;power<value(c);power++)higher[suit(c)*15+power]++;}
 return {higher,counts,voids};
}
function present(total:number,hits:number,count:number):number {
 if(hits<=0||count<=0||total<=0)return 0;let miss=1;
 for(let i=0;i<Math.min(count,total);i++)miss*=Math.max(0,total-hits-i)/(total-i);return 1-miss;
}
export function controlRank(o:ActorObservation,legal:number[],safeProbability=.75):{card:number;hold:number;streak:boolean}[]{
 if(!legal.length)throw new Error('V2_NO_ROLLOUT_ACTION');
 const summary=controlSummary(o),visible=o.plays.filter(p=>p.card>=0),before=visible.length?winningPlay(visible,o.lead,o.trump):null;
 const played=new Set(o.plays.map(p=>p.seat));played.add(o.actor);
 const remaining=o.teams.map((_,i)=>i).filter(i=>!played.has(i));
 const threat=(seat:number,winner:Play,lead:number):number=>{
  const known=o.knownHands?.[seat]??[],mask=summary.voids[seat];let total=0;
  for(let s=0;s<4;s++)if(!(mask&(1<<s)))total+=summary.counts[s];
  const held=Math.max(0,o.counts[seat]-Number(seat===o.caller&&o.lockedPlaced&&!o.revealed));
  const following=known.filter(c=>suit(c)===lead),power=winner.aceDown?2:value(winner.card),winSuit=suit(winner.card);
  const beats=(c:number)=>winningPlay([winner,{seat,card:c,hidden:false,aceDown:false,revealed:o.revealed,trick:o.trick}],lead,o.trump).seat===seat;
  if(known.length===held)return Number((following.length?following:known).some(beats));
  const unknown=Math.max(0,held-known.length),suitCount=(s:number)=>s>=0&&!(mask&(1<<s))?summary.counts[s]:0;
  const higher=(s:number,p:number)=>s>=0&&!(mask&(1<<s))?summary.higher[s*15+p]:0;
  const voidLead=following.length?0:1-present(total,suitCount(lead),unknown);
  const knownTrump=known.some(c=>suit(c)===o.trump&&beats(c));
  if(winSuit===o.trump)return (lead===o.trump?1:voidLead)*(knownTrump?1:present(total,higher(o.trump,power),unknown));
  const follow=following.some(beats)?1:present(total,higher(lead,power),unknown),ruff=o.trump>=0?voidLead*(knownTrump?1:present(total,suitCount(o.trump),unknown)):0;
  return Math.min(1,follow+ruff);
 };
 const canFinishStreak=o.revealed&&o.trick>1&&o.trick<13&&o.callerTeam!==o.team&&o.streakSeat===o.actor&&o.streak>=1;
 const ranks=legal.map(card=>{
  const lead=o.plays.length?o.lead:suit(card),aceDown=!o.plays.length&&o.trick>1&&o.lastWinner===o.actor&&o.lastCard>=0&&value(o.lastCard)===14&&value(card)===14;
  const candidate:Play={seat:o.actor,card,hidden:false,aceDown,revealed:o.revealed,trick:o.trick};
  const winner=before?winningPlay([...visible,candidate],lead,o.trump):candidate;
  const winnerTeam=o.teams[winner.seat];
  let hold=winnerTeam===o.team?remaining.filter(p=>o.teams[p]!==o.team).reduce((v,p)=>v*(1-threat(p,winner,lead)),1)
   :1-remaining.filter(p=>o.teams[p]===o.team).reduce((v,p)=>v*(1-threat(p,winner,lead)),1);
  const partner=remaining.find(p=>o.teams[p]===o.team),knownPartner=partner===undefined?null:o.knownHands?.[partner];
  if(partner!==undefined&&knownPartner){
   const following=knownPartner.filter(c=>suit(c)===lead),canRuff=knownPartner.length===o.counts[partner]||Boolean(summary.voids[partner]&(1<<lead));
   for(const rescue of following.length?following:canRuff?knownPartner:[]){
    const p:Play={seat:partner,card:rescue,hidden:false,aceDown:false,revealed:o.revealed,trick:o.trick};
    if(winningPlay([winner,p],lead,o.trump).seat!==partner)continue;
    hold=Math.max(hold,remaining.filter(p=>o.teams[p]!==o.team).reduce((v,opp)=>v*(1-threat(opp,p,lead)),1));
   }
  }
  return {card,hold,streak:canFinishStreak&&winner.seat===o.actor};
 });
 return ranks.sort((a,b)=>{
  const as=a.streak&&a.hold>=safeProbability,bs=b.streak&&b.hold>=safeProbability;if(as!==bs)return Number(bs)-Number(as);
  if((o.trick===13||!(a.hold>=safeProbability&&b.hold>=safeProbability))&&a.hold!==b.hold)return b.hold-a.hold;
  const trump=o.trump>=0?o.trump:o.secretTrump;
  return Number(suit(a.card)===trump)-Number(suit(b.card)===trump)||value(a.card)-value(b.card)||a.card-b.card;
 });
}
export function controlRollout(o:ActorObservation,legal:number[],safeProbability=.75):number {return controlRank(o,legal,safeProbability)[0].card;}
