import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Deliberately limited JSON Schema interpreter, not full Draft 2020-12 support.
// Preflight the entire schema before matching data so invalid/unsupported branches
// cannot be swallowed by oneOf or skipped when an optional property is absent.
type Schema = Record<string, any>;
const own=(o:object,k:string)=>Object.prototype.hasOwnProperty.call(o,k);
const object=(v:unknown):v is Schema=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const equal=(a:any,b:any):boolean=>a===b||Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]))||object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>own(b,k)&&equal(a[k],b[k]));
const supported=new Set(['$schema','$id','title','$defs','$ref','oneOf','type','const','enum','properties','required','additionalProperties','items','minItems','minLength','pattern','minimum','maximum']);
const types=new Set(['null','array','object','integer','number','string','boolean']);
function target(ref:unknown,root:Schema):Schema {
 if(typeof ref!=='string'||!/^#\/\$defs\/[A-Za-z0-9_-]+$/.test(ref))throw new Error('Only direct local $defs references are supported');
 const key=ref.slice(8);if(!object(root.$defs)||!own(root.$defs,key))throw new Error('Unknown schema reference');return root.$defs[key];
}
function preflight(schema:unknown,root:Schema,active=new Set<unknown>(),done=new Set<unknown>()):void {
 if(!object(schema))throw new Error('Schema must be an object; boolean schemas unsupported');
 if(active.has(schema))throw new Error('Recursive schema references unsupported');if(done.has(schema))return;
 active.add(schema);
 for(const key of Object.keys(schema))if(!supported.has(key))throw new Error(`unsupported schema keyword ${key}`);
 for(const key of ['$id','title'])if(own(schema,key)&&typeof schema[key]!=='string')throw new Error(`Invalid schema ${key}`);
 if(own(schema,'$schema')&&schema.$schema!=='https://json-schema.org/draft/2020-12/schema')throw new Error('Unsupported schema dialect');
 if(own(schema,'type')){const ts=Array.isArray(schema.type)?schema.type:[schema.type];if(!ts.length||new Set(ts).size!==ts.length||ts.some(t=>!types.has(t)))throw new Error('Invalid schema type');}
 for(const key of ['minItems','minLength'])if(own(schema,key)&&(!Number.isSafeInteger(schema[key])||schema[key]<0))throw new Error(`Invalid schema ${key}`);
 for(const key of ['minimum','maximum'])if(own(schema,key)&&(typeof schema[key]!=='number'||!Number.isFinite(schema[key])))throw new Error(`Invalid schema ${key}`);
 if(own(schema,'pattern')){if(typeof schema.pattern!=='string')throw new Error('Invalid schema pattern');new RegExp(schema.pattern,'u');}
 if(own(schema,'additionalProperties')&&typeof schema.additionalProperties!=='boolean')throw new Error('Schema-valued additionalProperties unsupported');
 if(own(schema,'required')&&(!Array.isArray(schema.required)||schema.required.some((k:unknown)=>typeof k!=='string')||new Set(schema.required).size!==schema.required.length))throw new Error('Invalid schema required');
 const json=(v:any,seen=new Set<any>()):void=>{if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return;if((!Array.isArray(v)&&!object(v))||seen.has(v))throw new Error('Non-JSON schema value');seen.add(v);for(const x of Object.values(v))json(x,seen);seen.delete(v);};
 if(own(schema,'const'))json(schema.const);
 if(own(schema,'enum')){if(!Array.isArray(schema.enum)||!schema.enum.length)throw new Error('Invalid schema enum');schema.enum.forEach((v:any,i:number)=>{json(v);if(schema.enum.slice(0,i).some((x:any)=>equal(v,x)))throw new Error('Duplicate schema enum value');});}
 for(const key of ['$defs','properties'])if(own(schema,key)){if(!object(schema[key]))throw new Error(`Invalid schema ${key}`);for(const child of Object.values(schema[key]))preflight(child,root,active,done);}
 if(own(schema,'items'))preflight(schema.items,root,active,done);
 if(own(schema,'oneOf')){if(!Array.isArray(schema.oneOf)||!schema.oneOf.length)throw new Error('Invalid schema oneOf');for(const child of schema.oneOf)preflight(child,root,active,done);}
 if(own(schema,'$ref'))preflight(target(schema.$ref,root),root,active,done);
 active.delete(schema);done.add(schema);
}
function match(value:unknown,schema:Schema,root:Schema,path:string):void {
 if(own(schema,'$ref'))match(value,target(schema.$ref,root),root,path);
 if(schema.oneOf){let matches=0;for(const sub of schema.oneOf)try{match(value,sub,root,path);matches++;}catch{}if(matches!==1)throw new Error(`${path}: expected exactly one schema variant`);}
 if(own(schema,'const')&&!equal(value,schema.const))throw new Error(`${path}: const`);
 if(schema.enum&&!schema.enum.some((v:any)=>equal(value,v)))throw new Error(`${path}: enum`);
 if(schema.type){const ts=Array.isArray(schema.type)?schema.type:[schema.type];if(!ts.some((t:string)=>t==='null'?value===null:t==='array'?Array.isArray(value):t==='object'?object(value):t==='integer'?typeof value==='number'&&Number.isInteger(value):t==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===t))throw new Error(`${path}: type`);}
 if(typeof value==='string'){if([...value].length<(schema.minLength??0))throw new Error(`${path}: minLength`);if(own(schema,'pattern')&&!new RegExp(schema.pattern,'u').test(value))throw new Error(`${path}: pattern`);}
 if(typeof value==='number'&&(!Number.isFinite(value)||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity)))throw new Error(`${path}: numeric range`);
 if(Array.isArray(value)){if(value.length<(schema.minItems??0))throw new Error(`${path}: minItems`);if(schema.items)value.forEach((v,i)=>match(v,schema.items,root,`${path}[${i}]`));}
 if(object(value)){
  for(const key of schema.required??[])if(!own(value,key))throw new Error(`${path}: missing ${key}`);
  for(const [key,v] of Object.entries(value)){if(schema.properties&&own(schema.properties,key))match(v,schema.properties[key],root,`${path}.${key}`);else if(schema.additionalProperties===false)throw new Error(`${path}: unknown field ${key}`);}
 }
}
export function validateSchema(value:unknown,schema:Schema,root:Schema=schema,path='$'):void {
 preflight(root,root);if(schema!==root)preflight(schema,root);match(value,schema,root,path);
}
export function validateKnowledge(principles:any,scenarios:any,schema:Schema,sourceText:string,template?:unknown){
 validateSchema(principles,schema);validateSchema(scenarios,schema);if(template!==undefined)validateSchema(template,schema);
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
  if(s.context.currentTrick.some((p:any)=>p.visibility!=='public'||!['partner','opponent','observer','unknown'].includes(p.seatRole)))throw new Error('Nonpublic play presented as public fact');
  if(own(s.context,'opponentHands')||own(s.context,'hiddenCards'))throw new Error('Hidden opponent cards forbidden');
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
