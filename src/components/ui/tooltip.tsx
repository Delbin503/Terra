import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

/** Convenience wrapper: <Tooltip label="Home" side="right">{trigger}</Tooltip> */
export function Tooltip({
  label,
  children,
  side = "right",
  hidden,
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  hidden?: boolean;
}) {
  if (hidden) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          className={cn(
            "type-label z-50 rounded-md border border-line/12 bg-surface-overlay px-2.5 py-1.5 text-content shadow-pop",
            "animate-fade-in"
          )}
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
