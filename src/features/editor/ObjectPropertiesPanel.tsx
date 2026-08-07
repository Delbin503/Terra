import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Panel, PanelHeader, PanelEyebrow, PanelBody } from "./ui";
import type { SceneObject } from "./scene-types";

export type SettingKey =
  | "position"
  | "rotation"
  | "scale"
  | "color"
  | "metallic"
  | "roughness"
  | "specular"
  | "normal";

export type SettingGroup = "Transform" | "Material";
type GizmoMode = "translate" | "rotate" | "scale";

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
];

function summarize(o: SceneObject, key: SettingKey): { text?: string; swatch?: string } {
  switch (key) {
    case "position":
      return { text: o.position.map((v) => v.toFixed(1)).join(", ") };
    case "rotation":
      return { text: o.rotationDeg.map((v) => `${norm360(v)}°`).join(", ") };
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
  }
}

/**
 * ObjectPropertiesPanel — compact, bottom-right list of the settings for the
 * active toolbar tab (Transform or Material). Picking a row surfaces just that
 * control in the small bottom-center panel (SettingControl).
 */
export function ObjectPropertiesPanel({
  object,
  group,
  active,
  onSelect,
  gizmoMode,
  setGizmoMode,
}: {
  object: SceneObject;
  group: SettingGroup;
  active: SettingKey | null;
  onSelect: (k: SettingKey) => void;
  gizmoMode: GizmoMode;
  setGizmoMode: (m: GizmoMode) => void;
}) {
  const items = SETTINGS.filter((s) => s.group === group);

  return (
    <Panel
      ui="object-properties"
      thickness="regular"
      className="fixed bottom-6 right-6 z-30 max-h-[34vh] w-[248px] !rounded-2xl"
    >
      <PanelHeader className="px-3 py-2.5">
        <PanelEyebrow>{group}</PanelEyebrow>
        {group === "Transform" && (
          <Segmented
            value={gizmoMode}
            onChange={(v) => setGizmoMode(v as GizmoMode)}
            options={[
              { icon: "move", value: "translate" },
              { icon: "rotate", value: "rotate" },
              { icon: "scale", value: "scale" },
            ]}
          />
        )}
      </PanelHeader>

      <PanelBody className="p-2">
        {items.map((s) => {
          const sum = summarize(object, s.key);
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
              <span className="flex-1 text-left">{s.label}</span>
              {sum.swatch ? (
                <span className="h-4 w-4 rounded-full ring-1 ring-glass/20" style={{ background: sum.swatch }} />
              ) : (
                <span className="type-numeric-sm text-content-subtle">{sum.text}</span>
              )}
            </button>
          );
        })}
      </PanelBody>
    </Panel>
  );
}

function Segmented({ options, value, onChange }: { options: { icon: IconName; value: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-glass/8 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-label={o.value}
          data-ui={`gizmo-mode-${o.value}`}
          onClick={() => onChange(o.value)}
          className={cn(
            "grid h-6 w-6 place-items-center rounded-full transition-colors",
            value === o.value ? "bg-brand text-brand-foreground" : "text-content-muted hover:text-content"
          )}
        >
          <Icon name={o.icon} size={13} />
        </button>
      ))}
    </div>
  );
}
