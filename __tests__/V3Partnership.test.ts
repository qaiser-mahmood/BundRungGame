import {describe,it,expect} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MLPPolicy} from '../server/ai/v3/learning/MLPPolicy';
import {setupExperiment,collectDeal,publicTags} from '../scripts/v3-partnership-common';
import {generateDataset,readDataset,validateRows} from '../scripts/v3-partnership-data';
import {observePlayerDecision,vectorize} from '../server/ai/v3/data/Observation';
import {compare,game} from '../scripts/v3-partnership-games';
describe('nonlinear partnership experiment integrity',()=>{
 it('pairs identical engine deals and rejects illegal inference instead of falling back',()=>{
  const result=compare(9300000,1,'heuristic','heuristic');expect(result.results[0].deal).toBe(result.results[1].deal);expect(result.summary.wins).toBe(1);expect(result.summary.losses).toBe(1);expect(result.summary.invalid).toBe(0);
  expect(()=>compare(0,0,'heuristic','heuristic')).toThrow();expect(()=>game(9300000,'TEAM_1',{action:()=>52,probabilities:()=>[]},'heuristic')).toThrow('V3_GAME_ILLEGAL');
 });
 it('requires exact nonlinear shapes and versioned trained weights; masks every output',()=>{
  const sizes=[629,256,128,52],layers=sizes.slice(0,-1).map((inputs,i)=>({inputs,outputs:sizes[i+1],weights:new Array(inputs*sizes[i+1]).fill(0),bias:new Array(sizes[i+1]).fill(0)}));
  layers[2].bias[51]=10;const model=new MLPPolicy(layers),x=new Array(629).fill(0),mask=new Array(52).fill(0);mask[3]=1;
  expect(model.action(x,mask)).toBe(3);expect(model.probabilities(x,mask)[51]).toBe(0);
  expect(()=>model.action(x.slice(0,519),mask)).toThrow();expect(()=>model.action(x,new Array(52).fill(0))).toThrow();
  expect(()=>new MLPPolicy([{...layers[0],inputs:519},...layers.slice(1)])).toThrow();
  const path=join(mkdtempSync(join(tmpdir(),'v3-mlp-')),'model.json');
  try {writeFileSync(path,JSON.stringify({schema:'bundrung-v3-mlp/v1',featureSchema:'bundrung-v3-player-features/v2',inputs:629,outputs:52,activation:'relu',bestEpoch:1,layers}));expect(MLPPolicy.load(path).action(x,mask)).toBe(3);writeFileSync(path,'{"schema":"bundrung-v3-mlp/v1","layers":[]}');expect(()=>MLPPolicy.load(path)).toThrow();}finally{rmSync(join(path,'..'),{recursive:true,force:true});}
 });
 it('uses identical balanced legal setup seeds and actor-only features/tags',()=>{
  for(const seed of [1500300,1500301,1500302]){
   const engine=setupExperiment(seed),s=engine.getPublicState(),p=engine.getPrivateState(s.currentTurnPlayerId!),legal=engine.getLegalCardsForPlayer(p.myPlayerId),o=observePlayerDecision(s,p),tags=publicTags(s,p,legal);
   expect(vectorize(o)).toHaveLength(629);expect(o.caller===0?o.callerPrivate!==null:o.callerPrivate===null).toBe(true);
   const decorated={...s,opponentHands:{p0:['SECRET']},futureDeck:['SECRET']};expect(vectorize(observePlayerDecision(decorated,p))).toEqual(vectorize(o));expect(publicTags(decorated,p,legal)).toEqual(tags);
  }
  expect(collectDeal(1500300,'train','weak8')).toEqual(collectDeal(1500300,'train','weak8'));
 });
 it('resumes complete immutable deal shards and rejects split/label/tamper errors',()=>{
  const dir=mkdtempSync(join(tmpdir(),'v3-partnership-'));
  try {
   const a=generateDataset(dir,1600200,[1,1,1],'weak8'),before=readFileSync(join(dir,'train-1600200.json'),'utf8'),b=generateDataset(dir,1600200,[2,1,1],'weak8');expect(a.generated).toBe(3);expect(b.resumed).toBe(3);expect(b.generated).toBe(1);expect(readFileSync(join(dir,'train-1600200.json'),'utf8')).toBe(before);
   const {rows}=readDataset(dir);expect(()=>validateRows([...rows,{...rows[0],split:'holdout'}])).toThrow();expect(()=>validateRows([{...rows[0],label:52}])).toThrow();expect(()=>generateDataset(dir,1600200,[2,1,1],'selective32')).toThrow();
   const file=join(dir,'train-1600200.json'),data=JSON.parse(readFileSync(file,'utf8'));data.rows[0].x[0]=9;writeFileSync(file,JSON.stringify(data));expect(()=>readDataset(dir)).toThrow();
   const finalDir=join(dir,'holdout-only');generateDataset(finalDir,2600300,[0,0,1],'weak8');expect(readDataset(finalDir).rows.every(r=>r.split==='holdout')).toBe(true);
  }finally{rmSync(dir,{recursive:true,force:true});}
 },60000);
});
