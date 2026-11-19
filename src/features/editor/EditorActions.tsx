import { GlassBar, GlassDivider, GlassGhostButton } from "@/components/glass";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CreditsMenu } from "./CreditsMenu";
import { AccountMenu } from "./AccountMenu";

interface EditorActionsProps {
  userName: string;
  onGenerate?: () => void;
  onSave?: () => void;
  /** opens the confirm — the cluster never leaves the editor on its own */
  onExit?: () => void;
  /** opens the Work Orders list — there is nothing to download until a run
   *  finishes, so the button leads to the runs rather than to a file save */
  onDownload?: () => void;
  /** runs still in flight, badged on the Download button */
  activeRuns?: number;
  /** just back from a dispatch: ring the Work Orders button and say where the run went */
  highlightOrders?: boolean;
  onDismissOrdersHint?: () => void;
}

/** Top-right glass cluster: scene selector · account, then primary actions. */
export function EditorActions({
  userName,
  onGenerate,
  onSave,
  onExit,
  onDownload,
  activeRuns = 0,
  highlightOrders = false,
  onDismissOrdersHint,
}: EditorActionsProps) {
  return (
    <div className="pointer-events-auto flex items-center">
      {/* One unified glass pill: account/credits · action icons · Generate. */}
      <GlassBar ui="editor-action-cluster" className="h-12 gap-1 px-1.5">
        <CreditsMenu />
        <AccountMenu userName={userName} />

        <GlassDivider className="mx-0.5" />

        {/* Badged while anything is rendering, so a run you dispatched and left
            has a way of telling you it's still going without a toast that
            outstays its welcome. */}
        <div className="relative">
          {/* Just back from Dispatch: a pulsing ring, so the eye lands on where
              the run lives now. Cleared by opening Work Orders or the callout's ×. */}
          {highlightOrders && (
            <span
              aria-hidden
              data-ui="orders-highlight"
              className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-brand shadow-[0_0_18px_hsl(var(--brand)/0.7)] animate-pulse"
            />
          )}
          <GlassGhostButton
            ui="download"
            icon="download"
            label="Work Orders"
            onClick={onDownload}
            className={highlightOrders ? "bg-brand/15 text-brand hover:bg-brand/25 hover:text-brand" : undefined}
          />
          {highlightOrders && (
            <div
              data-ui="orders-callout"
              role="status"
              className="absolute right-[-8px] top-[calc(100%+12px)] z-50 w-64 animate-in fade-in-0 slide-in-from-top-1 rounded-xl border border-white/15 bg-[rgb(20_18_16/0.97)] p-3 text-left shadow-[0_16px_40px_rgb(0_0_0/0.5)] backdrop-blur-xl"
            >
              <span aria-hidden className="absolute -top-1.5 right-[22px] h-3 w-3 rotate-45 border-l border-t border-white/15 bg-[rgb(20_18_16)]" />
              <div className="flex items-start gap-2">
                <Icon name="generate" size={15} className="mt-0.5 shrink-0 text-brand" />
                <p className="type-caption grow text-content">
                  Your dataset is generating. Track it and download the frames from <b>Work Orders</b>.
                </p>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={onDismissOrdersHint}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-content-muted hover:text-content"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            </div>
          )}
          {activeRuns > 0 && (
            <span
              aria-hidden
              className="type-caption-strong pointer-events-none absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-brand-foreground"
            >
              {activeRuns}
            </span>
          )}
        </div>

        <GlassGhostButton ui="save" icon="save" label="Save" onClick={onSave} />

        {/* The only control in the bar that throws the viewport away, so it is
            the only one that isn't grey: `export` (an upload arrow) read as
            another way to get files out, sitting one icon from Download. A
            sign-out glyph in danger ink says which door this is. */}
        <GlassGhostButton
          ui="exit"
          icon="sign-out"
          label="Exit project"
          onClick={onExit}
          className="text-danger hover:bg-danger/15 hover:text-danger"
        />

        <GlassDivider className="mx-0.5" />

        <Button
          variant="brand"
          size="sm"
          onClick={onGenerate}
          data-ui="editor-generate"
          className="!rounded-full"
        >
          <Icon name="generate" size={16} />
          Generate
        </Button>
      </GlassBar>
    </div>
  );
}
