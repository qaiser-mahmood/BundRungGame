import {describe,it,expect} from 'vitest';
import {registerVoiceHandlers,VoicePeer,VoiceRoom,VoiceEmitter} from '../server/transport/Voice';
import type {ClientToServerEvents} from '../shared/types';
function harness(){
  const streams=new Map<string,ClientToServerEvents['voiceStreamSend']>(),mutes=new Map<string,ClientToServerEvents['voiceMuteStatusChanged']>();
  const received=new Map<string,{event:string;payload:unknown}[]>(['a','b','c','d','spectator'].map(id=>[id,[]]));
  const one:VoiceRoom={socketMap:{a:'p1',b:'p2',spectator:''},playerSocketMap:{p1:'a',p2:'b'}};
  const two:VoiceRoom={socketMap:{c:'p3',d:'p4'},playerSocketMap:{p3:'c',p4:'d'}};
  const current=new Map([['a',one],['b',one],['c',two],['d',two],['spectator',one]]);
  for(const id of received.keys()){
    const peer:VoicePeer={id,on(event,handler){
      if(event==='voiceStreamSend')streams.set(id,handler as ClientToServerEvents['voiceStreamSend']);
      else mutes.set(id,handler as ClientToServerEvents['voiceMuteStatusChanged']);
    }};
    registerVoiceHandlers(peer,()=>current.get(id)!,socketId=>{
      const emitter:VoiceEmitter={emit(event,payload){received.get(socketId)!.push({event,payload});}};return emitter;
    });
  }
  return {streams,mutes,received,one,two,current};
}
describe('room-scoped authenticated voice relay',()=>{
  it('ignores forged sender/room/socket IDs and cannot broadcast audio or mute events across rooms',()=>{
    const h=harness();
    h.streams.get('a')!({roomId:'two',playerId:'p3',socketId:'c',audioChunk:'audio',sampleRate:48000});
    expect(h.received.get('a')).toEqual([]);
    expect(h.received.get('b')).toEqual([{event:'voiceStreamReceive',payload:{playerId:'p1',socketId:'a',audioChunk:'audio',sampleRate:48000}}]);
    expect(h.received.get('c')).toEqual([]);expect(h.received.get('d')).toEqual([]);
    h.mutes.get('a')!({roomId:'two',playerId:'p4',isMuted:true});
    expect(h.received.get('a')!.at(-1)).toEqual({event:'voiceMuteStatusUpdated',payload:{playerId:'p1',isMuted:true}});
    expect(h.received.get('c')).toEqual([]);expect(h.received.get('d')).toEqual([]);
  });
  it('resolves membership at event time after a room switch',()=>{
    const h=harness();delete h.one.socketMap.a;delete h.one.playerSocketMap.p1;
    h.two.socketMap.a='new-player';h.two.playerSocketMap['new-player']='a';h.current.set('a',h.two);
    h.streams.get('a')!({playerId:'p1',audioChunk:'new-room'});h.mutes.get('a')!({playerId:'p1',isMuted:false});
    expect(h.received.get('b')).toEqual([]);expect(h.received.get('spectator')).toEqual([]);
    expect(h.received.get('c')).toHaveLength(2);expect(h.received.get('d')).toHaveLength(2);
    expect(h.received.get('c')![0]).toEqual({event:'voiceStreamReceive',payload:{playerId:'new-player',socketId:'a',audioChunk:'new-room',sampleRate:undefined}});
  });
  it('rejects spectators, disconnected sockets and inconsistent reverse mappings',()=>{
    const h=harness();h.streams.get('spectator')!({playerId:'p1',audioChunk:'spoof'});h.mutes.get('spectator')!({playerId:'p1',isMuted:true});
    delete h.one.playerSocketMap.p1;h.streams.get('a')!({audioChunk:'stale'});h.mutes.get('a')!({isMuted:true});
    delete h.two.socketMap.c;h.streams.get('c')!({playerId:'p4',audioChunk:'disconnected'});
    expect([...h.received.values()].every(events=>events.length===0)).toBe(true);
  });
});
