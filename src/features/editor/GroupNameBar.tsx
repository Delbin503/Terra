import { useEffect, useRef, useState } from "react";
import { GlassBar } from "@/components/glass";
import { Icon } from "@/components/icons";

/**
 * NAME THE GROUP YOU JUST MADE.
 * ------------------------------------------------------------------
 * Grouping is the one operation whose point IS the name: the objects were
 * already in the scene, and what has just been created is the word for them. So
 * the naming happens immediately, in one field, with the default already
 * selected — type and press Enter, or press Escape and keep "Group 3".
 *
 * WHY THIS ISN'T THE TITLE'S OWN RENAME. The obvious move was to open
 * `ObjectTitle` in edit mode, and it half-worked: the title is a
 * `contentEditable` h1 whose text is written imperatively, and the moment a
 * group is created the editor re-renders it several times in a row — the camera
 * flies in to frame the contents, the backdrop is re-sampled for the title's
 * ink, the toolbar mounts. Each of those replaces the text node React thinks it
 * owns, and the caret goes with it. The field opened and shut again before
 * anyone could type into it.
 *
 * A plain `input` in its own bar has no such argument with React, and it can say
 * what it is for besides.
 */
export function GroupNameBar({
  name,
  count,
  insetLeft = 0,
  onCommit,
  onDismiss,
}: {
  /** the default — what the group is called if nothing is typed */
  name: string;
  /** how many objects went in, so the bar can say what was made */
  count: number;
  insetLeft?: number;
  onCommit: (name: string) => void;
  /** Escape, or a click elsewhere: keep the default and get out of the way. */
  onDismiss: () => void;
}) {
  const [draft, setDraft] = useState(name);
  const ref = useRef<HTMLInputElement>(null);

  // Selected, not just focused: the default is a placeholder you are expected to
  // type over, and making the user clear it first is making them do the work
  // twice.
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    const text = draft.replace(/\s+/g, " ").trim();
    onCommit(text || name);
  };

  return (
    <div
      data-ui="group-name-bar"
      className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
      style={{ marginLeft: insetLeft / 2 }}
    >
      <GlassBar ui="group-name" shape="pill" className="pointer-events-auto h-11 gap-2.5 px-4">
        <Icon name="group" size={16} className="shrink-0 text-brand" />
        <span className="type-body shrink-0 text-content-muted">
          Grouped {count} objects · name it
        </span>
        <input
          ref={ref}
          data-ui="group-name-input"
          aria-label="Group name"
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Stopped here so the editor's own shortcuts — ⌘G, Delete, Escape —
            // don't also act on the selection while a name is being typed.
            e.stopPropagation();
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onDismiss();
          }}
          className="field-well type-body min-w-0 flex-1 rounded-lg border px-2.5 py-1 text-content outline-none"
        />
        <button
          type="button"
          data-ui="group-name-done"
          onClick={commit}
          className="type-caption-strong shrink-0 rounded-md border border-brand/50 bg-brand/15 px-2.5 py-1 text-brand-on-glass transition-colors hover:bg-brand/25"
        >
          Done
        </button>
      </GlassBar>
    </div>
  );
}
