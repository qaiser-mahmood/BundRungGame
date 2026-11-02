import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readCorpus,verifyReplay} from './v3-expert-data';
import {AcceptedDataset,HEAD_CLASSES,Head} from '../server/ai/v3/data/Annotations';
import {trainingRows,supervisionStatus} from '../server/ai/v3/learning/Rows';
import {calibrate,emptyBaseline,evaluate,frequencyBaseline} from '../server/ai/v3/learning/LinearBaseline';
import {loadCheckpoint,payload,saveCheckpoint} from '../server/ai/v3/learning/Checkpoint';
export function trainCLI(args:string[]){
 const get=(key:string,fallback:string)=>args.includes(key)?args[args.indexOf(key)+1]:fallback,corpus=readCorpus(get('--corpus','/tmp/v3-expert-corpus'));
 verifyReplay(corpus);const annotations=get('--annotations',''),data=annotations?JSON.parse(readFileSync(annotations,'utf8')) as AcceptedDataset:undefined,status=supervisionStatus(corpus,data);
 if(!status.readyForBaselineTraining)return {blocked:true,status,checkpointWritten:false,modelEvaluation:null,tournaments:null,policyLatency:null};
 const train=trainingRows(corpus,data!,'train'),validation=trainingRows(corpus,data!,'validation'),resume=get('--resume',''),loaded=resume?loadCheckpoint(resume):null;
 if(loaded&&(loaded.data.manifestHash!==corpus.manifest.manifestHash||loaded.data.annotationHash!==data!.datasetHash))throw new Error('V3_RESUME_PROVENANCE');
 const heads=loaded?.heads??emptyBaseline(),report:Record<string,unknown>={};
 for(const key of Object.keys(HEAD_CLASSES) as Head[]){
  const fit=train.filter(r=>r.head===key),val=validation.filter(r=>r.head===key);if(!fit.length||!val.length){report[key]={blocked:'training and validation labels required',metrics:null};continue;}
  const uniform=emptyBaseline()[key];heads[key].fit(fit,Number(get('--epochs','20')),Number(get('--rate','.03')));calibrate(heads[key],val);
  report[key]={validation:evaluate(heads[key],val),uniform:evaluate(uniform,val),trainingFrequency:evaluate(frequencyBaseline(HEAD_CLASSES[key],fit),val),temperature:heads[key].temperature,trainingRows:fit.length};
 }
 const checkpoint=get('--output','server/ai/models/experiments/v3/baseline.json'),sha256=saveCheckpoint(checkpoint,payload(heads,corpus.manifest.manifestHash,data!.datasetHash));
 const result={blocked:false,status:'experimental-not-cleared-for-search',checkpoint,sha256,report,readyForSearchIntegration:false,readyForSelfPlay:false};
 const reportPath=get('--report','');if(reportPath)writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const canonical='server/ai/models/bund_rung_brain.json',hash=()=>createHash('sha256').update(readFileSync(canonical)).digest('hex'),before=hash();
 try{const result=trainCLI(process.argv.slice(2));if(hash()!==before)throw new Error('V3_CANONICAL_CHANGED');process.stdout.write(JSON.stringify({...result,canonicalBefore:before,canonicalAfter:hash()},null,2)+'\n');if(result.blocked)process.exitCode=2;}
 catch(error){console.error(error instanceof Error?error.message:'V3_TRAIN_FAILURE');process.exitCode=1;}
}
