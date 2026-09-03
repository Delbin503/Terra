import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button, Tooltip } from "@/components/ui";
import { Panel, PanelHeader, PanelTitle, PanelClose } from "./ui";
import { useDismissable } from "./use-dismissable";
import { useSettings } from "@/features/settings/settings-store";
import { TopUpDialog } from "@/features/settings/TopUpDialog";
import { workspace } from "./account-data";

/**
 * CreditsMenu — the lightning affordance in the editor's top-right cluster.
 * Clicking it opens the Credits popover: the workspace identity, a running
 * Terra-credits balance and a Top Up action. Built from the shared glass Panel
 * primitives on the `overlay` tier so it reads as the same material as the
 * docked panels it floats over.
 *
 * The POPOVER is `CreditsPanel` below, and it is exported, because the web side
 * shows the same balance behind the same question — click the number in the top
 * bar and this is what should open. One panel, two triggers, rather than the
 * web growing a lookalike that drifts.
 */
export function CreditsMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismissable(open, () => setOpen(false), wrap);

  return (
    <div ref={wrap} className="relative">
      {/* Suppressed while the popover is up: the panel below already says
          Credits, and a tooltip over your own open panel is noise. */}
      <Tooltip label="Credits" side="bottom" tone="glass" hidden={open}>
        <button
          type="button"
          aria-label="Credits"
          aria-expanded={open}
          data-ui="editor-credits"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2 text-content-muted transition-colors hover:bg-glass/15 hover:text-content",
            open && "bg-glass/15 text-content"
          )}
        >
          {/* No ring of its own any more: the credit mark IS a ringed glyph
              (see terra-credit.tsx), and a circle inside a circle read as a
              button with a target painted on it. */}
          <Icon name="credits" size={22} className="text-brand" />
          <Icon name="chevron-down" size={15} />
        </button>
      </Tooltip>

      {open && (
        <CreditsPanel
          workspace={workspace.name}
          onClose={() => setOpen(false)}
          className="absolute left-0 top-[calc(100%+10px)] z-50 origin-top-left animate-menu-in"
        />
      )}
    </div>
  );
}

/**
 * THE CREDITS POPOVER — who the balance belongs to, what it is, and the two
 * things you can do about it.
 *
 * Sized to the project-emoji picker rather than to its own contents. These hang
 * off a 48px bar: at 360px with a display-sized balance the panel read as a page
 * that had landed on the viewport rather than as a menu belonging to the button
 * above it.
 *
 * TOP UP BUYS HERE; History leaves for Settings → Terra Balance, where the
 * ledger lives. Both used to leave: pressing Top Up on the balance's own panel
 * sent you to a page carrying another Top Up button, which is a signpost rather
 * than a control. The purchase is a dialog now (see TopUpDialog) and this panel
 * mounts it, so the balance above it moves without the screen changing.
 */
export function CreditsPanel({
  workspace: name,
  onClose,
  className,
}: {
  workspace: string;
  onClose: () => void;
  /** where the caller hangs it off its own trigger */
  className?: string;
}) {
  /* One balance, read from the account rather than passed in: the editor, the
     web top bar and Settings were three callers each handing this panel their
     own frozen figure. */
  const { creditBalance: balance } = useSettings();
  const [topUp, setTopUp] = useState(false);

  const toBalance = () => {
    onClose();
    window.location.hash = "#settings/balance";
  };

  return (
    <Panel
      ui="credits"
      thickness="overlay"
      className={cn("w-[248px] !rounded-2xl", className)}
    >
      <PanelHeader className="px-3 py-2.5">
        <PanelTitle>Credits</PanelTitle>
        <PanelClose size="sm" onClick={onClose} />
      </PanelHeader>

      <div className="flex flex-col gap-2.5 p-3">
        {/* Workspace identity + history */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
              style={{ background: "var(--gradient-brand)" }}
            >
              <Icon name="credits" size={13} />
            </span>
            <span className="type-caption-strong truncate text-content">{name}</span>
          </div>
          <button
            type="button"
            data-ui="credits-history"
            onClick={toBalance}
            className="type-caption-strong shrink-0 text-content-muted transition-colors hover:text-brand"
          >
            History
          </button>
        </div>

        {/* Balance card */}
        <div
          data-ui="credits-balance"
          className="relative overflow-hidden rounded-xl border border-glass/12 bg-glass/10 p-3"
        >
          {/* Decorative corner glow — kept faint so the number stays the hero. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-8 -right-6 h-24 w-28 rounded-full opacity-40 blur-2xl"
            style={{ background: "var(--gradient-brand)" }}
          />
          <div className="relative flex items-end justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span className="type-eyebrow flex items-center gap-1 text-content-muted">
                <Icon name="credits" size={11} className="text-brand-on-glass" />
                Terra Credits
              </span>
              <span className="type-title leading-none text-brand-on-glass tabular-nums">
                {balance.toLocaleString()}
              </span>
            </div>
            <Button
              variant="brand"
              size="sm"
              data-ui="credits-topup"
              onClick={() => setTopUp(true)}
              className="!h-7 !rounded-lg !px-2.5"
            >
              Top Up
            </Button>
          </div>
        </div>
      </div>

      {/* Inside the panel, so the panel stays open behind the purchase and the
          balance it just changed is the first thing under the dialog. */}
      <TopUpDialog open={topUp} onOpenChange={setTopUp} />
    </Panel>
  );
}
