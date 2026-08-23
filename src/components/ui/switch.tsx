import { cn } from "@/lib/utils";

/**
 * Switch — an immediate on/off, for preferences that take effect as you set them.
 *
 * A checkbox would be wrong here: these are not fields you fill in and submit,
 * they are states you leave the screen in. Brand colour marks "on" because the
 * whole point of a wall of these is scanning which ones are lit.
 */
export function Switch({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** the accessible name — the visible text lives beside it, not in here */
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-brand" : "bg-surface-overlay border border-line/15",
        className
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition-[left]",
          checked ? "left-[1.125rem]" : "left-0.5"
        )}
      />
    </button>
  );
}
