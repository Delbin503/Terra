import { Box3, Raycaster, Vector3, type Object3D } from "three";

/**
 * SNAP TO OBJECT — rest a moved object on whatever is underneath it.
 *
 * Rays are cast straight down from five points across the object's footprint
 * (its centre and four inset corners). The highest hit wins — the object comes
 * to rest on the tallest surface it overlaps, the way a physics drop would.
 *
 * ONLY ONTO OBJECTS. With no object under it the snap does nothing — the
 * object stays where it was put rather than dropping to the floor — and the
 * panel's switch is disabled while nothing is near (see `hasSnapTarget`).
 *
 * THE RAYS START A CLIMB ABOVE THE OBJECT, not at its top. With snap on, every
 * drag ends in a drop, so an object that could only fall would never get from
 * the floor onto a table: lifting it just drops it again. Starting one climb
 * up (the object's own height, at least a metre) lets a chair dragged against
 * a table step up onto it, and pops an object pushed into a table back out on
 * top — while a shelf board or a roof well overhead is still passed under.
 */

const DOWN = new Vector3(0, -1, 0);
/** How far past the footprint, in metres, an object still counts as near. */
const NEAR = 0.5;
/** Footprint sample points, as a fraction of the half-size from the centre. */
const INSET = 0.7;
/** Movements smaller than this are noise, not a snap. */
const EPS = 1e-4;
/** The least an object can step up onto, in metres. */
const MIN_CLIMB = 1;

const box = new Box3();
const other = new Box3();
const ray = new Raycaster();
const origin = new Vector3();
const world = new Vector3();

/** True when `a` is `b`, or one of them contains the other in the scene graph. */
function related(a: Object3D, b: Object3D): boolean {
  for (let p: Object3D | null = a; p; p = p.parent) if (p === b) return true;
  for (let p: Object3D | null = b; p; p = p.parent) if (p === a) return true;
  return false;
}

/** Whether a node is drawn — a hidden ancestor hides everything under it. */
function shown(node: Object3D): boolean {
  for (let p: Object3D | null = node; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** The candidates whose bounds come within `margin` of the node's footprint
 *  and start below the climb line. Leaves the node's own bounds in `box`. */
function overlapping(node: Object3D, candidates: Object3D[], margin: number): Object3D[] {
  node.updateWorldMatrix(true, true);
  box.setFromObject(node);
  if (box.isEmpty()) return [];
  const from = climbFrom();
  return candidates.filter((c) => {
    if (related(c, node) || !shown(c)) return false;
    c.updateWorldMatrix(true, true);
    other.setFromObject(c);
    return (
      !other.isEmpty() &&
      other.max.x > box.min.x - margin &&
      other.min.x < box.max.x + margin &&
      other.max.z > box.min.z - margin &&
      other.min.z < box.max.z + margin &&
      other.min.y < from
    );
  });
}

/** Where the rays start: one climb above the object's top (reads `box`). */
const climbFrom = () => box.max.y + Math.max(MIN_CLIMB, box.max.y - box.min.y);

/**
 * Whether there is anything near enough to snap to — an object under the
 * footprint or within half a metre of it. Drives the panel switch: with
 * nothing near, the switch is disabled rather than offering a snap that
 * would do nothing.
 */
export function hasSnapTarget(node: Object3D, candidates: Object3D[]): boolean {
  return overlapping(node, candidates, NEAR).length > 0;
}

/**
 * The world height the object's underside should rest at: the highest surface
 * of `candidates` under its footprint, or null when no object is under it.
 */
export function restHeight(node: Object3D, candidates: Object3D[]): number | null {
  // Only what actually overlaps the footprint is worth a ray.
  const under = overlapping(node, candidates, 0);
  if (box.isEmpty() || under.length === 0) return null;
  const from = climbFrom();

  let best = -Infinity;

  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const hx = ((box.max.x - box.min.x) / 2) * INSET;
  const hz = ((box.max.z - box.min.z) / 2) * INSET;
  const samples: [number, number][] = [
    [cx, cz],
    [cx - hx, cz - hz],
    [cx + hx, cz - hz],
    [cx - hx, cz + hz],
    [cx + hx, cz + hz],
  ];

  for (const [x, z] of samples) {
    ray.set(origin.set(x, from, z), DOWN);
    // Meshes only: an outline drawn as a Line would otherwise catch the ray
    // across its whole pick threshold and hold the object up on nothing.
    const hit = ray
      .intersectObjects(under, true)
      .find((h) => (h.object as { isMesh?: boolean }).isMesh && shown(h.object));
    if (hit && hit.point.y > best) best = hit.point.y;
  }
  return best === -Infinity ? null : best;
}

/**
 * Move the node so its underside rests on the surface below. Returns true when
 * it moved. Works in the node's own parent space, so an object inside a group
 * snaps correctly too.
 */
export function snapDown(node: Object3D, candidates: Object3D[]): boolean {
  const rest = restHeight(node, candidates);
  if (rest === null) return false;
  const dy = rest - box.min.y;
  if (Math.abs(dy) < EPS) return false;

  node.getWorldPosition(world);
  world.y += dy;
  if (node.parent) node.parent.worldToLocal(world);
  node.position.copy(world);
  node.updateMatrixWorld(true);
  return true;
}
