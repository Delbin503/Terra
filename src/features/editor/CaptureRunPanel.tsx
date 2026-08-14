import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/glass";
import { Icon } from "@/components/icons";
import type { AssetStore } from "./useAssets";
import type { CapturePlan } from "./camera-rig";

/** Roughly how long a frame takes to render, in ms. */
const MS_PER_FRAME = 28;
/** A long capture still has to finish in a watchable time. */
const MAX_DURATION = 6000;
/** How often produced frames are committed to the library. */
const COMMIT_EVERY = 250;

/**
 * CaptureRunPanel — the turntable capture, running.
 *
 * Frames land in the library as they're produced rather than in one batch at
 * the end: a capture can be hundreds of frames, and a progress bar that commits
 * nothing until it completes is a progress bar you can't trust or cancel.
 *
 * Shares the generation toast's shape (bottom-left, glass, success tint on
 * completion) so a running capture and a running mesh generation read as the
 * same kind of background work.
 */
export function CaptureRunPanel({
  plan,
  masterName,
  store,
  onClose,
  onViewResult,
}: {
  plan: CapturePlan;
  masterName: string;
  store: AssetStore;
  onClose: () => void;
  onViewResult: () => void;
}) {
  const [done, setDone] = useState(0);
  const finished = done >= plan.totalFrames;

  // The plan is captured once, on mount. Re-running the effect because the user
  // nudged a slider mid-capture would restart the sweep and double-file frames.
  const planRef = useRef(plan);
  const nameRef = useRef(masterName);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    const p = planRef.current;
    const duration = Math.min(MAX_DURATION, p.totalFrames * MS_PER_FRAME);
    const started = performance.now();
    let committed = 0;

    const frameName = (i: number) => {
      const pass = p.passes[Math.floor(i / p.shotsPerPass)] ?? p.passes[p.passes.length - 1];
      const shot = (i % p.shotsPerPass) + 1;
      return p.mode === "fixed"
        ? `${nameRef.current} — front`
        : `${nameRef.current} — pass ${pass.index}/${p.passes.length} · ${shot}`;
    };

    /** Commit everything shot since the last flush, in one state update. */
    const flush = (upTo: number) => {
      if (upTo <= committed) return;
      const batch = [];
      for (let i = committed; i < upTo; i++) {
        batch.push({ name: frameName(i), type: "image" as const, uploaded: true });
      }
      storeRef.current.addMany(batch);
      committed = upTo;
    };

    // Progress ticks faster than frames commit. Driving both off one timer is
    // what made the first version crawl: every frame re-rendered the editor,
    // and the interval fell behind until a 48-frame capture took ~30 seconds.
    const tick = window.setInterval(() => {
      const elapsed = performance.now() - started;
      setDone(Math.min(p.totalFrames, Math.floor((elapsed / duration) * p.totalFrames)));
    }, 60);

    const commit = window.setInterval(() => {
      const elapsed = performance.now() - started;
      flush(Math.min(p.totalFrames, Math.floor((elapsed / duration) * p.totalFrames)));
    }, COMMIT_EVERY);

    const finish = window.setTimeout(() => {
      window.clearInterval(tick);
      window.clearInterval(commit);
      flush(p.totalFrames);
      setDone(p.totalFrames);
    }, duration);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(commit);
      window.clearTimeout(finish);
    };
  }, []);

  const pct = Math.round((done / plan.totalFrames) * 100);

  return (
    <GlassPanel
      ui="capture-run"
      thickness="thick"
      interactive
      role="button"
      tabIndex={0}
      onClick={finished ? onViewResult : undefined}
      onKeyDown={(e) => {
        if (finished && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onViewResult();
        }
      }}
      data-state={finished ? "done" : "running"}
      className={cn(
        "pointer-events-auto absolute bottom-6 left-6 z-30 w-[320px] max-w-[calc(100vw-3rem)] !rounded-2xl p-3.5",
        finished && "glass-role glass-role-success cursor-pointer"
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-full",
            finished ? "bg-success/25 text-success" : "bg-brand/20 text-brand"
          )}
        >
          <Icon
            name={finished ? "check" : "capture"}
            size={17}
            strokeWidth={finished ? 3 : 2}
            className={cn(!finished && "animate-spin")}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-body-strong truncate text-content">
            {finished ? "Capture complete" : "Capturing turntable"}
          </p>
          <p className="type-caption mt-0.5 truncate text-content-muted">
            {finished
              ? `${plan.totalFrames} frames in your library — click to view`
              : `${done} of ${plan.totalFrames} frames`}
          </p>
        </div>
        {!finished && <span className="type-numeric-sm shrink-0 text-content-subtle">{pct}%</span>}
        {finished && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-content-muted hover:bg-glass/15 hover:text-content"
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </div>

      {!finished && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-glass/15">
          <div
            data-ui="capture-progress"
            className="h-full rounded-full bg-brand transition-[width] duration-100 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </GlassPanel>
  );
}
