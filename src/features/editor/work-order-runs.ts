import { useCallback, useEffect, useMemo, useState } from "react";
import { creditsFor } from "./work-order";
import type { MaterialPayload } from "./material-payload";

/**
 * WORK ORDER RUNS — what happened to the orders you dispatched.
 * ------------------------------------------------------------------
 * TerraGen authors a Work Order and hands it off; this is the other end of that
 * handoff. Until now Dispatch ended at a console line and a "queued" message
 * that disappeared with the panel, which meant the one question a user has
 * afterwards — did it finish, and where is the archive — had nowhere to be
 * asked. So the runs outlive the mode that created them and the Download button
 * in the top bar opens the list.
 *
 * Kept apart from React the way `work-order.ts` is, for the same reason: the
 * progress arithmetic decides what a row claims about a paid render, and the
 * status transitions decide whether a Cancel is honoured. Both are worth being
 * able to reason about without a component in the way.
 *
 * The tick is a stand-in for the pipeline reporting back. Its shape is what the
 * real thing will have — a run advances, then lands on completed or failed —
 * so swapping the interval for a socket doesn't change the table.
 */

export type RunStatus = "running" | "completed" | "failed" | "cancelled";

/** Every run is counted in frames, and a frame is an image. Video was a second
 *  unit here — rows measured in seconds — and it described a dataset type
 *  TerraGen doesn't produce in this release, so a run could claim a duration
 *  nothing had rendered. One unit, and it matches what the archive contains. */
export type RunUnit = "Images";

export interface WorkOrderRun {
  id: string;
  /** ms since epoch — the column formats it, the sort compares it */
  createdAt: number;
  dataType: "Image";
  project: string;
  /**
   * What this run was charged, in credits.
   *
   * STORED, NOT RECOMPUTED. The figure the table shows has to be the figure the
   * account was actually debited, and that was settled by the dispatch review
   * against the order as it stood at the time. Deriving it here from `total`
   * would re-price a two-week-old run at today's rate and quietly disagree with
   * the receipt — and the per-subset component of the price isn't recoverable
   * from a frame count anyway.
   */
  credits: number;
  /** produced so far, out of what was ordered */
  done: number;
  total: number;
  unit: RunUnit;
  status: RunStatus;
  /** when the current attempt began — the tick derives `done` from this */
  startedAt: number;
  /** how long this attempt is simulated to take, ms */
  durationMs: number;
  /**
   * The material state this run was dispatched with — every modified slot, the
   * sky's two parameters, any splat brightness. Built by `buildMaterialPayload`
   * at the moment of dispatch.
   *
   * STORED FOR THE SAME REASON `credits` IS. It is what was SENT, and the scene
   * it was read from carries on being edited afterwards — so a run row is the
   * only place the materials this dataset was actually rendered with can
   * survive. Absent on runs dispatched before materials travelled with an
   * order, which is why it is optional rather than an empty payload.
   */
  materials?: MaterialPayload;
}

/** 0–100. A finished run reads 100 even if the pipeline stopped a frame short,
 *  and a failed one keeps the fraction it reached — that number is the whole
 *  reason to look at a failed row. */
export function runPercent(run: WorkOrderRun): number {
  if (run.status === "completed") return 100;
  if (run.total <= 0) return 0;
  return Math.min(100, Math.round((run.done / run.total) * 100));
}

/** Only a run still in flight can be called off. Everything else has already
 *  spent what it was going to spend. */
export const isCancellable = (run: WorkOrderRun) => run.status === "running";

/**
 * How much longer this run has, in ms. Null for anything not running.
 *
 * READ OFF THE CLOCK, like `done` is — not counted down in state. The tick
 * already recomputes progress from `startedAt` so a backgrounded tab catches
 * up instead of falling behind, and a separate countdown would be a second
 * clock free to disagree with the bar right beside it.
 */
export function runRemainingMs(run: WorkOrderRun, now = Date.now()): number | null {
  if (run.status !== "running") return null;
  return Math.max(0, run.startedAt + run.durationMs - now);
}

/**
 * "about 2 min left" — the wait, in the coarsest unit that is still useful.
 *
 * DELIBERATELY VAGUE ABOVE A MINUTE. This is an estimate off a simulated
 * duration, and a readout ticking "1 min 47 sec" claims a precision the
 * pipeline cannot honour — it also makes the row twitch every second, which is
 * exactly the wrong thing to do to a list people are scanning. Under a minute
 * the seconds matter, because that is the point where waiting beats leaving.
 */
export function formatRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds <= 0) return "finishing";
  if (seconds < 60) return `${seconds} sec left`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr left` : `${hours} hr ${rest} min left`;
}

/** `WO000003-0000-0000` from `3`. */
const orderId = (n: number) => `WO${String(n).padStart(6, "0")}-0000-0000`;

/** How many fixture rows exist — where the live counter picks up. */
const SEEDED_COUNT = 6;

/**
 * Ids for runs dispatched in this session.
 *
 * The fixtures below are numbered LITERALLY rather than drawing from here.
 * They were minted from this counter at first, and the seeded list came back
 * numbered 7–12: `useState(() => seedRuns())` is an initializer, StrictMode
 * invokes it twice in development, and the ids from the pass React discarded
 * were spent anyway. So the counter starts above the fixtures and only real
 * dispatches draw from it — the same rule `useScene.duplicate` follows for
 * object ids, for the same reason.
 */
let seq = SEEDED_COUNT;
const mintId = () => orderId(++seq);

const HOUR = 3_600_000;

const TICK_MS = 1_000;

/**
 * How long a simulated run takes, end to end.
 *
 * DERIVED FROM ELAPSED TIME, NOT FROM A STEP PER TICK. The first version
 * advanced `done` by a fraction of `total` each tick, which made a run's
 * duration depend on its size — and since `Math.max(1, …)` floored the step at
 * one unit, a 12-frame fixture finished in twelve seconds. In practice that
 * meant the progress bar, the percentage and the cancel button were gone before
 * anyone could reach them: the whole in-flight state was theoretical.
 *
 * Scaling with size, but gently and clamped, so a big order reads as longer
 * without any run being either instant or interminable.
 */
const MIN_DURATION = 90_000;
const MAX_DURATION = 240_000;
const durationFor = (total: number) =>
  Math.min(MAX_DURATION, Math.max(MIN_DURATION, total * 250));

/**
 * What a run of this size cost, for the seeded history only.
 *
 * The fixtures predate the session, so there is no order left to read a real
 * price off. This stands in for one — priced through `creditsFor`, the same
 * function the dispatch review charges with, so the history can't quote a rate
 * the review has stopped using. Assumed one subset, since a fixture has no axes
 * to have multiplied it. Live dispatches carry the review's own figure and
 * never come through here.
 */
const seededCredits = (total: number) => creditsFor(total, 1);

/**
 * Rows that exist before this session does.
 *
 * A run list that starts empty can't show what a completed or failed row looks
 * like until you have waited out a render, so the history is seeded — and dated
 * backwards from now rather than from a fixed day, so it never reads as stale.
 */
function seedRuns(project: string): WorkOrderRun[] {
  const now = Date.now();
  return [
    {
      id: orderId(1),
      createdAt: now - 2 * HOUR,
      dataType: "Image",
      project: "Sand Dune Project",
      credits: seededCredits(320),
      done: 15,
      total: 320,
      unit: "Images",
      status: "running",
      // Part-way through when the session opens, so the list has something in
      // flight in it without that run being about to finish.
      startedAt: now - 20_000,
      durationMs: durationFor(320),
    },
    {
      id: orderId(2),
      createdAt: now - 5 * HOUR,
      dataType: "Image",
      project: "Project Dimist Argon Extraction",
      credits: seededCredits(12),
      done: 10,
      total: 12,
      unit: "Images",
      status: "failed",
      startedAt: now,
      durationMs: durationFor(12),
    },
    {
      id: orderId(3),
      createdAt: now - 26 * HOUR,
      dataType: "Image",
      project: "Sand Dune Project",
      credits: seededCredits(1200),
      done: 1200,
      total: 1200,
      unit: "Images",
      status: "completed",
      startedAt: now,
      durationMs: durationFor(1200),
    },
    {
      id: orderId(4),
      createdAt: now - 27 * HOUR,
      dataType: "Image",
      project: project,
      credits: seededCredits(1200),
      done: 1200,
      total: 1200,
      unit: "Images",
      status: "completed",
      startedAt: now,
      durationMs: durationFor(1200),
    },
    {
      id: orderId(5),
      createdAt: now - 50 * HOUR,
      dataType: "Image",
      project: "Sand Dune Project",
      credits: seededCredits(12),
      done: 0,
      total: 12,
      unit: "Images",
      status: "failed",
      startedAt: now,
      durationMs: durationFor(12),
    },
    {
      id: orderId(6),
      createdAt: now - 74 * HOUR,
      dataType: "Image",
      project: "Sand Dune Project",
      credits: seededCredits(1200),
      done: 1200,
      total: 1200,
      unit: "Images",
      status: "completed",
      startedAt: now,
      durationMs: durationFor(1200),
    },
  ];
}

export interface RunInit {
  project: string;
  total: number;
  /** what the dispatch review charged for this order */
  credits: number;
  /** the scene's modified materials, packaged for TerraGen */
  materials?: MaterialPayload;
}

export interface WorkOrderRunStore {
  runs: WorkOrderRun[];
  /** how many are still in flight — the badge on the Download button */
  active: number;
  /** queue a dispatched order and start it running */
  add: (init: RunInit) => WorkOrderRun;
  /** stop a run in flight. No-op on anything already settled. */
  cancel: (id: string) => void;
  /** put a failed or cancelled run back in the queue, from zero */
  retry: (id: string) => void;
}

export function useWorkOrderRuns(projectName: string): WorkOrderRunStore {
  // Seeded once. `projectName` is read at construction only — renaming the
  // project should not rewrite the history of runs already dispatched under
  // the old name.
  const [runs, setRuns] = useState<WorkOrderRun[]>(() => seedRuns(projectName));

  /**
   * Advance everything in flight.
   *
   * One interval for the whole table rather than one per row: a timer per run
   * means N re-renders per second on a list whose whole point is to be scanned,
   * and they would drift out of step with each other for no reason.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setRuns((prev) => {
        if (!prev.some((r) => r.status === "running")) return prev;
        return prev.map((r) => {
          if (r.status !== "running") return r;
          // Recomputed from the clock rather than incremented, so a tab that
          // was backgrounded (and had its timers throttled) catches up instead
          // of falling permanently behind.
          const t = Math.min(1, (now - r.startedAt) / r.durationMs);
          const done = Math.round(r.total * t);
          return t >= 1
            ? { ...r, done: r.total, status: "completed" as const }
            : { ...r, done };
        });
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const add = useCallback<WorkOrderRunStore["add"]>((init) => {
    const run: WorkOrderRun = {
      id: mintId(),
      createdAt: Date.now(),
      dataType: "Image",
      project: init.project,
      // The review's own figure, not a re-derivation — see `WorkOrderRun.credits`.
      credits: Math.max(0, Math.round(init.credits)),
      done: 0,
      total: Math.max(1, Math.round(init.total)),
      unit: "Images",
      status: "running",
      startedAt: Date.now(),
      durationMs: durationFor(init.total),
      materials: init.materials,
    };
    // Newest first: the run you just dispatched is the one you opened the list
    // to look at.
    setRuns((prev) => [run, ...prev]);
    return run;
  }, []);

  const cancel = useCallback((id: string) => {
    setRuns((prev) =>
      prev.map((r) =>
        // Guarded rather than trusting the caller: the × is only rendered on a
        // running row, but a row can finish between the hover and the click.
        r.id === id && r.status === "running" ? { ...r, status: "cancelled" } : r
      )
    );
  }, []);

  const retry = useCallback((id: string) => {
    setRuns((prev) =>
      prev.map((r) =>
        r.id === id && (r.status === "failed" || r.status === "cancelled")
          ? // From zero, and re-dated: a retry is a new render of the same
            // order, not a resumption of the one that died.
            {
              ...r,
              done: 0,
              status: "running",
              createdAt: Date.now(),
              startedAt: Date.now(),
              durationMs: durationFor(r.total),
            }
          : r
      )
    );
  }, []);

  const active = runs.filter((r) => r.status === "running").length;

  return useMemo(
    () => ({ runs, active, add, cancel, retry }),
    [runs, active, add, cancel, retry]
  );
}

/**
 * "26.04.25" + "14:00:20", the two lines the Date column shows.
 *
 * FIXED FORMAT, NOT THE LOCALE'S. `toLocaleDateString` gave "Apr 26, 2025",
 * which is the widest thing that column ever has to hold and which wraps to two
 * lines at the widths the dialog actually gets — and its field order changes
 * under the reader's locale, so the same table read D/M in one place and M/D in
 * another with nothing on screen to say which. Numeric and zero-padded means
 * every row is exactly eight characters, the column can be scanned down as
 * digits, and the order is unambiguous. Padded by hand: `2-digit` on
 * `toLocaleDateString` still lets the locale choose the order and the separator.
 */
export function formatRunDate(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${pad(d.getFullYear() % 100)}`,
    time: d.toLocaleTimeString(undefined, { hour12: false }),
  };
}

