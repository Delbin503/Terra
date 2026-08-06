import * as React from "react";
import { cn } from "@/lib/utils";

/** Base surface card. `interactive` adds hover lift for clickable tiles. */
export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }
>(({ className, interactive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-line/10 bg-surface-raised",
      interactive &&
        "cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:border-line/20",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";
