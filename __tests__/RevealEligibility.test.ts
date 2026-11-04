import {describe,it,expect} from 'vitest';
import {BundRungEngine} from '../server/engine/BundRungEngine';
import type {Card,Suit} from '../shared/types';
function card(suit:Suit,rank:string,value:number):Card{return {id:suit[0]+'_'+rank,suit,rank:rank as Card['rank'],playValue:value,tossValue:value};}
function fixture(){const e=new BundRungEngine();for(let i=0;i<4;i++)e.addPlayer('p'+i,'Seat '+i);const s=e as any;
 s.phase='TRICK_PLAYING';s.trumpCallerPlayerId='p0';s.currentTurnPlayerIndex=1;s.trumpSuit='SPADES';s.trumpCard=card('SPADES','A',14);
 s.currentTrick={trickNumber:2,leadPlayerId:'p0',leadSuit:'HEARTS',cards:[{playerId:'p0',card:card('HEARTS','2',2),playedAt:0}],winnerPlayerId:null,winningTeam:null};
 s.hands.p1=[card('SPADES','3',3),card('CLUBS','4',4)];return {e,s};}
describe('authoritative reveal eligibility',()=>{
 const cases:[string,(s:any)=>void,string][]=[['wrong turn',s=>s.currentTurnPlayerIndex=3,'p1'],['still has lead suit',s=>s.hands.p1.push(card('HEARTS','3',3)),'p1'],['missing lead',s=>s.currentTrick.leadSuit=null,'p1'],['caller',s=>s.currentTurnPlayerIndex=0,'p0'],['caller teammate',s=>s.currentTurnPlayerIndex=2,'p2'],['revealed',s=>s.isTrumpRevealed=true,'p1'],['pending',s=>s.isTrumpRevealPending=true,'p1'],['paused',s=>s.isRungRevealPaused=true,'p1'],['invalid phase',s=>s.phase='BIDDING_PHASE','p1'],['unknown identity',()=>{},'fake'],['missing caller',s=>s.trumpCallerPlayerId=null,'p1']];
 for(const [name,change,id] of cases)it('rejects '+name+' without mutating state',()=>{const {e,s}=fixture();change(s);const before=JSON.stringify(e.getPublicState());expect(()=>e.requestTrumpReveal(id)).toThrow();expect(JSON.stringify(e.getPublicState())).toBe(before);});
 it('permits valid request, requires caller show, and enforces revealer trump obligation',()=>{const {e,s}=fixture();expect(e.getRevealPermissions('p1').canRequestRungReveal).toBe(true);e.requestTrumpReveal('p1');expect(()=>e.showTrumpCard('p1')).toThrow();expect(()=>e.requestTrumpReveal('p3')).toThrow();e.showTrumpCard('p0');expect(e.getPublicState().isTrumpRevealed).toBe(true);expect(e.getLegalCardsForPlayer('p1').map(c=>c.id)).toEqual(['S_3']);expect(()=>e.showTrumpCard('p0')).toThrow();expect(s.trumpCard.id).toBe('S_A');});
 it('preserves locked-card availability and mandatory following after reveal',()=>{const {e,s}=fixture();s.currentTurnPlayerIndex=0;s.trumpCard=card('HEARTS','A',14);s.hands.p0=[card('CLUBS','3',3)];expect(e.getLegalCardsForPlayer('p0').map(c=>c.id)).toEqual(['C_3']);s.isTrumpRevealed=true;expect(e.getLegalCardsForPlayer('p0').map(c=>c.id)).toEqual(['H_A']);s.isTrumpRevealed=false;s.hands.p0=[];expect(e.getLegalCardsForPlayer('p0').map(c=>c.id)).toEqual(['H_A']);});
 it('does not allow showing before request or by noncaller',()=>{const {e}=fixture();expect(()=>e.showTrumpCard('p0')).toThrow();expect(()=>e.showTrumpCard('fake')).toThrow();});
});
