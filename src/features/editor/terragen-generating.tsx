import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { runPercent, type WorkOrderRun } from "./work-order-runs";
import { dayPhase, describeLayers, formatClock, type SavedTime, type SavedWeather, type SceneWeather } from "./weather";
import type { SavedZoom } from "./camera-rig";

/**
 * THE GENERATING SCREEN — what Dispatch opens onto, for 4.5 seconds.
 * -------------------------------------------------------------------------
 * Confirming the review is the moment the order turns into a dataset, so it
 * gets a beat of its own: a wall of frames building out over the stage, one
 * card per frame up to a limit, each in the conditions its subset was ordered
 * under, and the run's frame count ticking in the corner the editor uses for
 * every other job. Then it hands back to the editor, which lights the Work
 * Orders button — that is where the run is tracked from here. The Work Order
 * panel stays on screen throughout, locked, so the order that was just sent is
 * still readable beside what it is becoming.
 *
 * THE CARDS ARE THE SCENE, NOT THE OUTPUT. Nothing has rendered yet when this
 * opens — the run is minutes long. Each card is the camera preview captured at
 * the moment of dispatch, with its subset's weather and time laid over it as a
 * grade, and the screen says so.
 */

/** How many cards the wall shows at most — enough to fill the stage, few enough to read. */
export const CARD_LIMIT = 24;
/** How long the screen holds before handing back to the editor. */
export const GENERATING_HOLD_MS = 4500;

export interface GenTile {
  weather: string;
  /** which conditions are on, for the grade */
  layers: SceneWeather["layers"];
  minutes: number;
  /** the camera reach this subset is shot at */
  zoom: string;
  /** 0, 1, 2… — the stop along the sweep, as a slightly tighter crop */
  stop: number;
}

/**
 * The frames an order makes, as cards: one per frame up to `count`, walking the
 * subsets (weather × time × zoom) first and then the stops along the sweep. An
 * order of one frame is one card.
 */
export function buildTiles(
  current: SceneWeather,
  savedWeather: SavedWeather[],
  savedTimes: SavedTime[],
  savedZooms: SavedZoom[],
  count: number
): GenTile[] {
  const ws = savedWeather.filter((s) => s.inRun);
  const weathers = ws.length
    ? ws.map((s) => ({ name: s.name, layers: s.state.layers }))
    : [{ name: describeLayers(current), layers: current.layers }];
  const ts = savedTimes.filter((s) => s.inRun);
  const times = ts.length ? ts.map((s) => s.minutes) : [current.sun.minutes];
  const zs = savedZooms.filter((s) => s.inRun);
  const zooms = zs.length ? zs.map((s) => s.name) : ["Default reach"];
  const subsets: GenTile[] = [];
  for (const w of weathers) for (const m of times) for (const z of zooms)
    subsets.push({ weather: w.name, layers: w.layers, minutes: m, zoom: z, stop: 0 });
  const n = Math.max(1, Math.min(CARD_LIMIT, Math.round(count)));
  return Array.from({ length: n }, (_, i) => ({ ...subsets[i % subsets.length], stop: Math.floor(i / subsets.length) }));
}

/** A subset's weather and time, as a grade over the captured preview. */
function gradeOf(t: GenTile) {
  const filters: string[] = [];
  let tint: string | null = null;
  let overlay: "rain" | "snow" | null = null;
  const has = (l: string) => (t.layers as string[]).includes(l);
  if (has("rain")) { filters.push("saturate(.62)", "brightness(.84)", "contrast(1.05)"); overlay = "rain"; }
  else if (has("snow")) { filters.push("saturate(.55)", "brightness(1.1)"); overlay = "snow"; }
  else if (has("cloudy")) filters.push("saturate(.8)", "brightness(.95)");
  if (has("dusty")) filters.push("sepia(.4)", "contrast(.9)");
  const phase = dayPhase(t.minutes);
  if (phase === "Night") { filters.push("brightness(.42)", "saturate(.7)"); tint = "rgba(28,48,112,.42)"; }
  else if (phase === "Dawn" || phase === "Dusk" || phase === "Golden hour") { filters.push("sepia(.22)", "saturate(1.2)"); tint = "rgba(255,122,48,.22)"; }
  return { filter: filters.join(" ") || "none", tint, overlay };
}

const iconFor = (t: GenTile): IconName => {
  const l = t.layers as string[];
  return l.includes("rain") ? "rain" : l.includes("snow") ? "snow" : l.includes("cloudy") ? "cloudy" : l.includes("dusty") ? "dusty" : "sunny";
};

const GAP = 12;
const ASPECT = 16 / 9;
/** The column count that makes `n` 16:9 cards as large as the area allows. */
function fit(n: number, w: number, h: number) {
  let best = { cols: 1, cardW: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cardW = Math.min((w - GAP * (cols - 1)) / cols, ((h - GAP * (rows - 1)) / rows) * ASPECT);
    if (cardW > best.cardW) best = { cols, cardW };
  }
  // A single frame shouldn't fill the whole stage like a hero image.
  return { cols: best.cols, cardW: Math.max(0, n === 1 ? Math.min(best.cardW, w * 0.6) : best.cardW) };
}

export function TerraGenGenerating({
  run,
  snapshot,
  tiles,
  subsets,
  rightInset,
  onDone,
}: {
  /** the run this dispatch started, live from the store; undefined for a moment after confirm */
  run: WorkOrderRun | undefined;
  /** the camera preview at dispatch, or null if the canvas couldn't be read */
  snapshot: string | null;
  tiles: GenTile[];
  subsets: number;
  /** px kept clear on the right for the (locked) Work Order panel */
  rightInset: number;
  /** after the hold: back to the editor */
  onDone: () => void;
}) {
  // The wall builds out over the first ~2.6 s of the hold, however many cards,
  // and then holds full for the rest of it.
  const [shown, setShown] = useState(0);
  const step = Math.min(260, 2300 / tiles.length);
  useEffect(() => {
    if (shown >= tiles.length) return;
    const id = window.setTimeout(() => setShown((k) => k + 1), shown === 0 ? 300 : step);
    return () => window.clearTimeout(id);
  }, [shown, tiles.length, step]);

  // Then back to the editor, which points at Work Orders.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const id = window.setTimeout(() => done.current(), GENERATING_HOLD_MS);
    return () => window.clearTimeout(id);
  }, []);

  // Size the cards to the stage left of the panel.
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { cols, cardW } = fit(tiles.length, box.w, box.h);
  const grades = useMemo(() => tiles.map(gradeOf), [tiles]);

  const pct = run ? runPercent(run) : 0;
  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <div
      data-ui="terragen-generating"
      className="absolute inset-y-0 left-0 z-40 animate-in fade-in-0 bg-[#0d0b0a]/95 duration-300"
      style={{ right: rightInset }}
    >
      {/* the wall, sized to the stage between the top bar and the activity card */}
      <div ref={area} className="absolute inset-x-6 bottom-28 top-24">
        <div
          className="grid h-full content-center justify-center"
          style={{ gridTemplateColumns: `repeat(${cols}, ${cardW}px)`, gap: GAP }}
        >
          {tiles.map((t, i) => {
            const g = grades[i];
            const on = i < shown;
            return (
              <div
                key={i}
                data-ui="generating-card"
                className={cn(
                  "relative aspect-video overflow-hidden rounded-xl bg-black shadow-[0_0_0_1px_rgba(255,255,255,.14),0_14px_34px_rgba(0,0,0,.5)] transition-all duration-500",
                  on ? "scale-100 opacity-100" : "scale-[.9] opacity-0"
                )}
              >
                {snapshot ? (
                  <img
                    src={snapshot}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{
                      filter: g.filter,
                      transform: `scale(${1 + Math.min(t.stop, 4) * 0.12})`,
                      transformOrigin: `${50 + (t.stop % 2 ? 8 : -8) * Math.min(1, t.stop)}% 55%`,
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[.06] to-white/[.01]" />
                )}
                {g.tint && <div className="absolute inset-0 mix-blend-multiply" style={{ background: g.tint }} />}
                {g.overlay === "rain" && (
                  <div className="absolute inset-0 opacity-50 [background:repeating-linear-gradient(105deg,transparent_0_9px,rgba(220,232,245,.35)_9px_10px)]" />
                )}
                {g.overlay === "snow" && (
                  <div className="absolute inset-0 opacity-60 [background:radial-gradient(rgba(255,255,255,.8)_1px,transparent_1.6px)_0_0/14px_14px]" />
                )}
                <div
                  className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/[.07] to-transparent"
                  style={{ animationDelay: `${i * 90}ms` }}
                />
                <span className="absolute left-2 top-1.5 flex items-center gap-1.5 font-mono text-[11px] font-semibold text-white [text-shadow:0_1px_2px_#000]">
                  <i className="h-1.5 w-1.5 rounded-full bg-[#ff3b30]" />
                  CAM {String(t.stop + 1).padStart(2, "0")} · {formatClock(t.minutes)}
                </span>
                {cardW > 150 && (
                  <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10.5px] font-semibold text-white/85">
                    {t.zoom}
                  </span>
                )}
                <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">
                  <Icon name={iconFor(t)} size={11} />
                  {cardW > 120 && t.weather}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* the run, in the corner the editor reports every job in (see EditorActivity) */}
      <div
        data-ui="generating-activity"
        role="status"
        aria-live="polite"
        className="absolute bottom-6 left-6 w-[340px] rounded-2xl border border-white/20 bg-black/90 px-5 py-3.5 text-white shadow-pop backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <Icon name="spinner" size={20} className="shrink-0 animate-spin text-brand" />
          <div className="min-w-0 flex-1">
            <p className="type-body-strong truncate">Generating dataset</p>
            <p className="type-caption truncate text-white/70">
              {n(run?.done ?? 0)} / {n(run?.total ?? 0)} frames · {n(subsets)} {subsets === 1 ? "subset" : "subsets"}
            </p>
          </div>
          <span className="type-numeric-sm shrink-0 tabular-nums text-white/70">{pct}%</span>
        </div>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
      </div>

      <p className="type-caption absolute bottom-7 right-6 max-w-[38%] text-right text-content-subtle">
        Preview of what this order covers, from the dispatched view. The frames arrive in Work Orders.
      </p>
    </div>
  );
}
