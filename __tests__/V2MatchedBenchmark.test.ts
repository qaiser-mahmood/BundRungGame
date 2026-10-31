import type {PublicGameState,PrivatePlayerState} from '../shared/types';
import {describe,it,expect} from 'vitest';
import {runGame} from '../scripts/ai-benchmark';
describe('matched-budget rollout ablations',()=>{
 it('supports distinct team configurations with the same policy name and preserves equivalent deals',()=>{
  const controlTeams:string[]=[],legacyTeams:string[]=[];
  const record=(list:string[])=>(_r:unknown,s:PublicGameState,p:PrivatePlayerState)=>{list.push(s.players.find(player=>player.id===p.myPlayerId)!.team);};
  const control={iterations:8,rollout:'control' as const,onResult:record(controlTeams)},legacy={iterations:8,rollout:'legacy' as const,onResult:record(legacyTeams)};
  const a=runGame(34000,'TEAM_1','ai-v2-ismcts','ai-v2-ismcts',{timeMs:Infinity},{},control,legacy);
  expect(new Set(controlTeams)).toEqual(new Set(['TEAM_1']));expect(new Set(legacyTeams)).toEqual(new Set(['TEAM_2']));controlTeams.length=0;legacyTeams.length=0;
  const b=runGame(34000,'TEAM_2','ai-v2-ismcts','ai-v2-ismcts',{timeMs:Infinity},{},control,legacy);
  expect(new Set(controlTeams)).toEqual(new Set(['TEAM_2']));expect(new Set(legacyTeams)).toEqual(new Set(['TEAM_1']));
  expect(a.dealHash).toBe(b.dealHash);expect(a.invalidMoves+b.invalidMoves).toBe(0);expect(a.error).toBeNull();expect(b.error).toBeNull();
  expect(a.candidatePlayerIds).toEqual(['p0','p2']);expect(b.candidatePlayerIds).toEqual(['p1','p3']);
  for(const g of [a,b])expect(g.decisions.filter(d=>g.candidatePlayerIds.includes(d.playerId)).length).toBe(g.decisions.length/2);
 });
});
