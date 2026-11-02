import type {EvaluationBundle} from './Prepare';
/** Conservative quarantine, even before local audit. Never silently validate old labels. */
export function legacyCallerCase(bundle:EvaluationBundle,id:string){const p=bundle.corpus.packets.find(p=>p.id===id);return !!p&&p.observation.schema==='bundrung-v3-observable-memory/v1'&&p.observation.caller===0&&!p.observation.trumpRevealed;}
