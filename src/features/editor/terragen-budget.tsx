import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button, Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui";
import {
  Panel,
  PanelBody,
  PanelClose,
  PanelFooter,
  PanelHeader,
  PanelSection,
  PanelSubtitle,
  PanelTitle,
  Pill,
} from "./ui";
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
 * THE BILL, as the review dialog's body.
 *
 * This exists because the arithmetic is genuinely unintuitive: on a 12-subset
 * order, one more environment value costs a full sweep again, and halving the
 * yaw increment costs the same. Nobody can hold that in their head from a list
 * of toggles, so the number is stated once, in full, at the moment it becomes a
 * decision. It is treated the way CaptureRunPanel treats plan.totalFrames — as
 * the thing the dataset is billed and judged on.
 *
 * The permutation preview under it is the honesty check: the multiplication is
 * shown as the actual table TerraOrchestrator will walk, not as a number the
 * user has to take on faith.
 *
 * NO PADDING AND NO SCROLLER OF ITS OWN. It was a standing right-hand rail
 * once, and it kept the rail's `h-full overflow-y-auto p-4` after it moved into
 * the dialog — which put a second scrollbar inside `PanelBody`'s, and gave the
 * dialog a body inset that no other panel in the editor has. The panel owns
 * both now, so this reads as the contents of a panel rather than as a panel
 * inside one.
 */
function BudgetBody({
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
    <>
      {/* Headline — subsets and frames, in the order the pipeline produces them */}
      <PanelSection title="Budget">
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

        {/* The three estimates read as panel detail rows — same divider, same
            baseline — because that is what they are: label on the left, value on
            the right. Only the icon and the tone are this panel's own. */}
        <dl className="mt-1">
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
      </PanelSection>

      {/* What is multiplying what */}
      <PanelSection title="Multipliers">
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
                {/* Weather multiplies like an axis but isn't one — it lives on
                    the scene, so it has no entry in the axis table. */}
                <Icon
                  name={m.id === "weather" ? "sunny" : AXIS_BY_ID[m.id].icon}
                  size={13}
                  className="text-content-subtle"
                />
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
      </PanelSection>

      {/* The permutation table, as far as it's useful to show */}
      <PanelSection title="Subset preview" className="mb-0">
        {totals.subsets > rows.length && rows.length > 0 && (
          <p className="type-caption mb-1.5 text-content-subtle">
            First {rows.length} of {formatCount(totals.subsets)}.
          </p>
        )}

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
      </PanelSection>
    </>
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
      {/* The Dialog contributes the scrim, the focus trap and Escape; the glass
          is the Panel's, so the modal is the same surface as the dock it opened
          from rather than a second, flatter one. */}
      <DialogContent
        hideClose
        aria-describedby="dispatch-review-description"
        data-ui="dispatch-review-dialog"
        className="w-[min(30rem,calc(100vw-3rem))] max-w-none border-0 bg-transparent p-0 shadow-none"
      >
        <Panel ui="dispatch-review" thickness="overlay" className="max-h-[86vh] overflow-hidden">
          <PanelHeader align="start" className="p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                <Icon name="generate" size={17} />
              </span>
              <div className="min-w-0">
                <DialogTitle asChild>
                  <PanelTitle>Dispatch Work Order</PanelTitle>
                </DialogTitle>
                <DialogDescription asChild>
                  <PanelSubtitle id="dispatch-review-description">
                    What this run costs, before it starts
                  </PanelSubtitle>
                </DialogDescription>
              </div>
            </div>
            {/* Every other glass panel closes from its top-right corner, and
                this one had nothing there — the only way out was the footer. */}
            <PanelClose size="sm" label="Back to settings" onClick={onCancel} />
          </PanelHeader>

          <PanelBody>
            <BudgetBody order={order} totals={totals} assets={assets} credits={credits} />
          </PanelBody>

          <PanelFooter className="flex-col">
            {warnings.map((g) => (
              <p
                key={g.id}
                data-ui={`dispatch-warn-${g.id}`}
                className="type-caption flex w-full items-start gap-1.5 rounded-lg border border-warning/40 bg-warning-soft/40 px-2.5 py-2 text-warning"
              >
                <Icon name="warning" size={13} className="mt-px shrink-0" />
                <span>{g.message}</span>
              </p>
            ))}
            <div className="flex w-full gap-2.5">
              <Button
                variant="secondary"
                size="md"
                className="flex-1 !rounded-xl"
                data-ui="dispatch-cancel"
                onClick={onCancel}
              >
                Back to settings
              </Button>
              <Button
                variant="brand"
                size="md"
                className="flex-1 !rounded-xl"
                data-ui="dispatch-confirm"
                disabled={blocked}
                onClick={onConfirm}
              >
                <Icon name="generate" size={15} />
                Dispatch {formatCount(totals.frames)} {totals.frames === 1 ? "frame" : "frames"}
              </Button>
            </div>
          </PanelFooter>
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
    <div className="flex items-center gap-2 border-b border-glass/6 py-2 last:border-0">
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
