import {CARDS,SUITS} from '../server/ai/v2/simulation/CompactState';
import {existsSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Corpus,GeneratorConfig,digest,generateCorpus,verifyCorpus,assignmentPackets} from '../server/ai/v3/data/Corpus';
import {AnnotationBatch,AcceptedDataset,annotationTemplate,annotationReport,importAnnotations,verifyAccepted} from '../server/ai/v3/data/Annotations';
import {FEATURE_COUNT,FEATURE_NAMES,FEATURE_SCHEMA} from '../server/ai/v3/data/Observation';
import {supervisionStatus} from '../server/ai/v3/learning/Rows';
export function readCorpus(directory:string):Corpus {
 const packets=JSON.parse(readFileSync(join(directory,'private','packets.json'),'utf8')),manifest=JSON.parse(readFileSync(join(directory,'private','manifest.json'),'utf8'));
 const corpus={packets,manifest};verifyCorpus(corpus);return corpus;
}
export function writeBundle(directory:string,files:Record<string,unknown>):void {
 const target=resolve(directory);if(existsSync(target))throw new Error('V3_OUTPUT_EXISTS');mkdirSync(dirname(target),{recursive:true});const temp=target+'.'+randomUUID()+'.tmp';mkdirSync(temp);
 try{for(const [name,data] of Object.entries(files)){const path=join(temp,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,typeof data==='string'?data:JSON.stringify(data,null,2)+'\n',{flag:'wx'});}if(existsSync(target))throw new Error('V3_OUTPUT_EXISTS');renameSync(temp,target);}finally{rmSync(temp,{recursive:true,force:true});}
}
export function verifyReplay(corpus:Corpus):void {verifyCorpus(corpus);if(generateCorpus(corpus.manifest.config).manifest.manifestHash!==corpus.manifest.manifestHash)throw new Error('V3_OFFICIAL_REPLAY_MISMATCH');}
export function dataCLI(args:string[]):unknown {
 const command=args[0],get=(key:string,fallback:string)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
 if(command==='generate'){
  const config:GeneratorConfig={seed:Number(get('--seed','1200000')),trainDeals:Number(get('--train-deals','8')),validationDeals:Number(get('--validation-deals','4')),holdoutDeals:Number(get('--holdout-deals','4')),positionsPerDeal:Number(get('--positions','4')),sourceCommit:get('--source-commit','')};
  const corpus=generateCorpus(config),selected=assignmentPackets(corpus,Number(get('--position-offset','0'))),template=annotationTemplate(corpus,get('--annotator','UNASSIGNED'),selected.map(p=>p.id));
  writeBundle(get('--output','/tmp/v3-expert-corpus'),{'public/card-and-label-format.json':{cards:CARDS.map((c,index)=>({index,...c})),shortage:['VOID','SINGLETON','TWO_PLUS'],returnSuit:[...SUITS,'NO_REQUEST'],leadControl:['PARTNER_RETAIN','OBSERVER_TAKE','NO_PREFERENCE'],strategyPhase:['FORCE_REVEAL','PRESERVE_CONCEALMENT','LEAD_CONTROL','INDIVIDUAL_STREAK','ENDGAME','OTHER']},'private/packets.json':corpus.packets,'public/packets.json':selected,'public/annotation-template.json':template,'private/manifest.json':corpus.manifest,'feature-schema.json':{schema:FEATURE_SCHEMA,count:FEATURE_COUNT,names:FEATURE_NAMES},'status.json':supervisionStatus(corpus)});
  return {positions:corpus.packets.length,blindAssignmentPositions:selected.length,deals:config.trainDeals+config.validationDeals+config.holdoutDeals,manifestHash:corpus.manifest.manifestHash,status:supervisionStatus(corpus)};
 }
 const corpus=readCorpus(get('--corpus','/tmp/v3-expert-corpus'));
 if(command==='assign'){
  const selected=assignmentPackets(corpus,Number(get('--position-offset','0'))),template=annotationTemplate(corpus,get('--annotator','UNASSIGNED'),selected.map(p=>p.id));
  writeBundle(get('--output','/tmp/v3-blind-assignment'),{'packets.json':selected,'annotation-template.json':template,
   'card-and-label-format.json':JSON.parse(readFileSync(join(get('--corpus','/tmp/v3-expert-corpus'),'public','card-and-label-format.json'),'utf8')),
   'README.md':'# Blind expert assignment\n\nUse only these packets and the format file. Do not inspect the private corpus, seeds, future frames or other player views. Each real annotator must keep a stable ID across assignments. Do not annotate a second decision from a deal you already reviewed. Leave unknown beliefs null. No labels are prefilled.\n'});
  return {positions:selected.length,output:get('--output','/tmp/v3-blind-assignment'),labels:'unfilled; no expert data'};
 }
 if(command==='render'){
  const id=get('--packet',''),p=corpus.packets.find(p=>p.id===id);if(!p)throw new Error('V3_UNKNOWN_PACKET');const o=p.observation,card=(c:number)=>`${c}: ${CARDS[c].rank} ${CARDS[c].suit}`;
  const lines=[`# Observable decision ${p.id}`,`Observation hash: ${p.observationHash}`,`You are relative seat 0; partner is seat ${o.partner}. Seats follow authoritative turn order.`,
   `Caller: ${o.caller===null?'none':o.caller}; dealer: ${o.dealer}; mode: ${o.mode}/${o.modifier}; trump: ${o.trumpRevealed?(o.publicTrump===null?'revealed/no suit':SUITS[o.publicTrump]):'UNREVEALED (identity omitted)'}.`,
   `Trick: ${o.currentTrick}; current lead: ${o.currentLead===null?'none':SUITS[o.currentLead]}; streak seat/count: ${o.streakSeat}/${o.streakCount}; held counts: ${o.counts.join(', ')}; dealer score: ${o.score}.`,
   `Your ordinary/publicly revealed playable cards: ${o.ownCards.map(card).join('; ')}.`, `Legal alternatives: ${o.legal.map(card).join('; ')}.`,...o.publicHands.map((h,i)=>`Seat ${i} publicly disclosed cards: ${h===null?'not disclosed':h.map(card).join('; ')}.`), '', '| Trick | Seat | Public card | Ace downgraded | Trump revealed at play |','| --- | --- | --- | --- | --- |',
   ...o.history.map(h=>`| ${h.trick} | ${h.seat} | ${h.card===null?'CONCEALED':card(h.card)} | ${h.aceDown===null?'unknown':h.aceDown} | ${h.trumpRevealedAtPlay===null?'unknown':h.trumpRevealedAtPlay} |`),
   '', 'No action or intention labels are prefilled. Null means unknown. Generated bot actions are not expert intent. Give ranked legal alternatives and uncertain expert beliefs with reasoning.'];
  const output=get('--output','/tmp/v3-observable-decision.md');writeFileSync(output,lines.join('\n')+'\n',{flag:'wx'});return {output};
 }
 if(command==='verify'){verifyReplay(corpus);return {verified:true,manifestHash:corpus.manifest.manifestHash,positions:corpus.packets.length};}
 if(command==='template'){const out=get('--output','/tmp/v3-expert-template.json');writeFileSync(out,JSON.stringify(annotationTemplate(corpus,get('--annotator','UNASSIGNED'),get('--packets','')?get('--packets','').split(','):assignmentPackets(corpus,Number(get('--position-offset','0'))).map(p=>p.id)),null,2)+'\n',{flag:'wx'});return {output:out,labels:'unfilled; not training data'};}
 if(command==='import'){
  verifyReplay(corpus);const paths=get('--annotations','').split(',').filter(Boolean);if(!paths.length)throw new Error('V3_HUMAN_ANNOTATIONS_REQUIRED');
  const batches=paths.map(p=>JSON.parse(readFileSync(p,'utf8')) as AnnotationBatch),accepted=importAnnotations(corpus,batches);
  writeBundle(get('--output','/tmp/v3-accepted-annotations'),{'annotations.json':accepted,'quality-report.json':annotationReport(accepted),'supervision-status.json':supervisionStatus(corpus,accepted)});
  return {datasetHash:accepted.datasetHash,quality:annotationReport(accepted),status:supervisionStatus(corpus,accepted)};
 }
 if(command==='status'){
  const path=get('--annotations',''),data=path?JSON.parse(readFileSync(path,'utf8')) as AcceptedDataset:undefined;if(data)verifyAccepted(corpus,data);
  return {manifestHash:corpus.manifest.manifestHash,packetHash:digest(corpus.packets),...supervisionStatus(corpus,data)};
 }
 throw new Error('Usage: v3-expert-data.ts generate|verify|assign|render|template|import|status');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{process.stdout.write(JSON.stringify(dataCLI(process.argv.slice(2)),null,2)+'\n');}catch(error){console.error(error instanceof Error?error.message:'V3_DATA_FAILURE');process.exitCode=1;}}
