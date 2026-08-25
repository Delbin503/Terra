import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  type Column,
} from "@/components/ui";
import {
  formatRemaining,
  formatRunDate,
  isCancellable,
  runPercent,
  runRemainingMs,
  type WorkOrderRun,
  type WorkOrderRunStore,
} from "./work-order-runs";

/**
 * WORK ORDERS — the other end of Dispatch.
 *
 * Opened from the Download button, because "where is my archive" is the only
 * reason anyone presses it: there is nothing to download until a Work Order has
 * finished, so the button leads to the list of them rather than to a file save
 * that would have nothing to save.
 *
 * ONE COLUMN DOES THE WORK. `Action` is not a button strip — it is the run's
 * state, rendered as the single thing you can do about it. A finished run gets
 * Download; a failed or cancelled one gets Try Again; one still going gets its
 * own progress, and cancelling is folded into that bar rather than parked in a
 * fourth column that would be empty on every other row.
 */
export function WorkOrdersDialog({
  store,
  onClose,
}: {
  store: WorkOrderRunStore;
  onClose: () => void;
}) {
  const columns: Column<WorkOrderRun>[] = [
    {
      key: "id",
      label: "Order ID",
      sortValue: (r) => r.id,
      render: (r) => <span className="type-numeric-sm text-content">{r.id}</span>,
    },
    {
      key: "date",
      label: "Date",
      // Sorted on the timestamp, never on the rendered string: "Apr" sorts
      // before "Jan" alphabetically, and a run log that reorders itself wrongly
      // is worse than one that doesn't sort at all.
      sortValue: (r) => r.createdAt,
      render: (r) => {
        const { date, time } = formatRunDate(r.createdAt);
        return (
          <div>
            <span className="type-body block text-content">{date}</span>
            <span className="type-caption block text-content-subtle">{time}</span>
          </div>
        );
      },
    },
    {
      key: "type",
      label: "Data Type",
      sortValue: (r) => r.dataType,
      render: (r) => <span className="type-body text-content">{r.dataType}</span>,
    },
    {
      key: "project",
      label: "Project",
      sortValue: (r) => r.project,
      render: (r) => <span className="type-body text-content">{r.project}</span>,
    },
    {
      key: "count",
      label: "Number of Data",
      sortValue: (r) => r.done / Math.max(1, r.total),
      render: (r) => (
        <div>
          <span className="type-body block whitespace-nowrap text-content">
            {r.done.toLocaleString()}/{r.total.toLocaleString()} {r.unit}
          </span>
          <StatusLabel run={r} />
        </div>
      ),
    },
    {
      key: "action",
      label: "Action",
      className: "w-[220px]",
      render: (r) => (
        <RunAction run={r} onCancel={() => store.cancel(r.id)} onRetry={() => store.retry(r.id)} />
      ),
    },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby="work-orders-description"
        /* Wide and capped, not centred-small: six columns of run history is a
           reading surface, and at the default dialog width the project names
           wrap to three lines each. */
        className="w-[min(76rem,calc(100vw-3rem))] max-w-none p-0"
      >
        <header className="flex items-center gap-3 px-6 pb-4 pt-6">
          <div className="min-w-0 grow">
            <DialogTitle>Work Orders</DialogTitle>
            <DialogDescription id="work-orders-description" className="type-caption mt-0.5">
              Every run you have dispatched. Archives stay available once a run completes.
            </DialogDescription>
          </div>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-6 pb-6">
          <DataTable
            columns={columns}
            rows={store.runs}
            rowKey={(r) => r.id}
            pageSize={10}
            empty="No Work Orders yet. Dispatch one from Generate."
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ parts */

/** The run's state, under its count — the mock's coloured second line. */
function StatusLabel({ run }: { run: WorkOrderRun }) {
  const copy: Record<WorkOrderRun["status"], { label: string; tone: string }> = {
    running: { label: "In Progress", tone: "text-warning" },
    completed: { label: "Completed", tone: "text-success" },
    failed: { label: "Failed", tone: "text-danger" },
    cancelled: { label: "Cancelled", tone: "text-content-subtle" },
  };
  const { label, tone } = copy[run.status];
  return <span className={cn("type-caption block", tone)}>{label}</span>;
}

/**
 * What you can do about this run.
 *
 * The cancel affordance lives ON the progress bar and only on hover. That is
 * deliberate: cancelling a paid render is destructive and irreversible, so it
 * should not be a permanently-lit target sitting one row above a Download
 * button — but it also has to be reachable without a menu, because the moment
 * you want it is the moment you are watching the bar. Hover reveals it; it is
 * still keyboard-reachable, since focus counts as revealing it too.
 */
function RunAction({
  run,
  onCancel,
  onRetry,
}: {
  run: WorkOrderRun;
  onCancel: () => void;
  onRetry: () => void;
}) {
  if (run.status === "completed") {
    return (
      <Button
        variant="brand"
        size="sm"
        data-ui={`run-download-${run.id}`}
        className="w-full"
        onClick={() => {
          /* The archive is produced server-side; wiring lands with the API. */
        }}
      >
        <Icon name="download" size={15} />
        Download (100%)
      </Button>
    );
  }

  if (run.status === "failed" || run.status === "cancelled") {
    return (
      <Button
        variant="secondary"
        size="sm"
        data-ui={`run-retry-${run.id}`}
        className="w-full"
        onClick={onRetry}
      >
        <Icon name="retry" size={15} />
        Try Again
      </Button>
    );
  }

  const percent = runPercent(run);
  // Recomputed on every tick, because the store hands out a fresh object for
  // each running row once a second — the same beat that moves the bar.
  const remaining = runRemainingMs(run);
  return (
    <div className="group/run flex flex-col items-end gap-1.5">
      <div className="flex w-full items-center justify-end gap-1.5">
        {/* THE PERCENTAGE IS NOT THE QUESTION. "49%" answers how far along, and
            what anyone actually wants to know standing in front of a render is
            whether to wait for it — so the time to go rides beside it. */}
        <span className="type-caption text-content-muted">
          In Progress ({percent}%)
          {remaining != null && (
            <span className="text-content-subtle"> · {formatRemaining(remaining)}</span>
          )}
        </span>
        {isCancellable(run) && (
          <button
            type="button"
            aria-label={`Cancel Work Order ${run.id}`}
            title="Cancel this Work Order"
            data-ui={`run-cancel-${run.id}`}
            onClick={onCancel}
            /* Hidden until the row is hovered or the button itself is focused —
               `opacity` rather than `hidden`, so the row's width doesn't shift
               under the cursor as it appears. */
            className={cn(
              "grid h-5 w-5 shrink-0 place-items-center rounded-full text-content-subtle opacity-0 transition-opacity",
              "hover:bg-danger/20 hover:text-danger focus-visible:opacity-100",
              "group-hover/run:opacity-100"
            )}
          >
            <Icon name="close" size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised"
      >
        <div
          className="h-full rounded-full bg-warning transition-[width] duration-300 ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
