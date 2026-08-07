/**
 * SCENE PALETTE — the mode-stable half of Terra's colour system.
 * ------------------------------------------------------------------
 * Terra's colours split by whether they THEME, not by who consumes them:
 *
 *   · Chrome + glass  → CSS custom properties (tokens.css). They invert
 *                       between light and dark, so CSS owns them.
 *   · Scene + content → this file. A 3D scene doesn't invert, and these
 *                       values are consumed by Three.js (needs numbers),
 *                       canvas 2D and SVG (need strings), and the DOM —
 *                       none of which can read a CSS variable without a
 *                       runtime bridge. Keeping them here means nothing
 *                       has to cross that line.
 *
 * Anything added here must be genuinely mode-stable. If a colour should
 * change between light and dark, it belongs in tokens.css instead.
 */

/** Hex string + the 0x number Three.js materials want, from one definition. */
const hex = (s: `#${string}`) => ({ css: s, three: Number.parseInt(s.slice(1), 16) });

/**
 * Axis colours — X red, Y green, Z blue, per the UE 5.8 gizmo spec that
 * `unreal-gizmo.ts` is built around.
 *
 * These were previously declared TWICE under the same name — once here as
 * 0xe83a3a/0x46bf46/0x3a6ee8 for the viewport handles, and once in
 * controls-ui.tsx as #e5675f/#7fae7f/#6f7bd0 for the Position field prefixes.
 * The X you dragged was a different red from the X you typed into. One source
 * now; the UE values won because the viewport is where axis colour carries
 * the most meaning.
 */
export const AXIS = {
  X: hex("#e83a3a"),
  Y: hex("#46bf46"),
  Z: hex("#3a6ee8"),
} as const;

export type Axis = keyof typeof AXIS;

/**
 * Selection + hover outline shells (SceneObjectMesh).
 *
 * `master` is deliberately the same value as the `--master` token in
 * tokens.css (hsl(45 93% 58%) === #f8c630) — a Master Object reads yellow in
 * the panel and yellow in the viewport. It lives here rather than being read
 * from CSS because the outline must NOT follow the light theme's darker
 * `--master`; a 3D outline is judged against the scene, not the chrome.
 * If you retune one, retune the other.
 */
export const OUTLINE = {
  selected: hex("#ffffff"),
  hover: hex("#d8d8d8"),
  master: hex("#f8c630"),
  masterDim: hex("#c79c25"),
} as const;

/**
 * The object title's luminance-adaptive pair. The title sits IN the scene, so
 * it can't pick a colour from the theme — it samples what's actually behind it
 * and flips. Each variant carries its own ink, rule and contrasting shadow;
 * they must be swapped together or the shadow fights the ink.
 */
export const SCENE_LABEL = {
  /** backdrop sampled bright → dark ink, light halo */
  onBright: {
    ink: "#17130e",
    rule: "rgba(23,19,14,0.7)",
    shadow: "0 1px 14px rgba(255,255,255,0.45), 0 1px 2px rgba(255,255,255,0.5)",
  },
  /** backdrop sampled dark → light ink, dark halo */
  onDark: {
    ink: "#ffffff",
    rule: "rgba(255,255,255,0.8)",
    shadow: "0 3px 22px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.5)",
  },
  /** the ⓘ mark's drop shadow — same job as `shadow`, but on a glyph */
  markShadow: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))",
} as const;

/** The gizmo's live transform readout chip, floating next to the handle. */
export const READOUT = {
  bg: "rgba(12,12,12,0.82)",
  border: "rgba(255,255,255,0.16)",
  ink: "#fff",
} as const;

/** The orientation cube in the top-right corner (drei GizmoViewcube). */
export const VIEWCUBE = {
  face: "#68635b",
  text: "#f5f2ec",
  stroke: "#00000040",
  hover: "#d97a2b",
} as const;

/**
 * Object base colours — the Texture → Color swatches, and the vocabulary the
 * AI assistant maps colour words onto. These were two overlapping lists
 * (OBJECT_COLORS in scene-types.ts and COLORS in AiChatPanel.tsx) sharing six
 * exact hex values but maintained separately, so asking for "red" and picking
 * red from the swatches agreed only by coincidence. One list now, named, with
 * the swatch order and the AI lookup both derived from it.
 */
export const OBJECT_COLORS = [
  { name: "gray", hex: "#9a958f", label: "Warm gray" },
  { name: "orange", hex: "#c98a5a", label: "Terracotta" },
  { name: "blue", hex: "#6f7bd0", label: "Indigo" },
  { name: "green", hex: "#7fae7f", label: "Moss" },
  { name: "sand", hex: "#d8b98a", label: "Sand" },
  { name: "purple", hex: "#c77fb0", label: "Orchid" },
  { name: "teal", hex: "#2f6f7a", label: "Teal" },
  { name: "red", hex: "#e5675f", label: "Rose" },
] as const;

/** Swatch order for the Color tab — the first entry is the default. */
export const OBJECT_SWATCHES = OBJECT_COLORS.map((c) => c.hex);
export const DEFAULT_OBJECT_COLOR = OBJECT_COLORS[0].hex;

/**
 * Colour words the AI assistant understands, built from OBJECT_COLORS plus the
 * extras that have no swatch of their own. Anything the assistant can name is
 * a colour the Color tab can also produce.
 */
export const COLOR_WORDS: Record<string, string> = {
  ...Object.fromEntries(OBJECT_COLORS.map((c) => [c.name, c.hex])),
  yellow: "#e6c15f",
  pink: "#e08ab0",
  brown: "#8a6a4a",
  white: "#e8e4de",
  black: "#2a2a2a",
  grey: "#9a958f", // en-GB alias for `gray`
};

/**
 * Project cover gradients — content, not chrome. Each is a three-stop 160°
 * ramp: a deep base, a mid at the midpoint, and a light crest.
 */
export const COVER_GRADIENTS = [
  ["#3f6f3a", "#6ea94a", "#8fc95e", 45],
  ["#c1521f", "#e08a2b", "#f0b352", 50],
  ["#7b3fb0", "#c05aa8", "#e58fb0", 50],
  ["#25607a", "#3f9bb0", "#7fd0c9", 50],
  ["#4a5d2a", "#7fa23e", "#b9cf6a", 50],
].map(([base, mid, crest, stop]) => `linear-gradient(160deg,${base},${mid} ${stop}%,${crest})`);

/**
 * AssetThumb's seeded mini-scene recipe. The thumbnail's gradient is generated
 * from the asset's seed rather than picked from a list, so what's tokenised is
 * the RECIPE — the hue offsets and the saturation/lightness each band sits at.
 */
export const THUMB = {
  /** degrees added to the seed hue for each band */
  hueShift: { skyBottom: 28, hillNear: 20, hillFar: 10, sun: 40 },
  /** `S% L%` for each band, applied to the shifted hue */
  band: {
    skyTop: "58% 64%",
    skyBottom: "52% 42%",
    hillNear: "46% 26%",
    hillFar: "42% 36%",
    sun: "90% 80%",
  },
  /** neutral overlays — vignette, mesh backdrop, horizon seam, play scrim */
  vignette: 0.28,
  meshBackdrop: 0.28,
  horizonSeam: 0.35,
  playScrim: 0.35,
} as const;
