import {performance} from 'node:perf_hooks';
const count=200000;
const runs=Array.from({length:5},()=>{
 let checksum=0,start=performance.now(),mask=0n;
 for(let i=0;i<count;i++){const bit=1n<<BigInt(i%52);mask^=bit;checksum+=Number((mask&bit)!==0n);}const bigintMs=performance.now()-start;
 start=performance.now();let low=0,high=0;
 for(let i=0;i<count;i++){const c=i%52,bit=1<<(c%32);if(c<32){low^=bit;checksum+=Number((low&bit)!==0);}else{high^=bit;checksum+=Number((high&bit)!==0);}}const twoUint32Ms=performance.now()-start;
 start=performance.now();const cards=new Uint8Array(52);
 for(let i=0;i<count;i++){const c=i%52;cards[c]^=1;checksum+=cards[c];}const typedArrayMs=performance.now()-start;
 return {bigintMs,twoUint32Ms,typedArrayMs,checksum};
});
console.log(JSON.stringify({node:process.version,operationsPerRun:count,runs,choice:'Uint8Array hands: cheap indexed legal-card iteration, explicit slice cloning; no BigInt allocations'},null,2));
