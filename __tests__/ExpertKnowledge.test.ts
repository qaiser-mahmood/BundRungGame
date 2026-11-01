import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateFiles,validateKnowledge,validateSchema} from '../scripts/validate-expert-knowledge';
const dir='docs/ai-v3/expert-knowledge/';
const read=(file:string)=>JSON.parse(readFileSync(dir+file,'utf8'));
function fixture(){const p=read('expert-principles.json'),s=read('scenario-examples.json'),schema=read('knowledge-schema.json'),text=readFileSync(dir+'expert-source.md','utf8');return {p,s,schema,text,check:()=>validateKnowledge(p,s,schema,text)};}
describe('narrative expert knowledge validation',()=>{
 it('validates all versioned documents without manufacturing training examples',()=>{expect(validateFiles()).toEqual({schemaVersion:'1.0.0',principles:28,scenarios:20,corrections:6,allNarrativeOnly:true,trainingExamples:0});});
 it('rejects duplicate IDs',()=>{const f=fixture();f.p.principles.push(f.p.principles[0]);expect(f.check).toThrow('Duplicate ID');});
 it('rejects missing fields, invalid categories and fake numerical confidence',()=>{for(const mutate of [(p:any)=>delete p.reasoning,(p:any)=>p.category='made_up',(p:any)=>p.certainty=.99]){const f=fixture();mutate(f.p.principles[0]);expect(f.check).toThrow();}});
 it('rejects dangling scenario and correction references',()=>{for(const target of ['scenario','correction']){const f=fixture();if(target==='scenario')f.p.principles[0].scenarioIds=['SC-Z99'];else f.s.scenarios[0].correctionIds=['COR-99'];expect(f.check).toThrow('Unknown reference');}});
 it('rejects inconsistent supersession and corrections to superseded knowledge',()=>{const f=fixture();f.p.principles[0].status='superseded';expect(f.check).toThrow('Inconsistent supersession');const g=fixture();const p=g.p.principles.find((p:any)=>p.id==='EK-E1');p.status='superseded';p.supersededBy=['EK-I1'];expect(g.check).toThrow('Correction points to superseded');});
 it('does not allow a rejected interpretation to remain an active action',()=>{const f=fixture();f.p.principles[0].preferredAction=f.p.corrections[0].rejectedInterpretation;expect(f.check).toThrow('Rejected interpretation active');});
 it('requires source integrity and literal evidence',()=>{const f=fixture();f.p.principles[0].evidence[0].quote='Invented expert statement';expect(f.check).toThrow('Untraceable evidence');const g=fixture();g.p.source.sha256='0'.repeat(64);expect(g.check).toThrow('Source hash mismatch');});
 it('requires engine evidence for mechanics and prevents preferences masquerading as rules',()=>{const f=fixture();f.p.principles[0].classification='verified_game_mechanic';expect(f.check).toThrow('Mechanic verification');});
 it('rejects complete-state claims and invented hidden opponent hands',()=>{for(const mutate of [(s:any)=>s.observationCompleteness='complete',(s:any)=>s.context.opponentHands={opponent:['S_A']},(s:any)=>s.missingInformation=[]]){const f=fixture();mutate(f.s.scenarios[0]);expect(f.check).toThrow();}});
 it('rejects a known undisclosed trump identity',()=>{const f=fixture();const s=f.s.scenarios.find((s:any)=>s.context.rungVisibility==='hidden');s.context.knownTrumpSuit='SPADES';expect(f.check).toThrow('Undisclosed trump');});
 it('keeps Scenario 21 unanswered and preserves only known diamonds reveal context',()=>{const f=fixture();const s=f.s.scenarios.find((s:any)=>s.discussionNumber===21);expect(s.expertSelectedCard).toBeNull();expect(s.context.knownTrumpSuit).toBe('DIAMONDS');s.expertResponse='Play a high trump';expect(f.check).toThrow('Unanswered scenario');});
 it('rejects malformed cards and impossible duplicated visible cards',()=>{const f=fixture();f.s.scenarios[0].context.ownCards[0]='D_1';expect(f.check).toThrow();const g=fixture();g.s.scenarios[0].context.ownCards.push('D_4');expect(g.check).toThrow('Duplicate visible card');});
 it('uses strict schema variants and fails closed on unsupported schema vocabulary',()=>{const f=fixture();expect(()=>validateSchema({...read('interview-template.json'),extra:true},f.schema)).toThrow();expect(()=>validateSchema({}, {type:'object',unknownConstraint:true})).toThrow('unsupported schema');});
});
