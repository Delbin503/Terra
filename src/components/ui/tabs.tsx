import { cn } from "@/lib/utils";

/**
 * Tabs — underlined, for switching what a page is showing.
 *
 * Distinct from Segmented on purpose. A segmented control is a FILTER sitting in
 * a toolbar next to other controls; these are the page's own sections, so they
 * sit on the page's baseline and are marked by an underline rather than a pill.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex gap-6 border-b border-line/10", className)}
    >
      {tabs.map((tab) => {
        const on = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.id)}
            className={cn(
              "type-body-lg-strong -mb-px border-b-2 pb-2.5 transition-colors",
              on
                ? "border-brand text-content"
                : "border-transparent text-content-subtle hover:text-content"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
