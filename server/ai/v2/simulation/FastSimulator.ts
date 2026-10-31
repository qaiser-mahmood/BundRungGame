import {ScoringEngine} from '../../../engine/ScoringEngine';
import {CompactState,Play,team,suit,value} from './CompactState';
export type Action={type:'play';card:number}|{type:'request'}|{type:'show'}|{type:'resume'}|{type:'challenge';seat:number;accept:boolean};
export function canRequest(s:CompactState,seat=s.actor):boolean {
  return s.phase==='TRICK_PLAYING'&&seat===s.actor&&!s.revealed&&!s.pending&&!s.paused&&s.lead>=0&&team(s,seat)!==team(s,s.caller)&&!s.hands[seat].some(c=>suit(c)===s.lead);
}
export function canShow(s:CompactState,seat:number):boolean{return s.phase==='TRICK_PLAYING'&&s.pending&&seat===s.caller&&!s.revealed&&!s.paused;}
export function legalCards(s:CompactState,seat=s.actor):number[]{
  if(s.phase!=='TRICK_PLAYING'||s.paused||s.pending||seat!==s.actor)return [];
  const hand=Array.from(s.hands[seat]);if(seat===s.caller&&s.locked>=0&&(s.revealed||!hand.length))hand.push(s.locked);
  if(!s.plays.length||s.lead<0)return hand;
  const follow=hand.filter(c=>suit(c)===s.lead);if(follow.length)return follow;
  if(!s.revealed&&team(s,seat)!==team(s,s.caller))return [];
  if(seat===s.revealer&&s.revealed&&s.trump>=0){const trumps=hand.filter(c=>suit(c)===s.trump);if(trumps.length)return trumps;}
  return hand;
}
export function forcedAction(s:CompactState):Action|null {
  if(s.phase!=='TRICK_PLAYING')return null;
  if(s.paused)return {type:'resume'};
  if(canShow(s,s.caller))return {type:'show'};
  if(s.challenge){const seat=s.source.players.findIndex((_,i)=>team(s,i)!==team(s,s.challengeSeat)&&s.votes[i]!==1);if(seat<0)throw new Error('V2_CHALLENGE_STATE');return {type:'challenge',seat,accept:true};}
  if(canRequest(s))return {type:'request'};return null;
}
export function winningPlay(plays:Play[],lead:number,trump:number):Play {
  let winner=plays[0],power=winner.aceDown?2:value(winner.card);
  for(const p of plays.slice(1)){const v=p.aceDown?2:value(p.card),wt=trump>=0&&suit(winner.card)===trump,ct=trump>=0&&suit(p.card)===trump;
    if(ct&&!wt||ct&&wt&&v>power||!ct&&!wt&&suit(p.card)===lead&&v>power){winner=p;power=v;}}
  return winner;
}
function finish(s:CompactState,winner:number,challenge=false):void {
  const result=new ScoringEngine(s.score).applyGameResult({gameIndex:s.source.gameIndex,dealerPlayerId:s.source.players[s.dealer].id,dealerTeam:s.source.players[s.dealer].team,
    trumpMode:s.source.trumpMode??(challenge?'OPEN_TRUMP':'CLOSE_TRUMP'),modifier:challenge?(s.source.trumpMode==='BWINJI'?s.bwinjiModifier:s.openModifier)??'FACE_DOWN_NO_PLAY':s.openModifier??s.bwinjiModifier??'STANDARD',
    colorChosenByTeam:s.source.players[s.caller].team,colorChosenByPlayerId:s.source.players[s.caller].id,winningTeam:winner===0?'TEAM_1':'TEAM_2'});
  s.score={dealerScore:result.newDealerScore,history:[...s.score.history,result.entry],
    team1CumulativeKhotiPoints:s.source.players[s.dealer].team==='TEAM_1'?result.newDealerScore:s.score.team1CumulativeKhotiPoints,
    team2CumulativeKhotiPoints:s.source.players[s.dealer].team==='TEAM_2'?result.newDealerScore:s.score.team2CumulativeKhotiPoints};
  s.winner=winner;s.phase=result.isKhoti?'MATCH_OVER':'GAME_RESOLVED';
  if(result.isKhoti){s.matchWinner=result.winningTeam==='TEAM_1'?0:1;s.loser=result.losingTeam==='TEAM_1'?0:1;}
  else if(result.dealerTransferred)s.dealer=(s.dealer+1)%4;
}
export function apply(s:CompactState,a:Action):void {
  if(s.phase!=='TRICK_PLAYING')throw new Error('V2_TERMINAL_ACTION');
  if(a.type==='resume'){if(s.paused){s.paused=false;s.accumulated=[];}return;}
  if(a.type==='request'){if(!canRequest(s))throw new Error('V2_ILLEGAL_REVEAL');s.pending=true;s.requester=s.actor;s.revealer=s.actor;return;}
  if(a.type==='show'){if(!canShow(s,s.caller))throw new Error('V2_ILLEGAL_SHOW');s.pending=false;s.revealed=true;s.accumulated=s.accumulated.map(p=>({...p,hidden:false}));s.plays=s.plays.map(p=>({...p,hidden:false}));return;}
  if(a.type==='challenge'){
    if(!s.challenge||team(s,a.seat)===team(s,s.challengeSeat))throw new Error('V2_ILLEGAL_CHALLENGE');
    s.votes[a.seat]=a.accept?1:-1;const defenders=s.source.players.map((_,i)=>i).filter(i=>team(s,i)!==team(s,s.challengeSeat));
    if(!defenders.every(i=>s.votes[i]===s.votes[a.seat]))return;
    s.challenge=false;s.votes.fill(0);if(s.source.trumpMode==='BWINJI')s.bwinjiModifier=a.accept?'FACE_DOWN_PLAY':'FACE_DOWN_NO_PLAY';else s.openModifier=a.accept?'FACE_DOWN_PLAY':'FACE_DOWN_NO_PLAY';
    if(a.accept){s.revealed=true;s.plays=s.plays.map(p=>({...p,hidden:false}));s.actor=(s.actor+1)%4;}
    else finish(s,team(s,s.challengeSeat),true);return;
  }
  if(!legalCards(s).includes(a.card))throw new Error('V2_ILLEGAL_CARD');
  const actor=s.actor;
  if(actor===s.caller&&a.card===s.locked){s.locked=-1;if(!s.revealed)s.revealed=true;}
  else s.hands[actor]=s.hands[actor].filter(c=>c!==a.card);
  if(actor===s.revealer||s.accumulated.some(p=>!p.hidden)){s.accumulated=[];s.revealer=-1;}
  if(!s.plays.length){s.lead=suit(a.card);s.leadSeat=actor;}
  const p:Play={seat:actor,card:a.card,hidden:!s.revealed&&actor===s.caller&&suit(a.card)!==s.lead,
    aceDown:!s.plays.length&&s.trick>1&&s.lastWinner===actor&&s.lastCard>=0&&value(s.lastCard)===14&&value(a.card)===14,revealed:s.revealed,trick:s.trick};
  if(p.hidden)s.accumulated.push(p);s.plays.push(p);
  if(s.plays.length<4){s.actor=(actor+1)%4;return;}
  const winning=winningPlay(s.plays,s.lead,s.revealed?s.trump:-1),t=team(s,winning.seat);
  s.lastWinner=winning.seat;s.lastCard=winning.card;s.teamTricks[t]++;s.teamStreak=s.lastTeam===t?s.teamStreak+1:1;s.lastTeam=t;
  if(!s.revealed||s.trick===1){s.streak=0;s.streakSeat=-1;}else{s.streak=s.streakSeat===winning.seat?s.streak+1:1;s.streakSeat=winning.seat;}
  s.history.push(...s.plays);s.winners.push(winning.seat);s.actor=winning.seat;
  if(s.revealed&&t!==team(s,s.caller)&&s.trick>=2&&s.streak>=2||s.trick===13){finish(s,t);return;}
  s.trick++;s.lead=-1;s.leadSeat=winning.seat;s.plays=[];
}
export function utility(s:CompactState,seat:number):number {
  if(s.phase!=='GAME_RESOLVED'&&s.phase!=='MATCH_OVER')throw new Error('V2_INCOMPLETE');
  const e=s.score.history.at(-1)!;const t=team(s,seat);
  return e.scoreAdjustment*((e.dealerTeam==='TEAM_1'?0:1)===t?-1:1)+(s.phase==='MATCH_OVER'?(s.matchWinner===t?1000:-1000):0);
}
