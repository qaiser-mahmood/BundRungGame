import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Card, Player, Trick, PublicGameState, PrivatePlayerState } from '../../../shared/types';
import { CardTable3D } from './CardTable3D';
import { PlayerStations3D } from './PlayerStations3D';
import { DealerHands3D } from './DealerHands3D';
import { CardMesh3D } from './CardMesh3D';
import { sound } from '../../utils/sound';

interface Table3DCanvasProps {
  publicState: PublicGameState;
  privateState: PrivatePlayerState;
  onPlayCard: (cardId: string) => void;
  speakingPlayerIds: Set<string>;
  mutedPlayerIds: Set<string>;
  isMyTurn: boolean;
}

export const Table3DCanvas: React.FC<Table3DCanvasProps> = ({
  publicState,
  privateState,
  onPlayCard,
  speakingPlayerIds,
  mutedPlayerIds,
  isMyTurn,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const tableRef = useRef<CardTable3D | null>(null);
  const stationsRef = useRef<PlayerStations3D | null>(null);
  const handsRef = useRef<DealerHands3D | null>(null);

  const handCardMeshesRef = useRef<Map<string, CardMesh3D>>(new Map());
  const trickCardMeshesRef = useRef<Map<string, CardMesh3D>>(new Map());
  const trumpCardMeshRef = useRef<CardMesh3D | null>(null);

  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2(-100, -100));

  // Initialize Three.js Scene, Camera, Renderer & Lighting
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811); // Deep atmospheric card room
    scene.fog = new THREE.FogExp2(0x050811, 0.045);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 3.6, 4.2);
    camera.lookAt(0, 0.2, 0.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- Atmospheric Studio Lighting ---
    // 1. Ambient fill
    const ambientLight = new THREE.AmbientLight(0xfff5ea, 0.85);
    scene.add(ambientLight);

    // 2. Overhead warm pendant spotlight casting soft table shadows
    const spotlight = new THREE.SpotLight(0xffeedd, 3.8);
    spotlight.position.set(0, 6.5, 0.5);
    spotlight.angle = Math.PI / 3.2;
    spotlight.penumbra = 0.6;
    spotlight.decay = 1.2;
    spotlight.distance = 20;
    spotlight.castShadow = true;
    spotlight.shadow.mapSize.width = 1024;
    spotlight.shadow.mapSize.height = 1024;
    spotlight.shadow.camera.near = 1;
    spotlight.shadow.camera.far = 10;
    spotlight.shadow.bias = -0.001;
    scene.add(spotlight);

    // 3. Subtle rim light for gold trim and card edges
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    rimLight.position.set(-5, 4, -4);
    scene.add(rimLight);

    // --- Build 3D Objects ---
    const table = new CardTable3D();
    scene.add(table.group);
    tableRef.current = table;

    const stations = new PlayerStations3D();
    scene.add(stations.group);
    stationsRef.current = stations;

    const hands = new DealerHands3D();
    scene.add(hands.group);
    handsRef.current = hands;

    // Window Resize listener
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Main Render Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Update 3D hands & stations
      if (handsRef.current) handsRef.current.update(delta);
      if (stationsRef.current) {
        stationsRef.current.update(
          publicState.players,
          publicState.currentTurnPlayerId,
          speakingPlayerIds,
          time
        );
      }

      // Update card lerp positions
      handCardMeshesRef.current.forEach((cm) => cm.update(delta));
      trickCardMeshesRef.current.forEach((cm) => cm.update(delta));
      if (trumpCardMeshRef.current) trumpCardMeshRef.current.update(delta);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Synchronize Player Stations when state changes
  useEffect(() => {
    if (stationsRef.current) {
      stationsRef.current.update(
        publicState.players,
        publicState.currentTurnPlayerId,
        speakingPlayerIds,
        0
      );
    }
  }, [publicState.players, publicState.currentTurnPlayerId, speakingPlayerIds]);

  // Synchronize 3D Dealer Hands with Game Phases
  useEffect(() => {
    if (!handsRef.current) return;
    if (publicState.phase === 'PRE_DEAL_SHUFFLE') {
      handsRef.current.startShuffle();
      sound.playShuffle();
    } else if (publicState.phase === 'PRE_DEAL_CUT') {
      handsRef.current.startCut();
      sound.playCardSlide();
    } else if (publicState.phase === 'DEALING_PASS_1' || publicState.phase === 'DEALING_PASS_2') {
      handsRef.current.startDeal();
      sound.playCardSlide();
    }
  }, [publicState.phase, publicState.shuffleCount, publicState.cutDone]);

  // Synchronize Player Hand Cards in 3D (fanned at bottom)
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    const hand = privateState.myHand || [];
    const legalIds = new Set(privateState.legalPlayableCardIds || []);

    // Remove meshes for cards no longer in hand
    const currentCardIds = new Set(hand.map((c) => c.id));
    handCardMeshesRef.current.forEach((cardMesh, id) => {
      if (!currentCardIds.has(id)) {
        scene.remove(cardMesh.mesh);
        handCardMeshesRef.current.delete(id);
      }
    });

    // Arrange hand in 3D arc fanning out in front of South camera
    const totalCards = hand.length;
    const fanRadius = 3.5;
    const arcSpread = Math.min(0.9, totalCards * 0.08);

    hand.forEach((card, idx) => {
      let cardMesh = handCardMeshesRef.current.get(card.id);
      if (!cardMesh) {
        cardMesh = new CardMesh3D(card, false);
        scene.add(cardMesh.mesh);
        handCardMeshesRef.current.set(card.id, cardMesh);
      }

      const normalizedIdx = totalCards > 1 ? idx / (totalCards - 1) - 0.5 : 0;
      const angle = normalizedIdx * arcSpread;

      // Calculate position on the fan
      const x = Math.sin(angle) * fanRadius;
      const z = 2.4 - (Math.cos(angle) * fanRadius - fanRadius);
      const y = 0.55 + idx * 0.005; // Layering depth

      cardMesh.targetPosition.set(x, y, z);
      cardMesh.targetRotation.set(-0.55, 0, -angle * 0.8);
      cardMesh.isHovered = hoveredCardId === card.id;
    });
  }, [privateState.myHand, privateState.legalPlayableCardIds, hoveredCardId]);

  // Synchronize Center Trick Cards in 3D
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    const trickCards = publicState.currentTrick?.cards || [];

    // Remove old trick cards no longer present
    const currentPlayedIds = new Set(trickCards.map((tc) => tc.card.id));
    trickCardMeshesRef.current.forEach((cardMesh, id) => {
      if (!currentPlayedIds.has(id)) {
        scene.remove(cardMesh.mesh);
        trickCardMeshesRef.current.delete(id);
      }
    });

    // 4 Seat positions relative to table center
    const seatOffsets: Record<string, { x: number; z: number; rotY: number }> = {
      BOTTOM: { x: 0, z: 0.6, rotY: 0 },
      RIGHT: { x: 0.7, z: 0, rotY: Math.PI / 2 },
      TOP: { x: 0, z: -0.6, rotY: Math.PI },
      LEFT: { x: -0.7, z: 0, rotY: -Math.PI / 2 },
    };

    trickCards.forEach((tc, idx) => {
      let cardMesh = trickCardMeshesRef.current.get(tc.card.id);
      if (!cardMesh) {
        cardMesh = new CardMesh3D(tc.card, tc.isFaceDown);
        scene.add(cardMesh.mesh);
        trickCardMeshesRef.current.set(tc.card.id, cardMesh);
      }

      const player = publicState.players.find((p) => p.id === tc.playerId);
      const seat = player?.seat || 'BOTTOM';
      const offset = seatOffsets[seat] || { x: 0, z: 0, rotY: 0 };

      cardMesh.setFaceDown(Boolean(tc.isFaceDown));
      cardMesh.targetPosition.set(offset.x, 0.22 + idx * 0.008, offset.z);
      cardMesh.targetRotation.set(-Math.PI / 2, 0, offset.rotY + (idx * 0.1 - 0.15));
    });
  }, [publicState.currentTrick?.cards, publicState.players]);

  // Raycasting for Mouse / Touch Hover & Card Click
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!mountRef.current || !cameraRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const cardMeshes = Array.from(handCardMeshesRef.current.values()).map((cm) => cm.mesh);
    const intersects = raycasterRef.current.intersectObjects(cardMeshes, true);

    if (intersects.length > 0) {
      let topMesh: THREE.Object3D | null = intersects[0].object;
      while (topMesh && !(topMesh as any).cardData && topMesh.parent) {
        topMesh = topMesh.parent;
      }
      const cardData = (topMesh as any)?.cardData as Card | undefined;
      if (cardData) {
        setHoveredCardId(cardData.id);
        return;
      }
    }
    setHoveredCardId(null);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!mountRef.current || !cameraRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const cardMeshes = Array.from(handCardMeshesRef.current.values()).map((cm) => cm.mesh);
    const intersects = raycasterRef.current.intersectObjects(cardMeshes, true);

    if (intersects.length > 0) {
      let topMesh: THREE.Object3D | null = intersects[0].object;
      while (topMesh && !(topMesh as any).cardData && topMesh.parent) {
        topMesh = topMesh.parent;
      }
      const cardData = (topMesh as any)?.cardData as Card | undefined;
      if (cardData) {
        const isLegal = privateState.legalPlayableCardIds?.includes(cardData.id);
        if (isLegal || !isMyTurn) {
          sound.playCardPlace();
          onPlayCard(cardData.id);
        }
      }
    }
  };

  return (
    <div
      ref={mountRef}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      className="relative w-full h-full cursor-pointer touch-none select-none overflow-hidden"
    >
      {/* 3D View Helper Hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-3 py-1 rounded-full bg-slate-950/70 border border-slate-700/80 backdrop-blur text-[11px] text-amber-300 font-semibold shadow-lg">
        {isMyTurn ? '🎮 3D View: Tap any glowing card to play onto the felt' : '🎮 3D Arena View (Interactive Card Physics)'}
      </div>
    </div>
  );
};
