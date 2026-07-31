import * as THREE from "three";

/**
 * Flat round pixels with Penderecki-style size variation + slow noise drift.
 * Point size = base + random*sizeAttr, then perspective-scaled by distance.
 */
export function createMovingPixelsMaterial(
  _pointTexture?: THREE.Texture,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      // Halfway between prior soft look (~1.7) and the oversized flat discs (~5.5)
      uScale: { value: 200 },
      uSize: { value: 2.4 },
      uSizeRandom: { value: 0.9 },
      uPositionRandom: { value: 1 },
      uDepth: { value: 0.17 },
      uFlat: { value: 0 },
      uAlphaMin: { value: 0.45 },
      uAlphaMax: { value: 0.95 },
      uBrightness: { value: 1.55 },
      uContrast: { value: 1.25 },
      uMove: { value: new THREE.Vector3(1, 0.85, 1) },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float alpha;
      attribute vec3 amplitude;

      uniform float uTime;
      uniform float uScale;
      uniform float uSize;
      uniform float uSizeRandom;
      uniform float uPositionRandom;
      uniform float uDepth;
      uniform float uFlat;
      uniform float uAlphaMin;
      uniform float uAlphaMax;
      uniform float uBrightness;
      uniform float uContrast;
      uniform vec3 uMove;

      varying vec3 vColor;
      varying float vAlpha;

      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(
          0.211324865405187,
          0.366025403784439,
          -0.577350269189626,
          0.024390243902439
        );
        vec2 i = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(
          permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0)
        );
        vec3 m = max(
          0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
          0.0
        );
        m = m * m;
        m = m * m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      void main() {
        vec3 c = color;
        c = (c - 0.5) * uContrast + 0.5;
        c = max(c, vec3(0.0)) * uBrightness;
        vColor = c;
        vAlpha = uAlphaMin + (uAlphaMax - uAlphaMin) * alpha;

        vec3 displaced = position;
        float t = uTime * 0.1;

        displaced.x += amplitude.x * snoise(vec2(amplitude.x * 10.0, t))
          * uMove.x * uPositionRandom * uDepth;
        displaced.y += amplitude.y * snoise(vec2(amplitude.y * 10.0, t))
          * uMove.y * uPositionRandom * uDepth;
        displaced.z += amplitude.z * snoise(vec2(amplitude.z * 10.0, t))
          * uMove.z * uPositionRandom * uDepth;
        displaced.z *= (1.0 - uFlat);

        vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        // Penderecki-style size: random attribute + perspective falloff
        gl_PointSize = 1.0;
        gl_PointSize += (uSizeRandom * size);
        gl_PointSize *= uScale / max(length(mvPosition.xyz), 0.001);
        gl_PointSize *= (uSize * 0.025);
        gl_PointSize = clamp(gl_PointSize, 1.2, 7.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float mask = 1.0 - smoothstep(0.46, 0.5, d);
        if (mask < 0.02) discard;
        gl_FragColor = vec4(vColor, vAlpha * mask);
      }
    `,
  });
}

export function updateMovingPixelsMaterials(
  materials: THREE.ShaderMaterial[],
  elapsed: number,
  speed = 0.01,
): void {
  for (const mat of materials) {
    if (mat.uniforms?.uTime) {
      mat.uniforms.uTime.value += speed;
      void elapsed;
    }
  }
}

export function loadPixelSprite(): Promise<THREE.Texture> {
  return Promise.resolve(new THREE.Texture());
}
