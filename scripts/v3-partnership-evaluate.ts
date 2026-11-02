import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {TeacherPolicy} from '../server/ai/v3/learning/TeacherPolicy';
import {MLPPolicy,PolicyInference} from '../server/ai/v3/learning/MLPPolicy';
import {readDataset} from './v3-partnership-data';
import {PartnershipRow} from './v3-partnership-common';
import type {Split} from '../server/ai/v3/data/Corpus';
export function loadPolicy(path:string):PolicyInference {const d=JSON.parse(readFileSync(path,'utf8'));return d.schema==='bundrung-v3-mlp/v1'?MLPPolicy.load(path):TeacherPolicy.load(path);}
export function scoreRows(model:PolicyInference,rows:PartnershipRow[]){
 const start=performance.now(),predictions=rows.map(r=>{const p=model.probabilities(r.x,r.mask),a=r.mask.reduce((best,m,i)=>m&&(best<0||p[i]>p[best])?i:best,-1);if(!r.mask[a])throw Error('V3_ILLEGAL_INFERENCE');return {a,loss:-Math.log(Math.max(1e-15,p[r.label]))};}),inferenceMs=performance.now()-start;
 const groups:Record<string,(r:PartnershipRow)=>boolean>={all:()=>true,multi:r=>r.mask.reduce((a,b)=>a+b,0)>1,caller:r=>r.caller,noncaller:r=>!r.caller,hidden:r=>!r.revealed,revealed:r=>r.revealed,partnerWinning:r=>r.partnerWinning,partnerWinningMulti:r=>r.partnerWinning&&r.mask.reduce((a,b)=>a+b,0)>1,early:r=>r.trick<=4,middle:r=>r.trick>=5&&r.trick<=9,late:r=>r.trick>=10};
 for(const m of ['CLOSE_TRUMP','OPEN_TRUMP','BWINJI'])groups[m]=r=>r.mode===m;
 for(let i=0;i<4;i++)groups[`position${i}`]=r=>r.position===i;
 const result:Record<string,unknown>={};
 for(const [name,filter] of Object.entries(groups)){
  const indices=rows.flatMap((r,i)=>filter(r)?[i]:[]),n=indices.length,partners=indices.filter(i=>rows[i].partnerWinning),trumpKnown=indices.filter(i=>rows[i].trumpKnown);
  result[name]={samples:n,deals:new Set(indices.map(i=>rows[i].deal)).size,agreement:n?indices.filter(i=>predictions[i].a===rows[i].label).length/n:null,loss:n?indices.reduce((sum,i)=>sum+predictions[i].loss,0)/n:null,legalCompliance:n?1:null,partnerOpportunities:partners.length,modelOvertakes:partners.filter(i=>rows[i].overtakes.includes(predictions[i].a)).length,teacherOvertakes:partners.filter(i=>rows[i].overtakes.includes(rows[i].label)).length,knownTrumpDecisions:trumpKnown.length,modelTrumpUses:trumpKnown.filter(i=>rows[i].trumpCards.includes(predictions[i].a)).length,teacherTrumpUses:trumpKnown.filter(i=>rows[i].trumpCards.includes(rows[i].label)).length};
 }
 return {inferenceMs,meanInferenceMs:rows.length?inferenceMs/rows.length:null,groups:result};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [, ,dir,checkpoint,split='holdout',output]=process.argv,{manifest,rows}=readDataset(dir,[split as Split]),report={checkpoint,datasetHash:manifest.datasetHash,split,...scoreRows(loadPolicy(checkpoint),rows)};
 writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report,null,2));
}
