import * as React from "react";
import { cn } from "@/lib/utils";
import { GlassPanel, GlassGhostButton } from "@/components/glass";
import { Icon } from "@/components/icons";

/**
 * PANEL DOCK — the editor's right-hand column of stacked tool panels.
 * ------------------------------------------------------------------
 * Every tool panel (Layers, MAT Preview, Generate 3D Mesh, the AI chatbot) used
 * to float on its own at the left edge, at its own width, and each one replaced
 * whichever was already there. Three things were wrong with that:
 *
 *   · Four panels, four widths (300 / 380 / 400 / 420). Nothing lined up, and
 *     the same control sat at a different x depending on which panel you opened.
 *   · Opening a second tool closed the first. You could not read the layer tree
 *     while a mesh generated, which is exactly when you want both.
 *   · They sat over the left rail's own gutter, so the panel you opened covered
 *     the buttons you opened it from.
 *
 * So: ONE column, on the right, under the orientation cube. Every panel is
 * DOCK_WIDTH wide, every panel collapses to its header, and every panel can be
 * dragged to a height. Panels stack in the order they were opened and the
 * column scrolls if the stack outgrows it — nothing is ever closed on your
 * behalf.
 *
 * WHY PIXEL HEIGHTS AND NOT FLEX. A stack where every panel shares the space
 * re-flows all of them every time one opens, so a height you set by hand
 * survives only until you open something else. Explicit heights mean a panel
 * stays where you put it; the column scrolls instead of squeezing.
 */

/** One width for the whole dock. Wide enough for the AI transcript and the
 *  3D-generate form, narrow enough to leave the viewport usable. */
export const DOCK_WIDTH = 320;

/** Nothing may be dragged shorter than its header plus a usable sliver. */
const MIN_HEIGHT = 140;

/**
 * How close a dragged panel may come to the bottom of the viewport.
 *
 * The same 24px gutter the dock column itself keeps, which is also where the
 * centre toolbar's tiles end — so a panel can now be dragged down until it is
 * level with the bottom of those icons and no further. It used to be a flat
 * `innerHeight - 160`, measured from the top of the WINDOW rather than from the
 * panel, which stopped the first panel ~80px short of the column it lives in
 * and stopped a stacked second panel far shorter than that.
 */
const BOTTOM_GUTTER = 24;

/**
 * The column. Positioned by the caller (it hangs under the orientation cube,
 * whose geometry EditorView owns), and inert to pointers so the viewport stays
 * draggable in the gaps between panels.
 */
export function PanelDock({
  top,
  bottom = 24,
  children,
}: {
  /** distance from the top of the viewport — clears the cube and its readout */
  top: number;
  /** Raised when the asset library's bottom dock is open, so the column ends
   *  above it instead of running underneath. One place, not one per panel. */
  bottom?: number | string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-ui="panel-dock"
      // The width comes from DOCK_WIDTH rather than a utility class: the cube's
      // step-aside distance is derived from the same constant, and a hard-coded
      // `w-[360px]` here silently drifts from it the moment one of them changes.
      style={{ top, bottom, width: DOCK_WIDTH }}
      className={cn(
        "pointer-events-none absolute right-4 z-30 flex flex-col items-stretch gap-2",
        "max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain",
        "transition-[bottom] duration-300"
      )}
    >
      {children}
    </div>
  );
}

/**
 * Work in flight inside a docked panel.
 *
 * Every generating panel used to say "busy" its own way — a spinning label on
 * its button, a bare 6px bar, or (for the 3D pass) a whole separate toast in the
 * bottom-left corner that only existed if you had minimised the panel first. So
 * whether you could see progress depended on which panel you were in and what
 * you had done to it, and a collapsed panel said nothing at all.
 *
 * One shape, rendered in one place: expanded, the panel shows the full progress
 * block above its footer; collapsed, the header keeps a spinner, a percentage
 * and a hairline bar. Same job, same words, wherever it's being shown from.
 */
export interface DockJob {
  /** headline — "Generating 3D mesh" */
  title: string;
  /** supporting line — what the pass is actually doing */
  hint?: string;
  /** 0–100. Omit when the work has no measurable progress. */
  progress?: number;
}

export interface DockPanelProps {
  /** tracking id → data-ui="glass-<ui>", and the layer names under it */
  ui: string;
  title: string;
  /** what this panel is generating right now, if anything */
  job?: DockJob | null;
  /**
   * Where the job is allowed to show. `"collapsed"` is for panels that already
   * report their own work in the body — the AI transcript has a thinking row —
   * and only need the shell to cover the case where the body isn't visible.
   */
  jobDisplay?: "always" | "collapsed";
  /** header controls of the panel's own — search, model picker, counts */
  actions?: React.ReactNode;
  /** replaces the entire header row (the layer tree's search mode) */
  headerOverride?: React.ReactNode;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onClose: () => void;
  /** Starting height in px, and what double-clicking the resize grip restores. */
  defaultHeight?: number;
  /**
   * Open tall enough to show the whole form, instead of at `defaultHeight`.
   *
   * A tool panel with a fixed starting height is a guess, and it was wrong for
   * the two generate flows: both opened with their last field and their primary
   * button below the fold, so the first thing you did after opening one was
   * scroll it to find out what it wanted. Measured once on mount and then left
   * alone — the user's own drag has to stick, and a panel that re-measured as
   * its content changed would resize itself while being read.
   */
  fitContent?: boolean;
  /** pinned below the scrolling body — composer, primary action */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * One panel in the dock: fixed width, collapsible, height-resizable.
 *
 * The body scrolls; the header and footer don't. Collapsing drops everything
 * but the header, which is the point — a stack of four open panels is only
 * legible if the ones you aren't using can get out of the way without being
 * closed and losing their state.
 */
export function DockPanel({
  ui,
  title,
  job,
  jobDisplay = "always",
  actions,
  headerOverride,
  collapsed,
  onToggleCollapsed,
  onClose,
  defaultHeight = 340,
  fitContent = false,
  footer,
  children,
}: DockPanelProps) {
  const [height, setHeight] = React.useState(defaultHeight);
  const ref = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  /** The tallest this panel may be from where it currently sits. Read live
   *  rather than cached: a panel above it can collapse or close mid-drag. */
  const maxHeight = React.useCallback(() => {
    const top = ref.current?.getBoundingClientRect().top ?? 0;
    return Math.max(MIN_HEIGHT, window.innerHeight - top - BOTTOM_GUTTER);
  }, []);

  /**
   * Grow to the body's natural height on open. Runs in a layout effect so the
   * panel is never painted at the wrong size first, and only once — `fitContent`
   * describes how a panel ARRIVES, not a height it keeps re-asserting.
   */
  React.useLayoutEffect(() => {
    if (!fitContent) return;
    const body = bodyRef.current;
    const shell = ref.current;
    if (!body || !shell) return;
    // The body is the only part that scrolls, so the overflow it reports is
    // exactly what the panel is short by.
    const missing = body.scrollHeight - body.clientHeight;
    if (missing <= 0) return;
    setHeight((h) => Math.min(maxHeight(), h + missing));
    // Mount only. Re-fitting on every content change would resize the panel
    // under the user as they filled the form in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Drag the bottom grip to set a height; double-click it to go back to the
   * panel's default. A resize you can only undo by finding an exact pixel again
   * is a resize you'd use once.
   */
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = ref.current?.getBoundingClientRect().height ?? defaultHeight;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      // Measured from where this panel actually starts, so the grip can always
      // reach the bottom gutter and never drags out of sight below the fold.
      setHeight(Math.max(MIN_HEIGHT, Math.min(maxHeight(), startH + (ev.clientY - startY))));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <GlassPanel
      ref={ref}
      ui={ui}
      thickness="thick"
      data-collapsed={collapsed || undefined}
      style={collapsed ? undefined : { height }}
      className={cn(
        "pointer-events-auto relative flex w-full shrink-0 animate-panel-in flex-col !rounded-3xl",
        // Only the collapse transition is animated. Animating height while the
        // grip is being dragged makes the panel lag the cursor.
        collapsed && "transition-[height] duration-200"
      )}
    >
      <header
        data-ui={`${ui}-header`}
        className="relative flex shrink-0 items-center gap-1 border-b border-glass/10 px-3 py-2.5"
      >
        {headerOverride ?? (
          <>
            <h2
              data-ui={`${ui}-title`}
              className="type-panel-title min-w-0 flex-1 truncate text-content"
            >
              {title}
            </h2>
            {/* Collapsed and still working: the header is the only thing left,
                so it has to carry the state the progress block would have. */}
            {job && collapsed && (
              <span
                data-ui={`${ui}-collapsed-job`}
                title={job.hint ? `${job.title} — ${job.hint}` : job.title}
                className="flex shrink-0 items-center gap-1.5 text-brand"
              >
                <Icon name="spinner" size={15} className="animate-spin" />
                {job.progress !== undefined && (
                  <span className="type-numeric-sm tabular-nums">{Math.round(job.progress)}%</span>
                )}
              </span>
            )}
            {actions}
            <GlassGhostButton
              ui={`${ui}-collapse`}
              size="sm"
              icon="chevron-down"
              label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
              onClick={onToggleCollapsed}
              className={cn("transition-transform", collapsed && "-rotate-90")}
            />
            <GlassGhostButton
              ui={`${ui}-close`}
              size="sm"
              icon="close"
              label={`Close ${title}`}
              onClick={onClose}
            />
          </>
        )}

        {/* Rides the header's own bottom border while collapsed, so a stack of
            collapsed panels reads as a list of progress bars rather than as a
            list of identical inert titles. */}
        {job && collapsed && (
          <ProgressTrack
            ui={`${ui}-collapsed-progress`}
            value={job.progress}
            className="absolute inset-x-0 bottom-0 h-[3px] rounded-none"
          />
        )}
      </header>

      {!collapsed && (
        <>
          <div ref={bodyRef} data-ui={`${ui}-body`} className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </div>

          {job && jobDisplay === "always" && <DockJobProgress ui={ui} job={job} />}

          {footer}

          {/* Resize grip. Sits just inside the bottom edge rather than straddling
              it, so it can't swallow clicks meant for the panel below. */}
          <div
            data-ui={`${ui}-resize`}
            role="separator"
            aria-orientation="horizontal"
            aria-label={`Resize ${title}`}
            title="Drag to resize · double-click to reset"
            onPointerDown={startResize}
            onDoubleClick={() => setHeight(defaultHeight)}
            className="group absolute inset-x-0 bottom-0 grid h-3 cursor-ns-resize place-items-center"
          >
            <span className="h-[3px] w-9 rounded-full bg-glass/25 transition-colors group-hover:bg-brand" />
          </div>
        </>
      )}
    </GlassPanel>
  );
}

/* ------------------------------------------------------------------ progress */

/**
 * The bar itself. A `value` fills it; no value runs the shimmer instead, which
 * is the honest reading of work whose duration nobody knows — a determinate bar
 * that stalls at 90% is a worse lie than one that never claims a number.
 */
function ProgressTrack({
  ui,
  value,
  className,
}: {
  ui: string;
  value?: number;
  className?: string;
}) {
  const indeterminate = value === undefined;
  return (
    <div
      data-ui={ui}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-glass/15", className)}
    >
      {indeterminate ? (
        <div className="absolute inset-y-0 w-1/3 animate-shimmer rounded-full bg-brand" />
      ) : (
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-100 ease-linear"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      )}
    </div>
  );
}

/**
 * The expanded panel's progress block — the state that used to live only in the
 * bottom-left toast, now pinned above the panel's own footer where the action
 * that started the work is.
 */
function DockJobProgress({ ui, job }: { ui: string; job: DockJob }) {
  return (
    <div
      data-ui={`${ui}-job`}
      className="flex shrink-0 flex-col gap-2.5 border-t border-glass/10 p-3"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/20 text-brand">
          <Icon name="spinner" size={17} className="animate-spin" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-body-strong truncate text-content">{job.title}</p>
          {job.hint && <p className="type-caption mt-0.5 truncate text-content-muted">{job.hint}</p>}
        </div>
        {job.progress !== undefined && (
          <span className="type-numeric-sm shrink-0 tabular-nums text-content-subtle">
            {Math.round(job.progress)}%
          </span>
        )}
      </div>
      <ProgressTrack ui={`${ui}-progress`} value={job.progress} />
    </div>
  );
}
