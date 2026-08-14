import { GlassPanel } from "@/components/glass";
import { Icon, type IconName } from "@/components/icons";
import type { Asset } from "./assets-data";

export interface MenuAnchor {
  asset: Asset;
  x: number;
  y: number;
}

interface MenuItem {
  icon: IconName;
  label: string;
  run: () => void;
  danger?: boolean;
}

/**
 * AssetActionMenu — the ⋮ context menu for a card. Rendered fixed near the
 * trigger so it isn't clipped by the asset panel.
 *
 *   View Info       → right-docked details panel
 *   Place in Scene  → drops the asset straight into the viewport
 *   Select Items    → arms multi-select; the selection bar then offers
 *                     place-all / add-all-to-folder
 *   Add to Folder   → folder picker (choose one, or create a new folder)
 *   Delete          → uploads only. A library asset isn't the user's to remove,
 *                     so the row is absent rather than disabled — a dead row
 *                     reads as a permission error the user can't act on.
 */
export function AssetActionMenu({
  anchor,
  canDelete,
  onClose,
  onViewInfo,
  onSelect,
  onDelete,
  onPlace,
  onAddToFolder,
}: {
  anchor: MenuAnchor;
  /** true when the asset lives in Uploads — see note above */
  canDelete: boolean;
  onClose: () => void;
  onViewInfo: (a: Asset) => void;
  onSelect: (a: Asset) => void;
  onDelete: (a: Asset) => void;
  onPlace: (a: Asset) => void;
  onAddToFolder: (a: Asset) => void;
}) {
  const { asset } = anchor;
  const items: MenuItem[] = [
    { icon: "info", label: "View Info", run: () => onViewInfo(asset) },
    { icon: "place", label: "Place in Scene", run: () => onPlace(asset) },
    { icon: "select-check", label: "Select Items", run: () => onSelect(asset) },
    { icon: "folder-add", label: "Add to Folder", run: () => onAddToFolder(asset) },
  ];
  if (canDelete) items.push({ icon: "trash", label: "Delete", run: () => onDelete(asset), danger: true });

  // Keep the menu on-screen. Height tracks the row count so the clamp doesn't
  // reserve space for a Delete row that isn't there.
  const height = items.length * 42 + 12;
  const left = Math.min(anchor.x, window.innerWidth - 236);
  const top = Math.min(anchor.y, window.innerHeight - height - 12);

  // `pointer-events-auto` is load-bearing: the editor's overlay layer is
  // pointer-events-none, and without it every click here falls straight through
  // to the asset card underneath.
  return (
    <>
      <div className="pointer-events-auto fixed inset-0 z-40" onClick={onClose} />
      <GlassPanel
        ui="asset-action-menu"
        thickness="overlay"
        role="menu"
        style={{ left, top }}
        className="pointer-events-auto fixed z-50 w-56 !rounded-2xl p-1.5"
      >
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            data-ui={`asset-action-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => {
              it.run();
              onClose();
            }}
            className={
              "type-body flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors " +
              (it.danger
                ? "mt-1 border-t border-glass/10 pt-2.5 text-danger hover:bg-danger/10"
                : "text-content-muted hover:bg-glass/12 hover:text-content")
            }
          >
            <Icon name={it.icon} size={17} />
            {it.label}
          </button>
        ))}
      </GlassPanel>
    </>
  );
}
