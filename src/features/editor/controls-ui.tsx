import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { AXIS, type Axis } from "./scene-palette";

/** Axis accent colors — the same values the viewport gizmo draws with, so the
 *  X you type into matches the X you drag. See scene-palette.ts. */
export const AXIS_COLOR = {
  X: AXIS.X.css,
  Y: AXIS.Y.css,
  Z: AXIS.Z.css,
} as const;
export type { Axis } from "./scene-palette";

/** Number input with a coloured axis prefix (Position row). */
export function AxisNumber({ axis, value, onChange }: { axis: Axis; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field-well flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5">
      <span className="type-label-strong" style={{ color: AXIS_COLOR[axis] }}>{axis}</span>
      <input
        type="number"
        step={0.1}
        value={Number(value.toFixed(3))}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="type-numeric w-full min-w-0 bg-transparent text-content outline-none"
      />
    </div>
  );
}

/** Slider row with a coloured axis label and a value box (Rotation / Scale). */
export function AxisSlider({
  axis,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  axis: Axis;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="type-label-strong w-3" style={{ color: AXIS_COLOR[axis] }}>{axis}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 flex-1 cursor-pointer accent-brand"
      />
      <div className="field-well type-numeric w-12 shrink-0 rounded-md border px-1.5 py-0.5 text-center text-content">
        {display}
      </div>
    </div>
  );
}

/**
 * A COUNT — stepped, or typed.
 *
 * NOT A SLIDER, and the difference is the kind of number. A slider is right for
 * a factor you judge by eye: roughness, brightness, a distance you are watching
 * change. A count of renders is not judged by eye — it is DECIDED, usually as a
 * round number somebody already has in mind, and it multiplies the bill. On a
 * 1–24 track each step was six pixels wide, so "I want twelve" meant dragging
 * and squinting at the readout to see whether it had landed on 11.
 *
 * So: a minus, the number itself, a plus — and the number is an input, because
 * the fastest way to ask for 16 is to type 16.
 *
 * WHY IT KEEPS A DRAFT. Parsing straight through to `onChange` makes an empty
 * field impossible: clearing it to type a new number parses "" as NaN, the
 * value snaps back to the minimum, and the digit you type next lands after a 1.
 * The draft holds what you have typed; the value commits when it parses, and
 * the field re-reads from the value on blur — so a field left empty or holding
 * something senseless returns to what the order actually says.
 */
export function CountField({
  label,
  value,
  onChange,
  min = 1,
  max = 99,
  hint,
  ui,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  hint?: string;
  ui?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  // Follow the value when it changes from somewhere else — a step button, an
  // undo, a fresh draft order.
  useEffect(() => setDraft(String(value)), [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const name = ui ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const step = (by: number) => onChange(clamp(value + by));

  return (
    <div>
      <span className="type-label mb-2 block text-content-muted">{label}</span>
      <div className="flex items-stretch gap-2">
        <StepButton
          ui={`${name}-down`}
          icon="step-down"
          label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => step(-1)}
        />
        <label className="field-well flex min-w-0 grow items-center rounded-lg border px-2.5 py-1.5">
          <input
            aria-label={label}
            data-ui={`${name}-input`}
            value={draft}
            inputMode="numeric"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, "");
              setDraft(raw);
              const n = parseInt(raw, 10);
              if (Number.isFinite(n)) onChange(clamp(n));
            }}
            onBlur={() => setDraft(String(value))}
            className="type-numeric min-w-0 grow bg-transparent text-center text-content outline-none"
          />
        </label>
        <StepButton
          ui={`${name}-up`}
          icon="step-up"
          label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => step(1)}
        />
      </div>
      {hint && <p className="type-caption mt-1.5 text-content-subtle">{hint}</p>}
    </div>
  );
}

/** One end of a stepper. Square, so the pair reads as brackets around the
 *  number rather than as two buttons that happen to sit beside it. */
function StepButton({
  ui,
  icon,
  label,
  disabled,
  onClick,
}: {
  ui: string;
  icon: IconName;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-ui={ui}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid w-10 shrink-0 place-items-center rounded-lg border border-glass/15 bg-glass/8 text-content-muted transition-colors hover:border-glass/30 hover:text-content disabled:opacity-35 disabled:hover:border-glass/15 disabled:hover:text-content-muted"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

/** A titled control block used in the Surface panel (slider + value). The factor
 *  is always active — sliding to 0 is how you turn it off. */
export function FactorCard({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  /** decimals in the readout — a shot COUNT shouldn't render as "24.00" */
  precision = 2,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
}) {
  return (
    <div>
      <span className="type-label mb-2 block text-content-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-brand"
        />
        <div className="field-well type-numeric w-14 shrink-0 rounded-md border px-1.5 py-0.5 text-center text-content">
          {value.toFixed(precision)}
          {unit}
        </div>
      </div>
    </div>
  );
}

export interface PanelTab {
  icon: IconName;
  label: string;
  active?: boolean;
  onClick: () => void;
}

/** The Object/Advanced/Back-style tab row shown beneath an edit panel. */
export function PanelTabs({ tabs }: { tabs: PanelTab[] }) {
  return (
    <div className="pointer-events-auto flex items-center justify-center gap-2.5">
      {tabs.map((t) => (
        <button
          key={t.label}
          type="button"
          data-ui={`panel-tab-${t.label.toLowerCase()}`}
          onClick={t.onClick}
          className={cn(
            "type-label flex min-w-[70px] flex-col items-center gap-0.5 rounded-xl border px-4 py-2 transition-colors",
            t.active
              ? "border-brand bg-brand/15 text-brand"
              : "border-glass/12 bg-glass/6 text-content-muted hover:bg-glass/12 hover:text-content"
          )}
        >
          <Icon name={t.icon} size={17} />
          {t.label}
        </button>
      ))}
    </div>
  );
}
