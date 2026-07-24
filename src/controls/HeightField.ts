import * as THREE from "three";

/**
 * Prebaked height field for smooth ground following.
 * Uses the top surface (max Y per cell) so walkers stay on the mesh exterior.
 */
export class HeightField {
  private readonly minX: number;
  private readonly minZ: number;
  private readonly stepX: number;
  private readonly stepZ: number;
  private readonly resX: number;
  private readonly resZ: number;
  private readonly heights: Float32Array;
  private readonly fallbackY: number;

  private constructor(
    minX: number,
    minZ: number,
    stepX: number,
    stepZ: number,
    resX: number,
    resZ: number,
    heights: Float32Array,
    fallbackY: number,
  ) {
    this.minX = minX;
    this.minZ = minZ;
    this.stepX = stepX;
    this.stepZ = stepZ;
    this.resX = resX;
    this.resZ = resZ;
    this.heights = heights;
    this.fallbackY = fallbackY;
  }

  /**
   * Bake from XYZ samples. Keeps the highest Y in each cell (top of mesh).
   */
  static fromPositions(
    positions: ArrayLike<number>,
    bounds: THREE.Box3,
    resolution = 64,
  ): HeightField {
    const sizeX = Math.max(bounds.max.x - bounds.min.x, 1);
    const sizeZ = Math.max(bounds.max.z - bounds.min.z, 1);
    const resX = resolution;
    const resZ = resolution;
    const stepX = sizeX / (resX - 1);
    const stepZ = sizeZ / (resZ - 1);
    const tops = new Float32Array(resX * resZ);
    const counts = new Uint32Array(resX * resZ);
    tops.fill(Number.NEGATIVE_INFINITY);
    const count = (positions.length / 3) | 0;

    for (let i = 0; i < count; i += 1) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      if (x < bounds.min.x || x > bounds.max.x) continue;
      if (z < bounds.min.z || z > bounds.max.z) continue;
      const ix = THREE.MathUtils.clamp(
        Math.round((x - bounds.min.x) / stepX),
        0,
        resX - 1,
      );
      const iz = THREE.MathUtils.clamp(
        Math.round((z - bounds.min.z) / stepZ),
        0,
        resZ - 1,
      );
      const idx = iz * resX + ix;
      if (counts[idx] === 0 || y > tops[idx]) {
        tops[idx] = y;
        counts[idx] = 1;
      }
    }

    let filledSum = 0;
    let filledN = 0;
    const heights = new Float32Array(resX * resZ);
    for (let i = 0; i < heights.length; i += 1) {
      if (counts[i] > 0) {
        heights[i] = tops[i];
        filledSum += tops[i];
        filledN += 1;
      } else {
        heights[i] = Number.NaN;
      }
    }

    const fallbackY = filledN > 0 ? filledSum / filledN : bounds.min.y;

    for (let pass = 0; pass < 3; pass += 1) {
      for (let iz = 0; iz < resZ; iz += 1) {
        for (let ix = 0; ix < resX; ix += 1) {
          const idx = iz * resX + ix;
          if (!Number.isNaN(heights[idx])) continue;
          let sum = 0;
          let n = 0;
          for (let dz = -1; dz <= 1; dz += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const x = ix + dx;
              const z = iz + dz;
              if (x < 0 || z < 0 || x >= resX || z >= resZ) continue;
              const h = heights[z * resX + x];
              if (Number.isNaN(h)) continue;
              sum += h;
              n += 1;
            }
          }
          if (n > 0) heights[idx] = sum / n;
        }
      }
    }

    for (let i = 0; i < heights.length; i += 1) {
      if (Number.isNaN(heights[i])) heights[i] = fallbackY;
    }

    return new HeightField(
      bounds.min.x,
      bounds.min.z,
      stepX,
      stepZ,
      resX,
      resZ,
      heights,
      fallbackY,
    );
  }

  sample(x: number, z: number): number {
    const fx = (x - this.minX) / this.stepX;
    const fz = (z - this.minZ) / this.stepZ;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    if (x0 < 0 || z0 < 0 || x1 >= this.resX || z1 >= this.resZ) {
      return this.fallbackY;
    }

    const tx = fx - x0;
    const tz = fz - z0;
    const h00 = this.heights[z0 * this.resX + x0];
    const h10 = this.heights[z0 * this.resX + x1];
    const h01 = this.heights[z1 * this.resX + x0];
    const h11 = this.heights[z1 * this.resX + x1];
    const h0 = h00 + (h10 - h00) * tx;
    const h1 = h01 + (h11 - h01) * tx;
    return h0 + (h1 - h0) * tz;
  }
}
