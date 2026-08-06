import { GlassPanel } from "@/components/glass";
import { Icon, type IconName } from "@/components/icons";
import type { Asset } from "./assets-data";

export interface MenuAnchor {
  asset: Asset;
  x: number;
  y: number;
}

/**
 * AssetActionMenu — the ••• context menu for a card. Rendered fixed near the
 * trigger so it isn't clipped by the asset panel. Real actions: View Details,
 * Select, Delete. Stubs (until their systems exist): Place in Scene,
 * Generate 3D Mesh, Add to Folder.
 */
export function AssetActionMenu({
  anchor,
  onClose,
  onViewDetails,
  onSelect,
  onDelete,
  onPlace,
  onStub,
}: {
  anchor: MenuAnchor;
  onClose: () => void;
  onViewDetails: (a: Asset) => void;
  onSelect: (a: Asset) => void;
  onDelete: (a: Asset) => void;
  onPlace: (a: Asset) => void;
  onStub: (label: string) => void;
}) {
  const { asset } = anchor;
  const items: { icon: IconName; label: string; run: () => void; danger?: boolean }[] = [
    { icon: "info", label: "View Details", run: () => onViewDetails(asset) },
    { icon: "place", label: "Place in Scene", run: () => onPlace(asset) },
    { icon: "input-3d", label: "Generate 3D Mesh", run: () => onStub("Generate 3D Mesh") },
    { icon: "select-check", label: "Select Items", run: () => onSelect(asset) },
    { icon: "folder-add", label: "Add to Folder", run: () => onStub("Add to Folder") },
    { icon: "trash", label: "Delete", run: () => onDelete(asset), danger: true },
  ];

  // Keep the menu on-screen (width ~224, height ~292)
  const left = Math.min(anchor.x, window.innerWidth - 236);
  const top = Math.min(anchor.y, window.innerHeight - 304);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <GlassPanel
        ui="asset-action-menu"
        thickness="thick"
        role="menu"
        style={{ left, top }}
        className="fixed z-50 w-56 !rounded-2xl p-1.5"
      >
        {items.map((it, i) => (
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
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors " +
              (it.danger
                ? "text-danger hover:bg-danger/10"
                : "text-content-muted hover:bg-glass/12 hover:text-content") +
              (i === items.length - 1 ? " mt-1 border-t border-glass/10 pt-2.5" : "")
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
