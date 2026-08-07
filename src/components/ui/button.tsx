import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        brand:
          "bg-brand text-brand-foreground hover:bg-brand-hover shadow-xs",
        accent:
          "bg-accent text-accent-foreground hover:bg-accent-hover shadow-xs",
        secondary:
          "bg-surface-raised text-content border border-line/10 hover:border-line/20 hover:bg-surface-overlay",
        ghost: "text-content-muted hover:bg-surface-raised hover:text-content",
        outline:
          "border border-line/15 text-content hover:border-brand hover:text-brand",
        danger: "bg-danger text-white hover:brightness-110",
      },
      // Size owns both the box and its text style — the button scale is tied
      // to control height, not to the prose ramp.
      size: {
        sm: "type-button-sm h-8 px-3",
        md: "type-button h-9 px-4",
        lg: "type-button-lg h-11 px-5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
