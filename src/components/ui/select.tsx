import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";

/**
 * Select — a native select wearing the app's clothes.
 *
 * Native on purpose: keyboard, type-ahead, mobile pickers and screen readers all
 * come free, and none of the filters in Settings need a custom-rendered option.
 * `appearance-none` removes the platform arrow so one chevron is drawn instead.
 */
export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  options: { value: string; label: string }[];
  /** rendered before the value, e.g. "Seat Type: " */
  prefix?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, prefix, ...props }, ref) => (
    <span
      className={cn(
        "glass-thin relative inline-flex h-9 items-center !rounded-lg pl-3 pr-8",
        className
      )}
    >
      {prefix && (
        <span className="type-body pointer-events-none shrink-0 text-content-subtle">
          {prefix}
        </span>
      )}
      <select
        ref={ref}
        className="type-body h-full min-w-0 flex-1 appearance-none bg-transparent text-content outline-none"
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface-overlay">
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size={15}
        aria-hidden
        className="pointer-events-none absolute right-2.5 text-content-subtle"
      />
    </span>
  )
);
Select.displayName = "Select";
