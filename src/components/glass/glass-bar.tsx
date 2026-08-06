import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { GlassPanel, type GlassPanelProps } from "./glass-panel";

/**
 * GlassBar — a horizontal glass container for floating toolbars / clusters.
 * Wraps GlassPanel (thick material) with a shape: `pill` (rounded-full) or
 * `panel` (rounded-2xl). Reuse instead of hand-rolling GlassPanel + flex.
 */
const glassBarVariants = cva("flex items-center", {
  variants: { shape: { pill: "!rounded-full", panel: "!rounded-2xl" } },
  defaultVariants: { shape: "pill" },
});

export interface GlassBarProps
  extends Omit<GlassPanelProps, "thickness">,
    VariantProps<typeof glassBarVariants> {}

export const GlassBar = React.forwardRef<HTMLDivElement, GlassBarProps>(
  ({ className, shape, ...props }, ref) => (
    <GlassPanel
      ref={ref}
      thickness="regular"
      className={cn(glassBarVariants({ shape }), className)}
      {...props}
    />
  )
);
GlassBar.displayName = "GlassBar";

/** Thin vertical hairline separating groups inside a GlassBar. */
export function GlassDivider({ className }: { className?: string }) {
  return <span aria-hidden className={cn("h-6 w-px bg-glass/15", className)} />;
}
