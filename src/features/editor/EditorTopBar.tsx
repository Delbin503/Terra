import { useState } from "react";
import { GlassBar, GlassDivider, GlassGhostButton } from "@/components/glass";
import { ProjectEmojiPicker, emojiForProject } from "./ProjectEmojiPicker";

interface EditorTopBarProps {
  projectName: string;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

/** Top-left project chrome: project emoji · project name · undo / redo. */
export function EditorTopBar({ projectName, onUndo, onRedo, canUndo = false, canRedo = false }: EditorTopBarProps) {
  // Seeded from the project name, then user-overridable. Keyed on projectName so
  // switching projects re-derives instead of carrying the previous mark over.
  const [emoji, setEmoji] = useState(() => emojiForProject(projectName));

  return (
    <GlassBar
      ui="editor-topbar"
      shape="panel"
      className="pointer-events-auto h-14 gap-3 pl-2.5 pr-3"
    >
      {/* Project mark — click to pick a different emoji */}
      <ProjectEmojiPicker value={emoji} onChange={setEmoji} projectName={projectName} />

      <span className="text-md font-medium text-content">{projectName}</span>

      <GlassDivider className="mx-1" />

      <div className="flex items-center gap-0.5">
        <GlassGhostButton ui="undo" size="sm" icon="undo" label="Undo" onClick={onUndo} disabled={!canUndo} />
        <GlassGhostButton ui="redo" size="sm" icon="redo" label="Redo" onClick={onRedo} disabled={!canRedo} />
      </div>
    </GlassBar>
  );
}
