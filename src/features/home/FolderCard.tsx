import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { FavouriteButton, RenameField } from "./ProjectCard";
import { WorldThumb } from "./WorldThumb";
import type { Folder } from "./data";

/**
 * FolderCard — a folder shown as the four covers it holds.
 *
 * The mosaic is always a 2×2 frame, filled from the front and left empty after
 * the last project. That is deliberate: a folder with two projects should LOOK
 * half-full, so the count under it and the picture above it can never disagree.
 * A folder with more than four just shows its first four.
 *
 * Same anatomy as ProjectCard, and for the same reason: the keep is a control,
 * so the card is a box with a stretched "open" button rather than a button.
 */
export function FolderCard({
  folder,
  onOpen,
  onFavourite,
  onContextMenu,
  renaming,
  onRename,
  onRenameCancel,
}: {
  folder: Folder;
  onOpen: () => void;
  onFavourite?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  renaming?: boolean;
  onRename?: (name: string) => void;
  onRenameCancel?: () => void;
}) {
  const cells = Array.from({ length: 4 }, (_, i) => folder.seeds[i]);
  const count = folder.seeds.length;

  return (
    <div className="group relative text-left" onContextMenu={onContextMenu}>
      <div className="relative overflow-hidden glass-thin !rounded-xl p-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          {cells.map((seed, i) => (
            <span
              key={i}
              className={cn(
                "block aspect-[16/11] overflow-hidden rounded-md",
                seed === undefined && "bg-glass/20"
              )}
            >
              {seed !== undefined && <WorldThumb seed={seed} />}
            </span>
          ))}
        </div>

        {folder.shared && (
          <span
            title="Shared with your workspace"
            className="pointer-events-none absolute bottom-3 right-3 grid h-7 w-7 place-items-center rounded-md bg-black/55 text-brand-on-glass backdrop-blur-sm"
          >
            <Icon name="shared" size={15} />
          </span>
        )}
      </div>

      {/* Name and freshness share a line — the folder's identity and its state
          are the two things you scan a shelf of these for. */}
      <div className="mt-2 flex items-baseline gap-3">
        {renaming && onRename && onRenameCancel ? (
          <span className="min-w-0 flex-1">
            <RenameField
              value={folder.name}
              onCommit={onRename}
              onCancel={onRenameCancel}
            />
          </span>
        ) : (
          <span className="type-body-strong min-w-0 flex-1 truncate transition-colors group-hover:text-brand">
            {folder.name}
          </span>
        )}
        <span className="type-caption shrink-0 text-content-subtle">
          {folder.updatedLabel}
        </span>
      </div>
      <div className="type-caption mt-0.5 flex items-center gap-1.5 text-content-subtle">
        {folder.owner}
        <span aria-hidden>·</span>
        {count} {count === 1 ? "project" : "projects"}
      </div>

      {!renaming && (
        <button
          type="button"
          aria-label={`Open ${folder.name}`}
          onClick={onOpen}
          className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
      {onFavourite && (
        <FavouriteButton
          on={folder.favourite}
          name={folder.name}
          onToggle={onFavourite}
          className="right-3 top-3"
        />
      )}
    </div>
  );
}
