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

/**
 * FolderRow — the same folder, laid out for the list.
 *
 * WHY THIS EXISTS. Projects had a card and a row; folders only ever had the
 * card, and the list layout just re-columned the same mosaic grid. So the
 * layout switch appeared to do nothing on the Folders shelf — two controls, one
 * result, and no way to tell whether you had pressed it.
 *
 * A row answers a different question from a card. The card is for browsing by
 * picture; this is for reading down a column of names, so the mosaic shrinks to
 * a plate and the three facts a folder has — name, who owns it, how much is in
 * it — get their own places on one line. Same anatomy as ProjectRow, for the
 * same reason: the keep is a control, so this is a box with a stretched open
 * button rather than a button.
 */
export function FolderRow({
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
    <div
      className="group relative flex items-center gap-3.5 rounded-xl p-2 text-left transition-colors hover:bg-surface"
      onContextMenu={onContextMenu}
    >
      {/* The mosaic survives at plate size — it is what tells two folders with
          similar names apart, and a generic folder glyph would not. */}
      <div className="relative w-[92px] shrink-0 overflow-hidden rounded-lg border border-glass/10 p-1">
        <div className="grid grid-cols-2 gap-1">
          {cells.map((seed, i) => (
            <span
              key={i}
              className={cn(
                "block aspect-[16/11] overflow-hidden rounded-[3px]",
                seed === undefined && "bg-glass/20"
              )}
            >
              {seed !== undefined && <WorldThumb seed={seed} />}
            </span>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {renaming && onRename && onRenameCancel ? (
          <RenameField value={folder.name} onCommit={onRename} onCancel={onRenameCancel} />
        ) : (
          <span className="type-body-strong block truncate transition-colors group-hover:text-brand">
            {folder.name}
          </span>
        )}
        <span className="type-caption mt-0.5 flex items-center gap-1.5 text-content-subtle">
          <Icon name="folder" size={12} className="shrink-0" />
          {folder.owner}
          <span aria-hidden>·</span>
          {count} {count === 1 ? "project" : "projects"}
          {folder.shared && (
            <>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1">
                <Icon name="shared" size={12} />
                Shared
              </span>
            </>
          )}
        </span>
      </div>

      <span className="type-caption shrink-0 pr-9 text-content-subtle">
        {folder.updatedLabel}
      </span>

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
          className="right-2 top-1/2 -translate-y-1/2"
        />
      )}
    </div>
  );
}
