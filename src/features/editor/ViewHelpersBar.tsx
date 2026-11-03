import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { GlassBar } from "@/components/glass";
import { Icon } from "@/components/icons";
import { Tooltip } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ToolButton, VIEW_HELPERS, RESET_VIEW, type ViewHelper } from "./EditorToolBar";

/** Where the column sits by default: centred under the view cube's ring. The
 *  cube's centre is GIZMO_REACH in from the right and 80 + GIZMO_REACH down,
 *  so its ink ends at 80 + 2 × reach. */
const GAP_BELOW_CUBE = 14;
/** The column's width — w-12, the same 48px the top-row bars are tall. */
const COLUMN_W = 48;
/** Clear air kept between the column and anything it is dragged against. */
const KEEP_CLEAR = 8;

interface Box { l: number; t: number; r: number; b: number }
const hits = (a: Box, b: Box) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

/**
 * Grid · Axes · Reset view — the viewport helpers, in their own glass column
 * under the view cube. A column, not a row: it hangs from the cube's centre
 * line like a stem, and stays narrower than the cube's ring.
 *
 * They used to ride at the end of the top tool bar behind a divider. But they
 * aren't tools that open panels; they change what the viewport draws, and the
 * cube is the viewport's own control. Under it is where a hand reaching for
 * "show me the view differently" already is.
 *
 * Draggable by its grip, for when it sits over something you need to see —
 * but never under or over another panel or the cube: those are solid, and
 * the column skims their edges instead of sliding beneath them. The offset is
 * relative to the default spot, so when the cube steps left for the
 * dock the cluster steps with it rather than being left behind over a panel.
 * Double-click the grip to put it back.
 */
export function ViewHelpersBar({
  view,
  onToggleView,
  onResetView,
  inset,
  reach,
}: {
  view: Record<ViewHelper, boolean>;
  onToggleView: (h: ViewHelper) => void;
  onResetView: () => void;
  /** how far the cube has stepped left for the dock (px) */
  inset: number;
  /** the cube ornament's radius — GIZMO_REACH */
  reach: number;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  /** Pointer and offset at drag start, and the offset range that keeps the
   *  whole cluster on screen — fixed for the gesture, measured once. */
  const drag = useRef<{
    px: number; py: number; ox: number; oy: number; x0: number; x1: number; y0: number; y1: number;
    /** the column's box at offset (0, 0) */
    home: Box;
    /** every other panel and the view cube, grown by KEEP_CLEAR — solid */
    solid: Box[];
    /** the last offset that was clear of all of them */
    last: { x: number; y: number };
  } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const startDrag = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const bar = barRef.current;
    // The viewport the column floats over — the positioned wrapper's own
    // offset parent, not the wrapper (which is exactly the column's size).
    const parent = wrapRef.current?.offsetParent as HTMLElement | null;
    if (!bar || !parent) return;
    const pr = parent.getBoundingClientRect();
    const r = bar.getBoundingClientRect();
    const M = KEEP_CLEAR;
    const home = { l: r.left - offset.x, t: r.top - offset.y, r: r.right - offset.x, b: r.bottom - offset.y };
    // Everything the column may not sit under or over: every other glass
    // surface on screen (bars, panels, the dock, the guide), and the view cube,
    // which is drawn in the canvas and so has no element of its own.
    const solid: Box[] = [];
    document.querySelectorAll<HTMLElement>(".glass").forEach((el) => {
      if (bar.contains(el) || el.closest("[data-dropdown-layer]")) return;
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2 || getComputedStyle(el).visibility === "hidden") return;
      solid.push({ l: b.left - M, t: b.top - M, r: b.right + M, b: b.bottom + M });
    });
    const cubeR = pr.right - 16 - inset, cubeT = pr.top + 80;
    solid.push({ l: cubeR - 2 * reach - M, t: cubeT - M, r: cubeR + M, b: cubeT + 2 * reach + M });
    drag.current = {
      px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y,
      x0: offset.x + (pr.left + M - r.left), x1: offset.x + (pr.right - M - r.right),
      y0: offset.y + (pr.top + M - r.top), y1: offset.y + (pr.bottom - M - r.bottom),
      home, solid, last: { ...offset },
    };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const x = Math.min(d.x1, Math.max(d.x0, d.ox + e.clientX - d.px));
      const y = Math.min(d.y1, Math.max(d.y0, d.oy + e.clientY - d.py));
      const clear = (ox: number, oy: number) => {
        const at = { l: d.home.l + ox, t: d.home.t + oy, r: d.home.r + ox, b: d.home.b + oy };
        return !d.solid.some((s) => hits(at, s));
      };
      // Where the pointer wants it if that is clear; otherwise slide along
      // whichever axis is still free, so the column skims a panel's edge
      // instead of sticking to it; otherwise stay at the last clear spot.
      const next = clear(x, y) ? { x, y }
        : clear(x, d.last.y) ? { x, y: d.last.y }
        : clear(d.last.x, y) ? { x: d.last.x, y }
        : d.last;
      d.last = next;
      setOffset(next);
    };
    const up = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging]);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "absolute z-20",
        // Follows the cube when the dock pushes it, but not while being dragged.
        !dragging && "transition-[right] duration-300 ease-out"
      )}
      style={{
        right: 16 + inset + reach - COLUMN_W / 2,
        top: 80 + 2 * reach + GAP_BELOW_CUBE,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
      }}
    >
      <GlassBar ref={barRef} ui="view-helpers" shape="panel" className="pointer-events-auto w-12 flex-col gap-1 pb-1.5 pt-0.5">
        <Tooltip label="Drag to move · double-click to reset" side="left" tone="glass">
          <button
            type="button"
            aria-label="Move view tools"
            data-ui="view-helpers-grip"
            onPointerDown={startDrag}
            onDoubleClick={() => setOffset({ x: 0, y: 0 })}
            className={cn(
              "grid h-5 w-9 touch-none place-items-center rounded-lg text-content-subtle",
              "outline-none hover:text-content focus-visible:ring-2 focus-visible:ring-ring",
              dragging ? "cursor-grabbing text-content" : "cursor-grab"
            )}
          >
            <Icon name="drag" size={16} strokeWidth={1.8} />
          </button>
        </Tooltip>
        {VIEW_HELPERS.map((h) => (
          <ToolButton key={h.id} tool={h} side="left" active={view[h.id]} onClick={() => onToggleView(h.id)} />
        ))}
        {/* A one-shot action, so it never lights up like the two switches. */}
        <ToolButton tool={RESET_VIEW} side="left" active={false} onClick={onResetView} />
      </GlassBar>
    </div>
  );
}
