import {describe,it,expect} from 'vitest';
import {runParity,oracleWorld,compare,applyAuthoritative} from '../scripts/v2-parity';
import {setupGame} from '../scripts/ai-benchmark';
import {ScoringEngine} from '../server/engine/ScoringEngine';
import {fromObservation} from '../server/ai/v2/simulation/adapters';
import {CARDS,indexOf,cloneState} from '../server/ai/v2/simulation/CompactState';
import {terminalUtility} from '../server/ai/planning/MonteCarloPlanner';
import {Action,apply,utility} from '../server/ai/v2/simulation/FastSimulator';
function fixture(challenge=false,mode:'OPEN_TRUMP'|'BWINJI'='OPEN_TRUMP',score=0){
 const e=setupGame(2),p=e.getPlayers();p.forEach((x,i)=>x.team=i%2?'TEAM_2':'TEAM_1');
 const c=(id:string)=>CARDS[indexOf(id)],hands={p0:[c('S_A'),c('D_A')],p1:[c('S_3'),c('D_2')],p2:[c('S_4'),c('D_3')],p3:[c('S_5'),c('D_4')]};
 Object.assign(e,{hands,phase:'TRICK_PLAYING',currentTurnPlayerIndex:0,trumpCallerPlayerId:'p0',trumpCard:null,chosenTrumpCard:null,
  trumpSuit:'HEARTS',isTrumpRevealed:!challenge,trumpMode:mode,openTrumpModifier:challenge?'FACE_DOWN_PLAY':'FACE_UP',bwinjiModifier:mode==='BWINJI'?'FACE_DOWN_PLAY':null,
  completedTricks:[],previousTrickCards:null,faceDownCallerCards:[],isRungRevealPaused:false,isTrumpRevealPending:false,trumpRevealRequesterId:null,rungRevealerPlayerId:null,
  lastTrickWinnerPlayerId:'p0',lastTrickWinningCard:c('H_A'),playerConsecutiveTricksCount:1,playerConsecutiveTricksWinnerId:'p0',
  currentTrick:{trickNumber:12,leadPlayerId:'p0',leadSuit:challenge?'HEARTS':null,cards:challenge?[{playerId:'p0',card:c('H_K'),playedAt:0,isFaceDown:true}]:[],winnerPlayerId:null,winningTeam:null},
  faceDownLeadPending:challenge,faceDownLeadPlayerId:challenge?'p0':null,faceDownLeadCard:challenge?c('H_K'):null,faceDownLeadCardFaceDown:challenge,faceDownChallengeVotes:new Map(),
  scoringEngine:new ScoringEngine({...e.getPublicState().scorecard,dealerScore:score})});
 p.forEach(x=>x.cardsInHandCount=hands[x.id as keyof typeof hands].length);return e;
}
describe('AI v2 authoritative rule parity gate',()=>{
 it('matches at least ten thousand reachable transitions and mid-trick reconstructions',()=>{
  const report=runParity(400);expect(report.transitions).toBeGreaterThanOrEqual(10000);expect(report.terminals).toBe(400);expect(report.reveals).toBeGreaterThan(0);expect(report.midTrick).toBeGreaterThan(100);
 },20000);
 for(const mode of ['OPEN_TRUMP','BWINJI'] as const)for(const accept of [true,false])it(`${mode} challenge ${accept?'accept':'surrender'} preserves scoring and vote transitions`,()=>{
  const e=fixture(true,mode,99),s=fromObservation(e.getPublicState(),oracleWorld(e));
  for(const seat of [1,3]){const a:Action={type:'challenge',seat,accept};applyAuthoritative(e,a);apply(s,a);compare(e,s);}
 });
 it('matches KHOTI terminal utility without replacing the scoring matrix',()=>{
  const e=fixture(false,'BWINJI',-99),s=fromObservation(e.getPublicState(),oracleWorld(e));
  for(const id of ['S_A','S_3','S_4','S_5','D_4','D_A','D_2','D_3']){const a:Action={type:'play',card:indexOf(id)};applyAuthoritative(e,a);apply(s,a);compare(e,s);}
  expect(s.phase).toBe('MATCH_OVER');expect(utility(s,0)).toBe(terminalUtility(e.getPublicState(),e.getPlayers()[0].id));
 });
 it('matches downgraded Ace, individual streak and final-trick terminal score',()=>{
  const e=fixture(),s=fromObservation(e.getPublicState(),oracleWorld(e)),copy=cloneState(s);
  for(const id of ['S_A','S_3','S_4','S_5','D_4','D_A','D_2','D_3']){const a:Action={type:'play',card:indexOf(id)};applyAuthoritative(e,a);apply(s,a);compare(e,s);}
  expect(s.phase).not.toBe('TRICK_PLAYING');expect(Number.isFinite(utility(s,0))).toBe(true);expect(copy.hands[0].length).toBe(2);expect(copy.plays.length).toBe(0);
 });
});
