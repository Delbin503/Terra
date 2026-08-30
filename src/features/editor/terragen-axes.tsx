import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { NumberInput } from "./ui";
import { AssetThumb } from "./AssetThumb";
import { CountField } from "./controls-ui";
import type { Asset } from "./assets-data";
import {
  ANNOTATIONS,
  MAX_ARRANGEMENTS,
  RESOLUTION_LIMITS,
  RESOLUTION_PRESETS,
  axisValues,
  type AxisId,
  type WorkOrder,
} from "./work-order";
import type { WorkOrderStore } from "./useWorkOrder";
import { Cost, Group, Note, InSceneChip, MultiSelectField } from "./terragen-parts";
import { arrange, makeRule, newSeed, seedFor } from "./arrange";
import { describeVolume } from "./scene-volume";
import { isContentObject } from "./scene-types";
import type { SceneApi } from "./useScene";

/**
 * TERRAGEN AXIS EDITORS — the body of each axis section.
 *
 * Every editor obeys the same rule, which is what keeps four unrelated controls
 * reading as one panel: the scene's own value is shown first and cannot be
 * removed. It is value #1 of the axis whether the axis is on or off, so the
 * editor never opens as an empty form asking the user to re-enter what they
 * just built.
 *
 * What an editor does NOT carry is the bill. Frame counts, credits and archive
 * size are stated once, in the dispatch review, where they are a decision
 * rather than ambient noise beside a slider.
 *
 * The axis label and on/off switch are not here either: they live in the
 * accordion row that opens this body (TerraGenDock), because the row has to
 * show them while the body is closed.
 */

export interface EditorProps {
  section: AxisId | "output";
  order: WorkOrder;
  store: WorkOrderStore;
  assets: Asset[];
  /** The Arrangement axis reads the volume and moves the objects in it. */
  scene: SceneApi;
  /** open the asset library sheet — the same one the Objects section uses */
  onBrowseLibrary: () => void;
}

export function AxisEditor(props: EditorProps) {
  switch (props.section) {
    case "background":
      return <BackgroundEditor {...props} />;
    case "layouts":
      return <ArrangementEditor {...props} />;
    case "output":
      return <OutputEditor {...props} />;
  }
}

/* --- background ----------------------------------------------------------- */

function BackgroundEditor({ order, store, assets, onBrowseLibrary }: EditorProps) {
  const b = order.background;

  // One source of truth for what the axis is worth — the same call the dispatch
  // review and the subset preview make.
  const count = axisValues(order, "background", assets).length;
  const inRun = b.picks.filter((p) => p.inRun).length;

  return (
    <div data-ui="terragen-editor-background">
      <Cost>
        {b.picks.length === 0
          ? b.baseLabel
            ? `Every frame keeps ${b.baseLabel}. Add a sky to render the run under another one too.`
            : "No environment is placed, and none has been added."
          : `${count} environment${count === 1 ? "" : "s"} — one subset each`}
      </Cost>

      <Group title="In scene">
        {b.baseLabel ? (
          <InSceneChip label={b.baseLabel} />
        ) : (
          <Note tone="warn">
            No environment in the scene. Place an HDRI from the library — this axis varies the
            background, it can't supply the first one.
          </Note>
        )}
      </Group>

      <Group
        title="Added environments"
        hint={b.picks.length > 0 ? `${inRun} of ${b.picks.length} in run` : undefined}
      >
        {/* THE REAL LIBRARY, NOT A GRID OF THUMBNAILS. This was a three-column
            tile grid with its own search and select-all — a worse copy of the
            browser that already has categories, folders, tags and upload, and
            one that could only ever show what was already catalogued. Picking
            happens in the sheet now; what stays here is the shortlist. */}
        <Button
          variant="outline"
          size="sm"
          data-ui="terragen-add-hdri"
          className="mb-2 w-full"
          onClick={onBrowseLibrary}
        >
          <Icon name="place" size={14} />
          Add from library
        </Button>

        {b.picks.length === 0 ? (
          <Note>
            Nothing added. The run uses {b.baseLabel ?? "the scene's environment"} for every frame.
          </Note>
        ) : (
          <>
            <ul className="space-y-1">
              {b.picks.map((p) => {
                const asset = assets.find((a) => a.id === p.assetId);
                const name = asset?.name ?? "Environment";
                return (
                  <li
                    key={p.assetId}
                    data-ui={`terragen-hdri-${p.assetId}`}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
                      p.inRun ? "border-brand/40 bg-brand/8" : "border-glass/12 bg-glass/6"
                    )}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={p.inRun}
                      aria-label={`Sweep ${name} in the run`}
                      data-ui={`terragen-hdri-${p.assetId}-inrun`}
                      onClick={() => store.toggleEnv(p.assetId)}
                      className={cn(
                        "grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                        p.inRun ? "border-brand bg-brand text-brand-foreground" : "border-glass/25"
                      )}
                    >
                      {p.inRun && <Icon name="check" size={11} strokeWidth={3} />}
                    </button>

                    <span className="h-7 w-10 shrink-0 overflow-hidden rounded-md">
                      {asset ? (
                        <AssetThumb type={asset.type} seed={asset.seed} />
                      ) : (
                        <span className="block h-full w-full bg-glass/12" />
                      )}
                    </span>

                    <span className="type-body min-w-0 grow truncate text-content">{name}</span>

                    <button
                      type="button"
                      aria-label={`Remove ${name} from the run`}
                      title={`Remove ${name} from the run`}
                      data-ui={`terragen-hdri-${p.assetId}-remove`}
                      onClick={() => store.removeEnv(p.assetId)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-danger-soft/40 hover:text-danger"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="type-caption mt-2 text-content-subtle">
              {inRun > 0
                ? `The run renders ${count} times — once under ${
                    b.baseLabel ?? "no HDRI"
                  }, once per checked sky.`
                : "Nothing checked — the run keeps the scene's own environment."}
            </p>
          </>
        )}

        {/* NO UPLOAD BUTTON. Bringing a file in is the library's job — it has
            the drop target, the folders and the progress — and a second,
            narrower way in from inside a Work Order meant an HDRI could exist
            in one order and nowhere else. Upload in the sheet, then pick it. */}
      </Group>
    </div>
  );
}

/* --- arrangement ---------------------------------------------------------- */


/**
 * ARRANGEMENT — rearrange the room, N times, reproducibly.
 *
 * The axis and the Space panel's Scatter button call the SAME `arrange()` with
 * the same rules, which is the whole reason the solver is a pure function. The
 * difference is only how many times: Scatter is one shuffle you keep, this is a
 * sweep the run renders one subset per arrangement.
 *
 * WHY THE PREVIEW APPLIES TO THE SCENE. There is nowhere else to show it. A
 * thumbnail strip would need N offscreen renders of a scene the viewport is
 * already displaying, so instead each button applies its arrangement to the
 * objects that are already there — undoable, and the same positions the backend
 * will rebuild from the seed.
 */
function ArrangementEditor({ order, store, scene }: EditorProps) {
  const l = order.layouts;
  const v = scene.activeVolume;

  /**
   * What the run rearranges, and what it arranges AROUND.
   *
   * The same split the Space panel's Scatter makes, for the same reason: the
   * master is what every camera is framed on, so moving it would invalidate the
   * shots this very order describes. Locked and hidden objects are left alone
   * because that is what those flags mean.
   */
  const movable = useMemo(
    () =>
      scene.objects.filter(
        (o) => isContentObject(o) && o.role !== "master" && !o.locked && !o.hidden
      ),
    [scene.objects]
  );

  const fixed = useMemo(
    () => scene.objects.filter((o) => isContentObject(o) && !movable.includes(o)),
    [scene.objects, movable]
  );

  const [applied, setApplied] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const apply = (index: number) => {
    if (!v) return;
    const result = arrange(
      { volume: v, movable, fixed, rules: movable.map((o) => makeRule(o.id)) },
      seedFor(l.seed, index)
    );
    scene.applyPlacements(result.placements);
    setApplied(index);
    setNote(
      result.unplaced.length === 0
        ? null
        : `${result.unplaced.length} couldn't be fitted — widen the space or lower the clearance.`
    );
  };

  return (
    <div data-ui="terragen-editor-arrangement">
      <Cost>
        {l.on
          ? `${l.count} arrangements — one subset each`
          : "One arrangement — the scene exactly as you posed it. Ask for two or more to sweep."}
      </Cost>

      {/* ---------------------------------------------------------- the space */}
      <Group title="Space">
        {v ? (
          <InSceneChip label={`${v.name} · ${describeVolume(v)}`} />
        ) : (
          <Note tone="warn">
            No space is drawn. Add one from the asset library, under Utilities — the solver
            needs bounds before it can arrange anything.
          </Note>
        )}
      </Group>

      {/* --------------------------------------------------------- how many */}
      <Group title="How many">
        {/* The count IS the switch. At 1 the axis multiplies nothing and the
            run renders the room as posed; from 2 it becomes a sweep. See
            `useWorkOrder.patch` for why there is no separate on/off. */}
        <CountField
          label="Arrangements"
          /* `terragen-arrangements`, NOT `terragen-arrangement-count`: the
             `terragen-arrangement-*` prefix belongs to the preview chips below,
             and a stepper sitting inside it would answer their selector. */
          ui="terragen-arrangements"
          value={l.count}
          min={1}
          /* TEN, NOT 24. Every arrangement is a whole subset — it multiplies
             against the weather sets, the swap lists and the camera's frames —
             so the far end of this stepper was an order nobody meant to place.
             Ten is enough variety to sweep a room and still a bill you can read
             on the review screen. The stepper clamps, and so does a typed
             value. */
          max={MAX_ARRANGEMENTS}
          onChange={(n) => store.patch("layouts", { count: n })}
        />
      </Group>

      {/* ------------------------------------------------------------- seed */}
      <Group title="Seed" hint="every arrangement descends from it">
        <div className="flex items-stretch gap-2">
          <label className="field-well flex min-w-0 grow items-center gap-2 rounded-lg border px-2.5 py-1.5">
            <input
              aria-label="Arrangement seed"
              value={l.seed}
              inputMode="numeric"
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                store.patch("layouts", { seed: Number.isFinite(n) ? n : 0 });
              }}
              data-ui="terragen-seed-input"
              className="type-numeric min-w-0 grow bg-transparent text-content outline-none"
            />
          </label>
          <button
            type="button"
            data-ui="terragen-reseed"
            aria-label="New seed"
            title="New seed"
            onClick={() => {
              store.patch("layouts", { seed: newSeed() });
              setApplied(null);
            }}
            className="grid w-10 shrink-0 place-items-center rounded-lg border border-glass/15 bg-glass/8 text-content-muted transition-colors hover:border-glass/30 hover:text-content"
          >
            <Icon name="seed" size={16} />
          </button>
        </div>
        <p className="type-caption mt-1.5 text-content-subtle">
          Write it down and this exact set of rooms comes back — here, and on the render farm.
        </p>
      </Group>

      {/* ---------------------------------------------------------- preview */}
      <Group title="Preview" hint="applies to the viewport">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: l.count }, (_, i) => (
            <button
              key={i}
              type="button"
              disabled={!v || movable.length === 0}
              onClick={() => apply(i)}
              /* `terragen-arrangement-*`, not `terragen-preview-*`: the preview
                 namespace already belongs to the scene-preview transport
                 (`terragen-preview-play` / `-scrub`) at the top of this mode. */
              data-ui={`terragen-arrangement-${i + 1}`}
              className={cn(
                "type-caption-strong rounded-lg border px-2.5 py-1.5 tabular-nums transition-colors disabled:opacity-40",
                applied === i
                  ? "border-brand bg-brand/15 text-brand-on-glass"
                  : "border-glass/12 bg-glass/6 text-content hover:border-glass/30"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {note && (
          <p className="type-caption mt-2 text-warning">{note}</p>
        )}

        {/* THE SEED THE CLICKED ONE ACTUALLY RAN.
            The field above holds ONE number and the sweep derives N from it
            (`seedFor`), so "the seed" on screen was never the seed of the room
            you were looking at — it was the seed of the set. That is the number
            somebody writes down to get a particular arrangement back, and until
            now it existed only inside the solver.

            ONLY AFTER A CLICK, and only for that one. Printing all ten would be
            a column of eight-digit numbers nobody asked for, and printing one
            before anything is applied would attach a figure to a room the
            viewport is not showing. */}
        {applied !== null && (
          <p
            data-ui="terragen-arrangement-seed"
            className="type-caption mt-2 flex items-center justify-between gap-2 rounded-lg border border-glass/12 bg-glass/6 px-2.5 py-2"
          >
            <span className="text-content-subtle">Arrangement {applied + 1} seed</span>
            <span className="type-numeric text-content">{seedFor(l.seed, applied)}</span>
          </p>
        )}

        <p className="type-caption mt-1.5 text-content-subtle">
          Clicking one rearranges the scene so you can look at it. Undo puts it back; the run
          rebuilds every arrangement from the seed regardless.
        </p>
      </Group>
    </div>
  );
}

/* --- output --------------------------------------------------------------- */

function OutputEditor({ order, store }: EditorProps) {
  const o = order.output;
  const perFrame = ANNOTATIONS.filter((a) => a.scope === "frame");
  const perVideo = ANNOTATIONS.filter((a) => a.scope === "video");
  /**
   * WHICH FIELD IS OPEN — one at a time, across all four.
   *
   * Output is pinned above Dispatch inside a capped scroller, and four fields
   * each free to be open at once could stack to more than the cap: the section
   * would then scroll internally while the button it exists to be read before
   * sat below it. An accordion keeps the section's open height to one field's
   * worth no matter which one you are in.
   */
  const [openField, setOpenField] = useState<string | null>(null);
  const toggle = (id: string) => setOpenField((cur) => (cur === id ? null : id));

  return (
    <div data-ui="terragen-editor-output">
      <Cost>
        What TerraGen computes for every frame. This doesn't change the frame count — it changes
        what comes back in the archive.
      </Cost>

      {/* FOUR FIELDS OF ONE SHAPE — a labelled row that opens into its choices.
          Types and annotations were rows of chips, which solved the height
          problem (nine full-width checkboxes had made this the tallest section
          in the dock) at the cost of running two type steps below every other
          field in every other section, and of abbreviating labels to fit inside
          a pill. A closed field is one row whatever it contains, so this is
          shorter still — and inside, each option is a full-size row carrying
          the note that used to be a tooltip. */}
      <Group title="Dataset type">
        <MultiSelectField
          ui="dataset-type"
          /* `input-2d` is the Image glyph. `capture` — the Orbit glyph — is
             what the Output SECTION header already wears, and repeating a
             section's own icon on a field inside it names nothing. */
          icon="input-2d"
          label="Dataset type"
          open={openField === "types"}
          onToggleOpen={() => toggle("types")}
          options={[
            {
              id: "images",
              label: "Static images",
              note: "One frame per camera sample",
              checked: o.images,
            },
            {
              id: "video",
              label: "Video",
              note: "Continuous capture along the rig path",
              checked: false,
              disabled: true,
              comingSoon: true,
            },
          ]}
          onToggle={(id) => id === "images" && store.setOutput({ images: !o.images })}
        />
      </Group>

      <Group title="Image configuration" hint={`${o.resolution.width}×${o.resolution.height}`}>
        {/* SINGLE-SELECT, so it stays its own control rather than becoming a
            MultiSelectField with the checkboxes lying about being independent.
            A frame has one resolution; picking a second would mean unpicking
            the first, which is a different gesture with a different affordance.
            Same trigger row and the same in-place expansion as its three
            neighbours, so the section still reads as four of one thing. */}
        <button
          type="button"
          aria-expanded={openField === "resolution"}
          data-ui="terragen-output-configure"
          onClick={() => toggle("resolution")}
          className="flex w-full items-center gap-2.5 rounded-xl border border-glass/12 bg-glass/6 px-2.5 py-2 text-left transition-colors hover:border-glass/25"
        >
          <Icon name="settings" size={14} className="shrink-0 text-brand" />
          <span className="min-w-0 grow">
            <span className="type-body-strong block truncate text-content">Frame resolution</span>
            <span className="type-caption block truncate text-content-subtle">
              {o.resolution.width} × {o.resolution.height} px — every frame in the archive
            </span>
          </span>
          <Icon
            name="chevron-down"
            size={14}
            className={cn(
              "shrink-0 text-content-subtle transition-transform",
              openField === "resolution" && "rotate-180"
            )}
          />
        </button>

        {openField === "resolution" && (
          <div className="mt-2 rounded-xl border border-glass/12 bg-glass/6 p-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              {RESOLUTION_PRESETS.map((r) => {
                const on = r.width === o.resolution.width && r.height === o.resolution.height;
                return (
                  <button
                    key={r.label}
                    type="button"
                    aria-pressed={on}
                    data-ui={`terragen-res-${r.width}`}
                    onClick={() => store.setOutput({ resolution: { width: r.width, height: r.height } })}
                    className={cn(
                      /* type-body-dense, not caption-strong: these are option
                         rows inside an open field, and the options in the
                         fields beside them are read at body size. */
                      "type-body-dense rounded-lg border px-2 py-1.5 text-left transition-colors",
                      on
                        ? "border-brand bg-brand/12 text-content"
                        : "border-glass/12 bg-glass/6 text-content-muted hover:text-content"
                    )}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            {/* Custom, on the same line the presets describe: width, height,
                and nothing else — aspect ratio is whatever those two say. */}
            <div className="mt-2.5 flex items-center gap-2">
              <NumberInput
                bordered
                /* `flex-1 min-w-0`, not `w-full`: as flex children two w-full
                   inputs each claim the row's whole width and the second one
                   overflows the panel. */
                className="min-w-0 flex-1 text-left"
                aria-label="Frame width in pixels"
                data-ui="terragen-res-width"
                value={o.resolution.width}
                min={RESOLUTION_LIMITS.min}
                max={RESOLUTION_LIMITS.max}
                step={16}
                onChange={(e) =>
                  store.setOutput({
                    resolution: { ...o.resolution, width: clampPx(e.target.value, o.resolution.width) },
                  })
                }
              />
              <span className="type-body-dense shrink-0 text-content-subtle">×</span>
              <NumberInput
                bordered
                className="min-w-0 flex-1 text-left"
                aria-label="Frame height in pixels"
                data-ui="terragen-res-height"
                value={o.resolution.height}
                min={RESOLUTION_LIMITS.min}
                max={RESOLUTION_LIMITS.max}
                step={16}
                onChange={(e) =>
                  store.setOutput({
                    resolution: { ...o.resolution, height: clampPx(e.target.value, o.resolution.height) },
                  })
                }
              />
            </div>
            <p className="type-body-dense mt-2 text-content-subtle">
              Bigger frames don't change the frame count — they change the archive. The dispatch
              review sizes it at whatever you set here.
            </p>
          </div>
        )}
      </Group>

      <Group title="Per-frame annotations" hint="applies to images">
        <MultiSelectField
          ui="per-frame"
          icon="tag"
          label="Per-frame annotations"
          open={openField === "frame"}
          onToggleOpen={() => toggle("frame")}
          /* The gate that blocks Dispatch on zero annotations is the reason
             this says so plainly: without the images type there is nothing for
             a per-frame annotation to be attached to, and a field full of
             greyed rows with no explanation reads as broken. */
          disabledNote={o.images ? undefined : "Needs the Static images type"}
          options={perFrame.map((a) => ({
            id: a.id,
            /* The full phrase, not the chip's abbreviation. "Object Detection
               — AABB" fits a row; it never fit a pill, which is why the long
               form had been demoted to a `title` attribute. */
            label: a.label,
            note: a.note,
            checked: o.annotations[a.id],
            disabled: a.comingSoon || !o.images,
            comingSoon: a.comingSoon,
          }))}
          onToggle={(id) => store.toggleAnnotation(id as (typeof perFrame)[number]["id"])}
        />
      </Group>

      <Group title="Per-video annotations" hint="needs the Video type">
        <MultiSelectField
          ui="per-video"
          icon="video"
          label="Per-video annotations"
          open={openField === "video"}
          onToggleOpen={() => toggle("video")}
          disabledNote="Needs the Video type"
          options={perVideo.map((a) => ({
            id: a.id,
            label: a.label,
            note: a.note,
            checked: false,
            disabled: true,
            comingSoon: true,
          }))}
          onToggle={() => {}}
        />
      </Group>

      {/* A fact, not a toggle — MAT runs as a post-render step either way. */}
      <div className="flex items-center gap-2 rounded-lg border border-glass/10 bg-glass/6 px-2.5 py-2">
        <Icon name="mat" size={14} className="text-accent" />
        <span className="type-body text-content-muted">
          MAT photorealism is applied to every frame after render.
        </span>
      </div>

      <p className="type-body-dense mt-3 flex items-center gap-1.5 text-content-subtle">
        <Icon name="info" size={13} className="shrink-0" />
        <span>Frames, archive size and credits are shown in the dispatch review.</span>
      </p>
    </div>
  );
}

/** A pixel count that survives an empty field: an in-progress edit is not a
 *  request for a 0-pixel frame, so the old value stands until the new one is
 *  a number. */
function clampPx(raw: string, fallback: number): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(RESOLUTION_LIMITS.max, Math.max(RESOLUTION_LIMITS.min, n));
}

