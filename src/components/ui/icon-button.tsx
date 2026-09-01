import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";

const iconButtonVariants = cva(
  "relative inline-flex items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        solid: "bg-surface-raised text-content-muted hover:text-content hover:bg-surface-overlay border border-line/10",
        ghost: "text-content-muted hover:bg-surface-raised hover:text-content",
        /* For a control whose action is destructive or hard to undo — sign out,
           remove, revoke. Tinted rather than filled: it sits in a row beside
           neutral siblings, and a solid red block there would read as an error
           state rather than an available action. */
        danger:
          "border border-danger/30 bg-danger/10 text-danger hover:border-danger/50 hover:bg-danger/20",
      },
      size: {
        sm: "h-8 w-8",
        md: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  }
);

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    VariantProps<typeof iconButtonVariants> {
  icon: IconName;
  /** required for a11y — icon-only controls need an accessible name */
  label: string;
  iconSize?: number;
  /** show a small brand dot (e.g. unread notifications) */
  indicator?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, icon, label, iconSize = 18, indicator, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      <Icon name={icon} size={iconSize} />
      {indicator && (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand ring-2 ring-surface" />
      )}
    </button>
  )
);
IconButton.displayName = "IconButton";
