import type {ClientToServerEvents,ServerToClientEvents} from '../../shared/types';
export interface VoiceRoom {
  socketMap:Record<string,string>;
  playerSocketMap:Record<string,string>;
}
export interface VoicePeer {
  id:string;
  on(event:'voiceStreamSend',handler:ClientToServerEvents['voiceStreamSend']):unknown;
  on(event:'voiceMuteStatusChanged',handler:ClientToServerEvents['voiceMuteStatusChanged']):unknown;
}
export interface VoiceEmitter {
  emit(event:'voiceStreamReceive',payload:Parameters<ServerToClientEvents['voiceStreamReceive']>[0]):unknown;
  emit(event:'voiceMuteStatusUpdated',payload:Parameters<ServerToClientEvents['voiceMuteStatusUpdated']>[0]):unknown;
}
/** Resolve room and identity at event time. Never use client player/room/socket IDs.
 * Explicit recipient sockets avoid stale Socket.IO room membership on room changes. */
export function registerVoiceHandlers(socket:VoicePeer,currentRoom:()=>VoiceRoom,recipient:(socketId:string)=>VoiceEmitter):void {
  const sender=()=>{
    const room=currentRoom(),playerId=room.socketMap[socket.id];
    if(!playerId||room.playerSocketMap[playerId]!==socket.id)return null;
    return {room,playerId};
  };
  socket.on('voiceStreamSend',({audioChunk,sampleRate})=>{
    const current=sender();if(!current)return;
    for(const socketId of Object.keys(current.room.socketMap))if(socketId!==socket.id)
      recipient(socketId).emit('voiceStreamReceive',{playerId:current.playerId,socketId:socket.id,audioChunk,sampleRate});
  });
  socket.on('voiceMuteStatusChanged',({isMuted})=>{
    const current=sender();if(!current)return;
    // Preserve mute feedback to the sender, within the current room only.
    for(const socketId of Object.keys(current.room.socketMap))
      recipient(socketId).emit('voiceMuteStatusUpdated',{playerId:current.playerId,isMuted});
  });
}
