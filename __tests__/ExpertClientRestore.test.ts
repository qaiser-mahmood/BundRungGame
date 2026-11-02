import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';

// Execute the actual small DOM adapter without a browser or a duplicated implementation.
const source=readFileSync(new URL('../src/expert-review/expert-review.js',import.meta.url),'utf8');
const adapter=source.slice(source.indexOf('function restoreForm('),source.indexOf('async function load('));
function restore(previous:object){
 const controls:Record<string,any>=Object.fromEntries(['reasoning','signals','uncertainty','confidence','status','alternatives','principles'].map(id=>[id,{value:'stale',options:[]} ]));
 controls.principles.options=[{value:'principle',selected:true}];
 const cards=[{value:'1',checked:false},{value:'2',checked:true}];
 runInNewContext(adapter+';restoreForm(previous);',{previous,$:(id:string)=>controls[id],document:{querySelectorAll:()=>cards},cardId:(i:number)=>`C${i}`});
 return {controls,cards};
}
describe('review client restores durable request payloads',()=>{
 it('restores a correction journal after refresh without normal-review-only fields',()=>{
  const {controls,cards}=restore({decision:'keep',selected:1,reasoning:'Original reason',confidence:0.8,status:'reviewed'});
  expect(controls.reasoning.value).toBe('Original reason');expect(controls.confidence.value).toBe(0.8);
  expect(controls.alternatives.value).toBe('');expect(controls.principles.options[0].selected).toBe(false);expect(cards.map(c=>c.checked)).toEqual([true,false]);
 });
 it('retains rankings and principles for original normal-review journals',()=>{
  const {controls}=restore({selected:2,rankedAlternatives:[[1],[3,4]],principles:['principle']});
  expect(controls.alternatives.value).toBe('C1\nC3,C4');expect(controls.principles.options[0].selected).toBe(true);
 });
});
