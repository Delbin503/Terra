import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/glass";
import { Icon } from "@/components/icons";
import { AxisNumber, AxisSlider, FactorCard } from "./controls-ui";
import { OBJECT_COLORS, type SceneObject } from "./scene-types";
import type { SettingKey } from "./ObjectPropertiesPanel";

const norm360 = (v: number) => ((v % 360) + 360) % 360;
const LABEL: Record<SettingKey, string> = {
  position: "Position",
  rotation: "Rotation",
  scale: "Scale",
  color: "Color",
  metallic: "Metallic Factor",
  roughness: "Roughness Factor",
  specular: "Specular Control",
  normal: "Normal Intensity",
};

const AXES = ["X", "Y", "Z"] as const;

/**
 * SettingControl — the compact bottom-center panel that shows ONLY the setting
 * picked in the right Properties panel. Deliberately small (xs controls).
 */
export function SettingControl({
  object,
  setting,
  onChange,
  onClose,
}: {
  object: SceneObject;
  setting: SettingKey;
  onChange: (patch: Partial<SceneObject>) => void;
  onClose: () => void;
}) {
  const [uniform, setUniform] = useState(true);

  // Drag offset from the default bottom-centre spot. Kept as a delta so the
  // panel stays centred until the user actually moves it, and so it survives
  // switching between settings.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragFrom = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const startDrag = (e: React.PointerEvent) => {
    dragFrom.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDrag = (e: React.PointerEvent) => {
    const d = dragFrom.current;
    if (!d) return;
    setOffset({ x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) });
  };
  const endDrag = (e: React.PointerEvent) => {
    dragFrom.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const isCustom = !OBJECT_COLORS.includes(object.color);

  const setAxis = (key: "position" | "rotationDeg" | "scale", i: number, v: number) => {
    if (key === "scale" && uniform) return onChange({ scale: [v, v, v] });
    const next = [...object[key]] as [number, number, number];
    next[i] = v;
    onChange({ [key]: next } as Partial<SceneObject>);
  };

  return (
    <div
      className="pointer-events-auto fixed bottom-28 left-1/2 z-30 w-[min(340px,92vw)]"
      style={{ transform: `translateX(-50%) translate(${offset.x}px, ${offset.y}px)` }}
    >
      <GlassPanel ui="setting-control" thickness="regular" className="!rounded-2xl p-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div
            data-ui="setting-drag"
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            title="Drag to move"
            className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 active:cursor-grabbing"
            style={{ touchAction: "none" }}
          >
            <Icon name="drag" size={13} className="shrink-0 text-content-subtle" />
            <span className="truncate text-xs font-medium text-content">{LABEL[setting]}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {setting === "scale" && (
              <button
                type="button"
                onClick={() => setUniform((u) => !u)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium transition-colors",
                  uniform ? "border-brand/50 bg-brand/12 text-brand" : "border-glass/14 text-content-muted hover:text-content"
                )}
              >
                <Icon name="lock" size={11} /> Uniform
              </button>
            )}
            <button
              type="button"
              aria-label="Close setting"
              data-ui="setting-close"
              onClick={onClose}
              className="grid h-6 w-6 place-items-center rounded-md text-content-muted hover:bg-glass/15 hover:text-content"
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        </div>

        {setting === "position" && (
          <div className="grid grid-cols-3 gap-2">
            {AXES.map((a, i) => (
              <AxisNumber key={a} axis={a} value={object.position[i]} onChange={(v) => setAxis("position", i, v)} />
            ))}
          </div>
        )}

        {setting === "rotation" && (
          <div className="flex flex-col gap-2">
            {AXES.map((a, i) => (
              <AxisSlider
                key={a}
                axis={a}
                min={0}
                max={360}
                step={1}
                value={norm360(object.rotationDeg[i])}
                display={`${Math.round(norm360(object.rotationDeg[i]))}°`}
                onChange={(v) => setAxis("rotationDeg", i, v)}
              />
            ))}
          </div>
        )}

        {setting === "scale" && (
          <div className="flex flex-col gap-2">
            {AXES.map((a, i) => (
              <AxisSlider
                key={a}
                axis={a}
                min={0.1}
                max={3}
                step={0.01}
                value={Math.min(3, object.scale[i])}
                display={`${object.scale[i].toFixed(2)}×`}
                onChange={(v) => setAxis("scale", i, v)}
              />
            ))}
          </div>
        )}

        {setting === "color" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {OBJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  data-ui={`color-${c}`}
                  onClick={() => onChange({ color: c })}
                  style={{ background: c }}
                  className={cn(
                    "h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-transparent transition-transform hover:scale-105",
                    object.color === c ? "ring-brand" : "ring-transparent"
                  )}
                />
              ))}
            </div>

            {/* Custom colour. The native picker is a full-size transparent
                overlay so the visible swatch can be styled freely — styling
                <input type="color"> directly is inconsistent across browsers. */}
            <label
              data-ui="color-custom"
              className="flex cursor-pointer items-center gap-2.5 border-t border-glass/10 pt-3"
            >
              <span
                style={{ background: object.color }}
                className={cn(
                  "relative grid h-8 w-8 shrink-0 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-transparent transition-transform hover:scale-105",
                  isCustom ? "ring-brand" : "ring-glass/25"
                )}
              >
                {!isCustom && <Icon name="create" size={13} className="text-white/90" />}
                <input
                  type="color"
                  aria-label="Custom colour"
                  value={object.color}
                  onChange={(e) => onChange({ color: e.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-content">Custom</span>
                <span className="block text-2xs uppercase tabular-nums text-content-subtle">{object.color}</span>
              </span>
            </label>
          </div>
        )}

        {setting === "metallic" && (
          <FactorCard label="Metallic" value={object.metalness} onChange={(v) => onChange({ metalness: v })} />
        )}
        {setting === "roughness" && (
          <FactorCard label="Roughness" value={object.roughness} onChange={(v) => onChange({ roughness: v })} />
        )}
        {setting === "specular" && (
          <FactorCard label="Specular" value={object.specular} onChange={(v) => onChange({ specular: v })} />
        )}
        {setting === "normal" && (
          <FactorCard label="Normal" value={object.normal} onChange={(v) => onChange({ normal: v })} max={8} />
        )}
      </GlassPanel>
    </div>
  );
}
