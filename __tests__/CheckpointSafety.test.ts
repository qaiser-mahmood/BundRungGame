import {describe,it,expect} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {ModelManager} from '../server/ai/neural/ModelManager';
describe('checkpoint safety',()=>{
  it('loads the preserved baseline and atomically creates only explicit new compatible checkpoints',()=>{
    const canonical=resolve('server/ai/models/bund_rung_brain.json'),before=readFileSync(canonical);
    const model=ModelManager.loadModel(canonical),directory=mkdtempSync(join(tmpdir(),'ai-checkpoint-'));
    try{
      expect(()=>ModelManager.saveModel(model)).toThrow();expect(()=>ModelManager.saveModel(model,canonical)).toThrow();
      const output=join(directory,'candidate.json');ModelManager.saveModel(model,output);
      expect(ModelManager.loadModel(output).forward(new Float32Array(245))).toEqual(model.forward(new Float32Array(245)));
      expect(()=>ModelManager.saveModel(model,output)).toThrow();
      const link=join(directory,'alias.json');symlinkSync(canonical,link);expect(()=>ModelManager.saveModel(model,link)).toThrow();
      expect(readFileSync(canonical)).toEqual(before);
    }finally{rmSync(directory,{recursive:true,force:true});}
  });
});
