import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Panel, PanelHeader, PanelEyebrow, PanelBody } from "./ui";
import {
  isWorldAsset,
  materialOf,
  slotEdited,
  UNNAMED_SLOT,
  type MaterialSlot,
  type SceneObject,
} from "./scene-types";
import { formatZoom, type CameraRig } from "./camera-rig";

export type SettingKey =
  | "position"
  | "rotation"
  | "scale"
  | "color"
  | "metallic"
  | "roughness"
  | "specular"
  | "normal"
  | "brightness"
  | "skyInfluence"
  | "cameraMode"
  | "distance"
  | "height"
  | "shotsPerDistance"
  | "shotsPerRotation";

export type SettingGroup = "Transform" | "Material" | "Capture";

const norm360 = (v: number) => Math.round(((v % 360) + 360) % 360);

/**
 * How many material slots the switcher shows before it starts scrolling, and
 * how tall each row is.
 *
 * The height is FIXED rather than natural because a slot's second line is
 * conditional — an exporter's machine-generated material name is suppressed (see
 * `slotSubtitle`) — so rows would otherwise come in two heights and "three rows"
 * would mean a different number of pixels per model. One height, so the cap is
 * exactly three whatever the file is called.
 */
const SLOTS_SHOWN = 3;
const SLOT_ROW_H = 42;
/** Matches the list's `gap-0.5`, so the cap lands on a row edge. */
const SLOT_GAP = 2;

/**
 * The file's own material name, when it is worth showing.
 *
 * Exporters routinely emit names no human wrote — the catalogue's one real GLB
 * calls its material `tripo_node_4db3f717_bd31_4057_b8f6_d811010610b3_material`.
 * A name like that under "Element 0" is noise that pushes the row to two lines
 * and says nothing, so a name only earns its line if it is short enough to read
 * and isn't the placeholder we invented ourselves.
 */
function slotSubtitle(name: string): string | null {
  if (!name || name === UNNAMED_SLOT || name.length > 22) return null;
  return name;
}

const SETTINGS: { key: SettingKey; icon: IconName; label: string; group: SettingGroup }[] = [
  { key: "position", icon: "move", label: "Position", group: "Transform" },
  { key: "rotation", icon: "rotate", label: "Rotation", group: "Transform" },
  { key: "scale", icon: "scale", label: "Scale", group: "Transform" },
  { key: "color", icon: "color", label: "Color", group: "Material" },
  { key: "metallic", icon: "surface", label: "Metallic", group: "Material" },
  { key: "roughness", icon: "adjust", label: "Roughness", group: "Material" },
  { key: "specular", icon: "generate", label: "Specular", group: "Material" },
  { key: "normal", icon: "tune", label: "Normal", group: "Material" },
  { key: "brightness", icon: "sunny", label: "Brightness", group: "Material" },
  { key: "skyInfluence", icon: "environment", label: "Sky Influence", group: "Material" },
  { key: "distance", icon: "scale", label: "Zoom Distance", group: "Transform" },
  { key: "height", icon: "move", label: "Height", group: "Transform" },
  { key: "cameraMode", icon: "capture", label: "Mode", group: "Capture" },
  { key: "shotsPerDistance", icon: "move", label: "Increments", group: "Capture" },
  { key: "shotsPerRotation", icon: "camera", label: "Shots / Rotation", group: "Capture" },
];

/**
 * A camera has no scale and no material. What it has instead is a relationship
 * to the master object: where it stands (position), how far in the sweep zooms
 * (distance), and how the master is turned in front of it — the turntable
 * orbit, which is the only rotation a locked-on camera can express.
 */
const CAMERA_TRANSFORM: SettingKey[] = ["position", "rotation", "distance", "height"];

/**
 * The five PBR factors, which mean something only where there is a surface to
 * shade. A Gaussian splat is baked light — no albedo to tint, no microsurface to
 * roughen — so it takes none of them.
 */
const PBR: SettingKey[] = ["color", "metallic", "roughness", "specular", "normal"];

/**
 * The Material group each source actually has.
 *
 * Two answers, so the panel asks the source rather than showing everything and
 * greying most of it out. A world asset — HDRI, skybox or splat — has the two
 * sky parameters: how bright it renders, and how much of it lands on the
 * objects. Everything else has the five PBR factors, per slot.
 */
function materialKeysFor(source: SceneObject["source"]): SettingKey[] {
  return isWorldAsset(source) ? ["brightness", "skyInfluence"] : PBR;
}

/** Brightness is the object's own on a splat and the sky's on a backdrop. Same
 *  field, same control — but "Brightness" over an HDRI reads as the object's
 *  own, and the thing it brightens is the whole sky.
 *
 *  It also answers "does this thing have a transform": a sky is a texture
 *  wrapped around the scene, so it has no position, no rotation and no scale —
 *  see the Transform filter in the component below and ObjectToolbar, which
 *  stops offering the tab those rows live on. */
const isSky = (source: SceneObject["source"]) =>
  source === "environment" || source === "skybox";

/**
 * Rig properties, not object ones. Zoom Distance is how far in the pair reaches
 * from the master and Height is the climb between its two ends — neither means
 * anything for a mesh, where they only ever read "—". They sit in the Transform
 * group because on a camera that is where they belong, so the group alone can't
 * decide who sees them.
 */
const CAMERA_ONLY: SettingKey[] = ["distance", "height"];

function summarize(
  o: SceneObject,
  /** the slot the Material rows are reporting on */
  mat: MaterialSlot,
  rig: CameraRig | null,
  key: SettingKey,
  /** the master's turntable angle, and how far in the sweep zooms */
  orbit: number | null,
  zoom: number | null,
  /** the rig's climb — how far the far camera stands above the near one */
  height: number | null
): { text?: string; swatch?: string } {
  switch (key) {
    case "position":
      return { text: o.position.map((v) => v.toFixed(1)).join(", ") };
    case "rotation":
      // From a camera, "rotation" is the master's orbit angle: the camera is
      // locked on the master, so turning the subject is the only rotation that
      // changes the shot — see CAMERA_TRANSFORM.
      return {
        text:
          o.source === "camera" && orbit != null
            ? `${norm360(orbit)}°`
            : o.rotationDeg.map((v) => `${norm360(v)}°`).join(", "),
      };
    case "distance":
      // How far in the sweep zooms, against the rig's own framing at 1x — see
      // `zoomOf`. Metres are what the rig stores; this is what it means.
      return { text: zoom != null ? formatZoom(zoom) : "—" };
    case "height":
      // Still metres: a climb is an elevation, not a magnification.
      return { text: height != null ? `${height.toFixed(1)} m` : "—" };
    case "scale":
      return { text: `${o.scale[0].toFixed(2)}×` };
    // The five factors answer for the slot being edited, not for the object —
    // an object with three materials has three different roughnesses and the
    // row has to say which one you are looking at.
    case "color":
      return { swatch: mat.color };
    case "metallic":
      return { text: mat.metalness.toFixed(2) };
    case "roughness":
      return { text: mat.roughness.toFixed(2) };
    case "specular":
      return { text: mat.specular.toFixed(2) };
    case "normal":
      return { text: mat.normal.toFixed(2) };
    case "brightness":
      return { text: o.brightness.toFixed(2) };
    case "skyInfluence":
      return { text: o.skyInfluence.toFixed(2) };
    case "cameraMode":
      return { text: rig?.mode === "fixed" ? "Fixed" : "Rotatable" };
    case "shotsPerDistance":
      return { text: rig ? String(rig.shotsPerDistance) : "—" };
    case "shotsPerRotation":
      return { text: rig ? String(rig.shotsPerRotation) : "—" };
  }
}

/**
 * ObjectPropertiesPanel — compact, bottom-right list of the settings for the
 * active toolbar tab (Transform or Material). Picking a row surfaces just that
 * control in the small bottom-center panel (SettingControl).
 */
export function ObjectPropertiesPanel({
  object,
  rig,
  group,
  active,
  onSelect,
  slot = 0,
  onSlot,
  orbit,
  zoom,
  height,
}: {
  object: SceneObject;
  /** the capture rig this camera belongs to — null for ordinary objects */
  rig?: CameraRig | null;
  group: SettingGroup;
  active: SettingKey | null;
  onSelect: (k: SettingKey) => void;
  /** which material slot the five factors are pointed at */
  slot?: number;
  onSlot?: (i: number) => void;
  /** the master's turntable angle, for the Rotation row's readout */
  orbit?: number | null;
  /** how far in the sweep zooms, as a multiple of the rig's own framing */
  zoom?: number | null;
  /** the rig's climb, for the Height row */
  height?: number | null;
}) {
  const isCamera = object.source === "camera";
  const material = materialOf(object, slot);
  // The switcher earns its space only where there is a choice to make. A
  // single-material object showing a one-item list would be a control that
  // cannot be operated.
  const slots = object.materials;
  const showSlots = group === "Material" && slots.length > 1;
  const materialKeys = materialKeysFor(object.source);

  const items = SETTINGS.filter(
    (s) =>
      s.group === group &&
      // Rig-only rows never reach an ordinary object.
      (!CAMERA_ONLY.includes(s.key) || isCamera) &&
      // Scale is meaningless on a camera; the rig's reach is set by moving it.
      (!isCamera || group !== "Transform" || CAMERA_TRANSFORM.includes(s.key)) &&
      // A sky has no transform at all — three sliders that moved a texture
      // wrapped around the whole world, which is to say moved nothing.
      !(group === "Transform" && isSky(object.source)) &&
      // Each source's Material group is its own set — see `materialKeysFor`.
      (s.group !== "Material" || materialKeys.includes(s.key))
  );

  return (
    /* Position comes from the bottom-right column in EditorView, not from here:
       the camera POV stacks on top of this panel and the two have to share one
       edge, which they can't if both pin themselves to the corner. */
    <Panel
      ui="object-properties"
      thickness="regular"
      className="pointer-events-auto max-h-[46vh] w-full !rounded-2xl"
    >
      {/* No gizmo switcher in the header. The three rows below ARE the switcher
          — picking Position, Rotation or Scale already arms the matching
          handles (see `selectSetting` in EditorView) — so the segmented control
          was a second copy of a choice the list makes, sitting above the list
          that makes it. */}
      <PanelHeader className="px-3 py-2.5">
        {/* "Material" over two sky sliders names a thing a sky does not have,
            and it disagreed with the tile that opened it — see ObjectToolbar,
            where the same group reads Appearance for a sky and a splat. */}
        <PanelEyebrow>
          {group === "Material" && (isSky(object.source) || object.source === "splat")
            ? "Appearance"
            : group}
        </PanelEyebrow>
      </PanelHeader>

      {/* No camera picker and no Uniform switch: the pair IS the rig, and every
          transform drives both. Editing one end on its own only ever produced a
          sweep whose two halves disagreed about where the rig was. */}

      {/* THE SLOT SWITCHER — §3's "navigate between material slots".

          It sits above the factors rather than beside them because it changes
          what all five of them mean: the rows below are Element 2's roughness,
          not the object's. Switching writes nothing (see `updateMaterial`) —
          it moves this cursor, and the slots you are not looking at keep every
          value you gave them. */}
      {showSlots && (
        <div className="border-b border-glass/10 px-2 py-2">
          {/* THREE AT A TIME, THEN SCROLL.

              The panel is one of three stacked in the bottom-right column and
              already caps itself at 46vh; a model with eleven materials would
              spend the whole of it on the switcher and push the five factors —
              the controls you came here to use — off the bottom. Three is
              enough to show that the list IS a list and that there is more
              below, without the switcher outgrowing what it switches.

              Capped by row count rather than a guessed height: SLOT_ROW_H is
              the row's own height, so the two cannot drift apart. `pr-0.5`
              leaves the slim scrollbar somewhere to sit without it landing on
              the edited dots. */}
          <div
            data-ui="mat-slot-list"
            className={cn(
              "flex flex-col gap-0.5",
              slots.length > SLOTS_SHOWN && "overflow-y-auto pr-0.5"
            )}
            style={
              slots.length > SLOTS_SHOWN
                ? { maxHeight: SLOTS_SHOWN * SLOT_ROW_H + (SLOTS_SHOWN - 1) * SLOT_GAP }
                : undefined
            }
          >
            {slots.map((m, i) => {
              const on = i === slot;
              return (
                <button
                  key={`${m.name}-${i}`}
                  type="button"
                  data-ui={`mat-slot-${i}`}
                  aria-pressed={on}
                  onClick={() => onSlot?.(i)}
                  style={{ height: SLOT_ROW_H }}
                  className={cn(
                    "flex w-full shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors",
                    // A STROKE, not just a wash. The rows below the switcher use
                    // the same soft glass fill for their own selection, so a
                    // filled slot read as "one more row" rather than as the
                    // thing the five controls below are pointed at. An outline
                    // in the brand hue says "editing this one" — and it is a
                    // ring, so arming a slot cannot nudge the list's layout.
                    on
                      ? "bg-brand/12 text-content ring-1 ring-inset ring-brand/60"
                      : "text-content-muted ring-1 ring-inset ring-transparent hover:bg-glass/8 hover:text-content"
                  )}
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-md ring-1 ring-glass/20"
                    style={{ background: m.color }}
                  />
                  <span className="min-w-0 flex-1">
                    {/* Element N first: it is the name the engine end uses, and
                        it is the one every slot is guaranteed to have. The
                        file's own material name goes underneath when it reads
                        as a name — see `slotSubtitle`. */}
                    <span className="type-body block truncate">Element {i}</span>
                    {slotSubtitle(m.name) && (
                      <span className="type-caption block truncate text-content-subtle">
                        {slotSubtitle(m.name)}
                      </span>
                    )}
                  </span>
                  {slotEdited(m) && (
                    <span
                      title="Edited"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand ring-2 ring-brand/25"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <PanelBody className="p-2">
        {items.map((s) => {
          const sum = summarize(object, material, rig ?? null, s.key, orbit ?? null, zoom ?? null, height ?? null);
          return (
            <button
              key={s.key}
              type="button"
              data-ui={`prop-${s.key}`}
              onClick={() => onSelect(s.key)}
              className={cn(
                "type-body group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
                active === s.key ? "bg-glass/14 text-content" : "text-content-muted hover:bg-glass/8 hover:text-content"
              )}
            >
              {active === s.key && <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand" />}
              <Icon name={s.icon} size={15} />
              <span className="flex-1 text-left">
                {isCamera && s.key === "rotation"
                  ? "Orbit Rotation"
                  : s.key === "brightness" && isSky(object.source)
                    ? "Sky Brightness"
                    : s.label}
              </span>
              {sum.swatch ? (
                <span className="h-4 w-4 rounded-full ring-1 ring-glass/20" style={{ background: sum.swatch }} />
              ) : (
                <span className="type-numeric-sm text-content-subtle">{sum.text}</span>
              )}
            </button>
          );
        })}
      </PanelBody>

      {/* No plan footer. The sweep length, pass grid and frame total belong to
          the Work Order, which is where a dataset is actually sized and billed —
          repeating them under the capture settings made the panel read as a
          second, narrower place to decide the same thing. */}
    </Panel>
  );
}
