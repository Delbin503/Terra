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
}

/** Top-right glass cluster: scene selector · account, then primary actions. */
export function EditorActions({
  userName,
  onGenerate,
  onSave,
  onExit,
}: EditorActionsProps) {
  return (
    <div className="pointer-events-auto flex items-center">
      {/* One unified glass pill: account/credits · action icons · Generate. */}
      <GlassBar ui="editor-action-cluster" className="h-12 gap-1 px-1.5">
        <CreditsMenu />
        <AccountMenu userName={userName} />

        <GlassDivider className="mx-0.5" />

        <GlassGhostButton ui="download" icon="download" label="Download" />

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
