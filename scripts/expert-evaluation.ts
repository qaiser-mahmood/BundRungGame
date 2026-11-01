import {readFileSync,writeFileSync,openSync,closeSync,unlinkSync,existsSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {prepareEvaluation,type EvaluationBundle} from '../server/ai/v3/evaluation/Prepare';
import {ReviewStore} from '../server/ai/v3/evaluation/Store';
import {evaluationReport} from '../server/ai/v3/evaluation/Metrics';
import {collectionCoverage} from '../server/ai/v3/evaluation/Coverage';
import {reviewApp} from '../server/ai/v3/evaluation/Server';
import {writeBundle} from './v3-expert-data';
export function loadReviewStore(directory:string){const bundle=JSON.parse(readFileSync(join(directory,'bundle.json'),'utf8')) as EvaluationBundle;const principles=JSON.parse(readFileSync('docs/ai-v3/expert-knowledge/expert-principles.json','utf8')).principles.filter((p:any)=>p.status==='active').map((p:any)=>p.id);return new ReviewStore(directory,bundle,principles);}
export async function evaluationCLI(args:string[]){
 const command=args[0],get=(key:string,fallback:string)=>args.includes(key)?args[args.indexOf(key)+1]:fallback,dir=resolve(get('--data','/tmp/bundrung-expert-review'));
 if(dir.startsWith(resolve('server/ai/models')))throw new Error('EVALUATION_MODEL_PATH_FORBIDDEN');
 if(command==='prepare'||command==='prepare-pilot'){
  const pilot=command==='prepare-pilot',count=Number(get('--deals-per-split',pilot?'15':'4'));if(!Number.isSafeInteger(count)||count<1||count>30)throw new Error('EVALUATION_SMALL_COLLECTION_LIMIT');
  const bundle=await prepareEvaluation({seed:Number(get('--seed',pilot?'3100000':'2200000')),trainDeals:count,validationDeals:count,holdoutDeals:count,positionsPerDeal:pilot?52:12,sourceCommit:get('--source-commit',''),calling:'mixed',...(pilot?{targeted:true as const}:{})});
  writeBundle(dir,{'bundle.json':bundle,'collection-coverage.json':bundle.pilot?{assigned:15,counts:bundle.pilot.counts,targets:bundle.pilot.targets,insufficient:bundle.pilot.insufficient,selectionHash:bundle.pilot.selectionHash,poolPositions:bundle.corpus.packets.length,poolDeals:count*3,description:'Observable targeted coverage, not expert labels or model quality.'}:collectionCoverage(bundle)});chmodSync(dir,0o700);chmodSync(join(dir,'bundle.json'),0o600);return {data:dir,assigned: Object.keys(bundle.predictions).length,manifestHash:bundle.corpus.manifest.manifestHash,labels:0,models:{v2:'available fixed-work variant',v3:'not_available'},...(bundle.pilot?{readyForPilot:bundle.pilot.insufficient.length===0,insufficient:bundle.pilot.insufficient}:{})};
 }
 if(command==='init-access'){
  loadReviewStore(dir);const file=join(dir,'users.local.json');writeFileSync(file,JSON.stringify({pilot_owner:randomBytes(32).toString('hex')},null,2)+'\n',{flag:'wx',mode:0o600});return {credentialsFile:file,actor:'pilot_owner',instruction:'Open this private file locally to obtain your token; never share or commit it. Existing credentials are never overwritten.'};
 }
 if(command==='export'){
  const store=loadReviewStore(dir);
  const output=resolve(get('--output','/tmp/bundrung-review-export.json'));if(output.startsWith(resolve('server/ai/models')))throw new Error('EVALUATION_MODEL_PATH_FORBIDDEN');
  const accepted=store.exportTraining(),trainingDir=get('--training-dir','');
  if(trainingDir){const target=resolve(trainingDir);if(target.startsWith(resolve('server/ai/models')))throw new Error('EVALUATION_MODEL_PATH_FORBIDDEN');writeBundle(target,{'private/packets.json':store.bundle.corpus.packets,'private/manifest.json':store.bundle.corpus.manifest,'annotations.json':accepted});chmodSync(target,0o700);}
  writeFileSync(output,JSON.stringify({report:evaluationReport(store.recordsFor(),store.bundle),acceptedAnnotations:accepted,reviews:store.recordsFor()},null,2)+'\n',{flag:'wx',mode:0o600});return {output,warning:'Curator-only export contains seeds and private source references. Do not give it to annotators.'};
 }
 if(command==='serve'){
  const usersFile=get('--users-file',''),users=JSON.parse(usersFile?readFileSync(resolve(usersFile),'utf8'):process.env.EXPERT_REVIEW_USERS??'{}'),port=Number(get('--port','4318'));if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('EVALUATION_PORT');
  const lock=join(dir,'writer.lock');const fd=openSync(lock,'wx',0o600);writeFileSync(fd,String(process.pid));
  let released=false;const release=()=>{if(released)return;released=true;closeSync(fd);if(existsSync(lock))unlinkSync(lock);};let app;try{app=reviewApp(loadReviewStore(dir),users);}catch(e){release();throw e;}
  const server=app.listen(port,'127.0.0.1',()=>console.log(`Expert review: http://127.0.0.1:${port}; authenticated access required`));
  try{await new Promise<void>((ready,failed)=>{server.once('listening',ready);server.once('error',failed);});}catch(error){release();throw error;}
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>server.close(()=>{release();process.exit(0);}));return {serving:true};
 }
 throw new Error('Usage: expert-evaluation.ts prepare|prepare-pilot|init-access|serve|export --data DIRECTORY');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)evaluationCLI(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e instanceof Error?e.message:'EVALUATION_FAILURE');process.exitCode=1;});
