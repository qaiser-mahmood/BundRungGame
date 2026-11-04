import {describe,it,expect} from 'vitest';
import {TeacherPolicy} from '../server/ai/v3/learning/TeacherPolicy';
import {generate} from '../scripts/v3-first-training';
describe('corrected V3 teacher training',()=>{
 it('rejects legacy inputs, empty masks and illegal labels; trains only legal outputs',()=>{
  const m=new TeacherPolicy(),x=new Array(629).fill(0),mask=new Array(52).fill(0);mask[51]=1;mask[3]=1;
  expect(()=>m.action(x.slice(0,519),mask)).toThrow();expect(()=>m.action(x,new Array(52).fill(0))).toThrow();expect(()=>m.step(x,mask,4,.1)).toThrow();
  for(let i=0;i<20;i++)m.step(x,mask,51,.1);
  expect(m.action(x,mask)).toBe(51);expect(m.probabilities(x,mask)[4]).toBe(0);
  expect(new TeacherPolicy(m.weights,m.bias).action(x,mask)).toBe(51);
 });
 it('generates reproducible 629-feature legal teacher labels with isolated deals',()=>{
  const a=generate(763300,[1,1,1],'0'.repeat(40)),b=generate(763300,[1,1,1],'0'.repeat(40));expect(a).toEqual(b);
  const splits=new Map<string,string>();for(const r of a){expect(r.x).toHaveLength(629);expect(r.mask[r.label]).toBe(1);expect(splits.get(r.deal)??r.split).toBe(r.split);splits.set(r.deal,r.split);}
  expect(new Set(a.map(r=>r.mode))).toEqual(new Set(['CLOSE_TRUMP','OPEN_TRUMP','BWINJI']));
 },60000);
});
