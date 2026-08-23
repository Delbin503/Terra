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
    label: "AI Layouts",
    icon: "layout",
    blurb:
      "TerraArrange authors the arrangements; TerraGen only executes them. You define the volume and how many to generate.",
  },
];

export const AXIS_BY_ID: Record<AxisId, AxisMeta> = AXES.reduce(
  (acc, a) => ({ ...acc, [a.id]: a }),
  {} as Record<AxisId, AxisMeta>
);

/**
 * The axes the panel actually shows.
 *
 * AI Layouts is modelled, counted and billed like any other axis, but it has no
 * section: TerraArrange doesn't exist yet, so its editor could only ever author
 * a request nothing can answer. It stays in `AXES` so the dispatch review keeps
 * counting it if it is ever switched on programmatically, and comes back here
 * the day the service ships.
 */
export const PANEL_AXES = AXES.filter((a) => a.id !== "layouts");

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
  /** extra HDRIs, base excluded */
  assetIds: string[];
}

export interface LayoutAxis extends AxisBase {
  /** how many arrangements TerraArrange should return */
  count: number;
  /** metres — the volume concepts get scattered through */
  volume: [number, number, number];
  concepts: string[];
}

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

export interface OutputSpec {
  images: boolean;
  /** not in this release — the annotation set changes substantially with it */
  video: boolean;
  annotations: Record<AnnotationId, boolean>;
}

export interface WorkOrder {
  background: BackgroundAxis;
  layouts: LayoutAxis;
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
      assetIds: [],
    },
    layouts: { on: false, count: 4, volume: [10, 4, 10], concepts: [] },
    output: {
      images: true,
      video: false,
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
      const extras = o.background.assetIds.map(assetName);
      // With nothing placed there is no value #1 to pin, so the axis is worth
      // only what was added — and preflight blocks the dispatch either way.
      if (!o.background.on) return [base ?? "No HDRI"];
      if (!base) return extras.length > 0 ? extras : ["No HDRI"];
      return [base, ...extras];
    }
    case "layouts":
      return o.layouts.on
        ? Array.from({ length: o.layouts.count }, (_, i) => `Layout ${i + 1}`)
        : ["Scene arrangement"];
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
  /** an axis, or "weather" — the scene-owned set sweep that multiplies like one */
  id: AxisId | "weather";
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
const BYTES_PER_FRAME = 0.5 * 1024 * 1024;
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

  const subsets = multipliers.reduce((n, m) => n * Math.max(1, m.count), 1);
  const frames = subsets * perSubset;

  return {
    framesPerSubset: perSubset,
    subsets,
    frames,
    credits: Math.round(frames * CREDITS_PER_FRAME + subsets * CREDITS_PER_SUBSET),
    bytes: frames * BYTES_PER_FRAME,
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
  hasEnvironment: boolean;
  credits: number;
}

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

  if (!ctx.hasEnvironment) {
    gates.push({
      id: "hdri",
      level: o.background.on ? "block" : "warn",
      message: "No HDRI in the scene — the Background axis needs a base environment.",
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
