import {describe,it,expect} from 'vitest';
import {BundRungEngine} from '../server/engine/BundRungEngine';
import {CARDS,SUITS,indexOf} from '../server/ai/v2/simulation/CompactState';
import {publicControl} from '../server/ai/v3/evaluation/Coverage';
import {OBSERVATION_SCHEMA,type DecisionObservation} from '../server/ai/v3/data/Observation';
type FixturePlay={seat:number;id:string;down?:boolean};
// Isolated comparator fixtures only, not expert observations or training labels.
function observation(cards:FixturePlay[],trump:number|null=null,revealed=trump!==null):DecisionObservation {
 const lead=Math.floor(indexOf(cards[0].id)/13);
 return {schema:OBSERVATION_SCHEMA,teams:[0,1,0,1],partner:2,caller:0,dealer:3,counts:[4,4,4,4],ownCards:[],legal:[],history:cards.map(p=>({trick:2,seat:p.seat,card:indexOf(p.id),lead,aceDown:p.down??false,trumpRevealedAtPlay:revealed})),completedWinners:[],currentTrick:2,currentLead:lead,currentLength:cards.length,publicTrump:trump,trumpRevealed:revealed,lockedSlot:false,mode:'CLOSE_TRUMP',modifier:'STANDARD',score:0,streakSeat:null,streakCount:0,publicHands:[null,null,null,null],voids:[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],canRequestReveal:false,canShowTrump:false};
}
function officialWinner(o:DecisionObservation):number {
 const engine=new BundRungEngine();for(let i=0;i<4;i++)engine.addPlayer('p'+i,'Seat '+i);
 const state=engine as any;state.phase='TRICK_PLAYING';state.trumpCallerPlayerId='p0';state.isTrumpRevealed=o.trumpRevealed;state.trumpSuit=o.publicTrump===null?null:SUITS[o.publicTrump];
 state.currentTrick={trickNumber:2,leadPlayerId:'p'+o.history[0].seat,leadSuit:SUITS[o.currentLead!],cards:o.history.map(p=>({playerId:'p'+p.seat,card:CARDS[p.card!],playedAt:0,isAceDowngraded:p.aceDown,isFaceDown:false})),winnerPlayerId:null,winningTeam:null};
 // Compare against the actual authoritative loop, not another test-side formula.
 return Number(state.resolveTrick().trickWinner.id.slice(1));
}
const cases:{name:string;cards:FixturePlay[];trump?:number;revealed?:boolean;winner:number;control:string}[]=[
 {name:'lead-suit winner without trump / opponent',cards:[{seat:0,id:'D_3'},{seat:1,id:'D_K'},{seat:2,id:'C_A'},{seat:3,id:'D_7'}],winner:1,control:'opponent'},
 {name:'trump overtakes higher lead-suit card / partner',cards:[{seat:0,id:'D_A'},{seat:1,id:'D_K'},{seat:2,id:'H_2'},{seat:3,id:'D_Q'}],trump:0,winner:2,control:'partner'},
 {name:'lead suit is trump / acting player',cards:[{seat:0,id:'H_K'},{seat:1,id:'S_A'},{seat:2,id:'H_5'},{seat:3,id:'H_3'}],trump:0,winner:0,control:'self'},
 {name:'multiple trump cards',cards:[{seat:0,id:'D_A'},{seat:1,id:'H_2'},{seat:2,id:'H_Q'},{seat:3,id:'H_K'}],trump:0,winner:3,control:'opponent'},
 {name:'downgraded lead Ace has power two',cards:[{seat:0,id:'D_A',down:true},{seat:1,id:'D_3'},{seat:2,id:'D_4'},{seat:3,id:'S_A'}],winner:2,control:'partner'},
 {name:'equal effective value retains earlier card',cards:[{seat:0,id:'D_A',down:true},{seat:1,id:'D_2'},{seat:2,id:'S_K'},{seat:3,id:'C_A'}],winner:0,control:'self'},
 {name:'equal effective value when lead is trump',cards:[{seat:0,id:'H_A',down:true},{seat:1,id:'H_2'},{seat:2,id:'S_K'},{seat:3,id:'C_A'}],trump:0,winner:0,control:'self'},
 {name:'unrevealed trump has no superiority',cards:[{seat:0,id:'D_3'},{seat:1,id:'H_A'},{seat:2,id:'D_5'},{seat:3,id:'D_4'}],trump:0,revealed:false,winner:2,control:'partner'},
];
describe('public trick-control parity with official engine',()=>{
 for(const c of cases)it(c.name,()=>{const o=observation(c.cards,c.trump??null,c.revealed??c.trump!==undefined);expect(officialWinner(o)).toBe(c.winner);expect(publicControl(o)).toBe(c.control);});
 it('matches current control for each known prefix without mutating the observation',()=>{for(const c of cases)for(let length=1;length<=4;length++){const o=observation(c.cards.slice(0,length),c.trump??null,c.revealed??c.trump!==undefined),before=JSON.stringify(o),winner=officialWinner(o);expect(publicControl(o)).toBe(winner===2?'partner':winner===0?'self':'opponent');expect(JSON.stringify(o)).toBe(before);}});
 it('returns unknown for concealed card identity or unknown Ace downgrade',()=>{const o=observation(cases[0].cards);o.history[1].card=null;expect(publicControl(o)).toBe('unknown-or-leading');const a=observation(cases[4].cards);a.history[0].aceDown=null;expect(publicControl(a)).toBe('unknown-or-leading');});
 it('returns unknown for missing lead/trump/context rather than guessing',()=>{for(const edit of [(o:DecisionObservation)=>o.currentLead=null,(o:DecisionObservation)=>{o.trumpRevealed=true;o.publicTrump=null;},(o:DecisionObservation)=>o.currentLength++,(o:DecisionObservation)=>{o.history[0].card=99;},(o:DecisionObservation)=>{o.history[0].seat=5;},(o:DecisionObservation)=>{o.history[0].lead=2;o.currentLead=2;}]){const o=observation(cases[0].cards);edit(o);expect(publicControl(o)).toBe('unknown-or-leading');}});
 it('ignores hidden trump identities and unrelated private/debug metadata',()=>{const a=observation(cases[7].cards,0,false),b=structuredClone(a);b.publicTrump=3;Object.assign(b,{opponentHands:[[1,2,3]],secretTrumpSuit:'SPADES'});expect(publicControl(a)).toBe('partner');expect(publicControl(b)).toBe(publicControl(a));});
});
