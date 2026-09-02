import * as THREE from 'three';

export class CardTable3D {
  public group: THREE.Group;

  constructor() {
    this.group = new THREE.Group();
    this.buildTable();
  }

  private buildTable(): void {
    // 1. Room Floor (Dark Walnut Parquet / Ambient Shadow Receiver)
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.85,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // 2. Table Leg Base (Heavy Central Pedestal & Spiders)
    const legGeo = new THREE.CylinderGeometry(0.7, 1.2, 3.1, 32);
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x1f140e, // Rich dark mahogany
      roughness: 0.45,
      metalness: 0.15,
    });
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.y = -1.6;
    leg.castShadow = true;
    this.group.add(leg);

    // Base footing ring
    const footGeo = new THREE.CylinderGeometry(2.0, 2.2, 0.25, 32);
    const foot = new THREE.Mesh(footGeo, woodMat);
    foot.position.y = -3.05;
    this.group.add(foot);

    // 3. Table Sub-top Structure (Mahogany Trim under rail)
    const tableWidth = 8.8;
    const tableDepth = 5.6;
    const subtopGeo = new THREE.CylinderGeometry(tableWidth / 2, tableWidth / 2, 0.2, 64);
    subtopGeo.scale(1, 1, tableDepth / tableWidth);
    const subtop = new THREE.Mesh(subtopGeo, woodMat);
    subtop.position.y = -0.12;
    subtop.castShadow = true;
    this.group.add(subtop);

    // 4. Padded Armrest Rail (Black/Espresso Leather)
    // Modeled as an extruded beveled oval ring
    const railOuterGeo = new THREE.CylinderGeometry(
      (tableWidth / 2) * 1.05,
      (tableWidth / 2) * 1.05,
      0.35,
      64
    );
    railOuterGeo.scale(1, 1, tableDepth / tableWidth);
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x12141a, // Dark espresso leather
      roughness: 0.35,
      metalness: 0.1,
    });
    const rail = new THREE.Mesh(railOuterGeo, leatherMat);
    rail.position.y = 0.05;
    rail.castShadow = true;
    this.group.add(rail);

    // 5. Playing Surface Felt (Casino Emerald / Bund Rung Green)
    const feltRadius = (tableWidth / 2) * 0.94;
    const feltGeo = new THREE.CylinderGeometry(feltRadius, feltRadius, 0.1, 64);
    feltGeo.scale(1, 1, (tableDepth * 0.94) / (tableWidth * 0.94));
    const feltMat = new THREE.MeshStandardMaterial({
      color: 0x064e3b, // Deep rich emerald casino felt
      roughness: 0.88,
      metalness: 0.02,
    });
    const felt = new THREE.Mesh(feltGeo, feltMat);
    felt.position.y = 0.15;
    felt.receiveShadow = true;
    this.group.add(felt);

    // 6. Decorative Golden Table Trim Ring
    const ringGeo = new THREE.RingGeometry(feltRadius * 0.98, feltRadius * 1.0, 64);
    ringGeo.scale(1, tableDepth / tableWidth, 1);
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.3,
      metalness: 0.85,
    });
    const goldRing = new THREE.Mesh(ringGeo, goldMat);
    goldRing.rotation.x = -Math.PI / 2;
    goldRing.position.y = 0.205;
    this.group.add(goldRing);

    // 7. Center Emblem Ring on Felt
    const centerRingGeo = new THREE.RingGeometry(0.85, 0.88, 48);
    const centerRing = new THREE.Mesh(centerRingGeo, goldMat);
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.y = 0.203;
    this.group.add(centerRing);

    // 8. Brass Coin / Rung Coasters at 4 Seats
    const coasterPositions = [
      new THREE.Vector3(0, 0.205, 1.8),   // South (Me)
      new THREE.Vector3(2.8, 0.205, 0),   // East (Right)
      new THREE.Vector3(0, 0.205, -1.8),  // North (Partner)
      new THREE.Vector3(-2.8, 0.205, 0),  // West (Left)
    ];

    coasterPositions.forEach((pos) => {
      const coasterGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.02, 32);
      const coaster = new THREE.Mesh(coasterGeo, goldMat);
      coaster.position.copy(pos);
      coaster.receiveShadow = true;
      this.group.add(coaster);
    });
  }
}
