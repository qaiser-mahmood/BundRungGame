import {describe,it,expect} from 'vitest';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {io,Socket} from 'socket.io-client';
import {registerVoiceHandlers,VoiceRoom} from '../server/transport/Voice';
import type {ClientToServerEvents,ServerToClientEvents} from '../shared/types';
type Client=Socket<ServerToClientEvents,ClientToServerEvents>;
function event(client:Client,name:'voiceStreamReceive'|'voiceMuteStatusUpdated'|'notification'):Promise<unknown> {
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(`Missing ${String(name)}`)),3000);
    // Event-name/payload coupling is fixed at the call sites below.
    if(name==='voiceStreamReceive')client.once('voiceStreamReceive',data=>{clearTimeout(timeout);resolve(data);});
    else if(name==='voiceMuteStatusUpdated')client.once('voiceMuteStatusUpdated',data=>{clearTimeout(timeout);resolve(data);});
    else if(name==='notification')client.once('notification',data=>{clearTimeout(timeout);resolve(data);});
    else {clearTimeout(timeout);reject(new Error('Unsupported test event'));}
  });
}
describe('real Socket.IO voice transport',()=>{
  it('delivers only to the current room and uses server-derived identity on the wire',async()=>{
    const http=createServer(),server=new Server<ClientToServerEvents,ServerToClientEvents>(http),clients:Client[]=[];
    const rooms:VoiceRoom[]=[{socketMap:{},playerSocketMap:{}},{socketMap:{},playerSocketMap:{}}];
    let connection=0;
    server.on('connection',socket=>{
      const index=connection++,room=rooms[Math.floor(index/2)],playerId=`server-player-${index}`;
      room.socketMap[socket.id]=playerId;room.playerSocketMap[playerId]=socket.id;
      registerVoiceHandlers(socket,()=>room,id=>server.to(id));
    });
    try {
      await new Promise<void>((resolve,reject)=>{http.once('error',reject);http.listen(0,'127.0.0.1',resolve);});
      const address=http.address();if(!address||typeof address==='string')throw new Error('No port');
      for(let i=0;i<4;i++){
        const client:Client=io(`http://127.0.0.1:${address.port}`,{transports:['websocket'],forceNew:true,reconnection:false});clients.push(client);
        await new Promise<void>((resolve,reject)=>{client.once('connect',resolve);client.once('connect_error',reject);});
      }
      const outsiders:unknown[]=[];for(const c of clients.slice(2)){c.on('voiceStreamReceive',data=>outsiders.push(data));c.on('voiceMuteStatusUpdated',data=>outsiders.push(data));}
      const audio=event(clients[1],'voiceStreamReceive');
      clients[0].emit('voiceStreamSend',{roomId:'other-room',playerId:'forged',socketId:clients[2].id,audioChunk:'test-audio',sampleRate:16000});
      expect(await audio).toEqual({playerId:'server-player-0',socketId:clients[0].id,audioChunk:'test-audio',sampleRate:16000});
      const mute=event(clients[1],'voiceMuteStatusUpdated');clients[0].emit('voiceMuteStatusChanged',{roomId:'other-room',playerId:'forged',isMuted:true});
      expect(await mute).toEqual({playerId:'server-player-0',isMuted:true});
      // Per-connection Socket.IO ordering makes this a delivery barrier: any
      // leaked packet sent before it must have arrived before its notification.
      const barrier=clients.map(c=>event(c,'notification'));server.emit('notification',{message:'barrier'});await Promise.all(barrier);
      expect(outsiders).toEqual([]);
    } finally {
      clients.forEach(c=>c.disconnect());await new Promise<void>(resolve=>server.close(()=>resolve()));
      if(http.listening)await new Promise<void>(resolve=>http.close(()=>resolve()));
    }
  },10000);
});
