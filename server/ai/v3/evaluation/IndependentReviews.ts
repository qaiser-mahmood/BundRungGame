import type {ReviewRecord} from './Store';
import {digest} from '../data/Integrity';

/** Normalize reporting input only. Never edit the append-only stored history. */
export function uniqueReviewHistory(records:readonly ReviewRecord[]):ReviewRecord[] {
 const unique=new Map<string,ReviewRecord>();
 for(const record of records){
  const key=JSON.stringify([record.annotatorId,record.packetId,record.revision]),prior=unique.get(key);
  if(prior){if(digest(prior)!==digest(record))throw new Error('EVALUATION_CONFLICTING_REVIEW_REVISION');}
  else unique.set(key,record);
 }
 // Revision is authoritative within an actor/packet, even for reordered imports.
 return [...unique.values()].sort((a,b)=>a.revision-b.revision);
}

/** First genuinely independent decision, not the last label marked blind.
 * A non-skip submission unlocks AI comparison, including ambiguous/insufficient
 * answers. Subsequent revisions cannot restore independence. A skip does not.
 */
export function firstIndependentReviews(records:readonly ReviewRecord[]):ReviewRecord[] {
 const exposed=new Set<string>(),selected:ReviewRecord[]=[];
 for(const r of uniqueReviewHistory(records)){
  const key=JSON.stringify([r.annotatorId,r.packetId]);
  if(exposed.has(key)||r.submission.status==='skipped')continue;
  if(r.blindAtSubmission&&r.submission.status==='reviewed'&&r.submission.selected!==null)selected.push(r);
  exposed.add(key);
 }
 return selected;
}
