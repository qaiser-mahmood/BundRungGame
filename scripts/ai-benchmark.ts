import { searchStats, SearchOptions } from '../server/ai/planning/MonteCarloPlanner';
import type { PolicyName } from '../server/ai/DecisionPolicy';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BundRungEngine } from '../server/engine/BundRungEngine';
import { BotPlayer } from '../server/ai/BotPlayer';
import { ModelManager } from '../server/ai/neural/ModelManager';
import { StateVectorizer } from '../server/ai/neural/StateVectorizer';
import type { TeamId } from '../shared/types';

export type Policy = PolicyName | 'production' | 'neural';
const policyName = (p:Policy):PolicyName => p === 'production' ? 'production-legacy' : p === 'neural' ? 'neural-direct' : p;
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function withRandom<T>(random: () => number, run: () => T): T {
  const previous = Math.random;
  Math.random = random;
  try { return run(); } finally { Math.random = previous; }
}

export function setupGame(seed: number): BundRungEngine {
  return withRandom(seededRandom(seed), () => {
    const engine = new BundRungEngine();
    for (let i = 0; i < 4; i++) engine.addPlayer(`p${i}`, `Seat ${i}`, true);
    engine.assignTeams(['p0', 'p2'], ['p1', 'p3']);
    engine.startInitialToss();
    for (let step = 0; step < 200; step++) {
      const state = engine.getPublicState();
      if (state.phase === 'TRICK_PLAYING' || state.phase === 'GAME_RESOLVED' || state.phase === 'MATCH_OVER') return engine;
      if (state.phase === 'TOSS_COMPLETE') {
        engine.dealerDistributeCards(state.players[state.dealerPlayerIndex].id);
      } else {
        for (const player of state.players) {
          if (engine.getPhase() === 'TRICK_PLAYING' || engine.getPhase() === 'GAME_RESOLVED' || engine.getPhase() === 'MATCH_OVER') break;
          BotPlayer.handleBotTurn(engine, player.id, {roomId:'benchmark-setup',policy:{name:'heuristic'}});
        }
      }
    }
    throw new Error('Setup exceeded 200 steps');
  });
}

export interface GameResult {
  seed: number;
  candidateTeam: TeamId;
  dealHash: string;
  winner: TeamId | null;
  candidateWon: boolean | null;
  signedScoreAdjustment: number | null;
  trickDifferential: number;
  completedTricks: number;
  invalidMoves: number;
  error: string | null;
  search: typeof searchStats;
  revealActions: {type:string;milliseconds:number}[];
  decisions: { policy: Policy; playerId: string; milliseconds: number; cardId: string }[];
}

export function runGame(seed: number, candidateTeam: TeamId, candidate: Policy, baseline: Policy = 'heuristic', searchOptions:SearchOptions={iterations:16,timeMs:Infinity}): GameResult {
  // Deserialize outside the seeded stream: loading allocates randomly initialized
  // tensors before replacing them with persisted weights.
  if (candidate !== 'heuristic' || baseline !== 'heuristic') ModelManager.getModel();
  const initialStats={...searchStats};
  const revealActions:GameResult['revealActions']=[];
  const oldNeural = BotPlayer.useNeuralPolicy;
  // No LiveLearning callbacks, training or saves in this process.
  BotPlayer.useNeuralPolicy = false;
  try {
    const engine = setupGame(seed);
    const initial = engine.getPublicState();
    const dealHash = createHash('sha256').update(JSON.stringify({
      hands: initial.players.map(p => engine.getPrivateState(p.id)),
      dealer: initial.dealerPlayerIndex, caller: initial.trumpCallerPlayerId,
      mode: initial.trumpMode,
    })).digest('hex');
    const decisions: GameResult['decisions'] = [];
    let invalidMoves = 0;
    let error: string | null = null;
    withRandom(seededRandom(seed ^ 0xB07B07), () => {
      try {
        for (let step = 0; step < 500; step++) {
          const state = engine.getPublicState();
          if (state.phase === 'GAME_RESOLVED' || state.phase === 'MATCH_OVER') return;
          if (state.phase !== 'TRICK_PLAYING') throw new Error(`Unexpected phase ${state.phase}`);
          if (state.isRungRevealPaused) { const started=performance.now();engine.resumeAfterTrumpReveal();revealActions.push({type:'resume',milliseconds:performance.now()-started}); continue; }
          const caller = state.trumpCallerPlayerId;
          if (caller && engine.getPrivateState(caller).canShowTrump) {const started=performance.now();engine.showTrumpCard(caller);revealActions.push({type:'show',milliseconds:performance.now()-started});continue;}
          if (state.faceDownLeadPending) {
            const callerTeam = state.players.find(p => p.id === state.faceDownLeadPlayerId)?.team;
            for (const p of state.players.filter(p => p.team !== callerTeam)) engine.respondToFaceDownRung(p.id, true);
            continue;
          }
          const id = state.currentTurnPlayerId;
          if (!id) throw new Error('No current player');
          const priv = engine.getPrivateState(id);
          if (priv.canRequestRungReveal) {const started=performance.now();engine.requestTrumpReveal(id);revealActions.push({type:'request',milliseconds:performance.now()-started});continue;}
          // Match handleBotTurn's production hand boundary, including its
          // exclusion of the caller's locked trump until playable.
          const all = priv.myTrumpCard && priv.isMyTrumpCardPlayable
            ? [...priv.myHand, priv.myTrumpCard] : priv.myHand;
          const legal = all.filter(c => priv.legalPlayableCardIds.includes(c.id));
          if (!legal.length) throw new Error(`No legal cards for ${id}`);
          const policy = state.players.find(p => p.id === id)!.team === candidateTeam ? candidate : baseline;
          const start = performance.now();
          const chosen = BotPlayer.chooseMasterCard({getPlayers:()=>state.players},id,legal,all,state,priv,
            {name:policyName(policy),search:searchOptions});
          const milliseconds = performance.now() - start;
          if (!chosen || !legal.some(c => c.id === chosen.id)) { invalidMoves++; throw new Error('Policy selected illegal card'); }
          decisions.push({ policy, playerId: id, milliseconds, cardId: chosen.id });
          try { engine.playCard(id, chosen.id); } catch (e) { invalidMoves++; throw e; }
        }
        throw new Error('Game exceeded 500 steps');
      } catch (e) { error = e instanceof Error ? e.message : String(e); }
    });
    const final = engine.getPublicState();
    const entry = final.scorecard.history.at(-1);
    const winner = final.phase === 'GAME_RESOLVED' || final.phase === 'MATCH_OVER' ? final.lastGameWinningTeam : null;
    const delta={...searchStats};
    for(const key of Object.keys(delta) as (keyof typeof delta)[])delta[key]-=initialStats[key];
    return {
      seed, candidateTeam, dealHash, winner,
      search:delta,
      revealActions, candidateWon: winner ? winner === candidateTeam : null,
      signedScoreAdjustment: entry ? entry.scoreAdjustment * (entry.dealerTeam === candidateTeam ? -1 : 1) : null,
      trickDifferential: (final.team1TricksWon - final.team2TricksWon) * (candidateTeam === 'TEAM_1' ? 1 : -1),
      completedTricks: final.completedTricks.length, invalidMoves, error, decisions,
    };
  } finally { BotPlayer.useNeuralPolicy = oldNeural; }
}

export function pairedBootstrap(values:number[],seed:number):[number,number]|null {
  if(!values.length)return null;
  const random=seededRandom(seed^0xc1c1c1),means:number[]=[];
  for(let sample=0;sample<5000;sample++){
    let sum=0;for(let i=0;i<values.length;i++)sum+=values[Math.floor(random()*values.length)];
    means.push(sum/values.length);
  }
  means.sort((a,b)=>a-b);return [means[124],means[4874]];
}

export function runTournament(seed: number, pairs: number, candidate: Policy, baseline: Policy = 'heuristic',searchOptions:SearchOptions={iterations:16,timeMs:Infinity}) {
  const modelPath = resolve('server/ai/models/bund_rung_brain.json');
  const modelSha256 = createHash('sha256').update(readFileSync(modelPath)).digest('hex');
  const results: GameResult[] = [];
  for (let i = 0; i < pairs; i++) {
    const dealSeed = (seed + i) >>> 0;
    const a = runGame(dealSeed, 'TEAM_1', candidate, baseline,searchOptions);
    const b = runGame(dealSeed, 'TEAM_2', candidate, baseline,searchOptions);
    if (a.dealHash !== b.dealHash) throw new Error(`Paired deal mismatch at seed ${dealSeed}`);
    results.push(a, b);
  }
  if (createHash('sha256').update(readFileSync(modelPath)).digest('hex') !== modelSha256) throw new Error('Model changed');
  const latency = (policy: Policy) => {
    const values = results.flatMap(r => r.decisions.filter(d => d.policy === policy).map(d => d.milliseconds)).sort((a,b) => a-b);
    return { count: values.length, meanMs: values.reduce((a,b) => a+b, 0) / (values.length || 1),
      p95Ms: values.length ? values[Math.ceil(values.length * .95)-1] : 0, maxMs: values.at(-1) ?? 0 };
  };
  const pairRates:number[]=[];
  for(let i=0;i<results.length;i+=2)if(results[i].candidateWon!==null&&results[i+1].candidateWon!==null)
    pairRates.push((Number(results[i].candidateWon)+Number(results[i+1].candidateWon))/2);
  return { schemaVersion: 2, seed, pairs, candidate, baseline, searchOptions:{iterations:searchOptions.iterations,legacyIterations:searchOptions.legacyIterations??100,timeMs:Number.isFinite(searchOptions.timeMs)?searchOptions.timeMs:null}, nodeVersion: process.version, modelSha256, modelSha256After:createHash('sha256').update(readFileSync(modelPath)).digest('hex'),
    summary: { candidateWinRate95CI:pairedBootstrap(pairRates,seed), completed: results.filter(r => r.winner).length, aborted: results.filter(r => !r.winner).length,
      candidateWins: results.filter(r => r.candidateWon === true).length,
      baselineWins: results.filter(r => r.candidateWon === false).length,
      invalidMoves: results.reduce((n,r) => n+r.invalidMoves,0),
      search: Object.fromEntries(Object.keys(searchStats).map(k=>[k,results.reduce((n,r)=>n+r.search[k as keyof typeof searchStats],0)])),
      signedScoreAdjustment: results.reduce((n,r) => n+(r.signedScoreAdjustment ?? 0),0),
      latency: Object.fromEntries([...new Set([candidate, baseline])].map(p => [p, latency(p)])) }, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const allowed = ['--seed', '--pairs', '--candidate', '--baseline', '--output','--iterations','--time-ms'];
    if (args.length % 2 || args.some((a,i) => i % 2 === 0 && !allowed.includes(a))) throw new Error('Usage: --seed N --pairs N --candidate heuristic|production|neural --baseline heuristic|production|neural --output FILE');
    const value = (key: string, fallback: string) => args.includes(key) ? args[args.indexOf(key)+1] : fallback;
    const seed = Number(value('--seed','1')), pairs = Number(value('--pairs','2'));
    const candidate = value('--candidate','production') as Policy, baseline = value('--baseline','heuristic') as Policy;
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isSafeInteger(pairs) || pairs < 1 || pairs > 100000) throw new Error('Invalid seed or pairs');
    if (![candidate,baseline].every(p => ['heuristic','production','neural','production-legacy','corrected-search','neural-direct'].includes(p))) throw new Error('Unknown policy');
    // Keep stdout valid JSON even if existing bots/model loading emit diagnostic logs.
    const log = console.log;
    console.log = (...items) => console.error(...items);
    const iterations=Number(value('--iterations','16')),timeMs=Number(value('--time-ms','Infinity'));
    if(!Number.isSafeInteger(iterations)||iterations<1||iterations>1000||Number.isNaN(timeMs)||timeMs<=0)throw new Error('Invalid search budget');
    let result;
    try { result = runTournament(seed,pairs,candidate,baseline,{iterations,timeMs}); } finally { console.log = log; }
    const json = JSON.stringify(result,null,2) + '\n';
    const output = value('--output','');
    if (output) {
      if (resolve(output) === resolve('server/ai/models/bund_rung_brain.json')) throw new Error('Refusing to overwrite trained model');
      writeFileSync(output,json,{flag:'wx'});
    }
    process.stdout.write(json);
    if (result.summary.aborted || result.summary.invalidMoves) process.exitCode = 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
}
