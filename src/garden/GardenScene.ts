import * as THREE from "three";
import { CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { inspectionPoints, getPortfolioById } from "../data/portfolio";
import { NavigationController } from "../controls/NavigationController";
import { createPlaceholderGarden } from "./PlaceholderGarden";
import { defaultInspectionPositions, loadGardenGlb } from "./GlbGarden";
import { updateMovingPixelsMaterials } from "./MovingPixels";
import {
  InspectionPoint,
  getNearestPoint,
  INTERACT_RADIUS,
} from "./InspectionPoint";
import { PALETTE } from "./palette";
import { EdgeLensPass } from "./EdgeLensPass";
import { FloatingParticlesBlack } from "../ui/FloatingParticlesBlack";
import { createBrowserProfile, type BrowserProfile } from "../util/browserProfile";

export class GardenScene {
  readonly scene = new THREE.Scene();
  /** Thumbnails only — drawn after EdgeLens so edge blur never underexposes them. */
  private readonly cardScene = new THREE.Scene();
  /** Separate scene so WebGL post-process never touches CSS3D objects. */
  readonly cssScene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly cssRenderer: CSS3DRenderer;
  readonly navigation: NavigationController;

  private readonly inspectionPoints: InspectionPoint[] = [];
  private readonly clock = new THREE.Clock();
  private readonly edgeLens: EdgeLensPass;
  private readonly floatingParticles: FloatingParticlesBlack;
  private readonly drawingBufferSize = new THREE.Vector2();
  private readonly profile: BrowserProfile;
  private gardenMaterials: THREE.ShaderMaterial[] = [];
  private colliders: THREE.Object3D[] = [];
  private activePoint: InspectionPoint | null = null;
  private running = false;
  private ready = false;
  /** Skip WebGL draws while the portfolio overlay covers the garden. */
  private renderSuspended = false;
  private navAccumulator = 0;
  private preferBlur = true;
  private frameIndex = 0;
  private foliageReady: Promise<void> = Promise.resolve();
  private static readonly NAV_STEP = 1 / 60;
  private static readonly NAV_MAX_STEPS = 3;

  private constructor(canvas: HTMLCanvasElement, cssHost: HTMLElement) {
    this.profile = createBrowserProfile();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: this.profile.powerPreference,
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.profile.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (this.profile.toneMapping) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.35;
    } else {
      // No ACES — cheaper on Firefox; exposure via output still reads fine.
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.toneMappingExposure = 1;
    }

    this.cssRenderer = new CSS3DRenderer();
    this.cssRenderer.setSize(window.innerWidth, window.innerHeight);
    this.cssRenderer.domElement.classList.add("css3d-layer");
    cssHost.appendChild(this.cssRenderer.domElement);

    this.edgeLens = new EdgeLensPass(
      Math.floor(window.innerWidth * this.renderer.getPixelRatio()),
      Math.floor(window.innerHeight * this.renderer.getPixelRatio()),
    );
    this.edgeLens.configure({
      blurScale: this.profile.edgeBlurScale,
      blurLevels: this.profile.blurLevels,
    });
    this.edgeLens.resize(
      Math.floor(window.innerWidth * this.renderer.getPixelRatio()),
      Math.floor(window.innerHeight * this.renderer.getPixelRatio()),
      this.renderer.getPixelRatio(),
    );
    this.applyMobileFocusBand();

    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = null;
    this.floatingParticles = new FloatingParticlesBlack(this.scene, {
      particleCount: this.profile.particleCount,
    });

    this.addLights();

    const tempBounds = new THREE.Box3(
      new THREE.Vector3(-20, 0, -20),
      new THREE.Vector3(20, 10, 20),
    );
    this.navigation = new NavigationController(
      window.innerWidth / window.innerHeight,
      tempBounds,
    );
    this.scene.add(this.navigation.player);
  }

  private addLights(): void {
    if (this.profile.foliageLights === "simple") {
      const ambient = new THREE.AmbientLight(0xb8d4a8, 0.7);
      const key = new THREE.DirectionalLight(0xe8f0d8, 1.05);
      key.position.set(-10, 22, 14);
      this.scene.add(ambient, key);
      return;
    }
    const ambient = new THREE.AmbientLight(PALETTE[6], 0.55);
    const hemi = new THREE.HemisphereLight(PALETTE[1], PALETTE[4], 0.45);
    const key = new THREE.DirectionalLight(PALETTE[5], 0.5);
    key.position.set(12, 28, 8);
    const foliageFill = new THREE.HemisphereLight(0xb8d4a8, 0x1a2820, 0.85);
    foliageFill.name = "foliage-fill";
    const foliageKey = new THREE.DirectionalLight(0xe8f0d8, 1.15);
    foliageKey.name = "foliage-key";
    foliageKey.position.set(-10, 22, 14);
    this.scene.add(ambient, hemi, key, foliageFill, foliageKey);
  }

  private async loadWorld(onProgress?: (message: string) => void): Promise<void> {
    try {
      const loaded = await loadGardenGlb("./models/garden.glb", { onProgress });
      this.gardenMaterials = loaded.materials;
      this.colliders = loaded.colliders;
      this.scene.add(loaded.root);
      this.navigation.setBounds(loaded.walkBounds);
      this.navigation.setWalkCircle(loaded.walkCircle);
      this.navigation.setHeightField(loaded.heightField);
      this.navigation.setSpawn(loaded.spawn);
      this.placeInspectionPoints(defaultInspectionPositions(loaded.walkBounds));
      // Foliage continues downloading/instancing after the garden is walkable.
      this.foliageReady = loaded.whenFoliageReady;
    } catch (error) {
      console.warn("Failed to load garden.glb — falling back to placeholder.", error);
      const placeholder = createPlaceholderGarden();
      this.gardenMaterials = placeholder.materials;
      this.colliders = [];
      this.scene.add(placeholder.root);
      this.navigation.setBounds(placeholder.walkBounds);
      this.navigation.setHeightField(null);
      this.placeInspectionPoints(inspectionPoints.map((p) => p.position));
      this.foliageReady = Promise.resolve();
    }

    this.ready = true;
  }

  /** Resolves when deferred foliage has finished (or failed safely). */
  get whenFoliageReady(): Promise<void> {
    return this.foliageReady;
  }

  static async create(
    canvas: HTMLCanvasElement,
    cssHost: HTMLElement,
    onProgress?: (message: string) => void,
  ): Promise<GardenScene> {
    const garden = new GardenScene(canvas, cssHost);
    await garden.loadWorld(onProgress);
    return garden;
  }

  private placeInspectionPoints(positions: Array<[number, number, number]>): void {
    inspectionPoints.forEach((point, index) => {
      const item = getPortfolioById(point.portfolioId);
      if (!item) return;
      const position = positions[index] ?? point.position;
      const marker = new InspectionPoint({ ...point, position }, item);
      this.liftMarkerToGround(marker);
      this.inspectionPoints.push(marker);
      this.cardScene.add(marker.group);
    });
  }

  private liftMarkerToGround(marker: InspectionPoint): void {
    if (this.colliders.length === 0) return;

    const raycaster = new THREE.Raycaster();
    const origin = marker.group.position.clone();
    origin.y = 80;
    raycaster.set(origin, new THREE.Vector3(0, -1, 0));
    raycaster.far = 160;
    const hits = raycaster.intersectObjects(this.colliders, true);
    if (hits.length > 0) {
      marker.group.position.y = hits[0].point.y;
    }
  }

  bindControls(root: HTMLElement, canvas: HTMLCanvasElement, movePad: HTMLElement): void {
    this.navigation.bind(root, canvas);
    this.navigation.bindTouchPad(movePad);
  }

  start(): void {
    this.running = true;
    this.clock.start();
  }

  stop(): void {
    this.running = false;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Pause expensive WebGL while the overlay is open (keeps proximity updates). */
  setRenderSuspended(suspended: boolean): void {
    if (this.renderSuspended === suspended) return;
    this.renderSuspended = suspended;
    if (!suspended) {
      // Drop the backlog so the first resumed frame doesn't spike.
      this.clock.getDelta();
    }
  }

  private applyMobileFocusBand(): void {
    const narrow = typeof window !== "undefined" && window.innerWidth <= 900;
    const touch =
      typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    // Profile may disable blur entirely (Firefox); touch/narrow always off.
    this.preferBlur = this.profile.edgeBlur && !narrow && !touch;
    this.edgeLens.setEnabled(this.preferBlur);
    if (this.preferBlur) this.edgeLens.setFocusBand(0.26, 0.74);
  }

  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.profile.maxPixelRatio));
    this.renderer.setSize(width, height);
    this.cssRenderer.setSize(width, height);
    this.edgeLens.configure({
      blurScale: this.profile.edgeBlurScale,
      blurLevels: this.profile.blurLevels,
    });
    this.edgeLens.resize(
      Math.floor(width * this.renderer.getPixelRatio()),
      Math.floor(height * this.renderer.getPixelRatio()),
      this.renderer.getPixelRatio(),
    );
    this.applyMobileFocusBand();
    this.navigation.resize(width / height);
  }

  getActivePoint(): InspectionPoint | null {
    return this.activePoint;
  }

  /** 1-based hotkey index into inspection points (1 = first project). */
  getPointByNumber(n: number): InspectionPoint | null {
    if (!Number.isInteger(n) || n < 1) return null;
    return this.inspectionPoints[n - 1] ?? null;
  }

  /** Ray pick a project card under the cursor (depth-tested WebGL mesh). */
  pickInspectionPoint(clientX: number, clientY: number): InspectionPoint | null {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.navigation.camera);
    const meshes = this.inspectionPoints.filter((p) => p.mesh.visible).map((p) => p.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    const hit = hits[0]?.object;
    if (!hit) return null;
    return (hit.userData.inspectionPoint as InspectionPoint | undefined) ?? null;
  }

  /** Hide the thumbnail for the open project; pass null to show all again. */
  setOverlayProjectId(pointId: string | null): void {
    for (const point of this.inspectionPoints) {
      point.setThumbnailVisible(pointId === null || point.data.id !== pointId);
    }
  }

  /** True when the given project marker is within walk/inspect radius. */
  isPointWithinInteractRadius(pointId: string, radiusMultiplier = 1): boolean {
    const point = this.inspectionPoints.find((p) => p.data.id === pointId);
    if (!point) return false;
    const dist = point.distanceTo(this.navigation.player.position);
    return dist <= INTERACT_RADIUS * radiusMultiplier;
  }

  update(): void {
    if (!this.running || !this.ready) return;

    const frameDelta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();
    this.frameIndex += 1;

    // Fixed-step locomotion so motion stays smooth when render frames hitch.
    this.navAccumulator += frameDelta;
    let steps = 0;
    while (this.navAccumulator >= GardenScene.NAV_STEP && steps < GardenScene.NAV_MAX_STEPS) {
      this.navigation.update(GardenScene.NAV_STEP);
      this.navAccumulator -= GardenScene.NAV_STEP;
      steps += 1;
    }
    if (this.navAccumulator > GardenScene.NAV_STEP) this.navAccumulator = 0;

    const playerPosition = this.navigation.player.position;
    const camera = this.navigation.camera;
    this.activePoint = getNearestPoint(this.inspectionPoints, playerPosition);

    if (this.renderSuspended) {
      // Overlay covers the garden — skip GPU work; keep walk/proximity alive.
      return;
    }

    const moving = this.navigation.motionActivity > 0.28;
    // Firefox/Safari: drop post while panning — biggest pan-latency win.
    this.edgeLens.setLean(Boolean(this.preferBlur && moving && !this.profile.blurWhileMoving));

    const runFx = this.frameIndex % this.profile.fxFrameStride === 0;
    if (runFx) {
      this.floatingParticles.update(frameDelta * this.profile.fxFrameStride);
      if (this.gardenMaterials.length > 0) {
        updateMovingPixelsMaterials(this.gardenMaterials, elapsed);
      }
    }

    this.inspectionPoints.forEach((point) => {
      point.update(elapsed, playerPosition, camera);
    });

    // Foliage: lit (+ edge blur when settled). Thumbnails: unlit, depth-nested.
    this.renderer.autoClear = true;
    this.edgeLens.render(this.renderer, this.scene, camera);

    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    const gardenDepth = this.preferBlur ? this.edgeLens.sharpDepth : null;
    for (const point of this.inspectionPoints) {
      point.setGardenDepth(gardenDepth, this.drawingBufferSize);
    }

    this.renderer.autoClear = false;
    this.renderer.render(this.cardScene, camera);
    this.renderer.autoClear = true;

    if (this.cssScene.children.length > 0) {
      this.cssRenderer.render(this.cssScene, camera);
    }
  }
}
