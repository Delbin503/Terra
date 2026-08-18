import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui";
import { Pill } from "./ui";
import { Check, Dial, Switch } from "./terragen-parts";
import {
  HAS_LIGHTNING,
  HAS_PRECIPITATION,
  WEATHER_PRESETS,
  compassPoint,
  formatClock,
  matchesPreset,
  surfaceLabel,
  type SceneWeather,
  type WeatherPresetId,
} from "./weather";
import type { SceneApi } from "./useScene";

/**
 * WEATHER & LIGHTING — one atmosphere, authored in detail, revealed on demand.
 * ------------------------------------------------------------------
 * This replaced two axis editors (a five-condition weather multi-select and a
 * set-of-clock-times Time of Day). Both authored LISTS; neither could say what
 * a condition MEANT. The controls a weather system needs describe one
 * configuration in ~16 parameters — so that is what this section collects.
 *
 * WHY IT CARRIES NO SWITCH. It is the third scene section, beside Master Object
 * and Camera Settings: it edits the SCENE rather than the order, and multiplies
 * nothing. Turning weather "on" is meaningless when there is exactly one of it.
 *
 * WHY THE DETAIL IS FOLDED AWAY. Sixteen sliders open at once is a wall, and the
 * first-run answer is almost always "pick a condition and go" — the preset
 * already sets sensible values for everything underneath. So the five condition
 * tiles are the only thing shown by default; Precipitation, Wind, Atmosphere and
 * Lighting each collapse to a one-line summary and open only when someone wants
 * to tune them. One is open at a time, the way the dock's own sections are.
 */
export function WeatherSection({ scene }: { scene: SceneApi }) {
  const w = scene.weather;
  const wet = HAS_PRECIPITATION(w.preset);

  // All folds closed on open — the simplest first read. A preset carries the
  // whole state, so a user who only picks a condition never has to touch these.
  const [fold, setFold] = useState<FoldId | null>(null);
  const toggle = (id: FoldId) => setFold((f) => (f === id ? null : id));

  return (
    <div data-ui="terragen-editor-weather">
      <PresetRow preset={w.preset} edited={!matchesPreset(w)} onPick={scene.setWeatherPreset} />

      <div className="mt-4">
        {wet && (
          <Fold
            id="precip"
            icon="rain"
            title="Precipitation"
            summary={`${w.precip.amount}% · ${surfaceLabel(w.preset).toLowerCase()} ${w.precip.surface}%`}
            open={fold === "precip"}
            onToggle={() => toggle("precip")}
          >
            <PrecipitationBody weather={w} scene={scene} />
          </Fold>
        )}

        <Fold
          id="wind"
          icon="wind"
          title="Wind"
          summary={w.wind.speed === 0 ? "Calm" : `${compassPoint(w.wind.directionDeg)} · ${w.wind.speed}`}
          open={fold === "wind"}
          onToggle={() => toggle("wind")}
        >
          <WindBody weather={w} scene={scene} enabled={wet} />
        </Fold>

        <Fold
          id="atmosphere"
          icon="cloudy"
          title="Atmosphere"
          summary={`${w.sky.cloudCoverage}% cloud · ${w.sky.fog.on ? "fog" : "no fog"}`}
          open={fold === "atmosphere"}
          onToggle={() => toggle("atmosphere")}
        >
          <AtmosphereBody weather={w} scene={scene} />
        </Fold>

        <Fold
          id="lighting"
          icon="render-time"
          title="Lighting"
          summary={`${formatClock(w.sun.minutes)} · sun ${w.sun.intensity}%`}
          open={fold === "lighting"}
          onToggle={() => toggle("lighting")}
        >
          <LightingBody weather={w} scene={scene} />
        </Fold>
      </div>

      <PresetFooter weather={w} scene={scene} />
    </div>
  );
}

type FoldId = "precip" | "wind" | "atmosphere" | "lighting";

/* --------------------------------------------------------------- the fold -- */

/**
 * One collapsible sub-section. Lighter than the dock's outer `Section` — a
 * divider and a chevron, not a filled card — so the groups read as contents of
 * the weather card rather than as cards stacked inside a card.
 */
function Fold({
  id,
  icon,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: FoldId;
  icon: IconName;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-glass/10 first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        data-ui={`terragen-weather-fold-${id}`}
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 py-3 text-left"
      >
        <Icon name={icon} size={15} className={cn("shrink-0", open ? "text-brand" : "text-content-subtle")} />
        <span className="min-w-0 grow">
          <span className="type-body-strong block truncate text-content">{title}</span>
          {!open && (
            <span className="type-caption block truncate text-content-subtle">{summary}</span>
          )}
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className={cn("shrink-0 text-content-subtle transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- presets -- */

/**
 * The five conditions, as tiles — the one control that is always visible.
 *
 * Picking one REPLACES the whole state rather than patching it, so a condition
 * always looks like itself the first time you choose it. "Edited" is how the row
 * stays honest once the sliders underneath have moved it off the preset.
 */
function PresetRow({
  preset,
  edited,
  onPick,
}: {
  preset: WeatherPresetId;
  edited: boolean;
  onPick: (id: WeatherPresetId) => void;
}) {
  return (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="type-eyebrow text-content-muted">Condition</h3>
        {edited && <span className="type-caption shrink-0 text-content-subtle">Edited</span>}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {WEATHER_PRESETS.map((p) => {
          const on = p.id === preset;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              title={p.blurb}
              data-ui={`terragen-weather-${p.id}`}
              onClick={() => onPick(p.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 transition-colors",
                on
                  ? "border-brand bg-brand/12 text-content"
                  : "border-glass/12 bg-glass/6 text-content-muted hover:border-glass/25 hover:text-content"
              )}
            >
              <Icon name={p.icon} size={18} className={on ? "text-brand" : undefined} />
              <span className="type-caption-strong truncate">{p.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ---------------------------------------------------------- precipitation -- */

function PrecipitationBody({ weather, scene }: { weather: SceneWeather; scene: SceneApi }) {
  const p = weather.precip;
  const set = (patch: Partial<typeof p>) => scene.setWeather({ precip: patch });
  // Below the amount everything describes particles that exist; at zero there
  // are none, so the rest is authoring behaviour for nothing.
  const falling = p.amount > 0;

  return (
    <div className="space-y-2.5">
      <Dial label="Amount" value={p.amount} suffix="%" onChange={(v) => set({ amount: v })} />
      <Dial label="Speed" value={p.speed} disabled={!falling} onChange={(v) => set({ speed: v })} />
      <Dial label="Particle size" value={p.size} disabled={!falling} onChange={(v) => set({ size: v })} />
      <Dial
        label={surfaceLabel(weather.preset)}
        value={p.surface}
        suffix="%"
        onChange={(v) => set({ surface: v })}
      />

      <div className="pt-1">
        <FieldLabel>Direction</FieldLabel>
        <div className="flex items-start gap-3">
          <Vector2Pad
            label="Fall direction"
            value={p.direction}
            disabled={!falling}
            ui="terragen-precip-direction"
            onChange={(direction) => set({ direction })}
          />
          <div className="grow space-y-2.5 pt-1">
            <Dial
              label="Horizontal"
              value={p.direction[0]}
              min={-100}
              max={100}
              suffix="°"
              disabled={!falling}
              onChange={(v) => set({ direction: [v, p.direction[1]] })}
            />
            <Dial
              label="Vertical"
              value={p.direction[1]}
              min={-100}
              max={100}
              suffix="°"
              disabled={!falling}
              onChange={(v) => set({ direction: [p.direction[0], v] })}
            />
          </div>
        </div>
      </div>

      {/* Wetness/accumulation are MATERIAL effects nothing renders yet — say so
          rather than shipping a control that quietly does nothing. */}
      <p className="type-caption flex items-start gap-1.5 pt-1 text-content-subtle">
        <Icon name="info" size={13} className="mt-px shrink-0" />
        <span>
          {surfaceLabel(weather.preset)} is carried in the Work Order and applied at render.
        </span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- wind -- */

function WindBody({
  weather,
  scene,
  enabled,
}: {
  weather: SceneWeather;
  scene: SceneApi;
  /** something is falling for the wind to bend */
  enabled: boolean;
}) {
  const wind = weather.wind;
  const set = (patch: Partial<typeof wind>) => scene.setWeather({ wind: patch });

  return (
    <div>
      <div className="flex items-start gap-3">
        <Compass value={wind.directionDeg} ui="terragen-wind-direction" onChange={(directionDeg) => set({ directionDeg })} />
        <div className="grow space-y-2.5 pt-1">
          <Dial label="Speed" value={wind.speed} onChange={(v) => set({ speed: v })} />
          <Dial
            label="Rain influence"
            value={wind.rainInfluence}
            suffix="%"
            disabled={!enabled}
            onChange={(v) => set({ rainInfluence: v })}
          />
        </div>
      </div>
      {!enabled && (
        <p className="type-caption mt-2 text-content-subtle">
          Rain influence needs precipitation — it bends what's falling.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- atmosphere -- */

function AtmosphereBody({ weather, scene }: { weather: SceneWeather; scene: SceneApi }) {
  const sky = weather.sky;

  return (
    <div className="space-y-2.5">
      <Dial
        label="Cloud coverage"
        value={sky.cloudCoverage}
        suffix="%"
        onChange={(v) => scene.setWeather({ sky: { cloudCoverage: v } })}
      />
      <Dial
        label="Cloud density"
        value={sky.cloudDensity}
        suffix="%"
        onChange={(v) => scene.setWeather({ sky: { cloudDensity: v } })}
      />
      <Dial
        label="Sky brightness"
        value={sky.brightness}
        suffix="%"
        onChange={(v) => scene.setWeather({ sky: { brightness: v } })}
      />

      <div className="rounded-xl border border-glass/12 bg-glass/6 p-2.5">
        <div className="flex items-center gap-2.5">
          <Icon name="fog" size={15} className={cn("shrink-0", sky.fog.on ? "text-brand" : "text-content-subtle")} />
          <span className="type-body grow text-content">Fog</span>
          <Switch
            label="Fog"
            on={sky.fog.on}
            ui="terragen-fog-switch"
            onToggle={() => scene.setWeather({ sky: { fog: { on: !sky.fog.on } } })}
          />
        </div>

        {sky.fog.on && (
          <div className="mt-2.5 space-y-2.5 border-t border-glass/12 pt-2.5">
            <Dial label="Density" value={sky.fog.density} suffix="%" onChange={(v) => scene.setWeather({ sky: { fog: { density: v } } })} />
            <Dial label="Distance" value={sky.fog.distance} onChange={(v) => scene.setWeather({ sky: { fog: { distance: v } } })} />
          </div>
        )}
      </div>

      {HAS_LIGHTNING(weather.preset) && (
        <Check label="Lightning" checked={false} disabled comingSoon onChange={() => {}} />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- lighting -- */

/**
 * Sun position, as a time of day. Where the old Time of Day axis went — it
 * authored a SET of times, each a full re-render; this authors the one time the
 * scene is standing in. Minutes from midnight, because that is what sorts.
 */
function LightingBody({ weather, scene }: { weather: SceneWeather; scene: SceneApi }) {
  const sun = weather.sun;

  return (
    <div>
      <div className="mb-3 rounded-xl border border-glass/12 bg-glass/6 p-3">
        <div className="relative mb-2 h-7 overflow-hidden rounded-lg bg-canvas/40">
          <div
            aria-hidden
            className="absolute inset-0 opacity-70"
            style={{
              background:
                "linear-gradient(90deg, hsl(var(--canvas)) 0%, hsl(var(--brand) / 0.25) 25%, hsl(var(--accent) / 0.35) 50%, hsl(var(--brand) / 0.25) 75%, hsl(var(--canvas)) 100%)",
            }}
          />
          <span aria-hidden className="absolute inset-y-0 w-0.5 bg-content" style={{ left: `${(sun.minutes / 1440) * 100}%` }} />
          {[6, 12, 18].map((h) => (
            <span
              key={h}
              aria-hidden
              className="type-caption absolute bottom-0 -translate-x-1/2 text-content-subtle"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {h}:00
            </span>
          ))}
        </div>

        <input
          type="range"
          aria-label="Sun position — time of day"
          aria-valuetext={formatClock(sun.minutes)}
          data-ui="terragen-sun-time"
          min={0}
          max={1425}
          step={15}
          value={sun.minutes}
          onChange={(e) => scene.setWeather({ sun: { minutes: Number(e.target.value) } })}
          className="h-1 w-full cursor-pointer accent-brand"
        />
      </div>

      <div className="space-y-2.5">
        <Dial label="Sun intensity" value={sun.intensity} suffix="%" onChange={(v) => scene.setWeather({ sun: { intensity: v } })} />
        <Dial label="Shadow intensity" value={sun.shadow} suffix="%" onChange={(v) => scene.setWeather({ sun: { shadow: v } })} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- preset footer -- */

/**
 * Reset and Save, plus whatever's been kept this session. Session-scoped, and it
 * says so: there is no backend to persist to.
 */
function PresetFooter({ weather, scene }: { weather: SceneWeather; scene: SceneApi }) {
  const saved = scene.savedWeather;

  return (
    <div className="mt-1 border-t border-glass/10 pt-3">
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="grow"
          data-ui="terragen-weather-reset"
          disabled={matchesPreset(weather)}
          onClick={scene.resetWeather}
        >
          {/* Quiet outline, not a bright glyph — the icon is a hint beside the
              word, not a second thing competing with it. */}
          <Icon name="retry" size={15} className="text-content-subtle" />
          Reset
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="grow"
          data-ui="terragen-weather-save"
          onClick={() => scene.saveWeather()}
        >
          <Icon name="save" size={15} className="text-content-subtle" />
          Save preset
        </Button>
      </div>

      {saved.length > 0 && (
        <>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {saved.map((s) => (
              <span
                key={s.id}
                data-ui={`terragen-weather-saved-${s.id}`}
                className="type-body-dense flex items-center gap-1.5 rounded-lg border border-glass/15 bg-glass/8 py-1.5 pl-2.5 pr-1.5 text-content"
              >
                <button type="button" title={`Load ${s.name}`} onClick={() => scene.loadWeather(s.id)} className="transition-colors hover:text-brand">
                  {s.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => scene.deleteWeather(s.id)}
                  className="grid h-4 w-4 place-items-center rounded text-content-muted transition-colors hover:bg-glass/20 hover:text-danger"
                >
                  <Icon name="close" size={11} />
                </button>
              </span>
            ))}
          </div>
          <p className="type-caption mt-2 text-content-subtle">Saved presets last for this session.</p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- primitives -- */

/** A sub-label inside a fold body — matches the eyebrow rhythm without the
 *  `Group`'s vertical margin, which a fold already provides. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="type-caption mb-2 block text-content-muted">{children}</span>;
}

/** How close to a cardinal a drag has to land before it snaps to it. */
const SNAP_DEG = 6;
const CARDINALS = [
  { label: "N", deg: 0 },
  { label: "E", deg: 90 },
  { label: "S", deg: 180 },
  { label: "W", deg: 270 },
] as const;

/**
 * THE WIND ROSE — a bearing, set by pointing at it.
 *
 * A bearing is a direction, and a 0–360 slider is not one: at the ends of its
 * track North sits twice, pixels from West and from East. So the control is the
 * shape of the answer. It stays a `slider` to assistive tech — one value on a
 * continuous range — with `aria-valuetext` carrying the compass point.
 */
function Compass({
  value,
  onChange,
  ui,
}: {
  value: number;
  onChange: (deg: number) => void;
  ui: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const bearingAt = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    // Dead zone at the pivot: a click there has no direction, and atan2
    // amplifies a 1px tremor into a 180° swing.
    if (Math.hypot(dx, dy) < 8) return null;
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const wrapped = ((Math.round(deg) % 360) + 360) % 360;
    const near = CARDINALS.find((c) => Math.abs(((wrapped - c.deg + 540) % 360) - 180) > 180 - SNAP_DEG);
    return near ? near.deg : wrapped;
  }, []);

  const track = (e: React.PointerEvent) => {
    const deg = bearingAt(e.clientX, e.clientY);
    if (deg != null) onChange(deg);
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Wind direction"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={value}
      aria-valuetext={`${compassPoint(value)}, ${value} degrees`}
      data-ui={ui}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        track(e);
      }}
      onPointerMove={(e) => dragging && track(e)}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 90 : 15;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          onChange(value + step);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(value - step);
        }
      }}
      className="relative h-[92px] w-[92px] shrink-0 cursor-pointer touch-none rounded-full border border-glass/15 bg-canvas/40 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {CARDINALS.map((c) => (
        <span
          key={c.label}
          aria-hidden
          className={cn(
            "type-caption absolute text-content-subtle",
            c.label === "N" && "left-1/2 top-1 -translate-x-1/2",
            c.label === "S" && "bottom-1 left-1/2 -translate-x-1/2",
            c.label === "E" && "right-1.5 top-1/2 -translate-y-1/2",
            c.label === "W" && "left-1.5 top-1/2 -translate-y-1/2"
          )}
        >
          {c.label}
        </span>
      ))}

      <span aria-hidden className="absolute inset-0 transition-transform duration-75" style={{ transform: `rotate(${value}deg)` }}>
        <span className="absolute left-1/2 top-[17px] h-[29px] w-0.5 -translate-x-1/2 rounded-full bg-brand" />
        <span className="absolute left-1/2 top-[13px] h-2 w-2 -translate-x-1/2 rounded-full bg-brand" />
      </span>

      <span aria-hidden className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-content-subtle" />
    </div>
  );
}

/**
 * THE FALL PAD — two leans, set at once. Rain toward the camera and rain
 * crossing the frame are different pictures, so the fall angle is a pair; the
 * pad shows the resultant, the sliders beside it stay the precise, accessible
 * way to set each half.
 */
function Vector2Pad({
  label,
  value,
  onChange,
  disabled,
  ui,
}: {
  label: string;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  disabled?: boolean;
  ui: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const at = (clientX: number, clientY: number): [number, number] | null => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 200 - 100;
    const y = ((clientY - r.top) / r.height) * 200 - 100;
    const clamp = (v: number) => Math.max(-100, Math.min(100, Math.round(v)));
    return [clamp(x), clamp(y)];
  };

  const track = (e: React.PointerEvent) => {
    const next = at(e.clientX, e.clientY);
    if (next) onChange(next);
  };

  return (
    <div
      ref={ref}
      aria-hidden
      title={disabled ? undefined : label}
      data-ui={ui}
      onPointerDown={
        disabled
          ? undefined
          : (e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(true);
              track(e);
            }
      }
      onPointerMove={disabled ? undefined : (e) => dragging && track(e)}
      onPointerUp={
        disabled
          ? undefined
          : (e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              setDragging(false);
            }
      }
      className={cn(
        "relative h-[92px] w-[92px] shrink-0 touch-none rounded-xl border border-glass/15 bg-canvas/40",
        disabled ? "pointer-events-none opacity-45" : "cursor-crosshair"
      )}
    >
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-glass/12" />
      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-glass/12" />
      <span
        className="absolute h-2.5 w-2.5 rounded-full border-2 border-brand bg-canvas"
        style={{
          left: `calc(${((value[0] + 100) / 200) * 100}% - 5px)`,
          top: `calc(${((value[1] + 100) / 200) * 100}% - 5px)`,
        }}
      />
    </div>
  );
}

/** The closed row's badge — the sun time, at a glance. */
export function WeatherPill({ weather }: { weather: SceneWeather }) {
  return (
    <Pill ui="weather-condition" tone="muted">
      {formatClock(weather.sun.minutes)}
    </Pill>
  );
}
