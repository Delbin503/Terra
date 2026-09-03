/**
 * CAMERA RIG — the turntable capture model.
 * ------------------------------------------------------------------
 * A Camera utility drops in as a linked PAIR: one camera at the start of the
 * sweep and one at the end. The pair replaces the old Horizontal/Vertical +
 * Set Min/Max model — instead of two camera types and hand-entered angles, the
 * two positions in the scene ARE the range, and the capture fills it in.
 *
 * The capture itself: at the start position the master object turns a full
 * revolution while the camera shoots `shotsPerRotation` frames. The camera then
 * moves to the next of `shotsPerDistance` stops along the start→end line and
 * shoots another revolution, until it has stood at every stop.
 *
 * The stops are a COUNT, not a metre step. The two are the same idea from
 * opposite ends, but the count is the one you can budget with: it multiplies
 * the frame total directly, and it doesn't silently change when the rig is
 * moved — a 5 m step over a 12 m sweep gives 3 passes, and dragging a camera a
 * metre further out makes that 4 without anyone asking for more frames.
 *
 * The planning math lives here, apart from React, because it's the part that
 * has to be right: the frame count is what a dataset is billed and judged on.
 */

export type CameraMode = "rotatable" | "fixed";

export interface CameraRig {
  id: string;
  /** scene object ids of the two cameras */
  startId: string;
  endId: string;
  mode: CameraMode;
  /**
   * The near end of the sweep, in metres from the master — SAVED, not stood in.
   *
   * The pair lives at the FAR distance: that is where a rig is dropped and
   * where it sits between edits, because the far shot is the one that shows the
   * whole object and the one you frame against. The near reach is a number the
   * rig carries and the capture travels down to, previewed in the viewport only
   * while the Distance control is open. Storing it this way means the near
   * value survives every other edit — orbit, climb, a dragged camera — instead
   * of being whatever a camera position happened to imply.
   */
  nearDistance: number;
  /**
   * The arc the master turns through, in degrees, as absolute bearings. A full
   * revolution is 0 → 360; anything narrower captures a wedge, which is what
   * you want when the back of the object is a wall or a duplicate of the front.
   */
  orbitStart: number;
  orbitEnd: number;
  /** how many stops the camera makes between the near and far ends */
  shotsPerDistance: number;
  /** frames captured per full revolution of the master */
  shotsPerRotation: number;
}

export const CAMERA_DEFAULTS = {
  mode: "rotatable" as CameraMode,
  orbitStart: 0,
  orbitEnd: 360,
  shotsPerDistance: 3,
  shotsPerRotation: 24,
};

/** Two stops closer together than this are the same shot twice. */
export const MIN_STOP_GAP = 0.25;

/**
 * How many stops actually fit between the two ends of a sweep.
 *
 * A count the rig can't honour is worse than a lower ceiling: ask for 12 stops
 * across a 2 m climb and ten of them are the same frame, billed ten times. The
 * cap is what the span can hold at `MIN_STOP_GAP` apart.
 */
export const maxStops = (span: number) =>
  Math.max(1, Math.min(DISTANCE_SHOTS_RANGE.max, Math.floor(span / MIN_STOP_GAP) + 1));

/** The rise between one stop and the next, for the control's readout. */
export const stopGap = (span: number, stops: number) =>
  stops <= 1 ? 0 : span / (stops - 1);

/** Degrees between one shot and the next around the arc. */
export function orbitStep(startDeg: number, endDeg: number, shots: number) {
  const sweep = orbitSweep(startDeg, endDeg);
  // A full revolution's last shot would land on top of its first, so the step
  // divides by the shot count; a partial arc includes both ends, so it divides
  // by the gaps between them.
  const full = Math.abs(sweep - 360) < 0.001;
  return shots <= 1 ? 0 : sweep / (full ? shots : shots - 1);
}

/** How much of a turn the arc covers, always positive, 0 → 360. */
export function orbitSweep(startDeg: number, endDeg: number) {
  const raw = endDeg - startDeg;
  if (raw >= 360) return 360;
  const wrapped = ((raw % 360) + 360) % 360;
  return wrapped === 0 ? 360 : wrapped;
}

/** Every bearing a shot is taken from, for the viewport's tick marks. */
export function orbitShots(startDeg: number, endDeg: number, shots: number): number[] {
  const n = Math.max(1, Math.round(shots));
  const step = orbitStep(startDeg, endDeg, n);
  return Array.from({ length: n }, (_, i) => startDeg + step * i);
}

/* --------------------------------------------------------------------- zoom */

/**
 * ZOOM, NOT METRES — how the near end of the sweep is READ and EDITED.
 *
 * The rig's own standing distance is the frame you composed: it is what the far
 * shot looks like, and every closer shot is that frame magnified. So the near
 * end reads as a multiple of it — 1x is the rig where it stands, 2x is half the
 * distance, 4x a quarter — which is the number a person can actually picture.
 * "2.6 m" could be a close-up or a wide shot depending on how big the object is
 * and where the rig happens to be; "3.9x" is the same amount of zoom either way.
 *
 * THE MODEL STAYS METRIC. `nearDistance` is still metres, because that is what
 * positions a camera, plans a stop and prints in the Work Order. Zoom is a lens
 * on that number, converted at the edges — which is why these are two functions
 * and not a stored field that could disagree with the geometry.
 */
export const ZOOM_STEP = 0.1;

/** How magnified the near end is against the rig's own framing. */
export const zoomOf = (farDistance: number, nearDistance: number) =>
  farDistance / Math.max(0.001, nearDistance);

/** The metres a zoom asks for. */
export const distanceAtZoom = (farDistance: number, zoom: number) =>
  farDistance / Math.max(1, zoom);

/**
 * The most zoom the rig can reach before TerraGen's own floor stops it.
 *
 * Floored at 1x plus a step so the slider always has somewhere to travel: a rig
 * parked on top of its own near limit would otherwise hand the control a range
 * of zero and a handle that cannot move.
 */
export const maxZoom = (farDistance: number, nearLimit: number) =>
  Math.max(1 + ZOOM_STEP, zoomOf(farDistance, nearLimit));

/** One decimal, always — "1.0x", "3.9x". */
export const formatZoom = (zoom: number) => `${zoom.toFixed(1)}x`;

export const DISTANCE_SHOTS_RANGE = { min: 1, max: 12, step: 1 };
export const SHOTS_RANGE = { min: 4, max: 120, step: 1 };

type Vec3 = [number, number, number];

export const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export interface CapturePass {
  /** 1-based, for frame naming */
  index: number;
  position: Vec3;
  /** how far along the start→end line this pass sits */
  travelled: number;
}

export interface CapturePlan {
  passes: CapturePass[];
  shotsPerPass: number;
  totalFrames: number;
  /** full start→end separation */
  span: number;
  /** how much of a turn each pass covers — 360 unless the arc was narrowed */
  sweepDeg: number;
  mode: CameraMode;
}

/**
 * Work out every position the camera stops at, and how many frames that comes
 * to. Fixed mode is a single front-on frame — no revolution, no climb.
 *
 * `start` is the NEAR pose — the start camera pulled in to the rig's saved
 * `nearDistance` — not wherever that camera is parked while you aren't editing
 * the distance. The caller resolves that (see `capturePlan` in EditorView),
 * because only it knows whether a preview is running.
 *
 * The arc changes where the shots land, never how many there are: narrowing it
 * packs the same `shotsPerRotation` frames into a wedge rather than dropping
 * frames, which is what makes it safe to adjust without re-reading the budget.
 *
 * The stop count floors at 1, so a rig whose two cameras sit on top of each
 * other still yields one pass rather than zero: a capture can never be a no-op
 * that reports success.
 */
export function planCapture(
  start: Vec3,
  end: Vec3,
  {
    mode,
    shotsPerDistance,
    shotsPerRotation,
    orbitStart = 0,
    orbitEnd = 360,
  }: Pick<CameraRig, "mode" | "shotsPerDistance" | "shotsPerRotation"> &
    Partial<Pick<CameraRig, "orbitStart" | "orbitEnd">>
): CapturePlan {
  const span = distance(start, end);
  const sweepDeg = orbitSweep(orbitStart, orbitEnd);

  if (mode === "fixed") {
    return {
      passes: [{ index: 1, position: start, travelled: 0 }],
      shotsPerPass: 1,
      totalFrames: 1,
      span,
      sweepDeg,
      mode,
    };
  }

  const stops = Math.max(1, Math.round(shotsPerDistance));
  const shots = Math.max(1, Math.round(shotsPerRotation));

  const passes: CapturePass[] = [];
  for (let i = 0; i < stops; i++) {
    // One stop sits at the start; two or more spread evenly to the end point
    // inclusive, so the far camera is always actually shot from.
    const t = stops === 1 ? 0 : i / (stops - 1);
    passes.push({ index: i + 1, position: lerp(start, end, t), travelled: span * t });
  }

  return { passes, shotsPerPass: shots, totalFrames: passes.length * shots, span, sweepDeg, mode };
}

/**
 * A framing position for a camera looking at the master: pulled back along the
 * scene's default viewing diagonal and lifted, scaled to the object's size so a
 * large master doesn't end up cropped.
 *
 * `role` splits the pair — the start camera sits low, the end camera high, which
 * is what gives the sweep somewhere to travel the moment it's dropped.
 */
export function framingPosition(
  master: Vec3,
  radius: number,
  role: "start" | "end"
): Vec3 {
  const back = Math.max(3, radius * 4);
  const lift = role === "start" ? radius * 0.6 : radius * 0.6 + Math.max(5, radius * 4);
  return [master[0] + back * 0.72, master[1] + lift, master[2] + back * 0.72];
}

/** How big the master reads — the radius every framing rule is scaled from. */
export const masterRadius = (scale: readonly number[]) => 0.7 * Math.max(...scale);

/**
 * How close a camera is allowed to get: all but touching the master. Any nearer
 * and the lens is inside the bounding box, which TerraGen clamps anyway — this
 * mirrors that rule so the UI can show the floor rather than have the value
 * silently overridden server-side.
 */
export const nearLimit = (scale: readonly number[]) => Math.max(0.8, masterRadius(scale) * 1.15);

/**
 * How far a camera can back off before the master stops being the subject.
 *
 * Derived rather than guessed: at the scene's 45° field of view the frame's
 * half-height at distance d is d·tan(22.5°) ≈ 0.414d, so the master fills
 * `radius / 0.414d` of it. Holding that at ~8% — small in frame but still
 * unmistakably the thing being photographed — gives d ≈ 30·radius.
 */
export const farLimit = (scale: readonly number[]) => Math.max(6, masterRadius(scale) * 30);

/** Distance ignoring height — what the halo rings on the ground plane show. */
export const groundDistance = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2]);

/** Compass angle of `point` around `centre`, degrees, 0° = +Z. */
export const azimuthOf = (centre: Vec3, point: Vec3) =>
  (Math.atan2(point[0] - centre[0], point[2] - centre[2]) * 180) / Math.PI;

/**
 * `point` moved to `metres` from `centre` along the line it already sits on —
 * same bearing, same elevation angle, just nearer or further.
 *
 * This is what a rig's near/far distance actually edits: the camera keeps
 * looking down the same sight line and only its reach changes, so setting a
 * distance never silently re-frames the shot.
 */
export function atDistance(centre: Vec3, point: Vec3, metres: number): Vec3 {
  const v: Vec3 = [point[0] - centre[0], point[1] - centre[1], point[2] - centre[2]];
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  const k = metres / len;
  return [centre[0] + v[0] * k, centre[1] + v[1] * k, centre[2] + v[2] * k];
}

/** Move `point` to `radius` at `deg` around `centre`, keeping its height. */
export function orbitPoint(centre: Vec3, point: Vec3, deg: number, radius?: number): Vec3 {
  const r = radius ?? groundDistance(centre, point);
  const t = (deg * Math.PI) / 180;
  return [centre[0] + Math.sin(t) * r, point[1], centre[2] + Math.cos(t) * r];
}

/**
 * Raise or lower the far end of the sweep, straight up and down.
 *
 * The column stays a COLUMN. An earlier version moved this camera along the
 * sphere of its own reach — mathematically tidy, because its distance to the
 * master never changed — but the ground radius has to grow as the camera
 * descends to stay on that sphere, so the pair leaned further apart the lower
 * it went and the rig read as a slope instead of a mast. A capture rig is a
 * mast: the two ends sit one above the other and the climb is the gap between
 * them, nothing else.
 *
 * So only `y` moves. The far camera keeps its own bearing and its own ground
 * radius, which means its straight-line distance to the master DOES change as
 * it rises — that is the honest consequence of moving something vertically,
 * and the Distance control is where reach is edited if that is what you meant.
 */
export function withVerticalSpan(start: Vec3, end: Vec3, span: number): Vec3 {
  return [end[0], start[1] + span, end[2]];
}

/**
 * The tallest climb offered.
 *
 * No longer a geometric pole — nothing stops a mast being tall — so it's the
 * same ceiling the Distance control uses: past this the master stops being the
 * subject of the frame, which is the point at which more height stops buying
 * you a usable shot.
 */
export const spanLimit = (farLimit: number) => farLimit;

/** Euler Y/X (degrees) that aims a camera at `target` from `from`. */
export function aimAt(from: Vec3, target: Vec3): [number, number, number] {
  const dx = target[0] - from[0];
  const dy = target[1] - from[1];
  const dz = target[2] - from[2];
  const yaw = Math.atan2(dx, dz) * (180 / Math.PI);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz)) * (180 / Math.PI);
  return [pitch, yaw, 0];
}
