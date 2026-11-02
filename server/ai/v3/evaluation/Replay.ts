import {setupCorpusGame,digest,initialDealKey,type Corpus,type DecisionPacket} from '../data/Corpus';
import {observeDecision,observePlayerDecision} from '../data/Observation';
import {advanceForced} from '../../planning/MonteCarloPlanner';
import {seededRandom} from '../../../../scripts/ai-benchmark';
/** Referee-only deterministic replay. Return only the actual actor's private state. */
export function replayDecision(corpus:Corpus,packet:DecisionPacket){
 const source=corpus.manifest.sources.find(s=>s.packetId===packet.id);if(!source)throw new Error('REPLAY_SOURCE_MISSING');
 const engine=setupCorpusGame(corpus.manifest.config,source.seed),random=seededRandom(source.seed^0x7633);
 if(initialDealKey(engine)!==packet.dealKey)throw new Error('REPLAY_INITIAL_DEAL_MISMATCH');
 for(let step=0;step<180&&engine.getPhase()==='TRICK_PLAYING';step++){
  if(advanceForced(engine))continue;
  const state=engine.getPublicState(),priv=engine.getPrivateState(state.currentTurnPlayerId!),legal=engine.getLegalCardsForPlayer(priv.myPlayerId);
  if(legal.length>=2){const observed=corpus.manifest.config.observationVersion===2?observePlayerDecision(state,priv):observeDecision(state,priv);if(digest(observed)===packet.observationHash){if(digest(observed)!==digest(packet.observation)||digest(legal.map(c=>c.id).sort())!==digest(priv.legalPlayableCardIds.slice().sort()))throw new Error('REPLAY_OBSERVATION_MISMATCH');return {state,priv,legal};}}
  const ordered=legal.slice().sort((a,b)=>a.playValue-b.playValue||a.id.localeCompare(b.id)),chosen=source.opponentStyle==='lowest-legal'?ordered[0]:source.opponentStyle==='highest-legal'?ordered.at(-1)!:ordered[Math.floor(random()*ordered.length)];if(!chosen)throw new Error('REPLAY_NO_LEGAL');engine.playCard(priv.myPlayerId,chosen.id);
 }
 throw new Error('REPLAY_CASE_NOT_FOUND');
}
