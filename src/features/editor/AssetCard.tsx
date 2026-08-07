import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { AssetThumb } from "./AssetThumb";
import { typeIcon, deriveDetails, type Asset } from "./assets-data";

/**
 * AssetCard — a library tile. Normal state shows a real placeholder thumbnail
 * with a type badge, a hover •••-menu, and a hover quick-info line. It also
 * renders the two async pipeline states: `generating` (spinner + label) and
 * `ready` (multi-view result, click to continue the mesh flow).
 */
export function AssetCard({
  asset,
  selected,
  onToggle,
  onMenu,
  onReadyClick,
}: {
  asset: Asset;
  selected: boolean;
  onToggle: (id: string) => void;
  onMenu: (asset: Asset, rect: DOMRect) => void;
  onReadyClick: (asset: Asset) => void;
}) {
  // ---- async pipeline cells ----
  if (asset.status === "generating") {
    return (
      <div className="relative aspect-square overflow-hidden rounded-2xl ring-1 ring-brand/40">
        <div className="absolute inset-0 opacity-40">
          <AssetThumb type={asset.type} seed={asset.seed} />
        </div>
        <div className="absolute inset-0 grid place-items-center bg-black/45 text-center">
          <div className="flex flex-col items-center gap-1.5 px-2">
            <Icon name="spinner" size={18} className="animate-spin text-brand" />
            <span className="type-card-title text-content">{asset.statusLabel}</span>
          </div>
        </div>
      </div>
    );
  }

  if (asset.status === "ready") {
    return (
      <button
        type="button"
        data-ui={`asset-card-${asset.id}`}
        onClick={() => onReadyClick(asset)}
        className="group relative aspect-square overflow-hidden rounded-2xl ring-1 ring-success/50 transition-transform hover:-translate-y-0.5"
      >
        <div className="absolute inset-0 opacity-80">
          <AssetThumb type="mesh" seed={asset.seed} />
        </div>
        <span className="type-label-strong absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 scrim-strong p-2 pt-6 text-success">
          <Icon name="check" size={13} strokeWidth={3} />
          Ready — pick views
        </span>
      </button>
    );
  }

  const details = deriveDetails(asset);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/terra-asset",
          JSON.stringify({ name: asset.name, type: asset.type, modelUrl: asset.modelUrl })
        );
        e.dataTransfer.effectAllowed = "copy";
      }}
      data-ui={`asset-card-${asset.id}`}
      aria-pressed={selected}
      aria-label={`${asset.name} — ${asset.type}${selected ? ", selected" : ""}`}
      onClick={() => onToggle(asset.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(asset.id);
        }
      }}
      className={cn(
        "group relative aspect-square cursor-pointer overflow-hidden rounded-2xl text-left outline-none transition-transform",
        "ring-1 ring-glass/10 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring",
        selected && "ring-2 ring-brand"
      )}
    >
      <div className="absolute inset-0">
        <AssetThumb type={asset.type} seed={asset.seed} />
      </div>

      {/* Type badge (top-right) */}
      <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md bg-black/40 text-white/90 backdrop-blur-sm">
        <Icon name={typeIcon[asset.type]} size={13} strokeWidth={2} />
      </span>

      {/* Selected check (top-left, hidden while hovering so ••• can take over) */}
      {selected && (
        <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-brand text-brand-foreground group-hover:hidden">
          <Icon name="check" size={14} strokeWidth={3} />
        </span>
      )}

      {/* ••• actions (top-left, on hover) */}
      <button
        type="button"
        aria-label={`Actions for ${asset.name}`}
        data-ui={`asset-menu-${asset.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onMenu(asset, (e.currentTarget as HTMLElement).getBoundingClientRect());
        }}
        className="absolute left-2 top-2 hidden h-6 w-6 place-items-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm hover:bg-black/70 group-hover:grid"
      >
        <Icon name="more" size={15} />
      </button>

      {/* Name + hover quick-info */}
      <span className="absolute inset-x-0 bottom-0 scrim-strong p-2 pt-6">
        <span className="type-label block truncate text-white">{asset.name}</span>
        <span className="type-caption mt-0.5 hidden truncate text-white/70 group-hover:block">
          {details.typeLabel} · {details.smartTags[0]}
        </span>
      </span>
    </div>
  );
}
