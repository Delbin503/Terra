import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";

/** Axis accent colors (match the reference: X red, Y green, Z blue). */
export const AXIS_COLOR = { X: "#e5675f", Y: "#7fae7f", Z: "#6f7bd0" } as const;
export type Axis = keyof typeof AXIS_COLOR;

/** Number input with a coloured axis prefix (Position row). */
export function AxisNumber({ axis, value, onChange }: { axis: Axis; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-glass/12 bg-black/20 px-2.5 py-1.5">
      <span className="text-xs font-semibold" style={{ color: AXIS_COLOR[axis] }}>{axis}</span>
      <input
        type="number"
        step={0.1}
        value={Number(value.toFixed(3))}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full min-w-0 bg-transparent text-xs tabular-nums text-content outline-none"
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
      <span className="w-3 text-xs font-semibold" style={{ color: AXIS_COLOR[axis] }}>{axis}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 flex-1 cursor-pointer accent-brand"
      />
      <div className="w-12 shrink-0 rounded-md border border-glass/12 bg-black/20 px-1.5 py-0.5 text-center text-xs tabular-nums text-content">
        {display}
      </div>
    </div>
  );
}

/** A titled control block used in the Surface panel (slider + value). The factor
 *  is always active — sliding to 0 is how you turn it off. */
export function FactorCard({
  label,
  value,
  onChange,
  max = 1,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <span className="mb-2 block text-xs font-medium text-content-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label={label}
          min={0}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-brand"
        />
        <div className="w-12 shrink-0 rounded-md bg-black/20 px-1.5 py-0.5 text-center text-xs tabular-nums text-content">
          {value.toFixed(2)}
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
            "flex min-w-[70px] flex-col items-center gap-0.5 rounded-xl border px-4 py-2 text-xs font-medium transition-colors",
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
