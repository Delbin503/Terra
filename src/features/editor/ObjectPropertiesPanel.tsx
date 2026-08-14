import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Panel, PanelHeader, PanelEyebrow, PanelBody } from "./ui";
import type { SceneObject } from "./scene-types";
import type { CameraRig } from "./camera-rig";

export type SettingKey =
  | "position"
  | "rotation"
  | "scale"
  | "color"
  | "metallic"
  | "roughness"
  | "specular"
  | "normal"
  | "cameraMode"
  | "distance"
  | "height"
  | "shotsPerDistance"
  | "shotsPerRotation";

export type SettingGroup = "Transform" | "Material" | "Capture";

const norm360 = (v: number) => Math.round(((v % 360) + 360) % 360);

const SETTINGS: { key: SettingKey; icon: IconName; label: string; group: SettingGroup }[] = [
  { key: "position", icon: "move", label: "Position", group: "Transform" },
  { key: "rotation", icon: "rotate", label: "Rotation", group: "Transform" },
  { key: "scale", icon: "scale", label: "Scale", group: "Transform" },
  { key: "color", icon: "color", label: "Color", group: "Material" },
  { key: "metallic", icon: "surface", label: "Metallic", group: "Material" },
  { key: "roughness", icon: "adjust", label: "Roughness", group: "Material" },
  { key: "specular", icon: "generate", label: "Specular", group: "Material" },
  { key: "normal", icon: "tune", label: "Normal", group: "Material" },
  { key: "distance", icon: "scale", label: "Distance", group: "Transform" },
  { key: "height", icon: "move", label: "Height", group: "Transform" },
  { key: "cameraMode", icon: "capture", label: "Mode", group: "Capture" },
  { key: "shotsPerDistance", icon: "move", label: "Increments", group: "Capture" },
  { key: "shotsPerRotation", icon: "camera", label: "Shots / Rotation", group: "Capture" },
];

/**
 * A camera has no scale and no material. What it has instead is a relationship
 * to the master object: where it stands (position), how far the rig reaches
 * (distance), and how the master is turned in front of it — the turntable
 * orbit, which is the only rotation a locked-on camera can express.
 */
const CAMERA_TRANSFORM: SettingKey[] = ["position", "rotation", "distance", "height"];

function summarize(
  o: SceneObject,
  rig: CameraRig | null,
  key: SettingKey,
  /** the master's turntable angle, and the rig's near/far reach */
  orbit: number | null,
  distance: number | null,
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
      // The near reach — the number this control edits. The far one is where
      // the rig is parked and is read off the cameras themselves.
      return { text: distance != null ? `${distance.toFixed(1)} m` : "—" };
    case "height":
      return { text: height != null ? `${height.toFixed(1)} m` : "—" };
    case "scale":
      return { text: `${o.scale[0].toFixed(2)}×` };
    case "color":
      return { swatch: o.color };
    case "metallic":
      return { text: o.metalness.toFixed(2) };
    case "roughness":
      return { text: o.roughness.toFixed(2) };
    case "specular":
      return { text: o.specular.toFixed(2) };
    case "normal":
      return { text: o.normal.toFixed(2) };
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
  orbit,
  distance,
  height,
}: {
  object: SceneObject;
  /** the capture rig this camera belongs to — null for ordinary objects */
  rig?: CameraRig | null;
  group: SettingGroup;
  active: SettingKey | null;
  onSelect: (k: SettingKey) => void;
  /** the master's turntable angle, for the Rotation row's readout */
  orbit?: number | null;
  /** how far the rig stands off the master — shared by both cameras */
  distance?: number | null;
  /** the rig's climb, for the Height row */
  height?: number | null;
}) {
  const isCamera = object.source === "camera";
  const items = SETTINGS.filter(
    (s) =>
      s.group === group &&
      // Distance is a camera-rig property — how far the rig reaches from the
      // master. On an ordinary object it has no meaning (it only ever read "—"),
      // so it lives on the camera alone.
      (s.key !== "distance" || isCamera) &&
      // Scale is meaningless on a camera; the rig's reach is set by moving it.
      (!isCamera || group !== "Transform" || CAMERA_TRANSFORM.includes(s.key))
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
        <PanelEyebrow>{group}</PanelEyebrow>
      </PanelHeader>

      {/* No camera picker and no Uniform switch: the pair IS the rig, and every
          transform drives both. Editing one end on its own only ever produced a
          sweep whose two halves disagreed about where the rig was. */}

      <PanelBody className="p-2">
        {items.map((s) => {
          const sum = summarize(object, rig ?? null, s.key, orbit ?? null, distance ?? null, height ?? null);
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
                {isCamera && s.key === "rotation" ? "Orbit Rotation" : s.label}
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
