import {trainCLI} from '../scripts/v3-train-baseline';
import {generateCorpus} from '../server/ai/v3/data/Corpus';
import {writeBundle} from '../scripts/v3-expert-data';
import {mkdtempSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,it,expect} from 'vitest';
import {FEATURE_COUNT} from '../server/ai/v3/data/Observation';
import {LinearHead,calibrate,evaluate,emptyBaseline} from '../server/ai/v3/learning/LinearBaseline';
import {TrainingRow} from '../server/ai/v3/learning/Rows';
import {saveCheckpoint,loadCheckpoint,payload,experimentRoot} from '../server/ai/v3/learning/Checkpoint';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,symlinkSync,rmSync,readdirSync} from 'node:fs';
function artificialRows():TrainingRow[]{
 // Numerical software fixtures only; not expert demonstrations or model evidence.
 return [-1,1].map((v,i)=>{const x=new Array(FEATURE_COUNT).fill(0);x[0]=v;x[FEATURE_COUNT-1]=1;return {head:'returnSuit',features:x,mask:[1,1,1,1,1],target:Array.from({length:5},(_,j)=>Number(j===i)),weight:1,dealKey:'unit-'+i,packetId:'unit-'+i,coverage:'complete'};});
}
describe('V3 offline baseline training scaffolding, not trained expert models',()=>{
 it('fits a deterministic regularized numeric baseline and masks unavailable actions',()=>{
  const rows=artificialRows(),a=new LinearHead(5),b=new LinearHead(5),before=evaluate(a,rows)!.logLoss;a.fit(rows,80);b.fit(rows,80);
  expect(a.weights).toEqual(b.weights);expect(evaluate(a,rows)!.logLoss).toBeLessThan(before);const p=a.probabilities(rows[0].features,[1,0,1,0,0]);expect(p[1]).toBe(0);expect(p[3]).toBe(0);expect(p.reduce((x,y)=>x+y,0)).toBeCloseTo(1);
 });
 it('computes proper scores, calibrates on supplied validation and abstains without evidence',()=>{
  const h=new LinearHead(5),rows=artificialRows(),metrics=evaluate(h,rows)!;expect(metrics.brier).toBeCloseTo(.8);expect(metrics.logLoss).toBeCloseTo(Math.log(5));expect(metrics.ece).toBeCloseTo(.3);expect(h.predict(rows[0].features).abstain).toBe(true);
  h.fit(rows,20);calibrate(h,rows);expect([.5,1,2,4]).toContain(h.temperature);expect(()=>calibrate(h,[])).toThrow('V3_VALIDATION_LABELS_REQUIRED');
 });
 it('rejects invalid inputs and targets instead of fitting them',()=>{
  const h=new LinearHead(5),rows=artificialRows();expect(()=>h.probabilities(new Array(FEATURE_COUNT).fill(NaN))).toThrow();expect(()=>h.probabilities(rows[0].features,[0,0,0,0,0])).toThrow();expect(()=>h.fit([{...rows[0],target:[1,1,0,0,0]}])).toThrow('V3_TARGET_SCHEMA');expect(()=>h.predict(rows[0].features,undefined,2)).toThrow();
 });
 it('blocks real training without human labels and writes no placeholder weights',()=>{
  const dir=mkdtempSync(join(tmpdir(),'v3-training-gate-'));try{
   const corpus=generateCorpus({seed:1200600,trainDeals:1,validationDeals:1,holdoutDeals:1,positionsPerDeal:2,sourceCommit:'0'.repeat(40)}),root=join(dir,'corpus');
   writeBundle(root,{'private/packets.json':corpus.packets,'private/manifest.json':corpus.manifest});
   const output=join(dir,'not-written.json'),result=trainCLI(['--corpus',root,'--output',output]);expect(result.blocked).toBe(true);expect(existsSync(output)).toBe(false);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('atomically roundtrips strict isolated checkpoints, rejects hash/schema/symlinks and preserves canonical bytes',()=>{
  const canonical='server/ai/models/bund_rung_brain.json',hash=()=>createHash('sha256').update(readFileSync(canonical)).digest('hex'),before=hash(),dir=experimentRoot()+'/'+randomUUID();mkdirSync(dir,{recursive:true});
  try{const model=emptyBaseline(),p=payload(model,'a'.repeat(64),'b'.repeat(64));saveCheckpoint(dir+'/unit.json',p);const loaded=loadCheckpoint(dir+'/unit.json');expect(loaded.data).toEqual(p);expect(loaded.heads.card.trainingRows).toBe(0);
   expect(()=>saveCheckpoint(canonical,p)).toThrow('V3_EXPERIMENT_PATH_ONLY');symlinkSync(process.cwd()+'/server/ai/models',dir+'/alias','dir');expect(()=>saveCheckpoint(dir+'/alias/bund_rung_brain.json',p)).toThrow('V3_SYMLINK_PATH');
   const damaged=JSON.parse(readFileSync(dir+'/unit.json','utf8'));damaged.data.heads.card.weights[0]=.5;writeFileSync(dir+'/bad.json',JSON.stringify(damaged));expect(()=>loadCheckpoint(dir+'/bad.json')).toThrow('V3_CHECKPOINT_HASH');
   damaged.data.featureSchema='future';writeFileSync(dir+'/future.json',JSON.stringify(damaged));expect(()=>loadCheckpoint(dir+'/future.json')).toThrow('V3_CHECKPOINT_SCHEMA');expect(readdirSync(dir).some(p=>p.endsWith('.tmp'))).toBe(false);expect(hash()).toBe(before);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
});
