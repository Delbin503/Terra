import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { GlassGhostButton, GlassPanel } from "@/components/glass";
import { Panel } from "./ui";
import { GUIDE_STEPS, type GuideContext, type GuideTip } from "./editor-guide";
import type { SceneApi } from "./useScene";

/**
 * THE GUIDE — a checklist in the bottom-left corner, and a bubble on the
 * control it is talking about.
 * ----------------------------------------------------------------------------
 * The steps and their wording live in editor-guide.ts; this file is only the
 * engine and the two surfaces.
 *
 * NOTHING IS BLOCKED. The guide never puts a scrim over the editor or swallows
 * a click: it rings the control it means and sits a bubble beside it, and the
 * user does the real thing with the real control. Asking "is it done?" a few
 * times a second (rather than wiring an event out of every panel it mentions)
 * is what keeps it that way — the editor does not know the guide exists.
 *
 * PORTALED TO <body>, above everything (z-70), because two of its steps happen
 * inside the Work Order mode, which covers the whole editor at z-50.
 */

const POLL_MS = 250;
const GAP = 12;
const BUBBLE_W = 288;

/** On screen, with something real at its centre that belongs to it — so a
 *  control hidden under an open sheet or a modal does not count as there. */
function findVisible(selector: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(selector);
  for (const el of els) {
    if (el.closest("[data-guide]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
    const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    if (hit && (el === hit || el.contains(hit) || hit.closest("[data-guide]"))) return el;
  }
  return null;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function EditorGuide({
  scene,
  open,
  onClose,
}: {
  scene: SceneApi;
  open: boolean;
  onClose: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [finished, setFinished] = useState(false);
  /** why the current step can't start, if it can't */
  const [blocked, setBlocked] = useState<string | null>(null);
  /** where the current tip's control is, or null when it is not on screen */
  const [rect, setRect] = useState<Rect | null>(null);

  const step = GUIDE_STEPS[stepIdx];
  const tip: GuideTip | undefined = step?.tips[tipIdx];

  // The poll reads the latest scene through a ref, so it is set up once per
  // tip rather than once per render.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  /* WHAT WAS CLICKED DURING THIS TIP, by `data-ui`. The placing steps end on
     Back, and Back's own effect — nothing selected — is also what a click on
     empty space does, so the guide has to see the click itself. Captured at the
     document, ahead of React, because Back unmounts the title it lives in.
     Cleared on every new tip: only a Back pressed while the guide is asking
     for it counts. */
  const clicks = useRef<Set<string>>(new Set());
  useEffect(() => {
    clicks.current = new Set();
  }, [stepIdx, tipIdx]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>("[data-ui]");
      if (el && !el.closest("[data-guide]") && el.dataset.ui) clicks.current.add(el.dataset.ui);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [open]);

  const ctx = useCallback(
    (): GuideContext => ({
      scene: sceneRef.current,
      find: findVisible,
      clicked: (id) => clicks.current.has(id),
    }),
    []
  );

  /** Close out the current step and move to the next one not yet done. */
  const completeStep = useCallback(() => {
    const next = new Set(completed);
    next.add(GUIDE_STEPS[stepIdx].id);
    setCompleted(next);
    const after = GUIDE_STEPS.findIndex((s, i) => i > stepIdx && !next.has(s.id));
    const anyLeft = GUIDE_STEPS.findIndex((s) => !next.has(s.id));
    if (after >= 0) setStepIdx(after);
    else if (anyLeft >= 0) setStepIdx(anyLeft);
    else setFinished(true);
    setTipIdx(0);
  }, [completed, stepIdx]);

  const advanceTip = useCallback(() => {
    if (tipIdx + 1 < GUIDE_STEPS[stepIdx].tips.length) setTipIdx(tipIdx + 1);
    else completeStep();
  }, [tipIdx, stepIdx, completeStep]);

  /* THE POLL: is the step allowed to start, is this tip already done, and where
     is its control. One timer for all three, so they never disagree. */
  useEffect(() => {
    if (!open || finished || !step || !tip) return;
    const tick = () => {
      const c = ctx();
      const why = step.blocked?.(c) ?? null;
      setBlocked(why);
      if (why) {
        setRect(null);
        return;
      }
      if (tip.done?.(c)) {
        advanceTip();
        return;
      }
      const el = tip.target ? findVisible(tip.target) : null;
      const r = el?.getBoundingClientRect();
      setRect((prev) => {
        if (!r) return null;
        if (prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height)
          return prev;
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      });
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    window.addEventListener("resize", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", tick);
    };
  }, [open, finished, step, tip, ctx, advanceTip]);

  const jumpTo = (i: number) => {
    setFinished(false);
    setStepIdx(i);
    setTipIdx(0);
  };

  const restart = () => {
    setCompleted(new Set());
    jumpTo(0);
  };

  if (!open) return null;

  const showBubble = !!(tip && rect && !blocked && !finished);
  /** the line the panel shows for the current step, when the bubble can't */
  const status = finished
    ? null
    : blocked
      ? blocked
      : tip && !rect
        ? (tip.missing ?? tip.body)
        : null;

  return createPortal(
    <>
      {showBubble && tip && rect && (
        <CoachMark
          rect={rect}
          tip={tip}
          count={`${tipIdx + 1}/${step.tips.length}`}
          onNext={advanceTip}
        />
      )}
      <GuidePanel
        stepIdx={stepIdx}
        completed={completed}
        finished={finished}
        status={status}
        action={!finished && !blocked && tip && !rect && tip.action ? tip.action.label : null}
        onAction={() => tip?.action?.run(ctx())}
        onJump={jumpTo}
        onSkip={completeStep}
        onRestart={restart}
        onClose={onClose}
      />
    </>,
    document.body
  );
}

/* ------------------------------------------------------------- the panel -- */

/**
 * The checklist. It follows the editor's own floating panels — same glass, same
 * header row — and sits in the bottom-left corner, LIFTED above the asset
 * library while that is open, since the library docks into the same corner and
 * the guide's first three steps are spent pointing into it.
 */
function GuidePanel({
  stepIdx,
  completed,
  finished,
  status,
  action,
  onAction,
  onJump,
  onSkip,
  onRestart,
  onClose,
}: {
  stepIdx: number;
  completed: Set<string>;
  finished: boolean;
  status: string | null;
  /** the label of the current tip's shortcut, when one is on offer */
  action: string | null;
  onAction: () => void;
  onJump: (i: number) => void;
  onSkip: () => void;
  onRestart: () => void;
  onClose: () => void;
}) {
  const [bottom, setBottom] = useState(16);
  useEffect(() => {
    const place = () => {
      const lib = findVisible('[data-ui="glass-asset-library"]');
      setBottom(lib ? window.innerHeight - lib.getBoundingClientRect().top + 12 : 16);
    };
    place();
    const id = window.setInterval(place, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  const done = completed.size;
  const total = GUIDE_STEPS.length;
  /* COLLAPSED: the header, the progress bar and one line for the step you are
     on. The full list is ~350 px tall, and lifted above an open Asset Library
     it runs into the top bar — folding it down is how the user gets the
     corner back without closing the guide and losing their place. The
     coach-mark bubbles carry on regardless; this only folds the checklist. */
  const [collapsed, setCollapsed] = useState(false);
  const currentStep = !finished ? GUIDE_STEPS[stepIdx] : null;

  return (
    <div
      data-guide
      className="pointer-events-none fixed left-4 z-[70] w-[300px] transition-[bottom] duration-300 ease-out"
      style={{ bottom }}
    >
      {/* A dark ground under the glass. Every other panel is read against the
          scene it floats on; this one has to be read against ANY scene — a
          bright skybox washed the default glass out to white-on-white. */}
      <Panel ui="guide" thickness="overlay" className="!rounded-2xl !bg-canvas/90">
        <header className="flex items-center gap-2 border-b border-glass/12 px-3 py-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
            <Icon name="info" size={13} />
          </span>
          <span className="type-panel-title min-w-0 flex-1 truncate text-content">Getting started</span>
          <span className="type-caption shrink-0 text-content-subtle">
            {done}/{total}
          </span>
          <GlassGhostButton
            ui="guide-collapse"
            size="sm"
            icon={collapsed ? "chevron-up" : "chevron-down"}
            label={collapsed ? "Expand the guide" : "Collapse the guide"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          />
          <GlassGhostButton ui="guide-close" size="sm" icon="close" label="Close the guide" onClick={onClose} />
        </header>

        {/* Progress — one segment per step, so it reads as a count, not a %. */}
        <div className="flex gap-1 px-3 pt-2.5">
          {GUIDE_STEPS.map((s) => (
            <span
              key={s.id}
              className={cn("h-1 flex-1 rounded-full", completed.has(s.id) ? "bg-brand" : "bg-glass/15")}
            />
          ))}
        </div>

        {collapsed && (
          <div className="flex items-center gap-2 px-3 pb-2.5 pt-2">
            <button
              type="button"
              data-ui="guide-collapsed-step"
              onClick={() => setCollapsed(false)}
              className="type-caption min-w-0 flex-1 truncate text-left text-content-muted transition-colors hover:text-content"
            >
              {currentStep ? (
                <>
                  Step {stepIdx + 1} of {total} ·{" "}
                  <span className="text-content">{currentStep.title}</span>
                </>
              ) : (
                "All steps done"
              )}
            </button>
            {/* The one shortcut the guide can be waiting on stays reachable
                folded — otherwise collapsing would hide the way forward. */}
            {action && (
              <Button variant="brand" size="sm" data-ui="guide-action" onClick={onAction} className="h-7 shrink-0">
                {action}
              </Button>
            )}
          </div>
        )}

        {!collapsed && (
          <ol className="flex flex-col p-2">
            {GUIDE_STEPS.map((s, i) => {
              const current = !finished && i === stepIdx;
              const isDone = completed.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    data-ui={`guide-step-${s.id}`}
                    aria-current={current ? "step" : undefined}
                    onClick={() => onJump(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors",
                      current ? "bg-brand/10" : "hover:bg-glass/8"
                    )}
                  >
                    <span
                      className={cn(
                        "type-caption grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                        isDone
                          ? "border-brand bg-brand text-brand-foreground"
                          : current
                            ? "border-brand text-brand"
                            : "border-glass/25 text-content-subtle"
                      )}
                    >
                      {isDone ? <Icon name="check" size={11} strokeWidth={3} /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        "type-body min-w-0 flex-1 truncate",
                        current ? "text-content" : isDone ? "text-content-muted" : "text-content-subtle"
                      )}
                    >
                      {s.title}
                    </span>
                  </button>

                  {current && (
                    <div className="pb-1.5 pl-[38px] pr-2">
                      <p className="type-caption text-content-muted">{s.blurb}</p>
                      {status && (
                        <div
                          data-ui="guide-status"
                          className="mt-1.5 rounded-md border border-brand/30 bg-brand/8 px-2 py-1.5"
                        >
                          <p className="type-caption text-content">{status}</p>
                          {action && (
                            <Button
                              variant="brand"
                              size="sm"
                              data-ui="guide-action"
                              onClick={onAction}
                              className="mt-2 h-7"
                            >
                              {action}
                            </Button>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        data-ui="guide-skip"
                        onClick={onSkip}
                        className="type-caption mt-1.5 text-content-subtle underline-offset-2 transition-colors hover:text-content hover:underline"
                      >
                        Skip this step
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {finished && !collapsed && (
          <div className="flex items-center gap-2 border-t border-glass/12 px-3 py-2.5">
            <p className="type-caption flex-1 text-content">
              You're all set — the guide is here whenever you need it.
            </p>
            <Button variant="outline" size="sm" data-ui="guide-restart" onClick={onRestart}>
              Restart
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ----------------------------------------------------------- the bubble -- */

/**
 * A ring on the control and a bubble beside it.
 *
 * The ring is pointer-events-none, so the control under it stays the thing you
 * click; only the bubble takes clicks, and only for its own Next button.
 */
function CoachMark({
  rect,
  tip,
  count,
  onNext,
}: {
  rect: Rect;
  tip: GuideTip;
  count: string;
  onNext: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(120);
  useLayoutEffect(() => {
    if (ref.current) setH(ref.current.offsetHeight);
  }, [tip, rect]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const clampX = (x: number) => Math.min(Math.max(x, 12), vw - BUBBLE_W - 12);
  const clampY = (y: number) => Math.min(Math.max(y, 12), vh - h - 12);

  // Fall to the opposite side when the preferred one has no room.
  let side = tip.side ?? "bottom";
  if (side === "bottom" && rect.top + rect.height + GAP + h > vh) side = "top";
  if (side === "top" && rect.top - GAP - h < 0) side = "bottom";
  if (side === "right" && rect.left + rect.width + GAP + BUBBLE_W > vw) side = "left";
  if (side === "left" && rect.left - GAP - BUBBLE_W < 0) side = "right";

  let top: number;
  let left: number;
  if (side === "bottom" || side === "top") {
    left = clampX(cx - BUBBLE_W / 2);
    top = side === "bottom" ? rect.top + rect.height + GAP : rect.top - GAP - h;
  } else {
    top = clampY(cy - h / 2);
    left = side === "right" ? rect.left + rect.width + GAP : rect.left - GAP - BUBBLE_W;
  }

  // The arrow tracks the target even when the bubble had to be clamped.
  const arrow =
    side === "bottom" || side === "top"
      ? { left: Math.min(Math.max(cx - left, 16), BUBBLE_W - 16), [side === "bottom" ? "top" : "bottom"]: -5 }
      : { top: Math.min(Math.max(cy - top, 16), h - 16), [side === "right" ? "left" : "right"]: -5 };

  return (
    <>
      <div
        aria-hidden
        data-guide
        className="pointer-events-none fixed z-[70] animate-pulse rounded-xl ring-2 ring-brand ring-offset-2 ring-offset-transparent"
        style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
      />
      <GlassPanel
        ref={ref}
        ui="guide-tip"
        thickness="overlay"
        data-guide
        role="dialog"
        aria-label={tip.title}
        className="pointer-events-auto fixed z-[71] !overflow-visible !rounded-xl border border-brand/40 !bg-canvas/90 p-3"
        style={{ top, left, width: BUBBLE_W }}
      >
        <span
          aria-hidden
          className="absolute h-2.5 w-2.5 rotate-45 border border-brand/40 bg-canvas"
          style={{ ...arrow, marginLeft: side === "bottom" || side === "top" ? -5 : 0, marginTop: side === "left" || side === "right" ? -5 : 0 }}
        />
        <div className="mb-1 flex items-center gap-2">
          <span className="type-body-strong min-w-0 flex-1 text-content">{tip.title}</span>
          <span className="type-caption shrink-0 text-content-subtle">{count}</span>
        </div>
        <p className="type-caption text-content-muted">{tip.body}</p>
        {tip.next && (
          <div className="mt-2.5 flex justify-end">
            <Button variant="brand" size="sm" data-ui="guide-next" onClick={onNext}>
              {tip.next}
            </Button>
          </div>
        )}
      </GlassPanel>
    </>
  );
}
