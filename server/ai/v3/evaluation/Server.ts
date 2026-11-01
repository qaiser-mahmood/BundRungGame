import express from 'express';
import {timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ReviewStore} from './Store';
import {evaluationReport} from './Metrics';
import {CARDS} from '../../v2/simulation/CompactState';
export function authenticatedActor(header:unknown,users:Record<string,string>):string|null {
 if(typeof header!=='string'||!header.startsWith('Bearer '))return null;const token=Buffer.from(header.slice(7));
 for(const [actor,key] of Object.entries(users)){const secret=Buffer.from(key);if(secret.length===token.length&&timingSafeEqual(secret,token))return actor;}return null;
}
export function reviewApp(store:ReviewStore,users:Record<string,string>){
 const entries=Object.entries(users);if(!entries.length||entries.some(([actor,token])=>!/^[A-Za-z0-9_-]{3,64}$/.test(actor)||actor==='UNASSIGNED'||typeof token!=='string'||token.length<32)||new Set(entries.map(([,t])=>t)).size!==entries.length)throw new Error('EVALUATION_STRONG_DISTINCT_USER_TOKENS_REQUIRED');
 const guide=JSON.parse(readFileSync(resolve('docs/ai-v3/expert-knowledge/expert-principles.json'),'utf8')).principles as {id:string;preferredAction:string}[];
 const app=express();app.disable('x-powered-by');app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'});next();});
 for(const [url,file,type] of [['/','expert-review.html','html'],['/app.js','expert-review.js','js'],['/style.css','expert-review.css','css']])app.get(url,(_req,res)=>res.type(type).send(readFileSync(resolve('src/expert-review',file),'utf8')));
 app.use('/api',(req,res,next)=>{const actor=authenticatedActor(req.headers.authorization,users);if(!actor){res.status(401).json({error:'AUTHENTICATION_REQUIRED'});return;}res.locals.actor=actor;const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`){res.status(403).json({error:'ORIGIN_REJECTED'});return;}next();});
 app.use(express.json({limit:'32kb',strict:true}));
 app.get('/api/session',(_req,res)=>res.json({actor:res.locals.actor,cases:store.assigned.map(p=>({id:p.id,revision:store.latest(res.locals.actor,p.id)?.revision??0})),cards:CARDS.map((c,index)=>({index,id:c.id,rank:c.rank,suit:c.suit})),principles:store.principleIds.map(id=>({id,description:guide.find(p=>p.id===id)?.preferredAction??id}))}));
 app.get('/api/cases/:id',(req,res)=>{try{res.json(store.case(res.locals.actor,req.params.id));}catch{res.status(404).json({error:'UNKNOWN_CASE'});}});
 app.post('/api/cases/:id/reviews',(req,res)=>{try{const record=store.submit(res.locals.actor,req.params.id,req.body);res.json({id:record.id,revision:record.revision,comparison:record.submission.status==='skipped'?null:store.comparison(res.locals.actor,req.params.id)});}catch(e){res.status(400).json({error:e instanceof Error?e.message:'SUBMISSION_REJECTED'});}});
 app.get('/api/cases/:id/comparison',(req,res)=>{try{res.json(store.comparison(res.locals.actor,req.params.id));}catch{res.status(403).json({error:'BLIND_REVIEW_REQUIRED'});}});
 app.get('/api/report',(_req,res)=>res.json(evaluationReport(store.recordsFor(res.locals.actor),store.bundle)));
 app.use((_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
 app.use((_error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(400).json({error:'INVALID_REQUEST'}));return app;
}
