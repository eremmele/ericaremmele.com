import * as THREE from "three";
import { createHologramMaterial } from "./HologramMaterial";
import { PALETTE } from "./palette";

type VoxelSpec = {
  x: number;
  y: number;
  z: number;
  sx?: number;
  sy?: number;
  sz?: number;
  color?: THREE.ColorRepresentation;
};

function addVoxel(
  group: THREE.Group,
  spec: VoxelSpec,
  material: THREE.ShaderMaterial,
): void {
  const geometry = new THREE.BoxGeometry(
    spec.sx ?? 1,
    spec.sy ?? 1,
    spec.sz ?? 1,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(spec.x, spec.y, spec.z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
}

function createTree(
  group: THREE.Group,
  x: number,
  z: number,
  trunkMat: THREE.ShaderMaterial,
  leafMat: THREE.ShaderMaterial,
  scale = 1,
): void {
  addVoxel(group, { x, y: 0.8 * scale, z, sy: 1.6 * scale, sx: 0.35 * scale, sz: 0.35 * scale }, trunkMat);
  addVoxel(group, { x, y: 2.2 * scale, z, sy: 1.2 * scale, sx: 1.4 * scale, sz: 1.4 * scale }, leafMat);
  addVoxel(group, { x, y: 3.1 * scale, z, sy: 0.9 * scale, sx: 1.1 * scale, sz: 1.1 * scale }, leafMat);
}

function createArch(
  group: THREE.Group,
  x: number,
  z: number,
  material: THREE.ShaderMaterial,
): void {
  addVoxel(group, { x: x - 1.2, y: 1.5, z, sy: 3, sx: 0.4, sz: 0.4 }, material);
  addVoxel(group, { x: x + 1.2, y: 1.5, z, sy: 3, sx: 0.4, sz: 0.4 }, material);
  addVoxel(group, { x, y: 3.1, z, sy: 0.4, sx: 2.8, sz: 0.5 }, material);
}

export type PlaceholderGarden = {
  root: THREE.Group;
  materials: THREE.ShaderMaterial[];
  walkBounds: THREE.Box3;
};

/**
 * Procedural placeholder until a real `.glb` garden is added.
 * Drop your scene into `public/models/garden.glb` and swap in Phase 2.
 */
export function createPlaceholderGarden(): PlaceholderGarden {
  const root = new THREE.Group();
  const groundMat = createHologramMaterial({ color: PALETTE[7], opacity: 0.55, pixelSize: 48 });
  const pathMat = createHologramMaterial({ color: PALETTE[2], opacity: 0.45, pixelSize: 40 });
  const trunkMat = createHologramMaterial({ color: PALETTE[4], opacity: 0.7, pixelSize: 32 });
  const leafMat = createHologramMaterial({ color: PALETTE[1], opacity: 0.75, pixelSize: 28 });
  const accentMat = createHologramMaterial({ color: PALETTE[5], opacity: 0.85, pixelSize: 24 });

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40, 1, 1),
    groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  root.add(ground);

  for (let i = -18; i <= 18; i += 2) {
    addVoxel(root, { x: i, y: 0.05, z: 0, sx: 1.8, sy: 0.1, sz: 1.2 }, pathMat);
  }

  const treePositions: Array<[number, number]> = [
    [-10, -6], [-14, 2], [-8, 8], [9, 7], [12, -2], [-3, 5], [4, -8], [-5, -12], [6, 4],
  ];

  treePositions.forEach(([x, z], index) => {
    createTree(root, x, z, trunkMat, leafMat, 0.9 + (index % 3) * 0.15);
  });

  createArch(root, -6, -4, accentMat);
  createArch(root, 0, -10, accentMat);
  createArch(root, 7, -3, accentMat);

  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2;
    const radius = 14 + (i % 4);
    addVoxel(
      root,
      {
        x: Math.cos(angle) * radius,
        y: 0.4 + (i % 3) * 0.2,
        z: Math.sin(angle) * radius,
        sx: 0.35,
        sy: 0.8,
        sz: 0.35,
      },
      i % 2 === 0 ? leafMat : accentMat,
    );
  }

  const walkBounds = new THREE.Box3(
    new THREE.Vector3(-17, 0, -17),
    new THREE.Vector3(17, 4, 17),
  );

  return {
    root,
    materials: [groundMat, pathMat, trunkMat, leafMat, accentMat],
    walkBounds,
  };
}
