import * as THREE from 'three';
import { Card } from '../../../shared/types';
import { CardTextureFactory } from './CardTextureFactory';

export class CardMesh3D {
  public mesh: THREE.Mesh;
  public card: Card;
  public isFaceDown: boolean;

  public targetPosition: THREE.Vector3;
  public targetRotation: THREE.Euler;
  public isHovered: boolean = false;
  public isSelected: boolean = false;

  public static readonly CARD_WIDTH = 0.72;
  public static readonly CARD_HEIGHT = 1.0;
  public static readonly CARD_THICKNESS = 0.008;

  constructor(card: Card, isFaceDown: boolean = false) {
    this.card = card;
    this.isFaceDown = isFaceDown;

    const frontTex = CardTextureFactory.getCardFrontTexture(card);
    const backTex = CardTextureFactory.getCardBackTexture();

    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.5,
      metalness: 0.05,
    });

    const frontMat = new THREE.MeshStandardMaterial({
      map: frontTex,
      roughness: 0.35,
      metalness: 0.05,
    });

    const backMat = new THREE.MeshStandardMaterial({
      map: backTex,
      roughness: 0.4,
      metalness: 0.05,
    });

    // BoxGeometry materials: [right, left, top, bottom, front(+z), back(-z)]
    const materials = [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat];

    const geo = new THREE.BoxGeometry(
      CardMesh3D.CARD_WIDTH,
      CardMesh3D.CARD_HEIGHT,
      CardMesh3D.CARD_THICKNESS
    );

    this.mesh = new THREE.Mesh(geo, materials);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    (this.mesh as any).cardData = card;

    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Euler();

    if (isFaceDown) {
      this.mesh.rotation.y = Math.PI;
    }
  }

  public setFaceDown(isFaceDown: boolean): void {
    this.isFaceDown = isFaceDown;
  }

  /**
   * Smooth physics lerp update
   */
  public update(delta: number): void {
    const lerpFactor = Math.min(1, delta * 12);

    // Apply slight hover elevation if hovered
    const hoverOffset = this.isHovered ? 0.25 : 0;
    const finalTargetY = this.targetPosition.y + hoverOffset;

    this.mesh.position.x += (this.targetPosition.x - this.mesh.position.x) * lerpFactor;
    this.mesh.position.y += (finalTargetY - this.mesh.position.y) * lerpFactor;
    this.mesh.position.z += (this.targetPosition.z - this.mesh.position.z) * lerpFactor;

    // Rotation interpolation
    const rotZ = this.targetRotation.z;
    const rotX = this.targetRotation.x + (this.isHovered ? -0.15 : 0);
    const rotY = this.isFaceDown ? this.targetRotation.y + Math.PI : this.targetRotation.y;

    this.mesh.rotation.x += (rotX - this.mesh.rotation.x) * lerpFactor;
    this.mesh.rotation.y += (rotY - this.mesh.rotation.y) * lerpFactor;
    this.mesh.rotation.z += (rotZ - this.mesh.rotation.z) * lerpFactor;
  }
}
