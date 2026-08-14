import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/glass";
import { Icon } from "@/components/icons";
import { AxisNumber, AxisSlider, FactorCard } from "./controls-ui";
import { NumberInput } from "./ui";
import { OBJECT_COLORS, type SceneObject } from "./scene-types";
import {
  DISTANCE_SHOTS_RANGE,
  SHOTS_RANGE,
  maxStops,
  orbitSweep,
  stopGap,
  type CameraRig,
} from "./camera-rig";
import { CaptureExplainer, type CaptureTopic } from "./CaptureExplainer";
import type { SettingKey } from "./ObjectPropertiesPanel";

/**
 * Which settings have an explainer behind the header's info button.
 *
 * The three capture settings are the ones whose name doesn't tell you what you
 * are buying — "Increments" and "Shots / Rotation" multiply into a frame count,
 * and Mode decides whether either applies at all. Everything else in this panel
 * is a number with a unit, and a diagram of what "Position X" means would be
 * padding.
 */
const EXPLAINS: Partial<Record<SettingKey, CaptureTopic>> = {
  cameraMode: "cameraMode",
  shotsPerDistance: "shotsPerDistance",
  shotsPerRotation: "shotsPerRotation",
};

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
  cameraMode: "Camera Mode",
  distance: "Distance from Master",
  height: "Camera Height",
  shotsPerDistance: "Shots per Distance",
  shotsPerRotation: "Shots per Rotation",
};

const AXES = ["X", "Y", "Z"] as const;

/**
 * SettingControl — the compact bottom-center panel that shows ONLY the setting
 * picked in the right Properties panel. Deliberately small (xs controls).
 */
export function SettingControl({
  object,
  rig,
  setting,
  camera,
  onChange,
  onRigChange,
  onOrbit,
  onDistance,
  onDistanceHandle,
  onHeight,
  onClose,
}: {
  object: SceneObject;
  /** the capture rig, when the selection is one of its cameras */
  rig?: CameraRig | null;
  setting: SettingKey;
  /**
   * The camera's relationship to the master object, when there is one: the
   * master's turntable angle, the rig's near/far reach, and how close TerraGen
   * will allow. Absent for ordinary objects and for a rig with no master.
   */
  camera?: {
    /** where the rig stands around the master, as a compass bearing */
    orbit: number;
    masterName: string;
    /** where the sweep starts — the near camera's reach */
    nearDistance: number;
    /** where the sweep ends — the far camera's reach */
    farDistance: number;
    /** all but touching the master */
    nearLimit: number;
    /** as far back as the master stays the subject */
    farLimit: number;
    /** the climb — how far the far camera stands above the near one */
    span: number;
    /** straight overhead: the far camera can climb no further on its sphere */
    spanMax: number;
    /**
     * How far the rig travels from the near pose to the far one — the length
     * the increments divide up. Not `far − near`: the two ends differ in height
     * as well as reach, so the sweep is the diagonal, and that's the distance
     * the stops are actually spaced along.
     */
    sweep: number;
  } | null;
  onChange: (patch: Partial<SceneObject>) => void;
  onRigChange?: (patch: Partial<CameraRig>) => void;
  /** swing the rig to this bearing around the master */
  onOrbit?: (deg: number) => void;
  /** set the sweep's near reach — the far one is where the rig is parked */
  onDistance?: (metres: number) => void;
  /** which handle is in hand, so the viewport can ghost the other end */
  onDistanceHandle?: (h: "min" | "max" | null) => void;
  /** set the climb between the two cameras */
  onHeight?: (metres: number) => void;
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

  /**
   * The explainer is asked for, not served.
   *
   * It used to sit permanently under the control — a diagram, a paragraph and a
   * frame sum, in a 340px panel floating over the viewport the user is trying
   * to judge. That is a lot of screen for something you read once and never
   * again, and it pushed the control it explains up out of the way. Behind the
   * header's info button it is one click away for the first run and invisible
   * for every run after.
   *
   * The preference persists while the panel is open, so someone who wants the
   * diagrams keeps them as they step from Increments to Shots / Rotation.
   */
  const [explain, setExplain] = useState(false);
  const topic = EXPLAINS[setting];

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
            <span className="type-label truncate text-content">
              {setting === "rotation" && camera ? "Orbit Rotation" : LABEL[setting]}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {setting === "scale" && (
              <button
                type="button"
                onClick={() => setUniform((u) => !u)}
                className={cn(
                  "type-caption-strong flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors",
                  uniform ? "border-brand/50 bg-brand/12 text-brand" : "border-glass/14 text-content-muted hover:text-content"
                )}
              >
                <Icon name="lock" size={11} /> Uniform
              </button>
            )}
            {topic && rig && (
              <button
                type="button"
                aria-label="What this setting does"
                aria-pressed={explain}
                title="What this setting does"
                data-ui="setting-explain"
                onClick={() => setExplain((v) => !v)}
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-md transition-colors",
                  explain
                    ? "bg-brand/15 text-brand"
                    : "text-content-muted hover:bg-glass/15 hover:text-content"
                )}
              >
                <Icon name="info" size={13} />
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

        {setting === "rotation" && camera && onOrbit ? (
          /* From a camera, rotation ORBITS THE RIG around the master. The pair
             is locked on the object, so spinning a camera in place changes
             nothing about the shot — where it's taken from is the whole
             control. Both cameras swing together, each keeping its own height
             and reach, and the ring in the viewport runs along the circle they
             actually travel. */
          <div className="flex flex-col gap-2">
            {/* The arc's two ends BRACKET the slider rather than sitting on a
                row beneath it: the left number is where the sweep starts, the
                right is where it stops, and the handle between them is where
                the rig is standing right now. Read left to right, the control
                is the sentence "from here, round to there, currently here". */}
            <div className="flex items-center gap-2">
              {rig && onRigChange ? (
                <NumberInput
                  bordered
                  className="w-14 shrink-0"
                  aria-label="Arc origin bearing"
                  data-ui="camera-arc-start"
                  value={Math.round(rig.orbitStart)}
                  onChange={(e) => onRigChange({ orbitStart: parseFloat(e.target.value) || 0 })}
                />
              ) : (
                <Icon name="rotate" size={13} className="shrink-0 text-content-subtle" />
              )}

              <input
                type="range"
                aria-label="Orbit cameras around master"
                data-ui="camera-orbit-slider"
                min={0}
                max={360}
                step={1}
                value={Math.round(norm360(camera.orbit))}
                onChange={(e) => onOrbit(parseFloat(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-brand"
              />

              {rig && onRigChange && (
                <NumberInput
                  bordered
                  className="w-14 shrink-0"
                  aria-label="Arc maximum bearing"
                  data-ui="camera-arc-end"
                  value={Math.round(rig.orbitEnd)}
                  onChange={(e) => onRigChange({ orbitEnd: parseFloat(e.target.value) || 0 })}
                />
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="type-caption text-content-subtle">
                Origin · {rig ? Math.round(rig.orbitStart) : 0}°
              </span>
              <span className="type-caption-strong text-content">
                {Math.round(norm360(camera.orbit))}° now
              </span>
              <span className="type-caption text-content-subtle">
                {rig ? Math.round(orbitSweep(rig.orbitStart, rig.orbitEnd)) : 360}° swept
              </span>
            </div>

            <p className="type-caption text-content-subtle">
              Swings both cameras around {camera.masterName}, keeping their height and reach.
              Drag the ring in the viewport for the same thing.
            </p>
          </div>
        ) : setting === "rotation" ? (
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
        ) : null}

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
                <span className="type-label block text-content">Custom</span>
                <span className="type-eyebrow block tabular-nums text-content-subtle">{object.color}</span>
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

        {/* ---- Capture settings (camera rigs only) ---- */}
        {setting === "cameraMode" && rig && (
          <div className="flex flex-col gap-2">
            {(
              [
                {
                  value: "rotatable" as const,
                  label: "Rotatable",
                  hint: "Master turns a full revolution at each height, stepping start → end.",
                },
                {
                  value: "fixed" as const,
                  label: "Fixed",
                  hint: "One front-on frame. No orbit, no climb.",
                },
              ]
            ).map((m) => (
              <button
                key={m.value}
                type="button"
                data-ui={`camera-mode-${m.value}`}
                onClick={() => onRigChange?.({ mode: m.value })}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors",
                  rig.mode === m.value
                    ? "border-brand/50 bg-brand/12"
                    : "border-glass/12 hover:bg-glass/8"
                )}
              >
                <span className="type-body-strong flex items-center gap-1.5 text-content">
                  {rig.mode === m.value && <Icon name="check" size={12} strokeWidth={3} className="text-brand" />}
                  {m.label}
                </span>
                <span className="type-caption text-content-subtle">{m.hint}</span>
              </button>
            ))}
          </div>
        )}

        {setting === "height" && camera && onHeight && (
          /**
           * The climb, as a number rather than only a drag.
           *
           * Zero puts both cameras at the same height — a flat turntable pass.
           * The far camera rises and falls STRAIGHT, directly above the near
           * one, so the rig stays a mast and never leans into a slope.
           */
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Icon name="move" size={13} className="shrink-0 text-content-subtle" />
              <input
                type="range"
                aria-label="Height between the two cameras"
                data-ui="camera-height-slider"
                min={0}
                max={Math.max(0.1, camera.spanMax)}
                step={0.1}
                value={Math.min(Math.max(0, camera.span), Math.max(0.1, camera.spanMax))}
                onChange={(e) => onHeight(parseFloat(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-brand"
              />
              <div className="field-well type-numeric w-16 shrink-0 rounded-md border px-1.5 py-0.5 text-center text-content">
                {camera.span.toFixed(1)} m
              </div>
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                data-ui="camera-height-level"
                onClick={() => onHeight(0)}
                className="type-caption text-content-subtle transition-colors hover:text-content"
              >
                Level · 0 m
              </button>
              <button
                type="button"
                data-ui="camera-height-overhead"
                onClick={() => onHeight(camera.spanMax)}
                className="type-caption text-content-subtle transition-colors hover:text-content"
              >
                {camera.spanMax.toFixed(1)} m · Max
              </button>
            </div>
            <p className="type-caption text-content-subtle">
              How far the far camera stands above the near one. The near camera holds still and the
              far one moves straight up and down, so the pair stays a vertical mast over{" "}
              {camera.masterName} rather than leaning into a slope. Drag the gauge beside the rig in
              the viewport for the same thing.
            </p>
          </div>
        )}

        {setting === "distance" && camera && onDistance && (
          <DistanceControl
            nearDistance={camera.nearDistance}
            farDistance={camera.farDistance}
            nearLimit={camera.nearLimit}
            masterName={camera.masterName}
            onHandle={onDistanceHandle}
            onChange={onDistance}
          />
        )}

        {setting === "shotsPerDistance" && rig && camera && (
          <div className="flex flex-col gap-2">
            {/* Capped by what the sweep can actually hold: past that the extra
                stops are the same frame billed again. */}
            <FactorCard
              label="Increments"
              value={Math.min(rig.shotsPerDistance, maxStops(camera.sweep))}
              min={DISTANCE_SHOTS_RANGE.min}
              max={maxStops(camera.sweep)}
              step={DISTANCE_SHOTS_RANGE.step}
              precision={0}
              onChange={(v) => onRigChange?.({ shotsPerDistance: Math.round(v) })}
            />
            <p className="type-caption text-content-subtle">
              {rig.shotsPerDistance <= 1
                ? "One stop — the rig shoots its rotation without climbing."
                : `${rig.shotsPerDistance} stops between the two ends, ` +
                  `${stopGap(camera.sweep, rig.shotsPerDistance).toFixed(2)} m apart. ` +
                  `Room for ${maxStops(camera.sweep)} over this ${camera.sweep.toFixed(1)} m sweep.`}
            </p>
          </div>
        )}

        {setting === "shotsPerRotation" && rig && (
          <div className="flex flex-col gap-2">
            <FactorCard
              label="Shots / Rotation"
              value={rig.shotsPerRotation}
              min={SHOTS_RANGE.min}
              max={SHOTS_RANGE.max}
              step={SHOTS_RANGE.step}
              precision={0}
              onChange={(v) => onRigChange?.({ shotsPerRotation: Math.round(v) })}
            />
          </div>
        )}

        {/* One mount for all three topics, at the foot of the panel — so the
            control stays where it is when the explainer opens under it rather
            than the whole body jumping. */}
        {explain && topic && rig && <CaptureExplainer topic={topic} rig={rig} />}
      </GlassPanel>
    </div>
  );
}

/**
 * How far each END of the sweep stands off the master — two handles, not one.
 *
 * The pair used to share a single distance, which made the rig a fixed-radius
 * arc: the cameras differed only in height and the capture never moved in or
 * out. Two handles restore the reach as something the sweep TRAVELS, and since
 * `planCapture` interpolates between the two camera poses, both numbers land in
 * the rendered frames rather than decorating the panel.
 *
 * `onHandle` is what puts the afterimage in the viewport: while a handle is in
 * hand the scene ghosts BOTH cameras at the opposite end, so the envelope the
 * sweep covers is visible during the edit rather than inferred after it.
 *
 * Both sliders are bounded by real limits, not arbitrary ones:
 *   · Nearest — all but touching the master. TerraGen clamps here anyway, so
 *     the floor is shown rather than applied silently behind the user.
 *   · Furthest — where the master stops being the subject of the frame.
 */
function DistanceControl({
  nearDistance,
  farDistance,
  nearLimit,
  masterName,
  onChange,
  onHandle,
}: {
  nearDistance: number;
  farDistance: number;
  nearLimit: number;
  masterName: string;
  onChange: (metres: number) => void;
  onHandle?: (h: "min" | "max" | null) => void;
}) {
  const ceiling = Math.max(nearLimit + 0.1, farDistance);
  const value = Math.min(ceiling, Math.max(nearLimit, nearDistance));
  const pct = ((value - nearLimit) / Math.max(0.1, ceiling - nearLimit)) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* The far reach, stated not editable. It's where the pair is parked
            and it's set by dragging the cameras — but the near end is only
            meaningful against it, so it reads on the same line rather than in
            a sentence underneath. */}
        <div
          data-ui="camera-distance-far"
          title="Furthest — where the rig stands. Drag a camera to change it."
          className="field-well type-numeric w-16 shrink-0 rounded-md border px-1.5 py-0.5 text-center text-content-subtle"
        >
          {farDistance.toFixed(1)} m
        </div>

        <input
          type="range"
          aria-label="Nearest distance from master"
          data-ui="camera-distance-near"
          min={nearLimit}
          max={ceiling}
          step={0.1}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onPointerDown={() => onHandle?.("min")}
          onPointerUp={() => onHandle?.(null)}
          onBlur={() => onHandle?.(null)}
          className="h-1 flex-1 cursor-pointer accent-brand"
        />

        <div className="field-well type-numeric w-16 shrink-0 rounded-md border px-1.5 py-0.5 text-center text-content">
          {value.toFixed(1)} m
        </div>
      </div>

      {/* The reach the sweep travels, drawn once. */}
      <div className="relative h-1.5 overflow-hidden rounded-full border border-glass/10 bg-glass/5">
        <div
          className="absolute inset-y-0 bg-brand/50"
          style={{ left: `${pct}%`, right: 0 }}
          aria-hidden
        />
      </div>

      <p className="type-caption text-content-subtle">
        The rig stands at {farDistance.toFixed(1)} m from {masterName} and sweeps in to here. While
        this control is open the pair previews at the near end, with yellow markers where they
        return to.
      </p>
    </div>
  );
}
