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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pannerNodesRef = useRef<Map<string, StereoPannerNode>>(new Map());
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const isDeafenedRef = useRef<boolean>(isTableDeafened);
  const isMutedRef = useRef<boolean>(isMicMuted);

  isDeafenedRef.current = isTableDeafened;
  isMutedRef.current = isMicMuted;

  // Calculate spatial stereo pan (-1.0 to +1.0) based on player's seat position relative to bottom player
  const calculateSpatialPan = useCallback(
    (speakingPlayerId: string): number => {
      const myPlayer = players.find((p) => p.id === myPlayerId);
      const speaker = players.find((p) => p.id === speakingPlayerId);
      if (!myPlayer || !speaker || myPlayer.id === speaker.id) return 0;

      // 4-player circular table relative offset: 0 = Bottom (Me), 1 = Right, 2 = Top (Partner), 3 = Left
      const mySeatIdx = SEAT_ORDER[myPlayer.seat] ?? 0;
      const speakerSeatIdx = SEAT_ORDER[speaker.seat] ?? 0;
      const relativePosition = (speakerSeatIdx - mySeatIdx + 4) % 4;

      if (relativePosition === 1) return 0.75; // Right ear
      if (relativePosition === 3) return -0.75; // Left ear
      return 0.0; // Center (Partner across table)
    },
    [players, myPlayerId]
  );

  // Initialize or resume Web Audio Context
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioCtx();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
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
    }, 400);

    speakingTimeoutsRef.current.set(playerId, newTimeout);
  }, []);

  // Initialize Microphone stream
  const initMicrophone = useCallback(async () => {
    if (mediaStreamRef.current) return true;

    try {
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

      // Determine best supported audio MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket && !isMutedRef.current) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = reader.result as string;
            socket.emit('voiceStreamSend', {
              playerId: myPlayerId,
              audioChunk: base64Audio,
            });
            triggerSpeakingAnimation(myPlayerId);
          };
          reader.readAsDataURL(event.data);
        }
      };

      // Record in 120ms slices for smooth streaming
      recorder.start(120);
      setIsVoiceActive(true);
      return true;
    } catch (err) {
      console.warn('Microphone access denied or not available:', err);
      setMicPermissionDenied(true);
      return false;
    }
  }, [socket, myPlayerId, triggerSpeakingAnimation]);

  // Toggle Mute / Unmute
  const toggleMic = useCallback(async () => {
    if (!mediaStreamRef.current) {
      const success = await initMicrophone();
      if (!success) return;
      setIsMicMuted(false);
      if (socket) {
        socket.emit('voiceMuteStatusChanged', { playerId: myPlayerId, isMuted: false });
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

    if (socket) {
      socket.emit('voiceMuteStatusChanged', { playerId: myPlayerId, isMuted: nextMuted });
    }
  }, [isMicMuted, initMicrophone, socket, myPlayerId]);

  // Toggle Table Sound (Deafen)
  const toggleDeafen = useCallback(() => {
    setIsTableDeafened((prev) => !prev);
  }, []);

  // Listen for incoming audio chunks and mute status updates from Socket.io
  useEffect(() => {
    if (!socket) return;

    const handleVoiceReceive = async ({ playerId, audioChunk }: { playerId: string; audioChunk: string }) => {
      if (playerId === myPlayerId || isDeafenedRef.current) return;

      try {
        triggerSpeakingAnimation(playerId);

        const audioCtx = getAudioContext();
        const response = await fetch(audioChunk);
        const arrayBuffer = await response.arrayBuffer();

        audioCtx.decodeAudioData(
          arrayBuffer,
          (decodedBuffer) => {
            const source = audioCtx.createBufferSource();
            source.buffer = decodedBuffer;

            // Apply spatial stereo panning based on table seat position
            const pan = calculateSpatialPan(playerId);
            let destinationNode: AudioNode = audioCtx.destination;

            if (audioCtx.createStereoPanner) {
              let panner = pannerNodesRef.current.get(playerId);
              if (!panner) {
                panner = audioCtx.createStereoPanner();
                pannerNodesRef.current.set(playerId, panner);
              }
              panner.pan.value = pan;
              panner.connect(audioCtx.destination);
              destinationNode = panner;
            }

            source.connect(destinationNode);
            source.start(0);
          },
          (decodeError) => {
            // Silently ignore minor decode errors on partial packet boundaries
          }
        );
      } catch (err) {
        // Ignore audio playback errors
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
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
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
