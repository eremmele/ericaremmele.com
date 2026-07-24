import * as THREE from "three";
import { CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import type { InspectionPointData, PortfolioItem } from "../types";
import { createProjectCard } from "../ui/ProjectCard";

const INTERACT_RADIUS = 3.2;
/** CSS3D uses px as world units — scale cards into garden space. */
const CARD_SCALE = 0.012;
const FLOAT_HEIGHT = 1.35;

export class InspectionPoint {
  readonly data: InspectionPointData;
  readonly item: PortfolioItem;
  readonly group: THREE.Group;
  readonly object: CSS3DObject;
  readonly element: HTMLDivElement;

  private readonly onInspect?: (point: InspectionPoint) => void;

  constructor(
    data: InspectionPointData,
    item: PortfolioItem,
    onInspect?: (point: InspectionPoint) => void,
  ) {
    this.data = data;
    this.item = item;
    this.onInspect = onInspect;
    this.group = new THREE.Group();
    this.group.position.set(...data.position);

    this.element = createProjectCard(
      {
        title: item.title,
        year: item.year ?? "",
        image: item.image,
      },
      {
        onClick: () => this.onInspect?.(this),
      },
    );

    this.object = new CSS3DObject(this.element);
    this.object.scale.setScalar(CARD_SCALE);
    this.object.position.y = FLOAT_HEIGHT;
    this.group.add(this.object);
  }

  update(elapsed: number, playerPosition: THREE.Vector3, camera: THREE.Camera): boolean {
    const distance = this.group.position.distanceTo(playerPosition);
    const active = distance <= INTERACT_RADIUS;

    // Soft float + face the camera (billboard)
    this.object.position.y = FLOAT_HEIGHT + Math.sin(elapsed * 1.2 + this.group.position.x) * 0.06;
    this.object.quaternion.copy(camera.quaternion);

    this.element.classList.toggle("is-active", active);
    this.element.style.opacity = active ? "1" : distance < INTERACT_RADIUS * 2.2 ? "0.88" : "0.72";

    return active;
  }

  distanceTo(point: THREE.Vector3): number {
    return this.group.position.distanceTo(point);
  }
}

export function getNearestPoint(
  points: InspectionPoint[],
  position: THREE.Vector3,
): InspectionPoint | null {
  let nearest: InspectionPoint | null = null;
  let best = Infinity;

  for (const point of points) {
    const distance = point.distanceTo(position);
    if (distance < INTERACT_RADIUS && distance < best) {
      best = distance;
      nearest = point;
    }
  }

  return nearest;
}
