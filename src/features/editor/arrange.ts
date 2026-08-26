/**
 * ARRANGE — the placement solver.
 * ------------------------------------------------------------------
 * Given a volume, a set of objects and a seed, produce one arrangement: a
 * position and a rotation per object, none of them overlapping, none of them
 * outside the box.
 *
 * WHY IT IS A PURE FUNCTION. Three callers need the same answer and must not be
 * able to disagree about it: the Space panel's Scatter button, the Arrangement
 * axis's preview, and — the day it exists — the scene agent turning a prompt
 * into a room. A solver that lived inside a component would have been reached
 * for by one of them and re-implemented by the other two.
 *
 * WHY IT TAKES A SEED. An arrangement you cannot reproduce is not a dataset. The
 * whole point of rendering four layouts is that a job can be re-run months later
 * and rebuild the same rooms, so every placement here descends from
 * `(rules, seed, index)` and nothing else — no `Math.random`, no `Date.now`, no
 * iteration order that depends on a Map.
 *
 * WHY REJECTION SAMPLING. Propose a spot, test it against everything already
 * down, keep it or try again. It is what indoor-scene-synthesis work does for
 * the same reason: the constraints are cheap to CHECK and expensive to SOLVE
 * analytically, and at a roomful of objects the checking is free. When it runs
 * out of attempts it says so rather than stacking two chairs in one place —
 * `unplaced` is a first-class part of the result, not an error.
 */

import type { SceneObject } from "./scene-types";
import {
  WALL_AXIS,
  WALL_IDS,
  alignedHalf,
  clampIntoVolume,
  halfExtent,
  localBounds,
  toLocal,
  toWorld,
  type SceneVolume,
  type Vec3,
  type WallId,
} from "./scene-volume";

/* ------------------------------------------------------------------- rng -- */

/**
 * mulberry32 — a 32-bit seeded PRNG.
 *
 * Nine lines and no dependency. `Math.random` cannot be seeded, and pulling in a
 * PRNG package for this would be a package to audit forever in exchange for
 * these nine lines.
 */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for the reroll button. Six digits — long enough not to collide
 *  in a session, short enough to read out loud and type back in. */
export const newSeed = () => Math.floor(Math.random() * 900000) + 100000;

/**
 * The seed arrangement #n descends from.
 *
 * NOT `seed + n`. Consecutive seeds through mulberry32 produce visibly related
 * first draws, so arrangements 1 and 2 would open with their first object in
 * almost the same spot — which reads as the shuffle not having worked. Mixing
 * in the golden-ratio constant decorrelates them while keeping the whole set
 * reproducible from the one number the user sees.
 */
export const seedFor = (seed: number, index: number) =>
  (Math.imul(seed >>> 0, 0x9e3779b1) + index * 0x85ebca6b) >>> 0;

/* ----------------------------------------------------------------- rules -- */

/** Where an object is allowed to land. */
export type AnchorKind = "floor" | "wall" | "ceiling" | "on";

export const ANCHOR_LABEL: Record<AnchorKind, string> = {
  floor: "On the floor",
  wall: "Against a wall",
  ceiling: "On the ceiling",
  on: "On another object",
};

/** How an object is turned once it has a spot. */
export type YawMode = "free" | "quarter" | "facing" | "locked";

export const YAW_LABEL: Record<YawMode, string> = {
  free: "Any angle",
  quarter: "Quarter turns",
  facing: "Face the centre",
  locked: "Keep its angle",
};

/**
 * One object's placement rule.
 *
 * A rule is a SENTENCE THE SOLVER CAN REFUSE, which is the whole design: "stove,
 * against a wall, 0.1 m clear, facing the centre" either has a solution or
 * honestly doesn't. A world coordinate cannot be refused — it can only be wrong,
 * silently, in a way that puts a kitchen counter in the garden.
 */
export interface ArrangeRule {
  targetId: string;
  anchor: AnchorKind;
  /** anchor `wall` — which one, or let the solver pick */
  wall: WallId | "any";
  /** anchor `on` — the object underneath. Null means "any object big enough". */
  supportId: string | null;
  /** metres of empty space required around the footprint */
  clearance: number;
  yaw: YawMode;
}

export function makeRule(targetId: string): ArrangeRule {
  return { targetId, anchor: "floor", wall: "any", supportId: null, clearance: 0.2, yaw: "free" };
}

/* --------------------------------------------------------------- results -- */

export interface Placement {
  id: string;
  position: Vec3;
  rotationDeg: Vec3;
}

export interface ArrangeResult {
  placements: Placement[];
  /** Objects the solver could not fit. Named, so the panel can say which. */
  unplaced: string[];
}

/**
 * What the solver actually needs to know about an object.
 *
 * NARROWER THAN `SceneObject` ON PURPOSE. A caller that has just CREATED some
 * objects cannot hand over the real ones — `scene.add` is a state setter, so the
 * array it appends to has not updated yet in the tick that called it — and would
 * otherwise have to fabricate a whole SceneObject, material and role and all,
 * to satisfy a signature that reads four fields.
 */
export type Arrangeable = Pick<SceneObject, "id" | "position" | "rotationDeg" | "scale">;

/** An object's box, as the overlap test sees it. */
interface Occupant {
  id: string;
  position: Vec3;
  half: Vec3;
}

/** How many spots to try per object before giving up on it. Generous, because a
 *  rejected sample costs a handful of comparisons and a failed placement costs
 *  the user a wrong-looking room. */
const ATTEMPTS = 220;

/* ---------------------------------------------------------------- solving -- */

/**
 * Do two boxes overlap, once the incoming one is padded by its clearance?
 *
 * Clearance inflates the CANDIDATE only. Inflating both would double-count the
 * gap between two objects that each ask for 0.2 m, and the pair would end up
 * 0.4 m apart while the panel said 0.2.
 */
function overlaps(a: Occupant, aPad: number, b: Occupant): boolean {
  for (let i = 0; i < 3; i++) {
    const gap = Math.abs(a.position[i] - b.position[i]);
    if (gap >= a.half[i] + aPad + b.half[i]) return false;
  }
  return true;
}

/** Yaw in degrees for a rule, given where the object ended up. */
function yawFor(mode: YawMode, r: () => number, at: Vec3, centre: Vec3, current: number): number {
  switch (mode) {
    case "locked":
      return current;
    case "quarter":
      return Math.floor(r() * 4) * 90;
    case "facing": {
      // Turn the object's front (−Z, three.js' convention for "forward") toward
      // the middle of the room.
      const dx = centre[0] - at[0];
      const dz = centre[2] - at[2];
      if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return current;
      return (Math.atan2(dx, dz) * 180) / Math.PI;
    }
    default:
      return r() * 360;
  }
}

/**
 * A point somewhere on the volume's floor, already inset for this object.
 *
 * The margin insets X and Z only — the object RESTS on the floor, it does not
 * hover `margin` above it. Same rule `clampIntoVolume` follows, for the same
 * reason.
 */
function sampleFloor(v: SceneVolume, half: Vec3, r: () => number): Vec3 {
  const { min, max } = localBounds(v);
  // Sampled in the room's own frame — see `localBounds` — and handed back in
  // world terms, so a turned room fills along its own walls rather than along
  // the world axes it happens to be sitting near.
  const aligned = alignedHalf(half, v.rotationY);
  const pad = (i: 0 | 2) => aligned[i] + v.margin;
  const span = (i: 0 | 2) => Math.max(0, max[i] - min[i] - 2 * pad(i));
  return toWorld(v, [
    min[0] + pad(0) + r() * span(0),
    min[1] + half[1],
    min[2] + pad(2) + r() * span(2),
  ]);
}

/** A point flush against one wall, at a random position along it. */
function sampleWall(v: SceneVolume, half: Vec3, r: () => number, wall: WallId | "any"): Vec3 {
  const pick: WallId = wall === "any" ? WALL_IDS[Math.floor(r() * WALL_IDS.length)] : wall;
  const { axis, sign } = WALL_AXIS[pick];
  const { min, max } = localBounds(v);
  const aligned = alignedHalf(half, v.rotationY);
  // Back into the local frame to push against the face, then out again — the
  // floor sample already returned world coordinates.
  const local = toLocal(v, sampleFloor(v, half, r));
  local[axis] =
    sign < 0 ? min[axis] + aligned[axis] + v.margin : max[axis] - aligned[axis] - v.margin;
  return toWorld(v, local);
}

/** A point on the underside of the ceiling. */
function sampleCeiling(v: SceneVolume, half: Vec3, r: () => number): Vec3 {
  const { max } = localBounds(v);
  // Height is untouched by a Y rotation, so this one needs no frame change.
  const at = sampleFloor(v, half, r);
  at[1] = max[1] - half[1];
  return at;
}

/**
 * A point on top of a support object.
 *
 * The support's own box is the surface: the candidate sits on its top face,
 * somewhere within its footprint, inset so a pot doesn't hang off the table by
 * half its width. A support too small to hold the object returns null, and the
 * caller falls back to the floor rather than balancing it on a corner.
 */
function sampleOn(support: Occupant, half: Vec3, r: () => number): Vec3 | null {
  const spanX = support.half[0] - half[0];
  const spanZ = support.half[2] - half[2];
  if (spanX < 0 || spanZ < 0) return null;
  return [
    support.position[0] + (r() * 2 - 1) * spanX,
    support.position[1] + support.half[1] + half[1],
    support.position[2] + (r() * 2 - 1) * spanZ,
  ];
}

export interface ArrangeInput {
  volume: SceneVolume;
  /**
   * Where the solver may actually sample and clamp. Defaults to `volume`.
   *
   * TWO BOXES, BECAUSE THEY ANSWER DIFFERENT QUESTIONS. `volume` is the room —
   * it is what `wall` and `ceiling` anchors are measured against, and it does
   * not move. `region` is how far a scatter is allowed to reach, which is the
   * same box until containment is switched off, and a wider one after that.
   * Folding them into one would mean "stove against a wall" quietly starting to
   * mean a wall 12 m out in the garden.
   */
  region?: SceneVolume;
  /** Objects the solver may move, in a stable order. */
  movable: Arrangeable[];
  /** Objects it must place AROUND — the master, anything pinned or locked. */
  fixed: Arrangeable[];
  /** Per-object overrides. Anything movable without one gets `makeRule`. */
  rules: ArrangeRule[];
}

/**
 * Produce one arrangement.
 *
 * Ruled objects go down FIRST, in the order the rules are listed, because a rule
 * is a statement about intent and the unruled remainder is filler — a stove that
 * must be against a wall should not lose its last stretch of wall to a
 * randomly-scattered box. Within each group the scene's own order decides, so
 * the same input always yields the same room.
 */
export function arrange(input: ArrangeInput, seed: number): ArrangeResult {
  const { volume: v, region = input.volume, movable, fixed, rules } = input;
  const r = rng(seed);
  // "Face the centre" means the middle of the FLOOR, which is the volume's own
  // centre in world terms whatever angle it sits at.
  const centre: Vec3 = [v.center[0], v.center[1], v.center[2]];

  // Everything already in the room is an obstacle from the first sample on.
  const down: Occupant[] = fixed.map((o) => ({
    id: o.id,
    position: o.position,
    half: halfExtent(o),
  }));

  const ruleFor = new Map(rules.map((rule) => [rule.targetId, rule]));
  const ordered = [
    ...rules.map((rule) => movable.find((o) => o.id === rule.targetId)).filter(Boolean),
    ...movable.filter((o) => !ruleFor.has(o.id)),
  ] as Arrangeable[];

  const placements: Placement[] = [];
  const unplaced: string[] = [];

  for (const o of ordered) {
    const rule = ruleFor.get(o.id) ?? makeRule(o.id);
    const half = halfExtent(o);
    let landed: Vec3 | null = null;

    for (let attempt = 0; attempt < ATTEMPTS && !landed; attempt++) {
      let at: Vec3 | null;
      switch (rule.anchor) {
        case "wall":
          // Against the ROOM's wall, not the region's — see `ArrangeInput`.
          at = sampleWall(v, half, r, rule.wall);
          break;
        case "ceiling":
          at = sampleCeiling(v, half, r);
          break;
        case "on": {
          // Resolve the support against what is ALREADY DOWN, so "pot on the
          // table" works even when the table itself was placed by this same run
          // a moment earlier.
          const support = rule.supportId
            ? down.find((d) => d.id === rule.supportId)
            : down.find((d) => d.half[0] >= half[0] && d.half[2] >= half[2]);
          at = support ? sampleOn(support, half, r) : null;
          // No support means the rule can't be honoured at all; fall through to
          // the floor rather than burning 220 attempts on an impossible ask.
          if (!support) at = sampleFloor(region, half, r);
          break;
        }
        default:
          at = sampleFloor(region, half, r);
      }
      if (!at) continue;

      // Belt and braces: a support standing near a wall can push its passenger
      // past one, and the room's edge outranks the tabletop.
      at = clampIntoVolume(region, at, half);

      const candidate: Occupant = { id: o.id, position: at, half };
      if (down.some((d) => overlaps(candidate, rule.clearance, d))) continue;
      landed = at;
    }

    if (!landed) {
      unplaced.push(o.id);
      continue;
    }

    down.push({ id: o.id, position: landed, half });
    placements.push({
      id: o.id,
      position: landed,
      rotationDeg: [
        o.rotationDeg[0],
        yawFor(rule.yaw, r, landed, centre, o.rotationDeg[1]),
        o.rotationDeg[2],
      ],
    });
  }

  return { placements, unplaced };
}
