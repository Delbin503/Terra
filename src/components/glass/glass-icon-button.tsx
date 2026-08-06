import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";

/**
 * GlassIconButton — circular visionOS control. Frost-not-color hover.
 * Icon-only, so `label` is required for accessibility (matches IconButton).
 * Emits data-ui="glass-btn-<icon>" (override via `ui`) for tracking.
 */
const glassIconButtonVariants = cva(
  "grid place-items-center rounded-full text-content glass glass-interactive outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      // material thickness of the button itself
      tone: {
        chrome: "glass-chrome",
        regular: "",
      },
      size: {
        sm: "h-9 w-9",
        md: "h-11 w-11",
        lg: "h-12 w-12",
      },
      active: { true: "glass-selected", false: "" },
    },
    defaultVariants: { tone: "regular", size: "md", active: false },
  }
);

export interface GlassIconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    VariantProps<typeof glassIconButtonVariants> {
  icon: IconName;
  /** required for a11y — icon-only controls need an accessible name */
  label: string;
  iconSize?: number;
  ui?: string;
}

export const GlassIconButton = React.forwardRef<HTMLButtonElement, GlassIconButtonProps>(
  ({ className, tone, size, active, icon, label, iconSize = 20, ui, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active ?? undefined}
      title={label}
      data-ui={`glass-btn-${ui ?? icon}`}
      className={cn(glassIconButtonVariants({ tone, size, active }), className)}
      {...props}
    >
      <Icon name={icon} size={iconSize} strokeWidth={1.8} />
    </button>
  )
);
GlassIconButton.displayName = "GlassIconButton";
