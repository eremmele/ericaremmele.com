import * as THREE from "three";

export type HologramMaterialOptions = {
  color?: THREE.ColorRepresentation;
  opacity?: number;
  pixelSize?: number;
  map?: THREE.Texture | null;
  /** Opaque terrain hologram vs additive ghost voxels */
  mode?: "terrain" | "ghost";
};

export function createHologramMaterial(
  options?: HologramMaterialOptions,
): THREE.ShaderMaterial {
  const color = new THREE.Color(options?.color ?? 0x5ef0ff);
  const opacity = options?.opacity ?? 0.82;
  const pixelSize = options?.pixelSize ?? 64;
  const mode = options?.mode ?? "ghost";
  const map = options?.map ?? null;
  const isTerrain = mode === "terrain";

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: isTerrain,
    blending: isTerrain ? THREE.NormalBlending : THREE.AdditiveBlending,
    side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: color },
      uOpacity: { value: opacity },
      uPixelSize: { value: pixelSize },
      uScanStrength: { value: isTerrain ? 0.35 : 0.22 },
      uFresnelStrength: { value: isTerrain ? 0.85 : 1.35 },
      uMap: { value: map },
      uHasMap: { value: map ? 1 : 0 },
      uTerrain: { value: isTerrain ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uPixelSize;
      uniform float uScanStrength;
      uniform float uFresnelStrength;
      uniform sampler2D uMap;
      uniform float uHasMap;
      uniform float uTerrain;

      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.0);

        vec2 pixelUv = floor(vUv * uPixelSize) / uPixelSize;
        float grid = step(0.88, fract(pixelUv.x * uPixelSize))
                   + step(0.88, fract(pixelUv.y * uPixelSize));
        grid = clamp(grid, 0.0, 1.0);

        float scan = sin((vWorldPos.y + uTime * 0.65) * 14.0) * 0.5 + 0.5;
        float flicker = 0.94 + 0.06 * sin(uTime * 7.0 + vWorldPos.x * 2.5);

        vec3 base = uColor * 0.35;
        if (uHasMap > 0.5) {
          vec4 tex = texture2D(uMap, pixelUv);
          base = mix(tex.rgb, uColor, 0.45);
        }

        vec3 tint = base * (0.7 + fresnel * uFresnelStrength);
        tint += uColor * scan * uScanStrength * 0.55;
        tint += vec3(0.05, 0.25, 0.35) * grid;
        tint *= flicker;

        float alpha;
        if (uTerrain > 0.5) {
          alpha = uOpacity * (0.72 + fresnel * 0.28);
          alpha *= 1.0 - grid * 0.18;
        } else {
          alpha = uOpacity * (0.35 + fresnel * 0.65);
          alpha *= 1.0 - grid * 0.45;
        }

        gl_FragColor = vec4(tint, alpha);
      }
    `,
  });

  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
  }

  return material;
}

export function updateHologramMaterial(
  material: THREE.ShaderMaterial,
  elapsed: number,
): void {
  material.uniforms.uTime.value = elapsed;
}

export function updateHologramMaterials(
  materials: THREE.ShaderMaterial[],
  elapsed: number,
): void {
  materials.forEach((material) => updateHologramMaterial(material, elapsed));
}
