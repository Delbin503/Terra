/**
 * EDGE DOLLY — the arithmetic behind "back off when the drag runs out of room".
 * ------------------------------------------------------------------
 * Dragging a volume's corner outward ends at the edge of the window: the pointer
 * has nowhere further to go, and the only way to keep enlarging the space is to
 * let go, orbit out by hand, find the corner again and carry on. For a room
 * bigger than the viewport can frame, that IS the interaction, repeated.
 *
 * So a pointer held inside the outer band of the viewport pulls the camera away
 * from the orbit target, faster the closer to the edge it gets, and the drag
 * keeps resolving against the moved camera. The corner never stops; the world
 * shrinks underneath it.
 *
 * WHY THESE TWO FUNCTIONS LIVE ALONE IN A FILE. They are the whole behaviour —
 * everything around them in `VolumeBox` is plumbing that only runs inside a
 * WebGL canvas. Pulled out here they are ordinary arithmetic: testable without
 * a renderer, and tunable without reading a frame loop.
 */

/**
 * How far in from the edge the sensitive band reaches, in NDC.
 *
 * NDC runs −1…1, so 0.22 is roughly the outer 11% of each side. Wide enough to
 * enter by accident at speed — which is the point, since you get there by
 * dragging fast — and narrow enough that ordinary work in the middle of the
 * viewport never triggers it.
 */
export const EDGE_BAND = 0.22;

/**
 * Distance growth per second at the very edge.
 *
 * Tuned so a corner dragged into the corner of the window a little more than
 * doubles the framing every second: brisk enough to be worth having, slow enough
 * that the gesture still feels driven rather than fired off.
 */
export const DOLLY_PER_SEC = 1.15;

/** A "frame" longer than this was a stall. Clamped for the same reason
 *  `KeyboardFly` clamps its own delta: a backgrounded tab must not resume with
 *  one enormous step that throws the camera into the next county. */
export const MAX_STEP = 0.05;

/**
 * How hard the edge is pulling, from a pointer position in NDC.
 *
 * 0 anywhere outside the band, ramping to 1 at the very edge — and SQUARED, so
 * the pull eases in instead of snapping on the moment the band is crossed. A
 * linear ramp reads as the camera lurching; this reads as it leaning.
 *
 * Both axes are measured and the nearest edge wins, so a corner of the window
 * pulls exactly as hard as the middle of an edge does rather than twice as hard.
 */
export function edgeStrength(x: number, y: number): number {
  const d = Math.min(1 - Math.abs(x), 1 - Math.abs(y));
  if (d >= EDGE_BAND) return 0;
  const t = 1 - Math.max(0, d) / EDGE_BAND;
  return t * t;
}

/**
 * The camera's new distance from the orbit target, one frame on.
 *
 * Growth is PROPORTIONAL to the distance already travelled, not a fixed metres
 * per second: at 5 m out a fixed rate would rip the camera away, and at 100 m
 * the same rate would look like nothing happening. Scaling by the current
 * distance makes the gesture feel identical at every zoom level.
 *
 * Returns the distance unchanged when it is already at the ceiling, so the
 * caller can skip the write — and skip re-resolving the drag — rather than
 * churning the camera every frame at the limit.
 */
export function dollyStep(
  distance: number,
  strength: number,
  delta: number,
  ceiling = Infinity
): number {
  if (strength <= 0 || distance <= 0) return distance;
  const grown = distance * (1 + DOLLY_PER_SEC * strength * Math.min(delta, MAX_STEP));
  return Math.min(ceiling, Math.max(distance, grown));
}
