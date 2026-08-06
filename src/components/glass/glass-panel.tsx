import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * GlassPanel — the base visionOS overlay material.
 * Composes the .glass* classes (globals.css) built from --glass-* tokens.
 * Use for any floating surface above the 3D canvas: bars, clusters, inspectors.
 *
 * Tag each instance with a `ui` name → emits data-ui="glass-<ui>" so the same
 * identifier is traceable across Figma layer ↔ code ↔ runtime.
 */
export type GlassThickness = "thin" | "regular" | "thick" | "chrome";

const thicknessClass: Record<GlassThickness, string> = {
  thin: "glass glass-thin",
  regular: "glass",
  thick: "glass glass-thick",
  chrome: "glass glass-chrome",
};

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  thickness?: GlassThickness;
  /** adds the frost-on-hover + lift interaction */
  interactive?: boolean;
  /** frost-not-color selection state */
  selected?: boolean;
  /** tracking id → data-ui="glass-<ui>" */
  ui?: string;
}

export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ thickness = "regular", interactive, selected, ui, className, ...props }, ref) => (
    <div
      ref={ref}
      data-ui={ui ? `glass-${ui}` : undefined}
      className={cn(
        thicknessClass[thickness],
        interactive && "glass-interactive",
        selected && "glass-selected",
        className
      )}
      {...props}
    />
  )
);
GlassPanel.displayName = "GlassPanel";
