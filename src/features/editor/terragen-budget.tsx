import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button, Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui";
import { Panel, Pill } from "./ui";
import type { Asset } from "./assets-data";
import {
  AXIS_BY_ID,
  formatBytes,
  formatCount,
  formatDuration,
  permutations,
  type Gate,
  type Totals,
  type WorkOrder,
} from "./work-order";

/**
 * THE BUDGET RAIL — the right column.
 *
 * This exists because the arithmetic is genuinely unintuitive: on a 12-subset
 * order, one more environment value costs a full sweep again, and halving the
 * yaw increment costs the same. Nobody can hold that in their head from a list
 * of toggles, so the number has to move while the control is being touched. It
 * is treated the way CaptureRunPanel treats plan.totalFrames — as the thing the
 * dataset is billed and judged on.
 *
 * The permutation preview under it is the honesty check: the multiplication is
 * shown as the actual table TerraOrchestrator will walk, not as a number the
 * user has to take on faith.
 */
export function BudgetRail({
  order,
  totals,
  assets,
  credits,
}: {
  order: WorkOrder;
  totals: Totals;
  assets: Asset[];
  credits: number;
}) {
  const rows = permutations(order, assets, 12);
  const affordable = totals.credits <= credits;

  return (
    <div data-ui="terragen-budget" className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* Headline — subsets and frames, in the order the pipeline produces them */}
      <section>
        <h3 className="type-eyebrow mb-2 text-content-muted">Budget</h3>

        <div className="rounded-xl border border-glass/12 bg-glass/6 p-3">
          <div className="flex items-baseline justify-between">
            <span className="type-body text-content-subtle">Subsets</span>
            <span className="type-numeric text-content">{formatCount(totals.subsets)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="type-body text-content-subtle">Frames each</span>
            <span className="type-numeric text-content">{formatCount(totals.framesPerSubset)}</span>
          </div>

          <div className="my-2.5 h-px bg-glass/12" />

          <div className="flex items-baseline justify-between">
            <span className="type-body-strong text-content">Total frames</span>
            <span data-ui="terragen-total-frames" className="type-title tabular-nums text-content">
              {formatCount(totals.frames)}
            </span>
          </div>
        </div>

        <dl className="mt-2 space-y-1.5">
          <Estimate icon="download" label="Archive" value={formatBytes(totals.bytes)} />
          <Estimate icon="render-time" label="Render time" value={formatDuration(totals.seconds)} />
          <Estimate
            icon="credits"
            label="Credits"
            value={formatCount(totals.credits)}
            tone={affordable ? "default" : "danger"}
            note={affordable ? `${formatCount(credits - totals.credits)} left after` : "over balance"}
          />
        </dl>
      </section>

      {/* What is multiplying what */}
      <section>
        <h3 className="type-eyebrow mb-2 text-content-muted">Multipliers</h3>
        {totals.multipliers.length === 0 ? (
          <p className="type-caption rounded-lg border border-glass/10 bg-glass/6 px-2.5 py-2 text-content-subtle">
            No axis is on — this is a single subset that reproduces your scene.
          </p>
        ) : (
          <ul className="space-y-1">
            {totals.multipliers.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-lg border border-glass/10 bg-glass/6 px-2.5 py-1.5"
              >
                <Icon name={AXIS_BY_ID[m.id].icon} size={13} className="text-content-subtle" />
                <span className="type-body grow truncate text-content-muted">{m.label}</span>
                <span className="type-numeric text-content">×{m.count}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="type-caption mt-2 text-content-subtle">
          The camera rig sweeps {formatCount(totals.framesPerSubset)}{" "}
          {totals.framesPerSubset === 1 ? "frame" : "frames"} inside every subset, in one session.
        </p>
      </section>

      {/* The permutation table, as far as it's useful to show */}
      <section className="min-h-0">
        <h3 className="type-eyebrow mb-2 text-content-muted">
          Subset preview
          {totals.subsets > rows.length && rows.length > 0 && (
            <span className="ml-1 font-normal normal-case text-content-subtle">
              first {rows.length} of {formatCount(totals.subsets)}
            </span>
          )}
        </h3>

        {rows.length === 0 ? (
          <p className="type-caption rounded-lg border border-glass/10 bg-glass/6 px-2.5 py-2 text-content-subtle">
            One subset: the scene exactly as it stands, swept by your camera rig.
          </p>
        ) : (
          <ol className="space-y-1">
            {rows.map((r) => (
              <li
                key={r.index}
                className="flex items-start gap-2 rounded-lg border border-glass/10 bg-glass/6 px-2 py-1.5"
              >
                <span className="type-numeric-sm w-4 shrink-0 pt-0.5 text-right text-content-subtle">
                  {r.index}
                </span>
                <span className="flex flex-wrap gap-1">
                  {r.cells.map((c) => (
                    <Pill key={`${c.axis}-${c.value}`} ui={`subset-${c.axis}`} tone="muted">
                      {c.value}
                    </Pill>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/**
 * DISPATCH REVIEW — the budget, at the moment it becomes a decision.
 *
 * The rail used to live permanently in the sheet's right column so the total
 * moved while a control was being touched. It now appears here instead, which
 * is a real trade: the running cost is no longer ambient, so someone can author
 * an expensive order without watching it get expensive. What this buys is a
 * sheet that is about the dataset rather than about the bill, and one unmissable
 * checkpoint before anything is spent — nobody dispatches without reading the
 * number, because it is the only thing on screen.
 *
 * Blockers are repeated here rather than assumed handled. The button that opened
 * this dialog is already disabled while any exist, but a warn-level gate is
 * exactly the kind of thing worth restating on the last screen before spending.
 */
export function DispatchReview({
  order,
  totals,
  assets,
  credits,
  gates,
  onConfirm,
  onCancel,
}: {
  order: WorkOrder;
  totals: Totals;
  assets: Asset[];
  credits: number;
  gates: Gate[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const warnings = gates.filter((g) => g.level === "warn");
  const blocked = gates.some((g) => g.level === "block");

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        hideClose
        aria-describedby="dispatch-review-description"
        className={cn(
          "max-h-[86vh] w-[min(30rem,calc(100vw-3rem))] max-w-none",
          "border-0 bg-transparent p-0 shadow-none"
        )}
      >
        <Panel ui="dispatch-review" thickness="overlay" className="max-h-[86vh] overflow-hidden">
          <header className="flex shrink-0 items-center gap-3 border-b border-glass/12 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
              <Icon name="generate" size={17} />
            </span>
            <div className="min-w-0">
              <DialogTitle className="type-heading text-content">Dispatch Work Order</DialogTitle>
              <DialogDescription
                id="dispatch-review-description"
                className="type-caption text-content-muted"
              >
                What this run costs, before it starts
              </DialogDescription>
            </div>
          </header>

          <div className="min-h-0 grow overflow-y-auto">
            <BudgetRail order={order} totals={totals} assets={assets} credits={credits} />
          </div>

          <footer className="flex shrink-0 flex-col gap-2.5 border-t border-glass/12 p-3">
            {warnings.map((g) => (
              <p
                key={g.id}
                data-ui={`dispatch-warn-${g.id}`}
                className="type-caption flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning-soft/40 px-2.5 py-2 text-warning"
              >
                <Icon name="warning" size={13} className="mt-px shrink-0" />
                <span>{g.message}</span>
              </p>
            ))}
            <div className="flex gap-2.5">
              <Button variant="ghost" size="sm" className="grow" onClick={onCancel}>
                Back to settings
              </Button>
              <Button
                variant="brand"
                size="sm"
                className="grow"
                data-ui="dispatch-confirm"
                disabled={blocked}
                onClick={onConfirm}
              >
                <Icon name="generate" size={15} />
                Dispatch {formatCount(totals.frames)} {totals.frames === 1 ? "frame" : "frames"}
              </Button>
            </div>
          </footer>
        </Panel>
      </DialogContent>
    </Dialog>
  );
}

function Estimate({
  icon,
  label,
  value,
  note,
  tone = "default",
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  value: string;
  note?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        name={icon}
        size={13}
        className={tone === "danger" ? "text-danger" : "text-content-subtle"}
      />
      <dt className="type-body grow text-content-subtle">{label}</dt>
      <dd className="text-right">
        <span
          className={cn("type-numeric", tone === "danger" ? "text-danger" : "text-content")}
        >
          {value}
        </span>
        {note && <span className="type-caption block text-content-subtle">{note}</span>}
      </dd>
    </div>
  );
}
