import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Tooltip } from "./tooltip";

/**
 * EdgeToggle — the collapse control for a rail, sitting ON the rail's right
 * border: a small round chevron, half inside and half outside, that points the
 * way the rail will move. It is the same place whether the rail is open or
 * shut, so the hand doesn't have to find it twice, and it costs the rail none
 * of its own width — the old square button took a slot beside the logo and
 * then jumped to the edge when collapsed.
 *
 * The parent must be positioned (relative / sticky / absolute).
 */
export function EdgeToggle({
  collapsed,
  onToggle,
  label,
  className,
  ui,
}: {
  collapsed: boolean;
  onToggle: () => void;
  /** what is being collapsed — "sidebar", "categories" */
  label: string;
  className?: string;
  /** tracking id → data-ui */
  ui?: string;
}) {
  const text = `${collapsed ? "Expand" : "Collapse"} ${label}`;
  return (
    <Tooltip label={text} side="right" tone="glass">
      <button
        type="button"
        aria-label={text}
        aria-expanded={!collapsed}
        data-ui={ui}
        onClick={onToggle}
        className={cn(
          "absolute -right-3.5 z-20 grid h-7 w-7 place-items-center rounded-full",
          "border border-white/15 bg-[rgb(22_20_18)] text-content-muted shadow-[0_4px_12px_rgb(0_0_0/0.35)]",
          "transition-colors hover:border-white/30 hover:text-content",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={15} strokeWidth={2.2} />
      </button>
    </Tooltip>
  );
}
