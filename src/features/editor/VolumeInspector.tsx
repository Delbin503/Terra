import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Panel, PanelHeader, PanelEyebrow, PanelBody, NumberInput } from "./ui";
import { Note, Switch } from "./terragen-parts";
import { arrange, makeRule, newSeed } from "./arrange";
import {
  LOOSE_SPREAD,
  MIN_VOLUME_SIDE,
  clampIntoVolume,
  expandVolume,
  halfExtent,
  isOversized,
  type SceneVolume,
  type Vec3,
} from "./scene-volume";
import { isContentObject } from "./scene-types";
import type { VolumeGizmo } from "./VolumeBox";
import type { SceneApi } from "./useScene";

/**
 * THE FOCUSED SPACE'S CHROME.
 * ------------------------------------------------------------------
 * A space is a thing in the scene, so selecting one should feel like selecting
 * anything else in the scene: its name over the viewport, a row of tiles along
 * the bottom, and the controls for whichever tile is lit in the bottom-right
 * column. That is the shape every object already has, and a space that instead
 * hid its settings in a docked panel read as a different kind of software.
 *
 * The title itself is `ObjectTitle`, reused verbatim — same face, same rename,
 * same delete — because a second title component drawn to match the first is a
 * second title component that stops matching.
 */

export type VolumeTab = "objects" | "contents";

/**
 * The first tile is "Objects" for the same reason an object's is: it is where
 * the transform lives, and a space and a mesh should keep theirs in the same
 * place under the same word.
 *
 * THERE IS NO CONTAINMENT TILE. It held three settings and only one of them was
 * ever a decision: "keep inside" is the rule the room exists to enforce, and it
 * belongs beside the count of what is currently inside — so it moved into
 * Contents, which is the panel that answers the question it changes. Walls and
 * edge margin kept their defaults; they described the drawing rather than the
 * rule, and a tile carrying one live control and two garnishes is a tile that
 * makes the room look more configurable than it is.
 */
const TABS: { id: VolumeTab; icon: IconName; label: string }[] = [
  { id: "objects", icon: "input-3d", label: "Objects" },
  { id: "contents", icon: "scene", label: "Contents" },
];

/* ========================================================== the toolbar === */

/**
 * Bottom-centre tiles for the focused space.
 *
 * Each is a TOGGLE, not a radio — clicking the lit one puts its panel away and
 * leaves the space selected, exactly like `ObjectToolbar`. `tab === null` is an
 * ordinary resting state: the room is still yours, you just want to look at it.
 */
export function VolumeToolbar({
  tab,
  insetLeft = 0,
  onTab,
}: {
  tab: VolumeTab | null;
  /** px of left edge the caller needs kept clear — a docked left panel */
  insetLeft?: number;
  onTab: (t: VolumeTab) => void;
}) {
  return (
    <div
      data-ui="volume-toolbar"
      // Centred in what's LEFT of the viewport, not in the viewport — the same
      // arithmetic the object toolbar does, so the two never sit at different x.
      className="pointer-events-auto fixed bottom-6 z-30 flex -translate-x-1/2 gap-2.5 transition-[left] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{ left: `calc(50% + ${insetLeft / 2}px)` }}
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          data-ui={`volume-tool-${t.id}`}
          aria-pressed={tab === t.id}
          onClick={() => onTab(t.id)}
          className={cn(
            "type-label glass glass-interactive flex min-w-[92px] flex-col items-center gap-1 !rounded-2xl px-4 py-2.5",
            // The SAME lit state an object's tiles use — `glass-role` tints the
            // pane itself rather than laying a background colour over the glass.
            // Ink alone was the difference between muted and full-strength
            // white on a photographic backdrop, which is no difference at all:
            // you could not tell which panel the bottom-right column belonged to
            // without opening one and watching it change.
            tab === t.id
              ? "glass-role glass-role-brand text-brand-on-glass"
              : "text-content-muted hover:text-content"
          )}
        >
          <Icon name={t.icon} size={18} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ======================================================== the inspector === */

/** One editable thing about a space — the unit a row names and a control edits. */
export type VolumeSetting = "move" | "rotate" | "size" | "contain";

/** Which gizmo each setting arms. Absent leaves the box bare. Named
 *  `VOLUME_GIZMO` rather than `SETTING_GIZMO` because EditorView already has one
 *  of those for objects, and two maps of the same name in one file is a bug
 *  waiting for the day somebody edits the wrong one. */
export const VOLUME_GIZMO: Partial<Record<VolumeSetting, VolumeGizmo>> = {
  move: "move",
  rotate: "rotate",
  size: "size",
};

const ROWS: {
  key: VolumeSetting;
  tab: VolumeTab;
  icon: IconName;
  label: string;
}[] = [
  { key: "move", tab: "objects", icon: "move", label: "Move" },
  { key: "rotate", tab: "objects", icon: "rotate", label: "Rotate" },
  { key: "size", tab: "objects", icon: "scale", label: "Size" },
  // Contents is a settings list like any other now. It used to be the one panel
  // in this corner that laid its controls out inside itself — a toggle, a seed
  // field and a button stacked in the bottom-right box — which made it look
  // like a different piece of software from the Objects list beside it, and
  // meant clicking a thing in Contents was the only click in the editor that
  // did NOT open the centre control everything else opens.
  { key: "contain", tab: "contents", icon: "space", label: "Keep inside" },
  // NO SEED ROW, and no scatter row. Both are in the panel itself, at the
  // bottom: the seed is a number you reroll and immediately spend, so sending
  // it to a control over the toolbar meant the field and the button that
  // consumes it were in different corners of the screen.
  // NO SCATTER ROW. Every other row here names a setting and opens a control
  // that edits it; scatter is a verb that happens the moment you ask for it, and
  // dressing it as a setting put a control in the way of a button. It is the
  // button at the foot of this panel instead.
];

const deg = (v: number) => `${Math.round(((v % 360) + 360) % 360)}°`;

/** What the room holds, counted once for the rows and the warnings alike. */
function contentsOf(scene: SceneApi, v: SceneVolume) {
  const outside = v.contain ? scene.outsideVolume : [];
  // Contents means the things IN the room, not the names for them: a group and
  // its members in one list would scatter its members twice.
  const containable = scene.objects.filter(isContentObject);
  const inside = v.contain ? containable.filter((o) => !outside.includes(o)) : containable;
  return {
    outside,
    inside,
    oversized: inside.filter((o) => isOversized(v, o)),
    // What a scatter would actually move: the master anchors every camera in the
    // order, and locked or hidden objects are where somebody put them.
    movable: inside.filter((o) => o.role !== "master" && !o.locked && !o.hidden),
  };
}

/** The one-line readout each row carries on its right, exactly as the object
 *  properties list does — the value, not a repeat of the label. */
function summarize(v: SceneVolume, key: VolumeSetting): string {
  switch (key) {
    case "move":
      return v.center.map((n) => n.toFixed(1)).join(", ");
    case "rotate":
      return deg(v.rotationY);
    case "size":
      return v.size.map((n) => n.toFixed(1)).join(" × ");
    case "contain":
      return v.contain ? "On" : "Off";
  }
}

/**
 * The bottom-right list for the focused space.
 *
 * A LIST OF ROWS, NOTHING ELSE. Picking a row is what opens its control over
 * the bottom-centre toolbar and, where there is one, arms its gizmo — the same
 * bargain an object makes: Move lights the translate arrows, Size lights the
 * face grips. Both tabs work this way now; Contents used to hold its controls
 * inline and was the odd one out.
 *
 * Two things are not rows. The strays WARNING, because it only exists while
 * something is wrong and it carries the button that puts it right; and the
 * SCATTER button at the foot, because it is a verb rather than a setting.
 */
export function VolumeInspectorPanel({
  scene,
  volume: v,
  tab,
  active,
  seed,
  report,
  onSelect,
  onSeed,
  onReport,
}: {
  scene: SceneApi;
  volume: SceneVolume;
  tab: VolumeTab;
  active: VolumeSetting | null;
  /** the seed the Scatter button spends */
  seed: number;
  /** what the last scatter did, under the button that did it */
  report: string | null;
  onSelect: (k: VolumeSetting) => void;
  onSeed: (n: number) => void;
  onReport: (s: string | null) => void;
}) {
  const rows = ROWS.filter((r) => r.tab === tab);
  const { inside, outside, movable } = contentsOf(scene, v);

  const scatter = () => {
    if (movable.length === 0) {
      onReport("Nothing to scatter — every object here is the master, locked or hidden.");
      return;
    }
    const fixed = inside.filter((o) => !movable.includes(o));
    // Containment off means the room stops being a fence: the objects still
    // cluster on it, but they are allowed to land outside.
    const region = v.contain ? v : expandVolume(v, LOOSE_SPREAD);
    const result = arrange(
      { volume: v, region, movable, fixed, rules: movable.map((o) => makeRule(o.id)) },
      seed
    );
    scene.applyPlacements(result.placements);
    const where = v.contain ? "" : " — some outside, since containment is off";
    onReport(
      result.unplaced.length === 0
        ? `Placed ${result.placements.length} ${
            result.placements.length === 1 ? "object" : "objects"
          }${where}.`
        : `Placed ${result.placements.length} of ${movable.length}. No room left for ${result.unplaced.length} — widen the space or lower the clearance.`
    );
  };

  const bringInside = () => {
    scene.applyPlacements(
      outside.map((o) => ({
        id: o.id,
        position: clampIntoVolume(v, o.position, halfExtent(o)),
        rotationDeg: o.rotationDeg,
      }))
    );
    onReport(null);
  };

  return (
    /* Position comes from the inspector column in EditorView, not from here —
       the same column the object properties panel sits in, so a space and an
       object put their controls in exactly the same place. */
    <Panel
      ui="volume-inspector"
      thickness="regular"
      className="pointer-events-auto max-h-[46vh] w-full !rounded-2xl"
    >
      <PanelHeader className="px-3 py-2.5">
        <PanelEyebrow>{TABS.find((t) => t.id === tab)?.label}</PanelEyebrow>
        {/* The count belongs to the header, not to a row: it is what the panel
            is ABOUT, and a row would have to open something. */}
        {tab === "contents" && (
          <span className="type-caption text-content-subtle">
            {inside.length} {v.contain ? "inside" : "in reach"}
          </span>
        )}
      </PanelHeader>

      <PanelBody className="p-2">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            data-ui={`volume-prop-${r.key}`}
            onClick={() => onSelect(r.key)}
            className={cn(
              "type-body group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
              active === r.key
                ? "bg-glass/14 text-content"
                : "text-content-muted hover:bg-glass/8 hover:text-content"
            )}
          >
            {active === r.key && (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
            )}
            <Icon name={r.icon} size={15} />
            <span className="flex-1 text-left">{r.label}</span>
            <span className="type-numeric-sm text-content-subtle">
              {summarize(v, r.key)}
            </span>
          </button>
        ))}

        {tab === "contents" && outside.length > 0 && (
          <div
            data-ui="volume-outside"
            className="mt-2 rounded-xl border border-warning/40 bg-warning-soft/30 px-2.5 py-2"
          >
            <p className="type-caption text-warning">
              {outside.length} {outside.length === 1 ? "object sits" : "objects sit"} outside.
              Nothing was moved.
            </p>
            <button
              type="button"
              data-ui="volume-bring-inside"
              onClick={bringInside}
              className="type-caption-strong mt-1.5 text-content underline-offset-2 hover:underline"
            >
              Bring {outside.length === 1 ? "it" : "them"} inside →
            </button>
          </div>
        )}

        {/* The oversized warning is NOT here — it is the bottom-left notice
            (see `VolumeWarning`). It names every object it is about, so in a
            320px column it ran to four lines and pushed the button that fixes
            the problem off the bottom of the panel. And unlike the strays above
            it, there is no action to offer: an object bigger than the room is a
            fact about the room, answered by widening it. */}

        {/* ARRANGING, at the foot of the panel that reports on the room.
            The seed and the button that spends it are one control in practice —
            reroll, scatter, look, reroll — so they are one block, and they are
            here rather than in a centre panel because the count they change is
            the count in this panel's header. */}
        {tab === "contents" && (
          <div className="mt-2 border-t border-glass/10 px-0.5 pt-2.5">
            <div className="flex items-stretch gap-2">
              <label className="field-well flex min-w-0 grow items-center gap-2 rounded-lg border px-2.5 py-1.5">
                <span className="type-caption shrink-0 text-content-subtle">Seed</span>
                <input
                  aria-label="Arrangement seed"
                  data-ui="volume-seed-input"
                  value={seed}
                  inputMode="numeric"
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                    onSeed(Number.isFinite(n) ? n : 0);
                  }}
                  className="type-numeric min-w-0 grow bg-transparent text-content outline-none"
                />
              </label>
              <button
                type="button"
                data-ui="volume-reseed"
                aria-label="New seed"
                title="New seed"
                onClick={() => onSeed(newSeed())}
                className="grid w-10 shrink-0 place-items-center rounded-lg border border-glass/15 bg-glass/8 text-content-muted transition-colors hover:border-glass/30 hover:text-content"
              >
                <Icon name="seed" size={16} />
              </button>
            </div>

            <button
              type="button"
              data-ui="volume-scatter"
              disabled={movable.length === 0}
              onClick={scatter}
              className="type-body-strong mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-glass/15 bg-glass/8 py-2 text-content transition-colors hover:border-glass/30 hover:bg-glass/14 disabled:opacity-40 disabled:hover:border-glass/15 disabled:hover:bg-glass/8"
            >
              <Icon name="shuffle" size={15} />
              Scatter {movable.length} {movable.length === 1 ? "Object" : "Objects"}
            </button>
            <p className="type-caption mt-1.5 text-content-subtle">
              {report ?? "The same seed rebuilds the same arrangement, here and on the farm."}
            </p>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

/* ======================================================== the warning ==== */

/**
 * WHAT IS WRONG WITH THE ROOM, IN THE BOTTOM-LEFT CORNER.
 *
 * It was a note inside the Contents panel and it did not fit there — literally.
 * The message names every object it is about, so seven chairs ran to four lines
 * inside a 320px column and pushed the panel's own controls out of reach; and it
 * is a fact about the SPACE rather than a setting of it, so it kept company with
 * rows it had nothing to do with.
 *
 * The corner is the one part of the viewport nothing else claims: the title sits
 * above it, the toolbar is centred, the inspector is opposite. And a problem
 * with the room should be visible while you fix the room — which is done with
 * the size grips in the viewport, not in the panel this used to live in.
 */
export function VolumeWarning({
  scene,
  volume: v,
  insetLeft = 0,
}: {
  scene: SceneApi;
  volume: SceneVolume;
  insetLeft?: number;
}) {
  const { oversized } = contentsOf(scene, v);
  if (oversized.length === 0) return null;

  const names = oversized.map((o) => o.name).join(", ");
  const many = oversized.length > 1;

  return (
    <div
      data-ui="volume-warning"
      className="pointer-events-none fixed bottom-6 z-30 w-[min(360px,42vw)] transition-[left] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{ left: insetLeft + 16 }}
    >
      <Note tone="warn">
        {names} {many ? "are" : "is"} bigger than this space, so {many ? "they centre" : "it centres"}{" "}
        instead of fitting.
      </Note>
    </div>
  );
}

/* =================================================== the setting control === */

const CONTROL_LABEL: Record<VolumeSetting, string> = {
  move: "Move",
  rotate: "Rotate",
  size: "Size",
  contain: "Keep Objects Inside",
};

/**
 * The small panel over the bottom-centre toolbar — one setting, edited.
 *
 * Deliberately the same shape as `SettingControl`: a grip, a title, a close,
 * and nothing else. It is not draggable, which is the one thing it does not
 * borrow — the object version moves because a material slider has to be dodged
 * around a model you are watching change, and a room's number does not.
 */
export function VolumeSettingControl({
  volume: v,
  setting,
  patch,
  onClose,
}: {
  volume: SceneVolume;
  setting: VolumeSetting;
  patch: (next: Partial<SceneVolume>) => void;
  onClose: () => void;
}) {
  const setVec = (key: "size" | "center", axis: 0 | 1 | 2, raw: string) => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;
    const next = [...v[key]] as Vec3;
    // A room may sit anywhere, but it may not have a side of nothing.
    next[axis] = key === "size" ? Math.max(MIN_VOLUME_SIDE, n) : n;
    patch({ [key]: next });
  };

  return (
    <div className="pointer-events-auto fixed bottom-28 left-1/2 z-30 w-[min(340px,92vw)] -translate-x-1/2">
      <Panel ui="volume-setting" thickness="regular" className="!rounded-2xl p-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <Icon name="drag" size={13} className="shrink-0 text-content-subtle" />
            <span className="type-label truncate text-content">{CONTROL_LABEL[setting]}</span>
          </span>
          <button
            type="button"
            aria-label="Close setting"
            data-ui="volume-setting-close"
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded-md text-content-muted hover:bg-glass/15 hover:text-content"
          >
            <Icon name="close" size={13} />
          </button>
        </div>

        {setting === "move" && (
          <Triple
            labels={["X", "Y", "Z"]}
            values={v.center}
            onChange={(i, raw) => setVec("center", i, raw)}
          />
        )}

        {setting === "size" && (
          <Triple
            labels={["Length", "Height", "Width"]}
            values={v.size}
            onChange={(i, raw) => setVec("size", i, raw)}
          />
        )}

        {setting === "rotate" && (
          <div className="flex items-center gap-2">
            {/* One axis, and it is the only one a room has — a Y-only turn keeps
                the floor flat and the containment maths flat with it, so X and Z
                fields would be two dead controls. */}
            <Icon name="rotate" size={13} className="shrink-0 text-content-subtle" />
            <input
              type="range"
              aria-label="Rotate about Y"
              min={0}
              max={360}
              step={1}
              value={((v.rotationY % 360) + 360) % 360}
              onChange={(e) => patch({ rotationY: parseFloat(e.target.value) })}
              className="h-1 flex-1 cursor-pointer accent-brand"
            />
            <NumberInput
              bordered
              className="w-14 shrink-0"
              aria-label="Rotation about Y in degrees"
              value={Math.round(((v.rotationY % 360) + 360) % 360)}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) patch({ rotationY: n });
              }}
            />
          </div>
        )}

        {setting === "contain" && (
          <ToggleRow
            label="Keep objects inside"
            on={v.contain}
            hint={
              v.contain
                ? "Anything you place while this space is selected lands inside it."
                : "Off — the box still measures the room and still feeds the Arrangement axis."
            }
            onToggle={() => patch({ contain: !v.contain })}
          />
        )}

      </Panel>
    </div>
  );
}

/** A row of three numeric cells — the shape Move and Size share. */
function Triple({
  labels,
  values,
  onChange,
}: {
  labels: [string, string, string];
  values: Vec3;
  onChange: (axis: 0 | 1 | 2, raw: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {labels.map((label, i) => (
        <label key={label} className="block">
          <span className="type-caption mb-1 block text-content-subtle">{label}</span>
          <NumberInput
            bordered
            className="w-full text-left"
            aria-label={label}
            value={Number(values[i].toFixed(2))}
            onChange={(e) => onChange(i as 0 | 1 | 2, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

/** One labelled toggle with a sentence under it. */
function ToggleRow({
  label,
  on,
  hint,
  onToggle,
}: {
  label: string;
  on: boolean;
  hint?: string;
  onToggle: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="type-body truncate text-content-muted">{label}</span>
        <Switch
          label={label}
          on={on}
          onToggle={onToggle}
          ui={`volume-toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        />
      </div>
      {hint && <p className="type-caption mt-1.5 text-content-subtle">{hint}</p>}
    </div>
  );
}
