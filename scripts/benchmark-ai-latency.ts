import {v2Stats} from '../server/ai/v2/strategy/DecisionController';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {BotPlayer} from '../server/ai/BotPlayer';
import {LiveLearningEngine} from '../server/ai/neural/LiveLearningEngine';
import {advanceForced,searchStats} from '../server/ai/planning/MonteCarloPlanner';
import {setupGame,seededRandom,withRandom} from './ai-benchmark';

const args=process.argv.slice(2);
const value=(k:string,d:string)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const rooms=Number(value('--rooms','8')),rounds=Number(value('--rounds','24')),cadence=Number(value('--cadence-ms','700'));
if(![rooms,rounds,cadence].every(n=>Number.isSafeInteger(n)&&n>0)||rooms>64||rounds>500)throw new Error('Invalid load parameters');
const hash=()=>createHash('sha256').update(readFileSync('server/ai/models/bund_rung_brain.json')).digest('hex');
const queued=value('--scheduler','direct')==='queued',queue=queued?new(await import('../server/ai/RoomTurnQueue')).RoomTurnQueue():null,queueWaitMs:number[]=[];
const policy=value('--policy','corrected-search');
if(policy!=='corrected-search'&&policy!=='advanced-search'&&policy!=='ai-v2-ismcts')throw new Error('Invalid policy');
const before=hash();
const engines=Array.from({length:rooms},(_,i)=>setupGame(i+2));
// Startup/checkpoint loading is measured separately from steady-state scheduling.
const startup=performance.now();
engines.forEach((_,i)=>LiveLearningEngine.session(`latency:${i}`));
const startupMs=performance.now()-startup;
const histogram=monitorEventLoopDelay({resolution:1}),decisionMs:number[]=[],jobMs:number[]=[],heartbeats:number[]=[];
let last=performance.now();const heartbeat=setInterval(()=>{const now=performance.now();heartbeats.push(Math.max(0,now-last-1));last=now;},1);
histogram.enable();
const started=performance.now();
for(let round=0;round<rounds;round++){
  await Promise.all(engines.map((engine,i)=>new Promise<void>((resolve,reject)=>setTimeout(()=>{
    const ready=performance.now();
    const run=()=>{try {
      queueWaitMs.push(performance.now()-ready);
    const jobStart=performance.now();
    if(engine.getPhase()==='TRICK_PLAYING'){
      if(!advanceForced(engine)){
        const state=engine.getPublicState(),id=state.currentTurnPlayerId!;
        const begin=performance.now();
        withRandom(seededRandom(round*rooms+i+1),()=>BotPlayer.handleBotTurn(engine,id,{roomId:`latency:${i}`,learning:true,
          policy:{name:policy,search:{random:seededRandom(round*rooms+i+1)}}}));
        decisionMs.push(performance.now()-begin);
      }
      // Approximate the real four-player broadcast serialization workload.
      for(const p of engine.getPlayers())engine.getClientGameState(p.id);
    }
      jobMs.push(performance.now()-jobStart);resolve();
    }catch(error){reject(error);}};
    if(queue)queue.enqueue(`latency:${i}`,run);else run();
  },cadence))));
}
await pause(30);clearInterval(heartbeat);histogram.disable();
const distribution=(xs:number[])=>{const sorted=[...xs].sort((a,b)=>a-b);return {count:xs.length,meanMs:xs.reduce((a,b)=>a+b,0)/(xs.length||1),p95Ms:sorted[Math.ceil(xs.length*.95)-1]??0,maxMs:sorted.at(-1)??0};};
const report={schemaVersion:1,policy,label:value('--label',queued?'optimized-room-queue':'optimized-direct-timers'),scheduler:queued?'room-queue':'direct-timers',rooms,rounds,cadenceMs:cadence,node:process.version,startupMs,
  durationMs:performance.now()-started,decision:distribution(decisionMs),roomJob:distribution(jobMs),queueWait:distribution(queueWaitMs),heartbeatDelay:distribution(heartbeats),
  eventLoop:{p95Ms:histogram.percentile(95)/1e6,maxMs:histogram.max/1e6},search:{...searchStats},v2:{...v2Stats},modelBefore:before,modelAfter:hash()};
if(report.modelAfter!==before)throw new Error('Canonical model changed');
writeFileSync(value('--output','/tmp/ai-latency.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
engines.forEach((_,i)=>LiveLearningEngine.resetRoom(`latency:${i}`));
