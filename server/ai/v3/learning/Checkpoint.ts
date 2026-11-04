import {createHash,randomUUID} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,realpathSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {dirname,relative,resolve,sep} from 'node:path';
import {FEATURE_COUNT,FEATURE_SCHEMA,FEATURE_NAMES} from '../data/Observation';
import {HEAD_CLASSES,Head} from '../data/Labels';
import {BaselineHeads,emptyBaseline} from './LinearBaseline';
import {CARDS} from '../../v2/simulation/CompactState';
import {digest} from '../data/Integrity';
export interface BaselineCheckpoint {
 schema:'bundrung-v3-linear-scaffold/v1';featureSchema:typeof FEATURE_SCHEMA;schemaHash:string;status:'experimental-not-cleared-for-search';
 manifestHash:string;annotationHash:string;heads:Record<Head,{classes:number;weights:number[];bias:number[];temperature:number;trainingRows:number}>;
}
export const experimentRoot=()=>resolve('server/ai/models/experiments/v3');
function pathFor(path:string):string {
 const root=experimentRoot(),target=resolve(path);if(!target.startsWith(root+sep))throw new Error('V3_EXPERIMENT_PATH_ONLY');
 let current=resolve('.');for(const part of relative(current,dirname(target)).split(sep)){
  current=resolve(current,part);if(existsSync(current)){if(lstatSync(current).isSymbolicLink()||!lstatSync(current).isDirectory())throw new Error('V3_SYMLINK_PATH');}else mkdirSync(current);
 }
 if(realpathSync(root)!==root||existsSync(target)&&lstatSync(target).isSymbolicLink())throw new Error('V3_SYMLINK_PATH');return target;
}
export function payload(heads:BaselineHeads,manifestHash:string,annotationHash:string):BaselineCheckpoint {
 return {schema:'bundrung-v3-linear-scaffold/v1',featureSchema:FEATURE_SCHEMA,schemaHash:digest({features:FEATURE_NAMES,cards:CARDS.map(c=>c.id),heads:HEAD_CLASSES}),status:'experimental-not-cleared-for-search',manifestHash,annotationHash,
  heads:Object.fromEntries(Object.entries(heads).map(([k,h])=>[k,{classes:h.classes,weights:h.weights.slice(),bias:h.bias.slice(),temperature:h.temperature,trainingRows:h.trainingRows}])) as BaselineCheckpoint['heads']};
}
export function decode(p:BaselineCheckpoint):BaselineHeads {
 if(p.schema!=='bundrung-v3-linear-scaffold/v1'||p.featureSchema!==FEATURE_SCHEMA||p.schemaHash!==digest({features:FEATURE_NAMES,cards:CARDS.map(c=>c.id),heads:HEAD_CLASSES})||p.status!=='experimental-not-cleared-for-search'||!(/^[a-f0-9]{64}$/.test(p.manifestHash))||!(/^[a-f0-9]{64}$/.test(p.annotationHash))||!p.heads||Object.keys(p.heads).sort().join()!==Object.keys(HEAD_CLASSES).sort().join())throw new Error('V3_CHECKPOINT_SCHEMA');
 const heads=emptyBaseline();for(const key of Object.keys(HEAD_CLASSES) as Head[]){const h=p.heads[key];if(h.classes!==HEAD_CLASSES[key]||!Array.isArray(h.weights)||h.weights.length!==h.classes*FEATURE_COUNT||!Array.isArray(h.bias)||h.bias.length!==h.classes)throw new Error('V3_CHECKPOINT_SCHEMA');
  heads[key].weights.splice(0,heads[key].weights.length,...h.weights);heads[key].bias.splice(0,heads[key].bias.length,...h.bias);heads[key].temperature=h.temperature;heads[key].trainingRows=h.trainingRows;heads[key].validate();}
 return heads;
}
export function saveCheckpoint(path:string,data:BaselineCheckpoint):string {
 decode(data);const target=pathFor(path),sha256=digest(data),temp=`${target}.${randomUUID()}.tmp`;
 try{writeFileSync(temp,JSON.stringify({sha256,data})+'\n',{flag:'wx'});renameSync(temp,target);}finally{if(existsSync(temp))unlinkSync(temp);}return sha256;
}
export function loadCheckpoint(path:string):{data:BaselineCheckpoint;heads:BaselineHeads;sha256:string}{
 const raw=readFileSync(pathFor(path),'utf8');if(raw.length>6000000)throw new Error('V3_CHECKPOINT_SIZE');const stored=JSON.parse(raw),heads=decode(stored.data);
 if(stored.sha256!==digest(stored.data))throw new Error('V3_CHECKPOINT_HASH');return {data:stored.data,heads,sha256:createHash('sha256').update(JSON.stringify(stored.data)).digest('hex')};
}
