import { GlassBar, GlassDivider, GlassGhostButton } from "@/components/glass";
import { Avatar, Button } from "@/components/ui";
import { Icon } from "@/components/icons";

interface EditorActionsProps {
  userName: string;
  onGenerate?: () => void;
}

/** Top-right glass cluster: scene selector · account, then primary actions. */
export function EditorActions({ userName, onGenerate }: EditorActionsProps) {
  return (
    <div className="pointer-events-auto flex items-center gap-2">
      {/* Selector + account */}
      <GlassBar ui="editor-account-cluster" className="h-12 gap-1 px-1.5">
        <button
          type="button"
          aria-label="Switch scene"
          data-ui="editor-scene-selector"
          className="flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2 text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-brand text-brand">
            <Icon name="world" size={13} strokeWidth={2.4} />
          </span>
          <Icon name="chevron-down" size={15} />
        </button>

        <button
          type="button"
          aria-label={`Account: ${userName}`}
          data-ui="editor-account"
          className="flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-glass/15"
        >
          <Avatar name={userName} size={30} />
          <Icon name="chevron-down" size={15} className="text-content-muted" />
        </button>
      </GlassBar>

      {/* Primary actions */}
      <GlassBar ui="editor-action-cluster" className="h-12 gap-1 px-1.5">
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
        <GlassDivider className="mx-0.5" />
        <GlassGhostButton ui="download" icon="download" label="Download" />
        <GlassGhostButton ui="save" icon="save" label="Save" />
        <GlassGhostButton ui="exit" icon="export" label="Exit project" />
      </GlassBar>
    </div>
  );
}
