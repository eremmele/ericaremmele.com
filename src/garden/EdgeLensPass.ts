import * as THREE from "three";

/**
 * Peripheral horizontal motion blur (mask: white = max blur at L/R edges,
 * black = sharp center band).
 *
 * Algorithm: keep a sharp vertical band, then apply recursively stronger
 * horizontal Gaussian blur toward the left/right edges (cascaded full-frame
 * blurs), alpha-blending between blur levels by distance from the focus
 * band — same increasing-blur idea as tilt-shift, remapped to X.
 *
 * Mask mapping (matches reference gradient strip):
 *   x in [focusMin, focusMax]  → d = 0 (sharp / black)
 *   x → 0 or 1                 → d = 1 (max blur / white)
 *   linear ramp in between
 */
export class EdgeLensPass {
  private readonly level0: THREE.WebGLRenderTarget;
  private readonly level1: THREE.WebGLRenderTarget;
  private readonly level2: THREE.WebGLRenderTarget;
  private readonly level3: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly mixMat: THREE.ShaderMaterial;
  private readonly blurMesh: THREE.Mesh;
  private blurScale = 0.33;
  private blurLevels: 1 | 2 | 3 = 3;
  private enabled = true;
  /** When true, skip the blur cascade for this stretch of frames (moving camera). */
  private lean = false;

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
      // Sampled by project cards so they nest into foliage after the blur mix.
      depthTexture: new THREE.DepthTexture(width, height),
    });
    this.level1 = new THREE.WebGLRenderTarget(width, height, { ...opts, depthBuffer: false });
    this.level2 = new THREE.WebGLRenderTarget(width, height, { ...opts, depthBuffer: false });
    this.level3 = new THREE.WebGLRenderTarget(width, height, { ...opts, depthBuffer: false });

    // Separable Gaussian taps, applied only horizontally (motion-blur feel)
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
          // Half-width 4 → 9 taps (cheaper than 15; still reads as soft edge smear)
          vec4 color = vec4(0.0);
          float wSum = 0.0;
          for (int i = -4; i <= 4; i++) {
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
        // Slightly wider than middle-third so more of the view stays sharp
        uFocusMin: { value: 0.26 },
        uFocusMax: { value: 0.74 },
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

        // Linear 0 at the inner focus edge → 1 at the outer screen edge (X)
        float edgeDist(float x) {
          if (x < uFocusMin) {
            return clamp((uFocusMin - x) / max(uFocusMin, 1e-5), 0.0, 1.0);
          }
          if (x > uFocusMax) {
            return clamp((x - uFocusMax) / max(1.0 - uFocusMax, 1e-5), 0.0, 1.0);
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
          // 0% blur in center band, 100% at L/R edges — linear (mask gray ramp)
          float d = edgeDist(vUv.x);
          if (d <= 0.0) {
            gl_FragColor = texture2D(tLevel0, vUv);
            return;
          }

          float t = d * 3.0;
          float lo = floor(t);
          float hi = min(lo + 1.0, 3.0);
          float f = fract(t);
          // At d == 1, t == 3 → stay on max blur level
          if (d >= 1.0) {
            gl_FragColor = texture2D(tLevel3, vUv);
            return;
          }

          gl_FragColor = mix(sampleLevel(lo), sampleLevel(hi), f);
        }
      `,
    });

    this.blurMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMat);
    this.scene.add(this.blurMesh);
  }

  private blurHorizontal(
    renderer: THREE.WebGLRenderer,
    source: THREE.Texture,
    target: THREE.WebGLRenderTarget,
  ): void {
    this.blurMat.uniforms.tDiffuse.value = source;
    this.blurMat.uniforms.uDirection.value.set(1, 0);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  /** Sharp-pass garden depth — used to tuck bright cards into foliage. */
  get sharpDepth(): THREE.DepthTexture | null {
    if (!this.enabled || this.lean) return null;
    return (this.level0.depthTexture as THREE.DepthTexture | null) ?? null;
  }

  setFocusBand(min: number, max: number): void {
    this.mixMat.uniforms.uFocusMin.value = min;
    this.mixMat.uniforms.uFocusMax.value = max;
  }

  /** When false, skip the blur cascade and draw the scene once (mobile / low GPU). */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
  }

  /** Browser budget: cheaper cascade scale / fewer blur levels. */
  configure(options: { blurScale?: number; blurLevels?: 1 | 2 | 3 }): void {
    if (options.blurScale !== undefined) this.blurScale = options.blurScale;
    if (options.blurLevels !== undefined) this.blurLevels = options.blurLevels;
  }

  /** Skip post while the camera is whipping around (restored when settled). */
  setLean(lean: boolean): void {
    this.lean = lean;
  }

  resize(width: number, height: number, pixelRatio = 1): void {
    const scale = this.blurScale;
    const bw = Math.max(1, (width * scale) | 0);
    const bh = Math.max(1, (height * scale) | 0);
    this.level0.setSize(width, height);
    this.level1.setSize(bw, bh);
    this.level2.setSize(bw, bh);
    this.level3.setSize(bw, bh);
    this.blurMat.uniforms.uResolution.value.set(bw, bh);
    this.blurMat.uniforms.uSigma.value = 1.8 * Math.min(pixelRatio, 1.25);
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): void {
    if (!this.enabled || this.lean) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }

    const prevTone = renderer.toneMapping;
    const prevTarget = renderer.getRenderTarget();

    // Level 0 — sharp
    renderer.setRenderTarget(this.level0);
    renderer.clear();
    renderer.render(scene, camera);

    renderer.toneMapping = THREE.NoToneMapping;

    // Cascaded horizontal motion blurs (level count from browser profile)
    this.blurMesh.material = this.blurMat;
    this.blurHorizontal(renderer, this.level0.texture, this.level1);
    if (this.blurLevels >= 2) {
      this.blurHorizontal(renderer, this.level1.texture, this.level2);
    }
    if (this.blurLevels >= 3) {
      this.blurHorizontal(renderer, this.level2.texture, this.level3);
    }

    const l1 = this.level1.texture;
    const l2 = this.blurLevels >= 2 ? this.level2.texture : l1;
    const l3 = this.blurLevels >= 3 ? this.level3.texture : l2;

    this.mixMat.uniforms.tLevel0.value = this.level0.texture;
    this.mixMat.uniforms.tLevel1.value = l1;
    this.mixMat.uniforms.tLevel2.value = l2;
    this.mixMat.uniforms.tLevel3.value = l3;
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
    this.blurMat.dispose();
    this.mixMat.dispose();
  }
}
