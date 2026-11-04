import {describe,it,expect} from 'vitest';
import {generateCorpus,verifyCorpus,digest,Corpus} from '../server/ai/v3/data/Corpus';
import {annotationTemplate,importAnnotations,annotationReport,verifyAccepted,AnnotationBatch} from '../server/ai/v3/data/Annotations';
import {trainingRows,supervisionStatus} from '../server/ai/v3/learning/Rows';
import {verifyReplay,writeBundle,readCorpus,dataCLI} from '../scripts/v3-expert-data';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const config={seed:1200500,trainDeals:2,validationDeals:1,holdoutDeals:1,positionsPerDeal:4,sourceCommit:'0'.repeat(40)};
const corpus=generateCorpus(config);
const firstAssigned=corpus.packets.find(p=>p.id===annotationTemplate(corpus).annotations[0].packetId)!;
function batch(c=corpus,id='unit_expert_a'):AnnotationBatch {
 const b=annotationTemplate(c,id);b.provenance.kind='human-expert';
 // Artificial format fixtures for validation only, never published expert data.
 b.annotations=b.annotations.slice(0,1);const a=b.annotations[0],legal=c.packets.find(p=>p.id===a.packetId)!.observation.legal;
 a.rankedActions=[[legal[0]],[legal[1]]];a.actionConfidence=.8;a.reasoning='Unit-test format fixture, not an expert demonstration.';return b;
}
function rehash(c:Corpus){c.manifest.packetHash=digest(c.packets);const {manifestHash,...base}=c.manifest;c.manifest.manifestHash=digest(base);return c;}
describe('V3 official packet provenance and annotation workflow',()=>{
 it('regenerates exact manifest/packets without global RNG or live-state artifacts',()=>{
  const random=Math.random,again=generateCorpus(config);expect(again).toEqual(corpus);expect(Math.random).toBe(random);verifyReplay(corpus);
  expect(corpus.packets.length).toBe(16);expect(JSON.stringify(corpus.packets)).not.toContain('"seed"');expect(JSON.stringify(corpus.packets)).not.toContain('opponentStyle');
 });
 it('keeps initial deals, observation aliases and opponent styles disjoint across splits',()=>{
  for(const key of ['dealKey','observationHash','opponentStyle'] as const){const seen=new Map<string,string>();for(const r of corpus.manifest.sources){expect(!seen.has(r[key])||seen.get(r[key])===r.split).toBe(true);seen.set(r[key],r.split);}}
  const leaked=structuredClone(corpus);leaked.manifest.sources[0].split='holdout';expect(()=>verifyCorpus(rehash(leaked))).toThrow('V3_SPLIT_LEAKAGE');
 });
 it('detects feature tampering even when the outer packet digest is recomputed',()=>{
  const bad=structuredClone(corpus);bad.packets[0].features[0]=1-bad.packets[0].features[0];expect(()=>verifyCorpus(rehash(bad))).toThrow('V3_PACKET_INTEGRITY');
 });
 it('does not treat blank templates or heuristic actions as expert labels',()=>{
  const b=annotationTemplate(corpus);expect(b.annotations.every(a=>!a.rankedActions.length&&a.latent.shortage.every(l=>l===null)&&a.latent.returnSuit===null)).toBe(true);
  expect(()=>importAnnotations(corpus,[b])).toThrow('V3_HUMAN_ANNOTATION_PROVENANCE_REQUIRED');expect(supervisionStatus(corpus).readyForBaselineTraining).toBe(false);
 });
 it('checks legal rankings, duplicates, coverage, hashes and label probabilities',()=>{
  const b=batch();expect(importAnnotations(corpus,[b]).records.length).toBe(1);
  const illegal=structuredClone(b);illegal.annotations[0].rankedActions=[[firstAssigned.mask.findIndex(m=>!m)]];expect(()=>importAnnotations(corpus,[illegal])).toThrow('V3_ILLEGAL_OR_INCOMPLETE_RANKING');
  const dup=structuredClone(b);dup.annotations[0].rankedActions.push(dup.annotations[0].rankedActions[0]);expect(()=>importAnnotations(corpus,[dup])).toThrow();
  const complete=structuredClone(b);complete.annotations[0].coverage='complete';if(firstAssigned.observation.legal.length>2)expect(()=>importAnnotations(corpus,[complete])).toThrow();
  const wrong=structuredClone(b);wrong.annotations[0].observationHash='f'.repeat(64);expect(()=>importAnnotations(corpus,[wrong])).toThrow();
  const probs=structuredClone(b);probs.annotations[0].latent.returnSuit={probabilities:[1,1,0,0,0],confidence:.8,uncertain:false,basis:'expert-belief',rationale:'Format test.'};expect(()=>importAnnotations(corpus,[probs])).toThrow('V3_LATENT_LABEL_SCHEMA');
 });
 it('preserves disagreement and explicit unknown/uncertain labels',()=>{
  const a=batch(),b=batch(corpus,'unit_expert_b');b.annotations[0].rankedActions.reverse();const data=importAnnotations(corpus,[a,b]),report=annotationReport(data);
  expect(report.annotators).toBe(2);expect(report.disagreement.topTierOverlapRate).toBe(0);expect(data.records[0].annotation.latent.returnSuit).toBeNull();
  const uncertain=structuredClone(a);uncertain.annotations[0].latent.returnSuit={probabilities:[.2,.2,.2,.2,.2],confidence:.3,uncertain:true,basis:'expert-belief',rationale:'Ambiguous unit format fixture.'};
  expect(importAnnotations(corpus,[uncertain]).records[0].annotation.latent.returnSuit!.probabilities).toEqual([.2,.2,.2,.2,.2]);
 });
 it('assigns one view per deal and rejects repeated-annotator future/cross-seat contamination',()=>{
  const template=annotationTemplate(corpus,'unit_expert_a');expect(template.annotations.length).toBe(4);
  const first=firstAssigned,other=corpus.packets.find(p=>p.dealKey===first.dealKey&&p.id!==first.id)!;
  expect(()=>annotationTemplate(corpus,'unit_expert_a',[first.id,other.id])).toThrow('V3_ASSIGNMENT_CROSS_VIEW');
  const a=batch(),b=batch();b.annotations[0].packetId=other.id;b.annotations[0].observationHash=other.observationHash;b.annotations[0].rankedActions=other.observation.legal.slice(0,2).map(c=>[c]);
  expect(()=>importAnnotations(corpus,[a,b])).toThrow('V3_ANNOTATOR_CROSS_VIEW_OR_FUTURE_LEAKAGE');
 });
 it('does not pass synthetic trajectories off as a partner self-report',()=>{
  const b=batch();b.annotations[0].latent.leadControl={probabilities:[1,0,0],confidence:1,uncertain:false,basis:'partner-self-report',rationale:'Not a human trajectory.'};expect(()=>importAnnotations(corpus,[b])).toThrow('V3_SELF_REPORT_REQUIRES_HUMAN_TRAJECTORY');
 });
 it('supports idempotent imports, conflict checks and explicit revisions',()=>{
  const a=batch(),same=JSON.parse(JSON.stringify(a));expect(importAnnotations(corpus,[a,same]).records.length).toBe(1);
  const conflict=structuredClone(a);conflict.annotations[0].rankedActions.reverse();expect(()=>importAnnotations(corpus,[a,conflict])).toThrow('V3_CONFLICTING_REVISION');
  conflict.annotations[0].revision=2;const accepted=importAnnotations(corpus,[a,conflict]);expect(annotationReport(accepted).revisionRecords).toBe(2);expect(annotationReport(accepted).activeRecords).toBe(1);expect(trainingRows(corpus,accepted,'train')[0].target[conflict.annotations[0].rankedActions[0][0]]).toBe(1);
 });
 it('does not turn omitted alternatives into training negatives or multiply annotator case weights',()=>{
  const a=batch(),b=batch(corpus,'unit_expert_b'),data=importAnnotations(corpus,[a,b]),rows=trainingRows(corpus,data,'train');
  expect(rows).toHaveLength(2);expect(rows[0].mask.filter(Boolean)).toHaveLength(2);expect(rows.reduce((n,r)=>n+r.weight,0)).toBe(.8);expect(rows[0].coverage).toBe('partial');
 });
 it('rejects holdout training and forged split provenance',()=>{
  const data=importAnnotations(corpus,[batch()]);expect(()=>trainingRows(corpus,data,'holdout')).toThrow('V3_FROZEN_HOLDOUT_NOT_TRAINING_DATA');
  const forged=structuredClone(data);forged.records[0].split='holdout';const {datasetHash,...base}=forged;forged.datasetHash=digest(base);expect(()=>verifyAccepted(corpus,forged)).toThrow('V3_ANNOTATION_SOURCE');
 });
 it('roundtrips exports and renders only observable data',()=>{
  const dir=mkdtempSync(join(tmpdir(),'v3-workflow-'));try{
   const root=join(dir,'corpus');writeBundle(root,{'private/packets.json':corpus.packets,'private/manifest.json':corpus.manifest});expect(readCorpus(root)).toEqual(corpus);expect(()=>writeBundle(root,{})).toThrow('V3_OUTPUT_EXISTS');
   const output=join(dir,'view.md');dataCLI(['render','--corpus',root,'--packet',firstAssigned.id,'--output',output]);const text=readFileSync(output,'utf8');expect(text).toContain('No action or intention labels are prefilled');expect(text).not.toContain('opponentStyle');

  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('hashes object-key order canonically while preserving chronological arrays',()=>{
  expect(digest({a:1,b:2})).toBe(digest({b:2,a:1}));expect(digest([1,2])).not.toBe(digest([2,1]));
 });
});
