/**
 * GROUP TRANSFORM — what happens to the contents when the container moves.
 * ------------------------------------------------------------------
 * A group has a real transform: a position, a turn and a scale. Editing any of
 * them has to carry everything inside it, and "carry" means the arithmetic every
 * 3D application does when you move a folder — the contents keep their
 * arrangement relative to the group and to each other, and only their
 * relationship to the WORLD changes.
 *
 * WHY THIS IS A FUNCTION OF TWO GROUP STATES rather than of a delta. The panel
 * hands over absolute values — a typed position, a rotation slider, a gizmo drag
 * reporting where the proxy now stands — so the delta has to be recovered by
 * comparing the group before the edit with the group after it. Recovering it
 * here, once, is what stops three call sites each inventing their own idea of
 * what "the group turned 30°" means.
 *
 * WHY THE CHILDREN'S POSITIONS STAY IN WORLD SPACE. Nothing else in this editor
 * has a parent transform: the gizmo, the containment clamp, the arrangement
 * solver and the capture rig all read `object.position` as where the thing
 * actually is. Introducing a group whose children were stored relative to it
 * would mean teaching every one of them to walk up a parent chain first. So a
 * group edit RESOLVES to a flat write on each descendant, and the invariant the
 * rest of the app relies on is never broken.
 *
 * It is arithmetic, so no React and no scene state — just three.js math types.
 */

import { Euler, Quaternion, Vector3 } from "three";
import type { MaterialSlot, SceneObject } from "./scene-types";

type Vec3 = [number, number, number];

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** The transform fields a group edit can touch. Anything else about a group —
 *  its name, its role, its lock — has no bearing on where its contents are. */
export interface GroupPose {
  position: Vec3;
  rotationDeg: Vec3;
  scale: Vec3;
}

const quatOf = (rotationDeg: Vec3) =>
  new Quaternion().setFromEuler(
    new Euler(rotationDeg[0] * D2R, rotationDeg[1] * D2R, rotationDeg[2] * D2R)
  );

/**
 * Did this edit actually move anything?
 *
 * Called before the work is done, because the common case is an edit that isn't
 * a transform at all — a rename, a role, a colour — and walking the subtree to
 * write back identical positions would put a no-op on the undo stack and
 * re-render every mesh in the group.
 */
export function posesDiffer(a: GroupPose, b: GroupPose): boolean {
  const same = (x: Vec3, y: Vec3) => x[0] === y[0] && x[1] === y[1] && x[2] === y[2];
  return !same(a.position, b.position) || !same(a.rotationDeg, b.rotationDeg) || !same(a.scale, b.scale);
}

/**
 * Re-place one descendant for a group that has moved from `prev` to `next`.
 *
 * The order is the one that makes a group behave like a folder and not like a
 * pantograph: take the child's offset from the OLD group centre, scale it by how
 * much the group's scale changed, turn it by how much the group turned, and hang
 * it off the NEW centre. The child's own turn picks up the same rotation so a
 * chair facing the window still faces the window after the room is turned, and
 * its own scale picks up the same ratio so a group scaled to double is a group
 * whose contents are twice the size — not a group whose contents have merely
 * drifted apart.
 *
 * A SCALE OF ZERO IS TREATED AS ONE. The Size control can pass through 0 on its
 * way somewhere, and dividing by it would send every child to infinity and
 * never bring them back — the group would survive the drag and its contents
 * would not.
 */
export function reparentPose(child: SceneObject, prev: GroupPose, next: GroupPose): Partial<SceneObject> {
  const ratio = new Vector3(
    next.scale[0] / (prev.scale[0] || 1),
    next.scale[1] / (prev.scale[1] || 1),
    next.scale[2] / (prev.scale[2] || 1)
  );
  // The turn the group underwent, not the turn it now holds: a group already
  // standing at 30° that is dragged to 40° turns its contents by 10°.
  const spin = quatOf(next.rotationDeg).multiply(quatOf(prev.rotationDeg).invert());

  const offset = new Vector3(
    child.position[0] - prev.position[0],
    child.position[1] - prev.position[1],
    child.position[2] - prev.position[2]
  )
    .multiply(ratio)
    .applyQuaternion(spin);

  const turned = spin.clone().multiply(quatOf(child.rotationDeg));
  const euler = new Euler().setFromQuaternion(turned);

  return {
    position: [
      next.position[0] + offset.x,
      next.position[1] + offset.y,
      next.position[2] + offset.z,
    ],
    rotationDeg: [euler.x * R2D, euler.y * R2D, euler.z * R2D],
    scale: [
      child.scale[0] * ratio.x,
      child.scale[1] * ratio.y,
      child.scale[2] * ratio.z,
    ],
  };
}

/**
 * Where a new group stands: the centre of the bounding box of what it holds.
 *
 * THE BOX, NOT THE AVERAGE. A mean position is pulled toward whichever corner
 * has the most objects in it, so grouping one table and eight chairs put the
 * group's origin — and therefore its gizmo — inside the chairs rather than in
 * the middle of the set. The box centre is where the selection LOOKS like its
 * middle, which is where a handle is expected to be.
 */
export function centreOf(objects: SceneObject[]): Vec3 {
  if (objects.length === 0) return [0, 0, 0];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const o of objects) {
    for (const axis of [0, 1, 2] as const) {
      min[axis] = Math.min(min[axis], o.position[axis]);
      max[axis] = Math.max(max[axis], o.position[axis]);
    }
  }
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}

/** How wide the set is, for framing it — the fly-in needs a radius. */
export function radiusOf(objects: SceneObject[], centre: Vec3): number {
  let r = 0;
  for (const o of objects) {
    const d = Math.hypot(
      o.position[0] - centre[0],
      o.position[1] - centre[1],
      o.position[2] - centre[2]
    );
    r = Math.max(r, d + 0.7 * Math.max(...o.scale));
  }
  return r;
}

/** The material fields a group paints onto its contents. Kept as a list rather
 *  than "every key in the patch" so a rename or a lock can never be mistaken
 *  for something the children should inherit. */
export const MATERIAL_KEYS = ["color", "metalness", "roughness", "specular", "normal"] as const;

export type MaterialKey = (typeof MATERIAL_KEYS)[number];

/**
 * PAINT A PATCH ONTO EVERY SLOT OF AN OBJECT.
 *
 * What a group edit means, now that objects have several materials. The group
 * itself has one nominal slot and its contents have as many as their files gave
 * them, so "paint the group teal" cannot mean "write slot 0" — a three-slot
 * excavator inside the group would come out teal on its body and untouched
 * everywhere else, which reads as the edit half-failing.
 *
 * So it is all slots, on every descendant. A group is a bulk instrument; the way
 * to paint one element of one object is to select that object.
 */
export function paintAllSlots(o: SceneObject, patch: Partial<MaterialSlot>): SceneObject {
  return { ...o, materials: o.materials.map((m) => ({ ...m, ...patch })) };
}
