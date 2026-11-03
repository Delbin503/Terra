import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";

/** How often the corner re-checks what it has to clear — the guide's own rate. */
const POLL_MS = 250;

/** One thing the editor is doing right now. */
export interface Activity {
  id: string;
  label: string;
  detail?: string;
  /** 0–100; omitted for work with no measurable progress (SAB's adds) */
  progress?: number;
}

/**
 * EVERYTHING IN FLIGHT, IN ONE CORNER.
 *
 * SAB's adds, a MAT preview and a 3D generation all used to report somewhere
 * different: SAB in this corner, the two generate passes in a block pinned
 * inside their own panels — which is only where you are looking if you are
 * still looking at that panel. Work you started and walked away from belongs
 * where finished work is announced, so it shows here too, and in ONE card:
 * three jobs running at once are three rows, not three stacked cards climbing
 * over the object toolbar.
 *
 * The black card is SAB's original loader, kept: it reads over any sky.
 *
 * The Getting-started guide shares this corner and sits above everything, so
 * while it is open the card stacks ON it rather than vanishing beneath it.
 */
export function EditorActivity({ items, dockOpen }: { items: Activity[]; dockOpen: boolean }) {
  const above = useGuideTop(items.length > 0);
  if (items.length === 0) return null;
  return (
    <div
      data-ui="editor-activity"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "pointer-events-none absolute z-30 transition-[bottom] duration-300 ease-out",
        // On the guide: its left edge and its width, so the two read as one
        // column. Alone: the corner every other notice uses, above the asset
        // library's bottom sheet when it is up.
        above === null
          ? cn("left-6", dockOpen ? "bottom-[calc(3rem+clamp(260px,40vh,392px))]" : "bottom-6")
          : "left-4"
      )}
      style={above === null ? undefined : { bottom: above }}
    >
      <div className={cn("flex flex-col gap-3", above === null ? "w-[340px]" : "w-[300px]", "rounded-2xl border border-white/20 bg-black/90 px-5 py-3.5 text-white shadow-pop backdrop-blur-md")}>
        {items.map((a) => (
          <div key={a.id} data-ui={`editor-activity-${a.id}`} className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Icon name="spinner" size={20} className="shrink-0 animate-spin text-brand" />
              <div className="min-w-0 flex-1">
                <p className="type-body-strong truncate">{a.label}</p>
                {a.detail && <p className="type-caption truncate text-white/70">{a.detail}</p>}
              </div>
              {a.progress !== undefined && (
                <span className="type-numeric-sm shrink-0 tabular-nums text-white/70">
                  {Math.round(a.progress)}%
                </span>
              )}
            </div>
            {a.progress !== undefined && (
              <div
                role="progressbar"
                aria-label={a.label}
                aria-valuenow={Math.round(a.progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1 w-full overflow-hidden rounded-full bg-white/15"
              >
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-100 ease-linear"
                  style={{ width: `${a.progress}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Distance from the bottom of the window to just above the open guide, or
 *  null when there is no guide on screen (the guide already clears the
 *  asset library itself, so stacking on it clears both). */
function useGuideTop(active: boolean) {
  const [bottom, setBottom] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const place = () => {
      const g = document.querySelector<HTMLElement>('[data-ui="glass-guide"]');
      const r = g?.getBoundingClientRect();
      setBottom(r && r.height > 0 ? window.innerHeight - r.top + 12 : null);
    };
    place();
    const id = window.setInterval(place, POLL_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return bottom;
}
