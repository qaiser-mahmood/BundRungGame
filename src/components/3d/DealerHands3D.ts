import * as THREE from 'three';

export class DealerHands3D {
  public group: THREE.Group;
  private leftHand: THREE.Group;
  private rightHand: THREE.Group;

  public isShuffling: boolean = false;
  public isCutting: boolean = false;
  public isDealing: boolean = false;

  private animationTimer: number = 0;

  constructor() {
    this.group = new THREE.Group();
    this.leftHand = this.createHand(true);
    this.rightHand = this.createHand(false);

    this.group.add(this.leftHand);
    this.group.add(this.rightHand);

    this.resetToRest();
  }

  private createHand(isLeft: boolean): THREE.Group {
    const handGroup = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xf3ceb2,
      roughness: 0.55,
      metalness: 0.05,
    });
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.7,
    });

    // Forearm / Sleeve
    const armGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.75, 16);
    const arm = new THREE.Mesh(armGeo, sleeveMat);
    arm.rotation.x = Math.PI / 2.3;
    arm.position.set(0, 0.15, 0.45);
    arm.castShadow = true;
    handGroup.add(arm);

    // Palm
    const palmGeo = new THREE.BoxGeometry(0.24, 0.07, 0.28);
    const palm = new THREE.Mesh(palmGeo, skinMat);
    palm.position.set(0, 0.05, 0.05);
    palm.castShadow = true;
    handGroup.add(palm);

    // 4 Fingers
    const fingerGeo = new THREE.CylinderGeometry(0.024, 0.022, 0.22, 8);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(fingerGeo, skinMat);
      const xOffset = (i - 1.5) * 0.055;
      finger.rotation.x = Math.PI / 2.2;
      finger.position.set(xOffset, 0.05, -0.16);
      finger.castShadow = true;
      handGroup.add(finger);
    }

    // Thumb
    const thumbGeo = new THREE.CylinderGeometry(0.026, 0.024, 0.18, 8);
    const thumb = new THREE.Mesh(thumbGeo, skinMat);
    thumb.rotation.z = isLeft ? 0.7 : -0.7;
    thumb.rotation.x = Math.PI / 3;
    thumb.position.set(isLeft ? -0.14 : 0.14, 0.06, -0.02);
    thumb.castShadow = true;
    handGroup.add(thumb);

    return handGroup;
  }

  public resetToRest(): void {
    this.leftHand.position.set(-0.6, 0.26, 1.6);
    this.leftHand.rotation.set(-0.1, 0.2, 0);

    this.rightHand.position.set(0.6, 0.26, 1.6);
    this.rightHand.rotation.set(-0.1, -0.2, 0);
  }

  public startShuffle(): void {
    this.isShuffling = true;
    this.isCutting = false;
    this.isDealing = false;
    this.animationTimer = 0;
  }

  public startCut(): void {
    this.isCutting = true;
    this.isShuffling = false;
    this.isDealing = false;
    this.animationTimer = 0;
  }

  public startDeal(): void {
    this.isDealing = true;
    this.isShuffling = false;
    this.isCutting = false;
    this.animationTimer = 0;
  }

  public update(delta: number): void {
    this.animationTimer += delta;

    if (this.isShuffling) {
      // Hands move toward table center and perform simulated riffle shuffle
      const t = this.animationTimer;
      const wave = Math.sin(t * 14) * 0.04;

      this.leftHand.position.set(-0.35 + wave, 0.38 + Math.abs(wave) * 0.5, 0.6);
      this.leftHand.rotation.set(0.2, 0.3, wave * 2);

      this.rightHand.position.set(0.35 - wave, 0.38 + Math.abs(wave) * 0.5, 0.6);
      this.rightHand.rotation.set(0.2, -0.3, -wave * 2);

      if (t > 2.5) {
        this.isShuffling = false;
        this.resetToRest();
      }
    } else if (this.isCutting) {
      // Right hand reaches across the table to split the deck
      const t = this.animationTimer;
      const reachProgress = Math.min(1, Math.sin(t * 2));

      this.rightHand.position.set(
        0.5 - reachProgress * 0.5,
        0.26 + reachProgress * 0.15,
        1.5 - reachProgress * 1.1
      );
      this.rightHand.rotation.set(-0.2 + reachProgress * 0.4, -0.1, 0);

      if (t > 2.0) {
        this.isCutting = false;
        this.resetToRest();
      }
    } else if (this.isDealing) {
      // Rapid pitching/flicking motions
      const t = this.animationTimer;
      const angle = (t * 6) % (Math.PI * 2);

      this.rightHand.position.set(Math.cos(angle) * 0.4, 0.35, 0.5 + Math.sin(angle) * 0.3);
      this.rightHand.rotation.set(0.1, -angle, Math.sin(t * 12) * 0.2);

      if (t > 3.5) {
        this.isDealing = false;
        this.resetToRest();
      }
    } else {
      // Gentle breathing idle rest
      const idle = Math.sin(this.animationTimer * 1.5) * 0.006;
      this.leftHand.position.y = 0.26 + idle;
      this.rightHand.position.y = 0.26 + idle;
    }
  }
}
