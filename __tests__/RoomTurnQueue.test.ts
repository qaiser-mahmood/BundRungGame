import {afterEach,describe,expect,it,vi} from 'vitest';
import {RoomTurnQueue} from '../server/ai/RoomTurnQueue';
afterEach(()=>vi.useRealTimers());
describe('room turn queue',()=>{
  it('deduplicates a room and yields a timer turn between jobs',async()=>{
    vi.useFakeTimers();const queue=new RoomTurnQueue(),events:string[]=[];
    expect(queue.enqueue('a',()=>{events.push('a');setTimeout(()=>events.push('heartbeat'),0);})).toBe(true);
    expect(queue.enqueue('a',()=>events.push('duplicate'))).toBe(false);
    expect(queue.enqueue('b',()=>events.push('b'))).toBe(true);
    await vi.runAllTimersAsync();expect(events).toEqual(['a','heartbeat','b']);
    expect(queue.enqueue('a',()=>events.push('a-again'))).toBe(true);await vi.runAllTimersAsync();expect(events.at(-1)).toBe('a-again');
  });
});
