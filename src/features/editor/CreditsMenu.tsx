import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button, Tooltip } from "@/components/ui";
import { Panel, PanelHeader, PanelTitle, PanelClose } from "./ui";
import { useDismissable } from "./use-dismissable";
import { workspace, terraCredits } from "./account-data";

/**
 * CreditsMenu — the lightning affordance in the top-right cluster (replaces the
 * old globe scene-selector). Clicking it opens the Credits popover: the
 * workspace identity, a running Terra-credits balance and a Top Up action.
 * Built from the shared glass Panel primitives on the `overlay` tier so it reads
 * as the same material as the docked panels it floats over.
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
          <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-brand text-brand">
            <Icon name="credits" size={13} strokeWidth={2.4} />
          </span>
          <Icon name="chevron-down" size={15} />
        </button>
      </Tooltip>

      {open && (
        /* Sized to the project-emoji picker, not to its own contents. These
           popovers hang off a 48px bar over a live 3D scene: at 360px with a
           display-sized balance the panel read as a page that had landed on the
           viewport rather than as a menu belonging to the button above it. */
        <Panel
          ui="credits"
          thickness="overlay"
          className="absolute left-0 top-[calc(100%+10px)] z-50 w-[248px] !rounded-2xl"
        >
          <PanelHeader className="px-3 py-2.5">
            <PanelTitle>Credits</PanelTitle>
            <PanelClose size="sm" onClick={() => setOpen(false)} />
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
                <span className="type-caption-strong truncate text-content">{workspace.name}</span>
              </div>
              <button
                type="button"
                data-ui="credits-history"
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
                    {terraCredits.toLocaleString()}
                  </span>
                </div>
                <Button
                  variant="brand"
                  size="sm"
                  data-ui="credits-topup"
                  className="!h-7 !rounded-lg !px-2.5"
                >
                  Top Up
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
