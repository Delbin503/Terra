import { useEffect, useRef, useState } from "react";
import { GlassBar, GlassDivider, GlassGhostButton } from "@/components/glass";
import { Tooltip } from "@/components/ui";
import { ProjectEmojiPicker, emojiForProject } from "./ProjectEmojiPicker";

interface EditorTopBarProps {
  projectName: string;
  onRename?: (name: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

/**
 * How much of a project name the bar will show before it starts eliding.
 *
 * The bar sits on the same row as the tool cluster (centred) and the action
 * cluster (right), so its width isn't free — it's the budget the other two have
 * left. 24 characters is what fits at 1280px with both of them at full size.
 */
export const TITLE_MAX = 24;

/**
 * How much of the END of the name survives the elision.
 *
 * Three characters, not three words. Keeping three whole words used to eat the
 * entire budget — "Spiderman Versfwf completely New verse" has a 20-character
 * tail, which left three characters for the head and rendered as
 * "Spi…completely New verse": the name you actually typed first was gone.
 */
const TITLE_TAIL = 3;

/**
 * Elide a long project name from near its END, keeping the beginning readable.
 *
 * HEAD-FIRST. The opening words are what you typed first and what you scan a
 * list for, so they get the budget; only a three-character stub of the ending
 * survives, as a hint that there is more.
 *
 * The trade is real and worth stating: names that differ only after the head —
 * "Traffic Scene — Junction 4 Night Pass" and "… Junction 9 Day Pass" — now
 * render identically. The full name is one hover away in the tooltip, which is
 * where that distinction has to be read.
 *
 * The head is cut back to a word boundary when one is close enough, then
 * stripped of any trailing separator, so it ends on a whole word rather than
 * mid-syllable or on a dangling dash.
 */
export function displayTitle(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= TITLE_MAX) return trimmed;

  const tail = trimmed.slice(-TITLE_TAIL);
  const budget = TITLE_MAX - 1 - TITLE_TAIL;
  let head = trimmed.slice(0, budget).trimEnd();

  // Prefer a whole word, but not at the cost of most of the head — a name whose
  // first word is longer than the budget still has to show something.
  const lastSpace = head.lastIndexOf(" ");
  if (lastSpace > budget * 0.5) head = head.slice(0, lastSpace);

  // "Traffic Scene —…ass" reads as a typo; drop trailing joiners.
  head = head.replace(/[\s\-–—,:;/|]+$/, "");

  return `${head}…${tail}`;
}

/** Top-left project chrome: project emoji · project name · undo / redo. */
export function EditorTopBar({
  projectName,
  onRename,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: EditorTopBarProps) {
  // Seeded from the project name, then user-overridable. Keyed on projectName so
  // switching projects re-derives instead of carrying the previous mark over.
  const [emoji, setEmoji] = useState(() => emojiForProject(projectName));

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    el?.focus();
    el?.select();
  }, [editing]);

  const open = () => {
    if (!onRename) return;
    setDraft(projectName);
    setEditing(true);
  };

  // An empty name would leave the bar with nothing to click to get back into,
  // so a blank commit is a cancel.
  const commit = () => {
    const next = draft.trim();
    if (next && next !== projectName) onRename?.(next);
    setEditing(false);
  };

  const shown = displayTitle(projectName);
  const elided = shown !== projectName;

  return (
    <GlassBar
      ui="editor-topbar"
      shape="panel"
      /* h-12 is the shared height of the top row — the tool cluster in the
         middle and the action cluster on the right are the same, so all three
         read as one band with their centres on a single line. */
      className="pointer-events-auto h-12 gap-3 pl-2.5 pr-3"
    >
      {/* Project mark — click to pick a different emoji */}
      <ProjectEmojiPicker value={emoji} onChange={setEmoji} projectName={projectName} />

      {editing ? (
        <input
          ref={inputRef}
          data-ui="project-name-input"
          aria-label="Project name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          /* Sized to the display budget rather than to the draft: a field that
             grew as you typed would push the undo/redo pair along the bar. */
          size={TITLE_MAX}
          className="type-body-lg-strong w-[18ch] rounded-md border border-brand/50 bg-glass/10 px-1.5 py-0.5 text-content outline-none"
        />
      ) : (
        /* The full name on hover, because the displayed one may be elided —
           and there's nowhere else in the editor to read it. */
        <Tooltip label={projectName} side="bottom" tone="glass" hidden={!elided} delay={400}>
          <button
            type="button"
            data-ui="project-name"
            onClick={open}
            title={onRename && !elided ? "Rename project" : undefined}
            className="type-body-lg-strong -mx-1.5 rounded-md px-1.5 py-0.5 text-content transition-colors hover:bg-glass/15 disabled:pointer-events-none"
            disabled={!onRename}
          >
            {shown}
          </button>
        </Tooltip>
      )}

      <GlassDivider className="mx-1" />

      <div className="flex items-center gap-0.5">
        <GlassGhostButton ui="undo" size="sm" icon="undo" label="Undo" onClick={onUndo} disabled={!canUndo} />
        <GlassGhostButton ui="redo" size="sm" icon="redo" label="Redo" onClick={onRedo} disabled={!canRedo} />
      </div>
    </GlassBar>
  );
}
