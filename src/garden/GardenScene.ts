import * as THREE from "three";
import { CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { inspectionPoints, getPortfolioById } from "../data/portfolio";
import { NavigationController } from "../controls/NavigationController";
import { createPlaceholderGarden } from "./PlaceholderGarden";
import { defaultInspectionPositions, loadGardenGlb } from "./GlbGarden";
import { updateMovingPixelsMaterials } from "./MovingPixels";
import { InspectionPoint, getNearestPoint, INTERACT_RADIUS } from "./InspectionPoint";
import { PALETTE } from "./palette";
import { EdgeLensPass } from "./EdgeLensPass";
import { FloatingParticlesBlack } from "../ui/FloatingParticlesBlack";

export class GardenScene {
  readonly scene = new THREE.Scene();
  /** Separate scene so WebGL post-process never touches CSS3D objects. */
  readonly cssScene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly cssRenderer: CSS3DRenderer;
  readonly navigation: NavigationController;

  private readonly inspectionPoints: InspectionPoint[] = [];
  private readonly clock = new THREE.Clock();
  private readonly edgeLens: EdgeLensPass;
  private readonly floatingParticles: FloatingParticlesBlack;
  private gardenMaterials: THREE.ShaderMaterial[] = [];
  private colliders: THREE.Object3D[] = [];
  private activePoint: InspectionPoint | null = null;
  private running = false;
  private ready = false;
  private onInspect?: (point: InspectionPoint) => void;

  private constructor(canvas: HTMLCanvasElement, cssHost: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.cssRenderer = new CSS3DRenderer();
    this.cssRenderer.setSize(window.innerWidth, window.innerHeight);
    this.cssRenderer.domElement.classList.add("css3d-layer");
    cssHost.appendChild(this.cssRenderer.domElement);

    this.edgeLens = new EdgeLensPass(
      Math.floor(window.innerWidth * this.renderer.getPixelRatio()),
      Math.floor(window.innerHeight * this.renderer.getPixelRatio()),
    );
    this.edgeLens.resize(
      Math.floor(window.innerWidth * this.renderer.getPixelRatio()),
      Math.floor(window.innerHeight * this.renderer.getPixelRatio()),
      this.renderer.getPixelRatio(),
    );

    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = null;
    this.floatingParticles = new FloatingParticlesBlack(this.scene);

    const ambient = new THREE.AmbientLight(PALETTE[6], 0.55);
    const hemi = new THREE.HemisphereLight(PALETTE[1], PALETTE[4], 0.45);
    const key = new THREE.DirectionalLight(PALETTE[5], 0.5);
    key.position.set(12, 28, 8);
    // Soft cool fill so PBR foliage reads without washing the particle garden.
    const foliageFill = new THREE.HemisphereLight(0xb8d4a8, 0x1a2820, 0.85);
    foliageFill.name = "foliage-fill";
    const foliageKey = new THREE.DirectionalLight(0xe8f0d8, 1.15);
    foliageKey.name = "foliage-key";
    foliageKey.position.set(-10, 22, 14);
    this.scene.add(ambient, hemi, key, foliageFill, foliageKey);

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
    } catch (error) {
      console.warn("Failed to load garden.glb — falling back to placeholder.", error);
      const placeholder = createPlaceholderGarden();
      this.gardenMaterials = placeholder.materials;
      this.colliders = [];
      this.scene.add(placeholder.root);
      this.navigation.setBounds(placeholder.walkBounds);
      this.navigation.setHeightField(null);
      this.placeInspectionPoints(inspectionPoints.map((p) => p.position));
    }

    this.ready = true;
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

  setOnInspect(callback: (point: InspectionPoint) => void): void {
    this.onInspect = callback;
  }

  private placeInspectionPoints(positions: Array<[number, number, number]>): void {
    inspectionPoints.forEach((point, index) => {
      const item = getPortfolioById(point.portfolioId);
      if (!item) return;
      const position = positions[index] ?? point.position;
      const marker = new InspectionPoint(
        { ...point, position },
        item,
        (p) => this.onInspect?.(p),
      );
      this.liftMarkerToGround(marker);
      this.inspectionPoints.push(marker);
      this.cssScene.add(marker.group);
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

  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    this.cssRenderer.setSize(width, height);
    this.edgeLens.resize(
      Math.floor(width * this.renderer.getPixelRatio()),
      Math.floor(height * this.renderer.getPixelRatio()),
      this.renderer.getPixelRatio(),
    );
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

    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    this.navigation.update(delta);
    this.floatingParticles.update(delta);
    if (this.gardenMaterials.length > 0) {
      updateMovingPixelsMaterials(this.gardenMaterials, elapsed);
    }

    const playerPosition = this.navigation.player.position;
    const camera = this.navigation.camera;
    this.activePoint = getNearestPoint(this.inspectionPoints, playerPosition);

    this.inspectionPoints.forEach((point) => {
      point.update(elapsed, playerPosition, camera);
    });

    this.edgeLens.render(this.renderer, this.scene, camera);
    this.cssRenderer.render(this.cssScene, camera);
  }
}
