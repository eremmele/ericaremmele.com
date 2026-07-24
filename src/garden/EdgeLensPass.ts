import * as THREE from "three";

/**
 * Tilt-shift inspired by https://github.com/andrewdcampbell/tilt-shift
 *
 * Algorithm: keep a sharp band, then apply recursively stronger Gaussian
 * blur toward the top/bottom edges (cascaded full-frame blurs), alpha-blending
 * between blur levels by distance from horizontal focus lines — same idea as
 * their `increasing_blur` (horizontal miniature bands).
 */
export class EdgeLensPass {
  private readonly level0: THREE.WebGLRenderTarget;
  private readonly level1: THREE.WebGLRenderTarget;
  private readonly level2: THREE.WebGLRenderTarget;
  private readonly level3: THREE.WebGLRenderTarget;
  private readonly temp: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly mixMat: THREE.ShaderMaterial;
  private readonly blurMesh: THREE.Mesh;

  constructor(width: number, height: number) {
    const opts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.SRGBColorSpace,
    };

    this.level0 = new THREE.WebGLRenderTarget(width, height, {
      ...opts,
      depthBuffer: true,
    });
    this.level1 = new THREE.WebGLRenderTarget(width, height, { ...opts, depthBuffer: false });
    this.level2 = new THREE.WebGLRenderTarget(width, height, { ...opts, depthBuffer: false });
    this.level3 = new THREE.WebGLRenderTarget(width, height, { ...opts, depthBuffer: false });
    this.temp = new THREE.WebGLRenderTarget(width, height, { ...opts, depthBuffer: false });

    // Separable Gaussian ≈ OpenCV ksize 15×15 (sigmaX=0 → ~2.3)
    this.blurMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(width, height) },
        uDirection: { value: new THREE.Vector2(1, 0) },
        // ~15px kernel feel; sigma matches OpenCV default for ksize=15
        uSigma: { value: 2.3 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uResolution;
        uniform vec2 uDirection;
        uniform float uSigma;
        varying vec2 vUv;

        void main() {
          vec2 stepPx = uDirection / uResolution;
          float twoSigma2 = 2.0 * uSigma * uSigma;
          // Half-width 7 → 15 taps (matches ksize=15)
          vec4 color = vec4(0.0);
          float wSum = 0.0;
          for (int i = -7; i <= 7; i++) {
            float fi = float(i);
            float w = exp(-(fi * fi) / twoSigma2);
            color += texture2D(tDiffuse, vUv + stepPx * fi) * w;
            wSum += w;
          }
          gl_FragColor = color / max(wSum, 1e-4);
        }
      `,
    });

    this.mixMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tLevel0: { value: null },
        tLevel1: { value: null },
        tLevel2: { value: null },
        tLevel3: { value: null },
        uFocusMin: { value: 0.2 },
        uFocusMax: { value: 0.8 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tLevel0;
        uniform sampler2D tLevel1;
        uniform sampler2D tLevel2;
        uniform sampler2D tLevel3;
        uniform float uFocusMin;
        uniform float uFocusMax;
        varying vec2 vUv;

        // 0 inside sharp horizontal band; 1 at top/bottom screen edges
        float edgeDist(float y) {
          if (y < uFocusMin) {
            return clamp((uFocusMin - y) / max(uFocusMin, 1e-5), 0.0, 1.0);
          }
          if (y > uFocusMax) {
            return clamp((y - uFocusMax) / max(1.0 - uFocusMax, 1e-5), 0.0, 1.0);
          }
          return 0.0;
        }

        vec4 sampleLevel(float level) {
          if (level < 0.5) return texture2D(tLevel0, vUv);
          if (level < 1.5) return texture2D(tLevel1, vUv);
          if (level < 2.5) return texture2D(tLevel2, vUv);
          return texture2D(tLevel3, vUv);
        }

        void main() {
          float d = edgeDist(vUv.y);
          if (d < 0.001) {
            gl_FragColor = texture2D(tLevel0, vUv);
            return;
          }

          float t = d * 3.0;
          float lo = floor(t);
          float hi = min(lo + 1.0, 3.0);
          float f = smoothstep(0.0, 1.0, fract(t));

          gl_FragColor = mix(sampleLevel(lo), sampleLevel(hi), f);
        }
      `,
    });

    this.blurMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMat);
    this.scene.add(this.blurMesh);
  }

  private blurFull(
    renderer: THREE.WebGLRenderer,
    source: THREE.Texture,
    target: THREE.WebGLRenderTarget,
  ): void {
    // Horizontal → temp
    this.blurMat.uniforms.tDiffuse.value = source;
    this.blurMat.uniforms.uDirection.value.set(1, 0);
    renderer.setRenderTarget(this.temp);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    // Vertical → target
    this.blurMat.uniforms.tDiffuse.value = this.temp.texture;
    this.blurMat.uniforms.uDirection.value.set(0, 1);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number, pixelRatio = 1): void {
    for (const rt of [this.level0, this.level1, this.level2, this.level3, this.temp]) {
      rt.setSize(width, height);
    }
    this.blurMat.uniforms.uResolution.value.set(width, height);
    // Scale sigma with DPR so on-screen blur ≈ OpenCV 15×15 on CSS pixels
    this.blurMat.uniforms.uSigma.value = 2.3 * pixelRatio;
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): void {
    const prevTone = renderer.toneMapping;
    const prevTarget = renderer.getRenderTarget();

    // Level 0 — sharp
    renderer.setRenderTarget(this.level0);
    renderer.clear();
    renderer.render(scene, camera);

    renderer.toneMapping = THREE.NoToneMapping;

    // Cascaded blurs (recursive increasing blur)
    this.blurMesh.material = this.blurMat;
    this.blurFull(renderer, this.level0.texture, this.level1);
    this.blurFull(renderer, this.level1.texture, this.level2);
    this.blurFull(renderer, this.level2.texture, this.level3);

    // Mix levels by distance from focus lines
    this.mixMat.uniforms.tLevel0.value = this.level0.texture;
    this.mixMat.uniforms.tLevel1.value = this.level1.texture;
    this.mixMat.uniforms.tLevel2.value = this.level2.texture;
    this.mixMat.uniforms.tLevel3.value = this.level3.texture;
    this.blurMesh.material = this.mixMat;

    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);

    renderer.toneMapping = prevTone;
    renderer.setRenderTarget(prevTarget);
  }

  dispose(): void {
    this.level0.dispose();
    this.level1.dispose();
    this.level2.dispose();
    this.level3.dispose();
    this.temp.dispose();
    this.blurMat.dispose();
    this.mixMat.dispose();
  }
}
