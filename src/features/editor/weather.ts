/**
 * SCENE WEATHER — the atmosphere the scene is standing in.
 * ------------------------------------------------------------------
 * One weather, live, owned by the scene. Not a list of conditions to permute.
 *
 * WHY THIS ISN'T AN AXIS ANY MORE. Weather and Time of Day used to be Work
 * Order axes: a multi-select of five condition names and a set of clock times,
 * each chosen value costing a full re-render of the sweep. That model could say
 * "render this scene rainy AND snowy" but it could not say what rainy MEANT —
 * how hard it came down, from which direction, through how much fog. The
 * controls a weather system actually needs (§3–§6 of the UI spec) describe ONE
 * configuration in detail, and detail was the thing the axis had no field for.
 *
 * So weather follows the camera sweep's path exactly. The sweep used to be
 * authored in the order as pitch/yaw/distance ranges, in parallel with a rig
 * sitting in the scene — two descriptions of one thing that drifted apart the
 * moment a camera was dragged. The fix was to delete the order's copy and read
 * the rig live (see work-order.ts, "the sweep is NOT an axis"). Weather is now
 * in the same position: the panel edits the scene's weather, and the scene's
 * weather is what renders. There is nothing to seed and nothing to re-sync.
 *
 * WHAT THAT COSTS. Subsets no longer multiply by weather or by time — an order
 * is billed for `background × layouts` alone. A weather change costs nothing,
 * because it changes the scene rather than the number of times the scene is
 * rebuilt.
 *
 * Kept out of React for the same reason `camera-rig.ts` is: presets, clamps and
 * the "has this drifted from its preset" comparison are decisions about values,
 * testable without mounting anything.
 */

import type { IconName } from "@/components/icons";

/* --------------------------------------------------------------- presets -- */

export type WeatherPresetId = "sunny" | "cloudy" | "rain" | "storm" | "snow";

export interface WeatherPresetMeta {
  id: WeatherPresetId;
  label: string;
  icon: IconName;
  /** what this condition is, on the preset tile */
  blurb: string;
}

/**
 * The five conditions, in the order the spec lists them — clearest sky first,
 * so the row reads as a ramp rather than as an unordered set.
 */
export const WEATHER_PRESETS: WeatherPresetMeta[] = [
  { id: "sunny", label: "Sunny", icon: "sunny", blurb: "Clear sky, hard light" },
  { id: "cloudy", label: "Cloudy", icon: "cloudy", blurb: "Overcast, soft light" },
  { id: "rain", label: "Rain", icon: "rain", blurb: "Falling rain, wet ground" },
  { id: "storm", label: "Storm", icon: "storm", blurb: "Heavy rain, strong wind" },
  { id: "snow", label: "Snow", icon: "snow", blurb: "Falling snow, accumulation" },
];

export const PRESET_BY_ID: Record<WeatherPresetId, WeatherPresetMeta> = WEATHER_PRESETS.reduce(
  (acc, p) => ({ ...acc, [p.id]: p }),
  {} as Record<WeatherPresetId, WeatherPresetMeta>
);

/* ----------------------------------------------------------------- shape -- */

/**
 * Falling particles.
 *
 * `direction` is the fall angle as a pair of leans rather than a single number,
 * because rain coming at you and rain crossing the frame are different pictures
 * and a scalar can only express one of them. Both are −100…100 with 0 straight
 * down.
 */
export interface Precipitation {
  /** how much comes down — 0 is none, whatever the condition */
  amount: number;
  /** how fast it falls */
  speed: number;
  /** droplet / flake size, small → large */
  size: number;
  /** [horizontal, vertical] lean, −100…100, 0 = straight down */
  direction: [number, number];
  /**
   * Ground wetness (rain, storm) and settled snow (snow).
   *
   * One field, two names, because they are the same statement — how much of what
   * fell is still on the surfaces — and a scene is never raining and snowing at
   * once. `surfaceLabel` picks the word for the condition being shown.
   */
  surface: number;
}

export interface Wind {
  speed: number;
  /** bearing in degrees, 0 = North, clockwise */
  directionDeg: number;
  /** how far wind bends the fall — 0% vertical, 100% near-horizontal */
  rainInfluence: number;
}

export interface Fog {
  on: boolean;
  density: number;
  /** how far you can see before it closes in — near → far */
  distance: number;
}

export interface Sky {
  cloudCoverage: number;
  cloudDensity: number;
  brightness: number;
  fog: Fog;
}

export interface Sun {
  /** minutes from midnight, 0–1439 — the sun's position in the day */
  minutes: number;
  intensity: number;
  /** how dark the shadows land */
  shadow: number;
}

export interface SceneWeather {
  /** the condition this state started as — the row's headline */
  preset: WeatherPresetId;
  precip: Precipitation;
  wind: Wind;
  sky: Sky;
  sun: Sun;
}

/* ----------------------------------------------------------- the presets -- */

/**
 * What each condition means, as values.
 *
 * Every preset is COMPLETE rather than a patch over a shared default. A partial
 * preset means switching Rain → Sunny leaves the rain amount from before
 * sitting under a clear sky, invisible in the panel (Sunny hides the
 * precipitation group) and live in the render — a value nobody can see and
 * nobody set.
 */
const PRESET_STATE: Record<WeatherPresetId, Omit<SceneWeather, "preset">> = {
  sunny: {
    precip: { amount: 0, speed: 0, size: 30, direction: [0, 0], surface: 0 },
    wind: { speed: 10, directionDeg: 90, rainInfluence: 0 },
    sky: {
      cloudCoverage: 10,
      cloudDensity: 15,
      brightness: 90,
      fog: { on: false, density: 10, distance: 80 },
    },
    sun: { minutes: 12 * 60, intensity: 95, shadow: 80 },
  },
  cloudy: {
    precip: { amount: 0, speed: 0, size: 30, direction: [0, 0], surface: 0 },
    wind: { speed: 25, directionDeg: 90, rainInfluence: 0 },
    sky: {
      cloudCoverage: 75,
      cloudDensity: 60,
      brightness: 55,
      fog: { on: false, density: 20, distance: 70 },
    },
    sun: { minutes: 12 * 60, intensity: 45, shadow: 35 },
  },
  rain: {
    precip: { amount: 60, speed: 65, size: 35, direction: [15, 0], surface: 55 },
    wind: { speed: 35, directionDeg: 225, rainInfluence: 35 },
    sky: {
      cloudCoverage: 90,
      cloudDensity: 75,
      brightness: 40,
      fog: { on: true, density: 30, distance: 55 },
    },
    sun: { minutes: 12 * 60, intensity: 30, shadow: 20 },
  },
  storm: {
    precip: { amount: 90, speed: 90, size: 45, direction: [40, 0], surface: 85 },
    wind: { speed: 85, directionDeg: 250, rainInfluence: 80 },
    sky: {
      cloudCoverage: 100,
      cloudDensity: 95,
      brightness: 20,
      fog: { on: true, density: 45, distance: 35 },
    },
    sun: { minutes: 12 * 60, intensity: 15, shadow: 10 },
  },
  snow: {
    precip: { amount: 55, speed: 25, size: 60, direction: [10, 0], surface: 70 },
    wind: { speed: 30, directionDeg: 315, rainInfluence: 45 },
    sky: {
      cloudCoverage: 85,
      cloudDensity: 65,
      brightness: 70,
      fog: { on: true, density: 25, distance: 50 },
    },
    sun: { minutes: 12 * 60, intensity: 40, shadow: 25 },
  },
};

/** A condition, as a complete weather state. */
export function applyPreset(id: WeatherPresetId): SceneWeather {
  const s = PRESET_STATE[id];
  return {
    preset: id,
    // Deep-copied: the preset table is module state, and handing a caller a
    // reference into it would let the next slider drag edit the preset itself.
    precip: { ...s.precip, direction: [...s.precip.direction] as [number, number] },
    wind: { ...s.wind },
    sky: { ...s.sky, fog: { ...s.sky.fog } },
    sun: { ...s.sun },
  };
}

/** Where a scene starts. Sunny at midday — the neutral read of a new scene. */
export const DEFAULT_WEATHER: SceneWeather = applyPreset("sunny");

/* ---------------------------------------------------------------- clamps -- */

const clamp = (v: number, lo: number, hi: number) =>
  Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;

/** 0–100, the range almost every control in the panel runs on. */
const pct = (v: number) => clamp(Math.round(v), 0, 100);

/** −100…100, for the two fall-angle leans. */
const lean = (v: number) => clamp(Math.round(v), -100, 100);

/** Bearings wrap rather than clamp — dragging the compass past North must come
 *  round to 1°, not stick at 360°. */
const bearing = (v: number) => (Number.isFinite(v) ? ((Math.round(v) % 360) + 360) % 360 : 0);

/** Minutes wrap the same way, so scrubbing off the end of the day rolls over. */
export const wrapMinutes = (v: number) =>
  Number.isFinite(v) ? ((Math.round(v) % 1440) + 1440) % 1440 : 0;

/**
 * A patch, clamped into a whole valid state.
 *
 * Written group-by-group rather than as a deep merge: the four groups are the
 * four sections of the panel, they each have their own legal ranges, and a
 * generic merge would happily write a 4,000-minute sun or a −20% fog.
 */
export interface WeatherPatch {
  preset?: WeatherPresetId;
  precip?: Partial<Precipitation>;
  wind?: Partial<Wind>;
  sky?: Partial<Omit<Sky, "fog">> & { fog?: Partial<Fog> };
  sun?: Partial<Sun>;
}

export function patchWeather(prev: SceneWeather, patch: WeatherPatch): SceneWeather {
  const p = patch.precip;
  const w = patch.wind;
  const s = patch.sky;
  const f = patch.sky?.fog;
  const u = patch.sun;

  return {
    preset: patch.preset ?? prev.preset,
    precip: {
      amount: pct(p?.amount ?? prev.precip.amount),
      speed: pct(p?.speed ?? prev.precip.speed),
      size: pct(p?.size ?? prev.precip.size),
      direction: [
        lean(p?.direction?.[0] ?? prev.precip.direction[0]),
        lean(p?.direction?.[1] ?? prev.precip.direction[1]),
      ],
      surface: pct(p?.surface ?? prev.precip.surface),
    },
    wind: {
      speed: pct(w?.speed ?? prev.wind.speed),
      directionDeg: bearing(w?.directionDeg ?? prev.wind.directionDeg),
      rainInfluence: pct(w?.rainInfluence ?? prev.wind.rainInfluence),
    },
    sky: {
      cloudCoverage: pct(s?.cloudCoverage ?? prev.sky.cloudCoverage),
      cloudDensity: pct(s?.cloudDensity ?? prev.sky.cloudDensity),
      brightness: pct(s?.brightness ?? prev.sky.brightness),
      fog: {
        on: f?.on ?? prev.sky.fog.on,
        density: pct(f?.density ?? prev.sky.fog.density),
        distance: pct(f?.distance ?? prev.sky.fog.distance),
      },
    },
    sun: {
      minutes: wrapMinutes(u?.minutes ?? prev.sun.minutes),
      intensity: pct(u?.intensity ?? prev.sun.intensity),
      shadow: pct(u?.shadow ?? prev.sun.shadow),
    },
  };
}

/* ------------------------------------------------------- what applies where */

/**
 * Whether this condition has anything falling out of it.
 *
 * Sunny and Cloudy don't, so their precipitation group is not shown at all. The
 * same reasoning the old axis used for its intensity dial: a slider that does
 * nothing is worse than no slider. The VALUES stay in state (a preset is always
 * complete) — they are simply not authorable under a condition that has no
 * precipitation to author.
 */
export const HAS_PRECIPITATION = (id: WeatherPresetId) =>
  id === "rain" || id === "storm" || id === "snow";

/** Rain and snow leave different marks, so the surface dial changes its word. */
export const surfaceLabel = (id: WeatherPresetId) =>
  id === "snow" ? "Accumulation" : "Ground wetness";

/** Storm is the only condition with lightning, and lightning isn't built yet —
 *  the spec files it under future support, so the panel says so there and only
 *  there. */
export const HAS_LIGHTNING = (id: WeatherPresetId) => id === "storm";

/* --------------------------------------------------------------- readouts -- */

/** 570 → "09:30". The one place minutes become words. */
export function formatClock(minutes: number): string {
  const m = wrapMinutes(minutes);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** The eight-point compass name for a bearing — "SW" reads faster than "225°". */
const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export const compassPoint = (deg: number) => POINTS[Math.round(bearing(deg) / 45) % 8];

/**
 * Has this state been tuned away from the condition it started as?
 *
 * The preset row shows which condition is selected; this is what lets the
 * summary say "Rain · edited" rather than claiming the scene is stock Rain when
 * eleven sliders have moved since.
 */
export function matchesPreset(w: SceneWeather): boolean {
  const base = applyPreset(w.preset);
  return JSON.stringify(base) === JSON.stringify(w);
}

/**
 * The closed row's one line: the condition, then the two or three facts that
 * most change what a frame looks like.
 *
 * Sun time is always in it — it is the one control here that moves every render
 * whether anything is falling or not.
 */
export function describeWeather(w: SceneWeather): string {
  const parts: string[] = [PRESET_BY_ID[w.preset].label];

  if (HAS_PRECIPITATION(w.preset) && w.precip.amount > 0) {
    parts.push(`${w.precip.amount}%`);
  }
  if (w.wind.speed > 0) {
    parts.push(`${compassPoint(w.wind.directionDeg)} ${w.wind.speed}`);
  }
  if (w.sky.fog.on) parts.push("fog");
  parts.push(formatClock(w.sun.minutes));

  return `${parts.join(" · ")}${matchesPreset(w) ? "" : " · edited"}`;
}

/* ---------------------------------------------------------- saved presets -- */

/**
 * A weather state someone named and kept (§7 of the spec).
 *
 * IN MEMORY FOR NOW. There is no backend to persist to, and a preset library
 * that silently emptied itself on reload would be worse than one the panel
 * admits is session-scoped — so the panel says so rather than implying storage
 * it doesn't have.
 */
export interface SavedWeather {
  id: string;
  name: string;
  state: SceneWeather;
}

let savedCounter = 0;

export function makeSavedWeather(name: string, state: SceneWeather): SavedWeather {
  savedCounter += 1;
  return {
    id: `weather-${savedCounter}`,
    name,
    // Snapshot by value: a saved preset must not keep changing as the scene does.
    state: patchWeather(state, {}),
  };
}

/** "Rain 2" — the next free name in a series, so saving twice doesn't produce
 *  two entries with one name. */
export function nextPresetName(state: SceneWeather, saved: SavedWeather[]): string {
  const stem = PRESET_BY_ID[state.preset].label;
  const taken = new Set(saved.map((s) => s.name));
  if (!taken.has(stem)) return stem;
  let n = 2;
  while (taken.has(`${stem} ${n}`)) n += 1;
  return `${stem} ${n}`;
}
