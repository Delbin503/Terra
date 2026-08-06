import { cn } from "@/lib/utils";

interface MeterProps {
  /** 0–100 */
  value: number;
  tone?: "brand" | "success" | "warning" | "danger";
  className?: string;
}

const toneMap: Record<NonNullable<MeterProps["tone"]>, string> = {
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** Thin progress meter used for credit + render-time usage. */
export function Meter({ value, tone = "brand", className }: MeterProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-surface-sunken", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", toneMap[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
