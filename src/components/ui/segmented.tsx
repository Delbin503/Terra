import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";

/**
 * Segmented — a small set of mutually exclusive choices, in a well.
 *
 * Two shapes, one control: labelled options (All / Shared) and icon-only ones
 * (grid / list). They sit side by side in the Projects toolbar, so they have to
 * be the same object at the same height — which is why the icon form is a
 * variant here rather than its own component.
 *
 * Selection is a raised pill inside a recessed track: the same "lit thing sits
 * on top" idea as the sidebar's active row, at control scale.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  /** always the accessible name; drawn as text unless the group is `iconOnly` */
  label: string;
  icon?: IconName;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  iconOnly,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** names the group for screen readers — the options only name themselves */
  ariaLabel: string;
  /** draw the glyphs alone; each label becomes the button's name and tooltip */
  iconOnly?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-lg bg-surface p-1",
        className
      )}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            aria-label={iconOnly ? option.label : undefined}
            title={iconOnly ? option.label : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              "type-button-sm flex h-8 items-center justify-center gap-1.5 rounded-md transition-colors",
              iconOnly ? "w-9" : "px-4",
              on
                ? "bg-surface-raised text-content"
                : "text-content-muted hover:text-content"
            )}
          >
            {option.icon && <Icon name={option.icon} size={17} />}
            {!iconOnly && option.label}
          </button>
        );
      })}
    </div>
  );
}
