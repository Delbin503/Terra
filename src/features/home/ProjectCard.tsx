import { useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { WorldThumb } from "./WorldThumb";
import { user } from "./data";
import type { Project } from "./data";

/**
 * A project, as a cover plus a caption. Two layouts, one anatomy:
 *
 *   ProjectCard — cover above the caption, for the grid.
 *   ProjectRow  — cover beside the caption, for the list.
 *
 * The cover is unframed in both: a row of these already sits on a surface, and a
 * second border around each one turns the row into a grid of boxes instead of a
 * row of renders. The render is the object; the text is a caption on it.
 *
 * WHY THE CARD ISN'T A BUTTON. It carries a second control — the keep — and a
 * button inside a button is invalid HTML that the browser silently unnests. So
 * the card is a plain box, the whole of it is covered by one stretched "open"
 * button, and the star sits above that in the stacking order.
 */

interface CardProps {
  project: Project;
  /** toggles the keep — omitted where the star has nothing to write to */
  onFavourite?: () => void;
  onOpen?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  /** the title becomes an editable field, and the card stops opening */
  renaming?: boolean;
  onRename?: (name: string) => void;
  onRenameCancel?: () => void;
}

/** Shared with the workspace. Sits on the cover, out of the star's corner. */
function SharedMark() {
  return (
    <span
      title="Shared with your workspace"
      className="pointer-events-none absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-md bg-black/55 text-brand-on-glass backdrop-blur-sm"
    >
      <Icon name="shared" size={15} />
    </span>
  );
}

/** The keep. Always visible once set, on hover otherwise. */
export function FavouriteButton({
  on,
  name,
  onToggle,
  className,
}: {
  on?: boolean;
  name: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "absolute z-10 grid h-8 w-8 place-items-center rounded-md bg-black/55 backdrop-blur-sm transition-opacity hover:text-brand-on-glass focus-visible:opacity-100",
        on ? "text-brand-on-glass opacity-100" : "text-white opacity-0 group-hover:opacity-100",
        className
      )}
    >
      <Icon name="favourite" size={16} className={on ? "fill-current" : undefined} />
    </button>
  );
}

/**
 * Renaming happens in place, on the caption itself — a dialog for one short
 * string would cover the thing being named. Enter and blur both commit, Escape
 * abandons; the blur-after-Escape is swallowed so cancelling can't save.
 */
export function RenameField({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const settled = useRef(false);

  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    onCommit(draft.trim() || value);
  };

  return (
    <input
      autoFocus
      value={draft}
      aria-label={`Rename ${value}`}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          settled.current = true;
          onCancel();
        }
      }}
      onBlur={commit}
      className="type-body-strong relative z-10 w-full rounded-md border border-brand bg-surface px-1.5 py-0.5 text-content outline-none"
    />
  );
}

/** The stretched click target. Under the star, over everything else. */
function OpenTarget({ label, onOpen }: { label: string; onOpen?: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Open ${label}`}
      onClick={onOpen}
      className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

export function ProjectCard({
  project,
  onFavourite,
  onOpen,
  onContextMenu,
  renaming,
  onRename,
  onRenameCancel,
}: CardProps) {
  return (
    <div className="group relative text-left" onContextMenu={onContextMenu}>
      <div className="relative overflow-hidden rounded-xl border border-glass/10">
        <div className="aspect-[16/11] transition-transform duration-200 group-hover:scale-[1.03]">
          <WorldThumb seed={project.seed} />
        </div>
        {project.shared && <SharedMark />}
      </div>

      <div className="mt-2 flex items-start gap-2">
        <span className="min-w-0 flex-1">
          {renaming && onRename && onRenameCancel ? (
            <RenameField
              value={project.name}
              onCommit={onRename}
              onCancel={onRenameCancel}
            />
          ) : (
            <span className="type-body-strong block truncate transition-colors group-hover:text-brand">
              {project.name}
            </span>
          )}
          <span className="type-caption mt-0.5 block text-content-subtle">
            {project.editedLabel}
          </span>
        </span>
        <Avatar name={user.name} size={20} className="mt-px" />
      </div>

      {!renaming && <OpenTarget label={project.name} onOpen={onOpen} />}
      {onFavourite && (
        <FavouriteButton
          on={project.favourite}
          name={project.name}
          onToggle={onFavourite}
          className="right-2 top-2"
        />
      )}
    </div>
  );
}

/**
 * The list layout. The cover shrinks to a fixed plate rather than stretching:
 * at two rows per line a full-width cover would read as another grid, and the
 * point of the list is that the NAME leads.
 */
export function ProjectRow({
  project,
  onFavourite,
  onOpen,
  onContextMenu,
  renaming,
  onRename,
  onRenameCancel,
}: CardProps) {
  return (
    <div
      className="group relative flex items-start gap-4 rounded-xl p-2 text-left transition-colors hover:bg-surface"
      onContextMenu={onContextMenu}
    >
      <div className="relative w-[152px] shrink-0 overflow-hidden rounded-lg border border-glass/10">
        <div className="aspect-[16/11]">
          <WorldThumb seed={project.seed} />
        </div>
        {project.shared && <SharedMark />}
      </div>

      <div className="min-w-0 flex-1 pt-1">
        {renaming && onRename && onRenameCancel ? (
          <RenameField
            value={project.name}
            onCommit={onRename}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="type-body-strong block truncate transition-colors group-hover:text-brand">
            {project.name}
          </span>
        )}
        <span className="type-caption mt-0.5 block text-content-subtle">
          {project.editedLabel}
        </span>
        <Avatar name={user.name} size={20} className="mt-2" />
      </div>

      {!renaming && <OpenTarget label={project.name} onOpen={onOpen} />}
      {onFavourite && (
        <FavouriteButton
          on={project.favourite}
          name={project.name}
          onToggle={onFavourite}
          className="left-[130px] top-4"
        />
      )}
    </div>
  );
}
