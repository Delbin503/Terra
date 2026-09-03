import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { Pill } from "./ui";
import { dayPhase, formatClock, type Sun } from "./weather";
import type { SceneApi } from "./useScene";

/** The hours the bar names. Three labels, not twenty-four: the strip is 300px
 *  wide and its job is to orient you, not to be read off. */
const TICKS = [6, 12, 18];

/**
 * The day, as a colour ramp.
 *
 * Stops at the hours where light actually changes character rather than at even
 * intervals — the ramp is the control's only readout before you touch it, so a
 * uniform blue-to-orange-to-blue would misreport where the golden hours are.
 * Percentages are hours/24.
 */
const DAY_RAMP = [
  { at: 0, color: "#0d1226" }, // midnight
  { at: 20, color: "#1d2440" }, // 04:48 — first light
  { at: 27, color: "#6b4a5a" }, // 06:30 — dawn
  { at: 33, color: "#c98a5a" }, // 08:00 — low sun
  { at: 50, color: "#8fb4d8" }, // midday
  { at: 70, color: "#d9995e" }, // 16:48 — afternoon
  { at: 76, color: "#b4573f" }, // 18:15 — golden hour
  { at: 84, color: "#4a3552" }, // 20:00 — dusk
  { at: 100, color: "#0d1226" }, // midnight again, so the ramp closes
];

const RAMP_CSS = `linear-gradient(90deg, ${DAY_RAMP.map((s) => `${s.color} ${s.at}%`).join(", ")})`;

/**
 * TIME OF DAY — the sun's clock, and the times a run sweeps.
 * ----------------------------------------------------------
 * WHY IT IS ITS OWN SECTION. Time of Day used to be an axis, then it folded
 * into Weather & Lighting, and then the fold took its controls out — leaving the
 * sun's clock live in the scene state (see weather.ts) with nothing anywhere
 * able to move it. A midday render was the only render this panel could order.
 *
 * THE CLOCK IS THE WHOLE SECTION. `Sun` also carries an intensity and a shadow
 * depth, and neither is here: they are a look you set once, not a thing a
 * dataset sweeps, and the run is priced per time value.
 *
 * It is separate from Weather rather than back inside it because the two
 * MULTIPLY EACH OTHER. Three times under two weathers is six passes over the
 * sweep, and a single list of "sets" that mixed them could only ever express
 * six named combinations by hand. Two lists express the grid.
 *
 * THE BAR IS THE READOUT, the slider is the control. A range input alone puts a
 * dot on a grey track and asks you to know that 40% of the way along is roughly
 * ten in the morning; the ramp above it answers that before you drag, and the
 * marker shows where in the day you have landed.
 */
export function TimeOfDaySection({ scene }: { scene: SceneApi }) {
  const sun = scene.weather.sun;

  /**
   * Which saved set the clock is standing in for — the same edit mode the
   * weather section has, for the same reason: without it, fixing a set means
   * saving a near-duplicate beside it and leaving both checked into the run.
   */
  const [editing, setEditing] = useState<string | null>(null);

  // A set can be deleted from under the edit, from this very list.
  useEffect(() => {
    if (editing && !scene.savedTimes.some((s) => s.id === editing)) setEditing(null);
  }, [editing, scene.savedTimes]);

  return (
    <div data-ui="terragen-editor-time">
      <DayBar
        minutes={sun.minutes}
        onChange={(minutes) => scene.setWeather({ sun: { minutes } })}
      />

      {/* NO INTENSITY, NO SHADOW DEPTH. The sun's state carries both (see
          weather.ts) and this section briefly exposed them, but the hour is the
          thing a dataset varies — the other two are a look you set once, and two
          sliders that nobody moves in the one section read on every run is the
          same clutter the weather panel was cut down to remove. */}

      <TimeSetFooter scene={scene} editing={editing} onEdit={setEditing} />
    </div>
  );
}

/* ------------------------------------------------------------------ the bar */

/**
 * The day strip: a ramp, three hour labels, a marker where the sun is, and the
 * slider that moves it.
 *
 * The slider is a plain range input under the strip rather than a drag handler
 * on the strip itself. Dragging the picture would read as the more direct
 * gesture, but it would also mean re-implementing keyboard access, step size
 * and touch targets that `<input type="range">` already has — and the strip
 * still shows the answer either way.
 */
function DayBar({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  const pct = (minutes / 1440) * 100;

  return (
    <div className="rounded-xl border border-glass/12 bg-glass/6 p-2.5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="type-eyebrow text-content-muted">Time of day</h3>
        <span className="type-caption shrink-0 text-content">
          {formatClock(minutes)} · <span className="text-content-subtle">{dayPhase(minutes)}</span>
        </span>
      </div>

      <div className="relative h-9 overflow-hidden rounded-lg" style={{ background: RAMP_CSS }}>
        {/* A scrim under the labels. The ramp runs from near-black to a pale
            midday blue, so white text on it is unreadable at exactly the hours
            most people set — noon. */}
        <div className="absolute inset-0 bg-black/25" />

        {TICKS.map((h) => (
          <span
            key={h}
            aria-hidden
            className="type-caption absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/70"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h).padStart(2, "0")}:00
          </span>
        ))}

        {/* Where the sun is. A full-height line rather than a dot: it has to
            read against nine different backgrounds along the ramp, and a line
            with a dark edge does that where a single colour cannot. */}
        <div
          aria-hidden
          data-ui="terragen-time-marker"
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{ left: `${pct}%` }}
        />
      </div>

      <input
        type="range"
        aria-label="Time of day"
        data-ui="terragen-time-slider"
        min={0}
        max={1439}
        // Five-minute steps: a dataset is ordered at "07:30", never at "07:31",
        // and 1,440 stops on a 300px track is a pixel and a half each.
        step={5}
        value={minutes}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-2.5 h-1 w-full cursor-pointer accent-brand"
      />
    </div>
  );
}

/* ----------------------------------------------------------------- the sets */

/**
 * Save, and the list of what has been saved.
 *
 * Deliberately the same shape as the weather section's footer — same buttons in
 * the same order, same row anatomy, same sentence about the sweep. Two lists
 * that behave identically should look identical; the moment one of them puts
 * its checkbox on the other side, people start checking the wrong thing.
 */
function TimeSetFooter({
  scene,
  editing,
  onEdit,
}: {
  scene: SceneApi;
  editing: string | null;
  onEdit: (id: string | null) => void;
}) {
  const saved = scene.savedTimes;
  const inRun = saved.filter((s) => s.inRun).length;
  const editingSet = editing ? saved.find((s) => s.id === editing) ?? null : null;

  return (
    <div className="mt-3 border-t border-glass/10 pt-3">
      {editingSet ? (
        <div data-ui="terragen-time-editing">
          <p className="type-caption mb-2 flex items-center gap-1.5 text-content-subtle">
            <Icon name="edit" size={13} className="shrink-0 text-brand" />
            Editing <span className="text-content">{editingSet.name}</span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="grow"
              data-ui="terragen-time-edit-cancel"
              onClick={() => onEdit(null)}
            >
              Done
            </Button>
            <Button
              variant="brand"
              size="sm"
              className="grow"
              data-ui="terragen-time-edit-save"
              onClick={() => {
                scene.updateTimeSet(editingSet.id);
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
            variant="outline"
            size="sm"
            className="grow"
            data-ui="terragen-time-reset"
            onClick={scene.resetTime}
          >
            <Icon name="retry" size={15} className="text-content-subtle" />
            Reset
          </Button>
          <Button
            variant="brand"
            size="sm"
            className="grow"
            data-ui="terragen-time-save"
            onClick={scene.saveTime}
          >
            <Icon name="save" size={15} />
            Save as set
          </Button>
        </div>
      )}

      {saved.length > 0 ? (
        <>
          <div className="mb-1.5 mt-3 flex items-baseline justify-between gap-3">
            <h3 className="type-eyebrow text-content-muted">Time sets</h3>
            <span className="type-caption shrink-0 text-content-subtle">
              {inRun} of {saved.length} in run
            </span>
          </div>

          <div className="space-y-1.5">
            {saved.map((s) => (
              <div
                key={s.id}
                data-ui={`terragen-time-set-${s.id}`}
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
                  data-ui={`terragen-time-set-${s.id}-inrun`}
                  onClick={() => scene.toggleTimeInRun(s.id)}
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                    s.inRun ? "border-brand bg-brand text-brand-foreground" : "border-glass/25"
                  )}
                >
                  {s.inRun && <Icon name="check" size={11} strokeWidth={3} />}
                </button>

                {/* The stored hour's own swatch, sampled off the same ramp the
                    bar draws — so a list of times reads as a list of LIGHTS
                    rather than as a column of numbers. */}
                <span
                  aria-hidden
                  className="h-4 w-4 shrink-0 rounded-md ring-1 ring-glass/20"
                  style={{ background: rampColorAt(s.minutes) }}
                />

                <button
                  type="button"
                  title={`Load ${s.name}`}
                  data-ui={`terragen-time-set-${s.id}-load`}
                  onClick={() => scene.loadTime(s.id)}
                  className="min-w-0 grow text-left transition-colors hover:text-brand"
                >
                  {/* One line, no subtitle: the name is already the clock and
                      the phase, and there is nothing else in a time set to
                      report underneath it. */}
                  <span className="type-body-dense block truncate text-content">{s.name}</span>
                </button>

                <button
                  type="button"
                  aria-label={`Edit ${s.name}`}
                  title={`Edit ${s.name}`}
                  data-ui={`terragen-time-set-${s.id}-edit`}
                  onClick={() => {
                    scene.loadTime(s.id);
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
                  data-ui={`terragen-time-set-${s.id}-delete`}
                  onClick={() => scene.deleteTime(s.id)}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded text-content-muted transition-colors hover:bg-glass/20 hover:text-danger"
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
          </div>

          <p className="type-caption mt-2 text-content-subtle">
            {inRun > 1
              ? `Every subset renders ${inRun} times — once per checked time.`
              : "Check more than one set to sweep the day across the run."}{" "}
            Sets last for this session.
          </p>
        </>
      ) : (
        <p className="type-caption mt-2.5 text-content-subtle">
          Save this hour to sweep it against others in one run.
        </p>
      )}
    </div>
  );
}

/**
 * The ramp's colour at one minute of the day.
 *
 * Interpolated in sRGB between the two nearest stops. Good enough for a 16px
 * swatch and it costs nothing; a perceptual blend would be the right answer for
 * a gradient you look AT, and this one only has to identify a row.
 */
function rampColorAt(minutes: number): string {
  const at = ((minutes % 1440) / 1440) * 100;
  let lo = DAY_RAMP[0];
  let hi = DAY_RAMP[DAY_RAMP.length - 1];
  for (let i = 0; i < DAY_RAMP.length - 1; i += 1) {
    if (at >= DAY_RAMP[i].at && at <= DAY_RAMP[i + 1].at) {
      lo = DAY_RAMP[i];
      hi = DAY_RAMP[i + 1];
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const t = (at - lo.at) / span;
  const mix = (a: string, b: string) => {
    const n = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    const c = [0, 1, 2].map((i) => Math.round(n(a, i) + (n(b, i) - n(a, i)) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  };
  return mix(lo.color, hi.color);
}

/** The closed row's badge — the hour, at a glance. */
export function TimePill({ sun }: { sun: Sun }) {
  return (
    <Pill ui="time-of-day" tone="muted">
      {formatClock(sun.minutes)}
    </Pill>
  );
}
