import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { HeightField } from "../controls/HeightField";

export type FoliageScatterOptions = {
  heightField: HeightField;
  walkCircle: { x: number; z: number; radius: number };
  walkBounds: THREE.Box3;
  /** Keep a small clearing around spawn so the player isn't buried. */
  clearCenter?: { x: number; z: number; radius: number };
  onProgress?: (message: string) => void;
  seed?: number;
  /** Fewer instances / lighter GPU for constrained devices. */
  lean?: boolean;
};

type FoliageSpecies = {
  name: string;
  url: string;
  /** Target instance count for dense undergrowth. */
  count: number;
  /** Uniform scale range applied after model normalization. */
  scale: [number, number];
  /** Soft minimum spacing between same-species instances. */
  minSpacing: number;
  /** 0–1 chance to accept a candidate after spacing checks (adds irregular gaps). */
  acceptChance: number;
};

const SPECIES: FoliageSpecies[] = [
  {
    name: "dock-leaf-clump",
    url: "./models/foliage/dock-leaf-clump.glb",
    count: 28,
    scale: [1.35, 2.15],
    minSpacing: 2.1,
    acceptChance: 0.94,
  },
  {
    name: "fern-frond-clump",
    url: "./models/foliage/fern-frond-clump.glb",
    count: 18,
    scale: [1.15, 1.95],
    minSpacing: 2.3,
    acceptChance: 0.9,
  },
  {
    name: "bright-accent-foliage",
    url: "./models/foliage/bright-accent-foliage.glb",
    count: 12,
    scale: [0.95, 1.7],
    minSpacing: 2.6,
    acceptChance: 0.85,
  },
];

/** Keep plant footprints fully on the mesh. */
const FOLIAGE_EDGE_INSET = 2.4;
/** Scatter only inside this fraction of the walk circle. */
const FOLIAGE_RADIUS_FRACTION = 0.78;
/** Target footprint width in garden units after normalization. */
const TARGET_FOOTPRINT = 2.35;

function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("./draco/");
  loader.setDRACOLoader(draco);
  return loader;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Meshy foliage ships as metalness=1 + dark-scene lights → near-black PBR.
 * Force dielectric leaves and lift albedo via soft emissive so they read on
 * the particle garden's near-black lighting. Keep original maps otherwise.
 * On mobile, a fragment dim uniform pulls leaves back so they don't blow out
 * under simpler/no-blur lighting.
 */
function isMobileFoliageView(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 900
  );
}

function prepareFoliageMaterial(material: THREE.Material): void {
  const std = material as THREE.MeshStandardMaterial;
  if (std.map instanceof THREE.Texture) {
    std.map.colorSpace = THREE.SRGBColorSpace;
    std.map.anisotropy = 4;
    std.map.needsUpdate = true;
  }
  if (std.normalMap instanceof THREE.Texture) {
    std.normalMap.colorSpace = THREE.NoColorSpace;
    std.normalMap.needsUpdate = true;
  }
  if (std.emissiveMap instanceof THREE.Texture && std.emissiveMap !== std.map) {
    std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    std.emissiveMap.needsUpdate = true;
  }

  // Kill metallic response (no env map in this scene).
  std.metalness = 0;
  std.metalnessMap = null;
  std.roughness = 0.78;
  // Keep roughnessMap if present for leaf variation.
  if (std.roughnessMap) {
    std.roughnessMap.colorSpace = THREE.NoColorSpace;
  }

  const mobile = isMobileFoliageView();

  // Soft albedo lift — original Meshy emissive maps are often near-black.
  if (std.map) {
    std.emissiveMap = std.map;
    if (mobile) {
      // Lower self-light so leaves don't read neon on phones.
      std.emissive.setRGB(0.14, 0.16, 0.13);
      std.emissiveIntensity = 0.55;
      std.color.setRGB(0.78, 0.82, 0.76);
    } else {
      std.emissive.setRGB(0.35, 0.35, 0.35);
      std.emissiveIntensity = 1;
      std.color.set(0xffffff);
    }
  }

  std.envMapIntensity = 0;
  std.side = THREE.DoubleSide;
  // Write depth so project thumbnails nest behind leaves/stems.
  std.depthWrite = true;
  std.depthTest = true;

  if (mobile) {
    const dim = 0.58;
    std.onBeforeCompile = (shader) => {
      shader.uniforms.uFoliageDim = { value: dim };
      shader.fragmentShader = shader.fragmentShader.replace(
        "void main() {",
        "uniform float uFoliageDim;\nvoid main() {",
      );
      // Multiply final lit color before tonemap/output packing.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        /* glsl */ `
          outgoingLight *= uFoliageDim;
          #include <opaque_fragment>
        `,
      );
    };
    std.customProgramCacheKey = () => `foliage-mobile-dim-${dim}`;
  }

  std.needsUpdate = true;
}

/**
 * Pull the first textured mesh from a foliage GLB and normalize its pivot.
 * UVs and authored normals are left intact — never welded or recomputed.
 */
function extractPlantTemplate(scene: THREE.Object3D): {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
} {
  const found: THREE.Mesh[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry) found.push(obj);
  });
  const source = found[0];
  if (!source) {
    throw new Error("Foliage GLB contained no mesh");
  }

  const geometry = source.geometry.clone();
  // Bake node transform into positions/normals only — TEXCOORD is unchanged.
  geometry.applyMatrix4(source.matrixWorld);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const footprint = Math.max(size.x, size.z) || 1;
  const normalize = TARGET_FOOTPRINT / footprint;
  const center = box.getCenter(new THREE.Vector3());
  // Uniform scale + ground pivot via matrix (does not touch UVs).
  const fix = new THREE.Matrix4()
    .makeTranslation(-center.x, -box.min.y, -center.z)
    .premultiply(new THREE.Matrix4().makeScale(normalize, normalize, normalize));
  geometry.applyMatrix4(fix);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const rawMat = Array.isArray(source.material) ? source.material[0] : source.material;
  const material = (rawMat as THREE.Material).clone();
  prepareFoliageMaterial(material);

  return { geometry, material };
}

function sampleSurfaceNormal(
  heightField: HeightField,
  x: number,
  z: number,
  eps = 0.45,
): THREE.Vector3 {
  const yL = heightField.sample(x - eps, z);
  const yR = heightField.sample(x + eps, z);
  const yD = heightField.sample(x, z - eps);
  const yU = heightField.sample(x, z + eps);
  return new THREE.Vector3(yL - yR, eps * 2, yD - yU).normalize();
}

function tooClose(
  x: number,
  z: number,
  points: Array<{ x: number; z: number }>,
  minSpacing: number,
): boolean {
  const minSq = minSpacing * minSpacing;
  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i].x - x;
    const dz = points[i].z - z;
    if (dx * dx + dz * dz < minSq) return true;
  }
  return false;
}

/**
 * Scatter the three foliage clumps across the existing landscape height field.
 * Returns a dedicated `forest-foliage` group of InstancedMeshes — terrain untouched.
 */
export async function createForestFoliageLayer(
  options: FoliageScatterOptions,
): Promise<THREE.Group> {
  const {
    heightField,
    walkCircle,
    walkBounds,
    clearCenter,
    onProgress,
    seed = 0xf01a9e,
    lean = false,
  } = options;

  const root = new THREE.Group();
  root.name = "forest-foliage";

  const loader = createGltfLoader();
  const rand = mulberry32(seed);

  const up = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const twist = new THREE.Quaternion();
  const align = new THREE.Quaternion();
  const normal = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  const allPlaced: Array<{ x: number; z: number }> = [];

  // Prefetch all foliage GLBs in parallel — sequential waits dominate on mid-speed links.
  onProgress?.("Growing foliage…");
  const templates = await Promise.all(
    SPECIES.map(async (species) => {
      const gltf = await loader.loadAsync(species.url);
      return { species, ...extractPlantTemplate(gltf.scene) };
    }),
  );

  for (const { species, geometry, material } of templates) {
    onProgress?.(`Growing foliage… ${species.name}`);
    const count = lean ? Math.max(6, Math.round(species.count * 0.55)) : species.count;

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = species.name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;

    const placed: Array<{ x: number; z: number }> = [];
    let written = 0;
    const maxAttempts = count * 60;
    const scatterRadius = walkCircle.radius * FOLIAGE_RADIUS_FRACTION;

    for (let attempt = 0; attempt < maxAttempts && written < count; attempt += 1) {
      const ang = rand() * Math.PI * 2;
      const radial = Math.sqrt(rand()) * scatterRadius;
      const x = walkCircle.x + Math.cos(ang) * radial;
      const z = walkCircle.z + Math.sin(ang) * radial;

      if (x < walkBounds.min.x + FOLIAGE_EDGE_INSET) continue;
      if (x > walkBounds.max.x - FOLIAGE_EDGE_INSET) continue;
      if (z < walkBounds.min.z + FOLIAGE_EDGE_INSET) continue;
      if (z > walkBounds.max.z - FOLIAGE_EDGE_INSET) continue;
      if (!heightField.hasSupport(x, z, FOLIAGE_EDGE_INSET * 0.65)) continue;

      if (clearCenter) {
        const dx = x - clearCenter.x;
        const dz = z - clearCenter.z;
        if (dx * dx + dz * dz < clearCenter.radius * clearCenter.radius) continue;
      }

      if (tooClose(x, z, placed, species.minSpacing)) continue;
      if (tooClose(x, z, allPlaced, species.minSpacing * 0.45)) continue;
      if (rand() > species.acceptChance) continue;

      const y = heightField.sample(x, z);
      normal.copy(sampleSurfaceNormal(heightField, x, z));
      if (normal.y < 0.42) continue;

      const scaleValue =
        species.scale[0] + rand() * (species.scale[1] - species.scale[0]);
      const slopeSquash = THREE.MathUtils.lerp(0.85, 1, normal.y);
      scale.set(scaleValue, scaleValue * slopeSquash, scaleValue);

      align.setFromUnitVectors(up, normal);
      twist.setFromAxisAngle(up, rand() * Math.PI * 2);
      quaternion.copy(align).multiply(twist);

      position.set(x, y, z);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(written, matrix);

      placed.push({ x, z });
      allPlaced.push({ x, z });
      written += 1;
    }

    mesh.count = written;
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  }

  // Caller clears load status when this promise settles — no completion toast.
  return root;
}
