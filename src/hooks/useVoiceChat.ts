import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents, Player, SeatPosition } from '../../shared/types';

interface UseVoiceChatProps {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  myPlayerId: string;
  players: Player[];
}

const SEAT_ORDER: Record<SeatPosition, number> = {
  BOTTOM: 0,
  RIGHT: 1,
  TOP: 2,
  LEFT: 3,
};

export function useVoiceChat({ socket, myPlayerId, players }: UseVoiceChatProps) {
  const [isMicMuted, setIsMicMuted] = useState<boolean>(true);
  const [isTableDeafened, setIsTableDeafened] = useState<boolean>(false);
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [speakingPlayerIds, setSpeakingPlayerIds] = useState<Set<string>>(new Set());
  const [mutedPlayerIds, setMutedPlayerIds] = useState<Set<string>>(new Set());
  const [micPermissionDenied, setMicPermissionDenied] = useState<boolean>(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const speakingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pannerNodesRef = useRef<Map<string, StereoPannerNode>>(new Map());
  const playerNextPlayTimesRef = useRef<Map<string, number>>(new Map());
  const isDeafenedRef = useRef<boolean>(isTableDeafened);
  const isMutedRef = useRef<boolean>(isMicMuted);
  const socketRef = useRef(socket);

  socketRef.current = socket;
  isDeafenedRef.current = isTableDeafened;
  isMutedRef.current = isMicMuted;

  // Calculate spatial stereo pan (-1.0 to +1.0) based on player's seat position relative to bottom player
  const calculateSpatialPan = useCallback(
    (speakingPlayerId: string): number => {
      const myPlayer = players.find((p) => p.id === myPlayerId);
      const speaker = players.find((p) => p.id === speakingPlayerId);
      if (!myPlayer || !speaker || myPlayer.id === speaker.id) return 0;

      const mySeatIdx = SEAT_ORDER[myPlayer.seat] ?? 0;
      const speakerSeatIdx = SEAT_ORDER[speaker.seat] ?? 0;
      const relativePosition = (speakerSeatIdx - mySeatIdx + 4) % 4;

      if (relativePosition === 1) return 0.75; // Right ear
      if (relativePosition === 3) return -0.75; // Left ear
      return 0.0; // Center (Partner across table)
    },
    [players, myPlayerId]
  );

  // Initialize or resume Web Audio Context (handles iOS & mobile autoplay policies)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioCtx();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  // Unlock audio on mobile touch or click
  useEffect(() => {
    const unlock = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('click', unlock, { passive: true });
    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };
  }, []);

  // Helper to mark a player as actively speaking with debounce
  const triggerSpeakingAnimation = useCallback((playerId: string) => {
    setSpeakingPlayerIds((prev) => {
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });

    const existingTimeout = speakingTimeoutsRef.current.get(playerId);
    if (existingTimeout) clearTimeout(existingTimeout);

    const newTimeout = setTimeout(() => {
      setSpeakingPlayerIds((prev) => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
      speakingTimeoutsRef.current.delete(playerId);
    }, 450);

    speakingTimeoutsRef.current.set(playerId, newTimeout);
  }, []);

  // Initialize Microphone stream via Direct PCM Processing
  const initMicrophone = useCallback(async () => {
    if (mediaStreamRef.current) return true;

    try {
      const audioCtx = getAudioContext();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      mediaStreamRef.current = stream;
      setMicPermissionDenied(false);

      const source = audioCtx.createMediaStreamSource(stream);
      mediaSourceNodeRef.current = source;

      // 2048 samples buffer size (~45ms latency per frame)
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current || !socketRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // Convert Float32 [-1.0, 1.0] to 16-bit PCM Int16Array
        let maxAmp = 0;
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]));
          int16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          const abs = Math.abs(sample);
          if (abs > maxAmp) maxAmp = abs;
        }

        // Voice Activity Detection (VAD): Only transmit if speaking
        if (maxAmp > 0.012) {
          socketRef.current.emit('voiceStreamSend', {
            playerId: myPlayerId,
            audioChunk: int16Data.buffer,
            sampleRate: audioCtx.sampleRate,
          });
          triggerSpeakingAnimation(myPlayerId);
        }

        // Output silence to avoid local microphone loopback
        const outputData = e.outputBuffer.getChannelData(0);
        outputData.fill(0);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination); // Keeps processor alive in WebKit

      setIsVoiceActive(true);
      return true;
    } catch (err) {
      console.warn('Microphone access denied or not available:', err);
      setMicPermissionDenied(true);
      return false;
    }
  }, [getAudioContext, myPlayerId, triggerSpeakingAnimation]);

  // Toggle Mute / Unmute
  const toggleMic = useCallback(async () => {
    const audioCtx = getAudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }

    if (!mediaStreamRef.current) {
      const success = await initMicrophone();
      if (!success) return;
      setIsMicMuted(false);
      if (socketRef.current) {
        socketRef.current.emit('voiceMuteStatusChanged', { playerId: myPlayerId, isMuted: false });
      }
      return;
    }

    const nextMuted = !isMicMuted;
    setIsMicMuted(nextMuted);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    if (socketRef.current) {
      socketRef.current.emit('voiceMuteStatusChanged', { playerId: myPlayerId, isMuted: nextMuted });
    }
  }, [isMicMuted, initMicrophone, myPlayerId, getAudioContext]);

  // Toggle Table Sound (Deafen)
  const toggleDeafen = useCallback(() => {
    setIsTableDeafened((prev) => !prev);
  }, []);

  // Listen for incoming audio chunks and mute status updates from Socket.io
  useEffect(() => {
    if (!socket) return;

    const handleVoiceReceive = ({
      playerId,
      audioChunk,
      sampleRate,
    }: {
      playerId: string;
      audioChunk: string | ArrayBuffer | number[];
      sampleRate?: number;
    }) => {
      if (playerId === myPlayerId || isDeafenedRef.current) return;

      try {
        const audioCtx = getAudioContext();
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }

        // Convert incoming chunk to Int16Array
        let int16Array: Int16Array;
        if (audioChunk instanceof ArrayBuffer) {
          int16Array = new Int16Array(audioChunk);
        } else if (Array.isArray(audioChunk)) {
          int16Array = new Int16Array(audioChunk);
        } else if (typeof audioChunk === 'string') {
          const binaryString = atob(audioChunk.replace(/^data:.*?;base64,/, ''));
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          int16Array = new Int16Array(bytes.buffer);
        } else {
          return;
        }

        if (int16Array.length === 0) return;

        // Convert Int16 PCM to Float32 [-1.0, 1.0]
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768;
        }

        const rate = sampleRate || audioCtx.sampleRate;
        const audioBuffer = audioCtx.createBuffer(1, float32Array.length, rate);
        audioBuffer.copyToChannel(float32Array, 0);

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;

        // Apply Spatial Stereo Panning
        const pan = calculateSpatialPan(playerId);
        if (audioCtx.createStereoPanner) {
          let panner = pannerNodesRef.current.get(playerId);
          if (!panner) {
            panner = audioCtx.createStereoPanner();
            pannerNodesRef.current.set(playerId, panner);
            panner.connect(audioCtx.destination);
          }
          panner.pan.value = pan;
          source.connect(panner);
        } else {
          source.connect(audioCtx.destination);
        }

        // Timeline audio scheduling for glitch-free continuous audio
        const currentTime = audioCtx.currentTime;
        let nextPlayTime = playerNextPlayTimesRef.current.get(playerId) || currentTime;
        if (nextPlayTime < currentTime) {
          nextPlayTime = currentTime;
        }

        source.start(nextPlayTime);
        playerNextPlayTimesRef.current.set(playerId, nextPlayTime + audioBuffer.duration);

        triggerSpeakingAnimation(playerId);
      } catch (err) {
        console.warn('Voice playback error:', err);
      }
    };

    const handleMuteUpdated = ({ playerId, isMuted }: { playerId: string; isMuted: boolean }) => {
      setMutedPlayerIds((prev) => {
        const next = new Set(prev);
        if (isMuted) {
          next.add(playerId);
        } else {
          next.delete(playerId);
        }
        return next;
      });
    };

    socket.on('voiceStreamReceive', handleVoiceReceive);
    socket.on('voiceMuteStatusUpdated', handleMuteUpdated);

    return () => {
      socket.off('voiceStreamReceive', handleVoiceReceive);
      socket.off('voiceMuteStatusUpdated', handleMuteUpdated);
    };
  }, [socket, myPlayerId, getAudioContext, calculateSpatialPan, triggerSpeakingAnimation]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
      }
      if (mediaSourceNodeRef.current) {
        mediaSourceNodeRef.current.disconnect();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      speakingTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  return {
    isMicMuted,
    isTableDeafened,
    isVoiceActive,
    speakingPlayerIds,
    mutedPlayerIds,
    micPermissionDenied,
    toggleMic,
    toggleDeafen,
  };
}
