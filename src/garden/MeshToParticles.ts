import * as THREE from "three";
import { yieldToMain } from "../util/yieldToMain";
import { createMovingPixelsMaterial } from "./MovingPixels";
import { mapToPalette, PALETTE } from "./palette";

export type ParticleCloudOptions = {
  targetCount?: number;
  maxCount?: number;
  onProgress?: (ratio: number) => void;
  /** Discard this fraction of the model’s lowest Y range (bottom dome). Default 0.22 */
  bottomCutRatio?: number;
  /** >1 packs more particles toward the top canopy. Default 1.6 */
  upperBias?: number;
  /** Ground band height as fraction of usable span. Default 0.45 */
  groundBandRatio?: number;
  /** Extra weight for ground-band surface area (2 = twice as likely). Default 2.2 */
  groundDensityBoost?: number;
  /** Soft disc sprite (Penderecki-style). */
  pointTexture?: THREE.Texture;
};

type TextureSampler = (u: number, v: number) => void;

const SAMPLE_SIZE = 96;

function getDiffuseMap(material: THREE.Material): THREE.Texture | null {
  if ("map" in material && material.map instanceof THREE.Texture) {
    return material.map;
  }
  return null;
}

function getMaterialTint(material: THREE.Material): THREE.Color {
  if ("color" in material && material.color instanceof THREE.Color) {
    return material.color.clone();
  }
  return new THREE.Color(0xffffff);
}

function createTextureSampler(
  texture: THREE.Texture,
  out: THREE.Color,
): TextureSampler | null {
  const image = texture.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | undefined;

  if (!image) return null;

  const srcW = "width" in image ? image.width : 0;
  const srcH = "height" in image ? image.height : 0;
  if (!srcW || !srcH) return null;

  const w = Math.min(SAMPLE_SIZE, srcW);
  const h = Math.min(SAMPLE_SIZE, srcH);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(image as CanvasImageSource, 0, 0, w, h);
  } catch {
    return null;
  }

  const { data } = ctx.getImageData(0, 0, w, h);
  const flipY = texture.flipY;

  return (u: number, v: number) => {
    let uu = u - Math.floor(u);
    let vv = v - Math.floor(v);
    if (uu < 0) uu += 1;
    if (vv < 0) vv += 1;
    if (flipY) vv = 1 - vv;

    const x = Math.min(w - 1, Math.max(0, (uu * w) | 0));
    const y = Math.min(h - 1, Math.max(0, (vv * h) | 0));
    const i = (y * w + x) * 4;
    out.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
  };
}

const _fallback = new THREE.Color(PALETTE[3]);
const _hi = new THREE.Color(PALETTE[1]);
const _paletteOut = new THREE.Color();

/** Keep mesh in scene for raycasts / height, but don't draw it. */
function hideMeshVisually(mesh: THREE.Mesh): void {
  mesh.visible = true;
  mesh.material = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
  });
}

type MeshJob = {
  mesh: THREE.Mesh;
  sample: TextureSampler | null;
  tint: THREE.Color;
  triCount: number;
  /** Per-triangle areas (world space). */
  triAreas: Float32Array;
  /** Cumulative area for weighted picks. */
  cdf: Float32Array;
  meshArea: number;
};

export type PoolInfo = {
  x: number;
  z: number;
  radius: number;
};

export type ParticleCloudResult = {
  points: THREE.Points;
  positions: Float32Array;
  pool: PoolInfo | null;
  walkRadius: number;
  walkCenter: THREE.Vector2;
};

function computeWalkCircle(
  positions: Float32Array,
  count: number,
): { center: THREE.Vector2; radius: number } {
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < count; i += 1) {
    cx += positions[i * 3];
    cz += positions[i * 3 + 2];
  }
  cx /= Math.max(count, 1);
  cz /= Math.max(count, 1);

  const dists: number[] = [];
  for (let i = 0; i < count; i += 1) {
    dists.push(
      Math.hypot(positions[i * 3] - cx, positions[i * 3 + 2] - cz),
    );
  }
  dists.sort((a, b) => a - b);
  const radius = dists[Math.floor(dists.length * 0.9)] * 0.92;
  return { center: new THREE.Vector2(cx, cz), radius: Math.max(radius, 4) };
}

function triangleArea(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  _edge1.subVectors(b, a);
  _edge2.subVectors(c, a);
  _cross.crossVectors(_edge1, _edge2);
  return _cross.length() * 0.5;
}

const _edge1 = new THREE.Vector3();
const _edge2 = new THREE.Vector3();
const _cross = new THREE.Vector3();

/**
 * Convert meshes to a particle cloud. Yields occasionally so the tab stays responsive.
 * Samples by surface area so density stays even across the whole textured mesh.
 */
export async function meshSceneToParticleCloud(
  sourceRoot: THREE.Object3D,
  options: ParticleCloudOptions = {},
): Promise<ParticleCloudResult> {
  const targetCount = options.targetCount ?? 420_000;
  const maxCount = options.maxCount ?? 480_000;
  const bottomCutRatio = options.bottomCutRatio ?? 0.18;
  const groundBandRatio = options.groundBandRatio ?? 0.48;
  const groundDensityBoost = options.groundDensityBoost ?? 2.4;
  const onProgress = options.onProgress;
  const desired = Math.min(maxCount, Math.max(20_000, targetCount));

  sourceRoot.updateMatrixWorld(true);
  const worldBox = new THREE.Box3().setFromObject(sourceRoot);
  const minY = worldBox.min.y;
  const maxY = worldBox.max.y;
  const cutY = minY + Math.max(maxY - minY, 1e-3) * bottomCutRatio;
  const usableSpan = Math.max(maxY - cutY, 1e-3);
  const groundTop = cutY + usableSpan * groundBandRatio;

  const jobs: MeshJob[] = [];
  let totalArea = 0;
  const sampleColor = new THREE.Color();
  const meshBox = new THREE.Box3();
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const p = new THREE.Vector3();
  const uv0 = new THREE.Vector2();
  const uv1 = new THREE.Vector2();
  const uv2 = new THREE.Vector2();
  const uv = new THREE.Vector2();

  sourceRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry?.attributes?.position) return;

    meshBox.setFromObject(obj);
    if (meshBox.max.y < cutY) {
      hideMeshVisually(obj);
      return;
    }

    const geometry = obj.geometry;
    const pos = geometry.attributes.position;
    const index = geometry.index;
    const triCount = index ? (index.count / 3) | 0 : (pos.count / 3) | 0;
    if (triCount <= 0) return;

    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    const map = getDiffuseMap(materials[0]);
    if (map) map.colorSpace = THREE.SRGBColorSpace;

    const matrix = obj.matrixWorld;
    const triAreas = new Float32Array(triCount);
    const cdf = new Float32Array(triCount);
    let meshArea = 0;
    for (let t = 0; t < triCount; t += 1) {
      let i0: number;
      let i1: number;
      let i2: number;
      if (index) {
        const base = t * 3;
        i0 = index.getX(base);
        i1 = index.getX(base + 1);
        i2 = index.getX(base + 2);
      } else {
        i0 = t * 3;
        i1 = i0 + 1;
        i2 = i0 + 2;
      }
      v0.fromBufferAttribute(pos, i0).applyMatrix4(matrix);
      v1.fromBufferAttribute(pos, i1).applyMatrix4(matrix);
      v2.fromBufferAttribute(pos, i2).applyMatrix4(matrix);
      if (v0.y < cutY && v1.y < cutY && v2.y < cutY) {
        triAreas[t] = 0;
      } else {
        let area = triangleArea(v0, v1, v2);
        const cy = (v0.y + v1.y + v2.y) / 3;
        // Prefer ground so the floor isn’t starved by detailed upper meshes
        if (cy >= cutY && cy <= groundTop) {
          area *= groundDensityBoost;
        }
        triAreas[t] = area;
      }
      meshArea += triAreas[t];
      cdf[t] = meshArea;
    }
    if (meshArea <= 0) {
      hideMeshVisually(obj);
      return;
    }

    jobs.push({
      mesh: obj,
      sample: map ? createTextureSampler(map, sampleColor) : null,
      tint: getMaterialTint(materials[0]),
      triCount,
      triAreas,
      cdf,
      meshArea,
    });
    totalArea += meshArea;
    hideMeshVisually(obj);
  });

  // Extra room for pool rim + floor densification
  const capacity = desired + 30_000;
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const heightPositions: number[] = [];
  let written = 0;
  let attempts = 0;
  const maxAttempts = desired * 8;
  const YIELD_EVERY = 20_000;

  const pickJob = (): MeshJob | null => {
    if (jobs.length === 0 || totalArea <= 0) return null;
    let r = Math.random() * totalArea;
    for (const job of jobs) {
      r -= job.meshArea;
      if (r <= 0) return job;
    }
    return jobs[jobs.length - 1];
  };

  const pickTriangle = (job: MeshJob): number => {
    const target = Math.random() * job.meshArea;
    let lo = 0;
    let hi = job.triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (job.cdf[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  while (written < desired && attempts < maxAttempts) {
    attempts += 1;
    const job = pickJob();
    if (!job) break;

    const geometry = job.mesh.geometry;
    const posAttr = geometry.attributes.position;
    const uvAttr = geometry.attributes.uv;
    const index = geometry.index;
    const matrix = job.mesh.matrixWorld;

    const tri = pickTriangle(job);
    if (job.triAreas[tri] <= 0) continue;

    let i0: number;
    let i1: number;
    let i2: number;
    if (index) {
      const base = tri * 3;
      i0 = index.getX(base);
      i1 = index.getX(base + 1);
      i2 = index.getX(base + 2);
    } else {
      i0 = tri * 3;
      i1 = i0 + 1;
      i2 = i0 + 2;
    }

    v0.fromBufferAttribute(posAttr, i0).applyMatrix4(matrix);
    v1.fromBufferAttribute(posAttr, i1).applyMatrix4(matrix);
    v2.fromBufferAttribute(posAttr, i2).applyMatrix4(matrix);

    const r1 = Math.random();
    const r2 = Math.random();
    const a = 1 - Math.sqrt(r1);
    const b = r2 * (1 - a);
    const c = 1 - a - b;
    p.set(
      a * v0.x + b * v1.x + c * v2.x,
      a * v0.y + b * v1.y + c * v2.y,
      a * v0.z + b * v1.z + c * v2.z,
    );

    if (p.y < cutY) {
      if (heightPositions.length < desired * 0.15) {
        heightPositions.push(p.x, p.y, p.z);
      }
      continue;
    }

    // Even keep — no height bias so the full textured surface renders
    const t = THREE.MathUtils.clamp((p.y - cutY) / usableSpan, 0, 1);

    const o = written * 3;
    positions[o] = p.x;
    positions[o + 1] = p.y;
    positions[o + 2] = p.z;
    heightPositions.push(p.x, p.y, p.z);

    if (uvAttr && job.sample) {
      uv0.set(uvAttr.getX(i0), uvAttr.getY(i0));
      uv1.set(uvAttr.getX(i1), uvAttr.getY(i1));
      uv2.set(uvAttr.getX(i2), uvAttr.getY(i2));
      uv.set(
        a * uv0.x + b * uv1.x + c * uv2.x,
        a * uv0.y + b * uv1.y + c * uv2.y,
      );
      job.sample(uv.x, uv.y);
      sampleColor.multiply(job.tint);
    } else {
      sampleColor.copy(_fallback).lerp(_hi, t * 0.4).multiply(job.tint);
    }

    mapToPalette(sampleColor, _paletteOut);
    colors[o] = _paletteOut.r;
    colors[o + 1] = _paletteOut.g;
    colors[o + 2] = _paletteOut.b;
    written += 1;

    if (written % YIELD_EVERY === 0) {
      onProgress?.(written / desired);
      await yieldToMain();
    }
  }

  onProgress?.(0.92);

  const pool = null;
  onProgress?.(1);

  const posView = positions.subarray(0, written * 3);
  const colView = colors.subarray(0, written * 3);
  const walk = computeWalkCircle(posView, written);

  // Penderecki-style per-point motion / size / alpha attributes
  const amplitudes = new Float32Array(written * 3);
  const sizes = new Float32Array(written);
  const alphas = new Float32Array(written);
  for (let i = 0; i < written; i += 1) {
    const y = posView[i * 3 + 1];
    const rgb =
      colView[i * 3] + colView[i * 3 + 1] + colView[i * 3 + 2];
    // Stronger drift on darker / elevated points (same idea as their factor)
    const factor = y > cutY + usableSpan * 0.15 && rgb < 1.8 ? 1 : 0.25;
    for (let k = 0; k < 3; k += 1) {
      const sign = Math.random() > 0.5 ? -1 : 1;
      const mag = Math.random() > 0.9 ? 1.2 : 0.1;
      amplitudes[i * 3 + k] = factor * Math.random() * sign * mag;
    }
    alphas[i] = Math.random();
    sizes[i] = -1 + Math.random() * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(posView.slice(), 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(colView.slice(), 3),
  );
  geometry.setAttribute(
    "amplitude",
    new THREE.BufferAttribute(amplitudes, 3),
  );
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));
  geometry.computeBoundingSphere();

  const tex =
    options.pointTexture ??
    (() => {
      const data = new Uint8Array([255, 255, 255, 255]);
      const t = new THREE.DataTexture(data, 1, 1);
      t.needsUpdate = true;
      return t;
    })();
  const material = createMovingPixelsMaterial(tex);

  const points = new THREE.Points(geometry, material);
  points.name = "garden-moving-pixels";
  points.frustumCulled = true;
  points.renderOrder = 0;

  const heightOut = new Float32Array(heightPositions.length + written * 3);
  heightOut.set(heightPositions, 0);
  heightOut.set(posView, heightPositions.length);

  return {
    points,
    positions: heightOut,
    pool,
    walkRadius: walk.radius,
    walkCenter: walk.center,
  };
}
