import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,realpathSync,lstatSync,existsSync,writeFileSync,readFileSync,renameSync,unlinkSync} from 'node:fs';
import {resolve,dirname,relative,sep} from 'node:path';
import {Weights,validateWeights,ExperimentalModel} from './ExperimentalModel';
export const experimentRoot=()=>resolve('server/ai/models/experiments/v2');
function safePath(path:string):string {
 const root=experimentRoot(),target=resolve(path);if(!target.startsWith(root+sep))throw new Error('V2_EXPERIMENT_PATH_ONLY');
 let current=resolve('.');
 for(const part of relative(current,dirname(target)).split(sep)){current=resolve(current,part);if(existsSync(current)){if(lstatSync(current).isSymbolicLink()||!lstatSync(current).isDirectory())throw new Error('V2_SYMLINK_PATH');}else mkdirSync(current);}
 if(realpathSync(root)!==root)throw new Error('V2_SYMLINK_PATH');
 if(!realpathSync(dirname(target)).startsWith(root+sep)&&realpathSync(dirname(target))!==root)throw new Error('V2_SYMLINK_PATH');
 if(existsSync(target)&&lstatSync(target).isSymbolicLink())throw new Error('V2_SYMLINK_PATH');return target;
}
const hash=(weights:Weights)=>createHash('sha256').update(JSON.stringify(weights)).digest('hex');
export function saveCheckpoint(path:string,model:ExperimentalModel):string {
 const target=safePath(path);validateWeights(model.weights);const sha256=hash(model.weights),temp=`${target}.${randomUUID()}.tmp`;
 try{writeFileSync(temp,JSON.stringify({sha256,weights:model.weights})+'\n',{flag:'wx'});renameSync(temp,target);}finally{if(existsSync(temp))unlinkSync(temp);}return sha256;
}
export function loadCheckpoint(path:string):ExperimentalModel {
 const target=safePath(path),raw=readFileSync(target,'utf8');if(raw.length>2000000)throw new Error('V2_CHECKPOINT_SIZE');
 const data=JSON.parse(raw);validateWeights(data.weights);if(data.sha256!==hash(data.weights))throw new Error('V2_CHECKPOINT_HASH');return new ExperimentalModel(data.weights);
}
