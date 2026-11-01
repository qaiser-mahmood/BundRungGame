import express from 'express';
import {timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ReviewStore,type ReviewRecord} from './Store';
import {evaluationReport} from './Metrics';
import {CARDS} from '../../v2/simulation/CompactState';
export function authenticatedActor(header:unknown,users:Record<string,string>):string|null {
 if(typeof header!=='string'||!header.startsWith('Bearer '))return null;const token=Buffer.from(header.slice(7));
 for(const [actor,key] of Object.entries(users)){const secret=Buffer.from(key);if(secret.length===token.length&&timingSafeEqual(secret,token))return actor;}return null;
}
export function caseState(record:ReviewRecord|undefined){
 if(!record)return 'not_reviewed';
 if(record.submission.status==='reviewed')return record.submission.selected===null?'insufficient':'completed';
 return record.submission.status;
}
function savedResponse(store:ReviewStore,actor:string,record:ReviewRecord){return {id:record.id,revision:record.revision,comparison:record.submission.status==='skipped'?null:store.comparison(actor,record.packetId,record.revision)};}
export function reviewApp(store:ReviewStore,users:Record<string,string>){
 const entries=Object.entries(users);if(!entries.length||entries.some(([actor,token])=>!/^[A-Za-z0-9_-]{3,64}$/.test(actor)||actor==='UNASSIGNED'||typeof token!=='string'||token.length<32)||new Set(entries.map(([,t])=>t)).size!==entries.length)throw new Error('EVALUATION_STRONG_DISTINCT_USER_TOKENS_REQUIRED');
 const guide=JSON.parse(readFileSync(resolve('docs/ai-v3/expert-knowledge/expert-principles.json'),'utf8')).principles as {id:string;preferredAction:string}[];
 const app=express();app.disable('x-powered-by');app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'});next();});
 for(const [url,file,type] of [['/','expert-review.html','html'],['/app.js','expert-review.js','js'],['/save-recovery.js','save-recovery.js','js'],['/style.css','expert-review.css','css']])app.get(url,(_req,res)=>res.type(type).send(readFileSync(resolve('src/expert-review',file),'utf8')));
 app.use('/api',(req,res,next)=>{const actor=authenticatedActor(req.headers.authorization,users);if(!actor){res.status(401).json({error:'AUTHENTICATION_REQUIRED'});return;}res.locals.actor=actor;const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`){res.status(403).json({error:'ORIGIN_REJECTED'});return;}next();});
 app.use(express.json({limit:'32kb',strict:true}));
 app.get('/api/session',(_req,res)=>{
  const cases=store.assigned.map(p=>{const last=store.latest(res.locals.actor,p.id);return {id:p.id,revision:last?.revision??0,status:last?.submission.status??'unreviewed',state:caseState(last)};});
  res.json({actor:res.locals.actor,assignmentId:store.bundle.hash,cases,summary:Object.fromEntries(['not_reviewed','completed','skipped','ambiguous','insufficient'].map(state=>[state,cases.filter(c=>c.state===state).length])),resumeCaseId:cases.find(c=>c.state==='not_reviewed')?.id??null,cards:CARDS.map((c,index)=>({index,id:c.id,rank:c.rank,suit:c.suit})),principles:store.principleIds.map(id=>({id,description:guide.find(p=>p.id===id)?.preferredAction??id}))});
 });
 app.get('/api/cases/:id',(req,res)=>{try{res.json(store.case(res.locals.actor,req.params.id));}catch{res.status(404).json({error:'UNKNOWN_CASE'});}});
 app.post('/api/cases/:id/reviews',(req,res)=>{
  let record:ReviewRecord;
  try{record=store.submit(res.locals.actor,req.params.id,req.body);}catch(e){
   const reason=e instanceof Error?e.message:'';
   // Only named pre-persistence validation errors are confirmed rejections.
   if(/^(EVALUATION|V3)_[A-Z_]+$/.test(reason))res.status(400).json({error:reason,saveOutcome:'rejected'});
   else res.status(503).json({error:'SAVE_OUTCOME_UNCERTAIN',saveOutcome:'uncertain'});
   return;
  }
  try{res.json(savedResponse(store,res.locals.actor,record));}catch{res.status(503).json({error:'SAVE_OUTCOME_UNCERTAIN',saveOutcome:'uncertain'});}
 });
 app.get('/api/cases/:id/requests/:requestId',(req,res)=>{
  try{const record=store.request(res.locals.actor,req.params.id,req.params.requestId);res.json(record?{found:true,...savedResponse(store,res.locals.actor,record),submission:record.submission}:{found:false});}catch{res.status(404).json({error:'REQUEST_LOOKUP_FAILED'});}
 });
 app.get('/api/cases/:id/comparison',(req,res)=>{try{res.json(store.comparison(res.locals.actor,req.params.id));}catch{res.status(403).json({error:'BLIND_REVIEW_REQUIRED'});}});
 app.get('/api/report',(_req,res)=>res.json(evaluationReport(store.recordsFor(res.locals.actor),store.bundle)));
 app.use((_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
 app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{const type=(error as {type?:string})?.type;if(type==='entity.too.large'||type==='entity.parse.failed'){res.status(type==='entity.too.large'?413:400).json({error:'INVALID_JSON_REQUEST',saveOutcome:'rejected'});return;}res.status(503).json({error:'SAVE_OUTCOME_UNCERTAIN',saveOutcome:'uncertain'});});return app;
}
