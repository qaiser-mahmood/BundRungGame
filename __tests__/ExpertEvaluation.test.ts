import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Server} from 'node:http';
import {prepareEvaluation,restrictedPrivate,type EvaluationBundle} from '../server/ai/v3/evaluation/Prepare';
import {ReviewStore,type Submission} from '../server/ai/v3/evaluation/Store';
import {reviewApp,authenticatedActor} from '../server/ai/v3/evaluation/Server';
import {firstIndependentReviews} from '../server/ai/v3/evaluation/IndependentReviews';
import {evaluationReport} from '../server/ai/v3/evaluation/Metrics';
import {verifyCorpus,digest} from '../server/ai/v3/data/Corpus';
import {verifyReplay} from '../scripts/v3-expert-data';
import {publicControl,collectionCoverage} from '../server/ai/v3/evaluation/Coverage';
import {verifyAccepted} from '../server/ai/v3/data/Annotations';
let bundle:EvaluationBundle,root:string;
// Test labels below are numerical software fixtures, never expert evidence.
const actor='unit_expert',principles=['EK-C1'];
function store(){return new ReviewStore(mkdtempSync(join(root,'store-')),bundle,principles);}
function submission(s:ReviewStore,patch:Partial<Submission>={}):Submission{return {requestId:'test-request-001',expectedRevision:0,status:'reviewed',selected:s.assigned[0].observation.legal[0],rankedAlternatives:[],reasoning:'Synthetic software test only; not expert training data.',signals:'',uncertainty:'unit fixture',confidence:null,principles:[],...patch};}
beforeAll(async()=>{root=mkdtempSync(join(tmpdir(),'expert-evaluation-'));bundle=await prepareEvaluation({seed:2200700,trainDeals:1,validationDeals:1,holdoutDeals:1,positionsPerDeal:12,sourceCommit:'0'.repeat(40),calling:'mixed'});});
afterAll(()=>rmSync(root,{recursive:true,force:true}));
describe('official replay and strict observation boundary',()=>{
 it('replays deterministic engine positions and predictions without using narratives',async()=>{verifyReplay(bundle.corpus);const again=await prepareEvaluation(bundle.corpus.manifest.config);expect(again.corpus.manifest).toEqual(bundle.corpus.manifest);expect(Object.values(again.predictions).map(p=>p.v2.action)).toEqual(Object.values(bundle.predictions).map(p=>p.v2.action));});
 it('isolates full-deal and opponent-family splits, assigns one view per deal',()=>{const s=store();expect(new Set(s.assigned.map(p=>p.dealKey)).size).toBe(s.assigned.length);const changed=structuredClone(bundle.corpus);changed.manifest.sources[1].split=changed.manifest.sources[0].split==='train'?'holdout':'train';const {manifestHash,...base}=changed.manifest;changed.manifest.manifestHash=digest(base);expect(()=>verifyCorpus(changed)).toThrow('V3_SPLIT_LEAKAGE');});
 it('withholds predictions, seed ledger and undisclosed trump before submission',()=>{const s=store(),p=s.assigned[0],dto=s.case(actor,p.id),json=JSON.stringify(dto);expect(json).not.toMatch(/predictions|seed|dealKey|manifest|sourceCommit|split/);expect(()=>s.comparison(actor,p.id)).toThrow('BLIND');for(const packet of s.assigned)if(!packet.observation.trumpRevealed)expect(packet.observation.publicTrump).toBeNull();});
 it('removes secret trump, partner inspections and concealed memories from AI inputs',()=>{const priv={myHand:[],myTrumpCard:{id:'S_A'},secretTrumpSuit:'SPADES',partnerHand:[{id:'H_A'}],teammateFaceDownCard:{id:'D_A'},knownConcealedCards:{hidden:{id:'C_A'}}} as any;const a=restrictedPrivate(priv,false),b=restrictedPrivate({...priv,myTrumpCard:{id:'C_2'},secretTrumpSuit:'CLUBS',partnerHand:[{id:'D_K'}]},false);expect(a).toEqual(b);expect(a.partnerHand).toBeNull();expect(a.knownConcealedCards).toEqual({});});
 it('rejects a relabelled AI version and conservatively treats concealed control as unknown',()=>{const changed=structuredClone(bundle);changed.predictions[Object.keys(changed.predictions)[0]].v2.version='invented';const {hash,...base}=changed;changed.hash=digest(base);expect(()=>new ReviewStore(join(root,'bad-model'),changed,principles)).toThrow('MODEL_IDENTITY');const o=structuredClone(store().assigned[0].observation);o.history.push({trick:o.currentTrick,seat:1,card:null,lead:o.currentLead,aceDown:null,trumpRevealedAtPlay:false});expect(publicControl(o)).toBe('unknown-or-leading');expect(collectionCoverage(bundle).assigned).toBe(3);});
 it('records actual V2 identity and unavailable V3 instead of invented predictions',()=>{for(const ps of Object.values(bundle.predictions)){expect(ps.v2.policy).toBe('ai-v2-ismcts');expect(ps.v2.version).toBe('0'.repeat(40));expect(ps.v2.diagnostics?.iterations).toBe(8);expect(ps.v3.status).toBe('not_available');expect(ps.v3.action).toBeNull();}});
});
describe('persistent versioned expert review',()=>{
 it('rejects illegal cards, forged hidden state, invalid ranks and unknown principles',()=>{const s=store(),id=s.assigned[0].id;for(const patch of [{selected:99},{rankedAlternatives:[[s.assigned[0].observation.legal[0]]]},{confidence:2},{principles:['FAKE']},{playerId:'someone_else'},{hiddenHands:{}}])expect(()=>s.submit(actor,id,submission(s,patch as any))).toThrow();});
 it('persists across restart, handles retry idempotently and preserves revision history',()=>{const s=store(),id=s.assigned[0].id,body=submission(s);const first=s.submit(actor,id,body);expect(s.submit(actor,id,body).id).toBe(first.id);const resumed=new ReviewStore(s.directory,bundle,principles);expect(resumed.case(actor,id).revision).toBe(1);expect(resumed.comparison(actor,id).expert).toBe(body.selected);const second=resumed.submit(actor,id,submission(s,{requestId:'test-request-002',expectedRevision:1,reasoning:'Corrected test rationale.'}));expect(second.blindAtSubmission).toBe(false);expect(resumed.recordsFor(actor)).toHaveLength(2);expect(()=>resumed.submit(actor,id,submission(s,{requestId:'test-request-003'}))).toThrow('REVISION_CONFLICT');expect(()=>resumed.submit(actor,id,{...body,reasoning:'conflicting retry'})).toThrow('IDEMPOTENCY_CONFLICT');});
 it('keeps other annotators blind and excludes post-comparison edits from export',()=>{const s=store(),id=s.assigned[0].id;s.submit(actor,id,submission(s,{confidence:.7}));expect(()=>s.comparison('unit_other',id)).toThrow('BLIND');s.submit(actor,id,submission(s,{requestId:'test-request-002',expectedRevision:1,confidence:.9}));const accepted=s.exportTraining();verifyAccepted(bundle.corpus,accepted);expect(accepted.records).toHaveLength(1);expect(accepted.records[0].annotation.actionConfidence).toBe(.7);expect(accepted.records[0].annotation.latent.shortage).toEqual([null,null,null,null]);});
 it('supports skips/ambiguity without fabricating confidence or training labels',()=>{const s=store(),id=s.assigned[0].id;s.submit(actor,id,submission(s,{status:'skipped',selected:null,reasoning:''}));expect(()=>s.comparison(actor,id)).toThrow('BLIND');expect(s.exportTraining().records).toHaveLength(0);const r=s.submit(actor,id,submission(s,{requestId:'test-request-002',expectedRevision:1,status:'ambiguous',selected:null}));expect(r.blindAtSubmission).toBe(true);expect(r.annotation).toBeNull();});
 it('uses available-policy and genuinely ranked denominators for disagreements',()=>{const s=store();s.assigned.forEach((p,i)=>{const predicted=bundle.predictions[p.id].v2.action!,selected=i===0?predicted:p.observation.legal.find(c=>c!==predicted)!;s.submit(actor,p.id,submission(s,{requestId:'metric-request-'+i,selected,rankedAlternatives:i===1?[[predicted]]:[]}));});const r=evaluationReport(s.recordsFor(),bundle);expect(r.models.v2.available).toBe(3);expect(r.models.v2.agreementCount).toBe(1);expect(r.models.v2.disagreements).toBe(2);expect(r.models.v2.topRankedAgreementRate).toBeCloseTo(1/3);expect(r.models.v2.conditionalTop2Tiers).toEqual({compared:1,rate:1});expect(r.groups['split:holdout'].count).toBe(1);const unassigned=bundle.corpus.packets.find(p=>!s.assigned.some(a=>a.id===p.id));if(unassigned)expect(()=>s.case(actor,unassigned.id)).toThrow('UNKNOWN_ASSIGNED');});
 it('reports exact agreement, strata and unavailable denominators without improvement claims',()=>{const s=store(),id=s.assigned[0].id,pred=bundle.predictions[id].v2.action!;s.submit(actor,id,submission(s,{selected:pred,principles:['EK-C1']}));const r=evaluationReport(s.recordsFor(),bundle);expect(r.models.v2.topRankedAgreementRate).toBe(1);expect(r.models.v3.topRankedAgreementRate).toBeNull();expect(r.groups['principle:EK-C1'].count).toBe(1);expect(r.confidenceInterval).toBeNull();expect(r.trainingPerformed).toBe(false);expect(evaluationReport([],bundle).reviewedSituations).toBe(0);});
});
describe('first genuinely independent review selection',()=>{
 it('keeps the first blind decision and its export even if a later revision is marked blind',()=>{
  const s=store(),id=s.assigned[0].id,pred=bundle.predictions[id].v2.action!,other=s.assigned[0].observation.legal.find(c=>c!==pred)!;
  s.submit(actor,id,submission(s,{selected:pred,confidence:.7}));const before=evaluationReport(s.recordsFor(),bundle);
  s.submit(actor,id,submission(s,{requestId:'later-request-001',expectedRevision:1,selected:other,confidence:.9}));
  expect(s.recordsFor()[1].blindAtSubmission).toBe(false);
  const history=s.recordsFor();history[1].blindAtSubmission=true; // Simulate imported legacy metadata; no actual expert records edited.
  expect(firstIndependentReviews(history).map(r=>r.revision)).toEqual([1]);
  expect(firstIndependentReviews([...history].reverse()).map(r=>r.revision)).toEqual([1]);
  expect(evaluationReport(history,bundle).models).toEqual(before.models);
  writeFileSync(join(s.directory,'reviews.json'),JSON.stringify({bundleHash:bundle.hash,recordsHash:digest(history),records:history}));
  const resumed=new ReviewStore(s.directory,bundle,principles),exported=resumed.exportTraining();
  expect(resumed.recordsFor()).toHaveLength(2);expect(exported.records).toHaveLength(1);expect(exported.records[0].annotation.revision).toBe(1);expect(exported.records[0].annotation.actionConfidence).toBe(.7);verifyAccepted(bundle.corpus,exported);
 });
 it('does not inflate independent or status counts for duplicate records/retries',()=>{
  const s=store(),id=s.assigned[0].id,body=submission(s,{confidence:.8});s.submit(actor,id,body);s.submit(actor,id,body);
  const history=s.recordsFor(),duplicate=[...history,structuredClone(history[0])];
  expect(evaluationReport(duplicate,bundle)).toEqual(evaluationReport(history,bundle));expect(firstIndependentReviews(duplicate)).toHaveLength(1);expect(s.recordsFor()).toHaveLength(1);
  const conflicting=structuredClone(history[0]);conflicting.submission.reasoning='Conflicting same revision';expect(()=>evaluationReport([...history,conflicting],bundle)).toThrow('CONFLICTING_REVIEW_REVISION');
 });
 it('keeps separate independent decisions for multiple annotators on one case',()=>{
  const s=store(),id=s.assigned[0].id;s.submit(actor,id,submission(s,{confidence:.6}));s.submit('unit_other',id,submission(s,{confidence:.9}));
  expect(evaluationReport(s.recordsFor(),bundle).reviewedSituations).toBe(2);expect(s.exportTraining().records).toHaveLength(2);
 });
 it('selects the first actual review after a skip and never substitutes later confidence',()=>{
  const s=store(),id=s.assigned[0].id;s.submit(actor,id,submission(s,{status:'skipped',selected:null,reasoning:''}));
  s.submit(actor,id,submission(s,{requestId:'after-skip-001',expectedRevision:1,confidence:null}));
  s.submit(actor,id,submission(s,{requestId:'after-skip-002',expectedRevision:2,confidence:.9}));
  expect(firstIndependentReviews(s.recordsFor()).map(r=>r.revision)).toEqual([2]);expect(evaluationReport(s.recordsFor(),bundle).reviewedSituations).toBe(1);expect(s.exportTraining().records).toHaveLength(0);
 });
 it('does not restore independence after an ambiguous answer unlocked comparison',()=>{
  const s=store(),id=s.assigned[0].id;s.submit(actor,id,submission(s,{status:'ambiguous',selected:null}));s.submit(actor,id,submission(s,{requestId:'after-ambiguous-001',expectedRevision:1,confidence:.8}));const history=s.recordsFor();history[1].blindAtSubmission=true;
  expect(firstIndependentReviews(history)).toHaveLength(0);expect(evaluationReport(history,bundle).reviewedSituations).toBe(0);
 });
});
describe('authenticated standalone HTTP review service',()=>{
 let server:Server,url:string,s:ReviewStore;const key='a'.repeat(40),other='b'.repeat(40);
 beforeAll(async()=>{s=store();server=reviewApp(s,{unit_expert:key,unit_other:other}).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));url='http://127.0.0.1:'+(server.address() as any).port;});
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));});
 it('requires authentication and never exposes a private corpus/export route',async()=>{expect(authenticatedActor('Bearer wrong',{unit_expert:key})).toBeNull();expect((await fetch(url+'/api/session')).status).toBe(401);expect((await fetch(url+'/api/export',{headers:{Authorization:'Bearer '+key}})).status).toBe(404);});
 it('blinds HTTP responses, enforces actor identity, and reveals only after saved review',async()=>{const headers={Authorization:'Bearer '+key,'Content-Type':'application/json'},id=s.assigned[0].id;expect((await fetch(url+`/api/cases/${id}/comparison`,{headers})).status).toBe(403);const pre=await (await fetch(url+`/api/cases/${id}`,{headers})).text();expect(pre).not.toMatch(/predictions|seed|split/);const forged=await fetch(url+`/api/cases/${id}/reviews`,{method:'POST',headers,body:JSON.stringify({...submission(s),annotatorId:'unit_other'})});expect(forged.status).toBe(400);const saved=await fetch(url+`/api/cases/${id}/reviews`,{method:'POST',headers,body:JSON.stringify(submission(s))});expect(saved.status).toBe(200);expect((await saved.json()).comparison.predictions.v3.status).toBe('not_available');expect((await fetch(url+`/api/cases/${id}/comparison`,{headers:{Authorization:'Bearer '+other}})).status).toBe(403);});
 it('returns the original comparison on a retry after a later revision',async()=>{
  const headers={Authorization:'Bearer '+key,'Content-Type':'application/json'},id=s.assigned[0].id,original=submission(s),alternate=s.assigned[0].observation.legal.find(c=>c!==original.selected)!;
  const revised=await fetch(url+`/api/cases/${id}/reviews`,{method:'POST',headers,body:JSON.stringify(submission(s,{requestId:'http-revision-002',expectedRevision:1,selected:alternate}))});expect(revised.status).toBe(200);
  const retry=await fetch(url+`/api/cases/${id}/reviews`,{method:'POST',headers,body:JSON.stringify(original)}),data=await retry.json();expect(data.revision).toBe(1);expect(data.comparison.revision).toBe(1);expect(data.comparison.expert).toBe(original.selected);
 });
 it('rejects cross-origin submissions and serves a privacy-preserving client',async()=>{expect((await fetch(url+'/api/session',{headers:{Authorization:'Bearer '+key,Origin:'https://unrelated.example'}})).status).toBe(403);const page=await fetch(url+'/');expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");expect(await page.text()).toContain('Save and compare');});
});
