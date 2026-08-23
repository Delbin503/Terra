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
}

/** Top-right glass cluster: scene selector · account, then primary actions. */
export function EditorActions({
  userName,
  onGenerate,
  onSave,
  onExit,
  onDownload,
  activeRuns = 0,
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
          <GlassGhostButton
            ui="download"
            icon="download"
            label="Work Orders"
            onClick={onDownload}
          />
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
