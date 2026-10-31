/** One room turn per timer task: due bot timers cannot monopolize a timer batch.
 * Each synchronous search still has a cooperative deadline, not hard preemption. */
export class RoomTurnQueue {
  private tasks:{key:string;run:()=>void}[]=[];
  private keys=new Set<string>();
  private timer:ReturnType<typeof setTimeout>|null=null;
  enqueue(key:string,run:()=>void):boolean {
    if(this.keys.has(key))return false;
    this.keys.add(key);this.tasks.push({key,run});this.schedule();return true;
  }
  private schedule():void {
    if(this.timer||!this.tasks.length)return;
    this.timer=setTimeout(()=>{
      this.timer=null;const task=this.tasks.shift()!;
      try {task.run();}
      catch {console.error(JSON.stringify({component:'bot-queue',reason:'BOT_TASK_FAILED'}));}
      finally {this.keys.delete(task.key);this.schedule();}
    },0);
  }
}
export const liveBotTurns=new RoomTurnQueue();
