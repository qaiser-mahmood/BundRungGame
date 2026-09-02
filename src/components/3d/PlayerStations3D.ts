import * as THREE from 'three';
import { Player, SeatPosition } from '../../../shared/types';

export class PlayerStations3D {
  public group: THREE.Group;
  private stationMeshes: Map<SeatPosition, {
    chair: THREE.Group;
    avatar: THREE.Group;
    voiceRing: THREE.Mesh;
    turnRing: THREE.Mesh;
    nameplateMesh: THREE.Mesh;
  }> = new Map();

  constructor() {
    this.group = new THREE.Group();
    this.buildStations();
  }

  private buildStations(): void {
    const seats: { seat: SeatPosition; pos: THREE.Vector3; rotY: number; isTeam1: boolean }[] = [
      { seat: 'BOTTOM', pos: new THREE.Vector3(0, 0, 3.2), rotY: Math.PI, isTeam1: true },
      { seat: 'RIGHT', pos: new THREE.Vector3(4.5, 0, 0), rotY: Math.PI / 2, isTeam1: false },
      { seat: 'TOP', pos: new THREE.Vector3(0, 0, -3.2), rotY: 0, isTeam1: true },
      { seat: 'LEFT', pos: new THREE.Vector3(-4.5, 0, 0), rotY: -Math.PI / 2, isTeam1: false },
    ];

    seats.forEach(({ seat, pos, rotY, isTeam1 }) => {
      const stationGroup = new THREE.Group();
      stationGroup.position.copy(pos);
      stationGroup.rotation.y = rotY;

      // 1. 3D Wooden Chair
      const chair = this.createChair(isTeam1);
      stationGroup.add(chair);

      // 2. 3D Stylized Avatar Bust
      const avatar = this.createAvatar(isTeam1);
      avatar.position.set(0, 0.4, 0.2);
      stationGroup.add(avatar);

      // 3. Live Acoustic Voice Halo (Emissive Emerald Ring on table edge)
      const ringGeo = new THREE.RingGeometry(0.55, 0.65, 32);
      const voiceMat = new THREE.MeshBasicMaterial({
        color: 0x34d399,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
      });
      const voiceRing = new THREE.Mesh(ringGeo, voiceMat);
      voiceRing.rotation.x = -Math.PI / 2;
      voiceRing.position.set(0, 0.25, -0.9);
      stationGroup.add(voiceRing);

      // 4. Active Turn Halo Ring (Golden Amber)
      const turnGeo = new THREE.RingGeometry(0.68, 0.76, 32);
      const turnMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
      });
      const turnRing = new THREE.Mesh(turnGeo, turnMat);
      turnRing.rotation.x = -Math.PI / 2;
      turnRing.position.set(0, 0.24, -0.9);
      stationGroup.add(turnRing);

      // 5. Floating Nameplate
      const nameplateMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
      });
      const nameplateMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.35), nameplateMat);
      nameplateMesh.position.set(0, 1.35, -0.1);
      nameplateMesh.rotation.y = Math.PI; // Face the central camera
      stationGroup.add(nameplateMesh);

      this.group.add(stationGroup);
      this.stationMeshes.set(seat, {
        chair,
        avatar,
        voiceRing,
        turnRing,
        nameplateMesh,
      });
    });
  }

  private createChair(isTeam1: boolean): THREE.Group {
    const chairGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.5,
      metalness: 0.1,
    });
    const cushionMat = new THREE.MeshStandardMaterial({
      color: isTeam1 ? 0x1e3a8a : 0x881337,
      roughness: 0.6,
      metalness: 0.05,
    });

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 12);
    const legPositions = [
      [-0.35, -0.7, -0.35],
      [0.35, -0.7, -0.35],
      [-0.35, -0.7, 0.35],
      [0.35, -0.7, 0.35],
    ];
    legPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(x, y, z);
      leg.castShadow = true;
      chairGroup.add(leg);
    });

    // Seat cushion
    const seatGeo = new THREE.BoxGeometry(0.85, 0.12, 0.85);
    const seatMesh = new THREE.Mesh(seatGeo, cushionMat);
    seatMesh.position.y = 0;
    seatMesh.castShadow = true;
    chairGroup.add(seatMesh);

    // Backrest
    const backGeo = new THREE.BoxGeometry(0.85, 0.9, 0.08);
    const backMesh = new THREE.Mesh(backGeo, cushionMat);
    backMesh.position.set(0, 0.5, 0.4);
    backMesh.castShadow = true;
    chairGroup.add(backMesh);

    return chairGroup;
  }

  private createAvatar(isTeam1: boolean): THREE.Group {
    const avatarGroup = new THREE.Group();

    // Torso / Suit
    const suitMat = new THREE.MeshStandardMaterial({
      color: isTeam1 ? 0x1d4ed8 : 0xbe123c,
      roughness: 0.65,
    });
    const torsoGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.65, 16);
    const torso = new THREE.Mesh(torsoGeo, suitMat);
    torso.position.y = 0.32;
    torso.castShadow = true;
    avatarGroup.add(torso);

    // Head / Face (Warm stylized skin tone)
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xf5d0b5,
      roughness: 0.6,
    });
    const headGeo = new THREE.SphereGeometry(0.2, 24, 24);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 0.78;
    head.castShadow = true;
    avatarGroup.add(head);

    // Hair / Cap (Dark espresso)
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
    });
    const hairGeo = new THREE.SphereGeometry(0.21, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 0.8;
    avatarGroup.add(hair);

    return avatarGroup;
  }

  /**
   * Updates 3D nameplates, turn rings, and live voice halos
   */
  public update(
    players: Player[],
    currentTurnPlayerId: string | null,
    speakingPlayerIds: Set<string>,
    time: number
  ): void {
    players.forEach((player) => {
      const station = this.stationMeshes.get(player.seat);
      if (!station) return;

      const isCurrentTurn = currentTurnPlayerId === player.id;
      const isSpeaking = speakingPlayerIds.has(player.id);

      // 1. Acoustic Voice Halo Animation
      const voiceMat = station.voiceRing.material as THREE.MeshBasicMaterial;
      if (isSpeaking) {
        const pulse = 0.7 + 0.3 * Math.sin(time * 12);
        voiceMat.opacity = pulse;
        station.voiceRing.scale.setScalar(1.0 + 0.15 * Math.sin(time * 12));
      } else {
        voiceMat.opacity = 0;
      }

      // 2. Active Turn Ring Animation
      const turnMat = station.turnRing.material as THREE.MeshBasicMaterial;
      if (isCurrentTurn) {
        turnMat.opacity = 0.8 + 0.2 * Math.sin(time * 6);
        station.turnRing.rotation.z = time * 2;
      } else {
        turnMat.opacity = 0;
      }

      // 3. Subtle avatar breathing sway
      station.avatar.position.y = 0.4 + 0.015 * Math.sin(time * 2 + (player.seat.charCodeAt(0) || 0));
    });
  }
}
