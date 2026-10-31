import {describe,it,expect} from 'vitest';
import {NeuralNetwork} from '../server/ai/neural/NeuralNetwork';
import {seededRandom,withRandom} from '../scripts/ai-benchmark';
const keys=['w_shared1','b_shared1','w_shared2','b_shared2','w_val1','b_val1','w_val2','b_val2','w_adv1','b_adv1','w_adv2','b_adv2'] as const;
describe('dueling network numerical gradients',()=>{
  it('matches central differences in every tensor including unselected advantage outputs',()=>{
    const net=withRandom(seededRandom(731),()=>new NeuralNetwork(3,5,4,3,3,4));
    const input=new Float32Array([.4,-.2,.7]), targets=net.forward(input);
    targets[0]+=.3;targets[2]-=1.4;const mask=[true,false,true,false];
    const loss=()=>net.forward(input).reduce((sum,q,i)=>{
      if(!mask[i])return sum;const d=Math.abs(q-targets[i]);return sum+(d<=1?.5*d*d:d-.5);
    },0);
    // Float32 parameters/activations: central step 1e-3, absolute tolerance
    // 3e-3 plus 2% relative error; sample both ends and middle of each tensor.
    for(const key of keys)for(const index of [...new Set([0,Math.floor(net[key].length/2),net[key].length-1])]){
      const original=net[key][index],h=.001;
      net[key][index]=original+h;const plus=loss();net[key][index]=original-h;const minus=loss();net[key][index]=original;
      const numerical=(plus-minus)/(2*h), clone=net.clone(),rate=.001;
      const before=clone[key][index];clone.trainStep(input,targets,mask,rate);
      const analytical=(before-clone[key][index])/rate;
      expect(Math.abs(analytical-numerical),`${key}[${index}]: ${analytical} vs ${numerical}`).toBeLessThan(.003+.02*Math.abs(numerical));
    }
  });
  it('rejects invalid masks, dimensions, nonfinite tensors and incompatible metadata',()=>{
    const net=new NeuralNetwork(3,4,4,3,3,4),data=JSON.parse(JSON.stringify(net.toJSON()));
    expect(()=>net.forward(new Float32Array(2))).toThrow();
    expect(()=>net.selectAction(new Float32Array(3),[],0)).toThrow();
    for(const key of keys){const broken=structuredClone(data);broken[key][0]=NaN;expect(()=>NeuralNetwork.fromJSON(broken)).toThrow();broken[key]=[];expect(()=>NeuralNetwork.fromJSON(broken)).toThrow();}
    expect(()=>NeuralNetwork.fromJSON({...data,featureSchema:'future'})).toThrow();
    expect(()=>NeuralNetwork.fromJSON({...data,architecture:'unknown'})).toThrow();
  });
});
