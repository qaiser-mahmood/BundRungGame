import {readFileSync} from 'node:fs';
import {loadPolicy} from './v3-partnership-evaluate';
const model=loadPolicy(process.argv[2]),probe=JSON.parse(readFileSync(process.argv[3],'utf8'));let maxError=0;
for(let i=0;i<probe.rows.length;i++){
 const row=probe.rows[i],actual=model.probabilities(row.x,row.mask);
 for(let j=0;j<52;j++)maxError=Math.max(maxError,Math.abs(actual[j]-probe.expected[i][j]));
 const a=model.action(row.x,row.mask),best=row.mask.reduce((b:number,m:number,j:number)=>m&&(b<0||probe.expected[i][j]>probe.expected[i][b])?j:b,-1);
 if(a!==best)throw Error('V3_EXPORT_ACTION_PARITY');
}
if(maxError>1e-5)throw Error('V3_EXPORT_PROBABILITY_PARITY');console.log(JSON.stringify({exportParity:true,maxError}));
