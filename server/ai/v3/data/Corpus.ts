import {digest} from './Integrity';
import type {DecisionObservation} from './Observation';
import {observeDecision,vectorize,legalMask,FEATURE_SCHEMA} from './Observation';
import {setupGame,seededRandom} from '../../../../scripts/ai-benchmark';
import {advanceForced} from '../../planning/MonteCarloPlanner';
import type {BundRungEngine} from '../../../engine/BundRungEngine';
export type Split='train'|'validation'|'holdout';
export type OpponentStyle='lowest-legal'|'highest-legal'|'seeded-uniform';
export const CORPUS_SCHEMA='bundrung-v3-annotation-corpus/v1' as const;
export {digest} from './Integrity';
export interface DecisionPacket {
 schema:typeof CORPUS_SCHEMA;id:string;dealKey:string;observationHash:string;observation:DecisionObservation;features:number[];mask:number[];
}
export interface GeneratorConfig {seed:number;trainDeals:number;validationDeals:number;holdoutDeals:number;positionsPerDeal:number;sourceCommit:string;}
export interface SourceRecord {packetId:string;dealKey:string;observationHash:string;seed:number;split:Split;opponentStyle:OpponentStyle;}
export interface Manifest {
 schema:typeof CORPUS_SCHEMA;featureSchema:typeof FEATURE_SCHEMA;generator:'official-engine-observable/v1';config:GeneratorConfig;
 packetHash:string;sources:SourceRecord[];manifestHash:string;
}
export interface Corpus {packets:DecisionPacket[];manifest:Manifest;}
export function packet(observation:DecisionObservation,dealKey:string):DecisionPacket {
 const observationHash=digest(observation),id=digest({dealKey,observationHash});
 return {schema:CORPUS_SCHEMA,id,dealKey,observationHash,observation,features:vectorize(observation),mask:legalMask(observation)};
}
function initialDealKey(engine:BundRungEngine):string {
 const state=engine.getPublicState();
 // Referee-only grouping fingerprint, never features or a target label.
 return digest({dealer:state.dealerPlayerIndex,caller:state.players.findIndex(p=>p.id===state.trumpCallerPlayerId),mode:state.trumpMode,
  owners:state.players.map(p=>{const priv=engine.getPrivateState(p.id);return [...priv.myHand.map(c=>c.id),...(priv.myTrumpCard?[priv.myTrumpCard.id]:[]),
   ...state.currentTrick.cards.filter(c=>c.playerId===p.id).map(c=>(c.card??priv.knownConcealedCards?.[`${state.currentTrick.trickNumber}:${p.id}`]??priv.teammateFaceDownCard)?.id??'concealed')].sort();})});
}
export function generateCorpus(config:GeneratorConfig):Corpus {
 if(!/^[a-f0-9]{40}$/.test(config.sourceCommit)||!Number.isSafeInteger(config.seed)||config.seed<0||config.seed>0xffffffff||![config.trainDeals,config.validationDeals,config.holdoutDeals].every(n=>Number.isSafeInteger(n)&&n>0&&n<=1000)||!Number.isSafeInteger(config.positionsPerDeal)||config.positionsPerDeal<1||config.positionsPerDeal>52)throw new Error('V3_GENERATOR_CONFIG');
 const packets:DecisionPacket[]=[],sources:SourceRecord[]=[];
 const cohorts:{split:Split;deals:number;style:OpponentStyle}[]=[{split:'train',deals:config.trainDeals,style:'lowest-legal'},{split:'validation',deals:config.validationDeals,style:'highest-legal'},{split:'holdout',deals:config.holdoutDeals,style:'seeded-uniform'}];
 let offset=0;
 for(const cohort of cohorts)for(let n=0;n<cohort.deals;n++){
  const seed=(config.seed+offset++)>>>0,engine=setupGame(seed),dealKey=initialDealKey(engine),candidates:DecisionPacket[]=[],random=seededRandom(seed^0x7633);
  for(let step=0;step<180&&engine.getPhase()==='TRICK_PLAYING';step++){
   if(advanceForced(engine))continue;
   const state=engine.getPublicState(),id=state.currentTurnPlayerId!,priv=engine.getPrivateState(id),legal=engine.getLegalCardsForPlayer(id);
   if(!legal.length)throw new Error('V3_GENERATOR_NO_LEGAL');
   if(legal.length>=2)candidates.push(packet(observeDecision(state,priv),dealKey));
   const ordered=legal.slice().sort((a,b)=>a.playValue-b.playValue||a.id.localeCompare(b.id));
   const chosen=cohort.style==='lowest-legal'?ordered[0]:cohort.style==='highest-legal'?ordered.at(-1)!:ordered[Math.floor(random()*ordered.length)];engine.playCard(id,chosen.id);
  }
  if(engine.getPhase()!=='GAME_RESOLVED'&&engine.getPhase()!=='MATCH_OVER')throw new Error('V3_GENERATOR_INCOMPLETE');
  // Deterministic spread across the reachable trajectory, not tactical labels.
  // Evenly spaced unique positions; no dependence on an expert-hypothesis tag.
  const count=Math.min(config.positionsPerDeal,candidates.length);
  const indices=[...new Set(Array.from({length:count},(_,i)=>count===1?Math.floor(candidates.length/2):Math.floor(i*(candidates.length-1)/(count-1))))];
  for(const i of indices){const p=candidates[i];packets.push(p);sources.push({packetId:p.id,dealKey,observationHash:p.observationHash,seed,split:cohort.split,opponentStyle:cohort.style});}
 }
 const base={schema:CORPUS_SCHEMA,featureSchema:FEATURE_SCHEMA,generator:'official-engine-observable/v1' as const,config,packetHash:digest(packets),sources};
 const manifest={...base,manifestHash:digest(base)};const corpus={packets,manifest};verifyCorpus(corpus);return corpus;
}
export function verifyCorpus(corpus:Corpus):void {
 const {manifest:m,packets}=corpus,{manifestHash,...base}=m;
 if(m.schema!==CORPUS_SCHEMA||m.featureSchema!==FEATURE_SCHEMA||m.generator!=='official-engine-observable/v1'||digest(base)!==manifestHash||digest(packets)!==m.packetHash||m.sources.length!==packets.length)throw new Error('V3_CORPUS_INTEGRITY');
 const ids=new Set<string>(),deals=new Map<string,Split>(),aliases=new Map<string,Split>(),styles=new Map<string,Split>();
 for(let i=0;i<packets.length;i++){
  const p=packets[i],s=m.sources[i];if(!['train','validation','holdout'].includes(s.split)||!['lowest-legal','highest-legal','seeded-uniform'].includes(s.opponentStyle))throw new Error('V3_SOURCE_SCHEMA');if(ids.has(p.id)||p.id!==s.packetId||p.dealKey!==s.dealKey||p.observationHash!==s.observationHash||digest(p.observation)!==p.observationHash||digest({dealKey:p.dealKey,observationHash:p.observationHash})!==p.id||digest(vectorize(p.observation))!==digest(p.features)||digest(legalMask(p.observation))!==digest(p.mask))throw new Error('V3_PACKET_INTEGRITY');
  ids.add(p.id);
  for(const [map,key] of [[deals,p.dealKey],[aliases,p.observationHash],[styles,s.opponentStyle]] as const){if(map.has(key)&&map.get(key)!==s.split)throw new Error('V3_SPLIT_LEAKAGE');map.set(key,s.split);}
 }
}

export function assignmentPackets(corpus:Corpus,positionOffset=0):DecisionPacket[]{
 verifyCorpus(corpus);if(!Number.isSafeInteger(positionOffset)||positionOffset<0)throw new Error('V3_ASSIGNMENT_OFFSET');
 const groups=new Map<string,DecisionPacket[]>();for(const p of corpus.packets){const xs=groups.get(p.dealKey)??[];xs.push(p);groups.set(p.dealKey,xs);}
 return [...groups].map(([key,xs])=>xs[(parseInt(key.slice(0,8),16)+positionOffset)%xs.length]);
}
