import {readFileSync,writeFileSync,openSync,closeSync,unlinkSync,existsSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
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
 if(command==='prepare'){
  const count=Number(get('--deals-per-split','4'));if(!Number.isSafeInteger(count)||count<1||count>30)throw new Error('EVALUATION_SMALL_COLLECTION_LIMIT');
  const bundle=await prepareEvaluation({seed:Number(get('--seed','2200000')),trainDeals:count,validationDeals:count,holdoutDeals:count,positionsPerDeal:12,sourceCommit:get('--source-commit',''),calling:'mixed'});
  writeBundle(dir,{'bundle.json':bundle,'collection-coverage.json':collectionCoverage(bundle)});chmodSync(dir,0o700);chmodSync(join(dir,'bundle.json'),0o600);return {data:dir,assigned: Object.keys(bundle.predictions).length,manifestHash:bundle.corpus.manifest.manifestHash,labels:0,models:{v2:'available fixed-work variant',v3:'not_available'}};
 }
 const store=loadReviewStore(dir);
 if(command==='export'){
  const output=resolve(get('--output','/tmp/bundrung-review-export.json'));if(output.startsWith(resolve('server/ai/models')))throw new Error('EVALUATION_MODEL_PATH_FORBIDDEN');
  writeFileSync(output,JSON.stringify({report:evaluationReport(store.recordsFor(),store.bundle),acceptedAnnotations:store.exportTraining(),reviews:store.recordsFor()},null,2)+'\n',{flag:'wx',mode:0o600});return {output,warning:'Curator-only export contains seeds and private source references. Do not give it to annotators.'};
 }
 if(command==='serve'){
  const users=JSON.parse(process.env.EXPERT_REVIEW_USERS??'{}'),port=Number(get('--port','4318'));if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('EVALUATION_PORT');
  const lock=join(dir,'writer.lock');const fd=openSync(lock,'wx',0o600);writeFileSync(fd,String(process.pid));
  const release=()=>{closeSync(fd);if(existsSync(lock))unlinkSync(lock);};let app;try{app=reviewApp(store,users);}catch(e){release();throw e;}
  const server=app.listen(port,'127.0.0.1',()=>console.log(`Expert review: http://127.0.0.1:${port}; authenticated access required`));
  server.on('error',()=>{release();process.exitCode=1;});for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>server.close(()=>{release();process.exit(0);}));return {serving:true};
 }
 throw new Error('Usage: expert-evaluation.ts prepare|serve|export --data DIRECTORY');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)evaluationCLI(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e instanceof Error?e.message:'EVALUATION_FAILURE');process.exitCode=1;});
