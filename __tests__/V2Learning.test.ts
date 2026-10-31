import {describe,it,expect} from 'vitest';
import {readFileSync,writeFileSync,symlinkSync,rmSync,mkdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {setupGame,seededRandom} from '../scripts/ai-benchmark';
import {features,legalMask,FEATURE_SCHEMA} from '../server/ai/v2/learning/Features';
import {ExperimentalModel,Example} from '../server/ai/v2/learning/ExperimentalModel';
import {loadCheckpoint,saveCheckpoint,experimentRoot} from '../server/ai/v2/learning/Checkpoint';
function fixture(){const e=setupGame(2),s=e.getPublicState(),p=e.getPrivateState(s.currentTurnPlayerId!),cards=e.getLegalCardsForPlayer(p.myPlayerId),mask=legalMask(cards),visits=mask.map(v=>v/cards.length);
 return {e,s,p,cards,example:{schema:FEATURE_SCHEMA,features:features(s,p),mask,visits,reward:.1,seed:7} satisfies Example};}
describe('AI v2 isolated experimental policy/value learning',()=>{
 it('uses identical features after a real hidden-hand swap',()=>{
  const f=fixture(),others=f.s.players.filter(p=>p.id!==f.p.myPlayerId),h=f.e.getHands();[h[others[0].id][0],h[others[1].id][0]]=[h[others[1].id][0],h[others[0].id][0]];
  expect(features(f.e.getPublicState(),f.e.getPrivateState(f.p.myPlayerId))).toEqual(f.example.features);
 });
 it('learns masked visit targets and terminal values reproducibly',()=>{
  const f=fixture(),a=ExperimentalModel.create(7,seededRandom(7)),b=ExperimentalModel.create(7,seededRandom(7));
  expect(a.train([f.example],3)).toEqual(b.train([f.example],3));expect(a.weights).toEqual(b.weights);
  const pred=a.predict(f.example.features,f.example.mask);expect(pred.policy.reduce((x,y)=>x+y)).toBeCloseTo(1);expect(pred.policy.every((p,i)=>f.example.mask[i]||p===0)).toBe(true);
  expect(()=>a.train([{...f.example,reward:NaN}])).toThrow();expect(()=>a.train([{...f.example,visits:new Array(52).fill(1)}])).toThrow();
 });
 it('roundtrips, validates hash/schema, resumes and rejects canonical/symlink writes',()=>{
  const canonical='server/ai/models/bund_rung_brain.json',hash=()=>createHash('sha256').update(readFileSync(canonical)).digest('hex'),before=hash();
  const dir=experimentRoot()+'/'+randomUUID();mkdirSync(dir,{recursive:true});
  try{
   const f=fixture(),m=ExperimentalModel.create(7,seededRandom(7));m.train([f.example]);saveCheckpoint(dir+'/checkpoint.json',m);const loaded=loadCheckpoint(dir+'/checkpoint.json');expect(loaded.weights).toEqual(m.weights);
   loaded.train([f.example]);expect(loaded.weights.steps).toBe(2);expect(()=>saveCheckpoint(canonical,m)).toThrow('V2_EXPERIMENT_PATH_ONLY');
   const bad=JSON.parse(readFileSync(dir+'/checkpoint.json','utf8'));bad.weights.policy[0]+=1;writeFileSync(dir+'/bad.json',JSON.stringify(bad));expect(()=>loadCheckpoint(dir+'/bad.json')).toThrow('V2_CHECKPOINT_HASH');
   symlinkSync(process.cwd()+'/server/ai/models',dir+'/alias','dir');expect(()=>saveCheckpoint(dir+'/alias/bund_rung_brain.json',m)).toThrow('V2_SYMLINK_PATH');expect(hash()).toBe(before);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
});
