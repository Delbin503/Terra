import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Tooltip } from "@/components/ui";

/**
 * GlassGhostButton — an icon-only control that sits INSIDE a glass bar/cluster
 * (no nested glass material). Frost-tint on hover. Requires `label` for a11y.
 * Emits data-ui="glass-ghost-<ui|label>" for tracking.
 *
 * `label` also becomes a hover tooltip, in the brand tint — the same bubble the
 * MAT preview hint uses. These buttons are icon-only and sit over a 3D scene, so
 * the label is the only thing that says what they do; the browser's own `title`
 * tooltip is a grey box that takes a second to appear and can't be styled to
 * stay legible against whatever is rendered behind it.
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
  /** required for a11y — icon-only controls need an accessible name, and it
   *  doubles as the hover tooltip */
  label: string;
  iconSize?: number;
  ui?: string;
  /** which side the tooltip opens on — these bars sit at the top, so below */
  tipSide?: "top" | "right" | "bottom" | "left";
  /** drop the tooltip, for a button whose meaning is already spelled out */
  noTip?: boolean;
}

export const GlassGhostButton = React.forwardRef<HTMLButtonElement, GlassGhostButtonProps>(
  ({ className, size, icon, label, iconSize, ui, tipSide = "bottom", noTip, ...props }, ref) => (
    <Tooltip label={label} side={tipSide} tone="glass" hidden={noTip}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        /* `title` ONLY while disabled. Browsers suppress mouse events on a
           disabled control, so Radix never sees the hover and our bubble can't
           open — and a disabled icon is exactly when the label matters most
           ("No preview yet — run MAT to create one"). The native tooltip is the
           only thing that still shows there. Enabled buttons omit it, or the two
           bubbles stack. */
        title={props.disabled ? label : undefined}
        data-ui={`glass-ghost-${ui ?? label.toLowerCase().replace(/\s+/g, "-")}`}
        className={cn(glassGhostButtonVariants({ size }), className)}
        {...props}
      >
        <Icon name={icon} size={iconSize ?? (size === "sm" ? 17 : 18)} />
      </button>
    </Tooltip>
  )
);
GlassGhostButton.displayName = "GlassGhostButton";
