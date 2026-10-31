import { BundRungEngine } from '../../engine/BundRungEngine';
import { StateVectorizer } from './StateVectorizer';
import { ReinforcementLearner } from './ReinforcementLearner';
import { ModelManager } from './ModelManager';
import type {Transition} from './ReplayBuffer';

interface Pending {state:Float32Array;action:number;reward:number;}
export interface RewardConfig {trickWin:number;terminalWin:number;scoreScale:number;}
export const defaultRewards:RewardConfig={trickWin:0,terminalWin:1,scoreScale:0};
/** One learner per room. Pending actions end at that actor's next legal decision,
 * or an authoritative terminal hand. Departures discard incomplete experience. */
export class TurnLearning {
  private pending=new Map<string,Pending>();
  private engine:BundRungEngine|null=null;
  private gameIndex=-1;
  private generation=0;
  public readonly experiences:Transition[]=[];
  public recordedCount=0;
  constructor(public readonly roomId:string,public readonly learner=new ReinforcementLearner(),
    public readonly rewards:RewardConfig=defaultRewards){}
  reset():void {this.pending.clear();this.engine=null;this.gameIndex=-1;this.generation++;}
  private bind(engine:BundRungEngine):void {
    const game=engine.getPublicState().gameIndex;
    if(this.engine!==engine||this.gameIndex!==game){this.reset();this.engine=engine;this.gameIndex=game;}
  }
  private close(engine:BundRungEngine,id:string,done:boolean):void {
    const pending=this.pending.get(id);if(!pending)return;
    const state=engine.getPublicState(),priv=engine.getPrivateState(id);
    const cards=[...priv.myHand,...(priv.myTrumpCard?[priv.myTrumpCard]:[])];
    const next=done?[]:priv.legalPlayableCardIds.map(cid=>{
      const card=cards.find(c=>c.id===cid);if(!card)throw new Error('LEARNING_MASK_CARD_MISSING');
      return StateVectorizer.cardToIndex(card);
    });
    if(!done&&!next.length)return;
    const team=state.players.find(p=>p.id===id)?.team;
    let reward=pending.reward;
    if(done){
      if(!state.lastGameWinningTeam)throw new Error('LEARNING_MISSING_TERMINAL_WINNER');
      reward+=(state.lastGameWinningTeam===team?1:-1)*this.rewards.terminalWin;
      const entry=state.scorecard.history.at(-1);
      if(entry)reward+=entry.scoreAdjustment*(entry.dealerTeam===team?-1:1)*this.rewards.scoreScale;
    }
    const transition:Transition={state:pending.state,action:pending.action,reward,
      nextState:StateVectorizer.vectorize(state,priv,id,state.players),done,legalActionsNext:next,
      roomId:this.roomId,episodeId:`${this.generation}:${this.gameIndex}`};
    this.learner.recordExperience(transition);this.experiences.push(transition);this.recordedCount++;
    if(this.experiences.length>256)this.experiences.shift();
    this.pending.delete(id);
  }
  observe(engine:BundRungEngine):void {
    this.bind(engine);const state=engine.getPublicState();
    if(state.phase==='GAME_RESOLVED'||state.phase==='MATCH_OVER'){
      for(const id of [...this.pending.keys()])this.close(engine,id,true);
    }else if(state.currentTurnPlayerId)this.close(engine,state.currentTurnPlayerId,false);
  }
  play(engine:BundRungEngine,id:string,cardId:string):ReturnType<BundRungEngine['playCard']> {
    // Validate before touching history: rejected actions have no learning effects.
    const state=engine.getPublicState(),priv=engine.getPrivateState(id);
    if(!priv.legalPlayableCardIds.includes(cardId))throw new Error('LEARNING_REJECTED_ACTION');
    const card=[...priv.myHand,...(priv.myTrumpCard?[priv.myTrumpCard]:[])].find(c=>c.id===cardId);
    if(!card)throw new Error('LEARNING_CARD_MISSING');
    this.observe(engine);
    const snapshot=StateVectorizer.vectorize(state,priv,id,state.players);
    const result=engine.playCard(id,cardId);
    this.pending.set(id,{state:snapshot,action:StateVectorizer.cardToIndex(card),reward:0});
    if(result.trickCompleted&&this.rewards.trickWin){
      const team=result.trickWinner?.team;
      for(const [pid,pending] of this.pending){pending.reward+=(state.players.find(p=>p.id===pid)?.team===team?1:-1)*this.rewards.trickWin;}
    }
    this.observe(engine);return result;
  }
}
export class LiveLearningEngine {
  private static rooms=new Map<string,TurnLearning>();
  private static queued=new Set<string>();
  private static trained=new Map<string,number>();
  private static schedule(roomId:string):void {
    const room=this.rooms.get(roomId);
    if(!room||this.queued.has(roomId)||room.recordedCount<=(this.trained.get(roomId)??0)||room.learner.replayBuffer.size()<room.learner.batchSize)return;
    this.queued.add(roomId);
    setImmediate(()=>{
      try {
        if(this.rooms.get(roomId)===room){room.learner.trainBatch();this.trained.set(roomId,room.recordedCount);}
      }catch(error){console.error(JSON.stringify({component:'learning',reason:'BATCH_REJECTED',error:String(error)}));}
      finally{this.queued.delete(roomId);}
    });
  }
  public static init():void { /* canonical checkpoint is read-only; learners initialize per room */ }
  public static session(roomId:string):TurnLearning {
    if(!roomId)throw new Error('EXPLICIT_ROOM_REQUIRED');
    let room=this.rooms.get(roomId);
    if(!room){
      const learner=new ReinforcementLearner(),baseline=ModelManager.getModel();
      learner.batchSize=4;
      if(baseline){learner.onlineNetwork=baseline.clone();learner.targetNetwork=baseline.clone();}
      room=new TurnLearning(roomId,learner);this.rooms.set(roomId,room);
    }
    return room;
  }
  public static playCard(engine:BundRungEngine,roomId:string,playerId:string,cardId:string){const result=this.session(roomId).play(engine,playerId,cardId);this.schedule(roomId);return result;}
  public static observe(engine:BundRungEngine,roomId:string):void {this.rooms.get(roomId)?.observe(engine);this.schedule(roomId);}
  public static resetRoom(roomId:string):void {this.rooms.delete(roomId);this.trained.delete(roomId);}
}
