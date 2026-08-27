/**
 * TERRA WORK ORDER — the arithmetic behind the TerraGen panel.
 * ------------------------------------------------------------------
 * What the Generate button authors is not a render; it is a *Work Order*. Terra
 * Platform hands it to TerraOrchestrator, which splits it into Sub Work Orders
 * and permutes them, and TerraGen renders one subset at a time. So everything
 * this file models has to be a field the orchestrator can plan and the renderer
 * can execute — nothing else belongs in the panel.
 *
 * THE ONE IDEA: the scene is value #1 of every axis. An axis that is OFF
 * contributes exactly what the viewport shows right now, which is why every
 * count below floors at 1 and why `axisValues` always returns a scene-derived
 * label for the off case. Turning an axis on means "…and also these".
 *
 * THE OTHER IDEA: the sweep is NOT an axis. Pitch, yaw and distance used to be
 * authored here as their own ranges, in parallel with the camera rig sitting in
 * the scene — two places describing one sweep, which drifted apart the moment a
 * camera was dragged. They are now read straight off the rig via `planCapture`,
 * the same call the viewport's own capture uses. The panel edits the rig; the
 * rig is the sweep.
 *
 *     subsets = ∏ (values on each active axis)
 *     frames  = subsets × planCapture(rig).totalFrames
 *
 * Adding one weather value to a 24-subset order costs 2,880 frames. That is
 * unreasonable to ask anyone to hold in their head, which is what the dispatch
 * review exists to state before anything is spent.
 *
 * Kept apart from React for the same reason `planCapture` is: the frame count
 * is what the dataset is billed and judged on, so it has to be testable on its
 * own.
 */

import type { IconName } from "@/components/icons";
import type { Asset } from "./assets-data";
import type { SceneObject } from "./scene-types";
import { newSeed } from "./arrange";
import type { SceneApi } from "./useScene";
import {
  atDistance,
  distance as vecDistance,
  farLimit as farLimitOf,
  nearLimit as nearLimitOf,
  planCapture,
  spanLimit,
  type CameraRig,
} from "./camera-rig";

type Vec3 = [number, number, number];

/* ------------------------------------------------------------------ axes -- */

/**
 * The four axes that multiply subsets.
 *
 * Every one of them needs headless scene reconstruction per value — a separate
 * TerraGen dispatch — which is what makes them expensive and what makes them
 * the only things worth counting. The camera sweep is not here: it happens
 * INSIDE one session, and it is authored by the rig rather than by this file.
 */
export type AxisId = "background" | "layouts";

/**
 * Dock sections. Master, Camera and Weather are not axes — they edit the scene
 * rather than the order, and none of them multiplies anything — and Output
 * gates what TerraGen computes rather than how many times it runs. They all read
 * as rows in the same stack.
 *
 * Weather used to be an axis (a multi-select of five conditions) and Time of Day
 * another (a set of clock times). Both became one scene-owned Weather & Lighting
 * configuration — see weather.ts — so neither is an `AxisId` any more, and the
 * subset math no longer multiplies by either.
 */
export type SectionId = "master" | "camera" | "weather" | AxisId | "output";

export interface AxisMeta {
  id: AxisId;
  label: string;
  icon: IconName;
  /** one line, shown at the top of the editor */
  blurb: string;
}

export const AXES: AxisMeta[] = [
  {
    id: "background",
    label: "Scene Environment",
    icon: "panorama",
    blurb: "Swap the environment. The HDRI already in your scene is always the first value.",
  },
  {
    id: "layouts",
    label: "Arrangement",
    icon: "arrange",
    blurb:
      "Rearrange the objects inside your space and render each arrangement. Every one is reproducible from its seed.",
  },
];

export const AXIS_BY_ID: Record<AxisId, AxisMeta> = AXES.reduce(
  (acc, a) => ({ ...acc, [a.id]: a }),
  {} as Record<AxisId, AxisMeta>
);

/**
 * The axes the panel shows.
 *
 * Arrangement used to be filtered out of this list: it was modelled and counted
 * like any other axis, but there was no service to author a request to, so its
 * editor could only ever ask for something nothing could answer. The solver in
 * `arrange.ts` is that answer — it runs in the browser, deterministically, from
 * a seed — so the axis is back on the panel and the filter is gone.
 */
export const PANEL_AXES = AXES;

/* ----------------------------------------------------------------- state -- */

/** Every axis carries `on`. Off means "whatever the scene already shows". */
interface AxisBase {
  on: boolean;
}

export interface BackgroundAxis extends AxisBase {
  /** library asset id of the HDRI in the scene, if we could match one */
  baseAssetId: string | null;
  /** what's placed in the scene — null when nothing is. Value #1 of the axis,
   *  and the one case where the scene can't supply one. */
  baseLabel: string | null;
  /**
   * Extra HDRIs, base excluded — each with its own checkbox.
   *
   * A PICK IS NOT AUTOMATICALLY A VALUE. The list used to be bare ids: chosen
   * meant swept, and taking one out of the run meant losing it from the list
   * and finding it in the library again. Carrying `inRun` per row is what lets
   * the section be a shortlist you build once and a run you tune afterwards —
   * the same bargain the weather sets make.
   */
  picks: EnvPick[];
}

/** One HDRI on the shortlist, and whether the run sweeps it. */
export interface EnvPick {
  assetId: string;
  inRun: boolean;
}

/**
 * A stand-in for one object in the scene, rendered in its place.
 *
 * WHY THESE AREN'T SCENE EDITS. Swapping in the Objects section used to replace
 * an object's mesh outright, which made "render this dataset over six chairs"
 * a six-visit chore that destroyed the scene a little more each time. A swap is
 * therefore an ORDER-LEVEL substitution: the scene keeps the arrangement you
 * posed, and TerraGen re-renders the same rig, weather and framing once per
 * stand-in. Nothing here moves anything in the viewport.
 *
 * WHY IT CARRIES A TARGET. Swaps were the master's alone at first, on the
 * reasoning that the master is what the dataset is about. But a scene is a
 * whole frame — the bollard beside the car matters to the model being trained
 * as much as the car does — and there was no way to vary anything else without
 * editing the scene and losing it. Any object that can hold a role can hold a
 * swap list, and each list is counted against its own object.
 */
export interface ObjectSwap {
  /** scene object this stands in for */
  targetId: string;
  /** its name when the swap was added — what the multiplier row is labelled */
  targetName: string;
  assetId: string;
  /** the asset's name at the time it was picked — the row's label */
  name: string;
  /** this stand-in is one of the values the run renders */
  inRun: boolean;
  /**
   * How this stand-in sits differently from the thing it replaces.
   *
   * WHY AN OFFSET AND NOT A POSE. A stand-in is rendered where the object it
   * replaces stands — that is what makes it a stand-in, and the capture rig is
   * framed on that spot. An absolute pose would come unstuck the moment the
   * scene was rearranged or the master was moved: the sweep would orbit one
   * place and the chair would be somewhere else. An offset travels with the
   * object it stands in for.
   *
   * Absent means "exactly where the target is, at the target's size", which is
   * the right default and also the reason a swap needs no offset until somebody
   * decides a mesh sits too low or faces the wrong way.
   */
  offset?: SwapOffset;
}

/** A stand-in's difference from the object it replaces: metres added, degrees
 *  added, and a multiplier on the size. */
export interface SwapOffset {
  position: [number, number, number];
  rotationDeg: [number, number, number];
  scale: [number, number, number];
}

/** No difference at all — what a swap means before anybody adjusts it. */
export const SWAP_IDENTITY: SwapOffset = {
  position: [0, 0, 0],
  rotationDeg: [0, 0, 0],
  scale: [1, 1, 1],
};

/** Has this stand-in been adjusted, or is it still sitting exactly where the
 *  object it replaces sits? Drives the "adjusted" mark on the row. */
export function swapAdjusted(s: ObjectSwap): boolean {
  const o = s.offset;
  if (!o) return false;
  return (
    o.position.some((n) => n !== 0) ||
    o.rotationDeg.some((n) => n !== 0) ||
    o.scale.some((n) => n !== 1)
  );
}

/**
 * Where a stand-in actually stands: the target's pose with the swap's offset
 * applied.
 *
 * One function, because three places need the same answer and must not disagree
 * about it — the viewport preview, whatever the dispatched job rebuilds from the
 * order, and the offset the gizmo hands back (which is this, inverted).
 */
export function swapPose(
  target: { position: Vec3; rotationDeg: Vec3; scale: Vec3 },
  swap: ObjectSwap
): { position: Vec3; rotationDeg: Vec3; scale: Vec3 } {
  const o = swap.offset ?? SWAP_IDENTITY;
  return {
    position: [
      target.position[0] + o.position[0],
      target.position[1] + o.position[1],
      target.position[2] + o.position[2],
    ],
    rotationDeg: [
      target.rotationDeg[0] + o.rotationDeg[0],
      target.rotationDeg[1] + o.rotationDeg[1],
      target.rotationDeg[2] + o.rotationDeg[2],
    ],
    scale: [
      target.scale[0] * o.scale[0],
      target.scale[1] * o.scale[1],
      target.scale[2] * o.scale[2],
    ],
  };
}

/** The inverse: an absolute pose from the gizmo, back to an offset. Scale falls
 *  back to 1 rather than dividing by a zero the Size control can pass through. */
export function offsetFromPose(
  target: { position: Vec3; rotationDeg: Vec3; scale: Vec3 },
  pose: { position: Vec3; rotationDeg: Vec3; scale: Vec3 }
): SwapOffset {
  return {
    position: [
      pose.position[0] - target.position[0],
      pose.position[1] - target.position[1],
      pose.position[2] - target.position[2],
    ],
    rotationDeg: [
      pose.rotationDeg[0] - target.rotationDeg[0],
      pose.rotationDeg[1] - target.rotationDeg[1],
      pose.rotationDeg[2] - target.rotationDeg[2],
    ],
    scale: [
      pose.scale[0] / (target.scale[0] || 1),
      pose.scale[1] / (target.scale[1] || 1),
      pose.scale[2] / (target.scale[2] || 1),
    ],
  };
}

/** One object's stand-ins, in the order they were added. */
export const swapsFor = (o: WorkOrder, targetId: string): ObjectSwap[] =>
  o.swaps.filter((s) => s.targetId === targetId);

/**
 * REARRANGE THE SCENE, N TIMES.
 *
 * The axis holds a REQUEST, not a set of positions: how many arrangements, the
 * seed they descend from, the space they happen in and the rules that constrain
 * them. `arrange()` turns that into coordinates on demand, so the order stays
 * small enough to store and the arrangements stay reproducible from it.
 *
 * WHY A VOLUME ID AND NOT DIMENSIONS. It used to carry its own `[x, y, z]`,
 * which meant the panel could describe a 10 × 4 × 10 room while the viewport
 * showed an 8 × 8 × 2.7 one and neither was wrong. The volume is scene state
 * (see `scene-volume.ts`); this points at it.
 */
export interface LayoutAxis extends AxisBase {
  /** how many arrangements the run renders */
  count: number;
  /**
   * What arrangement #1 descends from; #n uses `seedFor(seed, n)`.
   *
   * THE FIELD THAT MAKES THIS A DATASET. Without it a run produces N rooms
   * nobody can ever get back — including the backend, which rebuilds the scene
   * headlessly and has only the order to rebuild it from.
   */
  seed: number;
  /** the space they happen inside — null until one is drawn */
  volumeId: string | null;
}

/**
 * WHAT MOVES IS NOT A SETTING.
 *
 * The axis used to carry a role filter and a per-object rule list, each with a
 * control in the panel. Between them they were two thirds of the section and
 * neither earned it: the answer is the same every time — everything in the room
 * that isn't the master, on the floor, out of each other's way — and the two
 * controls mostly offered ways to make a worse room.
 *
 * The MASTER is the one real exclusion, and it was never expressible anyway:
 * the capture rig is framed on it (`camera-rig.framingPosition`), so moving it
 * invalidates every shot in the order. That rule lives in the solver's callers
 * now, where the Space panel's Scatter already kept it, so a room the axis
 * builds and a room the button builds are arranged by the same sentence.
 */

/**
 * The three role groups, as the panel sees them.
 *
 * Roles are scene state, not order state: the Roles section assigns them and
 * every axis reads them back, which is what keeps "an axis that is off
 * contributes what the viewport shows" true without anything to re-sync.
 */
export interface SceneRoles {
  master: SceneObject | null;
  backgroundObjects: SceneObject[];
  distractors: SceneObject[];
}

/** The three role groups, straight off the scene. */
export function sceneRoles(scene: SceneApi): SceneRoles {
  return {
    master: scene.master ?? null,
    backgroundObjects: scene.backgroundObjects,
    distractors: scene.distractors,
  };
}

export type AnnotationId =
  | "aabb"
  | "obb"
  | "pose"
  | "polygon"
  | "semantic"
  | "keypoint"
  | "cosmos";

export interface AnnotationMeta {
  id: AnnotationId;
  label: string;
  /** per-frame annotations apply to images; per-video ones to video */
  scope: "frame" | "video";
  note?: string;
  /** in the PRD's roadmap but not this release */
  comingSoon?: boolean;
}

export const ANNOTATIONS: AnnotationMeta[] = [
  { id: "aabb", label: "Object Detection — AABB", scope: "frame", note: "Axis-aligned boxes" },
  { id: "obb", label: "Object Detection — OBB", scope: "frame", note: "Oriented boxes", comingSoon: true },
  { id: "pose", label: "Pose Estimation", scope: "frame" },
  { id: "polygon", label: "Polygonal Segmentation", scope: "frame" },
  { id: "semantic", label: "Semantic Segmentation", scope: "frame" },
  { id: "keypoint", label: "Keypoint & Landmark", scope: "frame" },
  { id: "cosmos", label: "Cosmos-compatible prompts", scope: "video", note: "Per-video", comingSoon: true },
];

/** The frame size TerraGen renders at. Drives the archive estimate, since a
 *  4K frame is four 1080p frames' worth of bytes. */
export interface Resolution {
  width: number;
  height: number;
}

export const RESOLUTION_PRESETS: { label: string; width: number; height: number }[] = [
  { label: "HD · 1280×720", width: 1280, height: 720 },
  { label: "Full HD · 1920×1080", width: 1920, height: 1080 },
  { label: "QHD · 2560×1440", width: 2560, height: 1440 },
  { label: "4K UHD · 3840×2160", width: 3840, height: 2160 },
];

/** Bounds on a custom size — under the floor there is nothing to annotate, and
 *  over the ceiling TerraGen refuses the job rather than rendering it slowly. */
export const RESOLUTION_LIMITS = { min: 256, max: 7680 };

export interface OutputSpec {
  images: boolean;
  /** not in this release — the annotation set changes substantially with it */
  video: boolean;
  resolution: Resolution;
  annotations: Record<AnnotationId, boolean>;
}

export interface WorkOrder {
  background: BackgroundAxis;
  layouts: LayoutAxis;
  /** stand-ins rendered in place of the objects they name — see `ObjectSwap` */
  swaps: ObjectSwap[];
  output: OutputSpec;
  /** the SAB prompt this order was authored from, if any */
  prompt: string;
}

/* --------------------------------------------------------- the rig state -- */

/**
 * What the placed camera rig and the master object are saying RIGHT NOW.
 *
 * This is the whole camera model. It replaces the pitch/yaw/distance ranges the
 * order used to carry: those were a second description of a sweep the scene
 * already held, and the two drifted apart every time a camera was dragged. The
 * panel's camera controls edit the rig through this, and the sweep length comes
 * from `planCapture` — the same call the viewport's own capture makes, so the
 * two can't disagree about what a frame is.
 */
export interface RigState {
  hasRig: boolean;
  hasMaster: boolean;
  masterName: string | null;
  /** what the cameras aim at — the master, or the origin with none */
  target: Vec3;
  rig: CameraRig | null;
  start: SceneObject | null;
  end: SceneObject | null;
  /** how far each end of the sweep stands off the master */
  nearDistance: number;
  farDistance: number;
  /** TerraGen's bounding-box clamp, and the far end of usable framing */
  nearLimit: number;
  farLimit: number;
  /** how far the far camera stands above the near one, and the pole above it */
  climb: number;
  climbLimit: number;
  /** frames one subset's sweep produces — planCapture, not a second opinion */
  frames: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * The pair parks at the FAR distance and `rig.nearDistance` is a saved number
 * the capture travels in to — so the near end is read off the rig, not off a
 * camera position, and the plan is built from where the sweep STARTS rather
 * than from where the cameras are standing. Planning off the parked start
 * camera would describe a sweep with no travel in it at all.
 */
export function rigState(scene: SceneApi): RigState {
  const master = scene.master ?? null;
  const target: Vec3 = master ? master.position : [0, 0, 0];

  const rig = scene.rigs[0] ?? null;
  const cams = rig ? scene.rigCameras(rig) : { start: null, end: null };
  const start = cams.start ?? null;
  const end = cams.end ?? null;
  const hasRig = start != null && end != null && rig != null;

  const scale = master?.scale ?? [1, 1, 1];
  const near = round1(nearLimitOf(scale));
  const far = round1(farLimitOf(scale));

  const farDistance = end ? round1(vecDistance(target, end.position)) : near;
  // Clamped to the far reach: a near end beyond the far one inverts the sweep.
  const nearDistance = rig ? round1(Math.min(rig.nearDistance, farDistance)) : near;
  const climb = start && end ? round1(end.position[1] - start.position[1]) : 0;

  return {
    hasRig,
    hasMaster: master != null,
    masterName: master?.name ?? null,
    target,
    rig,
    start,
    end,
    nearDistance,
    farDistance,
    nearLimit: near,
    farLimit: far,
    climb,
    climbLimit: round1(spanLimit(far)),
    frames:
      hasRig && start && end
        ? planCapture(atDistance(target, start.position, nearDistance), end.position, rig)
            .totalFrames
        : 1,
  };
}

/* ------------------------------------------------------------- seeding ---- */

/**
 * Read the current scene into a Work Order.
 *
 * Only the axes are seeded now. The camera sweep is not copied in — it is read
 * live from the rig on every render — so there is nothing here that can go
 * stale behind the user's back.
 */
export function deriveWorkOrder(scene: SceneApi, assets: Asset[]): WorkOrder {
  // The placed HDRI is a SceneObject; the library holds Assets. Name is the
  // only thing the two share, which is enough to pin "in scene" in the grid.
  const placedEnv = scene.objects.find((o) => o.source === "environment") ?? null;
  const baseAsset =
    placedEnv != null
      ? assets.find((a) => a.type === "environment" && a.name === placedEnv.name) ?? null
      : null;

  return {
    background: {
      on: false,
      baseAssetId: baseAsset?.id ?? null,
      baseLabel: placedEnv?.name ?? null,
      picks: [],
    },
    layouts: {
      // Opens at ONE — the scene as posed, multiplying nothing. Nobody should
      // discover they armed a four-subset sweep by opening a panel.
      on: false,
      count: 1,
      // A fresh seed per Work Order rather than a constant: two orders authored
      // in the same session should not silently produce the same four rooms.
      seed: newSeed(),
      volumeId: scene.activeVolumeId,
    },
    swaps: [],
    output: {
      images: true,
      video: false,
      resolution: { width: 1920, height: 1080 },
      annotations: {
        aabb: true,
        obb: false,
        pose: false,
        polygon: false,
        semantic: true,
        keypoint: false,
        cosmos: false,
      },
    },
    prompt: "",
  };
}

/* ------------------------------------------------------------- counting --- */

export const formatCount = (n: number) => n.toLocaleString();

/**
 * The values one axis contributes, as labels — one function so the count, the
 * dispatch review and the permutation preview can never disagree about what an
 * axis is worth. An axis that is off contributes the scene's own value.
 */
export function axisValues(o: WorkOrder, id: AxisId, assets: Asset[]): string[] {
  const assetName = (assetId: string) => assets.find((a) => a.id === assetId)?.name ?? "Asset";

  switch (id) {
    case "background": {
      const base = o.background.baseLabel;
      const extras = o.background.picks.filter((p) => p.inRun).map((p) => assetName(p.assetId));
      // With nothing placed there is no value #1 to pin, so the axis is worth
      // only what was added — and preflight blocks the dispatch either way.
      if (!o.background.on) return [base ?? "No HDRI"];
      if (!base) return extras.length > 0 ? extras : ["No HDRI"];
      return [base, ...extras];
    }
    case "layouts":
      // Off, the axis contributes the room exactly as it is posed — the same
      // bargain every other axis makes with its scene value.
      return o.layouts.on
        ? Array.from({ length: o.layouts.count }, (_, i) => `Arrangement ${i + 1}`)
        : ["As arranged"];
  }
}

/**
 * The one-line summary each axis shows on its closed row.
 *
 * It NAMES the values rather than reporting a multiplier. The budget is stated
 * once, in the dispatch review, and a row that reads "×4" here is a budget
 * readout wearing a checklist's clothes — it tells you what a thing costs
 * without telling you what it is.
 */
export function axisSummary(o: WorkOrder, id: AxisId, assets: Asset[]): string {
  const values = axisValues(o, id, assets);
  if (!o[id].on) return values[0];
  if (values.length <= 2) return values.join(" · ");
  return `${values.slice(0, 2).join(" · ")} +${values.length - 2}`;
}

export interface Multiplier {
  /** an axis, or one of the two things that multiply like one without being an
   *  axis: the scene-owned weather sets, and one object's stand-ins
   *  (`swaps:<objectId>`, one row per object that has any) */
  id: AxisId | "weather" | `swaps:${string}`;
  label: string;
  count: number;
}

export interface Totals {
  framesPerSubset: number;
  subsets: number;
  frames: number;
  /** what the run is billed at */
  credits: number;
  bytes: number;
  seconds: number;
  /** active axes and what each is worth, for the dispatch review */
  multipliers: Multiplier[];
}

/**
 * Cost constants, back-fitted to the PRD's worked example (24 subsets ×
 * 360 frames ≈ 1,240 credits · 4.2 GB · 38 min) so the panel's numbers land
 * where the pipeline docs say they should. The per-subset terms are the
 * headless scene reconstruction TerraGen does on every restart — they are what
 * makes an axis expensive, and pricing them separately is what lets the review
 * explain itself.
 */
const CREDITS_PER_FRAME = 0.125;
const CREDITS_PER_SUBSET = 7;

/**
 * What a run of this shape is charged.
 *
 * Split out of `computeTotals` so the seeded run history can be priced at the
 * SAME rate the review charges, without a second copy of the constants living
 * in another module and drifting from these two.
 */
export const creditsFor = (frames: number, subsets: number) =>
  Math.round(frames * CREDITS_PER_FRAME + subsets * CREDITS_PER_SUBSET);
const BYTES_PER_FRAME = 0.5 * 1024 * 1024;
/** What `BYTES_PER_FRAME` is a frame OF. A 4K frame is four of these. */
const BASE_PIXELS = 1920 * 1080;
const SECONDS_PER_FRAME = 0.22;
const SECONDS_PER_SUBSET = 15;

/**
 * `framesPerSubset` comes from the rig — see `rigState`.
 *
 * `weatherSets` is how many saved weather combinations are checked into the run
 * (`SavedWeather.inRun`). It multiplies like an axis because it IS one: the
 * sweep is rendered once per set. It's passed in rather than read off the order
 * because weather lives on the scene, not in the order — the same reason the
 * camera sweep is read live from the rig.
 */
export function computeTotals(
  o: WorkOrder,
  assets: Asset[],
  framesPerSubset: number,
  weatherSets = 0
): Totals {
  const perSubset = Math.max(1, Math.round(framesPerSubset));

  const multipliers: Multiplier[] = AXES.filter((a) => o[a.id].on).map((a) => ({
    id: a.id,
    label: a.label,
    count: axisValues(o, a.id, assets).length,
  }));

  // One set is the scene as it stands — no multiplication to show. Two or more
  // is a sweep, and then it earns a row beside the axes that also multiply.
  if (weatherSets > 1) {
    multipliers.push({ id: "weather", label: "Weather sets", count: weatherSets });
  }

  /**
   * Stand-ins multiply the same way, and the object you actually posed is
   * value #1 of its own list — the run always contains the scene as it stands.
   *
   * ONE ROW PER OBJECT, and they multiply EACH OTHER: two stand-ins for the car
   * and one for the bollard is 3 × 2 = six versions of the scene, not five.
   * Collapsing them into a single "Object swaps ×4" would have understated the
   * bill by a factor, which is the one mistake this whole screen exists to
   * prevent.
   */
  const targets: string[] = [];
  o.swaps.forEach((s) => {
    if (s.inRun && !targets.includes(s.targetId)) targets.push(s.targetId);
  });
  targets.forEach((targetId) => {
    const mine = o.swaps.filter((s) => s.targetId === targetId && s.inRun);
    multipliers.push({
      id: `swaps:${targetId}`,
      label: `${mine[0].targetName} swaps`,
      count: mine.length + 1,
    });
  });

  const subsets = multipliers.reduce((n, m) => n * Math.max(1, m.count), 1);
  const frames = subsets * perSubset;

  return {
    framesPerSubset: perSubset,
    subsets,
    frames,
    credits: creditsFor(frames, subsets),
    // Scaled by frame size: the archive is the one estimate the resolution
    // actually changes, and a 4K run that reported 1080p bytes would understate
    // it fourfold.
    bytes:
      frames *
      BYTES_PER_FRAME *
      ((o.output.resolution.width * o.output.resolution.height) / BASE_PIXELS),
    seconds: frames * SECONDS_PER_FRAME + subsets * SECONDS_PER_SUBSET,
    multipliers,
  };
}

/* -------------------------------------------------------- frame samples --- */

export interface FrameSample {
  /** 1-based, matching the frame numbering the archive uses */
  index: number;
  /** where the camera stands for this frame */
  position: Vec3;
  /** elevation above the master, degrees — readout only */
  pitch: number;
  /** compass angle around the master, degrees, 0° = +Z */
  yaw: number;
  distance: number;
}

const azimuth = (centre: Vec3, p: Vec3) =>
  (Math.atan2(p[0] - centre[0], p[2] - centre[2]) * 180) / Math.PI;

const elevation = (centre: Vec3, p: Vec3) =>
  (Math.atan2(p[1] - centre[1], Math.hypot(p[0] - centre[0], p[2] - centre[2])) * 180) / Math.PI;

/**
 * The camera pose at frame `i` of one subset's sweep, straight off the rig's
 * own plan.
 *
 * The rig turns the MASTER on a turntable while the camera holds its stop, so
 * a revolution and an orbit of the camera are the same picture. Orbiting the
 * camera is what this preview does, because rotating the object would mean
 * re-posing every other object in the scene with it.
 *
 * Frames run the way TerraGen shoots them: a full revolution at one stop, then
 * the next stop along the start→end line.
 */
export function frameSample(rig: RigState, i: number): FrameSample {
  const target = rig.target;
  if (!rig.hasRig || !rig.start || !rig.end || !rig.rig) {
    return { index: 1, position: [0, 2, 6], pitch: 0, yaw: 0, distance: 6 };
  }

  const plan = planCapture(
    atDistance(target, rig.start.position, rig.nearDistance),
    rig.end.position,
    rig.rig
  );
  const total = Math.max(1, plan.totalFrames);
  const idx = ((i % total) + total) % total;

  const shot = idx % plan.shotsPerPass;
  const pass = plan.passes[Math.floor(idx / plan.shotsPerPass) % plan.passes.length];

  const turn = (360 / plan.shotsPerPass) * shot;
  const ground = Math.hypot(pass.position[0] - target[0], pass.position[2] - target[2]);
  const heading = azimuth(target, pass.position) + turn;
  const rad = (heading * Math.PI) / 180;

  const position: Vec3 = [
    target[0] + Math.sin(rad) * ground,
    pass.position[1],
    target[2] + Math.cos(rad) * ground,
  ];

  return {
    index: idx + 1,
    position,
    pitch: elevation(target, position),
    yaw: heading,
    distance: vecDistance(target, position),
  };
}

/* --------------------------------------------------------- permutations --- */

export interface SubsetRow {
  index: number;
  cells: { axis: AxisId; value: string }[];
}

/**
 * The first `limit` subsets, spelled out. This is the moment the axis model
 * pays for itself: the user sees the permutation table TerraOrchestrator will
 * walk, rather than trusting a multiplication they can't check.
 */
export function permutations(o: WorkOrder, assets: Asset[], limit = 12): SubsetRow[] {
  const active = AXES.filter((a) => o[a.id].on).map((a) => ({
    id: a.id,
    values: axisValues(o, a.id, assets),
  }));
  if (active.length === 0) return [];

  const total = active.reduce((n, a) => n * a.values.length, 1);
  const rows: SubsetRow[] = [];

  for (let i = 0; i < Math.min(limit, total); i++) {
    let rem = i;
    const cells: SubsetRow["cells"] = [];
    // Last axis varies fastest, which is the order the rows read in.
    for (let k = active.length - 1; k >= 0; k--) {
      const a = active[k];
      cells.unshift({ axis: a.id, value: a.values[rem % a.values.length] });
      rem = Math.floor(rem / a.values.length);
    }
    rows.push({ index: i + 1, cells });
  }
  return rows;
}

/* ------------------------------------------------------------ preflight --- */

export interface Gate {
  id: string;
  /** block = Dispatch is disabled · warn = say it, allow it */
  level: "block" | "warn";
  message: string;
}

export interface PreflightContext {
  masterCount: number;
  hasRig: boolean;
  credits: number;
}

/*
 * NO ENVIRONMENT GATE. There was one — "No HDRI in the scene" — and it read the
 * scene for an object with `source === "environment"`, which is not how every
 * route into the scene places a sky. So it stayed lit after the user had added
 * one, telling them to do a thing they had just done, on the last screen before
 * they spend credits. A check that cries wolf about the one condition it exists
 * to catch is worse than no check: it teaches people to dispatch through the
 * warning strip. The axis still names the scene's own environment as value #1,
 * and TerraGen supplies its default sky when there is none.
 */

/** Soft ceiling — past this the bill is worth a second look, not a refusal. */
const FRAME_WARN_AT = 10_000;

/**
 * A live validity strip beats failing on click: the user should never press
 * Dispatch and be told no. Blocks come first so the footer can show the one
 * that matters.
 */
export function preflight(o: WorkOrder, ctx: PreflightContext, totals: Totals): Gate[] {
  const gates: Gate[] = [];

  if (ctx.masterCount === 0) {
    gates.push({
      id: "master",
      level: "block",
      message: "Mark one object as Master — every camera orbits it.",
    });
  }

  if (!ctx.hasRig) {
    gates.push({
      id: "rig",
      level: "block",
      message: "Place a Camera to define the sweep.",
    });
  }

  /**
   * An arrangement needs somewhere to happen.
   *
   * A BLOCK, NOT A WARNING: with no volume the solver has no bounds to sample
   * inside, so the axis would multiply the bill by `count` and render the same
   * scene that many times. That is money for nothing, which is exactly what
   * this strip exists to stop.
   */
  if (o.layouts.on && !o.layouts.volumeId) {
    gates.push({
      id: "arrangement",
      level: "block",
      message: "Draw a space before sweeping arrangements — the solver needs bounds.",
    });
  }

  if (!o.output.images && !o.output.video) {
    gates.push({ id: "dataset", level: "block", message: "Choose at least one dataset type." });
  }

  const annotations = ANNOTATIONS.filter((a) => o.output.annotations[a.id]);
  if (annotations.length === 0) {
    gates.push({ id: "annotations", level: "block", message: "Choose at least one annotation type." });
  }

  if (totals.credits > ctx.credits) {
    gates.push({
      id: "credits",
      level: "block",
      message: `${totals.credits.toLocaleString()} credits needed — you have ${ctx.credits.toLocaleString()}.`,
    });
  }

  if (totals.frames > FRAME_WARN_AT) {
    gates.push({
      id: "frames",
      level: "warn",
      message: "This is a long run — check the axes in the dispatch review before spending.",
    });
  }

  return gates.sort((a, b) => (a.level === b.level ? 0 : a.level === "block" ? -1 : 1));
}

/* --------------------------------------------------------------- format --- */

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function formatDuration(seconds: number) {
  if (seconds < 90) return `${Math.round(seconds)} sec`;
  const mins = seconds / 60;
  if (mins < 90) return `${Math.round(mins)} min`;
  const hours = Math.floor(mins / 60);
  const rest = Math.round(mins % 60);
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
