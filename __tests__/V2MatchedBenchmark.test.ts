import {describe,it,expect} from 'vitest';
import {runGame} from '../scripts/ai-benchmark';
describe('matched-budget rollout ablations',()=>{
 it('supports distinct team configurations with the same policy name and preserves equivalent deals',()=>{
  const control={iterations:8,rollout:'control' as const},legacy={iterations:8,rollout:'legacy' as const};
  const a=runGame(34000,'TEAM_1','ai-v2-ismcts','ai-v2-ismcts',{timeMs:Infinity},{},control,legacy);
  const b=runGame(34000,'TEAM_2','ai-v2-ismcts','ai-v2-ismcts',{timeMs:Infinity},{},control,legacy);
  expect(a.dealHash).toBe(b.dealHash);expect(a.invalidMoves+b.invalidMoves).toBe(0);expect(a.error).toBeNull();expect(b.error).toBeNull();
  expect(a.candidatePlayerIds).toEqual(['p0','p2']);expect(b.candidatePlayerIds).toEqual(['p1','p3']);
  for(const g of [a,b])expect(g.decisions.filter(d=>g.candidatePlayerIds.includes(d.playerId)).length).toBe(g.decisions.length/2);
 });
});
