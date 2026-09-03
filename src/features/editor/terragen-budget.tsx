import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Button, Dialog, DialogContent, DialogTitle } from "@/components/ui";
import {
  Panel,
  PanelBody,
  PanelClose,
  PanelFooter,
  PanelHeader,
  PanelSection,
  PanelTitle,
  Pill,
} from "./ui";
import type { Asset } from "./assets-data";
import {
  AXIS_BY_ID,
  type AxisId,
  formatBytes,
  formatCount,
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
 * decision.
 *
 * WHAT THIS REWRITE FIXED. The first cut was four stacked boxes of label/value
 * pairs — subsets, frames each, total frames, then archive, render time and
 * credits as three near-identical rows, then a multiplier list, then a
 * permutation table. Everything was the same size, so nothing was the answer:
 * people read it and still asked how long the run would take, because "31 sec"
 * sat in a 13px row between two others exactly like it.
 *
 * So there is now ONE headline (the frames you are buying), THREE tiles for the
 * three things people actually came to check — how long, how big, how much —
 * and one plain sentence explaining where the number came from. The permutation
 * table is still here, but folded: it is the honesty check for a suspicious
 * total, not something to read on every dispatch.
 */
function BudgetBody({
  order,
  totals,
  assets,
  credits,
  changes,
}: {
  order: WorkOrder;
  totals: Totals;
  assets: Asset[];
  credits: number;
  /** what the user put into this order — see `orderChanges` */
  changes: Change[];
}) {
  const rows = permutations(order, assets, 12);
  const affordable = totals.credits <= credits;
  // "36 MB" set whole at the value size made the archive outweigh the credits
  // — three glyphs of unit are wider than two of number, so the less important
  // row won the page. The digits keep the size; the unit steps down.
  const [archiveSize, archiveUnit] = formatBytes(totals.bytes).split(" ");
  const [showSubsets, setShowSubsets] = useState(false);

  return (
    <>
      {/* ------------------------------------------------------- the headline */}
      {/* ONE caption, then the number.
          The label, the figure and the working were three stacked lines, which
          made the block read as a paragraph you had to parse rather than as an
          answer. The working now rides in parentheses on the label — it is the
          same sentence, so it belongs on the same line — leaving the figure
          alone underneath with nothing to compete with. It takes the brand
          colour because it is the one number this whole screen exists to show;
          every other figure below it stays in ink. */}
      <div
        data-ui="dispatch-headline"
        className="mb-3 rounded-2xl border border-glass/10 bg-glass/5 px-5 py-5 text-center"
      >
        <span className="type-eyebrow block text-content-subtle">
          Frames this run{" "}
          <span className="text-content-subtle">
            ({formatCount(totals.subsets)} {totals.subsets === 1 ? "subset" : "subsets"} ×{" "}
            {formatCount(totals.framesPerSubset)}{" "}
            {totals.framesPerSubset === 1 ? "frame" : "frames"} from the camera rig)
          </span>
        </span>
        <span
          data-ui="terragen-total-frames"
          /* text-3xl, not 4xl. At the larger size the frame count was taller
             than the dialog's own title and read as the screen's headline
             rather than as one of three figures on it. */
          className="type-display mt-2 block text-3xl tabular-nums text-brand"
        >
          {formatCount(totals.frames)}
        </span>
      </div>

      {/* --------------------------------------------------------- what it costs */}
      {/* TWO CELLS OF THE SAME SHAPE, AND NO METER.
          The meter drew this run's share of the balance, and on a normal order
          that share is a fraction of a percent — it rendered as a six-pixel dot
          with an empty track beside it, which reads as a broken progress bar
          rather than as "barely anything". The line under the number already
          does the meter's job in figures nobody has to measure by eye.

          SIDE BY SIDE, not stacked. These are two independent answers to "what
          does pressing the button cost me" — credits out of the balance, bytes
          onto the disk — and one is not read before the other. Stacked, the
          block ran to three bands under the headline and the whole screen was a
          column of figures to scan down; paired, the eye takes both at once and
          the section is one object. Each cell stacks internally (label, figure,
          working) so a half-width column doesn't have to fit a label and a
          number on one baseline. */}
      <div
        data-ui="dispatch-cost"
        className={cn(
          "mb-5 grid grid-cols-2 divide-x overflow-hidden rounded-2xl border",
          affordable
            ? "divide-glass/10 border-glass/10 bg-glass/5"
            : "divide-danger/25 border-danger/45 bg-danger-soft/25"
        )}
      >
        <CostRow
          icon="credits"
          label="Credits"
          ui="dispatch-credits"
          value={formatCount(totals.credits)}
          tone={affordable ? "default" : "danger"}
          note={
            affordable ? (
              // The balance AFTER the run is the only figure worth carrying —
              // "3,728 now → 3,712 after this run" spent a whole line restating
              // a number already in the top bar to make one subtraction.
              <>({formatCount(credits - totals.credits)} left)</>
            ) : (
              <span className="text-danger">
                {formatCount(totals.credits - credits)} more than your balance of{" "}
                {formatCount(credits)}
              </span>
            )
          }
        />
        <CostRow
          icon="download"
          label="Archive"
          ui="dispatch-archive"
          value={archiveSize}
          unit={archiveUnit}
          note={
            <>
              {formatCount(totals.frames)} {totals.frames === 1 ? "frame" : "frames"} at{" "}
              {order.output.resolution.width}×{order.output.resolution.height}
            </>
          }
        />
      </div>

      {/* ------------------------------------------------ what you put in it */}
      {/* The order, as a list of what the user actually did to it — because by
          the time anyone reaches this screen they have been through six
          sections and a library sheet, and "did the second chair make it in?"
          is a fair question to be asking with a Dispatch button in front of
          you. Only what is there is listed: a row per thing, never a zero. */}
      {changes.length > 0 && (
        <PanelSection title="What you added">
          {/* Separated cards rather than a divided list. These are three
              unrelated facts you scan for one of, not a table you read down,
              and the gaps make each one its own target for the eye. */}
          <ul data-ui="dispatch-changes" className="space-y-2">
            {changes.map((c) => (
              <li
                key={c.label}
                className="flex items-center gap-2.5 rounded-xl border border-glass/10 bg-glass/5 px-3.5 py-3"
              >
                <Icon name={c.icon} size={16} className="shrink-0 text-content-subtle" />
                <span className="type-body grow truncate text-content">{c.label}</span>
                <span className="type-numeric text-content-muted">{c.value}</span>
              </li>
            ))}
          </ul>
        </PanelSection>
      )}

      {/* ------------------------------------------------- where it comes from */}
      {/* Only when there is something to explain.
          On a one-subset order this section said "One subset — your scene
          exactly as it stands", which is a restatement of the caption at the
          top of the same dialog. A heading and a bordered box to repeat a line
          already on screen is the section earning nothing, so it now appears
          only when multipliers actually multiplied something. */}
      {(totals.multipliers.length > 0 || rows.length > 0) && (
      <PanelSection title="Why this many" className="mb-0">
        {totals.multipliers.length === 0 ? null : (
          <ul className="space-y-1">
            {totals.multipliers.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-lg border border-glass/10 bg-glass/5 px-2.5 py-2"
              >
                <Icon name={multiplierIcon(m.id)} size={14} className="shrink-0 text-content-subtle" />
                <span className="type-body grow truncate text-content-muted">{m.label}</span>
                <span className="type-numeric text-content">×{m.count}</span>
              </li>
            ))}
            <li className="flex items-center gap-2 px-2.5 pt-1">
              <span className="type-caption grow text-content-subtle">Subsets</span>
              <span className="type-numeric text-content">{formatCount(totals.subsets)}</span>
            </li>
          </ul>
        )}

        {/* The permutation table, folded. It is the check you run when the
            total looks wrong, not part of reading the total. */}
        {rows.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={showSubsets}
              data-ui="dispatch-subsets-toggle"
              onClick={() => setShowSubsets((v) => !v)}
              className="type-caption mt-2 flex items-center gap-1.5 text-content-subtle transition-colors hover:text-content"
            >
              <Icon
                name="chevron-down"
                size={13}
                className={cn("shrink-0 transition-transform", showSubsets && "rotate-180")}
              />
              {showSubsets
                ? "Hide the subset list"
                : totals.subsets > rows.length
                  ? `Show the first ${rows.length} of ${formatCount(totals.subsets)} subsets`
                  : `Show all ${rows.length} subsets`}
            </button>

            {showSubsets && (
              <ol className="mt-2 space-y-1">
                {rows.map((r) => (
                  <li
                    key={r.index}
                    className="flex items-start gap-2 rounded-lg border border-glass/10 bg-glass/5 px-2 py-1.5"
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
          </>
        )}
      </PanelSection>
      )}
    </>
  );
}

/**
 * One cost, as a label over a figure over the line that explains it.
 *
 * PAIRED WITH ITS SIBLING, not stacked above it. The worry with putting these
 * beside each other used to be that it invites a comparison that means nothing
 * — credits are money leaving the account, megabytes are a file you download.
 * What settles it is that neither is read for its size relative to the other:
 * you check the credits against your balance and the archive against your disk,
 * both once, and having to travel down the panel to do the second was the
 * actual cost of stacking them. The internal stack keeps each figure sitting on
 * its own sentence, which is what the full-width version was really providing.
 */
function CostRow({
  icon,
  label,
  value,
  unit,
  note,
  ui,
  tone = "default",
}: {
  icon: IconName;
  label: string;
  value: string;
  /** set one step down beside the number — "MB", not part of the figure */
  unit?: string;
  note: React.ReactNode;
  ui: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      {/* Label above, figure below — the pair is half a dialog wide now, and
          "Archive" opposite "72 MB" on one baseline left neither room to
          breathe nor anywhere for the over-balance sentence to go. */}
      <span className="type-body-strong flex items-center gap-1.5 text-content">
        <Icon
          name={icon}
          size={15}
          className={cn("shrink-0", tone === "danger" ? "text-danger" : "text-brand")}
        />
        {label}
      </span>
      <span
        data-ui={ui}
        className={cn(
          /* text-lg. At text-xl these two figures were within a hair of the
             frame count above them, so all three competed to be the number
             you read first. */
          "font-display mt-0.5 block text-lg font-semibold tabular-nums",
          tone === "danger" ? "text-danger" : "text-content"
        )}
      >
        {value}
        {unit && <span className="type-body ml-1 text-content-muted">{unit}</span>}
      </span>
      <p className="type-body-dense mt-0.5 text-content-subtle">{note}</p>
    </div>
  );
}

/** One line of "what you added" — a thing the user put into this order. */
export interface Change {
  icon: IconName;
  label: string;
  value: string;
}

/**
 * What the user actually did to this order, as rows.
 *
 * Derived here rather than assembled at the call site, so the review and the
 * panel can never disagree about what "added" means — and deliberately SILENT
 * about anything left at its default: a list that always says "0 swap objects"
 * teaches you to stop reading it.
 */
export function orderChanges(
  order: WorkOrder,
  scene: { objects: number; weatherSets: number; materialSlots: number; materialObjects: number }
): Change[] {
  const rows: Change[] = [];
  const swaps = order.swaps.filter((s) => s.inRun).length;
  const envs = order.background.picks.filter((p) => p.inRun).length;
  const annotations = Object.values(order.output.annotations).filter(Boolean).length;

  if (scene.objects > 0) {
    rows.push({ icon: "scene", label: "Objects in the scene", value: formatCount(scene.objects) });
  }
  if (swaps > 0) rows.push({ icon: "retry", label: "Swap objects", value: formatCount(swaps) });
  if (envs > 0) {
    rows.push({ icon: "panorama", label: "Environments added", value: formatCount(envs) });
  }
  // Named with its seed rather than counted alone: the count says how big the
  // sweep is, the seed says which sweep — and the seed is the only part of this
  // review a person might want to write down.
  if (order.layouts.on) {
    rows.push({
      icon: "arrange",
      label: `Arrangements (seed ${order.layouts.seed})`,
      value: formatCount(order.layouts.count),
    });
  }
  // Material edits are the one thing in this list that costs nothing and
  // changes everything — they don't multiply the run, so they never show up in
  // the budget, and without a row here a scene whose materials were carefully
  // set reviews identically to one whose weren't. Counted both ways because
  // "4 slots" alone doesn't say whether that is one object or four.
  if (scene.materialSlots > 0) {
    rows.push({
      icon: "texture",
      label:
        scene.materialObjects === 1
          ? "Material slots edited"
          : `Material slots edited (${scene.materialObjects} objects)`,
      value: formatCount(scene.materialSlots),
    });
  }
  if (scene.weatherSets > 0) {
    rows.push({
      icon: "sunny",
      label: "Weather sets in the run",
      value: formatCount(scene.weatherSets),
    });
  }
  if (annotations > 0) {
    rows.push({ icon: "capture", label: "Annotation types", value: formatCount(annotations) });
  }
  // Named rather than counted: the one row here that is a setting, not a tally.
  rows.push({
    icon: "settings",
    label: "Frame resolution",
    value: `${order.output.resolution.width}×${order.output.resolution.height}`,
  });
  return rows;
}

/** Weather and object swaps multiply like axes without being ones — they live
 *  on the scene and on the order respectively, so neither has an axis entry. */
function multiplierIcon(id: Totals["multipliers"][number]["id"]): IconName {
  if (id === "weather") return "sunny";
  if (id.startsWith("swaps:")) return "retry";
  return AXIS_BY_ID[id as AxisId].icon;
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
  changes,
  onConfirm,
  onCancel,
}: {
  order: WorkOrder;
  totals: Totals;
  assets: Asset[];
  credits: number;
  gates: Gate[];
  /** what the user put into this order — built by `orderChanges` */
  changes: Change[];
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
        /* Nothing describes it any more, and pointing `aria-describedby` at an
           element that no longer exists is worse than omitting it. */
        aria-describedby={undefined}
        data-ui="dispatch-review-dialog"
        className="w-[min(30rem,calc(100vw-3rem))] max-w-none border-0 bg-transparent p-0 shadow-none"
      >
        <Panel ui="dispatch-review" thickness="overlay" className="max-h-[86vh] overflow-hidden">
          <PanelHeader align="center" className="px-5 py-4">
            {/* Title alone — no mark, no subtitle. The subtitle said "what this
                run costs, before it starts", which is what the frame count, the
                archive size and the credits under it say in numbers one line
                lower; the sparkle disc beside it was decoration on a screen
                whose whole job is to be read carefully. */}
            <div className="min-w-0">
              <DialogTitle asChild>
                <PanelTitle className="font-display text-lg font-semibold">
                  Dispatch Work Order
                </PanelTitle>
              </DialogTitle>
            </div>
            {/* Every other glass panel closes from its top-right corner, and
                this one had nothing there — the only way out was the footer. */}
            <PanelClose label="Back to settings" onClick={onCancel} />
          </PanelHeader>

          <PanelBody className="p-5">
            <BudgetBody
              order={order}
              totals={totals}
              assets={assets}
              credits={credits}
              changes={changes}
            />
          </PanelBody>

          <PanelFooter className="flex-col p-5 pt-4">
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
                className="h-12 flex-1 !rounded-2xl"
                data-ui="dispatch-cancel"
                onClick={onCancel}
              >
                Back to settings
              </Button>
              <Button
                variant="brand"
                size="md"
                className="h-12 flex-1 !rounded-2xl"
                data-ui="dispatch-confirm"
                disabled={blocked}
                onClick={onConfirm}
              >
                <Icon name="generate" size={17} />
                Dispatch {formatCount(totals.frames)} {totals.frames === 1 ? "frame" : "frames"}
              </Button>
            </div>
          </PanelFooter>
        </Panel>
      </DialogContent>
    </Dialog>
  );
}

