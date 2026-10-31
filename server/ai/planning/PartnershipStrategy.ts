import type {Card,PrivatePlayerState,PublicGameState} from '../../../shared/types';
import {BotPlayer} from '../BotPlayer';
import {OpponentBeliefs} from './OpponentBeliefs';
export interface StrategyOptions {safePartnerProbability?:number;candidateLimit?:number;worlds?:number;}
export interface RankedAction {card:Card;holdProbability:number;reason:'protect-partner'|'contest'|'conserve'|'streak';}
/** Observation-only continuation: never receives the outer sampled world. */
export function rankPartnershipActions(state:PublicGameState,priv:PrivatePlayerState,legal:Card[],options:StrategyOptions={}):RankedAction[] {
  const beliefs=new OpponentBeliefs(state,priv),id=priv.myPlayerId;
  const team=state.players.find(p=>p.id===id)!.team;
  const trump=state.isTrumpRevealed?state.trumpSuit:null;
  const before=BotPlayer.evaluateCurrentTrick(state.currentTrick,trump,id,state.players);
  const played=new Set([...state.currentTrick.cards.map(c=>c.playerId),id]);
  const remaining=state.players.filter(p=>!played.has(p.id));
  const eligibleStreak=state.isTrumpRevealed&&state.currentTrick.trickNumber>1&&state.players.find(p=>p.id===state.trumpCallerPlayerId)?.team!==team&&state.streakWinnerPlayerId===id&&(state.streakCount??0)>=1;
  const results=legal.map(card=>{
    const downgraded=state.currentTrick.cards.length===0&&card.rank==='A'&&state.lastTrickWinnerPlayerId===id&&state.lastTrickWinningCard?.rank==='A';
    const trick={...state.currentTrick,leadSuit:state.currentTrick.leadSuit??card.suit,cards:[...state.currentTrick.cards,{playerId:id,card,playedAt:0,isAceDowngraded:downgraded}]};
    const after=BotPlayer.evaluateCurrentTrick(trick,trump,id,state.players);
    const winner=after.winningCard!,winningTeam=after.winningPlayer?.team;
    const value=winner.isAceDowngraded?2:winner.card.playValue;
    const threat=(pid:string)=>{
      const same=beliefs.probability(pid,c=>c.suit===winner.card.suit&&c.playValue>value);
      const ruff=trump&&winner.card.suit!==trump?beliefs.voidProbability(pid,trick.leadSuit!)*beliefs.probability(pid,c=>c.suit===trump):0;
      return Math.min(1,same+ruff);
    };
    // Independence approximation for remaining players; not a hard inference.
    let hold=winningTeam===team?remaining.filter(p=>p.team!==team).reduce((v,p)=>v*(1-threat(p.id)),1)
      :1-remaining.filter(p=>p.team===team).reduce((v,p)=>v*(1-threat(p.id)),1);
    // A legitimately disclosed partner hand can establish a rescue that a
    // current-winner-only forecast misses. This is still a rollout estimate;
    // ordering and hidden opponents are resolved by authoritative simulation.
    const partner=remaining.find(p=>p.team===team);
    const partnerHand=partner?beliefs.knownHand(partner.id):null;
    if(partnerHand){
      const following=partnerHand.filter(c=>c.suit===trick.leadSuit);
      for(const rescue of following.length?following:partnerHand){
        const projected=BotPlayer.evaluateCurrentTrick({...trick,cards:[...trick.cards,{playerId:partner!.id,card:rescue,playedAt:0}]},trump,id,state.players);
        if(projected.winningPlayer?.team!==team||projected.winningPlayer.id!==partner!.id)continue;
        const survival=remaining.filter(p=>p.team!==team).reduce((v,p)=>{
          const higher=beliefs.probability(p.id,c=>c.suit===rescue.suit&&c.playValue>rescue.playValue);
          const ruff=trump&&rescue.suit!==trump?beliefs.voidProbability(p.id,trick.leadSuit!)*beliefs.probability(p.id,c=>c.suit===trump):0;
          return v*(1-Math.min(1,higher+ruff));
        },1);
        hold=Math.max(hold,survival);
      }
    }
    return {card,holdProbability:hold,reason:(eligibleStreak&&after.winningPlayer?.id===id?'streak':before.isPartnerWinning?(after.isPartnerWinning?'protect-partner':'contest'):'contest') as RankedAction['reason']};
  });
  const threshold=options.safePartnerProbability??0.75;
  return results.sort((a,b)=>{
    const streakA=a.reason==='streak'&&a.holdProbability>=threshold,streakB=b.reason==='streak'&&b.holdProbability>=threshold;
    if(streakA!==streakB)return Number(streakB)-Number(streakA);
    // Within the configured safety band prefer conservation, otherwise defend.
    if(!(a.holdProbability>=threshold&&b.holdProbability>=threshold)&&a.holdProbability!==b.holdProbability)return b.holdProbability-a.holdProbability;
    const isTrump=(c:Card)=>Number(c.suit===(trump??priv.secretTrumpSuit));
    return isTrump(a.card)-isTrump(b.card)||a.card.playValue-b.card.playValue||a.card.id.localeCompare(b.card.id);
  });
}
