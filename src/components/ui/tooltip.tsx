import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

/**
 * How the bubble is painted.
 *
 * `surface` is the quiet one — an overlay panel with a hairline, for tooltips
 * that label something already obvious (a collapsed sidebar's icons).
 *
 * `brand` is the loud one, and it's the same treatment as the MAT preview hint:
 * solid orange, no border, with an arrow pointing at what it names. Editor
 * chrome floats over a photographic 3D scene where a translucent bubble can
 * land on a blown-out sky and disappear — being the one opaque thing on screen
 * is the point, and it's why the hint was built that way rather than as glass.
 */
/**
 * `glass` is the chrome one: the same material the floating bars are made of,
 * so a bubble naming an icon in one of them looks like the icon's own hover
 * tint grew a label rather than like a separate object arriving on top. Uses the
 * `overlay` tier — the thickest — because unlike the hover tint it has no bar
 * behind it to sit on, only the scene.
 */
export type TooltipTone = "surface" | "brand" | "glass";

const TONE: Record<TooltipTone, { bubble: string; arrow: string }> = {
  surface: {
    bubble: "border border-line/12 bg-surface-overlay text-content",
    arrow: "fill-surface-overlay",
  },
  brand: {
    bubble: "bg-brand text-brand-foreground",
    arrow: "fill-brand",
  },
  glass: {
    bubble: "glass glass-overlay text-content",
    arrow: "",
  },
};

/** Convenience wrapper: <Tooltip label="Home" side="right">{trigger}</Tooltip> */
export function Tooltip({
  label,
  children,
  side = "right",
  tone = "surface",
  hidden,
  delay = 200,
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  tone?: TooltipTone;
  hidden?: boolean;
  /** ms before the bubble appears */
  delay?: number;
}) {
  if (hidden) return <>{children}</>;
  const painted = TONE[tone];
  return (
    <TooltipPrimitive.Root delayDuration={delay}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          // Kept clear of the viewport edge: the editor's icons sit in the top
          // corners, where a centred bubble would otherwise overhang.
          collisionPadding={12}
          className={cn(
            "type-label z-50 max-w-[16rem] rounded-lg px-2.5 py-1.5 shadow-pop",
            "animate-fade-in",
            painted.bubble
          )}
        >
          {label}
          {/* Radix's arrow, so it tracks the side and any collision flip —
              the hint's hand-placed rotated square can't do either. Only the
              tinted tone draws one; on `surface` the hairline border would be
              cut by the arrow's untinted edge. */}
          {tone === "brand" && (
            <TooltipPrimitive.Arrow width={10} height={5} className={painted.arrow} />
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
