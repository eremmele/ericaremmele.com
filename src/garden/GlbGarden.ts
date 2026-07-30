import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { HeightField } from "../controls/HeightField";
import { createForestFoliageLayer } from "./FoliageScatter";
import { meshSceneToParticleCloud } from "./MeshToParticles";
import { loadPixelSprite } from "./MovingPixels";

export type LoadedGarden = {
  root: THREE.Group;
  materials: THREE.ShaderMaterial[];
  walkBounds: THREE.Box3;
  walkCircle: { x: number; z: number; radius: number };
  colliders: THREE.Object3D[];
  spawn: THREE.Vector3;
  heightField: HeightField;
  foliage: THREE.Group;
  /** Streams foliage after the garden is already interactive. */
  whenFoliageReady: Promise<void>;
};

export type LoadGardenOptions = {
  onProgress?: (message: string) => void;
};

const TARGET_SIZE = 48;
const GARDEN_URL = "./models/garden.glb";

function preferLeanLoad(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  if (connection?.saveData) return true;
  if (connection?.effectiveType === "2g" || connection?.effectiveType === "3g") return true;
  if (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) return true;
  return window.matchMedia("(pointer: coarse)").matches;
}

function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("./draco/");
  loader.setDRACOLoader(draco);
  return loader;
}

function ensureTextureColorSpace(material: THREE.Material): void {
  const std = material as THREE.MeshStandardMaterial;
  if (std.map instanceof THREE.Texture) {
    std.map.colorSpace = THREE.SRGBColorSpace;
    std.map.needsUpdate = true;
  }
  if (std.emissiveMap instanceof THREE.Texture) {
    std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    std.emissiveMap.needsUpdate = true;
  }
  material.needsUpdate = true;
}

/**
 * Load garden GLB as moving-pixel point cloud (original texture colors).
 * Topside height field keeps walking on the exterior surface.
 */
export async function loadGardenGlb(
  url = GARDEN_URL,
  options: LoadGardenOptions = {},
): Promise<LoadedGarden> {
  const { onProgress } = options;
  onProgress?.("Loading model…");

  const loader = createGltfLoader();
  const gltf = await loader.loadAsync(url);

  const root = new THREE.Group();
  root.name = "garden-glb";
  root.add(gltf.scene);

  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = TARGET_SIZE / maxDim;

  gltf.scene.position.x = -center.x;
  gltf.scene.position.y = -box.min.y;
  gltf.scene.position.z = -center.z;
  gltf.scene.scale.setScalar(scale);
  gltf.scene.updateMatrixWorld(true);

  const colliders: THREE.Object3D[] = [];
  const heightSamples: number[] = [];
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    colliders.push(obj);

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => {
      if (m) ensureTextureColorSpace(m);
    });

    const pos = obj.geometry.attributes.position;
    const nrm = obj.geometry.attributes.normal;
    obj.updateMatrixWorld(true);
    const matrix = obj.matrixWorld;
    normalMatrix.getNormalMatrix(matrix);

    const step = Math.max(1, Math.floor(pos.count / 200_000));
    for (let i = 0; i < pos.count; i += step) {
      if (nrm) {
        n.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix).normalize();
        if (n.y < 0.15) continue;
      }
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      heightSamples.push(v.x, v.y, v.z);
    }
  });

  onProgress?.("Preparing ground…");
  const fitted = new THREE.Box3().setFromObject(gltf.scene);
  const margin = 0.75;
  const walkBounds = new THREE.Box3(
    new THREE.Vector3(fitted.min.x + margin, fitted.min.y, fitted.min.z + margin),
    new THREE.Vector3(fitted.max.x - margin, fitted.max.y + 8, fitted.max.z - margin),
  );

  const cx = (walkBounds.min.x + walkBounds.max.x) * 0.5;
  const cz = (walkBounds.min.z + walkBounds.max.z) * 0.5;
  const walkRadius =
    Math.min(
      (walkBounds.max.x - walkBounds.min.x) * 0.5,
      (walkBounds.max.z - walkBounds.min.z) * 0.5,
    ) * 0.92;

  const heightField = HeightField.fromPositions(heightSamples, walkBounds, 96);

  const groundY = heightField.sample(cx, cz + walkRadius * 0.4);
  const spawn = new THREE.Vector3(cx, groundY + 1.65, cz + walkRadius * 0.4);

  onProgress?.("Building pixels…");
  const lean = preferLeanLoad();
  const pointTexture = await loadPixelSprite();

  // Overlap foliage downloads with the CPU particle bake so bandwidth isn't idle.
  const foliageHost = new THREE.Group();
  foliageHost.name = "forest-foliage-host";
  const foliagePromise = createForestFoliageLayer({
    heightField,
    walkBounds,
    walkCircle: { x: cx, z: cz, radius: walkRadius },
    clearCenter: { x: spawn.x, z: spawn.z, radius: 2.8 },
    lean,
  }).then((layer) => {
    foliageHost.add(layer);
  });

  const cloud = await meshSceneToParticleCloud(gltf.scene, {
    targetCount: lean ? 220_000 : 380_000,
    maxCount: lean ? 260_000 : 440_000,
    bottomCutRatio: 0.12,
    groundBandRatio: 0.5,
    groundDensityBoost: 2.2,
    pointTexture,
    onProgress: (ratio) => {
      onProgress?.(`Building pixels… ${Math.round(ratio * 100)}%`);
    },
  });
  root.add(cloud.points);
  root.add(foliageHost);

  const materials: THREE.ShaderMaterial[] = [];
  if (cloud.points.material instanceof THREE.ShaderMaterial) {
    materials.push(cloud.points.material);
  }

  return {
    root,
    materials,
    walkBounds,
    walkCircle: { x: cx, z: cz, radius: walkRadius },
    colliders,
    spawn,
    heightField,
    foliage: foliageHost,
    whenFoliageReady: foliagePromise.catch((error) => {
      console.warn("Foliage failed to load — garden remains playable.", error);
    }),
  };
}

export function defaultInspectionPositions(
  walkBounds: THREE.Box3,
): Array<[number, number, number]> {
  const cx = (walkBounds.min.x + walkBounds.max.x) * 0.5;
  const cz = (walkBounds.min.z + walkBounds.max.z) * 0.5;
  const spanX = (walkBounds.max.x - walkBounds.min.x) * 0.28;
  const spanZ = (walkBounds.max.z - walkBounds.min.z) * 0.28;

  return [
    [cx - spanX, 0, cz - spanZ * 0.2],
    [cx, 0, cz - spanZ],
    [cx + spanX, 0, cz - spanZ * 0.15],
    [cx + spanX * 0.45, 0, cz + spanZ * 0.45],
    [cx - spanX * 0.55, 0, cz + spanZ * 0.4],
  ];
}
