/**
 * SCENE VOLUME — the box you arrange inside.
 * ------------------------------------------------------------------
 * A volume is a named region of the world: a footprint, a height, and a rule
 * that objects may not leave it. It is what "define a living room, then only
 * spawn things inside it" is made of.
 *
 * WHY IT IS SCENE STATE, NOT WORK ORDER STATE. Exactly the reasoning already
 * written down for object roles in `work-order.ts`: the volume is something you
 * build in the viewport and look at, every axis reads it back, and a second copy
 * living in the order would drift the moment a face was dragged. The Arrangement
 * axis therefore stores a volume *id*, never a set of dimensions of its own.
 *
 * WHY ROTATION IS Y-ONLY. A room turns on the spot; it does not tip over. That
 * one restriction is what keeps the whole thing tractable: the floor stays
 * horizontal, so heights, the drop raycast and the ceiling are untouched, and
 * every containment test reduces to a 2D rotation in the XZ plane. Pitch and
 * roll would buy nothing and cost a real OBB in five places.
 *
 * Nothing in this file imports React or three.js. It is arithmetic, so it stays
 * testable and so the same numbers drive the viewport, the panel and the solver.
 */

import type { SceneObject } from "./scene-types";

export type Vec3 = [number, number, number];

/** The four side faces, named as you'd point at them looking down +Z. */
export type WallId = "north" | "south" | "east" | "west";

export const WALL_IDS: WallId[] = ["north", "south", "east", "west"];

/**
 * Which way each wall faces, as a footprint axis and a sign.
 *
 * `north` is −Z and `south` is +Z, which is the convention the orientation cube
 * already uses — so "against the north wall" in the panel and the arrow on the
 * cube point the same way.
 */
export const WALL_AXIS: Record<WallId, { axis: 0 | 2; sign: -1 | 1 }> = {
  north: { axis: 2, sign: -1 },
  south: { axis: 2, sign: 1 },
  west: { axis: 0, sign: -1 },
  east: { axis: 0, sign: 1 },
};

/**
 * Which axes the margin holds an object back from.
 *
 * THE FLOOR IS NOT ONE OF THEM. A margin is breathing room against the WALLS —
 * "don't let the sofa touch the plaster". Applied to Y as well it becomes a
 * levitation field: every object in the room floats `margin` metres off the
 * ground, and the first thing anyone sees after drawing a space is their own
 * furniture hanging in the air. Height is bounded by the floor and the ceiling
 * and by nothing else.
 */
const MARGIN_AXES: readonly (0 | 1 | 2)[] = [0, 2];

export interface SceneVolume {
  id: string;
  name: string;
  /** Centre of the FLOOR, in metres. `y` is the height the floor sits at. */
  center: Vec3;
  /** `[length (x), height (y), width (z)]`, metres. Always positive. */
  size: Vec3;
  /**
   * Degrees the room is turned about its own centre — the only axis a room has.
   *
   * Degrees rather than radians to match `SceneObject.rotationDeg`: the panel
   * shows this number and nobody types radians into a form.
   */
  rotationY: number;
  /**
   * Draw the four side faces as translucent walls.
   *
   * ONE FLAG, NOT FIVE. It was a switch per face plus a ceiling, which took a
   * third of the panel to control something that changes NOTHING but the
   * picture: the solver's `wall` anchor presses against the volume's BOUNDS, so
   * an object leans on the north face whether or not a quad is drawn there, and
   * containment never read these at all. Five controls that only decide how the
   * box looks is four too many — and the ceiling in particular was a lid that
   * hid the room from every orbit above it.
   */
  showWalls: boolean;
  /**
   * Objects may not leave. Turning it off leaves the box as a measured guide —
   * it still feeds the Arrangement axis, it just stops holding anything.
   */
  contain: boolean;
  /** Metres held back from every face, so nothing sits flush by accident. */
  margin: number;
}

/** Height a drawn volume opens at — a domestic ceiling, and the same number the
 *  reference tool defaults to. Tall enough to stand a door in. */
export const DEFAULT_VOLUME_HEIGHT = 2.7;

/** Below this a drag is a mis-click, not a room. */
export const MIN_VOLUME_SIDE = 0.5;

let volumeCounter = 0;

export function makeVolume(center: Vec3, size: Vec3, name?: string): SceneVolume {
  volumeCounter += 1;
  return {
    id: `vol-${volumeCounter}`,
    name: name ?? `Space ${volumeCounter}`,
    center,
    rotationY: 0,
    size: [
      Math.max(MIN_VOLUME_SIDE, size[0]),
      Math.max(MIN_VOLUME_SIDE, size[1]),
      Math.max(MIN_VOLUME_SIDE, size[2]),
    ],
    // Open by default. A room that arrives boxed in on four sides hides the
    // objects you are about to put in it, and the first thing anyone would do
    // is switch them off again.
    showWalls: false,
    contain: true,
    margin: 0.1,
  };
}

/* ----------------------------------------------------------------- bounds */

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/**
 * The box in ITS OWN FRAME: XZ centred on the origin, Y in world metres.
 *
 * WHY LOCAL AND NOT WORLD. Once a room can be turned, its world-space AABB is a
 * bigger box than the room — clamping against it would let a chair sit in the
 * corner outside the wall. Every containment test therefore happens here, in a
 * frame where the room is axis-aligned by definition, and the caller moves the
 * point in and out with `toLocal` / `toWorld`.
 *
 * Y needs no such treatment: rotation is about Y, so a height is a height.
 */
export function localBounds(v: SceneVolume): Bounds {
  const [, cy] = v.center;
  const [l, h, w] = v.size;
  return {
    min: [-l / 2, cy, -w / 2],
    max: [l / 2, cy + h, w / 2],
  };
}

/**
 * World point → the volume's own frame.
 *
 * three.js' Y rotation is `x' = x·cosθ + z·sinθ`, `z' = −x·sinθ + z·cosθ`, so
 * the inverse used here turns by −θ. Getting this sign wrong is invisible at
 * 0° and mirrors the room at every other angle, which is exactly the kind of
 * bug that survives a demo.
 */
export function toLocal(v: SceneVolume, p: Vec3): Vec3 {
  const r = (v.rotationY * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p[0] - v.center[0];
  const dz = p[2] - v.center[2];
  return [c * dx - s * dz, p[1], s * dx + c * dz];
}

/** The volume's own frame → world. */
export function toWorld(v: SceneVolume, p: Vec3): Vec3 {
  const r = (v.rotationY * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [v.center[0] + c * p[0] + s * p[2], p[1], v.center[2] - s * p[0] + c * p[2]];
}

/**
 * An object's half-extent measured along the ROOM's axes.
 *
 * An object's own box is axis-aligned to the world. Seen from a room turned 30°
 * it is wider than it is in world terms — the standard AABB-inside-OBB bound —
 * so containment has to inset by this rather than by the raw half-extent, or a
 * corner of the object pokes through a wall the maths thinks it cleared.
 */
export function alignedHalf(half: Vec3, rotationY: number): Vec3 {
  const r = (rotationY * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return [half[0] * c + half[2] * s, half[1], half[0] * s + half[2] * c];
}

/**
 * Half the space an object takes up, per axis.
 *
 * AN ESTIMATE, AND DELIBERATELY SO. The real answer is `Box3.setFromObject` on
 * the rendered mesh, which only exists inside the Canvas — and the clamp has to
 * run in `useScene`, which is upstream of it. Every placeholder shape this app
 * renders is built at roughly unit size, so half-extent tracks `scale`; a real
 * GLB may differ, and the margin absorbs the difference.
 *
 * It is a separate function, taking the object rather than reading it inline,
 * precisely so that measuring for real later is a change to one body and not to
 * every call site.
 */
export function halfExtent(o: Pick<SceneObject, "scale">): Vec3 {
  return [
    Math.max(0.05, Math.abs(o.scale[0]) * 0.5),
    Math.max(0.05, Math.abs(o.scale[1]) * 0.5),
    Math.max(0.05, Math.abs(o.scale[2]) * 0.5),
  ];
}

/**
 * Move a position so the object's whole BOX sits inside the volume.
 *
 * Clamping the origin is the bug this exists to avoid: a 1.8 m sideboard whose
 * origin lands exactly on the wall still puts 0.9 m of itself through it. So the
 * legal range for the centre is inset by the object's own half-extent — plus the
 * margin on the two horizontal axes only; see `MARGIN_AXES`.
 *
 * An object WIDER than the volume has an empty legal range — `min > max` — and
 * clamping into an empty range would snap it to a face at random. It centres
 * instead, which is the only honest answer, and the panel says so in words.
 */
export function clampIntoVolume(v: SceneVolume, position: Vec3, half: Vec3): Vec3 {
  const { min, max } = localBounds(v);
  // Clamp in the room's own frame, then put the answer back in world terms.
  const local = toLocal(v, position);
  const aligned = alignedHalf(half, v.rotationY);

  for (let i = 0; i < 3; i++) {
    const pad = aligned[i] + (MARGIN_AXES.includes(i as 0 | 1 | 2) ? v.margin : 0);
    const lo = min[i] + pad;
    const hi = max[i] - pad;
    local[i] = lo > hi ? (min[i] + max[i]) / 2 : Math.min(hi, Math.max(lo, local[i]));
  }
  return toWorld(v, local);
}

/** Would this object need moving to fit? Used to list what fell outside when a
 *  face was dragged inward — never to move it. */
export function isInside(v: SceneVolume, o: Pick<SceneObject, "position" | "scale">): boolean {
  const clamped = clampIntoVolume(v, o.position, halfExtent(o));
  return (
    Math.abs(clamped[0] - o.position[0]) < 1e-4 &&
    Math.abs(clamped[1] - o.position[1]) < 1e-4 &&
    Math.abs(clamped[2] - o.position[2]) < 1e-4
  );
}

/** True when the object is too big for the volume on any axis — the case the
 *  clamp answers by centring. */
export function isOversized(v: SceneVolume, o: Pick<SceneObject, "scale">): boolean {
  const half = alignedHalf(halfExtent(o), v.rotationY);
  return v.size.some(
    (s, i) => s - (MARGIN_AXES.includes(i as 0 | 1 | 2) ? 2 * v.margin : 0) < 2 * half[i]
  );
}

/** The floor plane's height — what a drop raycasts against when a volume is
 *  armed, instead of the infinite ground at y = 0. */
export const floorY = (v: SceneVolume) => v.center[1];

/**
 * Does this XZ point fall on the volume's footprint?
 *
 * Used by the drop handler to tell "you dropped inside, place it there" from
 * "you dropped in the garden, snap it to the nearest legal spot" — two different
 * outcomes that both end with a legal position, so the caller needs to know
 * which happened in order to say so.
 */
export function isOverFootprint(v: SceneVolume, x: number, z: number): boolean {
  const { min, max } = localBounds(v);
  const local = toLocal(v, [x, 0, z]);
  return local[0] >= min[0] && local[0] <= max[0] && local[2] >= min[2] && local[2] <= max[2];
}

/**
 * Which faces this object is currently pressed flat against.
 *
 * The feedback that stops the clamp reading as a bug. Drag a chair into the
 * north wall and the gizmo simply stops moving on Z — with nothing on screen to
 * say why, that is indistinguishable from the viewport having frozen. A face
 * that lights the moment you reach it turns a dead end into a boundary.
 *
 * Compared against the SAME expression the clamp uses, not against the raw
 * bounds, so a face lights exactly when the clamp is what put the object there.
 */
export function contactWalls(
  v: SceneVolume,
  o: Pick<SceneObject, "position" | "scale">
): WallId[] {
  const half = alignedHalf(halfExtent(o), v.rotationY);
  const { min, max } = localBounds(v);
  // A wall is a wall in the ROOM's frame, so the comparison happens there.
  const local = toLocal(v, o.position);
  return WALL_IDS.filter((id) => {
    const { axis, sign } = WALL_AXIS[id];
    const pad = half[axis] + v.margin;
    const at = sign < 0 ? min[axis] + pad : max[axis] - pad;
    return Math.abs(local[axis] - at) < 1e-3;
  });
}

/**
 * The same box, grown about its own footprint centre.
 *
 * What "scatter with containment off" means. The room stops being a fence and
 * becomes a HINT: things still cluster around it, but they are free to end up
 * in the garden — which is exactly what switching the fence off asked for. The
 * floor is kept where it was, so nothing ends up buried or hovering.
 */
export function expandVolume(v: SceneVolume, factor: number): SceneVolume {
  return {
    ...v,
    size: [v.size[0] * factor, v.size[1], v.size[2] * factor],
  };
}

/** How far past the room an unconstrained scatter reaches. Wide enough to read
 *  as "outside", tight enough that objects stay findable. */
export const LOOSE_SPREAD = 2.4;

/** `8.0 × 2.7 × 8.0 m` — the one place the dimension triple is formatted, so
 *  the panel row, the axis summary and the dispatch review all read alike. */
export function describeVolume(v: SceneVolume): string {
  const n = (x: number) => x.toFixed(1);
  return `${n(v.size[0])} × ${n(v.size[1])} × ${n(v.size[2])} m`;
}

/** Floor area, for the panel's one-line summary. */
export const volumeArea = (v: SceneVolume) => v.size[0] * v.size[2];
