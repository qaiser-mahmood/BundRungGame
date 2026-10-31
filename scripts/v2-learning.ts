import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runGame,seededRandom} from './ai-benchmark';
import {features,legalMask,FEATURE_SCHEMA} from '../server/ai/v2/learning/Features';
import {Example,ExperimentalModel,validateExample} from '../server/ai/v2/learning/ExperimentalModel';
import {loadCheckpoint,saveCheckpoint} from '../server/ai/v2/learning/Checkpoint';
import {CARDS,indexOf} from '../server/ai/v2/simulation/CompactState';
const args=process.argv.slice(2),get=(k:string,d:string)=>args.includes(k)?args[args.indexOf(k)+1]:d,mode=args[0];
const canonical=()=>createHash('sha256').update(readFileSync('server/ai/models/bund_rung_brain.json')).digest('hex'),before=canonical();
const seed=Number(get('--seed','400000'));if(!Number.isSafeInteger(seed)||seed<0)throw new Error('V2_SEED');
console.log=(...x)=>console.error(...x);
if(mode==='capture'){
 const teacherCommit=get('--teacher-commit','');if(!/^[0-9a-f]{40}$/.test(teacherCommit))throw new Error('V2_TEACHER_COMMIT_REQUIRED');
 const games=Number(get('--games','8'));if(!Number.isSafeInteger(games)||games<1||games>1000)throw new Error('V2_CAPTURE_COUNT');
 const examples:Example[]=[];
 for(let n=0;n<games;n++){
  const pending:{example:Example;team:string}[]=[];
  const result=runGame(seed+n,'TEAM_1','ai-v2-ismcts','ai-v2-ismcts',{timeMs:Infinity,iterations:16},{},{iterations:64,onResult:(r,s,p)=>{
   if(!r.completed||r.fallback)return;const total=r.root.reduce((n,a)=>n+a.visits,0);if(!total)return;
   const visits=new Array<number>(52).fill(0);r.root.forEach(a=>visits[indexOf(a.cardId)]=a.visits/total);
   pending.push({team:s.players.find(x=>x.id===p.myPlayerId)!.team,example:{schema:FEATURE_SCHEMA,features:features(s,p),mask:legalMask(r.root.map(a=>CARDS[indexOf(a.cardId)])),visits,reward:0,seed:seed+n}});
  }});
  if(result.error||!result.winner||result.signedScoreAdjustment===null)throw new Error('V2_CAPTURE_ABORT');
  for(const p of pending){const signed=result.signedScoreAdjustment*(p.team==='TEAM_1'?1:-1),match=result.terminal.matchOver?(result.terminal.matchWinner===p.team?1000:-1000):0;
   p.example.reward=(signed+match)/1208;validateExample(p.example);examples.push(p.example);}
 }
 const dataset={schema:'v2-search-trajectories/1',featureSchema:FEATURE_SCHEMA,seed,games,teacher:'ai-v2-ismcts; unproven strength; experimental only',commit:teacherCommit,examples};
 writeFileSync(get('--output','/tmp/v2-trajectories.json'),JSON.stringify(dataset)+'\n',{flag:'wx'});process.stdout.write(JSON.stringify({games,samples:examples.length,canonicalBefore:before,canonicalAfter:canonical()})+'\n');
}else if(mode==='train'){
 const raw=readFileSync(get('--data','/tmp/v2-trajectories.json'),'utf8');if(raw.length>64000000)throw new Error('V2_DATA_SIZE');const data=JSON.parse(raw);
 if(data.schema!=='v2-search-trajectories/1'||data.featureSchema!==FEATURE_SCHEMA||!Array.isArray(data.examples))throw new Error('V2_DATA_SCHEMA');data.examples.forEach(validateExample);
 const model=get('--resume','')?loadCheckpoint(get('--resume','')):ExperimentalModel.create(seed,seededRandom(seed));
 const loss=model.train(data.examples,Number(get('--epochs','5')),Number(get('--rate','.01')));
 const path=get('--output','server/ai/models/experiments/v2/imitation.json'),sha256=saveCheckpoint(path,model);
 process.stdout.write(JSON.stringify({path,sha256,steps:model.weights.steps,loss,teacher:data.teacher,canonicalBefore:before,canonicalAfter:canonical()})+'\n');
}else if(mode==='evaluate'){
 const data=JSON.parse(readFileSync(get('--data','/tmp/v2-validation-trajectories.json'),'utf8'));
 if(data.schema!=='v2-search-trajectories/1'||data.featureSchema!==FEATURE_SCHEMA||!Array.isArray(data.examples)||!data.examples.length)throw new Error('V2_DATA_SCHEMA');
 const model=loadCheckpoint(get('--checkpoint','server/ai/models/experiments/v2/imitation.json'));let policyLoss=0,valueLoss=0;
 for(const e of data.examples as Example[]){validateExample(e);const pred=model.predict(e.features,e.mask);policyLoss-=e.visits.reduce((sum,v,i)=>sum+v*Math.log(Math.max(1e-12,pred.policy[i])),0);valueLoss+=(pred.value-e.reward)**2;}
 process.stdout.write(JSON.stringify({samples:data.examples.length,seed:data.seed,policyCrossEntropy:policyLoss/data.examples.length,valueMSE:valueLoss/data.examples.length,canonicalBefore:before,canonicalAfter:canonical()})+'\n');
}else throw new Error('Usage: v2-learning.ts capture|train --output PATH [--data PATH --resume PATH]');
if(canonical()!==before)throw new Error('V2_CANONICAL_CHANGED');
