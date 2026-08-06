import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  src?: string;
  size?: number;
}

/** Initials avatar with a deterministic brand→accent gradient fallback. */
export function Avatar({ name, src, size = 34, className, ...props }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-medium text-white",
        className
      )}
      style={{
        width: size,
        height: size,
        background: src
          ? undefined
          : "linear-gradient(135deg, hsl(var(--accent)), hsl(var(--brand)))",
      }}
      {...props}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
}
