import type { Card } from '../shared/types';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BotPlayer } from '../server/ai/BotPlayer';
import { advanceForced } from '../server/ai/planning/MonteCarloPlanner';
import { TurnLearning } from '../server/ai/neural/LiveLearningEngine';
import { ModelManager } from '../server/ai/neural/ModelManager';
import { ReinforcementLearner } from '../server/ai/neural/ReinforcementLearner';
import { StateVectorizer } from '../server/ai/neural/StateVectorizer';
import { seededRandom, setupGame, withRandom } from './ai-benchmark';

export interface TrainingOptions {games:number;seed:number;output:string;resume?:string;batchSize?:number;epsilon?:number;}
export function train(mode:'self-play'|'imitation',options:TrainingOptions){
  if(!options.output || existsSync(options.output) || resolve(options.output)===resolve('server/ai/models/bund_rung_brain.json'))throw new Error('A new, explicit experimental --output path is required');
  if(!Number.isSafeInteger(options.seed)||options.seed<0||options.seed>0xffffffff)throw new Error('Invalid seed');
  if(!Number.isSafeInteger(options.games)||options.games<1||options.games>100000)throw new Error('Invalid game count');
  const learner=withRandom(seededRandom(options.seed),()=>new ReinforcementLearner());
  if(options.resume){learner.onlineNetwork=ModelManager.loadModel(options.resume);learner.targetNetwork=learner.onlineNetwork.clone();}
  learner.batchSize=options.batchSize??32;
  if(!Number.isSafeInteger(learner.batchSize)||learner.batchSize<1||learner.batchSize>128)throw new Error('Invalid batch size');
  const epsilon=options.epsilon??.1;
  if(epsilon<0||epsilon>1||!Number.isFinite(epsilon))throw new Error('Invalid epsilon');
  const metrics={mode,completed:0,aborted:0,decisions:0,updates:0,team1Wins:0,team2Wins:0,neuralSelections:0,teacherAgreement:0,loss:0};
  for(let game=0;game<options.games;game++){
    const engine=setupGame((options.seed+game)>>>0);
    const episode=new TurnLearning(`training:${game}`,learner);
    let done=false;
    withRandom(seededRandom(options.seed^game^0x7a11),()=>{
      for(let step=0;step<500;step++){
        const state=engine.getPublicState();
        if(state.phase==='GAME_RESOLVED'||state.phase==='MATCH_OVER'){
          episode.observe(engine);done=true;
          if(!state.lastGameWinningTeam)throw new Error('Missing authoritative winner');
          if(state.lastGameWinningTeam==='TEAM_1')metrics.team1Wins++;else metrics.team2Wins++;
          break;
        }
        if(advanceForced(engine)){episode.observe(engine);continue;}
        const id=state.currentTurnPlayerId;if(!id)throw new Error('No training actor');
        const priv=engine.getPrivateState(id), all=priv.myTrumpCard&&priv.isMyTrumpCardPlayable?[...priv.myHand,priv.myTrumpCard]:priv.myHand;
        const legal=all.filter(c=>priv.legalPlayableCardIds.includes(c.id));
        if(!legal.length)throw new Error('No legal training action');
        const vector=StateVectorizer.vectorize(state,priv,id,state.players),indices=legal.map(StateVectorizer.cardToIndex);
        let chosen: Card | undefined;
        if(mode==='self-play'){
          // Exploitation genuinely uses the network updated by this learner.
          const index=learner.onlineNetwork.selectAction(vector,indices,epsilon);
          chosen=legal.find(c=>StateVectorizer.cardToIndex(c)===index);metrics.neuralSelections++;
        }else{
          chosen=BotPlayer.chooseMasterCard({getPlayers:()=>state.players},id,legal,all,state,priv,{name:'heuristic'});
          if(!legal.some(c=>c.id===chosen?.id))throw new Error('Illegal teacher action');
          const action=StateVectorizer.cardToIndex(chosen),prediction=learner.onlineNetwork.selectAction(vector,indices,0);
          if(prediction===action)metrics.teacherAgreement++;
          const target=learner.onlineNetwork.forward(vector),mask=new Array(52).fill(false);
          for(const i of indices){target[i]=i===action?2:-1;mask[i]=true;}
          metrics.loss+=learner.onlineNetwork.trainStep(vector,target,mask,learner.learningRate);metrics.updates++;
        }
        if(!chosen)throw new Error('Invalid trained action');
        const result=mode==='self-play'?episode.play(engine,id,chosen.id):engine.playCard(id,chosen.id);
        metrics.decisions++;
        if(mode==='self-play'&&result.trickCompleted&&learner.replayBuffer.size()>=learner.batchSize){metrics.loss+=learner.trainBatch();metrics.updates++;}
      }
    });
    if(!done){metrics.aborted++;throw new Error('Training game incomplete; no checkpoint saved');}
    metrics.completed++;
    console.error(JSON.stringify({component:'training',...metrics}));
  }
  ModelManager.saveModel(learner.onlineNetwork,options.output);
  return metrics;
}
export function trainingCLI(mode:'self-play'|'imitation'):void {
  try{
    const args=process.argv.slice(2),allowed=['--games','--seed','--output','--resume','--batch-size','--epsilon'];
    if(args.length%2||args.some((a,i)=>i%2===0&&!allowed.includes(a)))throw new Error('Invalid arguments');
    const value=(key:string,fallback:string)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
    const metrics=train(mode,{games:Number(value('--games','2')),seed:Number(value('--seed','1')),output:value('--output',''),
      resume:value('--resume','')||undefined,batchSize:Number(value('--batch-size','32')),epsilon:Number(value('--epsilon','.1'))});
    console.log(JSON.stringify(metrics));
  }catch(error){console.error(JSON.stringify({component:'training',reason:String(error)}));process.exitCode=1;}
}
