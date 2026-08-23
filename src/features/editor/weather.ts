/**
 * SCENE WEATHER — the atmosphere the scene is standing in.
 * ------------------------------------------------------------------
 * CONDITIONS COMBINE, AND EACH ONE OWNS ONE OR TWO DIALS.
 *
 * The first cut of this was five mutually-exclusive presets, each swapping in a
 * COMPLETE state: eleven sliders across Precipitation, Wind, Atmosphere and
 * Lighting, most of which said nothing about the condition you had picked.
 * Choosing Rain set a cloud density. Choosing Sunny left a rain amount in state,
 * hidden by the panel and live in the render.
 *
 * Two things were wrong with that, and both are the same thing:
 *
 *   · A CONDITION IS NOT A WHOLE SKY. "Rain" is a statement about water falling
 *     and ground staying wet. It has no opinion on cloud density, and pretending
 *     it did meant every preset had to answer questions it wasn't asked.
 *   · REAL WEATHER IS ADDITIVE. A dataset wants rain under heavy cloud, or snow
 *     in low sun. One-of-five could not say that, so the thing you'd actually
 *     want to render was the thing the model couldn't express.
 *
 * So: conditions are LAYERS you switch on independently, each carrying only the
 * dials it genuinely owns (see `WEATHER_LAYERS`). Wind and Lighting stay as
 * their own groups because they apply whatever is falling.
 *
 * WEATHER IS AN AXIS AGAIN — but not the one it used to be. The old axis
 * permuted CONDITION NAMES, which is why it was removed: it could say "render
 * this rainy AND snowy" but not what rainy meant. What multiplies now is a SET —
 * a named, fully-authored combination — so a run can sweep "Overcast Drizzle"
 * against "Bright Noon" with every dial in both of them pinned down. See
 * `SavedWeather.inRun`, and `computeTotals` in work-order.ts.
 *
 * Kept out of React for the same reason `camera-rig.ts` is: presets, clamps and
 * the "has this drifted" comparison are decisions about values, testable without
 * mounting anything.
 */

import type { IconName } from "@/components/icons";

/* ---------------------------------------------------------------- layers -- */

export type WeatherLayerId = "sunny" | "cloudy" | "rain" | "dusty" | "snow";

/** One slider a condition owns. */
export interface WeatherDial {
  /** unique within its layer — the state key is `${layer}.${key}` */
  key: string;
  label: string;
  /** where the dial sits when the layer is first switched on */
  def: number;
}

export interface WeatherLayerMeta {
  id: WeatherLayerId;
  label: string;
  icon: IconName;
  /** what this condition is, on the tile */
  blurb: string;
  /**
   * The one or two dials this condition owns — and NOTHING else.
   *
   * Two is the cap on purpose. A condition that needs three is a condition
   * doing two jobs, and the panel it produced last time was the one this
   * rewrite exists to delete.
   */
  dials: WeatherDial[];
}

/**
 * The five conditions, clearest sky first so the row reads as a ramp.
 *
 * `dusty` replaced `storm`. Storm was Rain with the dials turned up — the same
 * two statements, louder — which is exactly the redundancy combining removes:
 * you get a storm now by switching Rain on and pushing it. Dust is a condition
 * nothing else in the set can express.
 */
export const WEATHER_LAYERS: WeatherLayerMeta[] = [
  {
    id: "sunny",
    label: "Sunny",
    icon: "sunny",
    blurb: "Clear sky, hard light",
    dials: [{ key: "brightness", label: "Sky brightness", def: 90 }],
  },
  {
    id: "cloudy",
    label: "Cloudy",
    icon: "cloudy",
    blurb: "Overcast, soft light",
    dials: [{ key: "coverage", label: "Cloud coverage", def: 75 }],
  },
  {
    id: "rain",
    label: "Rain",
    icon: "rain",
    blurb: "Falling rain, wet ground",
    dials: [
      { key: "amount", label: "Rain amount", def: 60 },
      { key: "wetness", label: "Wetness level", def: 55 },
    ],
  },
  {
    id: "dusty",
    label: "Dusty",
    icon: "dusty",
    blurb: "Airborne dust, hazy light",
    dials: [{ key: "amount", label: "Dust amount", def: 50 }],
  },
  {
    id: "snow",
    label: "Snow",
    icon: "snow",
    blurb: "Falling snow, settling",
    dials: [
      { key: "amount", label: "Snow amount", def: 55 },
      { key: "coverage", label: "Snow coverage", def: 70 },
    ],
  },
];

export const LAYER_BY_ID: Record<WeatherLayerId, WeatherLayerMeta> = WEATHER_LAYERS.reduce(
  (acc, l) => ({ ...acc, [l.id]: l }),
  {} as Record<WeatherLayerId, WeatherLayerMeta>
);

/** The state key for one dial. Flat, so a value survives its layer being
 *  switched off and comes back where you left it. */
export const dialId = (layer: WeatherLayerId, key: string) => `${layer}.${key}`;

/* ----------------------------------------------------------------- shape -- */

export interface Wind {
  speed: number;
  /** bearing in degrees, 0 = North, clockwise */
  directionDeg: number;
  /** how far wind bends what's falling — 0% vertical, 100% near-horizontal */
  rainInfluence: number;
}

export interface Sun {
  /** minutes from midnight, 0–1439 — the sun's position in the day */
  minutes: number;
  intensity: number;
  /** how dark the shadows land */
  shadow: number;
}

/** Every dial in the panel, keyed `${layer}.${dial}`. */
export type WeatherValues = Record<string, number>;

export interface SceneWeather {
  /**
   * Which conditions are on. An ARRAY rather than a set of flags, in tile
   * order, because the order they're listed in is the order the summary reads
   * them and the order their dial groups stack.
   */
  layers: WeatherLayerId[];
  /**
   * Dial values for EVERY layer, not just the active ones. A layer switched off
   * and back on comes back as you left it — losing a tuned rain amount because
   * you toggled cloud off for a look is the kind of thing that makes people
   * stop toggling.
   */
  values: WeatherValues;
  wind: Wind;
  sun: Sun;
}

/* --------------------------------------------------------------- defaults -- */

export function defaultValues(): WeatherValues {
  const out: WeatherValues = {};
  for (const layer of WEATHER_LAYERS) {
    for (const d of layer.dials) out[dialId(layer.id, d.key)] = d.def;
  }
  return out;
}

/** Where a scene starts. Sunny at midday — the neutral read of a new scene. */
export const DEFAULT_WEATHER: SceneWeather = {
  layers: ["sunny"],
  values: defaultValues(),
  wind: { speed: 10, directionDeg: 90, rainInfluence: 0 },
  sun: { minutes: 12 * 60, intensity: 95, shadow: 80 },
};

/* ---------------------------------------------------------------- clamps -- */

const clamp = (v: number, lo: number, hi: number) =>
  Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;

/** 0–100, the range every dial in the panel runs on. */
const pct = (v: number) => clamp(Math.round(v), 0, 100);

/** Bearings wrap rather than clamp — dragging the compass past North must come
 *  round to 1°, not stick at 360°. */
const bearing = (v: number) => (Number.isFinite(v) ? ((Math.round(v) % 360) + 360) % 360 : 0);

/** Minutes wrap the same way, so scrubbing off the end of the day rolls over. */
export const wrapMinutes = (v: number) =>
  Number.isFinite(v) ? ((Math.round(v) % 1440) + 1440) % 1440 : 0;

export interface WeatherPatch {
  layers?: WeatherLayerId[];
  values?: WeatherValues;
  wind?: Partial<Wind>;
  sun?: Partial<Sun>;
}

/**
 * A patch, clamped into a whole valid state.
 *
 * Written group-by-group rather than as a deep merge: each group has its own
 * legal range, and a generic merge would happily write a 4,000-minute sun.
 */
export function patchWeather(prev: SceneWeather, patch: WeatherPatch): SceneWeather {
  const w = patch.wind;
  const u = patch.sun;

  // Unknown keys are dropped rather than clamped in: `values` is addressed by
  // string, so a typo would otherwise become a permanent invisible entry.
  const values: WeatherValues = { ...prev.values };
  if (patch.values) {
    for (const [k, v] of Object.entries(patch.values)) {
      if (k in values) values[k] = pct(v);
    }
  }

  return {
    layers: patch.layers ? WEATHER_LAYERS.filter((l) => patch.layers!.includes(l.id)).map((l) => l.id) : prev.layers,
    values,
    wind: {
      speed: pct(w?.speed ?? prev.wind.speed),
      directionDeg: bearing(w?.directionDeg ?? prev.wind.directionDeg),
      rainInfluence: pct(w?.rainInfluence ?? prev.wind.rainInfluence),
    },
    sun: {
      minutes: wrapMinutes(u?.minutes ?? prev.sun.minutes),
      intensity: pct(u?.intensity ?? prev.sun.intensity),
      shadow: pct(u?.shadow ?? prev.sun.shadow),
    },
  };
}

/**
 * Switch one condition on or off.
 *
 * The last one on can't be switched off: a scene with no condition at all has
 * no sky to render, and an empty tile row is a state nobody chose and can't
 * read anything out of.
 */
export function toggleLayer(w: SceneWeather, id: WeatherLayerId): SceneWeather {
  const on = w.layers.includes(id);
  if (on && w.layers.length === 1) return w;
  const next = on ? w.layers.filter((l) => l !== id) : [...w.layers, id];
  return patchWeather(w, { layers: next });
}

/** Put every dial of the active conditions back where its condition starts. */
export function resetLayers(w: SceneWeather): SceneWeather {
  const values = { ...w.values };
  for (const id of w.layers) {
    for (const d of LAYER_BY_ID[id].dials) values[dialId(id, d.key)] = d.def;
  }
  return { ...w, values };
}

/* --------------------------------------------------------------- readouts -- */

/** 570 → "09:30". The one place minutes become words. */
export function formatClock(minutes: number): string {
  const m = wrapMinutes(minutes);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** The eight-point compass name for a bearing — "SW" reads faster than "225°". */
const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export const compassPoint = (deg: number) => POINTS[Math.round(bearing(deg) / 45) % 8];

/** "Sunny + Rain" — the conditions in tile order. */
export const describeLayers = (w: SceneWeather): string =>
  w.layers.map((l) => LAYER_BY_ID[l].label).join(" + ") || "No condition";

/**
 * The closed row's one line: what's on, then the two facts that most change
 * what a frame looks like.
 *
 * Sun time is always in it — it is the one control here that moves every render
 * whether anything is falling or not.
 */
export function describeWeather(w: SceneWeather): string {
  const parts: string[] = [describeLayers(w)];
  if (w.wind.speed > 0) parts.push(`${compassPoint(w.wind.directionDeg)} ${w.wind.speed}`);
  parts.push(formatClock(w.sun.minutes));
  return parts.join(" · ");
}

/* -------------------------------------------------------------- saved sets */

/**
 * A weather combination someone named and kept.
 *
 * `inRun` is what makes this more than a bookmark. A set with it on is a value
 * on the weather axis: the run renders every subset once per checked set, so
 * three sets is three passes over the whole sweep. That is expensive on purpose
 * and priced where everything else is — the budget panel — rather than being a
 * silent property of a saved item.
 *
 * IN MEMORY FOR NOW. There is no backend to persist to, and a set library that
 * silently emptied itself on reload would be worse than one the panel admits is
 * session-scoped — so the panel says so rather than implying storage it hasn't
 * got.
 */
export interface SavedWeather {
  id: string;
  name: string;
  state: SceneWeather;
  /** this set is one of the values the run sweeps */
  inRun: boolean;
}

let savedCounter = 0;

export function makeSavedWeather(name: string, state: SceneWeather): SavedWeather {
  savedCounter += 1;
  return {
    id: `weather-${savedCounter}`,
    name,
    // Snapshot by value: a saved set must not keep changing as the scene does.
    state: patchWeather(state, {}),
    // Saving is how you build the sweep, so a new set joins it. Un-checking is
    // one click; noticing a set you saved did nothing is not.
    inRun: true,
  };
}

/** "Sunny + Rain 2" — the next free name in a series, so saving twice doesn't
 *  produce two entries with one name. */
export function nextPresetName(state: SceneWeather, saved: SavedWeather[]): string {
  const stem = describeLayers(state);
  const taken = new Set(saved.map((s) => s.name));
  if (!taken.has(stem)) return stem;
  let n = 2;
  while (taken.has(`${stem} ${n}`)) n += 1;
  return `${stem} ${n}`;
}
