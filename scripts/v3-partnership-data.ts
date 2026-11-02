import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {collectDeal,GENERATOR_VERSION,Teacher,PartnershipRow} from './v3-partnership-common';
import {digest,Split} from '../server/ai/v3/data/Corpus';
import {PLAYER_FEATURE_SCHEMA} from '../server/ai/v3/data/Observation';
export const SPLITS:Split[]=['train','validation','holdout'];
export function validateRows(rows:PartnershipRow[]){
 const deals=new Map<string,Split>(),states=new Set<string>();
 for(const r of rows){
  if(r.x.length!==629||r.x.some(v=>!Number.isFinite(v)||Math.abs(v)>2)||r.mask.length!==52||r.mask.some(v=>v!==0&&v!==1)||!Number.isInteger(r.label)||r.mask[r.label]!==1||r.visits.length!==52||r.visits.some((v,i)=>!Number.isInteger(v)||v<0||!r.mask[i]&&v!==0)||!SPLITS.includes(r.split))throw Error('V3_DATA_ROW');
  if(deals.has(r.deal)&&deals.get(r.deal)!==r.split)throw Error('V3_SPLIT_LEAKAGE');deals.set(r.deal,r.split);
  const key=digest({deal:r.deal,x:r.x});if(states.has(key))throw Error('V3_DUPLICATE_STATE');states.add(key);
 }
}
export function readDataset(dir:string,splits:Split[]=SPLITS){
 const m=JSON.parse(readFileSync(resolve(dir,'manifest.json'),'utf8'));
 if(m.generator!==GENERATOR_VERSION||m.featureSchema!==PLAYER_FEATURE_SCHEMA||digest(m.shards)!==m.datasetHash)throw Error('V3_DATASET_SCHEMA');
 const rows:PartnershipRow[]=[],allDeals=new Set<string>();
 for(const shard of m.shards){
  if(allDeals.has(shard.deal))throw Error('V3_DUPLICATE_DEAL');allDeals.add(shard.deal);
  if(!splits.includes(shard.split))continue;
  const data=JSON.parse(readFileSync(resolve(dir,shard.file),'utf8'));
  if(digest(data)!==shard.hash||data.deal!==shard.deal||data.split!==shard.split||data.rows.some((r:PartnershipRow)=>r.deal!==data.deal||r.split!==data.split))throw Error('V3_SHARD_HASH');rows.push(...data.rows);
 }
 validateRows(rows);return {manifest:m,rows};
}
export function generateDataset(dir:string,seed:number,counts:number[],teacher:Teacher){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff-2010000||counts.length!==3||counts.some(n=>!Number.isInteger(n)||n<0||n>10000)||!counts.some(n=>n>0)||!['weak8','selective32','selective64'].includes(teacher))throw Error('V3_DATA_CONFIG');
 mkdirSync(dir,{recursive:true});
 const config={generator:GENERATOR_VERSION,featureSchema:PLAYER_FEATURE_SCHEMA,seed,teacher,splitSeedOffsets:[0,1000000,2000000],setup:'balanced modes; caller pass count cycles 0..3; seeded random trump card/suit'},configPath=resolve(dir,'config.json');
 if(existsSync(configPath)){if(digest(JSON.parse(readFileSync(configPath,'utf8')))!==digest(config))throw Error('V3_RESUME_CONFIG');}else writeFileSync(configPath,JSON.stringify(config,null,2),{flag:'wx'});
 const shards=[],deals=new Set<string>(),started=performance.now();let generated=0,resumed=0;
 for(const [i,split] of SPLITS.entries())for(let n=0;n<counts[i];n++){
  const dealSeed=seed+i*1000000+n,file=`${split}-${dealSeed}.json`,path=resolve(dir,file);let data;
  if(existsSync(path)){data=JSON.parse(readFileSync(path,'utf8'));resumed++;}else{data=collectDeal(dealSeed,split,teacher);writeFileSync(path,JSON.stringify(data),{flag:'wx'});generated++;}
  if(data.seed!==dealSeed||data.split!==split||data.rows.some((r:PartnershipRow)=>r.seed!==dealSeed||r.deal!==data.deal||r.split!==split))throw Error('V3_RESUME_SHARD');
  validateRows(data.rows);if(deals.has(data.deal))throw Error('V3_DUPLICATE_DEAL');deals.add(data.deal);
  shards.push({file,hash:digest(data),deal:data.deal,split,mode:data.mode,samples:data.rows.length});
  if(n%50===49)console.error(`${split}: ${n+1}/${counts[i]} deals`);
 }
 const report={...config,counts,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),generatorHash:digest(readFileSync('scripts/v3-partnership-common.ts','utf8').replace(/\r\n/g,'\n')),shards,datasetHash:digest(shards),generated,resumed,generationMs:performance.now()-started};
 writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(report,null,2));return {...report,shards:undefined};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const a=process.argv.slice(2),get=(k:string,d:string)=>a.includes(k)?a[a.indexOf(k)+1]:d;
 console.log(JSON.stringify(generateDataset(get('--output','server/ai/models/experiments/v3/partnership-data'),Number(get('--seed','1500300')),get('--deals','1000,150,250').split(',').map(Number),get('--teacher','selective64') as Teacher),null,2));
}
