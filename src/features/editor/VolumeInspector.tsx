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

export type VolumeTab = "objects" | "containment" | "contents";

/** The first tile is "Objects" for the same reason an object's is: it is where
 *  the transform lives, and a space and a mesh should keep theirs in the same
 *  place under the same word. */
const TABS: { id: VolumeTab; icon: IconName; label: string }[] = [
  { id: "objects", icon: "input-3d", label: "Objects" },
  { id: "containment", icon: "space", label: "Containment" },
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
            tab === t.id ? "text-content" : "text-content-muted"
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
export type VolumeSetting = "move" | "rotate" | "size" | "contain" | "walls" | "margin";

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
  { key: "contain", tab: "containment", icon: "space", label: "Keep inside" },
  { key: "walls", tab: "containment", icon: "grid", label: "Show walls" },
  { key: "margin", tab: "containment", icon: "adjust", label: "Edge margin" },
];

const deg = (v: number) => `${Math.round(((v % 360) + 360) % 360)}°`;

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
    case "walls":
      return v.showWalls ? "On" : "Off";
    case "margin":
      return `${v.margin.toFixed(2)} m`;
  }
}

/**
 * The bottom-right list for the focused space.
 *
 * A LIST OF ROWS, NOT A STACK OF FORMS. It held three forms at once, which made
 * it the only panel in this corner that didn't look like `ObjectPropertiesPanel`
 * — and, more to the point, gave the viewport nothing to key a gizmo off. Picking
 * a row is what arms the handles, the same bargain an object makes: Position
 * lights the translate arrows, Rotation lights the ring.
 *
 * Contents is not a settings list and doesn't pretend to be one — it is a report
 * with two buttons, the way the camera POV is a picture rather than a form.
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
  seed: number;
  report: string | null;
  onSelect: (k: VolumeSetting) => void;
  onSeed: (n: number) => void;
  onReport: (s: string | null) => void;
}) {
  const rows = ROWS.filter((r) => r.tab === tab);

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
      </PanelHeader>

      <PanelBody className={tab === "contents" ? "p-3" : "p-2"}>
        {tab === "contents" ? (
          <Contents
            scene={scene}
            volume={v}
            seed={seed}
            report={report}
            onSeed={onSeed}
            onReport={onReport}
          />
        ) : (
          rows.map((r) => (
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
              <span className="type-numeric-sm text-content-subtle">{summarize(v, r.key)}</span>
            </button>
          ))
        )}
      </PanelBody>
    </Panel>
  );
}

/* =================================================== the setting control === */

const CONTROL_LABEL: Record<VolumeSetting, string> = {
  move: "Move",
  rotate: "Rotate",
  size: "Size",
  contain: "Keep Objects Inside",
  walls: "Show Walls",
  margin: "Edge Margin",
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
                ? "While this space is selected, anything you place lands inside it."
                : "Off — the box still measures the room and still feeds the Arrangement axis."
            }
            onToggle={() => patch({ contain: !v.contain })}
          />
        )}

        {setting === "walls" && (
          <ToggleRow
            label="Show walls"
            on={v.showWalls}
            hint="Draws the four sides. It changes the picture, not the containment."
            onToggle={() => patch({ showWalls: !v.showWalls })}
          />
        )}

        {setting === "margin" && (
          <div className="flex items-center gap-2">
            <input
              type="range"
              aria-label="Edge margin"
              min={0}
              max={1}
              step={0.01}
              value={v.margin}
              onChange={(e) => patch({ margin: parseFloat(e.target.value) })}
              className="h-1 flex-1 cursor-pointer accent-brand"
            />
            <NumberInput
              bordered
              className="w-14 shrink-0"
              aria-label="Edge margin in metres"
              value={v.margin}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) patch({ margin: Math.max(0, n) });
              }}
            />
          </div>
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

/* -------------------------------------------------------------- contents */

function Contents({
  scene,
  volume: v,
  seed,
  report,
  onSeed,
  onReport,
}: {
  scene: SceneApi;
  volume: SceneVolume;
  seed: number;
  report: string | null;
  onSeed: (n: number) => void;
  onReport: (s: string | null) => void;
}) {
  const outside = v.contain ? scene.outsideVolume : [];
  const containable = scene.objects.filter(
    (o) => o.source !== "camera" && o.source !== "environment" && o.source !== "skybox"
  );
  const inside = v.contain ? containable.filter((o) => !outside.includes(o)) : containable;
  const oversized = inside.filter((o) => isOversized(v, o));

  const scatter = () => {
    const movable = inside.filter((o) => o.role !== "master" && !o.locked && !o.hidden);
    const fixed = inside.filter((o) => !movable.includes(o));
    if (movable.length === 0) {
      onReport("Nothing to scatter — every object here is the master, locked or hidden.");
      return;
    }
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
    <div className="flex flex-col gap-3">
      <p className="type-body text-content-muted">
        {inside.length} {inside.length === 1 ? "object" : "objects"}{" "}
        {v.contain ? "inside" : "in reach"}
      </p>

      {outside.length > 0 && (
        <div
          data-ui="volume-outside"
          className="rounded-xl border border-warning/40 bg-warning-soft/30 px-2.5 py-2"
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

      {oversized.length > 0 && (
        <Note tone="warn">
          {oversized.map((o) => o.name).join(", ")} {oversized.length === 1 ? "is" : "are"} bigger
          than this space, so {oversized.length === 1 ? "it centres" : "they centre"} instead of
          fitting.
        </Note>
      )}

      <div className="flex items-stretch gap-2">
        <label className="field-well flex min-w-0 grow items-center gap-2 rounded-lg border px-2.5 py-1.5">
          <span className="type-caption shrink-0 text-content-subtle">Seed</span>
          <input
            aria-label="Arrangement seed"
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
        onClick={scatter}
        className="type-body-strong flex w-full items-center justify-center gap-2 rounded-lg border border-glass/15 bg-glass/8 py-2 text-content transition-colors hover:border-glass/30 hover:bg-glass/14"
      >
        <Icon name="shuffle" size={15} />
        Scatter contents
      </button>

      {report && <p className="type-caption text-content-subtle">{report}</p>}
    </div>
  );
}

