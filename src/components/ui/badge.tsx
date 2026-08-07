import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full",
  {
    variants: {
      variant: {
        brand: "bg-brand-soft text-brand",
        accent: "bg-accent-soft text-accent",
        neutral: "bg-surface-overlay text-content-muted",
        success: "bg-success-soft text-success",
        outline: "border border-brand text-brand",
      },
      size: {
        sm: "type-badge-sm px-2 py-0.5",
        md: "type-badge px-2.5 py-0.5",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}
