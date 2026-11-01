import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Dependency-free interpreter for the deliberately small JSON Schema vocabulary
// used by this documentation package. Reject unknown keywords, never ignore them.
type Schema = Record<string, any>;
export function validateSchema(value:unknown, schema:Schema, root:Schema=schema, path='$'):void {
 const supported=new Set(['$schema','$id','title','$defs','$ref','oneOf','type','const','enum','properties','required','additionalProperties','items','minItems','minLength','pattern','minimum','maximum']);
 for(const key of Object.keys(schema))if(!supported.has(key))throw new Error(`${path}: unsupported schema keyword ${key}`);
 if(schema.$ref){if(!schema.$ref.startsWith('#/$defs/'))throw new Error('External schema references forbidden');const target=root.$defs[schema.$ref.slice(8)];if(!target)throw new Error('Unknown schema reference');validateSchema(value,target,root,path);}
 if(schema.oneOf){let matches=0;for(const sub of schema.oneOf)try{validateSchema(value,sub,root,path);matches++;}catch{}if(matches!==1)throw new Error(`${path}: expected exactly one schema variant`);}
 if('const' in schema&&value!==schema.const)throw new Error(`${path}: const`);
 if(schema.enum&&!schema.enum.includes(value))throw new Error(`${path}: enum`);
 if(schema.type){const types=Array.isArray(schema.type)?schema.type:[schema.type];const valid=types.some((t:string)=>t==='null'?value===null:t==='array'?Array.isArray(value):t==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):t==='integer'?typeof value==='number'&&Number.isSafeInteger(value):typeof value===t);if(!valid)throw new Error(`${path}: type`);}
 if(typeof value==='string'){if(value.length<(schema.minLength??0))throw new Error(`${path}: minLength`);if(schema.pattern&&!new RegExp(schema.pattern).test(value))throw new Error(`${path}: pattern`);}
 if(typeof value==='number'&&(!Number.isFinite(value)||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity)))throw new Error(`${path}: numeric range`);
 if(Array.isArray(value)){if(value.length<(schema.minItems??0))throw new Error(`${path}: minItems`);if(schema.items)value.forEach((v,i)=>validateSchema(v,schema.items,root,`${path}[${i}]`));}
 if(value!==null&&typeof value==='object'&&!Array.isArray(value)){
  const o=value as Record<string,unknown>;for(const key of schema.required??[])if(!(key in o))throw new Error(`${path}: missing ${key}`);
  for(const [key,v] of Object.entries(o)){if(schema.properties?.[key])validateSchema(v,schema.properties[key],root,`${path}.${key}`);else if(schema.additionalProperties===false)throw new Error(`${path}: unknown field ${key}`);}
 }
}
export function validateKnowledge(principles:any,scenarios:any,schema:Schema,sourceText:string,template?:unknown){
 validateSchema(principles,schema);validateSchema(scenarios,schema);if(template)validateSchema(template,schema);
 const ps=principles.principles,ss=scenarios.scenarios,cs=principles.corrections;
 const unique=(xs:any[])=>{const ids=new Set<string>();for(const x of xs){if(ids.has(x.id))throw new Error(`Duplicate ID ${x.id}`);ids.add(x.id);}return ids;};
 const pids=unique(ps),sids=unique(ss),cids=unique(cs);unique([...ps,...ss,...cs]);
 const refs=(ids:string[],known:Set<string>)=>{if(new Set(ids).size!==ids.length)throw new Error('Duplicate reference');for(const id of ids)if(!known.has(id))throw new Error(`Unknown reference ${id}`);};
 if(scenarios.sourceId!==principles.source.id)throw new Error('Source mismatch');
 if(createHash('sha256').update(sourceText).digest('hex')!==principles.source.sha256)throw new Error('Source hash mismatch');
 for(const x of [...ps,...ss,...cs])for(const e of x.evidence){if(e.sourceId!==principles.source.id||!sourceText.includes(e.quote))throw new Error(`Untraceable evidence ${x.id}`);}
 for(const p of ps){
  refs(p.relatedPrinciples,pids);refs(p.scenarioIds,sids);refs(p.supersededBy,pids);
  if(p.status==='active'&&p.supersededBy.length||p.status==='superseded'&&!p.supersededBy.length)throw new Error('Inconsistent supersession');
  for(const id of p.supersededBy)if(id===p.id||ps.find((x:any)=>x.id===id).status!=='active')throw new Error('Invalid replacement');
  const verified=p.classification==='verified_game_mechanic';if(verified!==Boolean(p.mechanicVerification)||verified!==(p.certainty==='engine_verified'))throw new Error('Mechanic verification required exclusively for mechanics');
  if(verified&&(!p.mechanicVerification.path.startsWith('server/engine/')||p.category!=='mechanics'))throw new Error('Mechanic engine evidence required');
  for(const id of p.scenarioIds)if(!ss.find((s:any)=>s.id===id).principleIds.includes(p.id))throw new Error('Nonreciprocal scenario reference');
 }
 for(const c of cs){refs(c.replacementPrincipleIds,pids);for(const id of c.replacementPrincipleIds)if(ps.find((p:any)=>p.id===id).status!=='active')throw new Error('Correction points to superseded principle');if(ps.some((p:any)=>p.status==='active'&&p.preferredAction===c.rejectedInterpretation))throw new Error('Rejected interpretation active');}
 for(const s of ss){
  refs(s.principleIds,pids);refs(s.correctionIds,cids);
  if(s.observationCompleteness!=='narrative_only'||!s.missingInformation.length)throw new Error('Incomplete observations must be explicit');
  if(s.responseStatus==='unanswered'&&(s.expertSelectedCard!==null||s.expertResponse!==null||s.reasoning.length||s.alternativesConsidered.length))throw new Error('Unanswered scenario has fabricated answer');
  if(s.responseStatus==='answered'&&!s.expertResponse)throw new Error('Missing expert response');
  if(s.context.rungVisibility!=='revealed'&&s.context.knownTrumpSuit!==null)throw new Error('Undisclosed trump presented as known');
  const cards=s.context.ownCards;if(new Set(cards).size!==cards.length)throw new Error('Duplicate own card');
  const played=s.context.currentTrick.map((p:any)=>p.card);if(new Set(played).size!==played.length||played.some((c:string)=>cards.includes(c)))throw new Error('Duplicate visible card');
  if(s.expertSelectedCard&&!cards.includes(s.expertSelectedCard)&&cards.length)throw new Error('Selected card not in provided own cards');
  for(const id of s.principleIds)if(!ps.find((p:any)=>p.id===id).scenarioIds.includes(s.id))throw new Error('Nonreciprocal principle reference');
 }
 const pending=ss.find((s:any)=>s.discussionNumber===21);if(!pending||pending.responseStatus!=='unanswered'||pending.context.rungVisibility!=='revealed'||pending.context.knownTrumpSuit!=='DIAMONDS')throw new Error('Scenario 21 must remain unanswered');
 return {schemaVersion:principles.schemaVersion,principles:ps.length,scenarios:ss.length,corrections:cs.length,allNarrativeOnly:true,trainingExamples:0};
}
export function validateFiles(directory=resolve('docs/ai-v3/expert-knowledge')){
 const read=(name:string)=>JSON.parse(readFileSync(resolve(directory,name),'utf8'));
 return validateKnowledge(read('expert-principles.json'),read('scenario-examples.json'),read('knowledge-schema.json'),readFileSync(resolve(directory,'expert-source.md'),'utf8'),read('interview-template.json'));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify({valid:true,...validateFiles(process.argv[2])},null,2));}catch(e){console.error(e instanceof Error?e.message:e);process.exitCode=1;}}
