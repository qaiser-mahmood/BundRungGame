import type {PublicGameState,ScorecardState,Suit} from '../../../../shared/types';
import {ALL_52_CARDS} from '../../planning/CardTracker';
export const CARDS=ALL_52_CARDS;
export const SUITS:Suit[]=['HEARTS','DIAMONDS','CLUBS','SPADES'];
export const indexOf=(id:string):number=>CARDS.findIndex(c=>c.id===id);
export const suit=(c:number):number=>Math.floor(c/13);
export const value=(c:number):number=>c%13+2;
export interface Play {seat:number;card:number;hidden:boolean;aceDown:boolean;revealed:boolean;trick:number;}
export interface CompactState {
  source:PublicGameState;hands:Uint8Array[];actor:number;dealer:number;caller:number;locked:number;trump:number;revealed:boolean;
  phase:PublicGameState['phase'];trick:number;lead:number;leadSeat:number;plays:Play[];history:Play[];winners:number[];
  streakSeat:number;streak:number;lastWinner:number;lastCard:number;teamTricks:number[];teamStreak:number;lastTeam:number;
  pending:boolean;paused:boolean;requester:number;revealer:number;challenge:boolean;challengeSeat:number;votes:number[];
  accumulated:Play[];openModifier:PublicGameState['openTrumpModifier'];bwinjiModifier:PublicGameState['bwinjiModifier'];
  score:ScorecardState;winner:number;matchWinner:number;loser:number;
}
export function cloneState(s:CompactState):CompactState {
  return {...s,hands:s.hands.map(h=>h.slice()),plays:s.plays.slice(),history:s.history.slice(),winners:s.winners.slice(),
    teamTricks:s.teamTricks.slice(),votes:s.votes.slice(),accumulated:s.accumulated.slice()};
}
export const team=(s:CompactState,seat:number):number=>s.source.players[seat].team==='TEAM_1'?0:1;
