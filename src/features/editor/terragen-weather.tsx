import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { Pill } from "./ui";
import { Dial } from "./terragen-parts";
import {
  LAYER_BY_ID,
  WEATHER_LAYERS,
  describeLayers,
  dialId,
  formatClock,
  type SceneWeather,
  type WeatherLayerId,
} from "./weather";
import type { SceneApi } from "./useScene";

/**
 * WEATHER & LIGHTING — conditions that combine, each carrying only its own dials.
 * ------------------------------------------------------------------
 * The condition tiles are a MULTI-SELECT. Switching one on adds its group of
 * dials below; switching another on adds a second group beside it. Rain under
 * heavy cloud, snow in low sun, dust at dawn — the combinations a dataset
 * actually wants — are now things this panel can say, and each is one tile away.
 *
 * WHAT EACH CONDITION OWNS is deliberately one or two sliders (see weather.ts).
 * The previous cut of this had sixteen, most of which belonged to no condition
 * in particular: choosing Rain set a cloud density, and the Atmosphere group sat
 * open over three dials nobody had asked for. Now Sunny is a sky brightness,
 * Rain is an amount and a wetness, and the panel is short enough that nothing
 * has to be folded away to make it readable.
 *
 * NO WIND, NO LIGHTING DIALS. They were two folds under the conditions, and
 * they were the only controls in here that no condition owned — a bearing, a
 * speed and a sun clock that a dataset run almost never touches, sitting in the
 * one section that is read on every run. The state still exists (weather.ts
 * keeps the sun and the wind, and a saved set still carries them), so what came
 * out is the UI, not the scene.
 *
 * WHY IT NOW CARRIES SETS. Weather is back to multiplying the run, but as whole
 * authored COMBINATIONS rather than as condition names. Save the mix you're
 * looking at, keep it checked, and the run sweeps it as one value on the weather
 * axis. See `SavedWeather.inRun`.
 */
export function WeatherSection({ scene }: { scene: SceneApi }) {
  const w = scene.weather;

  /**
   * Which saved set the dials are currently standing in for.
   *
   * EDITING IS A MODE, not a second copy. Pressing the pencil loads the set and
   * remembers which one you loaded, so the conditions and dials above become
   * that set's controls and the footer offers to write them back. Without it
   * the only way to fix a set was to save a near-duplicate beside it — which is
   * how a run ends up sweeping "Rain" and "Rain 2", one of them the mistake.
   */
  const [editing, setEditing] = useState<string | null>(null);

  // A set can be deleted from under the edit — from this list, on this screen.
  // Falling back to the plain save footer is the honest thing to do then.
  useEffect(() => {
    if (editing && !scene.savedWeather.some((s) => s.id === editing)) setEditing(null);
  }, [editing, scene.savedWeather]);

  return (
    <div data-ui="terragen-editor-weather">
      <ConditionRow active={w.layers} onToggle={scene.toggleWeatherLayer} />

      <div className="mt-4 space-y-3">
        {w.layers.map((id) => (
          <LayerDials key={id} id={id} weather={w} scene={scene} />
        ))}
      </div>

      <SetFooter scene={scene} editing={editing} onEdit={setEditing} />
    </div>
  );
}

/* ------------------------------------------------------------- conditions -- */

/**
 * The five conditions, as tiles. A MULTI-SELECT: each is its own switch, and
 * they stack.
 *
 * The last one on can't be switched off — a scene with no condition has no sky
 * to render, and an empty row is a state nobody chose. That tile just stops
 * responding rather than showing a disabled style, because it is only the last
 * one for as long as nothing else is on.
 */
function ConditionRow({
  active,
  onToggle,
}: {
  active: WeatherLayerId[];
  onToggle: (id: WeatherLayerId) => void;
}) {
  const only = active.length === 1;

  return (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="type-eyebrow text-content-muted">Conditions</h3>
        <span className="type-caption shrink-0 text-content-subtle">Combine any</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {WEATHER_LAYERS.map((p) => {
          const on = active.includes(p.id);
          const locked = on && only;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              title={locked ? `${p.blurb} — the last condition can't be switched off` : p.blurb}
              data-ui={`terragen-weather-${p.id}`}
              onClick={() => onToggle(p.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 transition-colors",
                on
                  ? "border-brand bg-brand/12 text-content"
                  : "border-glass/12 bg-glass/6 text-content-muted hover:border-glass/25 hover:text-content",
                locked && "cursor-default"
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

/* ------------------------------------------------------------ layer dials -- */

/**
 * The one or two sliders a switched-on condition brings with it.
 *
 * Boxed and headed by its own name, so a stack of two or three conditions reads
 * as "here is what Rain is doing, here is what Cloudy is doing" rather than as
 * one undifferentiated column of sliders whose owners you have to infer.
 */
function LayerDials({
  id,
  weather,
  scene,
}: {
  id: WeatherLayerId;
  weather: SceneWeather;
  scene: SceneApi;
}) {
  const meta = LAYER_BY_ID[id];

  return (
    <section
      data-ui={`terragen-weather-dials-${id}`}
      className="rounded-xl border border-glass/12 bg-glass/6 p-3"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <Icon name={meta.icon} size={14} className="shrink-0 text-brand" />
        <span className="type-body-strong grow truncate text-content">{meta.label}</span>
      </div>
      <div className="space-y-2.5">
        {meta.dials.map((d) => {
          const key = dialId(id, d.key);
          return (
            <Dial
              key={key}
              label={d.label}
              value={weather.values[key]}
              suffix="%"
              onChange={(v) => scene.setWeather({ values: { [key]: v } })}
            />
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- weather sets */

/**
 * Save the combination you're looking at, and choose which saved ones the run
 * sweeps.
 *
 * A SET IS A VALUE ON AN AXIS, which is why each row carries a checkbox rather
 * than just a load-and-delete. Checked, it renders: the run does every subset
 * once per checked set, so two sets is two passes over the whole sweep. That
 * cost belongs in front of the person choosing it — hence the count and the
 * multiplier note, and hence the budget panel picking the same number up.
 *
 * Session-scoped, and it says so: there is no backend to persist to.
 */
function SetFooter({
  scene,
  editing,
  onEdit,
}: {
  scene: SceneApi;
  /** id of the set the dials are standing in for, or null */
  editing: string | null;
  onEdit: (id: string | null) => void;
}) {
  const saved = scene.savedWeather;
  const inRun = saved.filter((s) => s.inRun).length;
  const editingSet = editing ? saved.find((s) => s.id === editing) ?? null : null;

  return (
    <div className="mt-1 border-t border-glass/10 pt-3">
      {editingSet ? (
        /* The footer becomes that set's footer. Two exits — write it back, or
           walk away — and no "Save as set" beside them, because a third button
           that silently forks the set is the bug this mode exists to remove. */
        <div data-ui="terragen-weather-editing">
          <p className="type-caption mb-2 flex items-center gap-1.5 text-content-subtle">
            <Icon name="edit" size={13} className="shrink-0 text-brand" />
            Editing <span className="text-content">{editingSet.name}</span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="grow"
              data-ui="terragen-weather-edit-cancel"
              onClick={() => onEdit(null)}
            >
              Done
            </Button>
            <Button
              variant="brand"
              size="sm"
              className="grow"
              data-ui="terragen-weather-edit-save"
              onClick={() => {
                scene.updateWeatherSet(editingSet.id);
                onEdit(null);
              }}
            >
              <Icon name="save" size={15} />
              Update set
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="grow"
            data-ui="terragen-weather-reset"
            onClick={scene.resetWeather}
          >
            {/* Quiet outline, not a bright glyph — the icon is a hint beside the
                word, not a second thing competing with it. */}
            <Icon name="retry" size={15} className="text-content-subtle" />
            Reset
          </Button>
          <Button
            variant="brand"
            size="sm"
            className="grow"
            data-ui="terragen-weather-save"
            onClick={() => scene.saveWeather()}
          >
            <Icon name="save" size={15} />
            Save as set
          </Button>
        </div>
      )}

      {saved.length > 0 ? (
        <>
          <div className="mb-1.5 mt-3 flex items-baseline justify-between gap-3">
            <h3 className="type-eyebrow text-content-muted">Weather sets</h3>
            <span className="type-caption shrink-0 text-content-subtle">
              {inRun} of {saved.length} in run
            </span>
          </div>

          <div className="space-y-1.5">
            {saved.map((s) => (
              <div
                key={s.id}
                data-ui={`terragen-weather-set-${s.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
                  editing === s.id
                    ? "border-brand bg-brand/12"
                    : s.inRun
                      ? "border-brand/40 bg-brand/8"
                      : "border-glass/12 bg-glass/6"
                )}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={s.inRun}
                  aria-label={`Include ${s.name} in the run`}
                  data-ui={`terragen-weather-set-${s.id}-inrun`}
                  onClick={() => scene.toggleWeatherInRun(s.id)}
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                    s.inRun ? "border-brand bg-brand text-brand-foreground" : "border-glass/25"
                  )}
                >
                  {s.inRun && <Icon name="check" size={11} strokeWidth={3} />}
                </button>

                <button
                  type="button"
                  title={`Load ${s.name}`}
                  data-ui={`terragen-weather-set-${s.id}-load`}
                  onClick={() => scene.loadWeather(s.id)}
                  className="min-w-0 grow text-left transition-colors hover:text-brand"
                >
                  <span className="type-body-dense block truncate text-content">{s.name}</span>
                  <span className="type-caption block truncate text-content-subtle">
                    {describeLayers(s.state)} · {formatClock(s.state.sun.minutes)}
                  </span>
                </button>

                {/* Edit loads the set into the dials above and puts the
                    footer into update mode — the row itself stays a row. */}
                <button
                  type="button"
                  aria-label={`Edit ${s.name}`}
                  title={`Edit ${s.name}`}
                  data-ui={`terragen-weather-set-${s.id}-edit`}
                  onClick={() => {
                    scene.loadWeather(s.id);
                    onEdit(s.id);
                  }}
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded transition-colors",
                    editing === s.id
                      ? "bg-brand/20 text-brand"
                      : "text-content-muted hover:bg-glass/20 hover:text-content"
                  )}
                >
                  <Icon name="edit" size={12} />
                </button>

                <button
                  type="button"
                  aria-label={`Delete ${s.name}`}
                  title={`Delete ${s.name}`}
                  data-ui={`terragen-weather-set-${s.id}-delete`}
                  onClick={() => scene.deleteWeather(s.id)}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded text-content-muted transition-colors hover:bg-glass/20 hover:text-danger"
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
          </div>

          <p className="type-caption mt-2 text-content-subtle">
            {inRun > 1
              ? `Every subset renders ${inRun} times — once per checked set.`
              : "Check more than one set to sweep weather across the run."}{" "}
            Sets last for this session.
          </p>
        </>
      ) : (
        <p className="type-caption mt-2.5 text-content-subtle">
          Save this combination to sweep it against others in one run.
        </p>
      )}
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
