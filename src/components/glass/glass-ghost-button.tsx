import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";

/**
 * GlassGhostButton — an icon-only control that sits INSIDE a glass bar/cluster
 * (no nested glass material). Frost-tint on hover. Requires `label` for a11y.
 * Emits data-ui="glass-ghost-<ui|label>" for tracking.
 */
const glassGhostButtonVariants = cva(
  "grid shrink-0 place-items-center rounded-full text-content-muted transition-colors hover:bg-glass/15 hover:text-content outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-content-muted",
  {
    variants: { size: { sm: "h-8 w-8", md: "h-9 w-9" } },
    defaultVariants: { size: "md" },
  }
);

export interface GlassGhostButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    VariantProps<typeof glassGhostButtonVariants> {
  icon: IconName;
  /** required for a11y — icon-only controls need an accessible name */
  label: string;
  iconSize?: number;
  ui?: string;
}

export const GlassGhostButton = React.forwardRef<HTMLButtonElement, GlassGhostButtonProps>(
  ({ className, size, icon, label, iconSize, ui, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      data-ui={`glass-ghost-${ui ?? label.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(glassGhostButtonVariants({ size }), className)}
      {...props}
    >
      <Icon name={icon} size={iconSize ?? (size === "sm" ? 17 : 18)} />
    </button>
  )
);
GlassGhostButton.displayName = "GlassGhostButton";
