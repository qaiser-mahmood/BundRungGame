import {BundRungEngine} from '../server/engine/BundRungEngine';
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

describe('documented JSON Schema subset semantics',()=>{
 it('checks local references and their sibling constraints',()=>{
  const schema={$defs:{n:{type:'number'}},$ref:'#/$defs/n',minimum:2};expect(()=>validateSchema(1,schema)).toThrow('numeric range');expect(()=>validateSchema(2,schema)).not.toThrow();
  for(const ref of ['https://example.org/schema','#/$defs/missing','#/$defs/toString','#/properties/a'])expect(()=>validateSchema(2,{$defs:{},$ref:ref})).toThrow();
  expect(()=>validateSchema(1,{$defs:{a:{$ref:'#/$defs/a'}},$ref:'#/$defs/a'})).toThrow('Recursive');
 });
 it('requires exactly one matching branch and preflights even unvisited branches',()=>{
  expect(()=>validateSchema(2,{oneOf:[{type:'number'},{type:'integer'}]})).toThrow('exactly one');expect(()=>validateSchema(null,{oneOf:[{type:'number'},{type:'string'}]})).toThrow();
  expect(()=>validateSchema('ok',{oneOf:[{type:'string'},{type:'number',format:'invented'}]})).toThrow('unsupported');
  expect(()=>validateSchema({}, {properties:{absent:{items:{unknownKeyword:true}}}})).toThrow('unsupported');
  expect(()=>validateSchema({}, {$defs:{unused:{unknownKeyword:true}}})).toThrow('unsupported');
 });
 it('rejects malformed schema structures before inspecting data',()=>{
  for(const schema of [true,null,[],{type:'date'},{type:[]},{type:['string','string']},{required:'id'},{required:[1]},{required:['x','x']},{properties:[]},{$defs:[]},{oneOf:[]},{oneOf:[null]},{items:[]},{enum:[]},{enum:[{a:1},{a:1}]},{pattern:'['},{pattern:1},{minLength:-1},{minItems:1.5},{minimum:'0'},{maximum:Infinity},{additionalProperties:{}},{$schema:'other-dialect'}])expect(()=>validateSchema({},schema as any)).toThrow();
 });
 it('checks nested arrays, required fields and own additional properties',()=>{
  const schema={type:'object',required:['rows'],properties:{rows:{type:'array',minItems:1,items:{type:'object',required:['name'],properties:{name:{type:'string',minLength:1}},additionalProperties:false}}},additionalProperties:false};
  expect(()=>validateSchema({rows:[{name:'ok'}]},schema)).not.toThrow();
  for(const value of [{},{rows:[]},{rows:[{}]},{rows:[{name:2}]},{rows:[{name:'x',extra:1}]},JSON.parse('{"rows":[{"name":"x"}],"toString":1}')])expect(()=>validateSchema(value,schema)).toThrow();
 });
 it('uses deep equality for JSON enum and const values, and handles null distinctly',()=>{
  expect(()=>validateSchema({b:[null,2],a:1},{enum:[{a:1,b:[null,2]}]})).not.toThrow();expect(()=>validateSchema({x:1},{const:{x:2}})).toThrow();
  expect(()=>validateSchema(null,{type:['string','null'],pattern:'^x'})).not.toThrow();expect(()=>validateSchema(null,{type:'object'})).toThrow();
 });
 it('counts Unicode characters and validates finite numbers and integer bounds',()=>{
  expect(()=>validateSchema('😀',{type:'string',minLength:2})).toThrow('minLength');expect(()=>validateSchema('😀',{pattern:'^.$'})).not.toThrow();
  expect(()=>validateSchema(2,{type:'number',minimum:2,maximum:2})).not.toThrow();for(const n of [1,3,NaN,Infinity])expect(()=>validateSchema(n,{type:'number',minimum:2,maximum:2})).toThrow();expect(()=>validateSchema(2.5,{type:'integer'})).toThrow();
 });
 it('keeps semantic privacy and incompleteness guards if the schema is accidentally weakened',()=>{
  const f=fixture();f.schema.$defs.scenario.properties.observationCompleteness={type:'string'};f.s.scenarios[0].observationCompleteness='complete';expect(f.check).toThrow('Incomplete observations');
  const g=fixture();g.schema.$defs.scenario.properties.context.properties.currentTrick.items.properties.visibility={type:'string'};g.s.scenarios[0].context.currentTrick[0].visibility='hidden';expect(g.check).toThrow('Nonpublic play');
 });
 it('rejects self-supersession and engine certainty without mechanic classification',()=>{
  const f=fixture();f.p.principles[0].status='superseded';f.p.principles[0].supersededBy=[f.p.principles[0].id];expect(f.check).toThrow('Invalid replacement');
  const g=fixture();g.p.principles[0].certainty='engine_verified';expect(g.check).toThrow('Mechanic verification');
 });
});

// Regression coverage for the previously documented engine boundary bypass.
describe('GM-REVEAL engine evidence boundary',()=>{
 it('rejects direct request without turn/void permission',()=>{
  const engine=new BundRungEngine();for(let i=1;i<=4;i++)engine.addPlayer('p'+i,'Player '+i);
  const state=engine as any;state.phase='TRICK_PLAYING';state.trumpCallerPlayerId='p1';state.currentTurnPlayerIndex=2;
  state.currentTrick={trickNumber:2,leadPlayerId:'p1',leadSuit:'HEARTS',cards:[{playerId:'p1',card:{id:'H_2',suit:'HEARTS',rank:'2',playValue:2,tossValue:2},playedAt:0},{playerId:'p2',card:{id:'H_4',suit:'HEARTS',rank:'4',playValue:4,tossValue:4},playedAt:1}],winnerPlayerId:null,winningTeam:null};
  state.hands.p2=[{id:'H_3',suit:'HEARTS',rank:'3',playValue:3,tossValue:3}];
  expect(engine.getRevealPermissions('p2').canRequestRungReveal).toBe(false);
  expect(()=>engine.requestTrumpReveal('p2')).toThrow();expect(engine.getPublicState().isTrumpRevealPending).toBe(false);
 });
});
